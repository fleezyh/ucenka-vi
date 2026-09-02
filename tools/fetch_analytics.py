# -*- coding: utf-8 -*-
"""Забирает посещаемость из Cloudflare Web Analytics в data/analytics.json.

Сайт статический и лежит в публичном репозитории, поэтому ходить в Cloudflare
из браузера нельзя: API-токен оказался бы виден всем. Забираем цифры здесь,
токен берём из Credential Manager, а в репозиторий попадает только готовый
агрегат без единого адреса или идентификатора посетителя.

Токен нужен с правом «Account Analytics: Read». Положить его в Credential
Manager под именем cloudflare_analytics:

    cmdkey /generic:cloudflare_analytics /user:api /pass:ТОКЕН

Запуск:

    py tools/fetch_analytics.py
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import json
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "data" / "analytics.json"
CREDENTIAL_NAME = "cloudflare_analytics"
# Идентификатор аккаунта — не секрет, но у каждого свой, поэтому вынесен рядом.
CONFIG_PATH = Path(__file__).resolve().parent / "analytics_config.json"
API_URL = "https://api.cloudflare.com/client/v4/graphql"
TIMEOUT = 180

# Сколько дней показываем на графике.
HISTORY_DAYS = 30


class Credential(ctypes.Structure):
    _fields_ = [
        ("Flags", wt.DWORD), ("Type", wt.DWORD), ("TargetName", wt.LPWSTR),
        ("Comment", wt.LPWSTR), ("LastWritten", wt.FILETIME),
        ("CredentialBlobSize", wt.DWORD), ("CredentialBlob", ctypes.POINTER(ctypes.c_char)),
        ("Persist", wt.DWORD), ("AttributeCount", wt.DWORD),
        ("Attributes", ctypes.c_void_p), ("TargetAlias", wt.LPWSTR), ("UserName", wt.LPWSTR),
    ]


def api_token() -> str:
    advapi = ctypes.WinDLL("advapi32", use_last_error=True)
    advapi.CredReadW.argtypes = [
        wt.LPCWSTR, wt.DWORD, wt.DWORD, ctypes.POINTER(ctypes.POINTER(Credential))
    ]
    advapi.CredReadW.restype = wt.BOOL
    pointer = ctypes.POINTER(Credential)()
    if not advapi.CredReadW(CREDENTIAL_NAME, 1, 0, ctypes.byref(pointer)):
        raise RuntimeError(
            f"В Credential Manager нет записи {CREDENTIAL_NAME}. "
            f'Создать: cmdkey /generic:{CREDENTIAL_NAME} /user:api /pass:ТОКЕН'
        )
    try:
        item = pointer.contents
        raw = ctypes.string_at(item.CredentialBlob, item.CredentialBlobSize)
        return raw.decode("utf-16-le").strip()
    finally:
        advapi.CredFree(pointer)


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def query(token: str, document: str, variables: dict, tries: int = 3) -> dict:
    """Запрос к GraphQL с повтором: аналитика отвечает медленно и рвёт соединение."""
    last: Exception | None = None
    for attempt in range(1, tries + 1):
        try:
            response = requests.post(
                API_URL,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"query": document, "variables": variables},
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("errors"):
                raise RuntimeError(f"Cloudflare вернул ошибку: {payload['errors']}")
            return payload["data"]
        except (requests.Timeout, requests.ConnectionError) as error:
            last = error
            if attempt < tries:
                log(f"повтор запроса ({attempt} из {tries})")
                time.sleep(3 * attempt)
    raise RuntimeError(f"Cloudflare не ответил за {tries} попытки: {last}")


def find_account_and_site() -> tuple[str, str]:
    """Берёт идентификаторы аккаунта и сайта — оба публичные, не секреты.

    Спрашивать их у Cloudflare нельзя: аналитический токен не имеет права
    листать аккаунты, а GraphQL требует accountTag явным фильтром. Поэтому
    аккаунт лежит в конфиге рядом, а сайт читается из beacon на главной —
    он и так виден в исходниках страницы.
    """
    if not CONFIG_PATH.exists():
        raise RuntimeError(
            f"нет файла {CONFIG_PATH.name}. Создать рядом со скриптом:\n"
            '{ "accountTag": "идентификатор аккаунта из адресной строки Cloudflare" }'
        )
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    account = (config.get("accountTag") or "").strip()
    if not account:
        raise RuntimeError(f"в {CONFIG_PATH.name} пустой accountTag")

    site = (config.get("siteTag") or "").strip() or site_tag_from_beacon()
    return account, site


def site_tag_from_beacon() -> str:
    """Достаёт идентификатор сайта из тега Cloudflare на главной странице."""
    index = REPO_ROOT / "index.html"
    match = re.search(r'data-cf-beacon=\'{"token":\s*"([0-9a-f]+)"', index.read_text(encoding="utf-8"))
    if not match:
        raise RuntimeError("на главной странице не найден тег Cloudflare Web Analytics")
    return match.group(1)


TOTALS_QUERY = """
query Totals($accountTag: String!, $siteTag: String!, $since: Time!, $until: Time!) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      total: rumPageloadEventsAdaptiveGroups(
        filter: {siteTag: $siteTag, datetime_geq: $since, datetime_leq: $until}
        limit: 1
      ) {
        count
        sum { visits }
      }
    }
  }
}
"""

DAILY_QUERY = """
query Daily($accountTag: String!, $siteTag: String!, $since: Date!, $until: Date!) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      days: rumPageloadEventsAdaptiveGroups(
        filter: {siteTag: $siteTag, date_geq: $since, date_leq: $until}
        orderBy: [date_ASC]
        limit: 500
      ) {
        count
        sum { visits }
        dimensions { date }
      }
    }
  }
}
"""

PAGES_QUERY = """
query Pages($accountTag: String!, $siteTag: String!, $since: Date!, $until: Date!) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      pages: rumPageloadEventsAdaptiveGroups(
        filter: {siteTag: $siteTag, date_geq: $since, date_leq: $until}
        orderBy: [count_DESC]
        limit: 20
      ) {
        count
        sum { visits }
        dimensions { requestPath }
      }
    }
  }
}
"""


def totals_from(days: list[dict], last: int) -> dict:
    """Складывает последние дни разбивки.

    Отдельные запросы за период отдавали несходящиеся числа: на длинном
    интервале Cloudflare оценивает по выборке, и месяц выходил меньше недели.
    Дневная разбивка точная, поэтому периоды считаем по ней.
    """
    tail = days[-last:] if last else days
    return {
        "просмотры": sum(day["просмотры"] for day in tail),
        "посетители": sum(day["посетители"] for day in tail),
    }


def collect(token: str) -> dict:
    account, site = find_account_and_site()
    log(f"аккаунт {account[:8]}…, сайт {site[:8]}…")

    since = date.today() - timedelta(days=HISTORY_DAYS - 1)
    until = date.today()
    variables = {
        "accountTag": account,
        "siteTag": site,
        "since": str(since),
        "until": str(until),
    }

    daily = query(token, DAILY_QUERY, variables)["viewer"]["accounts"][0]["days"]
    pages = query(token, PAGES_QUERY, variables)["viewer"]["accounts"][0]["pages"]

    by_day = [
        {
            "дата": row["dimensions"]["date"],
            "просмотры": row["count"],
            "посетители": row["sum"]["visits"],
        }
        for row in daily
    ]

    return {
        "обновлено": time.strftime("%Y-%m-%d %H:%M:%S"),
        "запериод": {
            "сутки": totals_from(by_day, 1),
            "неделя": totals_from(by_day, 7),
            "месяц": totals_from(by_day, 30),
        },
        "поДням": by_day,
        "поСтраницам": [
            {
                "страница": row["dimensions"]["requestPath"],
                "просмотры": row["count"],
                "посетители": row["sum"]["visits"],
            }
            for row in pages
        ],
    }


def main() -> int:
    try:
        token = api_token()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    try:
        stats = collect(token)
    except Exception as error:
        print(f"не удалось забрать статистику: {error}", file=sys.stderr)
        return 1

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    период = stats["запериод"]
    log(f"записано {OUT_PATH}")
    log(f"сутки: {период['сутки']['просмотры']} просмотров, "
        f"неделя: {период['неделя']['просмотры']}, месяц: {период['месяц']['просмотры']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
