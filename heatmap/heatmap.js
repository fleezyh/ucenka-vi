(() => {
  "use strict";

  // Плитки считает «09 — Хитмап уценки на сайт.py» тем же запросом, что и чарт
  // в Superset: цвета, отклонения и точки графика приходят готовыми. Здесь
  // только отрисовка — ровно то, что раньше делал шаблон Handlebars.
  const DATA_URL = "../data/heatmap.json";

  const $ = (id) => document.getElementById(id);
  const message = $("message");
  const tiles = $("tiles");
  const periodSelect = $("period");
  const stamp = $("stamp");

  let payload = null;

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
    message.style.display = text ? "block" : "none";
  }

  /** Плитка целиком: шапка, число, мини-график по четырём точкам, подпись. */
  function renderTile(tile) {
    const cell = document.createElement("div");
    cell.className = `hu-cell u-${tile.metric_key || ""}`;
    cell.style.backgroundColor = tile.bg_color || "#7d8794";

    const aur = document.createElement("span");
    aur.className = "hu-aur";

    const head = document.createElement("div");
    head.className = "hu-head";
    const name = document.createElement("div");
    name.className = "hu-name";
    name.textContent = tile.metric || "";
    const icon = document.createElement("div");
    icon.className = "hu-icon";
    icon.textContent = tile.block_name || "";
    head.append(name, icon);

    const foot = document.createElement("div");
    foot.className = "hu-foot";

    const value = document.createElement("div");
    value.className = "hu-val";
    value.append(document.createTextNode(tile.fact_txt ?? ""));
    if (tile.val2_txt) {
      const second = document.createElement("span");
      second.className = "hu-val2";
      second.textContent = tile.val2_txt;
      value.appendChild(second);
    }

    const plot = document.createElement("div");
    plot.className = "hu-plot";
    const area = document.createElement("span");
    area.className = "hu-area";
    if (tile.clip_area) area.style.clipPath = tile.clip_area;
    plot.appendChild(area);

    // Четыре точки: три прошлых периода и текущий. Классы второй и третьей
    // приходят из запроса — ими он гасит точки, которых ещё нет.
    const points = [
      { x: tile.x1, y: tile.y1, text: tile.t1, cls: "hu-dot" },
      { x: tile.x2, y: tile.y2, text: tile.t2, cls: tile.cls2 || "hu-dot" },
      { x: tile.x3, y: tile.y3, text: tile.t3, cls: tile.cls3 || "hu-dot" },
      { x: tile.x4, y: tile.y4, text: tile.t4, cls: "hu-dot hu-dot-now" },
    ];
    for (const point of points) {
      const dot = document.createElement("span");
      dot.className = point.cls;
      dot.style.left = `${point.x ?? 0}%`;
      dot.style.top = `${point.y ?? 0}%`;
      const label = document.createElement("b");
      label.textContent = point.text ?? "";
      dot.appendChild(label);
      plot.appendChild(dot);
    }

    const weeks = document.createElement("div");
    weeks.className = "hu-wks";
    for (const key of ["d1", "d2", "d3", "d4"]) {
      const span = document.createElement("span");
      span.textContent = tile[key] ?? "";
      weeks.appendChild(span);
    }

    const meta = document.createElement("div");
    meta.className = "hu-meta";
    meta.textContent = tile.meta_txt || "";

    foot.append(value, plot, weeks, meta);
    cell.append(aur, head, foot);
    if (tile.meta_txt) cell.title = `${tile.metric}: ${tile.meta_txt}`;
    return cell;
  }

  function render(period) {
    const list = payload.поПериодам?.[period] || payload.плитки;
    const box = document.createElement("div");
    box.className = "hu";
    // Порядок задан запросом: блоки идут по block_ord, плитки внутри — по ord.
    const sorted = [...list].sort(
      (a, b) => (a.block_ord - b.block_ord) || (a.ord - b.ord),
    );
    for (const tile of sorted) box.appendChild(renderTile(tile));
    tiles.replaceChildren(box);

    stamp.textContent = `обновлено ${payload.обновлено}`;
    say("");
  }

  const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь",
                  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

  function periodLabel(key) {
    const [year, month] = key.split("-").map(Number);
    return `${MONTHS[month - 1]} ${year}`;
  }

  /** В списке только те месяцы, которые реально посчитаны и лежат в файле. */
  function fillPeriods(current) {
    const periods = payload.периоды?.length ? [...payload.периоды].reverse() : [current];
    periodSelect.replaceChildren();
    for (const key of periods) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = periodLabel(key);
      periodSelect.appendChild(option);
    }
    periodSelect.value = current;
  }

  fetch(DATA_URL, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`сервер вернул ошибку ${response.status}`);
      return response.json();
    })
    .then((data) => {
      payload = data;
      fillPeriods(data.период);
      render(data.период);
    })
    .catch((error) => {
      say(`Не удалось загрузить показатели: ${error?.message || error}`, "error");
    });

  periodSelect.addEventListener("change", () => render(periodSelect.value));
})();
