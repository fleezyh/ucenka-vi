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

  /** Месяцы: столбики с линией средней за период и отклонением к прошлому. */
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
      item.className = "month";

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
      label.textContent = monthLabel(row.месяц);

      item.append(value, fill, label);

      if (delta !== null) {
        const badge = document.createElement("em");
        badge.className = "month__delta " + (delta >= 0 ? "isUp" : "isDown");
        badge.textContent = (delta > 0 ? "+" : "") + Math.round(delta) + "%";
        item.appendChild(badge);
      }

      bindTip(item,
        "<b>" + monthLabel(row.месяц) + "</b>" +
        "<span>" + one(row.на_смену) + " штук за смену</span>" +
        "<span>" + count(row.штук) + " штук · " + count(row.смен) + " смен · " +
        count(row.человек) + " человек</span>" +
        (delta !== null
          ? "<span>к прошлому месяцу " + (delta > 0 ? "+" : "") + one(delta) + "%</span>"
          : ""));

      wrap.appendChild(item);
    });
    return wrap;
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
  function renderStaff(list) {
    const shown = showAllStaff ? list : list.filter((s) => !s.мало_смен);
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
      shifts.textContent = count(person.смен) + " смен";

      row.append(name, track, value, spark, trend, shifts);

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

  // --- Сборка -----------------------------------------------------------------

  function render() {
    const data = payload.контуры?.[contour];
    if (!data) {
      say("Для этого контура данных нет.", "warn");
      box.replaceChildren();
      return;
    }

    const parts = [];

    // Сводка: последняя неделя и итог за период.
    const top = document.createElement("div");
    top.className = "perfTop";
    const delta = data.изменение;
    const deltaClass = delta === null || delta === undefined ? "" : delta < 0 ? " isDown" : " isUp";
    const deltaText = delta === null || delta === undefined ? ""
      : `${delta > 0 ? "+" : ""}${one(delta)}% к неделе назад`;

    top.innerHTML =
      `<article class="perfCard perfCard--main">` +
        `<p class="perfCard__title">Средняя за неделю ${data.неделя}</p>` +
        `<b class="perfCard__value">${one(data.на_смену)}</b>` +
        `<span class="perfCard__delta${deltaClass}">${deltaText}</span>` +
      `</article>` +
      `<article class="perfCard"><p class="perfCard__title">За весь период</p>` +
        `<b class="perfCard__value">${one(data.за_период.на_смену)}</b>` +
        `<span class="perfCard__note">штук за смену</span></article>` +
      `<article class="perfCard"><p class="perfCard__title">Смен</p>` +
        `<b class="perfCard__value">${count(data.за_период.смен)}</b>` +
        `<span class="perfCard__note">${count(data.за_период.человек)} человек</span></article>` +
      `<article class="perfCard"><p class="perfCard__title">Штук всего</p>` +
        `<b class="perfCard__value">${count(data.за_период.штук)}</b>` +
        `<span class="perfCard__note">с начала года</span></article>`;
    parts.push(top);

    parts.push(block("По месяцам", "Производительность за календарный месяц",
                     renderMonths(data.поМесяцам)));

    parts.push(block("По дням", `Последние ${data.поДням.length} дней`,
                     renderDaily(data.поДням)));

    // Переключатель «показать всех» — рядом с заголовком таблицы.
    const thin = data.сотрудники.filter((s) => s.мало_смен).length;
    const toggle = document.createElement("button");
    toggle.className = "action action--secondary";
    toggle.type = "button";
    toggle.textContent = showAllStaff ? "Только от 5 смен" : `Показать всех (+${thin})`;
    toggle.addEventListener("click", () => {
      showAllStaff = !showAllStaff;
      try { navigator.vibrate?.(10); } catch { /* нет поддержки */ }
      render();
    });

    parts.push(block("По сотрудникам",
                     showAllStaff
                       ? "Все, включая тех, у кого меньше пяти смен"
                       : "Те, у кого пять смен и больше",
                     renderStaff(data.сотрудники), toggle));

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
