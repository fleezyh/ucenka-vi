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
    const spark = document.createElement("div");
    spark.className = "tile__plot";
    spark.appendChild(renderSpark(list));
    // Точки — обычные элементы поверх линии, а не круги внутри SVG: график
    // растянут по ширине, и круг в его системе координат стал бы эллипсом.
    for (let index = 0; index < list.length; index += 1) {
      const dot = document.createElement("span");
      dot.className = index === list.length - 1 ? "tile__dot tile__dot--now" : "tile__dot";
      dot.style.left = `${list[index].x}%`;
      dot.style.top = `${list[index].y}%`;
      spark.appendChild(dot);
    }
    if (list.length) {
      const last = list[list.length - 1];
      const badge = document.createElement("span");
      // Подпись держится за свою точку, а не за угол графика: иначе на плитках,
      // где последняя неделя ушла вверх, число ложилось прямо на точку.
      badge.className = last.y < 42 ? "tile__last tile__last--below" : "tile__last";
      badge.style.left = `${Math.min(Math.max(last.x, 8), 92)}%`;
      badge.style.top = `${last.y}%`;
      badge.textContent = last.label;
      spark.appendChild(badge);
    }

    const foot = document.createElement("footer");
    foot.className = "tile__foot";
    const meta = document.createElement("span");
    meta.className = "tile__meta";
    meta.textContent = tile.meta_txt || "";
    const period = document.createElement("span");
    period.className = "tile__period";
    period.textContent = list.length ? list[list.length - 1].period : "";
    foot.append(meta, period);

    cell.append(head, value, spark, foot);
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
