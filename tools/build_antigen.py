# -*- coding: utf-8 -*-
"""Сборка данных для новой страницы антигенерации (/antigen/).

Отличие от старого дашборда: на сайт уезжают не готовые месячные срезы, а
компактная таблица фактов со словарями. Все разрезы, провал по неделям и
выгрузка считаются в браузере из неё же — поэтому можно проваливаться в любую
неделю по любому измерению, а не только по тем, что заранее посчитаны.

Единица времени одна на все контуры: неделя с понедельника. Неполная последняя
неделя помечается и в расчёты тренда не идёт.

Источники — те же шесть чартов, что и у старого дашборда:
    2656 забраковка · 2669 движение ДМД · 2654 задания · 2671 акты
    2957 контрольные метрики · 2950 план и цель

Забраковка приезжает не из чарта, а прямо из DWH: в витрине 613 есть и сектор
происхождения, и номенклатура, но в чарт 2656 они не заведены, а superset-dev
регулярно отваливается. Обновить выгрузку:
    py Инструменты/sqlq.py -f tools/sql/zabr_plus.sql --csv zabr_plus.csv --max-rows 500000

Запуск на кэше (ничего не грузит из суперсета):
    py tools/build_antigen.py --cache "E:\\Work\\Черновики\\2026-09-07\\Антигенерация кэш"
                              --zabr-csv zabr_plus.csv
Запуск с живой выгрузкой:
    py tools/build_antigen.py
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "data" / "antigen"
AUTOMATION = Path(r"E:\Work\Инструменты\Автоматизация\07 — Обновление сайта антигенерации.py")

# Сколько недель истории публикуем. 53 недели = ровно год, столько отдаёт
# витрина забраковки; остальные контуры режем по этой же границе, чтобы ось
# времени была общей.
WEEKS_KEPT = 53


# ---------------------------------------------------------------- утилиты

def norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = norm(value).replace(" ", "").replace("\xa0", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0


def to_date(value: Any) -> date | None:
    """Дата из чего угодно: миллисекунды, ISO-строка, дата."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        seconds = float(value)
        if seconds > 1e11:  # миллисекунды
            seconds /= 1000.0
        return datetime.fromtimestamp(seconds, timezone.utc).date()
    text = norm(value)[:10]
    for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def week_start(value: Any) -> str:
    """Понедельник недели. Та же граница, что в SQL витрины забраковки."""
    day = to_date(value)
    if day is None:
        return ""
    return (day - timedelta(days=day.weekday())).isoformat()


class Dictionary:
    """Словарь значений: в таблицу фактов уезжают индексы, а не строки."""

    def __init__(self) -> None:
        self.values: list[str] = []
        self._index: dict[str, int] = {}

    def index(self, value: Any) -> int:
        name = norm(value) or "(не указано)"
        found = self._index.get(name)
        if found is None:
            found = len(self.values)
            self._index[name] = found
            self.values.append(name)
        return found


class Facts:
    """Таблица фактов одного контура: измерения индексами, меры числами."""

    def __init__(self, dims: list[str], measures: list[str]) -> None:
        self.dims = dims
        self.measures = measures
        self.books = {name: Dictionary() for name in dims}
        self.rows: dict[tuple[int, ...], list[float]] = {}

    def add(self, keys: dict[str, Any], values: list[float]) -> None:
        signature = tuple(self.books[name].index(keys.get(name)) for name in self.dims)
        row = self.rows.get(signature)
        if row is None:
            self.rows[signature] = list(values)
        else:
            for i, value in enumerate(values):
                row[i] += value

    def payload(self) -> dict[str, Any]:
        # Меры округляем до целых: копейки в дашборде не видны, а в JSON каждая
        # дробная часть — это лишние байты на каждой из сотни тысяч строк.
        rows = []
        for signature, values in self.rows.items():
            rows.append(list(signature) + [int(round(v)) for v in values])
        rows.sort()
        return {
            "dims": self.dims,
            "measures": self.measures,
            "labels": {name: book.values for name, book in self.books.items()},
            "rows": rows,
        }


def complete_weeks(weeks: Iterable[str], today: date,
                   totals: dict[str, float] | None = None) -> tuple[list[str], list[str]]:
    """Полные недели по возрастанию + отброшенные обрубки в конце.

    Календаря мало: выгрузка часто заканчивается на середине недели, и такая
    неделя формально уже прошла, а данных в ней треть. Поэтому хвост дополнительно
    режется по объёму — пока последняя неделя меньше половины медианы соседних.
    """
    unique = sorted({w for w in weeks if w})
    full, partial = [], []
    for week in unique:
        start = datetime.strptime(week, "%Y-%m-%d").date()
        if start + timedelta(days=7) <= today:
            full.append(week)
        else:
            partial.append(week)

    if totals:
        while len(full) > 8:
            tail = full[-1]
            window = sorted(totals.get(w, 0.0) for w in full[-9:-1])
            median = window[len(window) // 2]
            if median > 0 and totals.get(tail, 0.0) < median * 0.5:
                partial.insert(0, full.pop())
                continue
            break

    return full[-WEEKS_KEPT:], sorted(partial)


# ---------------------------------------------------------------- контуры

def zabr_weeks(rows: list[dict[str, Any]], today: date) -> tuple[list[str], list[str]]:
    """Ось недель контура забраковки — общая для свода и товарной детализации."""
    totals: dict[str, float] = {}
    for row in rows:
        week = week_start(row.get("week_start_date"))
        totals[week] = totals.get(week, 0.0) + number(row.get("strok"))
    return complete_weeks(totals, today, totals)


def build_zabr(rows: list[dict[str, Any]], today: date) -> dict[str, Any]:
    """Официальный факт: акты приёмки. Меры — строки, РРЦ и себестоимость.

    Два отличия от того, что доезжало раньше. Место обнаружения расшито до
    конкретной точки (`poluchatel`): не «Регион-РЦ», а какой именно РЦ. И есть
    номенклатура — обычным измерением, как товар в контуре движения, а не
    отдельной сущностью: с ней таблица фактов растёт со 160 до 259 тысяч строк.

    Сектор-источник из витрины сознательно не берём: в акте это стол, за
    которым товар актировали (столы уценки, предсорт, вход в некомплекты), а не
    ячейка, где он лежал и разбился. Как «место» он читается неверно.
    """
    facts = Facts(
        dims=["week", "vid", "region", "poluchatel", "napr", "gruppa", "mu", "defekt", "tovar"],
        measures=["strok", "rrc", "sebes"],
    )
    # Артикул и бренд — не измерения, а карточка товара: показываются подписью в
    # строке и колонками в выгрузке. Бренд индексом в свой словарь, иначе строка
    # бренда лежит в файле 89 тысяч раз.
    brands = Dictionary()
    info: dict[str, list[Any]] = {}
    kept, partial = zabr_weeks(rows, today)
    keep = set(kept)
    for row in rows:
        week = week_start(row.get("week_start_date"))
        if week not in keep:
            continue
        tovar = norm(row.get("tovar")) or "(не указано)"
        if tovar not in info:
            info[tovar] = [norm(row.get("artikul")), brands.index(row.get("brand"))]
        facts.add(
            {"week": week, "vid": row.get("vid_tochki"), "region": row.get("region"),
             "poluchatel": row.get("poluchatel"), "napr": row.get("napravlenie"),
             "gruppa": row.get("gruppa"), "mu": row.get("model_ucheta"),
             "defekt": row.get("tip_defekta"), "tovar": tovar},
            [number(row.get("strok")), number(row.get("rrc_rub")), number(row.get("sebes_rub"))],
        )
    payload = facts.payload()
    payload["tovarInfo"] = [info[name] for name in payload["labels"]["tovar"]]
    payload["tovarBooks"] = {"brand": brands.values}
    return {"weeks": kept, "partial_weeks": partial, **payload}


def build_dmd(rows: list[dict[str, Any]], today: date) -> dict[str, Any]:
    """Движение брака: вход в брак-ячейки ДМД. Здесь живут товар и бренд."""
    facts = Facts(
        dims=["week", "tip", "zona", "cell", "cat", "mu", "brand", "tovar"],
        measures=["sht", "rub"],
    )
    stock = Facts(dims=["cell", "cat", "brand", "tovar"], measures=["sht", "rub"])
    totals: dict[str, float] = {}
    for row in rows:
        if norm(row.get("srez")).startswith("1."):
            continue
        week = week_start(row.get("Дата_недели"))
        totals[week] = totals.get(week, 0.0) + number(row.get("шт"))
    kept, partial = complete_weeks(totals, today, totals)
    keep = set(kept)
    stock_week = ""
    for row in rows:
        week = week_start(row.get("Дата_недели"))
        sht, rub = number(row.get("шт")), number(row.get("рубли"))
        if norm(row.get("srez")).startswith("1."):
            stock_week = max(stock_week, week)
            continue
        if week not in keep:
            continue
        facts.add(
            {"week": week, "tip": row.get("Тип"), "zona": row.get("Локация_целевая"),
             "cell": row.get("Ячейка_целевая"), "cat": row.get("Категория_CD"),
             "mu": row.get("МУ"), "brand": row.get("Бренд"), "tovar": row.get("Товар")},
            [sht, rub],
        )
    for row in rows:
        if not norm(row.get("srez")).startswith("1."):
            continue
        if week_start(row.get("Дата_недели")) != stock_week:
            continue
        stock.add({"cell": row.get("Ячейка_целевая"), "cat": row.get("Категория_CD"),
                   "brand": row.get("Бренд"), "tovar": row.get("Товар")},
                  [number(row.get("шт")), number(row.get("рубли"))])
    return {"weeks": kept, "partial_weeks": partial,
            "stock_week": stock_week, "stock": stock.payload(), **facts.payload()}


def build_gen(rows: list[dict[str, Any]], today: date) -> dict[str, Any]:
    """Задания с признаком брака: где в процессе всплыл сигнал."""
    facts = Facts(
        dims=["week", "ploshadka", "zona", "tip", "reshenie", "ispolnitel"],
        measures=["zad", "sht", "rub"],
    )
    totals: dict[str, float] = {}
    for row in rows:
        week = week_start(row.get("Дата"))
        totals[week] = totals.get(week, 0.0) + number(row.get("Заданий"))
    kept, partial = complete_weeks(totals, today, totals)
    keep = set(kept)
    for row in rows:
        week = week_start(row.get("Дата"))
        if week not in keep:
            continue
        facts.add(
            {"week": week, "ploshadka": row.get("Площадка"), "zona": row.get("Зона"),
             "tip": row.get("Тип задания"), "reshenie": row.get("Решение"),
             "ispolnitel": row.get("Исполнитель")},
            [number(row.get("Заданий")), number(row.get("Штук")),
             number(row.get("Стоимость искомого, руб"))],
        )
    return {"weeks": kept, "partial_weeks": partial, **facts.payload()}


def build_akty(rows: list[dict[str, Any]], today: date) -> dict[str, Any]:
    """Акты расхождений с причиной «брак»: кого назначили ответственным."""
    facts = Facts(
        dims=["week", "vinovnik", "chelovek", "zavel", "ist", "pol", "svyaz"],
        measures=["strok", "akt", "sht", "seb"],
    )
    totals: dict[str, float] = {}
    for row in rows:
        week = week_start(row.get("Дата"))
        totals[week] = totals.get(week, 0.0) + number(row.get("Актов"))
    kept, partial = complete_weeks(totals, today, totals)
    keep = set(kept)
    for row in rows:
        week = week_start(row.get("Дата"))
        if week not in keep:
            continue
        facts.add(
            {"week": week, "vinovnik": row.get("Виновник"),
             "chelovek": row.get("Виновник, человек"), "zavel": row.get("Завёл акт"),
             "ist": row.get("Зона-источник"), "pol": row.get("Зона-получатель"),
             "svyaz": row.get("Связь с забраковкой")},
            [number(row.get("Строк")), number(row.get("Актов")),
             number(row.get("Штук")), number(row.get("Себестоимость, руб"))],
        )
    return {"weeks": kept, "partial_weeks": partial, **facts.payload()}


def build_control(metrics: list[dict[str, Any]], plan: list[dict[str, Any]]) -> dict[str, Any]:
    """Месячные контрольные показатели и целевая траектория — как были."""
    months = []
    for row in sorted(metrics, key=lambda r: norm(r.get("month_key"))):
        month = norm(row.get("month_key"))[:7]
        if not month:
            continue
        months.append({
            "month": month,
            "akty": number(row.get("akty_sht")),
            "rub": number(row.get("brak_rub")),
            "sred": number(row.get("sred_cena_akta")),
            "pct_sht": number(row.get("pct_ot_shtuk")),
            "pct_vyr": number(row.get("pct_ot_vyruchki")),
            "pct_ost": number(row.get("pct_ot_ostatka")),
            "backlog": number(row.get("backlog_presort")),
            "prodano": number(row.get("prodano_sht")),
            "vyruchka": number(row.get("vyruchka_rub")),
            "ostatok": number(row.get("ostatok_dmd_sht")),
        })
    trajectory = []
    for row in plan:
        month = to_date(row.get("report_month") or row.get("__timestamp"))
        if month is None:
            continue
        trajectory.append({
            "month": month.strftime("%Y-%m"),
            "fact": row.get("акты, шт/мес"),
            "point_b": row.get("план (точка Б)"),
            "goal": row.get("цель −30 % ГкГ"),
        })
    trajectory.sort(key=lambda r: r["month"])
    return {"months": months, "trajectory": trajectory}


# ---------------------------------------------------------------- источники

def load_zabr_csv(path: Path) -> list[dict[str, Any]]:
    """Витрина забраковки прямо из DWH, минуя Superset.

    Так она приезжает с номенклатурой и сектором-источником, которых нет в
    чарте 2656, и не зависит от того, жив ли сегодня superset-dev. Обновить:
        py Инструменты/sqlq.py -f tools/sql/zabr_plus.sql --csv <файл> --max-rows 500000
    """
    import csv

    csv.field_size_limit(10 ** 7)
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_cache(folder: Path) -> dict[str, list[dict[str, Any]]]:
    data = {}
    for path in folder.glob("*.json.gz"):
        name = path.name.split("-")[0]
        with gzip.open(path, "rt", encoding="utf-8") as f:
            data[name] = json.load(f)
    return data


def load_live() -> dict[str, list[dict[str, Any]]]:
    import importlib.util

    spec = importlib.util.spec_from_file_location("pub07", AUTOMATION)
    module = importlib.util.module_from_spec(spec)
    sys.modules["pub07"] = module
    spec.loader.exec_module(module)

    token = module.login()
    data = {}
    for name, chart_id in module.CHARTS.items():
        data[name] = module.fetch_chart(token, chart_id)
    for name, chart_id in module.CONTROL_CHARTS.items():
        data[name] = module.fetch_saved_chart(token, chart_id)
    return data


BUILDERS: dict[str, tuple[str, Callable[[list[dict[str, Any]], date], dict[str, Any]]]] = {
    "zabr": ("zabr", build_zabr), "dmd": ("dmd", build_dmd),
    "gen": ("gen", build_gen), "akty": ("akty", build_akty),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, help="папка с *.json.gz вместо живой выгрузки")
    parser.add_argument("--zabr-csv", type=Path,
                        help="выгрузка tools/sql/zabr_plus.sql — забраковка с товаром и сектором")
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    source = load_cache(args.cache) if args.cache else load_live()
    if args.zabr_csv:
        source["zabr"] = load_zabr_csv(args.zabr_csv)
    missing = [name for name in ("zabr", "dmd", "gen", "akty", "metrics", "plan")
               if name not in source]
    if missing:
        raise SystemExit(f"нет данных по контурам: {', '.join(missing)}")

    today = date.today()
    args.out.mkdir(parents=True, exist_ok=True)

    index = {
        "built": datetime.now().astimezone().isoformat(timespec="seconds"),
        "contours": {},
        "control": build_control(source["metrics"], source["plan"]),
        "sources": {"zabr": 2656, "dmd": 2669, "gen": 2654, "akty": 2671,
                    "metrics": 2957, "plan": 2950},
    }

    for name, (source_key, builder) in BUILDERS.items():
        payload = builder(source[source_key], today)
        path = args.out / f"{name}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
        index["contours"][name] = {
            "file": f"{name}.json",
            "weeks": payload["weeks"],
            "partial_weeks": payload.get("partial_weeks"),
            "rows": len(payload["rows"]),
            "size_kb": round(path.stat().st_size / 1024),
        }
        print(f'{name}: {len(payload["rows"])} строк, {len(payload["weeks"])} недель, '
              f'{index["contours"][name]["size_kb"]} КБ')

    # Общая ось — недели основного контура: остальные к ней подстраиваются.
    index["weeks"] = index["contours"]["zabr"]["weeks"]
    (args.out / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("индекс:", args.out / "index.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
