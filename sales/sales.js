(() => {
  "use strict";

  // Раздел «Продажи» показывает два блока сразу: остатки паллет и воронку
  // отгрузок. Данные считают «10 — Воронка отгрузок на сайт.py» и
  // «11 — Остатки паллет на сайт.py», здесь только отрисовка.
  const STOCK_URL = "../data/pallets-stock.json";
  const FUNNEL_URL = "../data/funnel.json";

  const $ = (id) => document.getElementById(id);
  const message = $("message");
  const stockBox = $("stock");
  const funnelBox = $("funnel");
  const monthSelect = $("month");
  const stamp = $("stamp");
  const exportButton = $("stockExport");

  let funnelData = null;

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
    message.style.display = text ? "block" : "none";
  }

  const count = (value) => Number(value || 0).toLocaleString("ru-RU");

  // --- Подсказка при наведении ------------------------------------------------
  // В Superset у этих графиков был тултип, и он тут нужен: на плитке помещается
  // не всё, а разбираться в цифрах приходится на ходу.

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
    const pad = 14;
    const box = tip.getBoundingClientRect();
    // Не даём подсказке уехать за край окна.
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + box.width > window.innerWidth - 8) x = event.clientX - box.width - pad;
    if (y + box.height > window.innerHeight - 8) y = event.clientY - box.height - pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }

  function hideTip() {
    if (tip) tip.hidden = true;
  }

  function bindTip(element, html) {
    element.addEventListener("mouseenter", (event) => showTip(html, event));
    element.addEventListener("mousemove", moveTip);
    element.addEventListener("mouseleave", hideTip);
  }

  const rub = (value) => `${Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;

  /** Запрос отдаёт «0.37 млн» с точкой — в русском тексте она выглядит чужеродно. */
  const decimal = (text) => String(text ?? "").replace(/(\d)\.(\d)/g, "$1,$2");

  function number(value) {
    const n = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(n) ? n.toLocaleString("ru-RU") : String(value ?? "");
  }

  function money(value) {
    const n = Number(value || 0);
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
    if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3).toLocaleString("ru-RU")} тыс`;
    return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  }

  // --- Остатки паллет --------------------------------------------------------

  function renderRegion(item, isTotal = false) {
    const total = item.всего || 1;
    const resShare = (item.зарезервировано / total) * 100;

    const card = document.createElement("article");
    card.className = `stockCard${isTotal ? " stockCard--total" : ""}`;

    const bar = document.createElement("div");
    bar.className = "stockBar";
    for (const [kind, share, value] of [
      ["res", resShare, item.зарезервировано],
      ["free", 100 - resShare, item.свободно],
    ]) {
      if (!value) continue;
      const part = document.createElement("div");
      part.className = `stockPart stockPart--${kind}`;
      part.style.height = `${share.toFixed(1)}%`;
      const label = document.createElement("b");
      label.textContent = count(value);
      part.appendChild(label);

      const cost = kind === "res" ? item.себестоимость_зарезервированных : item.себестоимость_свободных;
      bindTip(part, `<b>${item.регион} — ${kind === "res" ? "зарезервировано" : "свободно"}</b>` +
        `<span>${count(value)} паллет · ${share.toFixed(0)}% региона</span>` +
        `<span>себестоимость ${rub(cost)}</span>`);
      bar.appendChild(part);
    }

    const name = document.createElement("h3");
    name.className = "stockName";
    name.textContent = item.регион;
    const pill = document.createElement("span");
    pill.className = "stockPill";
    pill.textContent = `${Math.round(resShare)}%`;
    pill.title = "доля зарезервированных паллет";
    name.appendChild(pill);

    const split = document.createElement("p");
    split.className = "stockSplit";
    split.innerHTML =
      `<i class="res">${count(item.зарезервировано)}</i> / ` +
      `<i class="free">${count(item.свободно)}</i>` +
      `<span>всего ${count(item.всего)}</span>`;

    const cost = document.createElement("dl");
    cost.className = "stockCost";
    cost.innerHTML =
      `<div><dt>Себес</dt><dd>${money(item.себестоимость)} ₽</dd></div>` +
      `<div><dt>Штук</dt><dd>${count(item.штук)}</dd></div>`;

    card.append(bar, name, split, cost);

    bindTip(card, `<b>${item.регион}</b>` +
      `<span>всего ${count(item.всего)} паллет: ${count(item.зарезервировано)} зарезервировано, ` +
      `${count(item.свободно)} свободно</span>` +
      `<span>${count(item.штук)} штук · себестоимость ${rub(item.себестоимость)}</span>` +
      (isTotal ? "" : `<span class="tip__hint">нажмите — покажу паллеты региона</span>`));

    // Клик раскрывает список паллет: детализация уже лежит в тех же данных,
    // отдельного запроса не нужно.
    if (!isTotal) {
      card.classList.add("stockCard--clickable");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      const open = () => openRegion(item.регион, card);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
      });
    }
    return card;
  }

  // --- Список паллет региона --------------------------------------------------

  let openRegionName = null;

  function closeRegion() {
    openRegionName = null;
    document.querySelectorAll(".stockCard--open").forEach((el) => el.classList.remove("stockCard--open"));
    document.getElementById("regionList")?.remove();
  }

  function openRegion(region, card) {
    if (openRegionName === region) { closeRegion(); return; }
    closeRegion();
    openRegionName = region;
    card.classList.add("stockCard--open");

    const rows = (stockData?.паллеты || []).filter((p) => p.регион_кратко === region);

    const box = document.createElement("section");
    box.className = "regionList";
    box.id = "regionList";

    const head = document.createElement("header");
    head.className = "regionList__head";
    const title = document.createElement("h3");
    title.textContent = `${region} — ${count(rows.length)} паллет`;
    const close = document.createElement("button");
    close.className = "action action--secondary";
    close.type = "button";
    close.textContent = "Закрыть";
    close.addEventListener("click", (event) => { event.stopPropagation(); closeRegion(); });
    head.append(title, close);

    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr><th>Паллета</th><th>Ячейка</th><th>Тип</th>" +
      "<th class=\"num\">SKU</th><th class=\"num\">Штук</th><th class=\"num\">Себестоимость</th></tr></thead>";
    const body = document.createElement("tbody");
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${row.паллета}</td><td>${row.ячейка}</td>` +
        `<td class="${row.тип === "Зарезервированные" ? "isRes" : "isFree"}">` +
        `${row.тип === "Зарезервированные" ? "зарезервирована" : "свободна"}</td>` +
        `<td class="num">${count(row.sku)}</td><td class="num">${count(row.штук)}</td>` +
        `<td class="num">${rub(row.себестоимость)}</td>`;
      body.appendChild(tr);
    }
    table.appendChild(body);

    const scroll = document.createElement("div");
    scroll.className = "regionList__scroll";
    scroll.appendChild(table);

    box.append(head, scroll);
    stockBox.appendChild(box);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // --- Воронка отгрузок ------------------------------------------------------

  /** Ширина ступени: самая широкая — максимум паллет за месяц. */
  function widthOf(stage, all) {
    const max = Math.max(...all.map((s) => Number(s.pallets_txt) || 0), 1);
    return Math.max(18, ((Number(stage.pallets_txt) || 0) / max) * 100);
  }

  function renderStage(stage, all, index) {
    const row = document.createElement("div");
    row.className = "stage";

    const left = document.createElement("div");
    left.className = "stage__side stage__side--left";
    left.innerHTML = `<b>${decimal(stage.sale_txt) || "—"}</b><span>в ценах продаж</span>`;

    const bar = document.createElement("div");
    bar.className = "stage__bar";
    bar.style.width = `${widthOf(stage, all).toFixed(1)}%`;
    if (stage.seg_color) bar.style.background = stage.seg_color;

    const value = document.createElement("b");
    value.className = "stage__value";
    value.textContent = number(stage.pallets_txt);
    const name = document.createElement("span");
    name.className = "stage__name";
    name.textContent = stage.stage || "";
    bar.append(value, name);

    const right = document.createElement("div");
    right.className = "stage__side stage__side--right";
    const okup = document.createElement("i");
    okup.className = `stage__okup ${stage.okup_cls || ""}`.trim();
    okup.textContent = decimal(stage.okup_txt) || "";
    right.innerHTML = `<b>${decimal(stage.cost_txt) || "—"}</b><span>себестоимость</span>`;
    right.appendChild(okup);

    // Подсказка на ступени: на полосе помещается только число паллет,
    // а деньги и конверсия читаются по бокам мелким шрифтом.
    const share = all[0] && Number(all[0].total_pallets)
      ? ` · ${((Number(stage.pallets_txt) || 0) / Number(all[0].total_pallets) * 100).toFixed(0)}% месяца`
      : "";
    bindTip(bar, `<b>${stage.stage}</b>` +
      `<span>${number(stage.pallets_txt)} паллет${share}</span>` +
      `<span>лотов ${number(stage.lots)}</span>` +
      `<span>в ценах продаж ${decimal(stage.sale_txt)} · себестоимость ${decimal(stage.cost_txt)}</span>` +
      `<span>окупаемость ${decimal(stage.okup_txt)}</span>` +
      (stage.conv_txt ? `<span class="tip__hint">к предыдущей ступени ${decimal(stage.conv_txt)}</span>` : ""));

    row.append(left, bar, right);

    // Переход между ступенями — отдельной строкой над следующей полосой.
    if (index > 0 && stage.conv_txt) {
      const link = document.createElement("p");
      link.className = "stage__link";
      link.textContent = decimal(stage.conv_txt);
      funnelBox.appendChild(link);
    }
    return row;
  }

  /** Итоги месяца против плана и годовой цели. */
  function renderTotals(first) {
    const cards = [
      { title: "Паллет", value: number(first.total_pallets),
        planText: `план ${number(first.plan_pallets)}`, planPct: first.plan_pal_pct,
        planWidth: first.plan_pal_w, planClass: first.plan_pal_cls,
        goalText: "цель с отставанием", goalPct: first.goal_pal_pct,
        goalWidth: first.goal_pal_w, goalClass: first.goal_pal_cls },
      { title: "В ценах продаж", value: decimal(first.total_sale_txt),
        planText: `план ${decimal(first.plan_sale_txt)}`, planPct: first.plan_sale_pct,
        planWidth: first.plan_sale_w, planClass: first.plan_sale_cls,
        goalText: "цель с отставанием", goalPct: first.goal_sale_pct,
        goalWidth: first.goal_sale_w, goalClass: first.goal_sale_cls },
      { title: "По себестоимости", value: decimal(first.total_cost_txt),
        planText: `план ${decimal(first.plan_cost_txt)}`, planPct: first.plan_cost_pct,
        planWidth: first.plan_cost_w, planClass: first.plan_cost_cls,
        goalText: "цель с отставанием", goalPct: first.goal_cost_pct,
        goalWidth: first.goal_cost_w, goalClass: first.goal_cost_cls },
      { title: "Окупаемость", value: decimal(first.total_okup_txt),
        planText: `план ${decimal(first.plan_okup_txt)}`, planPct: decimal(first.okup_delta_txt),
        planWidth: null, planClass: first.okup_plan_cls },
    ];

    const wrap = document.createElement("div");
    wrap.className = "totals";

    for (const card of cards) {
      if (!card.value) continue;
      const item = document.createElement("article");
      item.className = "total";

      const head = document.createElement("p");
      head.className = "total__title";
      head.textContent = card.title;
      const value = document.createElement("b");
      value.className = "total__value";
      value.textContent = card.value;
      item.append(head, value);

      for (const kind of ["plan", "goal"]) {
        const text = card[`${kind}Text`];
        const pct = card[`${kind}Pct`];
        if (!text || !pct) continue;

        const row = document.createElement("div");
        row.className = "total__row";
        const label = document.createElement("span");
        label.className = "total__label";
        label.textContent = text;
        const share = document.createElement("i");
        share.className = `total__pct ${card[`${kind}Class`] || ""}`.trim();
        share.textContent = pct;
        row.append(label, share);
        item.appendChild(row);

        const width = card[`${kind}Width`];
        if (width !== null && width !== undefined && width !== "") {
          const track = document.createElement("div");
          track.className = "total__track";
          const fill = document.createElement("i");
          fill.style.width = `${Math.min(100, Number(width) || 0)}%`;
          if (card[`${kind}Class`]) fill.className = card[`${kind}Class`];
          track.appendChild(fill);
          item.appendChild(track);
        }
      }
      if (card.planText && card.planPct) {
        bindTip(item, `<b>${card.title}</b><span>факт ${card.value}</span>` +
          `<span>${card.planText} — ${card.planPct}</span>` +
          (card.goalPct ? `<span>цель с отставанием — ${card.goalPct}</span>` : ""));
      }
      wrap.appendChild(item);
    }
    return wrap;
  }

  function renderFunnel(month) {
    const list = funnelData.поМесяцам?.[month] || funnelData.ступени || [];
    funnelBox.replaceChildren();
    if (!list.length) return;

    const head = document.createElement("div");
    head.className = "funnelHead";
    const lots = list.reduce((sum, s) => sum + (Number(s.lots) || 0), 0);
    head.innerHTML =
      `<b>${month}</b>` +
      `<span>${number(list[0].total_pallets ?? "")} паллет · ${lots} лотов` +
      `${list[0].total_okup_txt ? ` · окупаемость ${decimal(list[0].total_okup_txt)}` : ""}</span>`;
    funnelBox.appendChild(head);

    list.forEach((stage, index) => funnelBox.appendChild(renderStage(stage, list, index)));
    funnelBox.appendChild(renderTotals(list[0]));
  }

  function fillMonths(current) {
    const months = funnelData.месяцы?.length ? [...funnelData.месяцы].reverse() : [current];
    monthSelect.replaceChildren();
    for (const name of months) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      monthSelect.appendChild(option);
    }
    monthSelect.value = current;
  }

  monthSelect.addEventListener("change", () => renderFunnel(monthSelect.value));

  // Блоки грузятся независимо: если один источник отвалится, второй покажем.
  const load = (url) => fetch(url, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`${url}: ошибка ${r.status}`);
    return r.json();
  });

  // --- Выгрузка остатков в Excel ---------------------------------------------
  // Библиотека тянется только по нажатию: она весит почти мегабайт, и грузить
  // её всем ради кнопки, которой пользуются раз в неделю, незачем.
  const XLSX_URL = "../dashboard/vendor/xlsx.full.min.js";
  let stockData = null;

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = XLSX_URL;
      tag.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("библиотека не загрузилась")));
      tag.onerror = () => reject(new Error("не удалось загрузить библиотеку"));
      document.head.appendChild(tag);
    });
  }

  async function exportStock() {
    if (!stockData) return;
    const was = exportButton.textContent;
    exportButton.disabled = true;
    exportButton.textContent = "Собираю…";
    try {
      const XLSX = await loadXlsx();

      const detail = (stockData.паллеты || []).map((p) => ({
        "Тип остатков": p.тип,
        "Паллета": p.паллета,
        "Ячейка": p.ячейка,
        "Регион": p.регион,
        "Регион кратко": p.регион_кратко,
        "SKU": p.sku,
        "Штук": p.штук,
        "Себестоимость": p.себестоимость,
      }));

      const summary = [...(stockData.регионы || []), stockData.итого]
        .filter(Boolean)
        .map((r) => ({
          "Регион": r.регион,
          "Зарезервировано": r.зарезервировано,
          "Свободно": r.свободно,
          "Всего паллет": r.всего,
          "Штук": r.штук,
          "Себестоимость": r.себестоимость,
          "Себестоимость свободных": r.себестоимость_свободных,
          "Себестоимость зарезервированных": r.себестоимость_зарезервированных,
        }));

      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary), "По регионам");
      if (detail.length) {
        XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(detail), "Паллеты");
      }

      const stampText = String(stockData.обновлено || "").replace(/[^0-9]/g, "").slice(0, 8);
      XLSX.writeFile(book, `Остатки паллет ${stampText}.xlsx`);
    } catch (error) {
      say(`Не удалось собрать файл: ${error?.message || error}`, "error");
    } finally {
      exportButton.textContent = was;
      exportButton.disabled = false;
    }
  }

  exportButton?.addEventListener("click", exportStock);

  Promise.allSettled([load(STOCK_URL), load(FUNNEL_URL)]).then(([stock, funnel]) => {
    const problems = [];

    if (stock.status === "fulfilled") {
      const list = stock.value.регионы || [];
      const grid = document.createElement("div");
      grid.className = "stockGrid";
      for (const item of list) grid.appendChild(renderRegion(item));
      if (stock.value.итого) grid.appendChild(renderRegion(stock.value.итого, true));
      stockBox.replaceChildren(grid);
      stamp.textContent = `обновлено ${stock.value.обновлено}`;
      stockData = stock.value;
      if (exportButton) exportButton.disabled = false;
    } else {
      problems.push("остатки");
    }

    if (funnel.status === "fulfilled") {
      funnelData = funnel.value;
      fillMonths(funnelData.месяц);
      renderFunnel(funnelData.месяц);
    } else {
      problems.push("воронку");
    }

    say(problems.length ? `Не удалось загрузить ${problems.join(" и ")}.` : "",
        problems.length ? "error" : "");
  });
})();
