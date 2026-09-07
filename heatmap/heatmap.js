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
  // Сетка текущей отрисовки: в неё вставляется дневная панель, поэтому её
  // держим отдельно от контейнера #tiles, где рядом живёт ещё и сводка.
  let grid = null;

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

  // --- Сравнение с прошлым периодом на том же отрезке дней --------------------
  // Цель в запросе уже пропорциональна прошедшим дням, так что светофор к цели
  // честный. Чего в данных нет — ответа на второй вопрос про любое отклонение:
  // «а в прошлом месяце в эти же дни сколько было?». Считаем из дневных рядов.

  let compareMode = false;

  /** Во сколько раз значение ряда крупнее значения плитки: рубли против млн. */
  function unitScale(code) {
    if (code === "mln_rub") return 1e6;
    if (code === "thousand_pcs") return 1e3;
    return 1;
  }

  /** Сколько дней периода уже прошло — по календарю, до вчера включительно.
   *
   * Сегодняшний день не в счёт: выгрузка приносит его наполовину, и темп на
   * нём проваливался бы каждое утро.
   */
  function periodProgress(period) {
    const { start, end } = periodBounds(period);
    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);

    const day = 86400000;
    const total = Math.round((end - start) / day) + 1;
    const last = yesterday < end ? yesterday : end;
    const elapsed = Math.min(total, Math.max(0, Math.round((last - start) / day) + 1));
    return { elapsed, total, ratio: total ? elapsed / total : 0 };
  }

  /** Предыдущий период того же вида: месяц к месяцу, квартал к кварталу. */
  function previousPeriod(key) {
    const year = Number(key.slice(0, 4));
    const tail = key.slice(5);
    if (/^\d{2}$/.test(tail)) {
      const month = Number(tail) - 1;
      return month >= 1 ? `${year}-${String(month).padStart(2, "0")}` : `${year - 1}-12`;
    }
    if (/^Q[1-4]$/.test(tail)) {
      const quarter = Number(tail[1]) - 1;
      return quarter >= 1 ? `${year}-Q${quarter}` : `${year - 1}-Q4`;
    }
    if (/^H[12]$/.test(tail)) return tail === "H2" ? `${year}-H1` : `${year - 1}-H2`;
    return String(year - 1);
  }

  const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    + `-${String(date.getDate()).padStart(2, "0")}`;

  /** Первые `days` дней периода — тот самый отрезок, что уже прожит в текущем. */
  function headOfPeriod(period, days) {
    const { start, end } = periodBounds(period);
    const last = new Date(start);
    last.setDate(last.getDate() + days - 1);
    return [isoDate(start), isoDate(last < end ? last : end)];
  }

  /** Значение ряда за отрезок — по правилу его вида.
   *
   * Поток складываем, долю считаем как отношение сумм частей (а не среднее из
   * дневных отношений — это разные числа), остаток берём последним снимком.
   */
  function totalOver(entry, from, to) {
    const inside = entry.точки.filter((point) => point.день >= from && point.день <= to);
    if (!inside.length) return null;
    if (entry.вид === "доля") {
      const bottom = inside.reduce((acc, point) => acc + (point.знаменатель || 0), 0);
      if (!bottom) return null;
      const top = inside.reduce((acc, point) => acc + (point.числитель || 0), 0);
      return (top / bottom) * (entry.множитель || 1);
    }
    if (entry.вид === "уровень") return inside[inside.length - 1].значение;
    return inside.reduce((acc, point) => acc + point.значение, 0);
  }

  // Куда метрике хорошо двигаться: деньги — вверх, затраты — вниз. У потоков и
  // запасов «лучше» не определено, там сравнение показывается без светофора.
  const GOOD_WAY = { деньги: "up", затраты: "down" };

  /** Тот же отрезок дней в прошлом периоде: сколько было и на сколько разошлось. */
  function compareOf(tile, period) {
    const entry = payload.ряды?.[tile.metric_key];
    if (!entry?.точки?.length) return null;

    const { elapsed } = periodProgress(period);
    if (!elapsed) return null;

    // Доли уже посчитаны в процентах самим рядом, делить их на масштаб плитки
    // не нужно; поток и остаток лежат в рублях и штуках.
    const scale = entry.вид === "доля" ? 1 : unitScale(tile.unit_code);
    const previous = previousPeriod(period);
    const [nowFrom, nowTo] = headOfPeriod(period, elapsed);
    const [wasFrom, wasTo] = headOfPeriod(previous, elapsed);

    const now = totalOver(entry, nowFrom, nowTo);
    const was = totalOver(entry, wasFrom, wasTo);
    if (now === null || was === null) return null;

    const share = was ? (now - was) / Math.abs(was) : null;
    const way = GOOD_WAY[blockOf(tile).key];
    let tone = "flat";
    if (way && share !== null) {
      // Разницу до трёх процентов считаем «так же»: иначе половина плиток
      // мигает цветом на шуме в пару сотен рублей.
      if (Math.abs(share) < 0.03) tone = "warn";
      else tone = (way === "up" ? share > 0 : share < 0) ? "good" : "bad";
    }
    return { now: now / scale, was: was / scale, delta: (now - was) / scale,
             share, tone, elapsed, previous, average: entry.вид === "уровень" };
  }

  const TONE_COLOR = { good: "#2f8a2f", warn: "#d9a441", bad: "#c0392b", flat: "#7d8794" };

  /** Число в стиле плиток: два знака после запятой, как в исходных подписях. */
  function paceNumber(value) {
    return value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Подпись единицы у числа сравнения: без неё «12» под процентом окупаемости
  // читается как рубли.
  const UNIT_SUFFIX = { percent: "%", mln_rub: " млн", thousand_pcs: " тыс", count: " шт" };

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
    cell.dataset.metric = tile.metric_key || "";
    // В режиме сравнения цвет считается заново — от прошлого периода, а не цели.
    const pace = compareMode ? compareOf(tile, periodSelect.value) : null;
    cell.style.setProperty("--tone", pace ? TONE_COLOR[pace.tone] : (tile.bg_color || "#7d8794"));
    if (compareMode && !pace) cell.classList.add("tile--noPace");

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
      // Две величины в строке шире одной: на прежнем кегле «22,43 тыс /
      // 46,33 млн» упиралось в край и обрезалось на полуслове.
      value.classList.add("tile__value--pair");
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
    if (pace) {
      // Не «сколько было за весь прошлый месяц», а сколько было за столько же
      // первых дней: сравнивать 6 дней с 31 бессмысленно.
      const percent = pace.share === null ? ""
        : ` · ${pace.share >= 0 ? "+" : "−"}${Math.round(Math.abs(pace.share) * 100)}%`;
      foot.textContent = `${periodLabel(pace.previous)}${pace.average ? ", снимок" : ""}:`
        + ` ${paceNumber(pace.was)}${UNIT_SUFFIX[tile.unit_code] || ""}${percent}`;
      foot.classList.add("tile__foot--pace");
    } else {
      foot.textContent = tile.meta_txt || "";
    }

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
  // По умолчанию показываем дни выбранного периода: плитка считает август —
  // логично, чтобы и график под ней был про август, а не про последние 30 дней
  // вне зависимости от выбора. Остальные глубины остаются кнопками.
  let dailyDepth = "период";

  /** Границы периода датами: 2026-08, 2026-Q3, 2026-H1, 2026.
   *
   * Последний день считаем через нулевое число следующего месяца, а не «31»:
   * в сентябре такой даты нет, Date молча переносит её на октябрь, и период
   * растягивается вдвое.
   */
  function periodBounds(key) {
    const year = Number(key.slice(0, 4));
    const tail = key.slice(5);
    let first = 1;
    let last = 12;
    if (/^H[12]$/.test(tail)) { first = tail === "H1" ? 1 : 7; last = first + 5; }
    else if (/^Q[1-4]$/.test(tail)) { first = (Number(tail[1]) - 1) * 3 + 1; last = first + 2; }
    else if (/^\d{2}$/.test(tail)) { first = Number(tail); last = first; }
    return { start: new Date(year, first - 1, 1), end: new Date(year, last, 0) };
  }

  /** Те же границы строками ISO — ими режется дневной ряд. */
  function periodRange(key) {
    const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      + `-${String(date.getDate()).padStart(2, "0")}`;
    const { start, end } = periodBounds(key);
    return [iso(start), iso(end)];
  }

  /** Значения ряда для показанного окна.
   *
   * Потоки лежат готовыми числами. Доли и коэффициенты приходят числителем и
   * знаменателем: за один день такое отношение скачет (40 штук выхода на 3
   * штуки входа — коэффициент 13), поэтому считаем его накопительно с начала
   * окна. Это ровно та же арифметика, что в плитке, только по дням.
   */
  function materialize(entry, points) {
    if (entry.вид !== "доля") return points;
    let top = 0;
    let bottom = 0;
    return points.map((point) => {
      top += point.числитель || 0;
      bottom += point.знаменатель || 0;
      return { день: point.день,
               значение: bottom ? (top / bottom) * (entry.множитель || 1) : 0 };
    });
  }

  /** Дни ряда, попавшие внутрь выбранного периода. */
  function daysOfPeriod(all, period) {
    const [from, to] = periodRange(period);
    return all.filter((point) => point.день >= from && point.день <= to);
  }

  /** Точки, попавшие в выбранную глубину: дни периода, хвост или весь ряд.
   *
   * Ряд копится последние полгода, поэтому у старого периода дней в нём может
   * не быть вовсе — тогда показываем хвост, а кнопку периода не рисуем совсем,
   * иначе она подсвечена, а под ней чужие даты.
   */
  function sliceDaily(all, period) {
    if (dailyDepth === "период") {
      const inside = daysOfPeriod(all, period);
      return inside.length ? inside : all.slice(-30);
    }
    return dailyDepth ? all.slice(-dailyDepth) : all;
  }

  /** Число за один день — целым, с разделителями разрядов.
   *
   * Плитка считает тысячами штук и миллионами рублей, но в дне это давало
   * «0,41» вместо понятных 410. Дробную часть оставляем только совсем мелким
   * значениям, где округление до целого съело бы всё.
   */
  function niceNumber(value) {
    const abs = Math.abs(value);
    const digits = abs >= 10 ? 0 : abs >= 1 ? 1 : abs > 0 ? 2 : 0;
    return value.toLocaleString("ru-RU", {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
  }

  /** Крупные суммы в подписи над точкой сокращаем: «117 тыс» вместо «116 852». */
  function shortNumber(value) {
    const abs = Math.abs(value);
    if (abs >= 1e6) return `${niceNumber(value / 1e6)} млн`;
    if (abs >= 10000) return `${Math.round(value / 1000).toLocaleString("ru-RU")} тыс`;
    return niceNumber(value);
  }

  function dayLabel(iso) {
    const [, month, day] = iso.split("-");
    return `${day}.${month}`;
  }

  function renderDailyChart(list, ghost = [], fromZero = true) {
    const width = 1000;
    const height = 260;
    // Сверху нужен запас: над самой высокой точкой встаёт её подпись.
    const padTop = 34;
    const padBottom = 26;

    // Шкалу считаем по обоим рядам: иначе прошлый месяц, который был выше,
    // уезжает за верхний край и сравнение теряет смысл.
    const values = list.map((p) => p.значение).concat(ghost.map((p) => p.значение));
    // Остаток от нуля не рисуем: резерв гуляет в пределах процента от своих
    // 645 миллионов, и на шкале от нуля это была бы ровная черта.
    let low = fromZero ? Math.min(...values, 0) : Math.min(...values);
    let high = fromZero ? Math.max(...values, 0) : Math.max(...values);
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

    // Прошлый период рисуем первым и пунктиром — он фон, а не второй герой.
    if (ghost.length > 1) {
      const shadow = document.createElementNS(SVG_NS, "path");
      shadow.setAttribute("class", "daily__ghost");
      shadow.setAttribute("d", ghost
        .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.значение).toFixed(1)}`).join(" "));
      svg.appendChild(shadow);
    }

    const area = document.createElementNS(SVG_NS, "path");
    area.setAttribute("class", "daily__area");
    area.setAttribute("d", `${path} L${x(list.length - 1).toFixed(1)},${y(low)} L${x(0).toFixed(1)},${y(low)} Z`);
    svg.appendChild(area);

    const line = document.createElementNS(SVG_NS, "path");
    line.setAttribute("class", "daily__line");
    line.setAttribute("d", path);
    svg.appendChild(line);

    return { svg, low, high, x, y, width, height };
  }

  function closeDaily() {
    openMetric = null;
    document.querySelectorAll(".tile--open").forEach((el) => el.classList.remove("tile--open"));
    document.getElementById("daily")?.remove();
    writeHash(periodSelect.value);
  }

  /** Вставить панель сразу под ряд, в котором стоит плитка.
   *
   * Раньше она добавлялась в конец страницы: щёлкаешь «ФОТ штат» в верхнем
   * ряду — график открывается под четырьмя рядами плиток, и его надо искать
   * прокруткой. Колонок в сетке столько, сколько насчитал CSS для текущей
   * ширины, поэтому число берём из вычисленных стилей, а не из констант.
   */
  function placeDaily(box, cell) {
    const owner = cell.parentElement || grid;
    const columns = getComputedStyle(owner).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const cells = [...owner.children].filter((el) => el.classList.contains("tile"));
    const index = cells.indexOf(cell);
    const endOfRow = (Math.floor(index / columns) + 1) * columns;
    owner.insertBefore(box, cells[endOfRow] || null);
  }

  // Книгу Excel собирает общий модуль ../xlsx.js — тот же файл подключён в
  // производительности, чтобы упаковщик zip лежал в одном месте.

  /** Ряд по дням книгой Excel — тем же составом, что на экране.
   *
   * Просьба «скинь выгрузку» обычно означает ровно эти столбцы, а не поход в
   * Superset: пусть человек забирает сам. У долей отдаём ещё и обе части, из
   * которых считается число, — иначе процент не перепроверить.
   */
  function downloadDaily(entry, list, raw) {
    const unit = entry.единица || "";
    const title = `${entry.metric}${unit ? `, ${unit}` : ""}`;
    const rows = entry.вид === "доля"
      ? [["день", "числитель", "знаменатель", `${title} (накопительно)`],
         ...list.map((point, index) => [point.день, raw[index].числитель,
                                        raw[index].знаменатель, point.значение])]
      : [["день", title], ...list.map((point) => [point.день, point.значение])];

    saveXlsx(rows, entry.metric,
             `${entry.metric} ${list[0].день} — ${list[list.length - 1].день}`);
  }

  /** Ссылка на текущий вид: период и раскрытая метрика лежат в адресе. */
  function writeHash(period) {
    const hash = openMetric ? `#${period}/${openMetric}` : `#${period}`;
    if (window.location.hash !== hash) history.replaceState(null, "", hash);
  }

  function openDaily(metricKey, cell, options = {}) {
    // Повторный клик по той же плитке закрывает — иначе панель некуда деть.
    if (openMetric === metricKey) { closeDaily(); return; }
    closeDaily();
    openMetric = metricKey;
    cell.classList.add("tile--open");

    const entry = payload.ряды[metricKey];
    const unit = entry.единица || "";
    const all = entry.точки;
    const list = materialize(entry, sliceDaily(all, periodSelect.value));

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
    sub.textContent = `по дням, ${unit} · ${dayLabel(list[0].день)} — ${dayLabel(list[list.length - 1].день)}`;
    const close = document.createElement("button");
    close.className = "daily__close";
    close.type = "button";
    close.textContent = "Закрыть";
    close.addEventListener("click", closeDaily);

    const hasPeriodDays = daysOfPeriod(all, periodSelect.value).length > 0;
    const ranges = document.createElement("div");
    ranges.className = "daily__ranges";
    for (const [days, label] of [["период", periodLabel(periodSelect.value)],
                                 [30, "30 дней"], [90, "3 месяца"], [0, "всё"]]) {
      if (days === "период" && !hasPeriodDays) continue;
      if (typeof days === "number" && days && all.length <= days) continue;
      // Когда дней периода в ряду нет, показан хвост в тридцать дней — его и
      // подсвечиваем, чтобы кнопка не расходилась с тем, что на графике.
      const shownDepth = dailyDepth === "период" && !hasPeriodDays ? 30 : dailyDepth;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "daily__range" + (shownDepth === days ? " is-on" : "");
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        dailyDepth = days;
        openMetric = null;          // иначе повторный вызов сочтёт это закрытием
        openDaily(metricKey, cell);
      });
      ranges.appendChild(button);
    }

    const save = document.createElement("button");
    save.type = "button";
    save.className = "daily__close daily__close--ghost";
    save.textContent = "Excel";
    save.title = "Скачать показанный ряд по дням книгой .xlsx";
    save.addEventListener("click", (event) => {
      event.stopPropagation();
      downloadDaily(entry, list, sliceDaily(all, periodSelect.value));
    });

    const tools = document.createElement("div");
    tools.className = "daily__tools";
    tools.append(ranges, save, close);
    const heading = document.createElement("div");
    heading.append(title, sub);
    head.append(heading, tools);

    // Тот же отрезок прошлого периода — только когда на экране сам период:
    // на «30 днях» или «всём» накладывать нечего, там окно скользящее.
    const previous = previousPeriod(periodSelect.value);
    const ghost = dailyDepth === "период"
      ? materialize(entry, all.filter((point) => {
          const [from, to] = headOfPeriod(previous, list.length);
          return point.день >= from && point.день <= to;
        }))
      : [];

    const chart = renderDailyChart(list, ghost, entry.вид !== "уровень");
    const { low, high } = chart;

    // Точка на каждый день: без них линия читается как накопление, хотя каждый
    // день здесь сам по себе. Кружки — обычные элементы поверх холста: внутри
    // SVG, растянутого по ширине, круг стал бы эллипсом.
    const dots = document.createElement("div");
    dots.className = "daily__dots";
    // Подписи над точками помещаются примерно до сорока дней. Дальше они
    // наезжают друг на друга, поэтому показываем каждую вторую или пятую —
    // точки при этом остаются все.
    const step = list.length <= 40 ? 1 : list.length <= 100 ? 2 : 5;

    list.forEach((point, index) => {
      const left = list.length === 1 ? 50 : (index / (list.length - 1)) * 100;
      const top = (chart.y(point.значение) / chart.height) * 100;

      const dot = document.createElement("i");
      dot.style.left = `${left}%`;
      dot.style.top = `${top}%`;
      dot.title = `${dayLabel(point.день)} — ${niceNumber(point.значение)} ${unit}`;
      dots.appendChild(dot);

      if (index % step) return;
      const label = document.createElement("b");
      label.className = "daily__pin";
      label.textContent = shortNumber(point.значение);
      label.style.left = `${left}%`;
      label.style.top = `${top}%`;
      dots.appendChild(label);
    });
    if (list.length > 70) dots.classList.add("daily__dots--dense");

    const canvas = document.createElement("div");
    canvas.className = "daily__canvas";
    canvas.append(chart.svg, dots);

    const plot = document.createElement("div");
    plot.className = "daily__plot";
    const scale = document.createElement("div");
    scale.className = "daily__scale";
    const top = document.createElement("span");
    top.textContent = shortNumber(high);
    const bottom = document.createElement("span");
    bottom.textContent = shortNumber(low);
    scale.append(top, bottom);
    plot.append(scale, canvas);

    // Дата под каждой точкой, ровно по её координате. Пять подписей по краям
    // не давали ответа на вопрос «а это какой день» — приходилось считать.
    // На длинных окнах подписи прореживаются тем же шагом, что и значения.
    const axis = document.createElement("div");
    axis.className = "daily__axis";
    list.forEach((point, index) => {
      if (index % step) return;
      const mark = document.createElement("span");
      mark.className = "daily__day";
      mark.textContent = dayLabel(point.день);
      mark.style.left = list.length === 1 ? "50%" : `${(index / (list.length - 1)) * 100}%`;
      axis.appendChild(mark);
    });

    const sum = list.reduce((acc, p) => acc + p.значение, 0);
    const last = list[list.length - 1];
    const flow = !entry.вид;                        // поток — только его и складывают
    const facts = document.createElement("p");
    facts.className = "daily__facts";
    // Итог окна у каждого вида свой: у потока это сумма, у доли — накопленное
    // значение на последний день, у остатка — сам последний снимок.
    facts.textContent = flow
      ? `дней: ${list.length} · всего ${niceNumber(sum)} ${unit}`
        + ` · среднее за день ${niceNumber(sum / list.length)} ${unit}`
        + ` · максимум ${niceNumber(high)} ${unit}`
        + ` · последний день (${dayLabel(last.день)}) ${niceNumber(last.значение)} ${unit}`
      : `дней: ${list.length} · ${entry.вид === "доля" ? "накопительно с начала окна" : "снимков"}: `
        + `${niceNumber(last.значение)} ${unit}`
        + ` · размах ${niceNumber(low)} — ${niceNumber(high)} ${unit}`
        + ` · последний (${dayLabel(last.день)})`;

    // Один день часто и делает весь месяц: 03.09 дал 90% сентябрьского
    // списания. Пока это не сказано словами, в графике оно теряется.
    if (flow) {
      const peak = list.reduce((best, p) => (p.значение > best.значение ? p : best), list[0]);
      const peakShare = sum ? peak.значение / sum : 0;
      if (peakShare >= 0.4 && list.length > 3) {
        const note = document.createElement("b");
        note.className = "daily__peak";
        note.textContent = ` · один день ${dayLabel(peak.день)} — ${Math.round(peakShare * 100)}% всего периода`;
        facts.appendChild(note);
      }
    }

    if (ghost.length) {
      const before = flow ? ghost.reduce((acc, p) => acc + p.значение, 0)
                          : ghost[ghost.length - 1].значение;
      const nowValue = flow ? sum : last.значение;
      const change = before ? (nowValue - before) / Math.abs(before) : null;
      const tail = document.createElement("span");
      tail.className = "daily__versus";
      tail.textContent = ` · за те же ${ghost.length} дн. в «${periodLabel(previous)}»`
        + ` ${niceNumber(before)} ${unit}`
        + (change === null ? "" : ` (${change >= 0 ? "+" : "−"}${Math.round(Math.abs(change) * 100)}%)`);
      facts.appendChild(tail);
    }

    box.append(head, plot, axis, facts);
    placeDaily(box, cell);
    writeHash(periodSelect.value);
    // При восстановлении вида из адреса или после смены периода страницу не
    // дёргаем: пользователь и так смотрит туда, куда сам пришёл.
    if (!options.silent) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /** Светофор плитки по её цвету.
   *
   * Цвет считает запрос с оглядкой на направление метрики, так что это
   * честный светофор, а не сравнение чисел на глаз.
   */
  function toneOf(tile) {
    const tone = String(tile.bg_color || "").toLowerCase();
    if (tone.includes("2f8a2f") || tone.includes("27c46b")) return "good";
    if (tone.includes("c0392b") || tone.includes("f05d72")) return "bad";
    if (tone.includes("e0a") || tone.includes("f5ad32") || tone.includes("d9a")) return "warn";
    return "flat";
  }

  // Выбранный светофор. Обычный вопрос к хитмапу — «что горит», и раньше на
  // него отвечали глазами по двадцати четырём плиткам сразу.
  let toneFilter = null;

  /** Светофор с учётом режима: в сравнении он считается от прошлого периода. */
  function effectiveTone(tile) {
    if (!compareMode) return toneOf(tile);
    return compareOf(tile, periodSelect.value)?.tone ?? "flat";
  }

  /** Сводка: сколько метрик в норме, а сколько отстаёт. Каждый чип — фильтр. */
  function renderSummary(list) {
    const groups = { good: 0, warn: 0, bad: 0, flat: 0 };
    for (const tile of list) groups[effectiveTone(tile)] += 1;

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
      const item = document.createElement("button");
      item.type = "button";
      item.className = `summary__item summary__item--${kind}`
        + (toneFilter === kind ? " is-on" : "");
      item.setAttribute("aria-pressed", String(toneFilter === kind));
      item.title = toneFilter === kind ? "Показать все метрики" : `Оставить только «${label}»`;
      const value = document.createElement("b");
      value.textContent = count;
      item.append(value, document.createTextNode(` ${label}`));
      // Повторный клик по включённому чипу снимает фильтр — иначе из него
      // некуда выйти, кроме перезагрузки страницы.
      item.addEventListener("click", () => {
        toneFilter = toneFilter === kind ? null : kind;
        render(periodSelect.value);
      });
      box.appendChild(item);
    }

    const progress = periodProgress(periodSelect.value);
    if (progress.elapsed && list.some((tile) => compareOf(tile, periodSelect.value))) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "summary__pace" + (compareMode ? " is-on" : "");
      toggle.setAttribute("aria-pressed", String(compareMode));
      const previous = periodLabel(previousPeriod(periodSelect.value));
      toggle.textContent = compareMode
        ? `сравнение · первые ${progress.elapsed} дн. против «${previous}»`
        : `сравнить с «${previous}»`;
      toggle.title = "Тот же отрезок дней в прошлом периоде: сколько было и куда ушло";
      toggle.addEventListener("click", () => {
        compareMode = !compareMode;
        // Фильтр по светофору снимаем: цвета только что пересчитались, и старый
        // выбор оставил бы на экране случайный набор плиток.
        toneFilter = null;
        render(periodSelect.value);
      });
      box.appendChild(toggle);
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
    // Дневные ряды копятся только последние полгода: у старых периодов сравнивать
    // нечего, и режим выключается сам — иначе экран из одних приглушённых плиток
    // без единой подписи выглядит как поломка.
    if (compareMode && !sorted.some((tile) => compareOf(tile, period))) compareMode = false;

    // Сводку считаем по всем плиткам периода, а не по отфильтрованным: иначе
    // при включённом фильтре остальные счётчики обнулятся и выйти будет некуда.
    const shown = toneFilter ? sorted.filter((tile) => effectiveTone(tile) === toneFilter) : sorted;
    const reopen = openMetric;
    openMetric = null;
    for (const tile of shown) box.appendChild(renderTile(tile));
    grid = box;
    tiles.replaceChildren(renderSummary(sorted), box);

    // Раскрытая метрика переживает смену периода и фильтра, если она осталась
    // на экране: иначе при переключении месяца панель молча исчезала.
    if (reopen) {
      const cell = box.querySelector(`[data-metric="${cssEscape(reopen)}"]`);
      if (cell) openDaily(reopen, cell, { silent: true });
    }
    writeHash(period);

    stamp.textContent = `обновлено ${payload.обновлено}`;
    say("");
  }

  /** Экранирование для querySelector: ключи метрик латинские, но подстраховка
   *  дешевле, чем разбираться потом с одной сломанной плиткой. */
  function cssEscape(value) {
    return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
  }

  const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь",
                  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

  const ROMAN = ["I", "II", "III", "IV"];

  /** Подпись периода. Ключ говорит сам за себя: 2026-09, 2026-Q3, 2026-H1, 2026. */
  function periodLabel(key) {
    if (/^\d{4}$/.test(key)) return `${key} год`;
    const [year, tail] = key.split("-");
    if (/^H[12]$/.test(tail)) return `${tail[1]} полугодие ${year}`;
    if (/^Q[1-4]$/.test(tail)) return `${ROMAN[Number(tail[1]) - 1]} квартал ${year}`;
    return `${MONTHS[Number(tail) - 1]} ${year}`;
  }

  function periodKind(key) {
    if (/^\d{4}$/.test(key)) return "год";
    if (/-H[12]$/.test(key)) return "полугодие";
    if (/-Q[1-4]$/.test(key)) return "квартал";
    return "месяц";
  }

  /** В списке только те месяцы, которые реально посчитаны и лежат в файле. */
  function fillPeriods(current) {
    const periods = payload.периоды?.length ? [...payload.периоды] : [current];
    periodSelect.replaceChildren();

    // Группами, иначе месяцы, кварталы и годы идут вперемешку и список не
    // читается. Внутри группы — свежее сверху.
    const groups = [
      ["месяц", "Месяцы"],
      ["квартал", "Кварталы"],
      ["полугодие", "Полугодия"],
      ["год", "Годы"],
    ];

    for (const [kind, title] of groups) {
      const keys = periods.filter((key) => periodKind(key) === kind).sort().reverse();
      if (!keys.length) continue;
      const group = document.createElement("optgroup");
      group.label = title;
      for (const key of keys) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = periodLabel(key);
        group.appendChild(option);
      }
      periodSelect.appendChild(group);
    }
    periodSelect.value = current;
  }

  /** Что просили в адресе: «#2026-08» или «#2026-08/fot_rub». */
  function readHash() {
    const [period, metric] = decodeURIComponent(window.location.hash.slice(1)).split("/");
    return { period: period || "", metric: metric || "" };
  }

  fetch(DATA_URL, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`сервер вернул ошибку ${response.status}`);
      return response.json();
    })
    .then((data) => {
      payload = data;
      // Ссылкой на конкретную плитку удобно кидаться в переписке — поэтому
      // период и раскрытая метрика читаются из адреса, если они там есть.
      const wanted = readHash();
      const known = data.периоды?.includes(wanted.period) ? wanted.period : data.период;
      fillPeriods(known);
      if (wanted.metric && data.ряды?.[wanted.metric]?.точки?.length) openMetric = wanted.metric;
      render(known);
    })
    .catch((error) => {
      say(`Не удалось загрузить показатели: ${error?.message || error}`, "error");
    });

  periodSelect.addEventListener("change", () => render(periodSelect.value));

  // Escape закрывает раскрытый график: кнопка «Закрыть» уезжает вверх, когда
  // смотришь длинный ряд, и до неё приходится возвращаться прокруткой.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openMetric) closeDaily();
  });

  // Ссылку с хешем часто вставляют в уже открытую вкладку: браузер меняет
  // только адрес и страницу не перезагружает, поэтому вид переключаем сами.
  window.addEventListener("hashchange", () => {
    if (!payload) return;
    const wanted = readHash();
    const period = payload.периоды?.includes(wanted.period) ? wanted.period : periodSelect.value;
    if (wanted.metric === openMetric && period === periodSelect.value) return;
    periodSelect.value = period;
    openMetric = wanted.metric && payload.ряды?.[wanted.metric]?.точки?.length ? wanted.metric : null;
    render(period);
  });
})();
