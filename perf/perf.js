(() => {
  "use strict";

  // Данные считает «12 — Производительность на сайт.py» теми же запросами, что
  // датасеты 753 и 754 в Superset. Здесь только отрисовка.
  const DATA_URL = "../data/perf.json";

  const $ = (id) => document.getElementById(id);
  const message = $("message");
  const box = $("perf");
  const stamp = $("stamp");
  const tabs = [...document.querySelectorAll(".tab")];

  let payload = null;
  let contour = "presort";
  let showAllStaff = false;

  /* Один период на всю страницу.

     Раньше каждый блок жил в своём времени: плитки показывали последнюю неделю
     и сразу всю историю, графики — свои последние N точек, рейтинг людей — свой
     выбранный месяц. Посмотреть страницу «за август» было нельзя, и по любой
     цифре приходилось гадать, какой промежуток она описывает.

     Периоды календарные, а не скользящие окна: «последние три месяца» никому не
     отчёт, а третий квартал — отчёт. Ключи те же, что в остальной отчётности:
     2026-08, 2026-Q3, 2026-H2. */
  const PERIODS = [
    { key: "month", label: "месяц" },
    { key: "quarter", label: "квартал" },
    { key: "half", label: "полугодие" },
    { key: "all", label: "всё время" },
  ];
  let periodKey = "month";
  let periodValue = null;   // конкретный ключ выбранного периода
  const MIN_SHIFTS = 5;     // порог смен для рейтинга людей

  const SHIFT_WORDS = ["смена", "смены", "смен"];
  const DAY_WORDS = ["день", "дня", "дней"];
  const ROMAN = ["I", "II", "III", "IV"];
  const MONTHS_FULL = ["январь", "февраль", "март", "апрель", "май", "июнь",
                       "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

  /** Склонение по числу: 3 смены, 5 смен; 1 день, 31 день, 22 дня. */
  function plural(count, words) {
    const n = Math.abs(count) % 100;
    if (n > 10 && n < 20) return words[2];
    const last = n % 10;
    return last === 1 ? words[0] : last >= 2 && last <= 4 ? words[1] : words[2];
  }
  const shiftWord = (count) => plural(count, SHIFT_WORDS);
  const dayWord = (count) => plural(count, DAY_WORDS);

  const staffMonthLabel = (key) => `${MONTHS_FULL[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;

  /** До какого дня данные вообще есть: по нему считаем, закрыт период или нет. */
  function dataEdge() {
    const stampText = String(payload?.обновлено || "").slice(0, 10);
    const parsed = stampText ? new Date(stampText + "T00:00:00") : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  /** Календарные периоды контура, свежие сверху: из каких месяцев состоит каждый. */
  function periodList(data) {
    const months = (data.поМесяцам || []).map((m) => m.месяц);
    if (!months.length) return [];
    const edge = dataEdge();
    // Период не закрыт, пока не наступил месяц после последнего в нём.
    const isOpen = (last) => {
      const year = Number(last.slice(0, 4));
      const month = Number(last.slice(5)) - 1;
      return new Date(year, month + 1, 1) > edge;
    };

    if (periodKey === "all") {
      return [{ key: "all", label: "всё время", months, open: isOpen(months[months.length - 1]) }];
    }

    const groups = new Map();
    months.forEach((month) => {
      const year = month.slice(0, 4);
      const index = Number(month.slice(5)) - 1;
      const key = periodKey === "month" ? month
        : periodKey === "quarter" ? `${year}-Q${Math.floor(index / 3) + 1}`
          : `${year}-H${index < 6 ? 1 : 2}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(month);
    });

    return [...groups.entries()].map(([key, list]) => ({
      key,
      months: list,
      open: isOpen(list[list.length - 1]),
      label: periodKey === "month" ? staffMonthLabel(key)
        : periodKey === "quarter" ? `${ROMAN[Number(key.slice(6)) - 1]} квартал ${key.slice(0, 4)}`
          : `${ROMAN[Number(key.slice(6)) - 1]} полугодие ${key.slice(0, 4)}`,
    })).reverse();
  }

  /** Выбранный период и предыдущий такой же — для сравнения. */
  function currentPeriod(data) {
    const list = periodList(data);
    if (!list.length) return null;
    if (!list.some((item) => item.key === periodValue)) {
      // По умолчанию — последний закрытый: в идущем месяце цифры ещё не полные.
      periodValue = (list.find((item) => !item.open) || list[0]).key;
    }
    const at = list.findIndex((item) => item.key === periodValue);
    return { list, current: list[at], previous: list[at + 1] || null };
  }

  /** Всё, что показывает страница, пересчитанное на месяцы периода. */
  function slice(data, months) {
    const inside = new Set(months);
    const monthOf = (iso) => iso.slice(0, 7);

    const byMonth = (data.поМесяцам || []).filter((m) => inside.has(m.месяц));
    const byDay = (data.поДням || []).filter((d) => inside.has(monthOf(d.день)));
    // Неделю относим к месяцу её понедельника: иначе неделя на стыке попадёт
    // в оба периода и итог по неделям разойдётся с итогом по месяцам.
    const byWeek = (data.поНеделям || [])
      .filter((w) => inside.has(isoDay(mondayOfWeek(w.неделя)).slice(0, 7)));

    const fold = (rows, key, sums) => {
      const acc = new Map();
      rows.filter((r) => inside.has(r.месяц)).forEach((row) => {
        const found = acc.get(row[key]) || { ...row, ...Object.fromEntries(sums.map((s) => [s, 0])) };
        sums.forEach((s) => { found[s] += row[s] || 0; });
        acc.set(row[key], found);
      });
      return [...acc.values()];
    };

    const hours = fold(data.поЧасам || [], "час", ["штук", "человекочасов"])
      .map((r) => ({ ...r, на_час: r.человекочасов ? +(r.штук / r.человекочасов).toFixed(1) : 0 }))
      .sort((a, b) => a.час - b.час);
    const weekdays = fold(data.поДнямНедели || [], "номер_дня", ["штук", "смен", "дней"])
      .map((r) => ({ ...r, на_смену: r.смен ? +(r.штук / r.смен).toFixed(1) : 0 }))
      .sort((a, b) => a.номер_дня - b.номер_дня);

    const staff = [];
    (data.сотрудники || []).forEach((person) => {
      const rows = (person.поМесяцам || []).filter((m) => inside.has(m.месяц));
      const shifts = rows.reduce((sum, r) => sum + r.смен, 0);
      if (!shifts) return;   // в этом периоде не работал — в рейтинге ему не место
      const qty = rows.reduce((sum, r) => sum + r.штук, 0);
      staff.push({
        ...person,
        штук: qty,
        смен: shifts,
        на_смену: +(qty / shifts).toFixed(1),
        мало_смен: shifts < MIN_SHIFTS,
      });
    });
    staff.sort((a, b) => (a.мало_смен - b.мало_смен) || (b.на_смену - a.на_смену));

    const qty = byMonth.reduce((sum, m) => sum + m.штук, 0);
    const shifts = byMonth.reduce((sum, m) => sum + m.смен, 0);
    return {
      месяцы: byMonth, дни: byDay, недели: byWeek, часы: hours, дниНедели: weekdays,
      сотрудники: staff,
      итог: {
        штук: qty,
        смен: shifts,
        на_смену: shifts ? +(qty / shifts).toFixed(1) : 0,
        человек: staff.length,
      },
    };
  }
  let barStep = "недели";
  // Пока человек сам не выбрал шаг, он подставляется по длине периода.
  let shagVybran = false;

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
    message.style.display = text ? "block" : "none";
  }

  const count = (value) => Math.round(Number(value) || 0).toLocaleString("ru-RU");
  const one = (value) => Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 });

  function dayLabel(iso) {
    const [, month, day] = String(iso).split("-");
    return `${day}.${month}`;
  }

  const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн",
                  "июл", "авг", "сен", "окт", "ноя", "дек"];

  function monthLabel(key) {
    const [year, month] = String(key).split("-").map(Number);
    return `${MONTHS[month - 1]} ${String(year).slice(2)}`;
  }

  // --- Подсказка --------------------------------------------------------------

  let tip = null;

  function showTip(html, event) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tip";
      document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.hidden = false;
    moveTip(event);
  }

  function moveTip(event) {
    if (!tip) return;
    const box = tip.getBoundingClientRect();
    let x = event.clientX + 14;
    let y = event.clientY + 14;
    if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - 14;
    if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - 14;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }

  const hideTip = () => { if (tip) tip.hidden = true; };

  function bindTip(element, html) {
    element.addEventListener("mouseenter", (event) => showTip(html, event));
    element.addEventListener("mousemove", moveTip);
    element.addEventListener("mouseleave", hideTip);
    element.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      if (touch) showTip(html, { clientX: touch.clientX, clientY: touch.clientY });
      try { navigator.vibrate?.(8); } catch { /* нет поддержки */ }
    }, { passive: true });
    element.addEventListener("touchend", () => setTimeout(hideTip, 2200), { passive: true });
  }

  // --- Графики ----------------------------------------------------------------
  // В Superset здесь был ряд столбиков, и один выброс сплющивал год. Тут иначе:
  // линия дня, поверх неё скользящее среднее за неделю, шкала обрезана по
  // перцентилю, а выбросы помечены, а не давят всё остальное.

  const SVG = "http://www.w3.org/2000/svg";

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const low = Math.floor(pos);
    const rest = pos - low;
    return sorted[low + 1] !== undefined
      ? sorted[low] + rest * (sorted[low + 1] - sorted[low])
      : sorted[low];
  }

  /** Скользящее среднее: тренд там, где дневной ряд рвано скачет. */
  function rolling(values, window) {
    return values.map((_, index) => {
      const from = Math.max(0, index - window + 1);
      const slice = values.slice(from, index + 1);
      return slice.reduce((sum, value) => sum + value, 0) / slice.length;
    });
  }

  /* Линия вместо столбиков.
   *
   * Столбики отвечали на вопрос «сколько», хотя в производительности важнее
   * «куда идёт». Линия показывает движение, а подпись над точкой возвращает
   * само число — но только когда точек мало: на тридцати подписи слипаются
   * в кашу и мешают читать сам ход кривой.
   */
  const PODPISI_DO = 16;

  function renderLine(list, options) {
    const opts = options || {};
    const label = opts.label || ((row) => row.ключ || "");
    const wrap = document.createElement("div");
    wrap.className = "chart chart--series";

    const values = list.map((row) => row.на_смену);
    const max = Math.max(...values, 1);
    const cap = max * 1.18;
    const avg = values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
    const podpisi = list.length <= PODPISI_DO;

    const W = 1000;
    const H = 240;
    const padTop = podpisi ? 30 : 16;
    const padBottom = 24;
    const x = (i) => (list.length === 1 ? W / 2 : (i / (list.length - 1)) * W);
    const y = (v) => padTop + (1 - Math.min(v, cap) / cap) * (H - padTop - padBottom);

    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "chart__svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");

    const sred = document.createElementNS(SVG, "line");
    sred.setAttribute("class", "chart__median");
    sred.setAttribute("x1", 0);
    sred.setAttribute("x2", W);
    sred.setAttribute("y1", y(avg));
    sred.setAttribute("y2", y(avg));
    svg.appendChild(sred);

    const path = values
      .map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1))
      .join(" ");

    const area = document.createElementNS(SVG, "path");
    area.setAttribute("class", "chart__area");
    area.setAttribute("d", path + " L" + x(values.length - 1) + "," + (H - padBottom) +
                      " L" + x(0) + "," + (H - padBottom) + " Z");
    svg.appendChild(area);

    const line = document.createElementNS(SVG, "path");
    line.setAttribute("class", "chart__line");
    line.setAttribute("d", path);
    svg.appendChild(line);

    const canvas = document.createElement("div");
    canvas.className = "chart__canvas";
    canvas.appendChild(svg);

    const dots = document.createElement("div");
    dots.className = "chart__dots";
    list.forEach((row, index) => {
      const dot = document.createElement("i");
      if (row.неполная) dot.className = "isPartial";
      dot.style.left = (x(index) / W * 100).toFixed(2) + "%";
      dot.style.top = (y(row.на_смену) / H * 100).toFixed(2) + "%";
      const prev = index > 0 ? list[index - 1].на_смену : null;
      const delta = prev ? ((row.на_смену - prev) / prev) * 100 : null;
      bindTip(dot,
        "<b>" + label(row) + "</b>" +
        "<span>" + one(row.на_смену) + " штук за смену" +
        (row.неполная ? " — период не закончен" : "") + "</span>" +
        (row.штук ? "<span>" + count(row.штук) + " штук · " + count(row.смен) +
         " смен</span>" : "") +
        (delta === null ? "" : "<span>" + (delta >= 0 ? "+" : "") +
         delta.toFixed(0) + "% к прошлому</span>"));
      dots.appendChild(dot);

      if (!podpisi) return;
      const value = document.createElement("b");
      value.className = "chart__value";
      value.textContent = Math.round(row.на_смену);
      value.style.left = (x(index) / W * 100).toFixed(2) + "%";
      value.style.top = (y(row.на_смену) / H * 100).toFixed(2) + "%";
      dots.appendChild(value);
    });
    canvas.appendChild(dots);

    const scale = document.createElement("div");
    scale.className = "chart__scale";
    scale.innerHTML = "<span>" + Math.round(cap) + "</span><span>" +
      Math.round(cap / 2) + "</span><span>0</span>";

    const axis = document.createElement("div");
    axis.className = "chart__axis";
    const step = Math.max(1, Math.ceil(list.length / 12));
    list.forEach((row, index) => {
      if (index % step && index !== list.length - 1) return;
      const mark = document.createElement("span");
      mark.textContent = label(row);
      mark.style.left = (x(index) / W * 100).toFixed(2) + "%";
      axis.appendChild(mark);
    });

    const legend = document.createElement("div");
    legend.className = "chart__legend";
    legend.innerHTML = "<span class=\"k k--line\"></span>"
      + (opts.legenda || "штук за смену")
      + "<span class=\"k k--median\"></span>среднее " + one(avg);

    const plot = document.createElement("div");
    plot.className = "chart__plot";
    plot.append(scale, canvas);

    wrap.append(legend, plot, axis);
    return wrap;
  }

  function renderDaily(list) {
    const wrap = document.createElement("div");
    wrap.className = "chart";

    const values = list.map((row) => row.на_смену);
    const sorted = [...values].sort((a, b) => a - b);
    // Потолок шкалы — 95-й перцентиль: единственный день на 312 штук иначе
    // прижимает рабочие 60-90 ко дну, и график перестаёт что-либо показывать.
    const cap = Math.max(quantile(sorted, 0.95) * 1.15, 10);
    const median = quantile(sorted, 0.5);
    const avg7 = rolling(values, 7);

    const W = 1000;
    const H = 260;
    const padTop = 16;
    const padBottom = 24;
    const x = (i) => (list.length === 1 ? W / 2 : (i / (list.length - 1)) * W);
    const y = (v) => padTop + (1 - Math.min(v, cap) / cap) * (H - padTop - padBottom);

    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "chart__svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");

    const med = document.createElementNS(SVG, "line");
    med.setAttribute("class", "chart__median");
    med.setAttribute("x1", 0);
    med.setAttribute("x2", W);
    med.setAttribute("y1", y(median));
    med.setAttribute("y2", y(median));
    svg.appendChild(med);

    const path = values
      .map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1))
      .join(" ");

    const area = document.createElementNS(SVG, "path");
    area.setAttribute("class", "chart__area");
    area.setAttribute("d", path + " L" + x(values.length - 1) + "," + (H - padBottom) +
                      " L" + x(0) + "," + (H - padBottom) + " Z");
    svg.appendChild(area);

    const line = document.createElementNS(SVG, "path");
    line.setAttribute("class", "chart__line");
    line.setAttribute("d", path);
    svg.appendChild(line);

    const trend = document.createElementNS(SVG, "path");
    trend.setAttribute("class", "chart__trend");
    trend.setAttribute("d", avg7
      .map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1))
      .join(" "));
    svg.appendChild(trend);

    const canvas = document.createElement("div");
    canvas.className = "chart__canvas";
    canvas.appendChild(svg);

    // Точки поверх холста обычными элементами: внутри растянутого по ширине
    // SVG круг превратился бы в эллипс.
    const dots = document.createElement("div");
    dots.className = "chart__dots";
    list.forEach((row, index) => {
      const dot = document.createElement("i");
      const over = row.на_смену > cap;
      if (over) dot.className = "isOver";
      dot.style.left = (x(index) / W * 100).toFixed(2) + "%";
      dot.style.top = (y(row.на_смену) / H * 100).toFixed(2) + "%";
      bindTip(dot,
        "<b>" + dayLabel(row.день) + "</b>" +
        "<span>" + one(row.на_смену) + " штук за смену" + (over ? " — выброс" : "") + "</span>" +
        "<span>" + count(row.штук) + " штук · " + count(row.смен) + " смен · " +
        count(row.человек) + " человек</span>" +
        "<span>среднее за неделю " + one(avg7[index]) + "</span>");
      dots.appendChild(dot);

      // Число над точкой — только когда дней мало. На месяце их за тридцать,
      // и подписи сливаются в сплошную полосу поверх самой линии.
      if (list.length > PODPISI_DO) return;
      const value = document.createElement("b");
      value.className = "chart__value";
      value.textContent = Math.round(row.на_смену);
      value.style.left = (x(index) / W * 100).toFixed(2) + "%";
      value.style.top = (y(row.на_смену) / H * 100).toFixed(2) + "%";
      dots.appendChild(value);
    });
    canvas.appendChild(dots);

    const scale = document.createElement("div");
    scale.className = "chart__scale";
    scale.innerHTML = "<span>" + Math.round(cap) + "</span><span>" +
      Math.round(cap / 2) + "</span><span>0</span>";

    const axis = document.createElement("div");
    axis.className = "chart__axis";
    const step = Math.max(1, Math.ceil(list.length / 10));
    list.forEach((row, index) => {
      if (index % step) return;
      const mark = document.createElement("span");
      mark.textContent = dayLabel(row.день);
      mark.style.left = (x(index) / W * 100).toFixed(2) + "%";
      axis.appendChild(mark);
    });

    const legend = document.createElement("div");
    legend.className = "chart__legend";
    legend.innerHTML =
      "<span class=\"k k--line\"></span>день" +
      "<span class=\"k k--trend\"></span>среднее за неделю" +
      "<span class=\"k k--median\"></span>медиана " + one(median) +
      "<span class=\"k k--over\"></span>выше " + Math.round(cap);

    const plot = document.createElement("div");
    plot.className = "chart__plot";
    plot.append(scale, canvas);

    wrap.append(legend, plot, axis);
    return wrap;
  }

  // --- Недели -----------------------------------------------------------------
  // Месяц для операционки слишком крупный: смена графика видна через три недели
  // после того, как случилась. Дни, наоборот, скачут. Неделя — тот шаг, на
  // котором говорят «на этой неделе просели». Считаем из дневного ряда:
  // сумма штук делится на сумму смен, а не усредняются дневные средние.

  /** Понедельник недели, в которую попал день. */
  function weekStart(iso) {
    const date = new Date(`${iso}T00:00:00`);
    const shift = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - shift);
    return date;
  }

  const isoDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    + `-${String(date.getDate()).padStart(2, "0")}`;

  /** Номер ISO-недели — для подписи «W36». */
  function isoWeekNumber(date) {
    const thursday = new Date(date);
    thursday.setDate(thursday.getDate() + 4 - ((date.getDay() + 6) % 7) - 3);
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    return Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  }

  /** Понедельник ISO-недели вида «2026-W36» — для подписи диапазона дат. */
  function mondayOfWeek(key) {
    const [year, week] = String(key).split("-W").map(Number);
    const fourth = new Date(year, 0, 4);
    const monday = new Date(fourth);
    monday.setDate(fourth.getDate() - ((fourth.getDay() + 6) % 7) + (week - 1) * 7);
    return monday;
  }

  /** Недельный ряд из данных. Считает его скрипт — здесь только подписи.
   *
   * Раньше недели складывались на клиенте из дневного ряда, а он обрезан
   * последними 180 днями: получалось тринадцать недель вместо всей истории.
   */
  function weeksFrom(list, limit = 16) {
    const last = list.length ? list[list.length - 1] : null;
    const today = isoDay(new Date());
    return list.slice(-limit).map((week) => {
      const monday = mondayOfWeek(week.неделя);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return {
        ключ: week.неделя,
        метка: dayLabel(isoDay(monday)),
        подпись: `${week.неделя} · ${dayLabel(isoDay(monday))}–${dayLabel(isoDay(sunday))}`,
        на_смену: week.на_смену,
        штук: week.штук,
        смен: week.смен,
        человек: week.человек,
        // Текущая неделя ещё идёт — сравнивать её с прошлой напрямую нельзя.
        неполная: week === last && isoDay(sunday) >= today,
      };
    });
  }

  /** Месяцы в тот же вид, что и недели, — рисует их одна функция. */
  function monthsAsBars(list) {
    return list.map((row) => ({
      ключ: row.месяц,
      метка: monthLabel(row.месяц),
      подпись: monthLabel(row.месяц),
      на_смену: row.на_смену,
      штук: row.штук,
      смен: row.смен,
      человек: row.человек,
      неполная: false,
    }));
  }

  /** Столбики с линией средней за период и отклонением к предыдущему шагу. */
  function renderMonths(list) {
    const wrap = document.createElement("div");
    wrap.className = "months";

    const values = list.map((row) => row.на_смену);
    const max = Math.max(...values, 1);
    const avg = values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
    const scale = 0.78;

    const rule = document.createElement("i");
    rule.className = "months__avg";
    rule.style.bottom = "calc(34px + " + (avg / max * 100 * scale).toFixed(1) + "%)";
    rule.dataset.label = "среднее " + one(avg);
    wrap.appendChild(rule);

    list.forEach((row, index) => {
      const item = document.createElement("div");
      item.className = "month" + (row.неполная ? " isPartial" : "");

      const prev = index > 0 ? list[index - 1].на_смену : null;
      const delta = prev ? ((row.на_смену - prev) / prev) * 100 : null;
      const height = Math.max(3, (row.на_смену / max) * 100 * scale);

      const fill = document.createElement("i");
      fill.className = "month__fill " + (row.на_смену >= avg ? "isGood" : "isLow");
      fill.style.setProperty("--h", height.toFixed(1) + "%");
      fill.style.animationDelay = (index * 45) + "ms";

      const value = document.createElement("b");
      value.className = "month__value";
      value.textContent = Math.round(row.на_смену);

      const label = document.createElement("span");
      label.className = "month__label";
      label.textContent = row.метка;

      item.append(value, fill, label);

      if (delta !== null) {
        const badge = document.createElement("em");
        badge.className = "month__delta " + (delta >= 0 ? "isUp" : "isDown");
        badge.textContent = (delta > 0 ? "+" : "") + Math.round(delta) + "%";
        item.appendChild(badge);
      }

      bindTip(item,
        "<b>" + row.подпись + (row.неполная ? " — неделя не закончилась" : "") + "</b>" +
        "<span>" + one(row.на_смену) + " штук за смену</span>" +
        "<span>" + count(row.штук) + " штук · " + count(row.смен) + " смен · " +
        one(row.человек) + " человек в день</span>" +
        (delta !== null
          ? "<span>к прошлому шагу " + (delta > 0 ? "+" : "") + one(delta) + "%</span>"
          : ""));

      wrap.appendChild(item);
    });
    return wrap;
  }

  // --- Дни недели, выход на норму, ядро и хвост -------------------------------

  const WEEKDAY_SHORT = { понедельник: "пн", вторник: "вт", среда: "ср", четверг: "чт",
                          пятница: "пт", суббота: "сб", воскресенье: "вс" };

  /** Дни недели в тот же вид, что месяцы и недели, — рисует их одна функция. */
  function weekdaysAsBars(list) {
    return (list || []).map((row) => ({
      ключ: row.день_недели,
      метка: WEEKDAY_SHORT[row.день_недели] || row.день_недели,
      подпись: row.день_недели,
      на_смену: row.на_смену,
      штук: row.штук,
      смен: row.смен,
      человек: row.дней ? row.смен / row.дней : 0,
      неполная: false,
    }));
  }

  /** Часы смены. Метрика другая — штук за занятый человеко-час.
   *
   * «Штук за смену» здесь не годится: смена размазана по часам неравномерно, и
   * делить её на часы бессмысленно. Занятый час — тот, в который человек хоть
   * что-то сделал, так что простой в знаменатель не попадает.
   */
  function hoursAsBars(list) {
    return (list || []).map((row) => ({
      ключ: String(row.час),
      метка: String(row.час).padStart(2, "0"),
      подпись: `${String(row.час).padStart(2, "0")}:00–${String(row.час).padStart(2, "0")}:59`,
      на_смену: row.на_час,
      штук: row.штук,
      смен: row.человекочасов,
      человек: row.человек,
      неполная: false,
    }));
  }

  /** Кривая выхода новичка на норму: медиана по номеру смены. */
  function rampAsBars(list) {
    return (list || []).map((row) => ({
      ключ: String(row.смена),
      метка: String(row.смена),
      подпись: `смена №${row.смена}`,
      на_смену: row.штук,
      штук: row.штук,
      смен: row.человек,
      человек: row.человек,
      неполная: false,
    }));
  }

  /** Ядро и хвост: сколько людей делают восемьдесят процентов объёма.
   *
   * Средняя по контуру ничего не говорит о том, на скольких людях он держится.
   * Здесь видно: горстка тянет почти всё, а длинный хвост даёт единицы процентов.
   */
  function renderCore(list) {
    const people = [...list].sort((a, b) => b.штук - a.штук);
    const total = people.reduce((sum, person) => sum + person.штук, 0);
    if (!total) return document.createTextNode("");

    let running = 0;
    let core = 0;
    for (const person of people) {
      if (running / total >= 0.8) break;
      running += person.штук;
      core += 1;
    }
    const tail = people.length - core;
    const tailShare = total ? (total - running) / total : 0;
    const tailShifts = people.slice(core).reduce((sum, person) => sum + person.смен, 0);
    const allShifts = people.reduce((sum, person) => sum + person.смен, 0);

    const wrap = document.createElement("div");
    wrap.className = "core";

    const bar = document.createElement("div");
    bar.className = "core__bar";
    const head = document.createElement("i");
    head.className = "core__head";
    head.style.width = (core / people.length * 100).toFixed(1) + "%";
    bar.appendChild(head);
    bindTip(bar,
      "<b>Ядро контура</b>" +
      "<span>" + core + " человек из " + people.length + " дают 80% объёма</span>" +
      "<span>остальные " + tail + " — " + Math.round(tailShare * 100) + "% объёма</span>" +
      "<span>на хвост уходит " + count(tailShifts) + " смен из " + count(allShifts) + "</span>");

    const facts = document.createElement("p");
    facts.className = "core__facts";
    facts.innerHTML =
      "<b>" + core + "</b> человек из <b>" + people.length + "</b> дают 80% объёма · " +
      "остальные <b>" + tail + "</b> — всего " + Math.round(tailShare * 100) + "% объёма, " +
      "но " + Math.round(tailShifts / (allShifts || 1) * 100) + "% смен";

    wrap.append(bar, facts);
    return wrap;
  }

  /** Контуры рядом: одна шкала, чтобы их можно было сравнить глазами. */
  function renderContours(all, months) {
    // Все контуры — за тот же период, что и остальная страница: иначе рядом
    // стоят цифры за разные промежутки и сравнивать их нельзя.
    const rows = Object.entries(all).map(([key, data]) => {
      const item = slice(data, months).итог;
      return { ключ: key, название: data.название, ...item };
    });
    const max = Math.max(...rows.map((row) => row.на_смену), 1);

    const wrap = document.createElement("div");
    wrap.className = "contours";
    for (const row of rows) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "contourRow" + (row.ключ === contour ? " is-on" : "");
      item.innerHTML =
        "<span class=\"contourRow__name\">" + row.название + "</span>" +
        "<span class=\"contourRow__track\"><i style=\"width:" +
          (row.на_смену / max * 100).toFixed(1) + "%\"></i></span>" +
        "<b class=\"contourRow__value\">" + one(row.на_смену) + "</b>" +
        "<span class=\"contourRow__note\">" + count(row.смен) + " смен · " +
          count(row.человек) + " человек</span>";
      bindTip(item,
        "<b>" + row.название + "</b>" +
        "<span>" + one(row.на_смену) + " штук за смену</span>" +
        "<span>" + count(row.штук) + " штук · " + count(row.смен) + " смен</span>" +
        "<span>" + count(row.человек) + " человек в периоде</span>");
      item.addEventListener("click", () => {
        contour = row.ключ;
        for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.contour === contour));
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      wrap.appendChild(item);
    }
    return wrap;
  }

  /** Кнопка выгрузки: те же строки, что на экране, книгой Excel. */
  function excelButton(rows, name) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action action--secondary";
    button.textContent = "Excel";
    button.title = "Скачать таблицу книгой .xlsx";
    button.addEventListener("click", () => saveXlsx(rows, name.split(" ")[0], name));
    return button;
  }

  function block(title, subtitle, body, extra) {
    const section = document.createElement("section");
    section.className = "perfBlock";
    const head = document.createElement("div");
    head.className = "perfHead";
    const left = document.createElement("div");
    left.innerHTML = `<h2>${title}</h2>${subtitle ? `<p class="perfLead">${subtitle}</p>` : ""}`;
    head.appendChild(left);
    if (extra) head.appendChild(extra);
    section.append(head, body);
    return section;
  }

  // --- Таблица сотрудников ----------------------------------------------------

  /** Мини-график по месяцам в строке: видно, растёт человек или падает. */
  function sparkline(months) {
    const solid = months.filter((m) => m.смен >= 1);
    if (solid.length < 2) return document.createTextNode("");

    const values = solid.map((m) => m.на_смену);
    const min = Math.min(...values);
    const max = Math.max(...values, min + 1);
    const W = 84;
    const H = 22;
    const x = (i) => (i / (solid.length - 1)) * W;
    const y = (v) => H - 2 - ((v - min) / (max - min)) * (H - 5);

    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "spark");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);

    const line = document.createElementNS(SVG, "path");
    line.setAttribute("class", "spark__line");
    line.setAttribute("d", values
      .map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" "));
    svg.appendChild(line);

    const dot = document.createElementNS(SVG, "circle");
    dot.setAttribute("class", "spark__dot");
    dot.setAttribute("cx", x(values.length - 1));
    dot.setAttribute("cy", y(values[values.length - 1]));
    dot.setAttribute("r", 2.4);
    svg.appendChild(dot);
    return svg;
  }

  /** Люди на общей шкале: медиана — точка отсчёта, цвет — отношение к ней.
   *
   * Плоский список из полусотни строк ничего не объяснял: непонятно, 150 это
   * хорошо или обычно. Здесь видно и расстановку, и насколько человек
   * отклонился от того, как работает большинство.
   */
  function renderStaff(list, forceAll = false) {
    const shown = (showAllStaff || forceAll) ? list : list.filter((s) => !s.мало_смен);
    if (!shown.length) return document.createTextNode("");

    const values = shown.map((s) => s.на_смену).sort((a, b) => a - b);
    const median = quantile(values, 0.5);
    const max = Math.max(...values, 1);
    const above = shown.filter((s) => s.на_смену >= median).length;

    const wrap = document.createElement("div");
    wrap.className = "staffChart";

    // Сводка: где проходит норма и сколько людей по обе стороны от неё.
    const head = document.createElement("div");
    head.className = "staffChart__head";
    head.innerHTML =
      "<span class=\"staffChart__median\">медиана <b>" + one(median) + "</b> штук за смену</span>" +
      "<span class=\"staffChart__split\"><i class=\"isUp\"></i>выше нормы " + above +
      "<i class=\"isDown\"></i>ниже " + (shown.length - above) + "</span>";
    wrap.appendChild(head);

    const rows = document.createElement("div");
    rows.className = "staffRows";
    // Отметка медианы — общая для всех строк, чтобы глаз цеплялся за одну линию.
    const rule = document.createElement("i");
    rule.className = "staffRows__median";
    rule.style.left = (median / max * 100).toFixed(1) + "%";
    rows.appendChild(rule);

    shown.forEach((person, index) => {
      const row = document.createElement("div");
      row.className = "staffRow" + (person.мало_смен ? " isThin" : "");

      const name = document.createElement("span");
      name.className = "staffRow__name";
      name.textContent = person.сотрудник;

      const track = document.createElement("span");
      track.className = "staffRow__track";
      const bar = document.createElement("i");
      bar.className = "staffRow__bar " + (person.на_смену >= median ? "isUp" : "isDown");
      bar.style.setProperty("--w", (person.на_смену / max * 100).toFixed(1) + "%");
      bar.style.animationDelay = Math.min(index * 18, 500) + "ms";
      track.appendChild(bar);

      const value = document.createElement("b");
      value.className = "staffRow__value";
      value.textContent = one(person.на_смену);

      const spark = document.createElement("span");
      spark.className = "staffRow__spark";
      if (person.поМесяцам?.length) spark.appendChild(sparkline(person.поМесяцам));

      const trend = document.createElement("em");
      const t = person.тренд;
      trend.className = "staffRow__trend" +
        (t === null || t === undefined ? " isNone" : t >= 0 ? " isUp" : " isDown");
      trend.textContent = t === null || t === undefined
        ? "—" : (t > 0 ? "+" : "") + Math.round(t) + "%";

      const shifts = document.createElement("span");
      shifts.className = "staffRow__shifts";
      shifts.textContent = count(person.смен) + " " + shiftWord(person.смен);

      row.append(name, track, value, spark, trend, shifts);

      // Клик раскрывает недели человека прямо под строкой: в таблице видно
      // только итог, а вопрос всегда следующий — когда именно он просел.
      if (person.поНеделям?.length) {
        row.classList.add("isClickable");
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        const open = (event) => {
          event.preventDefault();
          togglePerson(person, row);
        };
        row.addEventListener("click", open);
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") open(event);
        });
      }

      const diff = median ? Math.round((person.на_смену - median) / median * 100) : 0;
      const months = (person.поМесяцам || [])
        .map((m) => "<span>" + monthLabel(m.месяц) + " — " + one(m.на_смену) +
                    " шт/смену, " + count(m.смен) + " смен</span>").join("");
      bindTip(row,
        "<b>" + person.сотрудник + "</b>" +
        "<span>" + one(person.на_смену) + " штук за смену — " +
        (diff >= 0 ? "на " + diff + "% выше" : "на " + Math.abs(diff) + "% ниже") + " медианы</span>" +
        "<span>" + count(person.смен) + " смен · " + count(person.штук) + " штук всего</span>" +
        months);

      rows.appendChild(row);
    });

    wrap.appendChild(rows);
    return wrap;
  }

  // --- Карточка человека ------------------------------------------------------

  let openPerson = null;

  function closePerson() {
    openPerson = null;
    document.querySelectorAll(".staffRow.is-open").forEach((el) => el.classList.remove("is-open"));
    document.getElementById("personCard")?.remove();
  }

  /** Недели одного человека под его строкой: где он рос и где встал. */
  function togglePerson(person, row) {
    if (openPerson === person.сотрудник) { closePerson(); return; }
    closePerson();
    openPerson = person.сотрудник;
    row.classList.add("is-open");

    const card = document.createElement("div");
    card.className = "personCard";
    card.id = "personCard";

    const head = document.createElement("div");
    head.className = "personCard__head";
    const title = document.createElement("h3");
    title.textContent = person.сотрудник;
    const note = document.createElement("p");
    const spread = person.разброс === null || person.разброс === undefined
      ? "" : " · разброс дней ×" + one(person.разброс + 1);
    note.textContent = `${one(person.на_смену)} штук за смену · ${count(person.смен)} смен`
      + ` · с ${person.первая_смена ? dayLabel(person.первая_смена) : "—"}`
      + `${person.тип ? " · " + person.тип : ""}${spread}`;

    const tools = document.createElement("div");
    tools.className = "personCard__tools";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "action action--secondary";
    save.textContent = "Excel";
    save.addEventListener("click", (event) => {
      event.stopPropagation();
      saveXlsx([["неделя", "штук", "смен", "штук за смену"],
                ...person.поНеделям.map((w) => [w.неделя, w.штук, w.смен, w.на_смену])],
               person.сотрудник.split(" ")[0], `${person.сотрудник} по неделям`);
    });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "action action--secondary";
    close.textContent = "Закрыть";
    close.addEventListener("click", (event) => { event.stopPropagation(); closePerson(); });
    tools.append(save, close);

    const left = document.createElement("div");
    left.append(title, note);
    head.append(left, tools);

    const bars = person.поНеделям.slice(-16).map((week) => {
      const monday = mondayOfWeek(week.неделя);
      return {
        ключ: week.неделя,
        метка: dayLabel(isoDay(monday)),
        подпись: week.неделя,
        на_смену: week.на_смену,
        штук: week.штук,
        смен: week.смен,
        человек: week.смен,
        неполная: false,
      };
    });

    card.append(head, renderLine(bars, { label: (row) => row.подпись || row.ключ }));
    row.parentElement.insertBefore(card, row.nextSibling);
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // --- Сборка -----------------------------------------------------------------

  function render() {
    const data = payload.контуры?.[contour];
    if (!data) {
      say("Для этого контура данных нет.", "warn");
      box.replaceChildren();
      return;
    }

    const period = currentPeriod(data);
    if (!period) {
      say("Для этого контура данных нет.", "warn");
      box.replaceChildren();
      return;
    }
    const view = slice(data, period.current.months);
    const before = period.previous ? slice(data, period.previous.months) : null;
    const parts = [];

    // Переключатель периода: одна строка на всю страницу, чтобы по любой цифре
    // было видно, за какой промежуток она посчитана.
    const picker = document.createElement("div");
    picker.className = "perfPeriod";
    const kinds = document.createElement("div");
    kinds.className = "tabs tabs--inline";
    kinds.setAttribute("role", "tablist");
    kinds.setAttribute("aria-label", "Длина периода");
    PERIODS.forEach((item) => {
      const tab = document.createElement("button");
      tab.className = "tab";
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(item.key === periodKey));
      tab.textContent = item.label;
      tab.addEventListener("click", () => {
        if (periodKey === item.key) return;
        periodKey = item.key;
        periodValue = null;   // подставится последний закрытый период новой длины
        try { navigator.vibrate?.(10); } catch { /* нет поддержки */ }
        render();
      });
      kinds.appendChild(tab);
    });
    const which = document.createElement("select");
    which.className = "perfSelect";
    which.setAttribute("aria-label", "Какой период");
    period.list.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.key;
      option.textContent = item.label + (item.open ? " · идёт" : "");
      option.selected = item.key === periodValue;
      which.appendChild(option);
    });
    which.hidden = periodKey === "all";
    which.addEventListener("change", () => { periodValue = which.value; render(); });
    picker.append(kinds, which);
    parts.push(picker);

    // Сводка за период. Все четыре плитки одинаковые: раньше первая жила по
    // своим правилам — показывала последнюю неделю, а не выбранное, — и рядом
    // с остальными читалась как ошибка вёрстки.
    const top = document.createElement("div");
    top.className = "perfTop";
    const delta = before && before.итог.на_смену
      ? +(((view.итог.на_смену - before.итог.на_смену) / before.итог.на_смену) * 100).toFixed(1)
      : null;
    const deltaClass = delta === null ? "" : delta < 0 ? " isDown" : " isUp";
    const deltaText = delta === null ? "не с чем сравнить"
      : `${delta > 0 ? "+" : ""}${one(delta)}% к прошлому периоду`;
    const openNote = period.current.open ? " · период ещё идёт" : "";

    top.innerHTML =
      `<article class="perfCard"><p class="perfCard__title">Штук за смену</p>` +
        `<b class="perfCard__value">${one(view.итог.на_смену)}</b>` +
        `<span class="perfCard__delta${deltaClass}">${deltaText}</span></article>` +
      `<article class="perfCard"><p class="perfCard__title">Штук</p>` +
        `<b class="perfCard__value">${count(view.итог.штук)}</b>` +
        `<span class="perfCard__note">${period.current.label}${openNote}</span></article>` +
      `<article class="perfCard"><p class="perfCard__title">Смен</p>` +
        `<b class="perfCard__value">${count(view.итог.смен)}</b>` +
        `<span class="perfCard__note">человеко-дней в периоде</span></article>` +
      `<article class="perfCard"><p class="perfCard__title">Человек</p>` +
        `<b class="perfCard__value">${count(view.итог.человек)}</b>` +
        `<span class="perfCard__note">выходили на стол</span></article>`;
    parts.push(top);

    // Одна динамика вместо двух графиков. Раньше «По неделям» и «По дням»
    // стояли друг под другом и показывали одно и то же в разной нарезке —
    // читать приходилось дважды. Теперь это один блок с переключателем шага.
    // День по умолчанию на месяце (видно каждый провал), неделя — на периодах
    // длиннее: там дней под сотню и линия превращается в частокол.
    if (!shagVybran) {
      barStep = periodKey === "month" ? "дни" : "недели";
      shagVybran = true;
    }
    const steps = document.createElement("div");
    steps.className = "stepSwitch";
    const shagi = view.дни.length
      ? [["дни", "Дни"], ["недели", "Недели"], ["месяцы", "Месяцы"]]
      : [["недели", "Недели"], ["месяцы", "Месяцы"]];
    for (const [key, label] of shagi) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "stepSwitch__item" + (barStep === key ? " is-on" : "");
      button.textContent = label;
      button.addEventListener("click", () => {
        barStep = key;
        shagVybran = true;
        try { navigator.vibrate?.(8); } catch { /* нет поддержки */ }
        render();
      });
      steps.appendChild(button);
    }

    const poDnyam = barStep === "дни" && view.дни.length;
    const bars = barStep === "недели"
      ? weeksFrom(view.недели, view.недели.length)
      : monthsAsBars(view.месяцы);
    const barTools = document.createElement("div");
    barTools.className = "perfActions";
    barTools.append(
      poDnyam
        ? excelButton([["день", "штук", "смен", "человек", "штук за смену"],
                       ...view.дни.map((r) => [r.день, r.штук, r.смен, r.человек, r.на_смену])],
                      `${data.название} по дням ${period.current.label}`)
        : excelButton([[barStep === "недели" ? "неделя" : "месяц", "штук", "смен", "штук за смену"],
                       ...bars.map((row) => [row.ключ, row.штук, row.смен, Number(row.на_смену.toFixed(1))])],
                      `${data.название} по ${barStep === "недели" ? "неделям" : "месяцам"} ${period.current.label}`),
      steps);

    parts.push(block(
      "Динамика",
      poDnyam
        ? `${period.current.label} · ${view.дни.length} ${dayWord(view.дни.length)} с выходом`
        : `${period.current.label} · штук за смену, по ${barStep === "недели" ? "неделям" : "месяцам"}`,
      poDnyam ? renderDaily(view.дни)
              : renderLine(bars, { label: (row) => row.подпись || row.ключ }),
      barTools));

    if (view.часы.length) {
      const hours = [...view.часы].sort((a, b) => b.на_час - a.на_час);
      const best = hours[0];
      const worst = hours[hours.length - 1];
      // Часы с единичными касаниями в вывод не берём: там один человек за час
      // может дать что угодно, а выглядеть будет как рекорд смены.
      const solid = hours.filter((row) => row.человекочасов >= 10);
      const peak = solid[0] || best;
      const dip = solid[solid.length - 1] || worst;
      parts.push(block("По часам",
                       `${period.current.label} · штук за занятый человеко-час. Лучше всего идёт `
                       + `в ${String(peak.час).padStart(2, "0")}:00 — ${one(peak.на_час)}, `
                       + `хуже всего в ${String(dip.час).padStart(2, "0")}:00 — ${one(dip.на_час)}`,
                       renderLine(hoursAsBars(view.часы), { label: (row) => row.подпись || row.ключ,
                                             legenda: "штук за человеко-час" }),
                       excelButton([["час", "штук", "человеко-часов", "штук за час"],
                                    ...view.часы.map((r) => [r.час, r.штук, r.человекочасов, r.на_час])],
                                   `${data.название} по часам ${period.current.label}`)));
    }

    if (view.дниНедели.length) {
      parts.push(block("По дням недели",
                       `${period.current.label} · где систематический провал, а не случайный день`,
                       renderLine(weekdaysAsBars(view.дниНедели), { label: (row) => row.подпись || row.ключ })));
    }

    if (data.выходНаНорму?.length) {
      const ramp = data.выходНаНорму;
      const norm = view.итог.на_смену;
      const reached = ramp.find((row) => row.штук >= norm * 0.9);
      // Единственный блок вне периода: кривая строится по номеру смены человека,
      // а не по календарю, и режется периодом бессмысленно — у новичка августа
      // просто не будет двадцатой смены. Поэтому подписано отдельно.
      parts.push(block("Выход на норму",
                       `За всю историю контура, не за период. Медиана по номеру смены человека. `
                       + `Норма периода ${one(norm)} штук`
                       + (reached ? `, до 90% от неё доходят к ${reached.смена}-й смене`
                                  : ", за первые смены её не достигают"),
                       renderLine(rampAsBars(ramp), { label: (row) => row.подпись || row.ключ,
                                      legenda: "штук за смену по номеру смены" })));
    }

    const staff = { list: view.сотрудники, label: period.current.label,
                    скрыто: (data.сотрудники || []).length - view.сотрудники.length };

    parts.push(block("Ядро и хвост", `На скольких людях держится контур · ${staff.label}`,
                     renderCore(staff.list)));

    // Переключатель «показать всех» — рядом с заголовком таблицы.
    const thin = staff.list.filter((s) => s.мало_смен).length;
    const toggle = document.createElement("button");
    toggle.className = "action action--secondary";
    toggle.type = "button";
    toggle.textContent = showAllStaff
      ? `Только от ${MIN_SHIFTS} ${shiftWord(MIN_SHIFTS)}`
      : `Показать всех (+${thin})`;
    toggle.addEventListener("click", () => {
      showAllStaff = !showAllStaff;
      try { navigator.vibrate?.(10); } catch { /* нет поддержки */ }
      render();
    });

    const staffTools = document.createElement("div");
    staffTools.className = "perfActions";
    staffTools.append(
      excelButton([["сотрудник", "тип", "площадка", "период", "штук", "смен", "штук за смену",
                    "тренд, %", "разброс", "первая смена"],
                   ...staff.list.map((s) => [s.сотрудник, s.тип, s.площадка, staff.label,
                                             s.штук, s.смен, s.на_смену, s.тренд ?? "",
                                             s.разброс ?? "", s.первая_смена || ""])],
                  `${data.название} сотрудники ${staff.label}`),
      toggle);

    const periodNote = `${staff.label}, не работавшие в этом периоде скрыты (${staff.скрыто})`;
    // Если порог отсекает вообще всех — показываем список целиком: пустая
    // таблица объясняет меньше, чем список с оговоркой.
    const allThin = staff.list.length > 0 && staff.list.every((s) => s.мало_смен);
    const staffHead = allThin
      ? `Ни у кого нет ${MIN_SHIFTS} ${shiftWord(MIN_SHIFTS)} — показаны все`
      : (showAllStaff
        ? `Все, включая тех, у кого меньше ${MIN_SHIFTS} ${shiftWord(MIN_SHIFTS)}`
        : `Те, у кого ${MIN_SHIFTS} ${shiftWord(MIN_SHIFTS)} и больше`);
    parts.push(block("По сотрудникам",
                     `${staffHead}. ${periodNote}. Клик — недели человека`,
                     renderStaff(staff.list, allThin), staffTools));

    parts.push(block("Контуры рядом",
                     `${period.current.label} · одна шкала: где узкое место всего направления`,
                     renderContours(payload.контуры, period.current.months)));

    openPerson = null;
    box.replaceChildren(...parts);
    stamp.textContent = `обновлено ${payload.обновлено}`;
    say("");
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      contour = tab.dataset.contour;
      for (const other of tabs) other.setAttribute("aria-selected", String(other === tab));
      try { navigator.vibrate?.(10); } catch { /* нет поддержки */ }
      render();
    });
  }

  fetch(DATA_URL, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`сервер вернул ошибку ${response.status}`);
      return response.json();
    })
    .then((data) => {
      payload = data;
      render();
    })
    .catch((error) => {
      say(`Не удалось загрузить показатели: ${error?.message || error}`, "error");
    });
})();
