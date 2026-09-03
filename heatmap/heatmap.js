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

  // Разбивка по блокам из запроса местами не сходится: «Отгружено, тыс шт» и
  // коэффициент к нему лежали в деньгах, хотя считаются в штуках, а брак —
  // в операционке вместе с потоками. Раскладываем по смыслу.
  const BLOCKS = [
    { key: "деньги", label: "Деньги", icon: "💰" },
    { key: "затраты", label: "Затраты", icon: "💸" },
    { key: "поток", label: "Поток", icon: "📦" },
    { key: "качество", label: "Качество", icon: "⚠️" },
    { key: "запасы", label: "Запасы", icon: "🏦" },
  ];

  const METRIC_BLOCK = {
    "Уценка (фин рез юнита)": "деньги",
    "Продано (деньги на счёт)": "деньги",
    "Себестоимость проданных": "деньги",
    "Отгружено уценки": "деньги",
    "Себестоимость отгруженных": "деньги",
    "% окупаемости": "деньги",
    "ФОТ штат": "затраты",
    "Аутсорс": "затраты",
    "Аренда": "затраты",
    "Списание ТМЦ (утиль)": "затраты",
    "Переупаковка": "затраты",
    "Ошибки ФБ": "затраты",
    "Вход, тыс шт": "поток",
    "Выход, тыс шт": "поток",
    "Коэффициент выход/вход": "поток",
    "Вход регионы, тыс шт": "поток",
    "Выход регионы, тыс шт": "поток",
    "Коэффициент выход/вход регионы": "поток",
    "Отгружено, тыс шт": "поток",
    "Коэффициент отгруженные/выход": "поток",
    "% брака от выручки": "качество",
    "% брака от проданных штук": "качество",
    "Беклог хранения, тыс шт": "запасы",
    "Резерв на брак": "запасы",
  };

  function blockOf(tile) {
    const key = METRIC_BLOCK[String(tile.metric || "").trim()];
    return BLOCKS.find((block) => block.key === key) || BLOCKS[0];
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  /** Наступила ли неделя вида «W36» — по календарю ISO. */
  function weekStarted(label) {
    const number = Number(String(label).replace(/\D/g, ""));
    if (!number) return false;
    const now = new Date();
    const thursday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const current = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
    return number <= current;
  }

  /** Точки динамики: приходят из запроса в процентах от поля графика. */
  function points(tile) {
    const result = [];
    for (let index = 1; index <= 4; index += 1) {
      const x = Number(tile[`x${index}`]);
      let y = Number(tile[`y${index}`]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      // Запрос гасит точки, которых ещё нет, подменой класса — уважаем это.
      const hidden = index === 2 ? tile.cls2 : index === 3 ? tile.cls3 : "";
      if (hidden && !String(hidden).includes("hu-dot")) continue;
      const period = String(tile[`d${index}`] ?? "").trim();
      let label = String(tile[`t${index}`] ?? "").trim();
      if (!label) {
        // Пустая подпись бывает двух видов: неделя ещё не наступила — её не
        // рисуем совсем; неделя прошла, а движений не было — это честный ноль,
        // и он должен быть виден, иначе кажется, что данных нет.
        if (!period || !weekStarted(period)) continue;
        label = "0";
        y = 100;
      }
      result.push({ x, y, label, period });
    }

    // Координата x из запроса рассчитана под фиксированный шаг и при четырёх
    // точках заканчивается на 77% — справа зияла четверть плитки. Раскладываем
    // сами: от края до края, с отступом под крайние подписи.
    const left = 9;
    const right = 91;
    for (let index = 0; index < result.length; index += 1) {
      result[index].x = result.length === 1
        ? 50
        : left + (right - left) * (index / (result.length - 1));
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
    const group = blockOf(tile);
    const block = document.createElement("span");
    block.className = "tile__block";
    block.textContent = `${group.icon} ${group.label}`;
    head.append(name, block);

    const value = document.createElement("p");
    value.className = "tile__value";
    value.append(document.createTextNode(tile.fact_txt ?? ""));
    if (tile.val2_txt) {
      // Слэш рисовал сам чарт, в данных его нет: «34,12 млн / 8991 шт».
      const slash = document.createElement("span");
      slash.className = "tile__slash";
      slash.textContent = "/";
      const second = document.createElement("span");
      second.className = "tile__value2";
      second.textContent = tile.val2_txt;
      value.append(slash, second);
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
    // дублируется: он теперь стоит под своей точкой. Строка рисуется всегда,
    // даже пустой: без неё плитка без цели становится ниже соседних.
    const foot = document.createElement("footer");
    foot.className = tile.meta_txt ? "tile__foot" : "tile__foot tile__foot--empty";
    foot.textContent = tile.meta_txt || "";

    cell.append(head, value, chart, foot);
    // Подсказка собирает то, что не поместилось: цель, отклонение и всю динамику.
    const hint = [tile.metric, tile.meta_txt,
                  list.map((p) => `${p.period}: ${p.label}`).join(" · ")]
      .filter(Boolean).join(" — ");
    if (hint) cell.title = hint;
    return cell;
  }

  /** Сколько метрик в норме, а сколько отстаёт — по цвету плитки.
   *
   * Цвет считает запрос с оглядкой на направление метрики, так что это
   * честный светофор, а не сравнение чисел на глаз.
   */
  function renderSummary(list) {
    const groups = { good: 0, warn: 0, bad: 0, flat: 0 };
    for (const tile of list) {
      const tone = String(tile.bg_color || "").toLowerCase();
      if (tone.includes("2f8a2f") || tone.includes("27c46b")) groups.good += 1;
      else if (tone.includes("c0392b") || tone.includes("f05d72")) groups.bad += 1;
      else if (tone.includes("e0a")  || tone.includes("f5ad32") || tone.includes("d9a")) groups.warn += 1;
      else groups.flat += 1;
    }

    const box = document.createElement("div");
    box.className = "summary";
    const items = [
      ["good", "в норме", groups.good],
      ["warn", "на грани", groups.warn],
      ["bad", "отстают", groups.bad],
      ["flat", "справочные", groups.flat],
    ];
    for (const [kind, label, count] of items) {
      if (!count) continue;
      const item = document.createElement("span");
      item.className = `summary__item summary__item--${kind}`;
      const value = document.createElement("b");
      value.textContent = count;
      item.append(value, document.createTextNode(` ${label}`));
      box.appendChild(item);
    }
    return box;
  }

  function render(period) {
    const list = payload.поПериодам?.[period] || payload.плитки;
    const box = document.createElement("div");
    box.className = "tiles";
    // Порядок задан запросом: блоки идут по block_ord, плитки внутри — по ord.
    // Внутри блока сохраняем порядок запроса, сами блоки идут по своему списку.
    const sorted = [...list].sort((a, b) => {
      const byBlock = BLOCKS.indexOf(blockOf(a)) - BLOCKS.indexOf(blockOf(b));
      return byBlock || (a.block_ord - b.block_ord) || (a.ord - b.ord);
    });
    for (const tile of sorted) box.appendChild(renderTile(tile));
    tiles.replaceChildren(renderSummary(sorted), box);

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
