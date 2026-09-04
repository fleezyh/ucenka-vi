# -*- coding: utf-8 -*-
"""Собирает индекс алиасов «код товара с сайта -> штрихкод».

Зачем. На складе клеят внутреннюю этикетку «002 <код товара с сайта>»
(002 26794532 — мусорный бак Комус). Такого штрихкода нет ни в одном
справочнике: настоящие ШК приходят от поставщика, а эту этикетку печатает сам
склад. Поэтому пикалка на неё молчала, хотя товар в базе есть — просто под
другим кодом.

Индекс лежит рядом с шардами и режется так же по последним четырём цифрам, но
уже кода сайта. Сами шарды не трогаются: сканирование обычного штрихкода
работает как работало, алиас — отдельный запрос на ~5 КБ и только для «002…».

    py tools/build_aliases.py "E:\\Work\\Выгрузки\\2026-09\\пикалка_код_сайта.csv"
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "data" / "v2"
ALIAS_DIR = OUT_DIR / "alias"
MANIFEST_PATH = OUT_DIR / "manifest.json"

# Те же четыре цифры, что у шардов товаров, но берутся от кода сайта.
ALIAS_DIGITS = 4
ALIAS_COUNT = 10 ** ALIAS_DIGITS

# Префикс внутренней этикетки. Держим здесь, а не только на сайте: индекс
# строится под конкретный формат, и менять его надо в одном месте.
INTERNAL_PREFIX = "002"

FLUSH_EVERY = 1_000_000


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def alias_key(code: str) -> str:
    return code[-ALIAS_DIGITS:].rjust(ALIAS_DIGITS, "0")


def usable_barcode(barcode: str) -> bool:
    """Тот же фильтр, что в build_index.py.

    Иначе алиас укажет на штрихкод, которого в шардах нет: в выгрузке попадаются
    буквенные коды вроде DS373QJ70L3VE, и сборщик базы их пропускает.
    """
    return bool(barcode) and barcode.isdigit() and 6 <= len(barcode) <= 30


def open_source(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8-sig", newline="")
    return path.open("r", encoding="utf-8-sig", newline="")


def build(source: Path) -> dict:
    if ALIAS_DIR.exists():
        log(f"чищу прошлую сборку: {ALIAS_DIR}")
        shutil.rmtree(ALIAS_DIR)
    ALIAS_DIR.mkdir(parents=True, exist_ok=True)

    buckets: dict[str, list[str]] = defaultdict(list)
    seen: set[str] = set()
    pending = 0
    rows_total = 0
    rows_skipped = 0
    rows_duplicate = 0

    def flush() -> None:
        nonlocal pending
        for key, lines in buckets.items():
            target = ALIAS_DIR / key[:2] / f"{key}.csv"
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("a", encoding="utf-8", newline="") as handle:
                handle.write("".join(lines))
        buckets.clear()
        pending = 0

    log(f"читаю {source}")
    with open_source(source) as handle:
        reader = csv.reader(handle)
        header = [column.strip().strip('"') for column in next(reader)]
        try:
            code_at = header.index("Код сайта")
            barcode_at = header.index("Штрихкод")
        except ValueError:
            raise SystemExit(
                f"нужны колонки «Код сайта» и «Штрихкод»; найдено: {header}. "
                "Нужна выгрузка Пикалка_КОД_САЙТА.sql."
            )

        for row in reader:
            if len(row) <= max(code_at, barcode_at):
                continue
            code = row[code_at].strip()
            barcode = row[barcode_at].strip()

            if not code.isdigit() or not usable_barcode(barcode):
                rows_skipped += 1
                continue
            # У одного товара бывает несколько штрихкодов. Ведём к первому:
            # они все лежат в базе и дают одну и ту же карточку.
            if code in seen:
                rows_duplicate += 1
                continue
            seen.add(code)

            buckets[alias_key(code)].append(f"{code},{barcode}\n")
            rows_total += 1
            pending += 1
            if pending >= FLUSH_EVERY:
                flush()
                log(f"обработано пар: {rows_total:,}".replace(",", " "))

    flush()
    log(f"кодов сайта: {rows_total:,}".replace(",", " "))
    log(f"пропущено (буквенный ШК или пусто): {rows_skipped:,}".replace(",", " "))
    log(f"повторов кода сайта убрано: {rows_duplicate:,}".replace(",", " "))
    return compress(rows_total, rows_skipped, rows_duplicate)


def write_gzip(path: Path, payload: bytes) -> int:
    """Без отметки времени: неизменившийся файл даёт тот же блоб в git."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.GzipFile(filename="", mode="wb", compresslevel=9, mtime=0,
                       fileobj=path.open("wb")) as handle:
        handle.write(payload)
    return path.stat().st_size


def compress(rows_total: int, rows_skipped: int, rows_duplicate: int) -> dict:
    log("сжимаю индекс алиасов")
    keys: set[str] = set()
    compressed_bytes = 0
    sizes: list[int] = []

    for plain in sorted(ALIAS_DIR.rglob("*.csv")):
        lines = sorted(
            line for line in plain.read_text(encoding="utf-8").split("\n") if line
        )
        data = ("\n".join(lines) + "\n").encode("utf-8")
        size = write_gzip(plain.with_suffix(".csv.gz"), data)
        plain.unlink()
        keys.add(plain.stem)
        sizes.append(size)
        compressed_bytes += size

    sizes.sort()
    empty = sorted(
        f"{index:0{ALIAS_DIGITS}d}"
        for index in range(ALIAS_COUNT)
        if f"{index:0{ALIAS_DIGITS}d}" not in keys
    )

    stats = {
        "aliasBuiltAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "aliasPath": "data/v2/alias/{prefix}/{key}.csv.gz",
        "aliasDigits": ALIAS_DIGITS,
        "aliasPrefix": INTERNAL_PREFIX,
        "aliasRows": rows_total,
        "aliasSkipped": rows_skipped,
        "aliasDuplicates": rows_duplicate,
        "aliasShardCount": len(keys),
        "aliasBytes": compressed_bytes,
        "aliasBytesMedian": sizes[len(sizes) // 2] if sizes else 0,
        "aliasBytesMax": sizes[-1] if sizes else 0,
        "aliasEmptyShards": empty,
    }

    # Манифест базы общий: дописываем свои ключи, чужие не трогаем.
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest.update(stats)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    log(f"шардов алиасов: {len(keys)}, объём {compressed_bytes / 1e6:.0f} МБ")
    log(f"шард: медиана {stats['aliasBytesMedian'] / 1024:.1f} КБ, "
        f"максимум {stats['aliasBytesMax'] / 1024:.1f} КБ")
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="CSV выгрузки Пикалка_КОД_САЙТА.sql")
    args = parser.parse_args()

    if not args.source.exists():
        print(f"нет файла: {args.source}", file=sys.stderr)
        return 1
    if not MANIFEST_PATH.exists():
        print(f"нет манифеста базы: {MANIFEST_PATH}", file=sys.stderr)
        return 1

    started = time.time()
    build(args.source)
    log(f"готово за {time.time() - started:.0f} с")
    return 0


if __name__ == "__main__":
    sys.exit(main())
