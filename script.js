(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll(".tab")];
  const scan = $("scan");
  const go = $("go");
  const nameSearch = $("nameSearch");
  const goName = $("goName");
  const message = $("message");
  const answer = $("answer");
  const primary = $("primary");
  const primaryLabel = $("primaryLabel");
  const primaryValue = $("primaryValue");
  const secondary = $("secondary");
  const productName = $("productName");
  const productCode = $("productCode");
  const siteLink = $("siteLink");
  const details = $("details");
  const detailsBody = $("detailsBody");
  const nameResults = $("nameResults");
  const nameResultsBody = $("nameResultsBody");
  const connection = $("connection");
  const connectionIcon = $("connectionIcon");
  const connectionTitle = $("connectionTitle");
  const connectionHint = $("connectionHint");
  const progress = $("progress");
  const progressValue = $("progressValue");
  const retry = $("retry");

  const MODES = {
    ucenka: {
      title: "Уценка",
      eyebrow: "Рубрика и себестоимость",
      description: "Сканируйте штрихкод — получите рубрику и себестоимость товара.",
      primary: "Себестоимость",
      extra1: "Рубрика",
      extra2: "Цена",
    },
    presort: {
      title: "Предсорт",
      eyebrow: "Кластер товара",
      description: "Сканируйте штрихкод — получите кластер предсорта.",
      primary: "Кластер",
      extra1: "Рубрика",
      extra2: "Кластер",
    },
    // Отдельный сценарий: не сканирование по одному, а список паллет разом.
    // Поиск живёт в pallets.js, здесь раздел нужен только ради вкладки.
    pallets: {
      title: "Паллеты",
      eyebrow: "Где сейчас паллета",
      description: "Вставьте список паллет — покажу, где каждая лежит и какая стоит не в своей зоне.",
      primary: "",
      extra1: "",
      extra2: "",
      external: true,
    },
  };

  const MANIFEST_URL = "data/v2/manifest.json";
  const MAX_RESULTS = 50;
  // Шард весит десятки килобайт, поэтому в памяти их помещается много.
  const MAX_CACHED_SHARDS = 400;
  // Столько шардов тянем разом, когда собираем результаты поиска по названию.
  const NAME_FETCH_CONCURRENCY = 8;

  const utf8 = new TextDecoder("utf-8");
  const numberFormat = new Intl.NumberFormat("ru-RU");

  const CLUSTER_NAMES = {
    "1": "1 · Расходные материалы",
    "4": "4 · Крупногабаритные",
  };

  // Каталог сайта рубрики переименовал, а витрина 9901_Name осталась на старых
  // названиях: из восемнадцати совпадали дословно только шесть. Подменяем при
  // показе, а не в самих данных — иначе каждое переименование каталога стоило
  // бы пересборки всей базы. На кластеры предсорта это не влияет, они считаются
  // в SQL по исходным названиям.
  const RUBRIC_ALIASES = {
    "Сантехника": "Сантехника и инженерные системы",
    "Товары для офиса и дома": "Офис и дом",
    "Крепеж": "Крепёж и фурнитура",
    "Автогаражное оборудование": "Автотовары",
    "Станки": "Станки и промкомпоненты",
    "Строительные материалы": "Отделочные и стройматериалы",
    "Все для сада": "Всё для сада",
    "Товары для отдыха": "Спорт и туризм",
    "Складское оборудование": "Склад",
    "Клининговое оборудование": "Клининг и химия",
    "Климатическое оборудование": "Климат, отопление и вентиляция",
  };

  let mode = "ucenka";
  let version = 0;
  let busy = false;
  let manifest = null;
  let manifestPromise = null;
  let emptyShards = new Set();
  let aliasEmptyShards = new Set();
  const shardCache = new Map();
  const pendingShards = new Map();
  const aliasCache = new Map();
  const pendingAliases = new Map();
  const wordCache = new Map();
  const pendingWords = new Map();

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
  }

  function setProgress(visible, percent = 0) {
    progress.hidden = !visible;
    progressValue.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function resetResults() {
    answer.style.display = "none";
    details.style.display = "none";
    nameResults.style.display = "none";
    nameResultsBody.replaceChildren();
    scan.value = "";
    nameSearch.value = "";
  }

  function setControls(enabled) {
    scan.disabled = !enabled;
    go.disabled = !enabled;
    nameSearch.disabled = !enabled;
    goName.disabled = !enabled;
    scan.placeholder = enabled ? "Сканируйте штрихкод…" : "Загружаю справочник…";
  }

  function renderStats() {
    $("rowCount").textContent = manifest ? numberFormat.format(manifest.rows) : "—";
    $("partCount").textContent = String(shardCache.size);
    $("readyState").textContent = manifest ? "Готово" : "Загрузка";
  }

  function showReady() {
    connection.className = "connection ready";
    connectionIcon.textContent = "✓";
    connectionTitle.textContent = "Поиск готов";
    connectionHint.textContent = "Скачивается только нужный кусочек базы — обычно меньше 30 КБ.";
    retry.hidden = true;
    setProgress(false);
    $("readyState").textContent = "Готово";
  }

  function showConnectionError(error) {
    connection.className = "connection error";
    connectionIcon.textContent = "!";
    connectionTitle.textContent = "Не удалось загрузить справочник";
    connectionHint.textContent = error?.message || String(error);
    retry.hidden = false;
    setProgress(false);
    $("readyState").textContent = "Ошибка";
  }

  function renderMode() {
    const config = MODES[mode];
    document.body.dataset.mode = mode;
    $("eyebrow").textContent = config.eyebrow;
    $("pageTitle").textContent = config.title;
    $("modeDescription").textContent = config.description;
    $("modePill").textContent = config.title;
    tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.mode === mode)));
    if (config.external) return;

    $("extraHead1").textContent = config.extra1;
    $("extraHead2").textContent = config.extra2;
    primaryLabel.textContent = config.primary;
    renderStats();
  }

  /** Распаковывает ответ, если сервер отдал .gz как есть, а не разжал по дороге. */
  async function readMaybeGzip(response) {
    if (!response.ok) throw new Error(`сервер вернул ошибку ${response.status}`);
    const buffer = await response.arrayBuffer();
    const signature = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
    if (signature[0] !== 0x1f || signature[1] !== 0x8b) return buffer;
    if (typeof DecompressionStream === "undefined") {
      throw new Error("браузер не умеет распаковывать справочник");
    }
    return new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
  }

  async function getManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(MANIFEST_URL, { cache: "no-cache" })
        .then((response) => {
          if (!response.ok) throw new Error("не найден справочник базы");
          return response.json();
        })
        .catch((error) => {
          manifestPromise = null;
          throw error;
        });
    }
    manifest = await manifestPromise;
    emptyShards = new Set(manifest.emptyShards || []);
    aliasEmptyShards = new Set(manifest.aliasEmptyShards || []);
    return manifest;
  }

  async function connect() {
    setControls(false);
    say("Загружаю справочник…");
    setProgress(true, 30);
    try {
      await getManifest();
      renderStats();
      showReady();
      setControls(true);
      say("Готово. Сканируйте штрихкод.", "ok");
      scan.focus();
    } catch (error) {
      setControls(false);
      showConnectionError(error);
      say(`Не удалось загрузить справочник: ${error?.message || error}`, "error");
    }
  }

  function shardKey(barcode) {
    return barcode.slice(-manifest.shardDigits).padStart(manifest.shardDigits, "0");
  }

  function shardUrl(key) {
    return manifest.shardPath.replace("{prefix}", key.slice(0, 2)).replace("{key}", key);
  }

  function rememberShard(key, rows) {
    shardCache.set(key, rows);
    // Map хранит порядок вставки, поэтому первый ключ — самый давний.
    while (shardCache.size > MAX_CACHED_SHARDS) {
      shardCache.delete(shardCache.keys().next().value);
    }
    renderStats();
  }

  async function loadShard(key) {
    if (shardCache.has(key)) return shardCache.get(key);
    if (emptyShards.has(key)) return [];
    if (pendingShards.has(key)) return pendingShards.get(key);

    const task = (async () => {
      const response = await fetch(shardUrl(key), { cache: "force-cache" });
      if (response.status === 404) return [];
      const buffer = await readMaybeGzip(response);
      const rows = parseCsv(utf8.decode(new Uint8Array(buffer)));
      rememberShard(key, rows);
      return rows;
    })();

    pendingShards.set(key, task);
    try {
      return await task;
    } finally {
      pendingShards.delete(key);
    }
  }

  // --- Внутренняя этикетка склада -------------------------------------------
  // Склад печатает свою наклейку «002 <код товара с сайта>» (002 26794532).
  // Такого штрихкода нет ни в одном справочнике: настоящие ШК приходят от
  // поставщика, а эту этикетку склад делает сам, поэтому раньше пикалка на неё
  // молчала. Ищем по ней только после того, как обычный поиск не дал результата:
  // в базе есть полтора десятка настоящих одиннадцатизначных ШК на 002, и
  // перехватывать их нельзя.

  function internalProductCode(barcode) {
    const prefix = manifest?.aliasPrefix || "002";
    if (!manifest?.aliasPath || !barcode.startsWith(prefix)) return "";
    const tail = barcode.slice(prefix.length).replace(/^0+/, "");
    return /^[0-9]{1,8}$/.test(tail) ? tail : "";
  }

  function aliasKey(productCode) {
    const digits = manifest.aliasDigits;
    return productCode.slice(-digits).padStart(digits, "0");
  }

  async function loadAliasShard(key) {
    if (aliasCache.has(key)) return aliasCache.get(key);
    if (aliasEmptyShards.has(key)) return [];
    if (pendingAliases.has(key)) return pendingAliases.get(key);

    const url = manifest.aliasPath
      .replace("{prefix}", key.slice(0, 2))
      .replace("{key}", key);

    const task = (async () => {
      const response = await fetch(url, { cache: "force-cache" });
      if (response.status === 404) return [];
      const buffer = await readMaybeGzip(response);
      const rows = parseCsv(utf8.decode(new Uint8Array(buffer)));
      aliasCache.set(key, rows);
      while (aliasCache.size > MAX_CACHED_SHARDS) {
        aliasCache.delete(aliasCache.keys().next().value);
      }
      return rows;
    })();

    pendingAliases.set(key, task);
    try {
      return await task;
    } finally {
      pendingAliases.delete(key);
    }
  }

  /** Отдаёт настоящий штрихкод товара по внутренней этикетке, либо пустую строку. */
  async function resolveInternalLabel(barcode) {
    const productCode = internalProductCode(barcode);
    if (!productCode) return "";
    const rows = await loadAliasShard(aliasKey(productCode));
    const hit = rows.find((row) => row[0] === productCode);
    return hit ? hit[1] : "";
  }

  function siteUrl(productCode) {
    // Прямой /product/<id>/ отдаёт 404 — карточке нужен slug, а хранить его
    // на каждую из шести миллионов строк дороже, чем оно того стоит. Поиск по
    // коду открывает ту же карточку.
    return `https://www.vseinstrumenti.ru/search/?what=${encodeURIComponent(productCode)}`;
  }

  /** Разбирает шард целиком: строк в нём сотни, экономить на этом больше незачем. */
  function parseCsv(text) {
    const rows = [];
    for (const line of text.split("\n")) {
      if (line) rows.push(splitCsvLine(line.endsWith("\r") ? line.slice(0, -1) : line));
    }
    return rows;
  }

  function splitCsvLine(line) {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (quoted) {
        if (char === '"') {
          if (line[index + 1] === '"') {
            cell += '"';
            index += 1;
          } else quoted = false;
        } else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") {
        cells.push(cell);
        cell = "";
      } else cell += char;
    }
    cells.push(cell);
    return cells;
  }

  function field(row, name) {
    const index = manifest.fields.indexOf(name);
    return index >= 0 ? (row[index] || "").trim() : "";
  }

  function money(value) {
    const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
    if (!normalized) return null;
    const number = Number(normalized);
    if (!Number.isFinite(number)) return null;
    return `${number.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
  }

  function recordFields(row) {
    const cluster = field(row, "Кластер");
    const rubric = field(row, "Рубрика");
    return {
      name: field(row, "Наименование"),
      rubric: RUBRIC_ALIASES[rubric] || rubric,
      price: money(field(row, "Себес")),
      cluster: CLUSTER_NAMES[cluster] || cluster,
    };
  }

  function showHit(row, scannedCode = "") {
    const fields = recordFields(row);
    const code = field(row, "Штрихкод");
    primaryLabel.textContent = MODES[mode].primary;

    if (mode === "ucenka") {
      primaryValue.textContent = fields.price || "нет цены";
      primary.className = `primary${fields.price ? "" : " none"}`;
    } else {
      primaryValue.textContent = fields.cluster || "—";
      primary.className = "primary category";
    }
    secondary.textContent = fields.rubric || "—";
    secondary.className = `secondary${/проверьте/i.test(fields.rubric) ? " check" : ""}`;
    secondary.style.display = "inline-block";

    productName.textContent = fields.name || "—";
    // Сканировали внутреннюю этикетку — показываем обе: человек видит на руках
    // одну, а в базе товар лежит под другой.
    const viaLabel = scannedCode && scannedCode !== code;
    productCode.textContent = viaLabel ? `${scannedCode} → ${code}` : code;
    showSiteLink(field(row, "Код сайта"));
    answer.style.display = "flex";

    detailsBody.replaceChildren();
    manifest.fields.forEach((header, index) => {
      const line = document.createElement("tr");
      const heading = document.createElement("th");
      const cell = document.createElement("td");
      heading.textContent = header;
      // Рубрику и здесь показываем по-каталожному, иначе на одном экране
      // окажется два разных названия одной и той же рубрики.
      cell.textContent = header === "Рубрика" ? fields.rubric : row[index] ?? "";
      line.append(heading, cell);
      detailsBody.appendChild(line);
    });
    details.style.display = "block";
    nameResults.style.display = "none";
    say(viaLabel ? `Найдено по внутренней этикетке: ${code}` : `Найдено: ${code}`, "ok");
  }

  function showSiteLink(productCode) {
    if (!siteLink) return;
    const code = (productCode || "").trim();
    if (!code || code === "0") {
      siteLink.hidden = true;
      return;
    }
    siteLink.href = siteUrl(code);
    siteLink.textContent = `Открыть на сайте · ${code}`;
    siteLink.hidden = false;
  }

  function showNotFound(code) {
    primaryLabel.textContent = MODES[mode].primary;
    primaryValue.textContent = "НЕ НАЙДЕН";
    primary.className = "primary none";
    secondary.style.display = "none";
    productName.textContent = "Штрихкод не найден в справочнике";
    productCode.textContent = code;
    if (siteLink) siteLink.hidden = true;
    answer.style.display = "flex";
    details.style.display = "none";
    nameResults.style.display = "none";
    say(`Не найдено: ${code}`, "error");
  }

  function isSupportedBarcode(value) {
    return /^[0-9]{6,30}$/.test(value);
  }

  async function searchBarcode() {
    const code = scan.value.trim().replace(/^"|"$/g, "");
    if (!code || busy || !manifest) {
      scan.focus();
      return;
    }
    if (!isSupportedBarcode(code)) {
      say("Штрихкод должен состоять минимум из 6 цифр.", "warn");
      scan.focus();
      return;
    }

    const operationVersion = version;
    resetResults();
    scan.value = code;
    busy = true;
    setControls(false);
    setProgress(true, 40);

    try {
      const rows = await loadShard(shardKey(code));
      if (operationVersion !== version) return;
      let hit = rows.find((row) => field(row, "Штрихкод") === code);

      if (!hit) {
        // Не настоящий ШК — возможно, внутренняя этикетка склада.
        const real = await resolveInternalLabel(code);
        if (operationVersion !== version) return;
        if (real) {
          const realRows = await loadShard(shardKey(real));
          if (operationVersion !== version) return;
          hit = realRows.find((row) => field(row, "Штрихкод") === real);
        }
      }

      if (hit) showHit(hit, code);
      else showNotFound(code);
    } catch (error) {
      if (operationVersion !== version) return;
      say(`Не удалось выполнить поиск: ${error?.message || error}`, "error");
      showConnectionError(error);
    } finally {
      if (operationVersion === version) {
        busy = false;
        setControls(true);
        setProgress(false);
        scan.value = "";
        scan.focus();
      }
    }
  }

  function normalizeName(value) {
    return value.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
  }

  function wordUrl(token) {
    const prefix = [...token.slice(0, manifest.wordPrefix)]
      .map((char) => (/[0-9a-zа-яё]/i.test(char) ? char : "_"))
      .join("");
    return manifest.wordPath.replace("{prefix}", prefix);
  }

  /** Скачивает список штрихкодов частого слова — он вынесен в отдельный файл. */
  async function loadBigWord(token) {
    const url = manifest.wordBigPath.replace("{token}", token);
    if (wordCache.has(url)) return wordCache.get(url);
    if (pendingWords.has(url)) return pendingWords.get(url);

    const task = (async () => {
      const response = await fetch(url, { cache: "force-cache" });
      if (response.status === 404) return [];
      const buffer = await readMaybeGzip(response);
      const codes = utf8.decode(new Uint8Array(buffer)).trim().split(" ").filter(Boolean);
      wordCache.set(url, codes);
      return codes;
    })();

    pendingWords.set(url, task);
    try {
      return await task;
    } finally {
      pendingWords.delete(url);
    }
  }

  /** Возвращает таблицу «слово -> штрихкоды» из файла, где это слово лежит. */
  async function loadWords(token) {
    const url = wordUrl(token);
    if (wordCache.has(url)) return wordCache.get(url);
    if (pendingWords.has(url)) return pendingWords.get(url);

    const task = (async () => {
      const response = await fetch(url, { cache: "force-cache" });
      if (response.status === 404) return new Map();
      const buffer = await readMaybeGzip(response);
      const table = new Map();
      for (const line of utf8.decode(new Uint8Array(buffer)).split("\n")) {
        const tab = line.indexOf("\t");
        if (tab > 0) table.set(line.slice(0, tab), line.slice(tab + 1).split(" "));
      }
      wordCache.set(url, table);
      return table;
    })();

    pendingWords.set(url, task);
    try {
      return await task;
    } finally {
      pendingWords.delete(url);
    }
  }

  /** Тянет шарды пачками, чтобы не открывать полсотни запросов разом. */
  async function loadShardsFor(codes, operationVersion, onProgress, isEnough) {
    const keys = [...new Set(codes.map(shardKey))];
    const rowsByCode = new Map();
    for (let index = 0; index < keys.length; index += NAME_FETCH_CONCURRENCY) {
      if (operationVersion !== version) return rowsByCode;
      const batch = keys.slice(index, index + NAME_FETCH_CONCURRENCY);
      const loaded = await Promise.all(batch.map((key) => loadShard(key)));
      for (const rows of loaded) {
        for (const row of rows) rowsByCode.set(field(row, "Штрихкод"), row);
      }
      onProgress?.(Math.min(1, (index + batch.length) / keys.length));
      // Хватит качать, как только набралось на полную выдачу: у частого слова
      // кандидатов тысячи, и без этой остановки поиск тянул бы десятки мегабайт.
      if (isEnough?.(rowsByCode)) break;
    }
    return rowsByCode;
  }

  async function searchByName() {
    const rawQuery = nameSearch.value.trim();
    if (rawQuery.length < 3) {
      say("Введите минимум 3 символа для поиска по наименованию.", "warn");
      nameSearch.focus();
      return;
    }
    if (busy || !manifest) return;

    const needle = normalizeName(rawQuery);
    const tokens = needle.split(" ").filter((word) => word.length >= 3);
    if (!tokens.length) {
      say("Нужно слово хотя бы из трёх букв или цифр.", "warn");
      nameSearch.focus();
      return;
    }

    const operationVersion = version;
    busy = true;
    setControls(false);
    resetResults();
    nameSearch.value = rawQuery;
    setProgress(true, 10);
    say(`Ищу «${rawQuery}»…`);

    try {
      // Пересекаем списки штрихкодов по всем словам запроса: чем больше слов,
      // тем меньше кандидатов и тем меньше кусочков базы придётся скачать.
      const tables = await Promise.all(tokens.map(loadWords));
      if (operationVersion !== version) return;

      const postings = await Promise.all(
        tokens.map((token, index) => {
          const codes = tables[index].get(token);
          // «@» вместо списка — значит слово частое и лежит отдельным файлом.
          return codes?.length === 1 && codes[0] === "@" ? loadBigWord(token) : codes;
        }),
      );
      if (operationVersion !== version) return;

      let candidates = null;
      for (let index = 0; index < tokens.length; index += 1) {
        const codes = postings[index];
        if (!codes) {
          candidates = [];
          break;
        }
        if (!candidates) {
          candidates = codes;
          continue;
        }
        const allowed = new Set(codes);
        const narrowed = candidates.filter((code) => allowed.has(code));
        // Списки обрезаны при сборке, поэтому пересечение бывает пустым даже
        // когда товар есть. Тогда продолжаем с самым коротким списком.
        candidates = narrowed.length ? narrowed
          : (codes.length < candidates.length ? codes : candidates);
      }

      if (!candidates?.length) {
        say(`По наименованию «${rawQuery}» ничего не найдено.`, "error");
        return;
      }

      // Слова ищем в любом порядке: в базе товар записан как «Bosch Перфоратор»,
      // а спрашивают обычно наоборот.
      const matches = (row) => {
        const name = normalizeName(field(row, "Наименование"));
        return tokens.every((token) => name.includes(token));
      };

      setProgress(true, 30);
      const rowsByCode = await loadShardsFor(
        candidates,
        operationVersion,
        (fraction) => setProgress(true, 30 + fraction * 65),
        (loaded) => {
          let ready = 0;
          for (const code of candidates) {
            const row = loaded.get(code);
            if (row && matches(row) && (ready += 1) >= MAX_RESULTS) return true;
          }
          return false;
        },
      );
      if (operationVersion !== version) return;

      const found = [];
      for (const code of candidates) {
        const row = rowsByCode.get(code);
        if (!row || !matches(row)) continue;
        found.push(row);
        if (found.length >= MAX_RESULTS) break;
      }

      if (!found.length) {
        say(`По наименованию «${rawQuery}» ничего не найдено.`, "error");
        return;
      }

      for (const row of found) {
        const fields = recordFields(row);
        const line = document.createElement("tr");
        line.className = "hit";
        const values = [
          field(row, "Штрихкод"),
          fields.name,
          fields.rubric,
          mode === "ucenka" ? fields.price : fields.cluster,
        ];
        values.forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value || "—";
          line.appendChild(cell);
        });
        line.addEventListener("click", () => showHit(row));
        nameResultsBody.appendChild(line);
      }
      nameResults.style.display = "block";
      say(
        `Найдено по наименованию: ${found.length}` +
          `${found.length === MAX_RESULTS ? " (показаны первые 50)" : ""}.`,
        "ok",
      );
    } catch (error) {
      if (operationVersion !== version) return;
      say(`Не удалось выполнить поиск: ${error?.message || error}`, "error");
    } finally {
      if (operationVersion === version) {
        busy = false;
        setControls(true);
        setProgress(false);
        nameSearch.value = rawQuery;
        nameSearch.focus();
      }
    }
  }

  /** Переключение вкладки бесплатно: уценка и предсорт лежат в одном шарде. */
  function switchMode(nextMode) {
    if (!MODES[nextMode] || nextMode === mode) return;
    const shown = productCode.textContent.trim();
    mode = nextMode;
    renderMode();
    // У паллет своя карточка и свой поиск — здесь делать нечего.
    if (MODES[mode].external) return;
    if (!manifest) return;

    resetResults();
    setControls(true);
    // Показанный товар перерисовываем под новый раздел, не заставляя сканировать заново.
    if (isSupportedBarcode(shown)) {
      scan.value = shown;
      searchBarcode();
    } else {
      say("Готово. Сканируйте штрихкод.", "ok");
      scan.focus();
    }
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => switchMode(tab.dataset.mode)));
  retry.addEventListener("click", connect);
  go.addEventListener("click", searchBarcode);
  goName.addEventListener("click", searchByName);
  scan.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      searchBarcode();
    }
  });
  nameSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchByName();
    }
  });
  document.addEventListener("click", (event) => {
    // В разделе паллет курсор должен оставаться в поле списка, а не убегать
    // обратно в сканер.
    if (MODES[mode].external) return;
    const insideNameSearch =
      event.target === nameSearch || event.target === goName || nameResults.contains(event.target);
    const insideTabs = tabs.some((tab) => tab.contains(event.target));
    if (!scan.disabled && event.target !== go && !insideNameSearch && !insideTabs) {
      setTimeout(() => scan.focus(), 0);
    }
  });

  renderMode();
  connect();
})();
