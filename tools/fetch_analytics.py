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
from datetime import date, timedelta
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "data" / "analytics.json"
CREDENTIAL_NAME = "cloudflare_analytics"
API_URL = "https://api.cloudflare.com/client/v4/graphql"
TIMEOUT = 60

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


def query(token: str, document: str, variables: dict) -> dict:
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


def find_account_and_site(token: str) -> tuple[str, str]:
    """Находит аккаунт и сайт, чтобы не хранить их идентификаторы в коде."""
    response = requests.get(
        "https://api.cloudflare.com/client/v4/accounts",
        headers={"Authorization": f"Bearer {token}"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    accounts = response.json().get("result") or []
    if not accounts:
        raise RuntimeError("токен не видит ни одного аккаунта Cloudflare")
    account_id = accounts[0]["id"]

    response = requests.get(
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/rum/site_info/list",
        headers={"Authorization": f"Bearer {token}"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    sites = response.json().get("result") or []
    for site in sites:
        if "ucenka-vi" in (site.get("ruleset", {}).get("zone_name") or "") or \
           "ucenka-vi" in json.dumps(site, ensure_ascii=False):
            return account_id, site["site_tag"]
    if sites:
        return account_id, sites[0]["site_tag"]
    raise RuntimeError("в аккаунте нет ни одного сайта Web Analytics")


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


def totals_for(token: str, account: str, site: str, days: int) -> dict:
    until = date.today() + timedelta(days=1)
    since = date.today() - timedelta(days=days - 1)
    data = query(token, TOTALS_QUERY, {
        "accountTag": account,
        "siteTag": site,
        "since": f"{since}T00:00:00Z",
        "until": f"{until}T00:00:00Z",
    })
    groups = data["viewer"]["accounts"][0]["total"]
    if not groups:
        return {"просмотры": 0, "посетители": 0}
    return {"просмотры": groups[0]["count"], "посетители": groups[0]["sum"]["visits"]}


def collect(token: str) -> dict:
    account, site = find_account_and_site(token)
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

    return {
        "обновлено": time.strftime("%Y-%m-%d %H:%M:%S"),
        "запериод": {
            "сутки": totals_for(token, account, site, 1),
            "неделя": totals_for(token, account, site, 7),
            "месяц": totals_for(token, account, site, 30),
        },
        "поДням": [
            {
                "дата": row["dimensions"]["date"],
                "просмотры": row["count"],
                "посетители": row["sum"]["visits"],
            }
            for row in daily
        ],
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
