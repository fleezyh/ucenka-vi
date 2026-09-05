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
import sys
import time
from datetime import date, datetime, timedelta, timezone
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
    accountTag и siteTag лежат в конфиге рядом. Beacon token предназначен
    для отправки событий, а siteTag — для чтения статистики: это разные ID.
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

    site = (config.get("siteTag") or "").strip()
    if not site:
        raise RuntimeError("В analytics_config.json нужен siteTag из URL панели Cloudflare, не beacon token")
    return account, site


TOTALS_QUERY = """
query Totals(
  $accountTag: String!, $siteTag: String!, $day: Time!,
  $week: Time!, $month: Time!, $until: Time!
) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      day: rumPageloadEventsAdaptiveGroups(
        filter: {siteTag: $siteTag, datetime_geq: $day, datetime_leq: $until}
        limit: 1
      ) { count sum { visits } }
      week: rumPageloadEventsAdaptiveGroups(
        filter: {siteTag: $siteTag, datetime_geq: $week, datetime_leq: $until}
        limit: 1
      ) { count sum { visits } }
      month: rumPageloadEventsAdaptiveGroups(
        filter: {siteTag: $siteTag, datetime_geq: $month, datetime_leq: $until}
        limit: 1
      ) { count sum { visits } }
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


def totals_from(days: list[dict], last: int, today: date | None = None) -> dict:
    """Сумма по календарному окну UTC. Пустые дни не возвращаются API.

    Adaptive-метрики могут быть оценочными; суммирование не делает их точными.
    """
    today = today or datetime.now(timezone.utc).date()
    since = today - timedelta(days=last - 1) if last else date.min
    tail = [day for day in days if since <= date.fromisoformat(day["дата"]) <= today]
    return {
        "просмотры": sum(day["просмотры"] for day in tail),
        "посетители": sum(day["посетители"] for day in tail),
    }


def collect(token: str) -> dict:
    account, site = find_account_and_site()
    log(f"аккаунт {account[:8]}…, сайт {site[:8]}…")

    now = datetime.now(timezone.utc)
    until = now.date()
    since = until - timedelta(days=HISTORY_DAYS - 1)
    variables = {
        "accountTag": account,
        "siteTag": site,
        "since": str(since),
        "until": str(until),
    }

    daily = query(token, DAILY_QUERY, variables)["viewer"]["accounts"][0]["days"]
    pages = query(token, PAGES_QUERY, variables)["viewer"]["accounts"][0]["pages"]
    midnight = datetime.combine(until, datetime.min.time(), tzinfo=timezone.utc)
    period_variables = {
        "accountTag": account,
        "siteTag": site,
        "day": midnight.isoformat(),
        "week": (midnight - timedelta(days=6)).isoformat(),
        "month": (midnight - timedelta(days=29)).isoformat(),
        "until": now.isoformat(),
    }
    period_rows = query(token, TOTALS_QUERY, period_variables)["viewer"]["accounts"][0]

    def period(name: str) -> dict:
        row = period_rows[name][0] if period_rows[name] else {"count": 0, "sum": {"visits": 0}}
        return {"просмотры": row["count"], "посетители": row["sum"]["visits"]}

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
        "периоды": "Календарные дни UTC, включая текущий неполный день; не скользящие 24 часа",
        "метрикаПосетителей": "Визиты Cloudflare, не уникальные люди",
        "запериод": {
            "сутки": period("day"),
            "неделя": period("week"),
            "месяц": period("month"),
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
