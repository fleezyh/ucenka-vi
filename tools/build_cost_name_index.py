r"""Build an exact full-name -> product cost index for the Picker bulk tool.

The barcode Picker deliberately stores the short WMS name. Bulk lists arrive
with the full catalog name, so reusing the barcode name index loses valid
matches. This index stores only a 64-bit name hash, product code and cost; the
full names therefore do not duplicate hundreds of megabytes of text on disk.

    py tools/build_cost_name_index.py E:\Work\Выгрузки\2026-09\себес_по_полному_имени.csv
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "cost-names"
SHARDS = OUT / "shards"
SHARD_HEX = 3
FLUSH_EVERY = 300_000
NON_WORD = re.compile(r"[^0-9a-zа-яё]+", re.IGNORECASE)


def normalize(value: str) -> str:
    return " ".join(NON_WORD.sub(" ", value.lower()).split())


def fnv1a64(value: str) -> str:
    number = 0xCBF29CE484222325
    for byte in value.encode("utf-8"):
        number ^= byte
        number = (number * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{number:016x}"


def source_files(source: Path) -> list[Path]:
    return sorted(source.glob("*.csv")) if source.is_dir() else [source]


def build(source: Path) -> None:
    if SHARDS.exists():
        shutil.rmtree(SHARDS)
    SHARDS.mkdir(parents=True)

    buckets: dict[str, list[str]] = defaultdict(list)
    rows = 0
    skipped = 0

    def flush() -> None:
        for key, lines in buckets.items():
            target = SHARDS / f"{key}.csv"
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("a", encoding="utf-8", newline="") as handle:
                handle.write("".join(lines))
        buckets.clear()

    for source_file in source_files(source):
        with source_file.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            required = {"Код сайта", "Полное наименование", "Себес"}
            if not required.issubset(reader.fieldnames or []):
                raise SystemExit(f"Нужны колонки {sorted(required)}; получены {reader.fieldnames}")
            for record in reader:
                name = normalize(record["Полное наименование"] or "")
                code = (record["Код сайта"] or "").strip()
                cost = (record["Себес"] or "").strip().replace(",", ".")
                if not name or not code:
                    skipped += 1
                    continue
                digest = fnv1a64(name)
                buckets[digest[:SHARD_HEX]].append(f"{digest},{code},{cost}\n")
                rows += 1
                if rows % FLUSH_EVERY == 0:
                    flush()
                    print(f"обработано {rows:,}".replace(",", " "), flush=True)
    flush()

    for index, plain in enumerate(sorted(SHARDS.glob("*.csv")), start=1):
        target = plain.with_suffix(".csv.gz")
        with plain.open("rb") as source_handle, gzip.open(target, "wb", compresslevel=6) as target_handle:
            shutil.copyfileobj(source_handle, target_handle, length=1024 * 1024)
        plain.unlink()
        if index % 512 == 0:
            print(f"сжато {index} шардов", flush=True)

    manifest = {
        "version": 1,
        "builtAt": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "rows": rows,
        "skipped": skipped,
        "hash": "fnv1a64-utf8-normalized",
        "shardHex": SHARD_HEX,
        "shardPath": "data/cost-names/shards/{key}.csv.gz",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"готово: {rows:,} строк, пропущено {skipped:,}".replace(",", " "))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    build(parser.parse_args().source)
