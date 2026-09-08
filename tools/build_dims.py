# -*- coding: utf-8 -*-
"""Шарды с габаритами: штрихкод -> длина, ширина, высота, вес.

Отдельно от основного справочника намеренно. Габариты нужны одной секции на
одной странице, а пересборка основной базы — это 10 000 файлов и 350 МБ; ради
четырёх чисел её трогать незачем. Здесь тот же принцип и тот же ключ: последние
четыре цифры штрихкода, поэтому на товар скачивается один маленький кусочек.

    py tools/build_dims.py "E:\\Work\\Выгрузки\\2026-09\\пикалка_единая_габариты.csv"
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "data" / "dims"
SHARD_DIGITS = 4
FIELDS = ["Длина", "Ширина", "Высота", "Вес"]


def shard_key(barcode: str) -> str:
    digits = "".join(ch for ch in barcode if ch.isdigit())
    return (digits[-SHARD_DIGITS:] if len(digits) >= SHARD_DIGITS else digits).rjust(SHARD_DIGITS, "0")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    csv.field_size_limit(10 ** 7)
    buckets: dict[str, list[str]] = defaultdict(list)
    total = skipped = 0

    with args.source.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [name for name in ["Штрихкод"] + FIELDS if name not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"в выгрузке нет колонок {missing}")
        for row in reader:
            barcode = (row["Штрихкод"] or "").strip()
            values = [(row[name] or "").strip() for name in FIELDS]
            # Строки без единого числа не пишем: они только раздували бы шарды.
            if not barcode or not any(value not in ("", "0", "0.00") for value in values):
                skipped += 1
                continue
            buckets[shard_key(barcode)].append(",".join([barcode] + values))
            total += 1

    if args.out.exists():
        shutil.rmtree(args.out)
    args.out.mkdir(parents=True)

    for key, lines in buckets.items():
        folder = args.out / key[:2]
        folder.mkdir(exist_ok=True)
        with gzip.open(folder / f"{key}.csv.gz", "wt", encoding="utf-8", newline="\n") as out:
            out.write("\n".join(lines))

    size = sum(path.stat().st_size for path in args.out.rglob("*.csv.gz"))
    manifest = {
        "fields": FIELDS,
        "shardDigits": SHARD_DIGITS,
        "path": "data/dims/{prefix}/{key}.csv.gz",
        "rows": total,
        "skipped": skipped,
        "shards": len(buckets),
        "bytes": size,
    }
    (args.out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"строк {total}, без габаритов {skipped}, шардов {len(buckets)}, {size / 1048576:.0f} МБ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
