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

  const SVG_NS = "http://www.w3.org/2000/svg";

  /** Точки динамики: приходят из запроса в процентах от поля графика. */
  function points(tile) {
    const result = [];
    for (let index = 1; index <= 4; index += 1) {
      const x = Number(tile[`x${index}`]);
      const y = Number(tile[`y${index}`]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      // Запрос гасит точки, которых ещё нет, подменой класса — уважаем это.
      const hidden = index === 2 ? tile.cls2 : index === 3 ? tile.cls3 : "";
      if (hidden && !String(hidden).includes("hu-dot")) continue;
      // Период без факта приходит с пустой подписью: рисовать его нельзя,
      // иначе линия уходит в угол графика через несуществующее значение.
      const label = String(tile[`t${index}`] ?? "").trim();
      if (!label) continue;
      result.push({ x, y, label, period: tile[`d${index}`] ?? "" });
    }
    return result;
  }

  /** Спарклайн: линия, заливка под ней и точки строго на линии.
   *
   * В чарте точки были отдельными кружками с absolute-позицией, линии между
   * ними не было вовсе — оттого они и выглядели рассыпанными. Здесь всё рисует
   * один SVG в общей системе координат, поэтому точка не может «съехать».
   */
  function renderSpark(list) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "tile__spark");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    if (list.length < 2) return svg;

    const coords = list.map((point) => `${point.x},${point.y}`).join(" ");

    const fill = document.createElementNS(SVG_NS, "polygon");
    fill.setAttribute("class", "tile__sparkFill");
    fill.setAttribute("points", `${list[0].x},100 ${coords} ${list[list.length - 1].x},100`);

    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("class", "tile__sparkLine");
    line.setAttribute("points", coords);
    // Толщина не должна растягиваться вместе с viewBox, иначе линия «жирнеет».
    line.setAttribute("vector-effect", "non-scaling-stroke");

    svg.append(fill, line);
    return svg;
  }

  /** Плитка: заголовок, число, динамика и строка цели. */
  function renderTile(tile) {
    const cell = document.createElement("article");
    cell.className = "tile";
    cell.style.setProperty("--tone", tile.bg_color || "#7d8794");

    const head = document.createElement("header");
    head.className = "tile__head";
    const name = document.createElement("h3");
    name.className = "tile__name";
    name.textContent = tile.metric || "";
    const block = document.createElement("span");
    block.className = "tile__block";
    block.textContent = tile.block_name || "";
    head.append(name, block);

    const value = document.createElement("p");
    value.className = "tile__value";
    value.append(document.createTextNode(tile.fact_txt ?? ""));
    if (tile.val2_txt) {
      const second = document.createElement("span");
      second.className = "tile__value2";
      second.textContent = tile.val2_txt;
      value.appendChild(second);
    }

    const list = points(tile);
    // График разложен на три этажа: значения недель, линия, номера недель.
    // Раньше подписи стояли поверх линии по координате точки и налезали на неё
    // и друг на друга — теперь у каждого этажа своё место, пересечься нечему.
    const chart = document.createElement("div");
    chart.className = "tile__chart";

    const marks = document.createElement("div");
    marks.className = "tile__marks";
    const plot = document.createElement("div");
    plot.className = "tile__plot";
    const weeks = document.createElement("div");
    weeks.className = "tile__weeks";

    plot.appendChild(renderSpark(list));
    // Точки — обычные элементы поверх линии, а не круги внутри SVG: график
    // растянут по ширине, и круг в его системе координат стал бы эллипсом.
    for (let index = 0; index < list.length; index += 1) {
      const point = list[index];
      const last = index === list.length - 1;

      const dot = document.createElement("span");
      dot.className = last ? "tile__dot tile__dot--now" : "tile__dot";
      dot.style.left = `${point.x}%`;
      dot.style.top = `${point.y}%`;
      plot.appendChild(dot);

      const mark = document.createElement("span");
      mark.className = last ? "tile__mark tile__mark--now" : "tile__mark";
      mark.style.left = `${point.x}%`;
      mark.textContent = point.label;
      marks.appendChild(mark);

      const week = document.createElement("span");
      week.className = last ? "tile__week tile__week--now" : "tile__week";
      week.style.left = `${point.x}%`;
      week.textContent = point.period;
      weeks.appendChild(week);
    }

    chart.append(marks, plot, weeks);

    // Цель и отклонение — внизу отдельной строкой. Номер недели туда больше не
    // дублируется: он теперь стоит под своей точкой.
    const foot = document.createElement("footer");
    foot.className = "tile__foot";
    foot.textContent = tile.meta_txt || "";

    cell.append(head, value, chart);
    if (tile.meta_txt) cell.appendChild(foot);
    // Подсказка собирает то, что не поместилось: цель, отклонение и всю динамику.
    const hint = [tile.metric, tile.meta_txt,
                  list.map((p) => `${p.period}: ${p.label}`).join(" · ")]
      .filter(Boolean).join(" — ");
    if (hint) cell.title = hint;
    return cell;
  }

  function render(period) {
    const list = payload.поПериодам?.[period] || payload.плитки;
    const box = document.createElement("div");
    box.className = "tiles";
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
