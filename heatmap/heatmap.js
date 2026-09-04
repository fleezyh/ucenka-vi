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

    // Клик раскрывает дневную историю. Ряд есть не у всех: коэффициенты и доли
    // считаются из двух показателей сразу, и по дням такое число только шумит.
    const daily = payload.ряды?.[tile.metric_key];
    if (daily?.точки?.length) {
      cell.classList.add("tile--clickable");
      cell.tabIndex = 0;
      cell.setAttribute("role", "button");
      cell.addEventListener("click", () => openDaily(tile.metric_key, cell));
      cell.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDaily(tile.metric_key, cell);
        }
      });
    }
    // Подсказка собирает то, что не поместилось: цель, отклонение и всю динамику.
    const hint = [tile.metric, tile.meta_txt,
                  list.map((p) => `${p.period}: ${p.label}`).join(" · ")]
      .filter(Boolean).join(" — ");
    if (hint) cell.title = hint;
    return cell;
  }

  // --- Дневной график по клику ----------------------------------------------
  // Плитка живёт неделями, а листы-источники лежат по дням. Скрипт кладёт
  // дневной ряд рядом с плитками, здесь он только рисуется.

  let openMetric = null;

  function niceNumber(value) {
    const abs = Math.abs(value);
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return value.toLocaleString("ru-RU", {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
  }

  function dayLabel(iso) {
    const [, month, day] = iso.split("-");
    return `${day}.${month}`;
  }

  function renderDailyChart(list) {
    const width = 1000;
    const height = 260;
    const padTop = 14;
    const padBottom = 26;

    const values = list.map((p) => p.значение);
    let low = Math.min(...values, 0);
    let high = Math.max(...values, 0);
    if (high === low) { high = low + 1; }
    const span = high - low;

    const x = (i) => (list.length === 1 ? width / 2 : (i / (list.length - 1)) * width);
    const y = (v) => padTop + (1 - (v - low) / span) * (height - padTop - padBottom);

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "daily__svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");

    // Нулевая линия рисуется, только если ряд её пересекает: у большинства
    // метрик ноль — это дно шкалы, и лишняя черта по низу только мусорит.
    if (low < 0 && high > 0) {
      const zero = document.createElementNS(SVG_NS, "line");
      zero.setAttribute("class", "daily__zero");
      zero.setAttribute("x1", 0); zero.setAttribute("x2", width);
      zero.setAttribute("y1", y(0)); zero.setAttribute("y2", y(0));
      svg.appendChild(zero);
    }

    const path = list.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.значение).toFixed(1)}`).join(" ");

    const area = document.createElementNS(SVG_NS, "path");
    area.setAttribute("class", "daily__area");
    area.setAttribute("d", `${path} L${x(list.length - 1).toFixed(1)},${y(low)} L${x(0).toFixed(1)},${y(low)} Z`);
    svg.appendChild(area);

    const line = document.createElementNS(SVG_NS, "path");
    line.setAttribute("class", "daily__line");
    line.setAttribute("d", path);
    svg.appendChild(line);

    return { svg, low, high };
  }

  function closeDaily() {
    openMetric = null;
    document.querySelectorAll(".tile--open").forEach((el) => el.classList.remove("tile--open"));
    document.getElementById("daily")?.remove();
  }

  function openDaily(metricKey, cell) {
    // Повторный клик по той же плитке закрывает — иначе панель некуда деть.
    if (openMetric === metricKey) { closeDaily(); return; }
    closeDaily();
    openMetric = metricKey;
    cell.classList.add("tile--open");

    const entry = payload.ряды[metricKey];
    const list = entry.точки;

    const box = document.createElement("section");
    box.className = "daily";
    box.id = "daily";

    const head = document.createElement("header");
    head.className = "daily__head";
    const title = document.createElement("h3");
    title.className = "daily__title";
    title.textContent = entry.metric;
    const sub = document.createElement("p");
    sub.className = "daily__sub";
    sub.textContent = `по дням · ${dayLabel(list[0].день)} — ${dayLabel(list[list.length - 1].день)}`;
    const close = document.createElement("button");
    close.className = "daily__close";
    close.type = "button";
    close.textContent = "Закрыть";
    close.addEventListener("click", closeDaily);
    const heading = document.createElement("div");
    heading.append(title, sub);
    head.append(heading, close);

    const chart = renderDailyChart(list);
    const { low, high } = chart;
    const plot = document.createElement("div");
    plot.className = "daily__plot";
    const scale = document.createElement("div");
    scale.className = "daily__scale";
    const top = document.createElement("span");
    top.textContent = niceNumber(high);
    const bottom = document.createElement("span");
    bottom.textContent = niceNumber(low);
    scale.append(top, bottom);
    plot.append(scale, chart.svg);

    const axis = document.createElement("div");
    axis.className = "daily__axis";
    // Пять подписей по всей длине: по одной на каждый день их не прочесть.
    for (let i = 0; i < 5; i += 1) {
      const at = Math.round((list.length - 1) * (i / 4));
      const mark = document.createElement("span");
      mark.textContent = dayLabel(list[at].день);
      axis.appendChild(mark);
    }

    const sum = list.reduce((acc, p) => acc + p.значение, 0);
    const last = list[list.length - 1];
    const facts = document.createElement("p");
    facts.className = "daily__facts";
    facts.textContent = `дней: ${list.length} · среднее за день ${niceNumber(sum / list.length)}`
      + ` · максимум ${niceNumber(high)} · последний день (${dayLabel(last.день)}) ${niceNumber(last.значение)}`;

    box.append(head, plot, axis, facts);
    tiles.appendChild(box);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    openMetric = null;
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
