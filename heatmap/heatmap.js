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

  /** Даты ISO-недели: «W36» → «31.08–06.09».
   *
   * Ряд идёт полными неделями, и первая неделя месяца почти всегда начинается
   * в прошлом — из-за этого недельные точки и расходятся с плиткой.
   */
  function weekDates(label) {
    const digits = String(label || "").match(/\d+/);
    if (!digits) return "";
    const year = Number((periodSelect.value || "").slice(0, 4));
    if (!year) return "";
    // Четвёртое января всегда в первой ISO-неделе — от него и отсчитываем.
    const fourth = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(fourth);
    monday.setUTCDate(fourth.getUTCDate() - ((fourth.getUTCDay() + 6) % 7)
      + (Number(digits[0]) - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const short = (date) => `${String(date.getUTCDate()).padStart(2, "0")}.`
      + `${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return `${short(monday)}–${short(sunday)}`;
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
      // Неделя берётся целиком, поэтому первая точка месяца обычно захватывает
      // хвост прошлого: W36 — это 31.08–06.09. Без дат это выглядит как
      // ошибка в данных, а объясняет разницу с плиткой именно она.
      const span = weekDates(point.period);
      if (span) week.title = `${point.period} · ${span}`;
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

    // Клик раскрывает панель: дневную историю, а под ней — откуда взялось
    // число. Раскрытие даём всегда, даже когда дневного ряда нет: вопрос
    // «а это откуда» задают чаще, чем просят график.
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

    // Подсказка отвечает на главный вопрос — чем это считается. Недельные
    // значения из неё убраны: они подписаны прямо под своими точками, и
    // дублировать их в тултипе значило топить принцип в перечислении.
    const method = methodOf(tile.metric_key);
    const hint = [tile.metric, method?.формула, tile.meta_txt,
                  "клик — история по дням и как считается"]
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
  /** Доли по дням: копим числитель и знаменатель, делим уже суммы.
   *
   * У ряда с пометкой «копить: месяц» счёт обнуляется первого числа. Так
   * устроен финрез: он считается от начала месяца до конца, последнее значение
   * месяца и есть значение месяца. Пока копили с начала показанного окна, на
   * «30 днях» или «всём» выходила бессмыслица — половина одного месяца,
   * сложенная с половиной другого.
   */
  function materialize(entry, points) {
    if (entry.вид !== "доля") return points;
    const poMesyacam = entry.копить === "месяц";
    let top = 0;
    let bottom = 0;
    let mesyac = null;
    return points.map((point) => {
      if (poMesyacam && point.день.slice(0, 7) !== mesyac) {
        mesyac = point.день.slice(0, 7);
        top = 0;
        bottom = 0;
      }
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

  /* ── График по дням ────────────────────────────────────────────────────
     Как в производительности: линия дня с мягкой заливкой, поверх неё
     скользящее среднее за неделю, пунктиром медиана, выброс красным и не
     давит шкалу. Число стоит над каждой точкой: у пика — сверху, у провала —
     снизу, чтобы подпись не садилась на линию. */

  const DNI_NEDELI = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const low = Math.floor(pos);
    return sorted[low + 1] !== undefined
      ? sorted[low] + (pos - low) * (sorted[low + 1] - sorted[low])
      : sorted[low];
  }

  function rolling(values, window) {
    return values.map((_, index) => {
      const slice = values.slice(Math.max(0, index - window + 1), index + 1);
      return slice.reduce((sum, value) => sum + value, 0) / slice.length;
    });
  }

  /** Ровные деления шкалы: 0, 0,5 млн, 1 млн — а не 1 601 516. */
  function niceTicks(low, high, count = 4) {
    const raw = (high - low || Math.abs(high) || 1) / count;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * power).find((s) => s >= raw * 0.999);
    const from = Math.floor(low / step + 1e-9) * step;
    const to = Math.ceil(high / step - 1e-9) * step || step;
    const ticks = [];
    for (let v = from; v <= to + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
    return { ticks, from, to };
  }

  /** Плавная линия, которая не уходит за точки (монотонный сплайн): обычная
      кривая Безье рисовала бы на провале минус там, где его нет. */
  function smoothPath(pts) {
    const f = (v) => v.toFixed(1);
    if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])},${f(p[1])}`).join(" ");
    const n = pts.length;
    const m = [];
    for (let i = 0; i < n - 1; i++) m[i] = (pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]);
    const t = [m[0]];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    t[n - 1] = m[n - 2];
    for (let i = 0; i < n - 1; i++) {
      if (!m[i]) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const h = (pts[i + 1][0] - pts[i][0]) / 3;
      d += ` C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
    }
    return d;
  }

  function svgNode(name, attrs, parent) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
    if (parent) parent.appendChild(node);
    return node;
  }

  let dailyTip = null;

  function showDailyTip(html, event) {
    if (!dailyTip) {
      dailyTip = document.createElement("div");
      dailyTip.className = "dtip";
      document.body.appendChild(dailyTip);
    }
    dailyTip.innerHTML = html;
    dailyTip.hidden = false;
    const box = dailyTip.getBoundingClientRect();
    let left = event.clientX + 16;
    let top = event.clientY - box.height - 14;
    if (left + box.width > window.innerWidth - 8) left = event.clientX - box.width - 16;
    if (top < 8) top = event.clientY + 16;
    dailyTip.style.left = `${Math.max(8, left)}px`;
    dailyTip.style.top = `${Math.max(8, top)}px`;
  }

  function hideDailyTip() {
    if (dailyTip) dailyTip.hidden = true;
  }

  function dailyGraph(list, ghost, entry, unit, previousLabel) {
    const flow = !entry.вид;
    const fromZero = entry.вид !== "уровень";
    const values = list.map((p) => p.значение);
    const n = list.length;
    const sorted = [...values].sort((a, b) => a - b);

    // Выброс не должен сплющивать месяц: если день выше обычного в разы,
    // потолок ставим по 95-му перцентилю, а сам день рисуем у потолка
    // красным — число над ним остаётся настоящим.
    let cap = Infinity;
    if (flow && n >= 10) {
      const p90 = quantile(sorted, 0.9);
      if (p90 > 0 && sorted[n - 1] > p90 * 2.5) {
        cap = Math.max(quantile(sorted, 0.95) * 1.15, p90 * 1.6);
      }
    }
    const shown = (v) => Math.min(v, cap);
    const seen = values.map(shown).concat(ghost.map((p) => shown(p.значение)));
    let low = fromZero ? Math.min(0, ...seen) : Math.min(...seen);
    let high = fromZero ? Math.max(0, ...seen) : Math.max(...seen);
    // Остаток от нуля не рисуем: резерв гуляет в пределах процента от своих
    // 645 миллионов, и на шкале от нуля это была бы ровная черта.
    if (!fromZero) {
      const pad = (high - low) * 0.15 || Math.abs(high) * 0.01 || 1;
      low -= pad;
      high += pad;
    }
    if (high === low) high = low + 1;
    // Деления ровные, но край шкалы — по данным: иначе ряд до 1,6 млн
    // рисовался под потолком в 2 млн, и пятая часть графика пустовала.
    const nice = niceTicks(low, high, 4);
    const from = fromZero ? nice.from : Math.max(nice.from, low);
    const to = Math.min(nice.to, high + (high - low) * 0.06);
    const ticks = nice.ticks.filter((tick) => tick >= from - 1e-9 && tick <= to + 1e-9);

    // Подписи: до месяца — строкой над каждой точкой, до четырёх месяцев —
    // столбиком (так влезают все), дальше — через одну-две, иначе каша.
    const mode = n <= 31 ? "flat" : n <= 125 ? "tall" : "sparse";
    const W = 1000;
    const H = 280;
    const padTop = mode === "flat" ? 30 : 62;
    const padBottom = mode === "flat" ? 24 : 10;
    const padX = n > 1 ? 16 : 0;
    const x = (i) => (n === 1 ? W / 2 : padX + (i / (n - 1)) * (W - 2 * padX));
    const y = (v) => padTop + (1 - (shown(v) - from) / (to - from)) * (H - padTop - padBottom);
    const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;

    const svg = svgNode("svg", { class: "dgraph__svg", viewBox: `0 0 ${W} ${H}`,
                                 preserveAspectRatio: "none", "aria-hidden": "true" });
    const defs = svgNode("defs", {}, svg);
    const gradient = svgNode("linearGradient", { id: "dgraphFill", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svgNode("stop", { offset: "0%", "stop-color": "#4d8df7", "stop-opacity": 0.36 }, gradient);
    svgNode("stop", { offset: "100%", "stop-color": "#4d8df7", "stop-opacity": 0.02 }, gradient);

    for (const tick of ticks) {
      svgNode("line", { class: tick === 0 && from < 0 ? "dgraph__zero" : "dgraph__grid",
                        x1: 0, x2: W, y1: y(tick), y2: y(tick) }, svg);
    }

    const median = quantile(sorted, 0.5);
    const withMedian = flow && n >= 5;
    if (withMedian) {
      svgNode("line", { class: "dgraph__median", x1: 0, x2: W, y1: y(median), y2: y(median) }, svg);
    }

    if (ghost.length > 1) {
      svgNode("path", { class: "dgraph__ghost",
                        d: smoothPath(ghost.map((p, i) => [x(i), y(p.значение)])) }, svg);
    }

    const line = smoothPath(values.map((v, i) => [x(i), y(v)]));
    const base = (fromZero ? y(Math.max(0, from)) : H - padBottom).toFixed(1);
    svgNode("path", { class: "dgraph__area",
                      d: `${line} L${x(n - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z` }, svg);
    svgNode("path", { class: "dgraph__line", d: line }, svg);

    // Неделя — это семь дней, но у денег выходных в ряду нет: там неделя —
    // пять точек подряд.
    const weekend = (point) => [0, 6].includes(new Date(`${point.день}T12:00:00`).getDay());
    const trend = rolling(values, list.some(weekend) ? 7 : 5);
    const withTrend = flow && n >= 10;
    if (withTrend) {
      svgNode("path", { class: "dgraph__trend", d: smoothPath(trend.map((v, i) => [x(i), y(v)])) }, svg);
    }

    const canvas = document.createElement("div");
    canvas.className = "dgraph__canvas";
    canvas.appendChild(svg);

    const layer = document.createElement("div");
    layer.className = "dgraph__dots";
    const guide = document.createElement("span");
    guide.className = "dgraph__guide";
    guide.hidden = true;
    layer.appendChild(guide);

    const every = mode === "sparse" ? Math.ceil(n / 60) : 1;
    const dots = [];
    list.forEach((point, i) => {
      const left = pct(x(i), W);
      const top = pct(y(point.значение), H);
      const over = point.значение > cap;
      const dot = document.createElement("i");
      dot.className = `${over ? "is-over" : ""}${i === n - 1 ? " is-last" : ""}`;
      dot.style.left = left;
      dot.style.top = top;
      layer.appendChild(dot);
      dots.push(dot);

      const extreme = point.значение === sorted[n - 1] || point.значение === sorted[0];
      if (i % every && !extreme && i !== n - 1) return;
      const prev = values[i - 1];
      const next = values[i + 1];
      // Провал — ниже обоих соседей: подпись под точкой, иначе она легла бы
      // прямо на линию, которая уходит от него вверх.
      const valley = mode === "flat" && n > 2 && !over
        && (prev === undefined || point.значение < prev)
        && (next === undefined || point.значение < next);
      const pin = document.createElement("b");
      pin.className = "dgraph__pin"
        + (valley ? " is-below" : "")
        + (mode !== "flat" ? " is-tall" : "")
        + (i === 0 && mode === "flat" ? " is-first" : "")
        + (i === n - 1 ? " is-last" : "")
        + (over ? " is-over" : "");
      pin.textContent = shortNumber(point.значение);
      pin.style.left = left;
      pin.style.top = top;
      layer.appendChild(pin);
    });
    canvas.appendChild(layer);

    // Подсказка по всей высоте: мышью не нужно попадать в кружок в пять
    // пикселей, достаточно встать над нужным днём.
    const indexAt = (event) => {
      const box = canvas.getBoundingClientRect();
      const u = ((event.clientX - box.left) / box.width) * W;
      if (n === 1) return 0;
      return Math.max(0, Math.min(n - 1, Math.round(((u - padX) / (W - 2 * padX)) * (n - 1))));
    };
    const tipFor = (i) => {
      const point = list[i];
      const date = new Date(`${point.день}T12:00:00`);
      const before = values[i - 1];
      const delta = before ? (point.значение - before) / Math.abs(before) : null;
      const old = ghost[i];
      return `<b>${DNI_NEDELI[date.getDay()]}, ${dayLabel(point.день)}</b>`
        + `<strong>${niceNumber(point.значение)} ${unit}</strong>`
        + (withTrend ? `<span>среднее за неделю ${shortNumber(trend[i])}</span>` : "")
        + (delta === null ? ""
          : `<span>к прошлому дню ${delta >= 0 ? "+" : "−"}${Math.round(Math.abs(delta) * 100)}%</span>`)
        + (old ? `<span>${previousLabel}, тот же день: ${shortNumber(old.значение)}</span>` : "")
        + (point.значение > cap ? "<span class=\"dtip__over\">выброс — выше шкалы</span>" : "");
    };
    let active = -1;
    canvas.addEventListener("mousemove", (event) => {
      const i = indexAt(event);
      if (i !== active) {
        if (active >= 0) dots[active].classList.remove("is-on");
        active = i;
        dots[i].classList.add("is-on");
        guide.style.left = pct(x(i), W);
        guide.hidden = false;
      }
      showDailyTip(tipFor(i), event);
    });
    canvas.addEventListener("mouseleave", () => {
      if (active >= 0) dots[active].classList.remove("is-on");
      active = -1;
      guide.hidden = true;
      hideDailyTip();
    });

    const scale = document.createElement("div");
    scale.className = "dgraph__scale";
    for (const tick of ticks) {
      const mark = document.createElement("span");
      mark.textContent = shortNumber(tick);
      mark.style.top = pct(y(tick), H);
      scale.appendChild(mark);
    }

    const plot = document.createElement("div");
    plot.className = "dgraph__plot";
    plot.append(scale, canvas);

    // Дата под каждой точкой, ровно по её координате: пять подписей по краям
    // не отвечали на вопрос «а это какой день». Выходные — приглушённо.
    const axis = document.createElement("div");
    axis.className = "dgraph__axis";
    const axisStep = n <= 31 ? 1 : n <= 62 ? 2 : Math.ceil(n / 30);
    list.forEach((point, i) => {
      if (i !== n - 1 && (i % axisStep || n - 1 - i < axisStep)) return;
      const mark = document.createElement("span");
      if (weekend(point)) mark.className = "is-weekend";
      mark.textContent = dayLabel(point.день);
      mark.style.left = pct(x(i), W);
      axis.appendChild(mark);
    });

    const legend = document.createElement("div");
    legend.className = "dgraph__legend";
    legend.innerHTML = "<span><i class=\"k k--line\"></i>день</span>"
      + (withTrend ? "<span><i class=\"k k--trend\"></i>среднее за неделю</span>" : "")
      + (withMedian ? `<span><i class="k k--median"></i>медиана ${shortNumber(median)}</span>` : "")
      + (ghost.length > 1 ? `<span><i class="k k--ghost"></i>${previousLabel}, те же дни</span>` : "")
      + (cap < Infinity ? `<span><i class="k k--over"></i>выше ${shortNumber(cap)} — не в масштабе</span>` : "");

    const wrap = document.createElement("div");
    wrap.className = `dgraph dgraph--${mode}${n > 12 ? " dgraph--many" : ""}`;
    wrap.append(legend, plot, axis);
    return wrap;
  }

  function closeDaily() {
    openMetric = null;
    document.querySelectorAll(".tile--open").forEach((el) => el.classList.remove("tile--open"));
    document.getElementById("daily")?.remove();
    hideDailyTip();
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

  /** Плитка метрики в показанном периоде — за названием и единицами. */
  function tileOf(metricKey) {
    const list = payload.поПериодам?.[periodSelect.value] || payload.плитки || [];
    return list.find((row) => row.metric_key === metricKey) || null;
  }

  /** Описание расчёта из metodika.js. Файл может не подключиться — тогда
   *  панель просто останется без блока, а не свалится вся страница. */
  function methodOf(metricKey) {
    return (window.HEATMAP_METHOD || {})[metricKey] || null;
  }

  // Откуда цифра берётся: это первое, что надо знать про плитку.
  const KIND_LABEL = { "система": "считает система", "руками": "заводят вручную", "расчёт": "расчёт" };
  const KIND_CLASS = { "система": "sys", "руками": "hand", "расчёт": "calc" };

  /** «Как считается»: формула одной строкой и, если надо, одна оговорка.
   *
   * Ровно столько, сколько человек прочитает у плитки. Всё длиннее он
   * пролистывает — проверено на первой версии этого блока.
   */
  function methodBlock(metricKey) {
    const method = methodOf(metricKey);
    if (!method) return null;

    const box = document.createElement("section");
    box.className = "how";

    const title = document.createElement("h4");
    title.className = "how__title";
    title.textContent = "Как считается";
    if (method.тип) {
      const kind = document.createElement("span");
      kind.className = `how__kind how__kind--${KIND_CLASS[method.тип] || "calc"}`;
      kind.textContent = KIND_LABEL[method.тип] || method.тип;
      title.append(kind);
    }
    box.append(title);

    if (method.формула) {
      const lead = document.createElement("p");
      lead.className = "how__lead";
      lead.textContent = method.формула;
      box.append(lead);
    }

    if (method.оговорка) {
      const note = document.createElement("p");
      note.className = "how__caveat";
      note.textContent = method.оговорка;
      box.append(note);
    }
    return box;
  }

  // --- Бэклог: где именно он лежит -------------------------------------------
  // У бэклога, в отличие от остальных плиток, под числом есть физический
  // адрес: шестнадцать зон, контейнеры и акты приёмки. Разворот показывает
  // разрез по зонам, даёт скачать детализацию по каждому акту и объясняет
  // периметр — какие зоны берём и какие контейнеры считаем.
  // Данные готовит task_backlog.py тем же прогоном, что и само число.

  let backlogData = null;      // null — ещё не спрашивали, false — не вышло

  /** Штуки, sku и контейнеры — всегда целые: niceNumber показал бы «4,0». */
  const shtuki = (value) => Math.round(Number(value) || 0).toLocaleString("ru-RU");

  async function backlogPull() {
    if (backlogData !== null) return backlogData;
    try {
      const answer = await fetch("../data/backlog.json", { cache: "no-store" });
      backlogData = answer.ok ? await answer.json() : false;
    } catch { backlogData = false; }
    return backlogData;
  }

  /** Зона по дням линией с точками — как большой график плитки, только мельче.
   *
   * Точки рисуются обычными элементами поверх холста: внутри SVG, растянутого
   * по ширине, круг превратился бы в эллипс.
   */
  function zonaGrafik(istoriya, imya) {
    const dni = istoriya.map((den) => ({
      день: den.день,
      штук: den.по_зонам.find((z) => z.зона === imya)?.штук || 0,
    }));
    const max = Math.max(...dni.map((d) => d.штук));
    const min = Math.min(...dni.map((d) => d.штук));
    const razmah = max - min;
    // Неподвижная зона — ровная линия посередине: прижимать её к краю нечестно,
    // она ведь не на нуле, а просто не меняется.
    const y = (v) => (razmah ? 12 + (1 - (v - min) / razmah) * 76 : 50);
    // Крайние точки держим внутри поля: иначе подпись первой уезжает за левый
    // край панели и обрезается.
    const x = (i) => (dni.length === 1 ? 50 : 2 + (i / (dni.length - 1)) * 96);

    // Значение подписываем у каждой точки — иначе приходится наводить на все
    // подряд. Двадцать одно шестизначное число в строку не влезает, поэтому
    // крупные зоны показываем в тысячах.
    const vTysyachah = max >= 10000;
    const podpisChisla = (v) => (vTysyachah
      ? (v / 1000).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : shtuki(v));

    const tochki = dni.map((d, i) => `${x(i)},${y(d.штук)}`).join(" ");
    const holst = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    holst.setAttribute("viewBox", "0 0 100 100");
    holst.setAttribute("preserveAspectRatio", "none");
    holst.innerHTML =
      `<polygon points="0,100 ${tochki} 100,100" fill="rgba(77,141,247,0.16)"></polygon>`
      + `<polyline points="${tochki}" fill="none" stroke="var(--blue)" stroke-width="2"`
      + ` vector-effect="non-scaling-stroke" stroke-linejoin="round"></polyline>`;

    const box = document.createElement("div");
    box.className = "zoneLine";
    box.appendChild(holst);

    // Двадцать одна дата подряд не помещается — «25.0826.08» слипалось в одно
    // слово. Подписываем каждую третью, крайние всегда.
    const shag = dni.length > 14 ? 3 : dni.length > 8 ? 2 : 1;
    dni.forEach((d, i) => {
      const kray = i === 0 || i === dni.length - 1;
      const tochka = document.createElement("i");
      tochka.className = "zoneLine__dot";
      tochka.style.left = `${x(i)}%`;
      tochka.style.top = `${y(d.штук)}%`;
      tochka.title = `${dayLabel(d.день)} — ${shtuki(d.штук)} шт`;
      box.appendChild(tochka);

      const podpis = document.createElement("b");
      podpis.className = "zoneLine__pin"
        + (i === 0 ? " zoneLine__pin--first" : "")
        + (i === dni.length - 1 ? " zoneLine__pin--last" : "");
      podpis.textContent = podpisChisla(d.штук);
      podpis.style.left = `${x(i)}%`;
      podpis.style.top = `${y(d.штук)}%`;
      box.appendChild(podpis);
      if (kray || i % shag === 0) {
        const data = document.createElement("em");
        data.className = "zoneLine__day";
        data.textContent = dayLabel(d.день);
        data.style.left = `${x(i)}%`;
        box.appendChild(data);
      }
    });

    const pervyy = dni[0]?.штук || 0;
    const posledniy = dni[dni.length - 1]?.штук || 0;
    const itog = document.createElement("p");
    itog.className = "zoneChart__note";
    itog.textContent = (posledniy === pervyy
      ? `за ${dni.length} дней не двигалась`
      : `за ${dni.length} дней ${posledniy > pervyy ? "прибавилось" : "ушло"} `
        + `${shtuki(Math.abs(posledniy - pervyy))} шт · размах `
        + `${shtuki(min)} — ${shtuki(max)}`)
      + (vTysyachah ? " · на графике тысячи штук" : "");

    const wrap = document.createElement("div");
    wrap.append(box, itog);
    return wrap;
  }

  function backlogZoneRow(zone, data, table) {
    const istoriya = data.история || [];
    const pervyy = istoriya[0];
    const vsego = data.штук || 1;
    const bylo = pervyy ? (pervyy.по_зонам.find((z) => z.зона === zone.зона)?.штук ?? null) : null;
    const change = bylo === null ? null : zone.штук - bylo;

    const row = document.createElement("tr");
    row.className = "zones__row";
    const znak = change === null ? "" : change > 0 ? "up" : change < 0 ? "down" : "flat";
    row.innerHTML = `<td>${zone.зона}</td>`
      + `<td class="zones__num">${shtuki(zone.штук)}</td>`
      + `<td class="zones__num">${Math.round((zone.штук / vsego) * 100)}%</td>`
      + `<td class="zones__num">${shtuki(zone.sku)}</td>`
      + `<td class="zones__num">${shtuki(zone.контейнеров)}</td>`
      + `<td class="zones__num zones__${znak}">`
      + (change === null ? "—"
         : change === 0 ? "не двигалась"
         : `${change > 0 ? "+" : "−"}${shtuki(Math.abs(change))}`)
      + "</td>";

    // Клик разворачивает зону графиком по дням: строка из двадцати чисел
    // подряд не читается — глазу нужна линия, чтобы увидеть, копится зона
    // или стоит.
    const podrobno = document.createElement("tr");
    podrobno.className = "zones__days";
    podrobno.hidden = true;
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.append(zonaGrafik(istoriya, zone.зона));
    podrobno.append(cell);

    row.addEventListener("click", (event) => {
      event.stopPropagation();
      podrobno.hidden = !podrobno.hidden;
      row.classList.toggle("is-open", !podrobno.hidden);
    });
    table.append(row, podrobno);
  }

  function backlogBlock() {
    const box = document.createElement("section");
    box.className = "how zones";
    const title = document.createElement("h4");
    title.className = "how__title";
    title.textContent = "Где лежит";
    const lead = document.createElement("p");
    lead.className = "how__lead";
    lead.textContent = "собираю разрез по зонам…";
    box.append(title, lead);

    backlogPull().then((data) => {
      if (!data || !data.по_зонам?.length) { box.remove(); return; }

      const istoriya = data.история || [];
      const pervyy = istoriya[0];
      const rost = pervyy ? data.штук - pervyy.штук : null;
      lead.textContent = `${shtuki(data.штук)} штук по ${data.по_зонам.length} зонам, `
        + `${shtuki(data.актов)} актов приёмки`
        + (rost === null ? ""
           : ` · за ${istoriya.length} дней ${rost >= 0 ? "прибавилось" : "ушло"} `
             + `${shtuki(Math.abs(rost))} штук`);

      const table = document.createElement("table");
      table.className = "zones__table";
      table.innerHTML = "<thead><tr><th>Зона</th><th>Штук</th><th>Доля</th><th>SKU</th>"
        + "<th>Контейнеров</th><th>За период</th></tr></thead>";
      const body = document.createElement("tbody");
      data.по_зонам.forEach((zone) => backlogZoneRow(zone, data, body));
      table.append(body);

      const wrap = document.createElement("div");
      wrap.className = "zones__wrap";
      wrap.append(table);

      const hint = document.createElement("p");
      hint.className = "how__caveat";
      hint.textContent = "Щёлкните по зоне — покажет её по дням. "
        + "Прошлые дни восстановлены по движениям, дальше история копится сама.";

      const save = document.createElement("a");
      save.className = "zones__save";
      save.href = data.выгрузка?.ссылка || "../data/backlog-podrobno.xlsx";
      save.setAttribute("download", "");
      save.innerHTML = `<b>Скачать детально · Excel</b>`
        + `<small>${shtuki(data.строк_в_выгрузке)} строк: акт, товар, дефект, `
        + `себестоимость, РРЦ, контейнер, ячейка, зона</small>`;

      const period = document.createElement("details");
      period.className = "zones__method";
      const m = data.методика || {};
      period.innerHTML = "<summary>Какие зоны и контейнеры считаем</summary>"
        + `<div class="zones__list">${(m.зоны || []).map((z) => `<span>${z}</span>`).join("")}</div>`
        + (m["как отбираем"] || []).map((p) => `<p>${p}</p>`).join("")
        + (m.история ? `<p>${m.история}</p>` : "");
      period.addEventListener("click", (event) => event.stopPropagation());

      box.append(wrap, hint, save, period);
    });

    return box;
  }

  // --- Цель прямо у плитки ---------------------------------------------------
  // Раньше цель правилась только в книге или в админке: увидел на плитке, что
  // цель не та, — иди в другое место и ищи строку среди двух сотен. Теперь она
  // ставится там же, где видна. Ручка открыта только админу, остальные блока
  // не увидят вовсе.

  const GOAL_SCALE = { mln_rub: 1e6, thousand_pcs: 1e3 };
  const GOAL_UNIT = { mln_rub: "млн ₽", thousand_pcs: "тыс шт",
                      percent: "%", ratio: "коэф.", count: "шт" };
  const GOAL_DIRECTIONS = [["higher", "больше — лучше"], ["lower", "меньше — лучше"],
                           ["ref", "справочно"]];

  let iAmAdmin = null;     // null — ещё не спрашивали
  let goalsCache = null;   // цели показанного месяца

  /** Право ставить цели спрашиваем у самой ручки, а не по названию роли:
   *  название в справочнике меняют, и сверка по нему тихо ломается. */
  async function adminHere() {
    if (iAmAdmin !== null) return iAmAdmin;
    try {
      const answer = await fetch("/__goals", { cache: "no-store" });
      iAmAdmin = answer.ok;
    } catch { iAmAdmin = false; }
    return iAmAdmin;
  }

  async function goalsOf(month) {
    if (goalsCache?.месяц === month) return goalsCache.цели;
    const answer = await fetch(`/__goals?month=${encodeURIComponent(month)}`, { cache: "no-store" });
    if (!answer.ok) throw new Error("нет доступа к целям");
    const data = await answer.json();
    goalsCache = { месяц: month, цели: data.цели || {} };
    return goalsCache.цели;
  }

  /** Поле цели под панелью метрики. Появляется, только когда смотрит админ. */
  function goalBox(metricKey) {
    const period = periodSelect.value;
    const tile = tileOf(metricKey);
    if (!tile) return null;

    const box = document.createElement("section");
    box.className = "goal";
    box.hidden = true;

    adminHere().then(async (yes) => {
      if (!yes) return;
      const unit = tile.unit_code;
      const scale = GOAL_SCALE[unit] || 1;

      const title = document.createElement("h4");
      title.className = "how__title";
      title.textContent = "Цель";

      // Месяц выбирается прямо здесь: цель на ноябрь ставят в сентябре, и
      // ради этого переключать весь хитмап на ноябрь незачем.
      const month = document.createElement("select");
      month.className = "goal__month";
      const startYear = Number(period.slice(0, 4)) || new Date().getFullYear();
      for (const year of [startYear - 1, startYear, startYear + 1]) {
        for (let number = 1; number <= 12; number += 1) {
          const key = `${year}-${String(number).padStart(2, "0")}`;
          const option = document.createElement("option");
          option.value = key;
          option.textContent = periodLabel(key);
          month.append(option);
        }
      }
      month.value = /^\d{4}-\d{2}$/.test(period) ? period : `${startYear}-01`;

      const field = document.createElement("input");
      field.className = "goal__field";
      field.inputMode = "decimal";
      field.placeholder = "без цели";

      let current = null;
      /** Подставляет то, что сейчас стоит на выбранном месяце. */
      async function pull() {
        field.disabled = true;
        try {
          current = (await goalsOf(month.value))[metricKey] || null;
          field.value = current?.target === null || current?.target === undefined
            ? "" : String(current.target / scale).replace(".", ",");
          if (current?.direction) pick.value = current.direction;
          state.textContent = current?.target === undefined || current?.target === null
            ? "цели нет" : "сейчас стоит";
        } catch {
          state.textContent = "не смог прочитать цель";
        }
        field.disabled = false;
      }

      const pick = document.createElement("select");
      pick.className = "goal__pick";
      for (const [code, label] of GOAL_DIRECTIONS) {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = label;
        if ((current?.direction || "higher") === code) option.selected = true;
        pick.append(option);
      }

      const unitMark = document.createElement("span");
      unitMark.className = "goal__unit";
      unitMark.textContent = GOAL_UNIT[unit] || "";

      const save = document.createElement("button");
      save.type = "button";
      save.className = "goal__save";
      save.textContent = "Поставить цель";

      const state = document.createElement("span");
      state.className = "goal__state";
      state.textContent = "";

      const row = document.createElement("div");
      row.className = "goal__row";
      row.append(month, field, unitMark, pick, save, state);

      const hint = document.createElement("p");
      hint.className = "goal__note";
      hint.textContent = "Месяц выбирается здесь же — период хитмапа переключать не нужно. "
        + "Пустое поле снимает цель, плитка станет серой. "
        + "Месячная цель делится по прожитым дням периода.";

      month.addEventListener("change", (event) => { event.stopPropagation(); pull(); });

      save.addEventListener("click", async (event) => {
        event.stopPropagation();
        save.disabled = true;
        state.textContent = "сохраняю…";
        const raw = field.value.trim().replace(",", ".");
        const target = raw === "" ? null : Number(raw) * scale;
        const chosen = month.value;
        try {
          if (raw !== "" && !Number.isFinite(target)) throw new Error("не число");
          const answer = await fetch("/__goals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metric: metricKey, month: chosen,
                                   target, direction: pick.value }),
          });
          const data = await answer.json();
          if (!answer.ok) throw new Error(data.error || "не сохранилось");
          goalsCache = null;
          state.textContent = chosen === periodSelect.value
            ? "сохранено · хитмап пересчитывается, обновите через полминуты"
            : `сохранено на ${periodLabel(chosen)}`;
        } catch (error) {
          state.textContent = `не сохранил: ${error.message}`;
        }
        save.disabled = false;
      });
      // Клики внутри блока не должны закрывать плитку.
      for (const element of [field, pick, month, row]) {
        element.addEventListener("click", (event) => event.stopPropagation());
      }

      box.append(title, row, hint);
      box.hidden = false;
      await pull();
    });

    return box;
  }

  // --- «Что будет, если» для финреза ----------------------------------------
  // Финрез собирается из четырёх кусков и делится на выручку компании. Пока
  // это формула на бумаге, спорить о ней можно бесконечно; с ползунками видно
  // цену каждого рычага: снизить списание вдвое и поднять окупаемость на пять
  // пунктов — разные по силе ходы, и теперь это видно, а не обсуждается.

  // Изменение резерва входит в финрез целиком: 0,97 сидит внутри самого
  // расчёта резерва, второй раз его накладывать нельзя. Так же считает плитка.
  const RESERVE_FACTOR = 1;

  /** Сколько миллионов дала метрика за показанный период. */
  function tileMillions(metricKey) {
    const tile = tileOf(metricKey);
    return tile && typeof tile.fact_num === "number" ? tile.fact_num : null;
  }

  /** Факт по всем частям финреза, в миллионах рублей.
   *
   * Берём ровно то, что человек видит на плитках, а выручку компании и
   * движение резерва — из дневных рядов: своих плиток у них нет.
   */
  function finresBase(period) {
    const sebes = tileMillions("otgr_sebes");
    const otgruzheno = tileMillions("otgr_rub");
    const spisanie = tileMillions("spisanie_rub");
    const hranenie = tileMillions("rent_rub");
    if ([sebes, otgruzheno, spisanie, hranenie].some((value) => value === null)) return null;

    const ratio = payload.ряды?.finres_pct;
    const inside = ratio ? daysOfPeriod(ratio.точки, period) : [];
    const vyruchka = inside.reduce((sum, point) => sum + (point.знаменатель || 0), 0) / 1e6;
    if (!vyruchka) return null;

    // Резерв — остаток: в финрез идёт изменение за период, а не сам остаток.
    // База — снимок на первое число, как в мастер-отчёте: если взять
    // последний снимок прошлого месяца, результат разойдётся с плиткой.
    const snapshots = payload.ряды?.reserve_now?.точки || [];
    const [from, to] = periodRange(period);
    const before = snapshots.filter((point) => point.день <= from);
    const within = snapshots.filter((point) => point.день >= from && point.день <= to);
    const rezervDelta = before.length && within.length
      ? (within[within.length - 1].значение - before[before.length - 1].значение) / 1e6
      : null;

    return {
      sebes, spisanie, hranenie, vyruchka,
      rezervDelta: rezervDelta ?? 0,
      rezervKnown: rezervDelta !== null,
      payback: sebes ? (otgruzheno / sebes) * 100 : 0,
    };
  }

  /** Финрез при заданных ползунках. Всё в миллионах рублей. */
  function finresValue(base, state) {
    const sebes = base.sebes * state.sebes;
    const ucenka = sebes * (state.payback / 100) - sebes;
    const parts = {
      ucenka,
      spisanie: -base.spisanie * state.spisanie,
      hranenie: -base.hranenie * state.hranenie,
      rezerv: -base.rezervDelta * state.rezerv * RESERVE_FACTOR,
    };
    const sum = parts.ucenka + parts.spisanie + parts.hranenie + parts.rezerv;
    const vyruchka = base.vyruchka * state.vyruchka;
    return { parts, sum, vyruchka, percent: vyruchka ? (sum / vyruchka) * 100 : 0 };
  }

  // Минус берём типографский: рядом с крупной цифрой дефис читается как
  // перенос, а не как знак.
  const NUMBER_TEXT = (value, digits = 2) =>
    value.toFixed(digits).replace(".", ",").replace("-", "−");
  const PERCENT_TEXT = (value, digits = 2) => `${NUMBER_TEXT(value, digits)}%`;
  const SIGNED_POINTS = (value) =>
    `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2).replace(".", ",")} п.п.`;

  /** Панель ползунков под финрезом. */
  function finresLab(period) {
    const base = finresBase(period);
    const parts = window.HEATMAP_FINRES_PARTS;
    if (!base || !parts) return null;

    const start = { sebes: 1, payback: base.payback, spisanie: 1, hranenie: 1, rezerv: 1, vyruchka: 1 };
    const state = { ...start };
    const zero = finresValue(base, start);

    const box = document.createElement("section");
    box.className = "lab";

    const title = document.createElement("h4");
    title.className = "how__title";
    title.textContent = "Что будет, если";
    box.append(title);

    const note = document.createElement("p");
    note.className = "lab__note";
    note.textContent = "Двигайте части — процент пересчитывается. Прикидка, а не отчёт."
      + (base.rezervKnown ? "" : " Снимка резерва на начало периода нет, движение принято нулевым.");
    box.append(note);

    const out = document.createElement("div");
    out.className = "lab__out";
    const big = document.createElement("b");
    big.className = "lab__big";
    const delta = document.createElement("span");
    delta.className = "lab__delta";
    const breakdown = document.createElement("p");
    breakdown.className = "lab__breakdown";
    const headline = document.createElement("div");
    headline.append(big, delta);
    out.append(headline, breakdown);

    const rows = document.createElement("div");
    rows.className = "lab__rows";
    const controls = [];

    for (const part of parts) {
      const row = document.createElement("label");
      row.className = "lab__row";

      const name = document.createElement("span");
      name.className = "lab__name";
      name.textContent = part.name;
      if (part.hint) name.title = part.hint;

      const value = document.createElement("b");
      value.className = "lab__value";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "lab__slider";
      if (part.key === "payback") {
        slider.min = 0; slider.max = Math.max(120, Math.ceil(base.payback * 2)); slider.step = 1;
        slider.value = String(Math.round(base.payback));
      } else {
        slider.min = 0; slider.max = 200; slider.step = 5; slider.value = "100";
      }

      const hint = document.createElement("span");
      hint.className = "lab__hint";
      hint.textContent = part.hint || "";

      row.append(name, value, slider, hint);
      rows.append(row);
      controls.push({ part, slider, value });

      slider.addEventListener("input", () => {
        state[part.key] = part.key === "payback"
          ? Number(slider.value)
          : Number(slider.value) / 100;
        redraw();
      });
      // Ползунок внутри панели — клик по нему не должен закрывать плитку.
      slider.addEventListener("click", (event) => event.stopPropagation());
    }

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "lab__reset";
    reset.textContent = "Вернуть как есть";
    reset.addEventListener("click", (event) => {
      event.stopPropagation();
      Object.assign(state, start);
      for (const control of controls) {
        control.slider.value = control.part.key === "payback"
          ? String(Math.round(base.payback)) : "100";
      }
      redraw();
    });

    function millions(value) {
      return `${NUMBER_TEXT(value)} млн`;
    }

    function redraw() {
      const now = finresValue(base, state);
      big.textContent = PERCENT_TEXT(now.percent);
      big.className = "lab__big" + (now.percent >= 0 ? " is-good" : "");
      const move = now.percent - zero.percent;
      delta.textContent = Math.abs(move) < 0.005
        ? `как есть · ${millions(now.sum)} ₽`
        : `${SIGNED_POINTS(move)} к факту · ${millions(now.sum)} ₽`;
      delta.className = "lab__delta" + (move > 0.005 ? " is-good" : move < -0.005 ? " is-bad" : "");

      const share = (value) => now.vyruchka ? (value / now.vyruchka) * 100 : 0;
      breakdown.textContent = [
        `уценка ${SIGNED_POINTS(share(now.parts.ucenka))}`,
        `списание ${SIGNED_POINTS(share(now.parts.spisanie))}`,
        `хранение ${SIGNED_POINTS(share(now.parts.hranenie))}`,
        `резерв ${SIGNED_POINTS(share(now.parts.rezerv))}`,
        `выручка компании ${millions(now.vyruchka)} ₽`,
      ].join(" · ");

      for (const { part, value } of controls) {
        if (part.key === "payback") {
          const sebes = base.sebes * state.sebes;
          value.textContent = `${PERCENT_TEXT(state.payback, 1)} · выручка ${millions(sebes * state.payback / 100)}`;
        } else if (part.key === "sebes") {
          value.textContent = millions(base.sebes * state.sebes);
        } else if (part.key === "spisanie") {
          value.textContent = millions(base.spisanie * state.spisanie);
        } else if (part.key === "hranenie") {
          value.textContent = millions(base.hranenie * state.hranenie);
        } else if (part.key === "rezerv") {
          value.textContent = millions(base.rezervDelta * state.rezerv);
        } else {
          value.textContent = millions(base.vyruchka * state.vyruchka);
        }
      }
    }

    redraw();
    box.append(out, rows, reset);
    return box;
  }

  function openDaily(metricKey, cell, options = {}) {
    // Повторный клик по той же плитке закрывает — иначе панель некуда деть.
    if (openMetric === metricKey) { closeDaily(); return; }
    closeDaily();
    openMetric = metricKey;
    cell.classList.add("tile--open");

    const entry = payload.ряды[metricKey];

    // Дневного ряда может не быть вовсе — панель тогда про одну методику.
    if (!entry?.точки?.length) {
      const bare = document.createElement("section");
      bare.className = "daily daily--bare";
      bare.id = "daily";

      const bareHead = document.createElement("header");
      bareHead.className = "daily__head";
      const bareTitle = document.createElement("h3");
      bareTitle.className = "daily__title";
      bareTitle.textContent = tileOf(metricKey)?.metric || metricKey;
      const bareSub = document.createElement("p");
      bareSub.className = "daily__sub";
      bareSub.textContent = "дневного ряда нет — показываю только расчёт";
      const bareClose = document.createElement("button");
      bareClose.className = "daily__close";
      bareClose.type = "button";
      bareClose.textContent = "Закрыть";
      bareClose.addEventListener("click", closeDaily);
      const bareHeading = document.createElement("div");
      bareHeading.append(bareTitle, bareSub);
      bareHead.append(bareHeading, bareClose);

      bare.append(bareHead);
      const how = methodBlock(metricKey);
      if (how) bare.append(how);
      if (metricKey === "backlog") bare.append(backlogBlock());
      const bareGoal = goalBox(metricKey);
      if (bareGoal) bare.append(bareGoal);
      if (metricKey === "finres_pct") {
        const lab = finresLab(periodSelect.value);
        if (lab) bare.append(lab);
      }
      placeDaily(bare, cell);
      writeHash(periodSelect.value);
      if (!options.silent) bare.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

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

    const graph = dailyGraph(list, ghost, entry, unit, periodLabel(previous));
    // Максимум и размах — по показанным дням. Раньше сюда попадал и прошлый
    // период с пунктира: «максимум 1,6 млн» в сентябре был пиком августа.
    const low = Math.min(...list.map((p) => p.значение));
    const high = Math.max(...list.map((p) => p.значение));

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
      : `дней: ${list.length} · ${entry.вид !== "доля" ? "снимков"
           : entry.копить === "месяц" ? "накопительно с начала месяца"
           : "накопительно с начала окна"}: `
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

    box.append(head, graph, facts);
    const how = methodBlock(metricKey);
    if (how) box.append(how);
    if (metricKey === "backlog") box.append(backlogBlock());
    const goal = goalBox(metricKey);
    if (goal) box.append(goal);
    if (metricKey === "finres_pct") {
      const lab = finresLab(periodSelect.value);
      if (lab) box.append(lab);
    }
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

  fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" })
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

  /* ------------------------------------------------------------------ *
   * Режим показа: динамика по месяцам.
   *
   * Плитки отвечают на вопрос «как сейчас», а на совещаниях спрашивают
   * другое — «как менялось». До сих пор ответ собирали в Excel руками перед
   * каждым показом: те же ряды, те же проценты, только вручную. Здесь они
   * строятся из того, что уже посчитано по периодам.
   *
   * Экран на метрику: крупная линия по месяцам, подписи значений, пунктир
   * тренда и итог словами. Листается стрелками, пробелом и колесом, Escape
   * закрывает. Считать ничего не надо — данные уже в payload.
   * ------------------------------------------------------------------ */
  const POKAZ_NS = "http://www.w3.org/2000/svg";
  let pokazIndex = 0;
  let pokazSpisok = [];

  const MESYACY_KOROTKO = ["янв", "фев", "мар", "апр", "май", "июн",
                           "июл", "авг", "сен", "окт", "ноя", "дек"];

  function mesyacPodpis(klyuch) {
    const [god, mesyac] = klyuch.split("-");
    return MESYACY_KOROTKO[Number(mesyac) - 1] + " " + god.slice(2);
  }

  const bezNbsp = (text) => String(text || "").replace(/ /g, " ");

  /** Ряд по месяцам для одной метрики: только месяцы и только со значением. */
  function ryadPoMesyacam(metricKey) {
    const mesyacy = Object.keys(payload.поПериодам || {})
      .filter((k) => /^\d{4}-\d{2}$/.test(k))
      .sort();
    const tochki = [];
    for (const mesyac of mesyacy) {
      const plitka = (payload.поПериодам[mesyac] || [])
        .find((t) => t.metric_key === metricKey);
      if (!plitka || typeof plitka.fact_num !== "number") continue;
      tochki.push({ mesyac, znachenie: plitka.fact_num, podpis: bezNbsp(plitka.fact_txt) });
    }
    return tochki;
  }

  /** Линия тренда по наименьшим квадратам — та же, что рисует Excel. */
  function trendRyada(tochki) {
    const n = tochki.length;
    if (n < 3) return null;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    tochki.forEach((t, i) => {
      sx += i; sy += t.znachenie; sxy += i * t.znachenie; sxx += i * i;
    });
    const znamenatel = n * sxx - sx * sx;
    if (!znamenatel) return null;
    const naklon = (n * sxy - sx * sy) / znamenatel;
    return { naklon, nachalo: (sy - naklon * sx) / n };
  }

  function uzelSvg(imya, atributy) {
    const uzel = document.createElementNS(POKAZ_NS, imya);
    Object.entries(atributy).forEach(([klyuch, znachenie]) =>
      uzel.setAttribute(klyuch, znachenie));
    return uzel;
  }

  function narisovatPokaz(tochki) {
    const W = 1000, H = 430, sverhu = 48, snizu = 54, sboku = 56;
    const znacheniya = tochki.map((t) => t.znachenie);
    let niz = Math.min(...znacheniya, 0);
    let verh = Math.max(...znacheniya);
    if (verh === niz) verh = niz + 1;
    const zapas = (verh - niz) * 0.18;
    verh += zapas;
    if (niz < 0) niz -= zapas;

    const x = (i) => sboku + (tochki.length === 1
      ? (W - 2 * sboku) / 2
      : (i / (tochki.length - 1)) * (W - 2 * sboku));
    const y = (v) => sverhu + (1 - (v - niz) / (verh - niz)) * (H - sverhu - snizu);

    const svg = uzelSvg("svg", {
      class: "pokazSvg", viewBox: "0 0 " + W + " " + H,
      preserveAspectRatio: "xMidYMid meet",
    });

    // Нулевую линию рисуем только там, где ряд её пересекает: у финреза
    // это важная отметка, у остальных метрик — лишняя черта по низу.
    if (niz < 0 && verh > 0) {
      svg.appendChild(uzelSvg("line", {
        class: "pokazZero", x1: sboku, x2: W - sboku, y1: y(0), y2: y(0),
      }));
    }

    const put = tochki.map((t, i) =>
      (i ? "L" : "M") + x(i).toFixed(1) + "," + y(t.znachenie).toFixed(1)).join(" ");
    svg.appendChild(uzelSvg("path", {
      class: "pokazArea",
      d: put + " L" + x(tochki.length - 1).toFixed(1) + "," + y(niz)
         + " L" + x(0).toFixed(1) + "," + y(niz) + " Z",
    }));
    svg.appendChild(uzelSvg("path", { class: "pokazLine", d: put }));

    const naklon = trendRyada(tochki);
    if (naklon) {
      svg.appendChild(uzelSvg("line", {
        class: "pokazTrend",
        x1: x(0), y1: y(naklon.nachalo),
        x2: x(tochki.length - 1),
        y2: y(naklon.nachalo + naklon.naklon * (tochki.length - 1)),
      }));
    }

    // Подписываем каждую точку: пропуск через одну выглядел так, будто у
    // месяца нет цифры. Чтобы соседние не наезжали, на длинном ряду они идут
    // по очереди выше и ниже линии, а месяцы снизу — через один: их читают
    // как шкалу, и там пропуск не мешает.
    const tesno = tochki.length > 14;
    tochki.forEach((tochka, i) => {
      svg.appendChild(uzelSvg("circle", {
        class: "pokazDot", cx: x(i), cy: y(tochka.znachenie), r: 4,
      }));
      const vverh = !tesno || i % 2 === 0;
      const znachenie = uzelSvg("text", {
        class: "pokazValue" + (tesno ? " pokazValue--tesno" : ""),
        x: x(i), y: y(tochka.znachenie) + (vverh ? -14 : 22),
        "text-anchor": "middle",
      });
      znachenie.textContent = tochka.podpis;
      svg.appendChild(znachenie);
      if (tesno && i % 2 && i !== tochki.length - 1) return;
      const mesyac = uzelSvg("text", {
        class: "pokazMonth", x: x(i), y: H - 18, "text-anchor": "middle",
      });
      mesyac.textContent = mesyacPodpis(tochka.mesyac);
      svg.appendChild(mesyac);
    });
    return svg;
  }

  /** Итог словами: откуда, куда и в какую сторону тренд. */
  function itogSlovami(tochki) {
    if (tochki.length < 2) return "";
    const pervoe = tochki[0];
    const posledneye = tochki[tochki.length - 1];
    const naklon = trendRyada(tochki);
    const kuda = !naklon || Math.abs(naklon.naklon) < 1e-9 ? "держится ровно"
      : naklon.naklon > 0 ? "растёт" : "снижается";
    const raznica = posledneye.znachenie - pervoe.znachenie;
    const chislo = Math.abs(raznica).toLocaleString("ru-RU",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return mesyacPodpis(pervoe.mesyac) + " → " + mesyacPodpis(posledneye.mesyac) + ": "
      + pervoe.podpis + " → " + posledneye.podpis
      + " (" + (raznica > 0 ? "+" : "−") + bezNbsp(chislo) + "), тренд " + kuda;
  }



  /* Второй вид показа: блок целиком, по четыре графика на экран.
   *
   * Сетка из двадцати трёх карточек оказалась кашей: графики мелкие, цифры
   * не читаются, и смотреть на них с проектора невозможно. Здесь тот же
   * обзор, но порциями по смыслу — «Деньги», «Затраты», «Операционка», —
   * и каждый график крупный настолько, чтобы его было видно из зала.
   * Клик по любому открывает его на весь экран.
   */
  // Какой вид показа открыт: слайды по одному или блок целиком.
  let pokazVid = "po-odnomu";
  let blokIndex = 0;

  /** Показатели, разложенные по блокам в том же порядке, что на плитках. */
  function blokiPokaza() {
    const poryadok = [];
    const poBlokam = new Map();
    (payload.плитки || []).forEach((plitka) => {
      const blok = plitka.block_name || "Прочее";
      const nashe = pokazSpisok.find((item) => item.metric_key === plitka.metric_key);
      if (!nashe) return;
      if (!poBlokam.has(blok)) { poBlokam.set(blok, []); poryadok.push(blok); }
      poBlokam.get(blok).push(nashe);
    });
    // Блок из одного показателя отдельным экраном не показываем — он
    // потеряется; подклеиваем к предыдущему.
    const itog = [];
    poryadok.forEach((blok) => {
      const spisok = poBlokam.get(blok);
      if (spisok.length === 1 && itog.length) {
        itog[itog.length - 1].spisok.push(...spisok);
        itog[itog.length - 1].imya += " и " + blok.toLowerCase();
        return;
      }
      itog.push({ imya: blok, spisok });
    });
    // Больше четырёх на экран не помещается крупно — режем на страницы.
    const stranicy = [];
    itog.forEach((blok) => {
      for (let i = 0; i < blok.spisok.length; i += 4) {
        const kusok = blok.spisok.slice(i, i + 4);
        const nomer = blok.spisok.length > 4 ? ` · ${Math.floor(i / 4) + 1}` : "";
        stranicy.push({ imya: blok.imya + nomer, spisok: kusok });
      }
    });
    return stranicy;
  }

  function narisovatBlok() {
    const sloy = document.getElementById("pokaz");
    const mesto = sloy?.querySelector(".pokazHolst");
    if (!mesto) return;
    const stranicy = blokiPokaza();
    if (!stranicy.length) return;
    blokIndex = Math.min(blokIndex, stranicy.length - 1);
    const stranica = stranicy[blokIndex];

    sloy.querySelector(".pokazTitle").textContent = stranica.imya;
    sloy.querySelector(".pokazSchet").textContent =
      (blokIndex + 1) + " из " + stranicy.length;
    sloy.querySelector(".pokazItog").textContent =
      "Клик по графику открывает показатель на весь экран";

    const setka = document.createElement("div");
    setka.className = "pokazBloki";
    stranica.spisok.forEach((item) => {
      const karta = document.createElement("button");
      karta.type = "button";
      karta.className = "blokKarta";
      const naklon = trendRyada(item.tochki);
      const posledneye = item.tochki[item.tochki.length - 1];
      const kuda = !naklon || Math.abs(naklon.naklon) < 1e-9 ? "flat"
        : naklon.naklon > 0 ? "up" : "down";
      karta.innerHTML = '<span class="blokShapka">'
        + '<span class="blokImya"></span><span class="blokChislo"></span></span>';
      karta.querySelector(".blokImya").textContent = item.metric;
      karta.querySelector(".blokChislo").textContent = posledneye.podpis;
      karta.querySelector(".blokChislo").classList.add("trend-" + kuda);
      karta.appendChild(narisovatBlokGrafik(item.tochki));
      karta.addEventListener("click", () => {
        pokazIndex = pokazSpisok.indexOf(item);
        pokazVid = "po-odnomu";
        pokazatEkran();
      });
      setka.appendChild(karta);
    });
    mesto.replaceChildren(setka);
  }

  /** График для блока: крупнее мини-спарклайна, но без подписи каждой точки. */
  function narisovatBlokGrafik(tochki) {
    const W = 460, H = 178, pole = 26;
    const znacheniya = tochki.map((t) => t.znachenie);
    const niz = Math.min(...znacheniya, 0);
    const verh = Math.max(...znacheniya);
    const razmah = verh === niz ? 1 : verh - niz;
    const x = (i) => pole + (i / Math.max(tochki.length - 1, 1)) * (W - 2 * pole);
    const y = (v) => pole + (1 - (v - niz) / razmah) * (H - 2 * pole - 14);

    const svg = uzelSvg("svg", {
      class: "blokSvg", viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none",
    });
    const put = tochki.map((t, i) =>
      (i ? "L" : "M") + x(i).toFixed(1) + "," + y(t.znachenie).toFixed(1)).join(" ");
    svg.appendChild(uzelSvg("path", {
      class: "pokazArea",
      d: put + " L" + x(tochki.length - 1) + "," + y(niz) + " L" + x(0) + "," + y(niz) + " Z",
    }));
    svg.appendChild(uzelSvg("path", { class: "pokazLine", d: put }));
    const naklon = trendRyada(tochki);
    if (naklon) {
      svg.appendChild(uzelSvg("line", {
        class: "pokazTrend", x1: x(0), y1: y(naklon.nachalo),
        x2: x(tochki.length - 1),
        y2: y(naklon.nachalo + naklon.naklon * (tochki.length - 1)),
      }));
    }
    // Без цифр график читается как узор: видно колебание, но не видно, о
    // каких величинах речь. Подписываем то, ради чего на него и смотрят —
    // начало, конец, пик и провал. Все точки сюда не влезут, а эти четыре
    // отвечают на вопрос «сколько было и сколько стало».
    const znachimye = new Map();
    const maks = znacheniya.indexOf(Math.max(...znacheniya));
    const min = znacheniya.indexOf(Math.min(...znacheniya));
    [0, tochki.length - 1, maks, min].forEach((i) => znachimye.set(i, true));

    tochki.forEach((tochka, i) => {
      if (!znachimye.has(i)) return;
      svg.appendChild(uzelSvg("circle", {
        class: "pokazDot", cx: x(i), cy: y(tochka.znachenie), r: 3.5,
      }));
      // Подпись уводим от края, иначе крайние значения обрезаются рамкой.
      const kray = i === 0 ? "start" : i === tochki.length - 1 ? "end" : "middle";
      const podpis = uzelSvg("text", {
        class: "blokZnachenie", x: x(i), y: y(tochka.znachenie) - 9,
        "text-anchor": kray,
      });
      podpis.textContent = tochka.podpis;
      svg.appendChild(podpis);
    });

    [0, tochki.length - 1].forEach((i) => {
      const podpis = uzelSvg("text", {
        class: "blokPodpis", x: x(i), y: H - 4,
        "text-anchor": i ? "end" : "start",
      });
      podpis.textContent = mesyacPodpis(tochki[i].mesyac);
      svg.appendChild(podpis);
    });
    return svg;
  }

  function pokazatEkran() {
    const sloy = document.getElementById("pokaz");
    if (!sloy || !pokazSpisok.length) return;
    sloy.dataset.vid = pokazVid;
    sloy.querySelectorAll(".pokazVid").forEach((knopka) => {
      knopka.classList.toggle("is-on", knopka.dataset.vid === pokazVid);
    });

    if (pokazVid === "bloki") {
      narisovatBlok();
      return;
    }

    const tekushchiy = pokazSpisok[pokazIndex];
    sloy.querySelector(".pokazTitle").textContent = tekushchiy.metric;
    sloy.querySelector(".pokazSchet").textContent =
      (pokazIndex + 1) + " из " + pokazSpisok.length;
    sloy.querySelector(".pokazItog").textContent = itogSlovami(tekushchiy.tochki);
    sloy.querySelector(".pokazHolst").replaceChildren(narisovatPokaz(tekushchiy.tochki));
  }

  function listatPokaz(shag) {
    if (!pokazSpisok.length) return;
    if (pokazVid === "bloki") {
      const vsego = blokiPokaza().length;
      blokIndex = (blokIndex + shag + vsego) % vsego;
    } else {
      pokazIndex = (pokazIndex + shag + pokazSpisok.length) % pokazSpisok.length;
    }
    pokazatEkran();
  }

  function otkrytPokaz() {
    // Берём метрики, у которых история хотя бы за полгода: линия из двух
    // точек — не динамика, а повод для неверных выводов.
    pokazSpisok = (payload.плитки || [])
      .map((plitka) => ({
        metric: plitka.metric,
        metric_key: plitka.metric_key,
        tochki: ryadPoMesyacam(plitka.metric_key),
      }))
      .filter((item) => item.tochki.length >= 6);
    if (!pokazSpisok.length) return;

    pokazIndex = 0;
    let sloy = document.getElementById("pokaz");
    if (!sloy) {
      sloy = document.createElement("div");
      sloy.id = "pokaz";
      sloy.className = "pokaz";
      sloy.innerHTML = '<div class="pokazPanel">'
        + '<div class="pokazShapka"><div>'
        + '<p class="pokazNad">Динамика по месяцам</p>'
        + '<h2 class="pokazTitle"></h2></div>'
        + '<span class="pokazVidy">'
        + '<button class="pokazVid is-on" data-vid="po-odnomu" type="button">По одному</button>'
        + '<button class="pokazVid" data-vid="bloki" type="button">По блокам</button>'
        + '</span>'
        + '<span class="pokazSchet"></span>'
        + '<button class="pokazZakryt" type="button" title="Escape">×</button></div>'
        + '<div class="pokazHolst"></div>'
        + '<p class="pokazItog"></p>'
        + '<div class="pokazNiz">'
        + '<button class="pokazStrelka" data-shag="-1" type="button">← Назад</button>'
        + '<span class="pokazPodskazka">стрелки, пробел или колесо — следующий показатель</span>'
        + '<button class="pokazStrelka" data-shag="1" type="button">Вперёд →</button>'
        + '</div></div>';
      document.body.appendChild(sloy);
      sloy.querySelector(".pokazZakryt").addEventListener("click", zakrytPokaz);
      sloy.addEventListener("click", (event) => {
        if (event.target === sloy) zakrytPokaz();
      });
      sloy.querySelectorAll(".pokazVid").forEach((knopka) => {
        knopka.addEventListener("click", () => {
          pokazVid = knopka.dataset.vid;
          pokazatEkran();
        });
      });
      sloy.querySelectorAll(".pokazStrelka").forEach((knopka) => {
        knopka.addEventListener("click", () => listatPokaz(Number(knopka.dataset.shag)));
      });
      sloy.addEventListener("wheel", (event) => {
        event.preventDefault();
        listatPokaz(event.deltaY > 0 ? 1 : -1);
      }, { passive: false });
    }
    sloy.hidden = false;
    document.body.classList.add("pokaz-on");
    pokazatEkran();
  }

  function zakrytPokaz() {
    const sloy = document.getElementById("pokaz");
    if (sloy) sloy.hidden = true;
    document.body.classList.remove("pokaz-on");
  }

  document.getElementById("pokazBtn")?.addEventListener("click", otkrytPokaz);

  document.addEventListener("keydown", (event) => {
    const sloy = document.getElementById("pokaz");
    if (!sloy || sloy.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); zakrytPokaz(); }
    if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
      event.preventDefault(); listatPokaz(1);
    }
    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault(); listatPokaz(-1);
    }
  });
})();
