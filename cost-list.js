(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const MANIFEST_URL = "data/v2/manifest.json";
  const COST_MANIFEST_URL = "data/cost-names/manifest.json";
  const XLSX_URL = "dashboard/vendor/xlsx.full.min.js";
  const LIMIT = 2000;
  const LOOKUP_CONCURRENCY = 8;
  const FETCH_CONCURRENCY = 8;
  const utf8 = new TextDecoder("utf-8");
  const moneyFormat = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

  const input = $("costListInput");
  const fileInput = $("costListFile");
  const fileName = $("costListFileName");
  const go = $("costListGo");
  const clear = $("costListClear");
  const exportButton = $("costListExport");
  const message = $("costListMessage");
  const progress = $("costListProgress");
  const progressValue = $("costListProgressValue");
  const totals = $("costListTotals");
  const results = $("costListResults");
  const body = $("costListBody");

  if (!input || !fileInput || !go) return;

  let manifest;
  let costManifest;
  let preparedRows = null;
  let outputRows = [];
  const wordCache = new Map();
  const shardCache = new Map();
  const costShardCache = new Map();

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
  }

  function setProgress(visible, percent = 0) {
    progress.hidden = !visible;
    progressValue.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function normalize(value) {
    return String(value ?? "")
      .toLocaleLowerCase("ru-RU")
      .replace(/[^0-9a-zа-яё]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function fnv1a64(value) {
    let number = 0xcbf29ce484222325n;
    for (const byte of new TextEncoder().encode(value)) {
      number ^= BigInt(byte);
      number = BigInt.asUintN(64, number * 0x100000001b3n);
    }
    return number.toString(16).padStart(16, "0");
  }

  async function getCostManifest() {
    if (costManifest !== undefined) return costManifest;
    const response = await fetch(COST_MANIFEST_URL, { cache: "no-cache" });
    costManifest = response.ok ? await response.json() : null;
    return costManifest;
  }

  async function loadCostShard(key) {
    if (costShardCache.has(key)) return costShardCache.get(key);
    const url = `${costManifest.shardPath.replace("{key}", key)}?v=${encodeURIComponent(costManifest.builtAt)}`;
    const response = await fetch(url, { cache: "force-cache" });
    if (response.status === 404) return [];
    const buffer = await readMaybeGzip(response);
    const rows = utf8.decode(new Uint8Array(buffer)).split("\n").filter(Boolean).map((line) => line.split(","));
    costShardCache.set(key, rows);
    return rows;
  }

  async function exactFullNameMatch(item) {
    if (!await getCostManifest()) return null;
    const digest = fnv1a64(normalize(item.name));
    const rows = (await loadCostShard(digest.slice(0, costManifest.shardHex)))
      .filter((row) => row[0] === digest);
    if (!rows.length) return null;
    const prices = [...new Set(rows.map((row) => Number(row[2])).filter(Number.isFinite))];
    if (prices.length > 1) return { ...item, matchedName: item.name, status: "Несколько товаров — проверьте" };
    const unitCost = prices[0];
    const code = rows[0][1];
    if (!Number.isFinite(unitCost)) return { ...item, matchedName: item.name, code, status: "Нет цены" };
    if (unitCost > 300000) return { ...item, matchedName: item.name, code, status: "Цена требует проверки" };
    return {
      ...item,
      matchedName: item.name,
      code,
      unitCost,
      totalCost: unitCost * item.qty,
      status: rows.length > 1 ? "Найдено, есть дубликат" : "Найдено",
    };
  }

  function headerName(value) {
    return normalize(value).replace(/\s/g, "");
  }

  function quantity(value) {
    const number = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(number) && number > 0 ? number : 1;
  }

  function parseMatrix(matrix) {
    const rows = matrix.map((row) => Array.from(row || [], (cell) => String(cell ?? "").trim()));
    let headerRow = -1;
    let nameColumn = -1;
    let quantityColumn = -1;

    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
      const headers = rows[rowIndex].map(headerName);
      const found = headers.findIndex((value) => value.includes("наименование"));
      if (found < 0) continue;
      headerRow = rowIndex;
      nameColumn = found;
      quantityColumn = headers.findIndex((value) => value.startsWith("заказ") && value.includes("ед"));
      if (quantityColumn < 0) quantityColumn = headers.findIndex((value) => value.includes("количество"));
      break;
    }

    const parsed = [];
    const dataRows = headerRow >= 0 ? rows.slice(headerRow + 1) : rows;
    for (const row of dataRows) {
      let name;
      let qty = 1;
      if (nameColumn >= 0) {
        name = row[nameColumn];
        if (quantityColumn >= 0) qty = quantity(row[quantityColumn]);
      } else if (row.length <= 1) {
        name = row[0];
      } else {
        name = row.find((value) => value && !/^[-+]?\d+(?:[.,]\d+)?$/.test(value));
        const nameIndex = row.indexOf(name);
        if (nameIndex >= 0 && row[nameIndex + 1]) qty = quantity(row[nameIndex + 1]);
      }
      if (name && normalize(name).length >= 3) parsed.push({ name, qty });
      if (parsed.length >= LIMIT) break;
    }
    return parsed;
  }

  function parseText(text) {
    return parseMatrix(String(text || "").split(/\r?\n/).map((line) => line.split("\t")));
  }

  async function loadXlsx() {
    if (window.XLSX) return window.XLSX;
    await new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = XLSX_URL;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error("не загрузился модуль Excel"));
      document.head.appendChild(tag);
    });
    if (!window.XLSX) throw new Error("не загрузился модуль Excel");
    return window.XLSX;
  }

  async function rowsFromFile(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    if (extension === "csv" || extension === "txt") return parseText(await file.text());
    const XLSX = await loadXlsx();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return parseMatrix(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }));
  }

  async function readMaybeGzip(response) {
    if (!response.ok) throw new Error(`сервер вернул ошибку ${response.status}`);
    const buffer = await response.arrayBuffer();
    const signature = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
    if (signature[0] !== 0x1f || signature[1] !== 0x8b) return buffer;
    if (typeof DecompressionStream === "undefined") throw new Error("браузер не умеет распаковывать справочник");
    return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }

  function splitCsvLine(line) {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (quoted) {
        if (char === '"') {
          if (line[index + 1] === '"') { cell += '"'; index += 1; }
          else quoted = false;
        } else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") { cells.push(cell); cell = ""; }
      else cell += char;
    }
    cells.push(cell);
    return cells;
  }

  function field(row, name) {
    const index = manifest.fields.indexOf(name);
    return index >= 0 ? String(row[index] || "").trim() : "";
  }

  function wordUrl(token) {
    const prefix = [...token.slice(0, manifest.wordPrefix)]
      .map((char) => (/[0-9a-zа-яё]/i.test(char) ? char : "_"))
      .join("");
    return manifest.wordPath.replace("{prefix}", prefix);
  }

  async function loadWord(token) {
    const url = wordUrl(token);
    let table = wordCache.get(url);
    if (!table) {
      const response = await fetch(url, { cache: "force-cache" });
      if (response.status === 404) return [];
      const buffer = await readMaybeGzip(response);
      table = new Map();
      for (const line of utf8.decode(new Uint8Array(buffer)).split("\n")) {
        const tab = line.indexOf("\t");
        if (tab > 0) table.set(line.slice(0, tab), line.slice(tab + 1).split(" "));
      }
      wordCache.set(url, table);
    }
    const codes = table.get(token);
    if (!codes) return [];
    if (!(codes.length === 1 && codes[0] === "@")) return codes;
    const bigUrl = manifest.wordBigPath.replace("{token}", token);
    if (wordCache.has(bigUrl)) return wordCache.get(bigUrl);
    const response = await fetch(bigUrl, { cache: "force-cache" });
    if (response.status === 404) return [];
    const buffer = await readMaybeGzip(response);
    const bigCodes = utf8.decode(new Uint8Array(buffer)).trim().split(" ").filter(Boolean);
    wordCache.set(bigUrl, bigCodes);
    return bigCodes;
  }

  function shardKey(code) {
    return code.slice(-manifest.shardDigits).padStart(manifest.shardDigits, "0");
  }

  async function loadShard(key) {
    if (shardCache.has(key)) return shardCache.get(key);
    const url = manifest.shardPath.replace("{prefix}", key.slice(0, 2)).replace("{key}", key);
    const response = await fetch(url, { cache: "force-cache" });
    if (response.status === 404) return [];
    const buffer = await readMaybeGzip(response);
    const rows = utf8.decode(new Uint8Array(buffer)).split("\n").filter(Boolean).map(splitCsvLine);
    shardCache.set(key, rows);
    return rows;
  }

  function selectedTokens(name) {
    const prefix = normalize(String(name).slice(0, 60));
    const tokens = [...new Set(prefix.match(/[0-9a-zа-яё]{3,}/gi) || [])];
    return tokens
      .sort((left, right) => {
        const leftDigits = /\d/.test(left) ? 1 : 0;
        const rightDigits = /\d/.test(right) ? 1 : 0;
        return rightDigits - leftDigits || right.length - left.length;
      })
      .slice(0, 5);
  }

  async function matchOne(item) {
    const exactMatch = await exactFullNameMatch(item);
    if (exactMatch) return exactMatch;
    const tokens = selectedTokens(item.name);
    if (!tokens.length) return { ...item, status: "Не найдено" };
    const postings = (await Promise.all(tokens.map(loadWord))).filter((codes) => codes.length);
    if (!postings.length) return { ...item, status: "Не найдено" };
    postings.sort((left, right) => left.length - right.length);
    let candidates = postings[0];
    for (const codes of postings.slice(1)) {
      const allowed = new Set(codes);
      const narrowed = candidates.filter((code) => allowed.has(code));
      if (narrowed.length) candidates = narrowed;
    }
    if (candidates.length > 400) candidates = candidates.slice(0, 400);

    const keys = [...new Set(candidates.map(shardKey))];
    const rows = [];
    for (let index = 0; index < keys.length; index += FETCH_CONCURRENCY) {
      const chunks = await Promise.all(keys.slice(index, index + FETCH_CONCURRENCY).map(loadShard));
      chunks.forEach((chunk) => rows.push(...chunk));
    }

    const inputPrefix = normalize(String(item.name).slice(0, 60));
    const inputName = normalize(item.name);
    const exact = rows.filter((row) => {
      const name = normalize(field(row, "Наименование"));
      return name === inputPrefix || inputName === name || inputName.startsWith(`${name} `);
    });
    const products = new Map();
    for (const row of exact) {
      const code = field(row, "Код сайта") || field(row, "Штрихкод");
      if (!products.has(code)) products.set(code, row);
    }
    if (!products.size) return { ...item, status: "Не найдено" };

    const hits = [...products.values()];
    const prices = [...new Set(hits.map((row) => Number(field(row, "Себес").replace(",", "."))).filter(Number.isFinite))];
    if (hits.length > 1 && prices.length > 1) return { ...item, status: "Несколько товаров — проверьте" };

    const hit = hits[0];
    const unitCost = prices[0];
    if (!Number.isFinite(unitCost)) {
      return { ...item, matchedName: field(hit, "Наименование"), code: field(hit, "Код сайта"), status: "Нет цены" };
    }
    if (unitCost > 300000) {
      return { ...item, matchedName: field(hit, "Наименование"), code: field(hit, "Код сайта"), status: "Цена требует проверки" };
    }
    return {
      ...item,
      matchedName: field(hit, "Наименование"),
      code: field(hit, "Код сайта"),
      unitCost,
      totalCost: unitCost * item.qty,
      status: hits.length > 1 ? "Найдено, есть дубликат" : "Найдено",
    };
  }

  function render() {
    body.replaceChildren();
    let found = 0;
    let sum = 0;
    outputRows.forEach((row, index) => {
      const line = document.createElement("tr");
      const ok = Number.isFinite(row.unitCost);
      const warning = row.status !== "Найдено" && row.status !== "Не найдено";
      if (!ok) line.className = warning ? "is-warning" : "is-missing";
      if (ok) { found += 1; sum += row.totalCost; }
      const values = [
        index + 1,
        row.name,
        row.matchedName || "—",
        row.code || "—",
        numberFormat.format(row.qty),
        ok ? `${moneyFormat.format(row.unitCost)} ₽` : "—",
        ok ? `${moneyFormat.format(row.totalCost)} ₽` : "—",
        row.status,
      ];
      values.forEach((value, cellIndex) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if ([0, 3, 4, 5, 6].includes(cellIndex)) cell.classList.add("num");
        if (cellIndex === 7) cell.classList.add(ok ? "costListStatus--ok" : warning ? "costListStatus--warning" : "costListStatus--missing");
        line.appendChild(cell);
      });
      body.appendChild(line);
    });
    $("costListRows").textContent = numberFormat.format(outputRows.length);
    $("costListFound").textContent = numberFormat.format(found);
    $("costListMissing").textContent = numberFormat.format(outputRows.length - found);
    $("costListSum").textContent = `${moneyFormat.format(sum)} ₽`;
    totals.hidden = false;
    results.style.display = "block";
    exportButton.hidden = false;
  }

  async function calculate() {
    const rows = preparedRows || parseText(input.value);
    if (!rows.length) { say("Не вижу наименований. Вставьте список или загрузите Excel.", "warn"); return; }
    preparedRows = rows;
    outputRows = [];
    go.disabled = true;
    fileInput.disabled = true;
    exportButton.hidden = true;
    setProgress(true, 2);
    say(`Проверяю ${rows.length} позиций…`);
    try {
      manifest ||= await fetch(MANIFEST_URL, { cache: "no-cache" }).then((response) => {
        if (!response.ok) throw new Error("не найден справочник Пикалки");
        return response.json();
      });
      for (let index = 0; index < rows.length; index += LOOKUP_CONCURRENCY) {
        const batch = rows.slice(index, index + LOOKUP_CONCURRENCY);
        outputRows.push(...await Promise.all(batch.map(matchOne)));
        const checked = Math.min(rows.length, index + batch.length);
        setProgress(true, 5 + (checked / rows.length) * 95);
        say(`Проверено ${checked} из ${rows.length}…`);
      }
      render();
      const found = outputRows.filter((row) => Number.isFinite(row.unitCost)).length;
      say(`Готово: найдено ${found} из ${outputRows.length}.`, found === outputRows.length ? "ok" : "warn");
    } catch (error) {
      console.error("cost-list calculation failed", error);
      say(`Не удалось посчитать: ${error?.message || error}`, "error");
    } finally {
      go.disabled = false;
      fileInput.disabled = false;
      setProgress(false);
    }
  }

  async function exportExcel() {
    if (!outputRows.length) return;
    try {
      const XLSX = await loadXlsx();
      const rows = outputRows.map((row, index) => ({
        "№": index + 1,
        "Наименование из списка": row.name,
        "Найденный товар": row.matchedName || "",
        "Код сайта": row.code || "",
        "Количество": row.qty,
        "Себес без НДС, ₽/шт": Number.isFinite(row.unitCost) ? row.unitCost : "",
        "Себес всего, ₽": Number.isFinite(row.totalCost) ? row.totalCost : "",
        "Статус": row.status,
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [{ wch: 6 }, { wch: 58 }, { wch: 58 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 28 }];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Себес");
      XLSX.writeFile(book, `Себес по списку ${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      say(`Не удалось скачать Excel: ${error?.message || error}`, "error");
    }
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    say(`Читаю ${file.name}…`);
    try {
      preparedRows = await rowsFromFile(file);
      fileName.textContent = `${file.name} · ${preparedRows.length} строк`;
      input.value = preparedRows.map((row) => `${row.name}\t${row.qty}`).join("\n");
      say(`Файл прочитан: ${preparedRows.length} строк. Нажмите «Получить себес».`, "ok");
    } catch (error) {
      preparedRows = null;
      say(`Не удалось прочитать файл: ${error?.message || error}`, "error");
    }
  });
  input.addEventListener("input", () => { preparedRows = null; });
  go.addEventListener("click", calculate);
  exportButton.addEventListener("click", exportExcel);
  clear.addEventListener("click", () => {
    preparedRows = null;
    outputRows = [];
    input.value = "";
    fileInput.value = "";
    fileName.textContent = "или вставьте список ниже";
    body.replaceChildren();
    totals.hidden = true;
    results.style.display = "none";
    exportButton.hidden = true;
    setProgress(false);
    say("Загрузите файл или вставьте список.");
    input.focus();
  });
})();
