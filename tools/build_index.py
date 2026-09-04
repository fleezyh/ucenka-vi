# -*- coding: utf-8 -*-
"""Собирает поисковый индекс сайта ucenka-vi.ru из единой выгрузки пикалки.

Раньше база лежала как 15 частей по 21 МБ плюс bloom-фильтр на 12 МБ: чтобы
ответить на один штрихкод, браузер качал 12 МБ индекса и 21 МБ части, распаковывал
её в 58 МБ и линейно сканировал. Теперь база режется на шарды по последним четырём
цифрам штрихкода, поэтому поиск — это один запрос на ~25 КБ без всякой подготовки.

Уценка и предсорт лежат в одном шарде: после перехода на Пикалка_ЕДИНАЯ.sql набор
штрихкодов у них общий, и разделять базы больше незачем.

    py tools/build_index.py "E:\\Work\\Выгрузки\\2026-09\\пикалка_единая.csv"
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "data" / "v2"
SHARD_DIR = OUT_DIR / "shards"
WORDS_DIR = OUT_DIR / "words"
BIG_DIR = WORDS_DIR / "big"
MANIFEST_PATH = OUT_DIR / "manifest.json"

# Инвертированный индекс наименований. Раньше поиск по названию читал всю базу
# подряд — до 300 МБ на один запрос. Теперь слово ведёт прямо к штрихкодам.
TOKEN_RE = re.compile(r"[0-9a-zа-яё]{3,}")
TOKEN_PREFIX = 2             # редкие слова группируются в файлы по первым двум буквам
POSTINGS_PER_TOKEN = 2000    # потолок списка штрихкодов у одного слова
# Слово, которое встречается чаще этого, получает собственный файл: иначе бренд
# вроде «bosch» раздувает общий файл префикса, а без длинного списка запрос из
# двух частых слов («перфоратор bosch») не с чем пересекать.
INLINE_LIMIT = 500

# Последние SHARD_DIGITS цифр штрихкода. 4 цифры -> 10 000 шардов, медиана ~600
# строк (~25 КБ в gzip). Меньше цифр — шарды жирнеют, больше — растёт число файлов.
SHARD_DIGITS = 4
SHARD_COUNT = 10 ** SHARD_DIGITS

# Порядок полей в шарде. Штрихкод идёт первым: поиск сравнивает его побайтно,
# не разбирая строку целиком. «Код сайта» — последним, чтобы старые позиции
# полей не поехали; из него сайт собирает ссылку на карточку товара.
FIELDS = ["Штрихкод", "Наименование", "Рубрика", "Себес", "Кластер", "Код сайта"]

# Рубрики, которые сейчас приходят из витрины 9901_Name. Переименование под
# каталог сайта живёт на сайте (RUBRIC_ALIASES в script.js) — данные храним
# как в DWH, иначе каждое переименование каталога стоило бы пересборки базы.
# Здесь список нужен для другого: заметить рубрику, которой раньше не было.
# Правило кластеров предсорта — фиксированный перечень, и новая рубрика в нём
# не учтена.
RUBRIC_KNOWN = {
    "Инструмент",
    "Электрика и свет",
    "Ручной инструмент",
    "Сантехника",
    "Все для сада",
    "Автогаражное оборудование",
    "Крепеж",
    "Строительные материалы",
    "Товары для офиса и дома",
    "Складское оборудование",
    "Станки",
    "Климатическое оборудование",
    "Спецодежда и СИЗ",
    "Клининговое оборудование",
    "Строительное оборудование",
    "Товары для отдыха",
    "Расходные материалы",
    "Проверьте на сайте",
}

FLUSH_EVERY = 500_000


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def shard_key(barcode: str) -> str:
    """Ключ шарда — последние цифры штрихкода, дополненные нулями слева."""
    digits = "".join(char for char in barcode if char.isdigit())
    return digits[-SHARD_DIGITS:].rjust(SHARD_DIGITS, "0")


def open_source(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8-sig", newline="")
    return path.open("r", encoding="utf-8-sig", newline="")


def read_rows(path: Path):
    """Отдаёт строки выгрузки, приведённые к общей схеме FIELDS."""
    with open_source(path) as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            raise SystemExit(f"пустой файл: {path}")

        header = [column.strip().strip('"') for column in header]
        missing = [field for field in FIELDS if field not in header]
        if missing:
            raise SystemExit(
                f"в выгрузке нет колонок {missing}; найдено: {header}. "
                "Нужна выгрузка Пикалка_ЕДИНАЯ.sql."
            )
        order = [header.index(field) for field in FIELDS]

        for row in reader:
            if len(row) < len(header):
                continue
            yield [clean(row[index]) for index in order]


def clean(value: str) -> str:
    """Схлопывает переводы строк и табы в пробел.

    В наименованиях из WMS попадаются переносы (около тысячи на базу). Шард
    читается на сайте построчно, поэтому многострочная запись его бы порвала.
    """
    if "\n" in value or "\r" in value or "\t" in value:
        value = value.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    return " ".join(value.split())


def build(source: Path) -> dict:
    if SHARD_DIR.exists():
        log(f"чищу прошлую сборку: {SHARD_DIR}")
        shutil.rmtree(SHARD_DIR)
    SHARD_DIR.mkdir(parents=True, exist_ok=True)

    if WORDS_DIR.exists():
        shutil.rmtree(WORDS_DIR)
    WORDS_DIR.mkdir(parents=True, exist_ok=True)

    rubric_index = FIELDS.index("Рубрика")
    unknown_rubrics: dict[str, int] = defaultdict(int)
    buckets: dict[str, list[str]] = defaultdict(list)
    words: dict[str, list[str]] = defaultdict(list)
    # Сколько штрихкодов уже записано под каждое слово. Держим только счётчики:
    # сами постинги сразу уходят на диск, иначе индекс не влезет в память.
    token_seen: dict[str, int] = defaultdict(int)
    pending = 0
    rows_total = 0
    rows_skipped = 0

    def flush() -> None:
        nonlocal pending
        for key, lines in buckets.items():
            target = SHARD_DIR / key[:2] / f"{key}.csv"
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("a", encoding="utf-8", newline="") as handle:
                handle.write("".join(lines))
        buckets.clear()
        for prefix, lines in words.items():
            target = WORDS_DIR / f"{prefix}.txt"
            with target.open("a", encoding="utf-8", newline="") as handle:
                handle.write("".join(lines))
        words.clear()
        pending = 0

    def safe_prefix(token: str) -> str:
        """Имя файла для слова: кириллица и цифры — как есть, но без путей."""
        prefix = token[:TOKEN_PREFIX]
        return "".join(char if char.isalnum() else "_" for char in prefix)

    log(f"читаю {source}")
    for row in read_rows(source):
        barcode = row[0]
        if not barcode or not barcode.isdigit() or not (6 <= len(barcode) <= 30):
            rows_skipped += 1
            continue
        rubric = row[rubric_index]
        if rubric and rubric not in RUBRIC_KNOWN:
            unknown_rubrics[rubric] += 1

        buffer = []
        writer = csv.writer(_LineSink(buffer), lineterminator="\n")
        writer.writerow(row)
        buckets[shard_key(barcode)].append(buffer[0])

        for token in set(TOKEN_RE.findall(row[1].lower())):
            if token_seen[token] >= POSTINGS_PER_TOKEN:
                continue
            token_seen[token] += 1
            words[safe_prefix(token)].append(f"{token}\t{barcode}\n")

        rows_total += 1
        pending += 1
        if pending >= FLUSH_EVERY:
            flush()
            log(f"обработано строк: {rows_total:,}".replace(",", " "))

    flush()
    log(f"обработано строк: {rows_total:,}".replace(",", " "))
    log(f"пропущено строк: {rows_skipped:,}".replace(",", " "))
    log(f"уникальных слов: {len(token_seen):,}".replace(",", " "))

    if unknown_rubrics:
        log("ВНИМАНИЕ: в выгрузке рубрики, которых раньше не было.")
        log("Проверьте правило кластеров в Пикалка_ЕДИНАЯ.sql "
            "и RUBRIC_ALIASES в script.js:")
        for name, count in sorted(unknown_rubrics.items(), key=lambda item: -item[1]):
            log(f"  {name} — {count:,} строк".replace(",", " "))

    words_stats = collapse_words()
    return compress(rows_total, rows_skipped, words_stats)


def collapse_words() -> dict:
    """Схлопывает постинги в строки «слово<TAB>штрихкоды через пробел» и сжимает.

    Файл одного префикса — это всё, что браузер скачает ради поиска по названию.
    """
    log("собираю индекс наименований")
    BIG_DIR.mkdir(parents=True, exist_ok=True)
    compressed_bytes = 0
    sizes: list[int] = []
    files = 0
    big_files = 0

    for plain in sorted(WORDS_DIR.glob("*.txt")):
        grouped: dict[str, list[str]] = defaultdict(list)
        with plain.open("r", encoding="utf-8") as handle:
            for line in handle:
                token, _, barcode = line.rstrip("\n").partition("\t")
                if token and barcode:
                    grouped[token].append(barcode)

        lines = []
        for token in sorted(grouped):
            codes = grouped[token]
            if len(codes) <= INLINE_LIMIT:
                lines.append(f"{token}\t{' '.join(codes)}\n")
                continue
            # Маркер «@» говорит сайту, что список лежит в отдельном файле.
            # Префикс «w-» в имени: иначе слова вроде con или aux Windows
            # считает зарезервированными именами устройств и файл не создаётся.
            lines.append(f"{token}\t@\n")
            size = write_gzip(BIG_DIR / f"w-{token}.txt.gz", " ".join(codes).encode("utf-8"))
            compressed_bytes += size
            big_files += 1

        size = write_gzip(plain.with_suffix(".txt.gz"), "".join(lines).encode("utf-8"))
        plain.unlink()
        compressed_bytes += size
        sizes.append(size)
        files += 1

    sizes.sort()
    if sizes:
        log(f"словарных файлов: {files} общих + {big_files} на частые слова, "
            f"объём {compressed_bytes / 1e6:.0f} МБ, "
            f"общий файл: медиана {sizes[len(sizes) // 2] / 1024:.0f} КБ, "
            f"максимум {sizes[-1] / 1024:.0f} КБ")
    return {
        "wordFiles": files,
        "wordBigFiles": big_files,
        "wordBytes": compressed_bytes,
        "wordBytesMedian": sizes[len(sizes) // 2] if sizes else 0,
        "wordBytesMax": sizes[-1] if sizes else 0,
    }


def write_gzip(path: Path, payload: bytes) -> int:
    """Пишет gzip без отметки времени: неизменившийся файл даёт тот же блоб в git."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.GzipFile(filename="", mode="wb", compresslevel=9, mtime=0,
                       fileobj=path.open("wb")) as handle:
        handle.write(payload)
    return path.stat().st_size


class _LineSink:
    """Приёмник для csv.writer: складывает готовую строку в список."""

    def __init__(self, sink: list[str]) -> None:
        self._sink = sink

    def write(self, value: str) -> int:
        self._sink.append(value)
        return len(value)


def dedupe(data: bytes) -> tuple[bytes, int]:
    """Оставляет по одной строке на штрихкод и сортирует шард по нему.

    SELECT DISTINCT в пикалке убирает только полные дубли строк, а один штрихкод
    может прийти с разными наименованиями. Дедуплицируем здесь: шард маленький,
    в память влезает целиком.
    """
    unique: dict[bytes, bytes] = {}
    dropped = 0
    for line in data.split(b"\n"):
        if not line:
            continue
        barcode = line.split(b",", 1)[0].strip(b'"')
        if barcode in unique:
            dropped += 1
            continue
        unique[barcode] = line
    ordered = b"".join(unique[key] + b"\n" for key in sorted(unique))
    return ordered, dropped


def compress(rows_total: int, rows_skipped: int, words_stats: dict) -> dict:
    log("сжимаю шарды")
    shards: dict[str, int] = {}
    compressed_bytes = 0
    raw_bytes = 0
    duplicates = 0
    sizes: list[int] = []

    for plain in sorted(SHARD_DIR.rglob("*.csv")):
        data, dropped = dedupe(plain.read_bytes())
        duplicates += dropped
        rows_total -= dropped
        packed = plain.with_suffix(".csv.gz")
        size = write_gzip(packed, data)
        plain.unlink()
        rows = data.count(b"\n")
        shards[plain.stem] = rows
        sizes.append(size)
        compressed_bytes += size
        raw_bytes += len(data)

    sizes.sort()
    manifest = {
        "version": 2,
        "builtAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "shardDigits": SHARD_DIGITS,
        "shardPath": "data/v2/shards/{prefix}/{key}.csv.gz",
        "wordPath": "data/v2/words/{prefix}.txt.gz",
        "wordBigPath": "data/v2/words/big/w-{token}.txt.gz",
        "wordPrefix": TOKEN_PREFIX,
        "postingsPerToken": POSTINGS_PER_TOKEN,
        "inlineLimit": INLINE_LIMIT,
        "fields": FIELDS,
        "rows": rows_total,
        "skipped": rows_skipped,
        "duplicates": duplicates,
        "shardCount": len(shards),
        "compressedBytes": compressed_bytes,
        "rawBytes": raw_bytes,
        "shardBytesMedian": sizes[len(sizes) // 2] if sizes else 0,
        "shardBytesMax": sizes[-1] if sizes else 0,
        **words_stats,
        # Пустые шарды перечислены явно, чтобы фронт отвечал «не найден» без запроса.
        "emptyShards": sorted(
            f"{index:0{SHARD_DIGITS}d}"
            for index in range(SHARD_COUNT)
            if f"{index:0{SHARD_DIGITS}d}" not in shards
        ),
    }

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Манифест общий: в нём живут и ключи индекса алиасов (build_aliases.py).
    # Раньше пересборка базы затирала файл целиком, и поиск по внутренней
    # этикетке молча отваливался — сами шарды алиасов при этом лежали на месте.
    if MANIFEST_PATH.exists():
        previous = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        foreign = {key: value for key, value in previous.items() if key.startswith("alias")}
        manifest = {**foreign, **manifest}
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    log(f"шардов: {len(shards)}, дублей штрихкода убрано: {duplicates:,}".replace(",", " "))
    log(f"объём: {compressed_bytes / 1e6:.0f} МБ сжато / {raw_bytes / 1e6:.0f} МБ сырых")
    log(f"шард: медиана {manifest['shardBytesMedian'] / 1024:.0f} КБ, "
        f"максимум {manifest['shardBytesMax'] / 1024:.0f} КБ")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="CSV или CSV.GZ выгрузки Пикалка_ЕДИНАЯ.sql")
    args = parser.parse_args()

    if not args.source.exists():
        print(f"нет файла: {args.source}", file=sys.stderr)
        return 1

    started = time.time()
    build(args.source)
    log(f"готово за {time.time() - started:.0f} с")
    return 0


if __name__ == "__main__":
    sys.exit(main())
