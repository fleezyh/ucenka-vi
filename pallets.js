(() => {
  "use strict";

  // Реестр всех паллет с остатком: куда какая встала по факту. Прежняя выгрузка
  // по согласованным ячейкам видела 619 паллет из семидесяти с лишним тысяч —
  // а искали как раз те, что лежат не там, где положено, и потому в неё не
  // попадали. Файл целиком меньше полутора мегабайт, поэтому грузим разом,
  // без нарезки на кусочки, как сделано для базы штрихкодов.
  const DATA_URL = "data/pallets.csv.gz";
  const STAMP_URL = "data/pallets-stamp.json";
  const MAX_SHOWN = 300;

  const $ = (id) => document.getElementById(id);
  const input = $("palletInput");
  const goButton = $("palletGo");
  const clearButton = $("palletClear");
  const message = $("palletMessage");
  const results = $("palletResults");
  const resultsBody = $("palletResultsBody");
  const missingBlock = $("palletMissing");
  const missingList = $("palletMissingList");
  const stampNote = $("palletStamp");

  if (!input) return;

  const utf8 = new TextDecoder("utf-8");
  const numberFormat = new Intl.NumberFormat("ru-RU");

  let registry = null;
  let loading = null;
  let columns = [];

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
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

  /** Ключ поиска: регистр и лишние пробелы в списках приходят как попало. */
  function key(name) {
    return name.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  }

  async function loadRegistry() {
    if (registry) return registry;
    if (loading) return loading;

    loading = (async () => {
      say("Загружаю реестр паллет…");
      const response = await fetch(DATA_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(`сервер вернул ошибку ${response.status}`);
      const buffer = await response.arrayBuffer();

      let raw = buffer;
      const signature = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
      if (signature[0] === 0x1f && signature[1] === 0x8b) {
        if (typeof DecompressionStream === "undefined") {
          throw new Error("браузер не умеет распаковывать реестр");
        }
        raw = await new Response(
          new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer();
      }

      const lines = utf8.decode(new Uint8Array(raw)).split("\n");
      columns = splitCsvLine(lines[0]);
      const table = new Map();
      for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line) continue;
        const cells = splitCsvLine(line.endsWith("\r") ? line.slice(0, -1) : line);
        const name = (cells[0] || "").trim();
        if (!name) continue;
        // Одна паллета может стоять в нескольких ячейках — храним все места.
        const found = table.get(key(name));
        if (found) found.push(cells);
        else table.set(key(name), [cells]);
      }
      registry = table;
      return table;
    })().catch((error) => {
      loading = null;
      throw error;
    });

    return loading;
  }

  function loadStamp() {
    fetch(STAMP_URL, { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((stamp) => {
        if (!stamp) return;
        stampNote.textContent =
          `В реестре ${numberFormat.format(stamp["паллет"])} паллет с остатком. ` +
          `Обновлено ${stamp["обновлено"]}.`;
      })
      .catch(() => {});
  }

  /** Режет вставленный список на имена: строки, табы, точка с запятой. */
  function parseNames(text) {
    const names = [];
    const seen = new Set();
    for (const piece of text.split(/[\r\n;\t]+/)) {
      const name = piece.trim();
      if (!name || seen.has(key(name))) continue;
      seen.add(key(name));
      names.push(name);
    }
    return names;
  }

  function money(value) {
    const number = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(number)) return "—";
    return `${Math.round(number).toLocaleString("ru-RU")} ₽`;
  }

  function count(value) {
    const number = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(number) ? numberFormat.format(Math.round(number)) : "—";
  }

  function renderRow(cells) {
    const line = document.createElement("tr");
    const inZone = (cells[8] || "").trim().toLowerCase() === "да";
    if (!inZone) line.className = "hit hit--warn";

    const values = [
      cells[0],
      cells[1],
      cells[2],
      cells[3],
      count(cells[4]),
      count(cells[5]),
      money(cells[6]),
      cells[7] || "—",
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value || "—";
      if (index >= 4 && index <= 6) cell.className = "num";
      line.appendChild(cell);
    });

    if (!inZone) {
      // Ради этого признака инструмент и делался: видно, что паллета встала не
      // в зону уценки, а, скажем, в «Обнаруженные комплектацией ошибки».
      line.title = "Паллета не в зоне уценки — стоит проверить";
      line.children[2].textContent = `${cells[2]} ⚠`;
    }
    return line;
  }

  async function search() {
    const names = parseNames(input.value);
    if (!names.length) {
      say("Вставьте список паллет — по одной в строке.", "warn");
      input.focus();
      return;
    }

    goButton.disabled = true;
    try {
      const table = await loadRegistry();
      const found = [];
      const missing = [];
      for (const name of names) {
        const rows = table.get(key(name));
        if (rows) found.push(...rows);
        else missing.push(name);
      }

      resultsBody.replaceChildren();
      for (const cells of found.slice(0, MAX_SHOWN)) {
        resultsBody.appendChild(renderRow(cells));
      }
      results.style.display = found.length ? "block" : "none";

      if (missing.length) {
        missingList.textContent = missing.join(", ");
        missingBlock.hidden = false;
      } else {
        missingBlock.hidden = true;
      }

      const misplaced = found.filter(
        (cells) => (cells[8] || "").trim().toLowerCase() !== "да",
      ).length;

      if (!found.length) {
        say(`Ни одна из ${names.length} паллет не найдена в реестре.`, "error");
      } else {
        const parts = [`Найдено ${found.length} из ${names.length}`];
        if (misplaced) parts.push(`не в зоне уценки: ${misplaced}`);
        if (missing.length) parts.push(`не нашлось: ${missing.length}`);
        say(`${parts.join(" · ")}.`, misplaced ? "warn" : "ok");
      }
    } catch (error) {
      say(`Не удалось загрузить реестр: ${error?.message || error}`, "error");
    } finally {
      goButton.disabled = false;
    }
  }

  goButton.addEventListener("click", search);
  clearButton.addEventListener("click", () => {
    input.value = "";
    resultsBody.replaceChildren();
    results.style.display = "none";
    missingBlock.hidden = true;
    say("Вставьте список паллет и нажмите «Найти».");
    input.focus();
  });
  // Ctrl+Enter — привычное «отправить» для многострочного поля.
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      search();
    }
  });

  loadStamp();
})();
