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

  let funnelData = null;

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
    message.style.display = text ? "block" : "none";
  }

  const count = (value) => Number(value || 0).toLocaleString("ru-RU");

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
    return card;
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
