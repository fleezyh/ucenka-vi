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

  // --- Столбиковый график -----------------------------------------------------

  /** Столбики по дням или месяцам: высота — производительность за период. */
  function renderBars(list, keyName, labelFn, options = {}) {
    const wrap = document.createElement("div");
    wrap.className = `bars${options.dense ? " bars--dense" : ""}`;

    const max = Math.max(...list.map((r) => r.на_смену), 1);
    // Подписи на каждом столбике читаются примерно до сорока значений.
    const step = list.length <= 40 ? 1 : Math.ceil(list.length / 26);

    list.forEach((row, index) => {
      const item = document.createElement("div");
      item.className = "bar";

      const fill = document.createElement("i");
      fill.style.height = `${Math.max(2, (row.на_смену / max) * 100).toFixed(1)}%`;
      item.appendChild(fill);

      if (index % step === 0 || list.length <= 40) {
        const value = document.createElement("b");
        value.className = "bar__value";
        value.textContent = Math.round(row.на_смену);
        item.appendChild(value);

        const label = document.createElement("span");
        label.className = "bar__label";
        label.textContent = labelFn(row[keyName]);
        item.appendChild(label);
      }

      bindTip(item,
        `<b>${labelFn(row[keyName])}</b>` +
        `<span>${one(row.на_смену)} штук за смену</span>` +
        `<span>${count(row.штук)} штук · ${count(row.смен)} смен</span>` +
        (row.человек ? `<span>людей: ${count(row.человек)}</span>` : ""));

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

  function renderStaff(list) {
    const shown = showAllStaff ? list : list.filter((s) => !s.мало_смен);
    const max = Math.max(...shown.map((s) => s.на_смену), 1);

    const table = document.createElement("table");
    table.className = "staff";
    table.innerHTML =
      "<thead><tr><th>Сотрудник</th><th>Тип</th><th class='num'>Штук за смену</th>" +
      "<th class='num'>Смен</th><th class='num'>Штук всего</th></tr></thead>";
    const body = document.createElement("tbody");

    for (const person of shown) {
      const tr = document.createElement("tr");
      if (person.мало_смен) tr.className = "isThin";
      tr.innerHTML =
        `<td>${person.сотрудник}</td>` +
        `<td class="muted">${person.тип || "—"}</td>` +
        `<td class="num"><i class="staffBar" style="width:${(person.на_смену / max * 100).toFixed(1)}%"></i>` +
        `<b>${one(person.на_смену)}</b></td>` +
        `<td class="num">${count(person.смен)}</td>` +
        `<td class="num">${count(person.штук)}</td>`;
      body.appendChild(tr);
    }
    table.appendChild(body);

    const scroll = document.createElement("div");
    scroll.className = "staffScroll";
    scroll.appendChild(table);
    return scroll;
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
                     renderBars(data.поМесяцам, "месяц", monthLabel)));

    parts.push(block("По дням", `Последние ${data.поДням.length} дней`,
                     renderBars(data.поДням, "день", dayLabel, { dense: true })));

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
