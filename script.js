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
  const copyName = $("copyName");
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
  const pickerTabs = document.querySelector(".pickerTabs");
  const pickerLens = document.querySelector(".pickerTabs__lens");
  const modeLayout = document.querySelector(".layout");

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
    costlist: {
      title: "Себес списком",
      eyebrow: "Массовый расчёт",
      description: "Загрузите Excel или вставьте номенклатуру — получите себес каждой позиции и сумму заказа.",
      primary: "",
      extra1: "",
      extra2: "",
      external: true,
    },
    // Отдельный сценарий: не сканирование по одному, а список паллет разом.
    // Поиск живёт в pallets.js, здесь раздел нужен только ради вкладки.
    dorogie: {
      title: "Дорогие",
      eyebrow: "Отбор для площадок",
      description: "Что стоит вынуть из паллет и продать поштучно: товар дороже порога и место, где он лежит.",
      primary: "",
      extra1: "",
      extra2: "",
      external: true,
    },
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
  // Габариты лежат отдельной базой: они нужны одной строке ответа, а
  // пересборка основной базы — это десять тысяч файлов. Манифест тянем не при
  // запуске, а при первом же найденном товаре: если человек ничего не сканирует,
  // качать нечего.
  let dimsManifest = null;
  let dimsManifestPromise = null;
  const dimsCache = new Map();
  const pendingDims = new Map();
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
    const built = $("builtAt");
    // builtAt в манифесте — «2026-09-18 19:40:12»; показываем только дату,
    // время сборки на складе никого не интересует.
    if (built) built.textContent = manifest?.builtAt
      ? String(manifest.builtAt).slice(0, 10).split("-").reverse().join(".")
      : "—";
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
    requestAnimationFrame(updatePickerLens);
    if (config.external) return;

    $("extraHead1").textContent = config.extra1;
    $("extraHead2").textContent = config.extra2;
    primaryLabel.textContent = config.primary;
    renderStats();
  }

  function updatePickerLens() {
    const selected = pickerTabs?.querySelector('.tab[aria-selected="true"]');
    if (!pickerTabs || !pickerLens || !selected) return;
    const hostRect = pickerTabs.getBoundingClientRect();
    const tabRect = selected.getBoundingClientRect();
    pickerTabs.style.setProperty("--picker-lens-x", `${tabRect.left - hostRect.left}px`);
    pickerTabs.style.setProperty("--picker-lens-width", `${tabRect.width}px`);
    pickerTabs.classList.add("is-ready");
  }

  function animateModeLayout() {
    if (!modeLayout) return;
    modeLayout.classList.remove("is-entering");
    requestAnimationFrame(() => modeLayout.classList.add("is-entering"));
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
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) scan.focus();
    } catch (error) {
      setControls(false);
      showConnectionError(error);
      say(`Не удалось загрузить справочник: ${error?.message || error}`, "error");
    }
  }

  function shardKey(barcode) {
    return barcode.slice(-manifest.shardDigits).padStart(manifest.shardDigits, "0");
  }

  /* Метка сборки в адресе файла.
   *
   * Кусочки базы лежат в кэше браузера «навсегда» — это и задумано, они не
   * меняются между сборками. Но сборка теперь еженедельная, и без метки
   * пикалка у того, кто ей уже пользовался, осталась бы на старой базе
   * насовсем: новых товаров нет, цены прошлые. Метка меняется раз в неделю,
   * вместе с базой, и ровно тогда браузер и качает кусочек заново. */
  function sMetkoy(url, builtAt) {
    return builtAt ? `${url}?v=${encodeURIComponent(builtAt)}` : url;
  }

  function shardUrl(key) {
    return sMetkoy(
      manifest.shardPath.replace("{prefix}", key.slice(0, 2)).replace("{key}", key),
      manifest.builtAt);
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

    const url = sMetkoy(manifest.aliasPath
      .replace("{prefix}", key.slice(0, 2))
      .replace("{key}", key), manifest.aliasBuiltAt || manifest.builtAt);

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

  // --- Габариты -------------------------------------------------------------
  // Порог, с которого товар считается крупным. Взят из замера 18.09.2026:
  // у позиций перечня КГТ средняя максимальная сторона 1387 мм и средний вес
  // 66 кг, у остальных — 322–604 мм и 12–36 кг. Полутора метров и тридцати
  // килограммов достаточно, чтобы отделить одно от другого; точную границу
  // склад ещё уточнит, поэтому она здесь одной строкой.
  const KRUPNYY_MM = 1500;
  const KRUPNYY_KG = 30;

  async function loadDimsManifest() {
    if (dimsManifest) return dimsManifest;
    if (!dimsManifestPromise) {
      dimsManifestPromise = fetch("data/dims/manifest.json", { cache: "no-cache" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    dimsManifest = await dimsManifestPromise;
    return dimsManifest;
  }

  async function loadDims(barcode) {
    const info = await loadDimsManifest();
    if (!info) return null;
    const digits = info.shardDigits || 4;
    const key = barcode.slice(-digits).padStart(digits, "0");
    if (!dimsCache.has(key) && !pendingDims.has(key)) {
      const url = sMetkoy(
        info.path.replace("{prefix}", key.slice(0, 2)).replace("{key}", key),
        info.builtAt);
      const task = (async () => {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) return [];
        const buffer = await readMaybeGzip(response);
        const rows = parseCsv(utf8.decode(new Uint8Array(buffer)));
        dimsCache.set(key, rows);
        while (dimsCache.size > MAX_CACHED_SHARDS) {
          dimsCache.delete(dimsCache.keys().next().value);
        }
        return rows;
      })();
      pendingDims.set(key, task);
      try { await task; } finally { pendingDims.delete(key); }
    }
    const rows = dimsCache.get(key) || (await pendingDims.get(key)) || [];
    const hit = rows.find((row) => row[0] === barcode);
    if (!hit) return null;
    const [, dlina, shirina, vysota, ves, poImeni] = hit;
    const number = (value) => {
      const result = Number(String(value || "").replace(",", "."));
      return Number.isFinite(result) && result > 0 ? result : 0;
    };
    return {
      dlina: number(dlina), shirina: number(shirina),
      vysota: number(vysota), ves: number(ves),
      // Длина, вычитанная из названия при сборке. Стоит, только когда карточка
      // заметно меньше, — то есть когда ей верить нельзя.
      poImeni: number(poImeni),
    };
  }

  /* Строка с габаритами и сверка с кластером.
   *
   * Логика кластеров не меняется — её ставит справочник по рубрике. Здесь
   * только сверка: показать цифры и сказать, когда они с кластером спорят.
   * Оператор смотрит на товар и решает сам, а кнопка «Это КГТ / Это не КГТ»
   * рядом уже умеет отправить расхождение. */
  const razmeryBox = document.getElementById("razmery");
  // 26.09: сверка с кластером — своей строкой под кластером, а сами размеры —
  // в ряду фактов справа. Раньше всё было одной строкой.
  const proverkaBox = document.getElementById("razmerProverka");

  async function showRazmery(barcode, cluster) {
    if (!razmeryBox) return;
    razmeryBox.hidden = true;
    if (proverkaBox) proverkaBox.hidden = true;
    // Запоминаем номер операции, но не трогаем сам счётчик: его ведёт поиск, и
    // лишний инкремент здесь оборвал бы его собственную загрузку шардов.
    const moy = version;
    const dims = await loadDims(barcode);
    if (moy !== version || !dims) return;

    const storony = [dims.dlina, dims.shirina, dims.vysota].filter(Boolean);
    const maks = storony.length ? Math.max(...storony) : 0;
    // Больше шести метров — мусор в карточке: в базе попадаются стороны по
    // семьсот метров, и показывать их как габарит нельзя.
    const chisto = maks > 0 && maks <= 6000;
    const chasti = [];
    if (storony.length === 3) {
      chasti.push(`${dims.dlina}×${dims.shirina}×${dims.vysota} мм`);
    } else if (chisto) {
      chasti.push(`${maks} мм`);
    }
    if (dims.ves) chasti.push(`${dims.ves.toLocaleString("ru-RU")} кг`);
    if (!chasti.length) return;

    // Длина из названия приходит уже посчитанной и только тогда, когда
    // карточка заметно меньше: у полосы ECO в карточке 270 мм при реальных
    // 2,7 метра. Считать это на месте нельзя — имя в базе обрезано до
    // шестидесяти знаков, и метраж в него не влезает.
    const zanizheno = dims.poImeni > 0;
    if (zanizheno) {
      chasti.push(`в названии ${(dims.poImeni / 1000).toLocaleString("ru-RU")} м — карточка занижена`);
    }

    const krupnyy = (chisto && maks >= KRUPNYY_MM)
                 || dims.ves >= KRUPNYY_KG
                 || dims.poImeni >= KRUPNYY_MM;
    let spor = "";
    if (cluster === "4" && !krupnyy) {
      spor = " · по размерам на крупногабарит не тянет";
    } else if (cluster && cluster !== "4" && krupnyy) {
      spor = " · по размерам это крупногабарит";
    }

    if (proverkaBox) {
      razmeryBox.textContent = chasti.join(" · ");
      razmeryBox.className = `razmery${zanizheno ? " razmery--spor" : ""}`;
      if (cluster) {
        proverkaBox.textContent = spor ? spor.replace(/^ · /, "") : "по размерам сходится";
        proverkaBox.className = `razmerProverka ${spor ? "is-spor" : "is-ok"}`;
        proverkaBox.hidden = false;
      }
    } else {
      razmeryBox.textContent = chasti.join(" · ") + spor;
      razmeryBox.className = `razmery${spor || zanizheno ? " razmery--spor" : ""}`;
    }
    razmeryBox.hidden = false;
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
      // РРЦ появилась в базе 18.09.2026; у прежних сборок поля нет, и
      // field вернёт пустую строку — строка просто не покажется.
      rrc: money(field(row, "РРЦ")),
      cluster: CLUSTER_NAMES[cluster] || cluster,
    };
  }

  /* Розничная цена под себестоимостью.
   *
   * Показываем и наценку к себесу: «в 1,8 раза» отвечает на вопрос, который
   * задают следом за ценой, — сколько на товаре вообще заложено. */
  const rrcLine = document.getElementById("rrcLine");

  function showRrc(row, fields) {
    if (!rrcLine) return;
    if (!fields.rrc) {
      rrcLine.hidden = true;
      return;
    }
    const sebes = Number(String(field(row, "Себес") || "").replace(/\s/g, "").replace(",", "."));
    const rrc = Number(String(field(row, "РРЦ") || "").replace(/\s/g, "").replace(",", "."));
    const nacenka = Number.isFinite(sebes) && sebes > 0 && Number.isFinite(rrc) && rrc > 0
      ? `в ${(rrc / sebes).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} раза к себесу`
      : "";
    // 26.09: карточка плитками — цена крупно, наценка строкой ниже.
    const summa = document.createElement("b");
    summa.textContent = fields.rrc;
    rrcLine.replaceChildren(summa);
    if (nacenka) {
      const pod = document.createElement("span");
      pod.textContent = nacenka;
      rrcLine.append(pod);
    }
    rrcLine.hidden = false;
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
    showCopyButton(Boolean(fields.name));
    showRrc(row, fields);
    lastOtbor = showOtbor(row);
    showKgtButton(row, fields);
    // Актировка с предсорта (akt-predsort.js) слушает пик и рисует решения.
    document.dispatchEvent(new CustomEvent("picker:hit", { detail: { mode, barcode: code,
      name: fields.name, rubric: fields.rubric, cluster: fields.cluster, price: fields.price,
      kod: field(row, "Код сайта") } }));
    showSiteLink(field(row, "Код сайта"));
    // Габариты приезжают отдельным запросом, поэтому карточку не ждём: строка
    // появится под кодом товара, когда придёт.
    showRazmery(code, field(row, "Кластер"));
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

  /* Копирование наименования.
   *
   * Название нужно переносить в акт руками, а выделять его мышью на складском
   * компьютере неудобно. Кнопка рядом с названием избавляет от клавиатуры
   * совсем — ровно ради этого Пикалка и заводилась.
   *
   * Сначала идёт старый приём со скрытым полем, и только потом clipboard API.
   * Порядок именно такой: старый способ синхронный и укладывается внутрь клика,
   * а clipboard API асинхронный — после первого же `await` браузер считает, что
   * пользовательского жеста больше нет, и запись в буфер отклоняет.
   */
  function copySync(text) {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(box);
    const kept = window.getSelection().rangeCount ? window.getSelection().getRangeAt(0) : null;
    box.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    box.remove();
    // Скрытое поле забрало выделение себе — возвращаем человеку его.
    if (kept) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(kept);
    }
    return ok;
  }

  async function copyText(text) {
    if (copySync(text)) return true;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch { /* и так не вышло */ }
    }
    return false;
  }

  let copyTimer = 0;

  /* Подходит ли товар под отбор на площадки.
   *
   * Пока критерий один: себестоимость от пятидесяти тысяч. Такая штука на
   * Авито окупается на 70–90%, а внутри паллеты уходит оптом за 12–14%.
   * Остальные условия — габариты, проверка ДВК, нижняя граница для
   * маркетплейса — ещё не устоялись, и городить из них светофор рано.
   */
  const OTBOR_PORT = 50000;

  function otbor(row) {
    const raw = String(field(row, "Себес") || "").replace(/\s/g, "").replace(",", ".");
    const price = Number(raw);
    if (!Number.isFinite(price) || price <= 0) return null;
    if (price < OTBOR_PORT) return null;
    return { вид: "авито", текст: "Дороже 50 тысяч — отбирать на площадку поштучно" };
  }

  const otborBox = document.getElementById("otborMark");
  let lastOtbor = null;

  function showOtbor(row) {
    if (!otborBox) return null;
    const итог = otbor(row);
    otborBox.hidden = !итог;
    if (!итог) return null;
    otborBox.textContent = итог.текст;
    otborBox.className = `otborMark is-${итог.вид}`;
    return итог;
  }

  /* Кнопка «Это не КГТ» и обратная ей «Это КГТ».
   *
   * Справочник относит товар к четвёртому кластеру — крупногабаритным, — а
   * кладовщик держит коробку в руках и видит, что она обычная. Раньше сказать
   * об этом было некуда: ручка на сервере есть с самого начала, а кнопки в
   * пикалке не было, и за всё время не пришло ни одной отметки.
   *
   * Обратный случай не реже: товар числится обычным, а на деле его вдвоём
   * носят. И ошибается он дороже — такой товар уходит в отбор на маркетплейс,
   * который крупногабарит не берёт, и возвращается обратно. Поэтому кнопка
   * есть в обе стороны, а какая именно — решает кластер товара.
   *
   * Только в предсорте: там кластер и есть предмет работы. В уценке человек
   * смотрит себестоимость, и кнопка про габариты там не к месту. */
  const kgtMark = document.getElementById("kgtMark");
  let kgtPayload = null;

  function showKgtButton(row, fields) {
    if (!kgtMark) return;
    const cluster = String(field(row, "Кластер") || "").trim();
    // Без кластера сравнивать не с чем: справочник про габариты молчит.
    const estKlaster = mode === "presort" && cluster !== "";
    const bolshoy = cluster === "4";
    kgtMark.hidden = !estKlaster;
    kgtMark.disabled = false;
    kgtMark.textContent = bolshoy ? "Это не КГТ" : "Это КГТ";
    kgtMark.classList.toggle("kgtBtn--kgt", estKlaster && !bolshoy);
    kgtMark.classList.remove("is-done");
    kgtPayload = estKlaster ? {
      barcode: field(row, "Штрихкод"),
      name: fields.name,
      rubric: fields.rubric,
      cluster,
      says: bolshoy ? "КГТ" : "не КГТ",
      human: bolshoy ? "не КГТ" : "КГТ",
      at: new Date().toISOString(),
    } : null;
  }

  if (kgtMark) {
    kgtMark.addEventListener("click", async () => {
      if (!kgtPayload) return;
      kgtMark.disabled = true;
      try {
        const response = await fetch("/__kgt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(kgtPayload),
        });
        if (!response.ok) throw new Error(String(response.status));
        kgtMark.textContent = "Отметка отправлена";
        kgtMark.classList.add("is-done");
      } catch {
        kgtMark.textContent = "Не отправилось, попробуйте ещё раз";
        kgtMark.disabled = false;
      }
    });
  }

  function showCopyButton(visible) {
    if (!copyName) return;
    copyName.hidden = !visible;
    if (!visible) return;
    clearTimeout(copyTimer);
    copyName.classList.remove("is-done", "is-failed");
    copyName.querySelector(".copyBtn__text").textContent = "Копировать";
  }

  if (copyName) {
    copyName.addEventListener("click", async () => {
      const text = productName.textContent.trim();
      if (!text || text === "—") return;
      const ok = await copyText(text);
      const label = copyName.querySelector(".copyBtn__text");
      copyName.classList.toggle("is-done", ok);
      copyName.classList.toggle("is-failed", !ok);
      label.textContent = ok ? "Скопировано" : "Не вышло";
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyName.classList.remove("is-done", "is-failed");
        label.textContent = "Копировать";
      }, 1600);
    });
  }

  function showLoadFailed(code) {
    primaryLabel.textContent = MODES[mode].primary;
    primaryValue.textContent = "НЕ ПРОВЕРЕН";
    primary.className = "primary none";
    secondary.style.display = "none";
    productName.textContent = "Справочник не ответил — это не значит, что товара нет";
    productCode.textContent = code;
    showCopyButton(false);
    if (kgtMark) kgtMark.hidden = true;
    document.dispatchEvent(new CustomEvent("picker:miss"));
    if (otborBox) otborBox.hidden = true;
    if (siteLink) siteLink.hidden = true;
    answer.style.display = "flex";
    details.style.display = "none";
    nameResults.style.display = "none";
  }

  function showNotFound(code) {
    primaryLabel.textContent = MODES[mode].primary;
    primaryValue.textContent = "НЕ НАЙДЕН";
    primary.className = "primary none";
    secondary.style.display = "none";
    productName.textContent = "Штрихкод не найден в справочнике";
    productCode.textContent = code;
    showCopyButton(false);
    if (kgtMark) kgtMark.hidden = true;
    document.dispatchEvent(new CustomEvent("picker:miss"));
    if (otborBox) otborBox.hidden = true;
    if (siteLink) siteLink.hidden = true;
    answer.style.display = "flex";
    details.style.display = "none";
    nameResults.style.display = "none";
    say(`Не найдено: ${code}`, "error");
  }

  function isSupportedBarcode(value) {
    return /^[0-9]{6,30}$/.test(value);
  }

  /* Что человек сканировал и нашлось ли это.
   *
   * Ненайденные штрихкоды нужны не меньше найденных: по ним видно, чего в
   * справочнике не хватает, а не только то, что люди «жалуются». Если сервер
   * сейчас недоступен — а так бывает, пока адрес не переехал у всех, — записи
   * копятся в браузере и уезжают при первом удачном заходе.
   */
  const PICK_QUEUE_KEY = "picks-queue";

  function queuePick(pick) {
    try {
      const queue = JSON.parse(localStorage.getItem(PICK_QUEUE_KEY) || "[]");
      queue.push(pick);
      localStorage.setItem(PICK_QUEUE_KEY, JSON.stringify(queue.slice(-500)));
    } catch { /* переполнено — молча пропускаем */ }
  }

  async function sendPick(pick) {
    const response = await fetch("/__pick", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pick),
      keepalive: true,
    });
    if (!response.ok) throw new Error(String(response.status));
  }

  /* Цена и наименование идут в историю вместе со сканированием.
   *
   * Раньше в журнале был только штрихкод, и вопрос «дорогое что-нибудь
   * попадалось?» ответа не имел: по голому коду не понять, стеллаж это за
   * двадцать пять тысяч или саморез. Теперь всё, что дороже порога, само
   * встаёт в отдельный список в админке — искать и отмечать руками не нужно. */
  function recordPick(barcode, found, row = null) {
    const pick = { barcode, found, mode, at: new Date().toISOString() };
    if (row) {
      const raw = String(field(row, "Себес") || "").replace(/\s/g, "").replace(",", ".");
      const price = Number(raw);
      if (Number.isFinite(price) && price > 0) pick.price = price;
      pick.name = field(row, "Наименование") || "";
      // Вердикт по отбору пишем вместе со сканом: потом видно не только «что
      // смотрели», но и «что из этого стоило вынуть на площадку».
      const вердикт = otbor(row);
      if (вердикт) pick.otbor = вердикт.вид;
    }
    sendPick(pick).catch(() => queuePick(pick));
  }

  async function flushPicks() {
    let queue;
    try {
      queue = JSON.parse(localStorage.getItem(PICK_QUEUE_KEY) || "[]");
    } catch {
      return;
    }
    if (!queue.length) return;
    const left = [];
    for (const pick of queue) {
      try { await sendPick(pick); } catch { left.push(pick); }
    }
    try { localStorage.setItem(PICK_QUEUE_KEY, JSON.stringify(left)); } catch { /* не влезло */ }
  }

  async function searchBarcode() {
    const code = scan.value.trim().replace(/^"|"$/g, "");
    // Наклейка стола (CEL + id ячейки, 26.09): это не товар, а смена стола —
    // актировка (akt-predsort.js) показывает решения этого стола.
    if (/^CEL\d{5,10}$/i.test(code)) {
      scan.value = "";
      document.dispatchEvent(new CustomEvent("picker:stol", { detail: { kod: code } }));
      scan.focus();
      return;
    }
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
      recordPick(code, Boolean(hit), hit);
    } catch (error) {
      if (operationVersion !== version) return;
      say("Не получилось скачать кусочек справочника — товар не проверен. "
          + "Отсканируйте ещё раз.", "error");
      showLoadFailed(code);
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
    return sMetkoy(manifest.wordPath.replace("{prefix}", prefix), manifest.builtAt);
  }

  /** Скачивает список штрихкодов частого слова — он вынесен в отдельный файл. */
  async function loadBigWord(token) {
    const url = sMetkoy(manifest.wordBigPath.replace("{token}", token), manifest.builtAt);
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
    animateModeLayout();
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
  window.addEventListener("resize", updatePickerLens);
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
  /** Выделил ли человек прямо сейчас кусок текста на странице. */
  function hasSelection() {
    const selection = window.getSelection();
    return Boolean(selection && !selection.isCollapsed && String(selection).trim());
  }

  /* Сканер стреляет цифрами туда, где сейчас курсор.
   *
   * Раньше поле сканера держали в фокусе силой — из-за этого нельзя было ни
   * выделить название, ни нажать кнопку. Теперь наоборот: курсор отпускаем, но
   * цифры ловим сами. Куда бы человек ни кликнул, отсканированный код всё равно
   * попадёт в поле и найдётся.
   */
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (!/^[0-9]$/.test(event.key)) return;
    if (MODES[mode].external || scan.disabled) return;
    const target = event.target;
    if (target.matches("input, textarea, select") || target.isContentEditable) return;
    event.preventDefault();
    scan.focus();
    scan.value += event.key;
  });

  document.addEventListener("click", (event) => {
    // Touch scrolling and navigation must not summon the scanner keyboard.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (event.target.closest("a, button, select, textarea, input, summary")) return;
    // В разделе паллет курсор должен оставаться в поле списка, а не убегать
    // обратно в сканер.
    if (MODES[mode].external) return;
    // Название и штрихкод из карточки переносят в акт мышью. Возврат фокуса в
    // сканер снимал выделение ровно в тот момент, когда человек отпускал
    // кнопку, — скопировать было почти невозможно.
    if (hasSelection()) return;
    const insideNameSearch =
      event.target === nameSearch || event.target === goName || nameResults.contains(event.target);
    const insideTabs = tabs.some((tab) => tab.contains(event.target));
    if (!scan.disabled && event.target !== go && !insideNameSearch && !insideTabs) {
      setTimeout(() => { if (!hasSelection()) scan.focus(); }, 0);
    }
  });

  renderMode();
  connect();
  flushPicks();
})();
