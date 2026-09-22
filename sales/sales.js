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
  const funnelRefresh = $("funnelRefresh");

  let funnelData = null;
  let canEditFunnelPlan = false;
  let planMonthKey = null;
  let planRequest = 0;
  let planSaving = false;
  const planDialog = $("funnelPlan");
  const planFields = { sale: $("funnelPlanSale"), cost: $("funnelPlanCost"), pallets: $("funnelPlanPallets") };

  function planStatus(text, error = false) {
    $("funnelPlanStatus").textContent = text;
    $("funnelPlanStatus").classList.toggle("is-error", error);
  }

  async function openFunnelPlan(focusField = "sale") {
    if (!canEditFunnelPlan || planSaving) return;
    const row = (funnelData?.поМесяцам?.[monthSelect.value] || funnelData?.ступени || [])[0];
    if (!row || !/^\d{4}-\d{2}$/.test(row.month_key || "")) {
      say("Не удалось определить месяц цели. Обновите воронку.", "error");
      return;
    }
    planMonthKey = row.month_key;
    const request = ++planRequest;
    $("funnelPlanMonth").textContent = `${monthSelect.value} ${planMonthKey.slice(0, 4)}`;
    $("funnelPlanSave").disabled = true;
    Object.values(planFields).forEach((field) => { field.value = ""; field.disabled = true; });
    planStatus("Загружаю сохранённый план…");
    planDialog.showModal();
    try {
      const response = await fetch(`/__funnel/plan?month_key=${encodeURIComponent(planMonthKey)}`, {
        credentials: "same-origin", cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "не удалось прочитать план");
      if (request !== planRequest || !planDialog.open) return;
      for (const [key, field] of Object.entries(planFields)) {
        field.value = data.plan?.[key] == null ? "" : number(data.plan[key]);
        field.disabled = false;
      }
      $("funnelPlanSave").disabled = false;
      planStatus(data.plan?.source === "вручную" ? "Сейчас установлен ручной план." : "");
      planFields[focusField].focus();
      planFields[focusField].select();
    } catch (error) {
      if (request === planRequest && planDialog.open) planStatus(`Не удалось загрузить цель: ${error.message}`, true);
    }
  }

  $("funnelPlanCancel")?.addEventListener("click", () => planDialog.close());
  planDialog?.addEventListener("close", () => { planRequest += 1; });
  planDialog?.addEventListener("cancel", (event) => { if (planSaving) event.preventDefault(); });
  $("funnelPlanForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (planSaving || $("funnelPlanSave").disabled) return;
    const values = Object.fromEntries(Object.entries(planFields).map(([key, field]) =>
      [key, Number(field.value.trim().replace(/\s/g, "").replace(",", "."))]));
    if (Object.values(values).some((value) => !Number.isFinite(value) || value <= 0) ||
        !Number.isSafeInteger(values.pallets)) {
      planStatus("Введите положительные суммы и целое число паллет.", true);
      return;
    }
    const selectedMonth = monthSelect.value;
    planSaving = true;
    for (const control of [...Object.values(planFields), $("funnelPlanSave"), $("funnelPlanCancel"), monthSelect, funnelRefresh]) control.disabled = true;
    planStatus("Сохраняю цель и пересчитываю график…");
    try {
      const response = await fetch("/__funnel/plan", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month_num: Number(planMonthKey.slice(5)), month_key: planMonthKey, ...values })
      });
      const latest = await response.json();
      if (!response.ok) throw new Error(latest.error || "сервер не сохранил цель");
      if (latest.plan_saved && latest.refresh_pending) {
        planStatus("Цель сохранена. Обновить график пока не удалось — нажмите «Обновить из таблицы» позже.", true);
        return;
      }
      if (!latest.поМесяцам) throw new Error("нет подтверждения пересчёта графика");
      funnelData = latest;
      fillMonths(latest.месяц);
      if ([...monthSelect.options].some((option) => option.value === selectedMonth)) monthSelect.value = selectedMonth;
      renderFunnel(monthSelect.value);
      planDialog.close();
      say(`Цель на ${selectedMonth.toLowerCase()} сохранена. График пересчитан.`);
    } catch (error) {
      planStatus(`Не удалось завершить сохранение: ${error.message}`, true);
    } finally {
      planSaving = false;
      for (const control of [...Object.values(planFields), $("funnelPlanSave"), $("funnelPlanCancel"), monthSelect, funnelRefresh]) control.disabled = false;
    }
  });

  fetch("/__me", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((user) => {
      canEditFunnelPlan = ["admin", "chief"].includes(user?.role || user?.роль);
      if (funnelData) renderFunnel(monthSelect.value);
    }).catch(() => {});

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
    // На телефоне подсказка вылезает по касанию и уходит сама: там нет курсора,
    // а цифры под пальцем нужны те же.
    element.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      if (touch) showTip(html, { clientX: touch.clientX, clientY: touch.clientY });
      buzz();
    }, { passive: true });
    element.addEventListener("touchend", () => setTimeout(hideTip, 2200), { passive: true });
  }

  /** Короткая вибрация на телефоне — отклик на касание там, где нет курсора. */
  function buzz(ms = 8) {
    try { navigator.vibrate?.(ms); } catch { /* не поддерживается — и ладно */ }
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
      const open = () => { buzz(12); openRegion(item.регион, card); };
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

  /** «5.23 млн» → 5230000: запрос отдаёт подписанные строки, для ширины нужно число. */
  const MNOZHITELI = { "тыс": 1e3, "млн": 1e6, "млрд": 1e9 };
  function summa(text) {
    const s = String(text ?? "").replace(",", ".");
    const chislo = parseFloat(s);
    if (!Number.isFinite(chislo)) return 0;
    const hvost = s.replace(/^[\d.\s]+/, "").trim().toLowerCase();
    return chislo * (MNOZHITELI[hvost] || 1);
  }

  /** Суммы в json подписаны строкой («5.62 млн»); на графике удобнее млн. */
  const vMln = (text) => summa(text) / 1e6;
  const dec2 = (value, digits = 2) => Number(value || 0).toFixed(digits).replace(".", ",");
  const okupClass = (cls) =>
    ({ "ok-grn": "vtOkup--good", "ok-amb": "vtOkup--warn", "ok-red": "vtOkup--bad" }[cls] || "");

  const VT_IKONKI = {
    korobka: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
    mishen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
    stolbiki: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 20V11"/><path d="M12 20V4"/><path d="M18 20v-6"/></svg>',
    rost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5h-5"/></svg>',
    summa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5H6l6 7-6 7h12"/></svg>',
    chasy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  /** Отставание — хвост прошлого месяца: сколько он недодал к своему плану.
   *
   * Так эту цифру понимают продажи: цель текущего месяца = свой план плюс
   * чужой долг. Перевыполнение в минус не уходит — цель не опускается ниже
   * плана. Поля goal_* из json тут не годятся: там накопленная годовая цель.
   */
  function otstavanie(head) {
    const prevNum = Number(head.month_num) - 1;
    for (const [name, list] of Object.entries(funnelData.поМесяцам || {})) {
      const first = list[0];
      if (!first || Number(first.month_num) !== prevNum) continue;
      return { prevName: name, dolg: Math.max(Number(first.plan_sale_raw || 0) / 1e6 - vMln(first.sale_txt), 0) };
    }
    return { prevName: "", dolg: 0 };
  }

  /** Четыре плитки: отгружено, в работе, план, потенциал. */
  function renderPlitki(v) {
    // Подпись у всех плиток ровно двухстрочная: иначе карточки в ряду
    // тянутся по самой высокой и под короткими висит пустота.
    const planPod = !v.plan ? ["План на месяц", "не задан"]
      : v.ship >= v.plan
        ? [`Выполнен на <b>${Math.round((v.ship / v.plan) * 100)}%</b>`, `сверху <b>${dec2(v.ship - v.plan)} млн ₽</b>`]
        : [`Выполнено <b>${Math.round((v.ship / v.plan) * 100)}%</b>`, `осталось <b>${dec2(v.plan - v.ship)} млн ₽</b>`];
    const potPod = v.pot >= v.goal
      ? ["Цель <b>закрывается</b>", `с запасом <b>${dec2(v.pot - v.goal)} млн ₽</b>`]
      : ["До цели не хватает", `<b>${dec2(v.goal - v.pot)} млн ₽</b>`];

    const plitka = ({ mod, znak, teg, val, pod }) => `
      <article class="vtPlitka ${mod || ""}">
        <span class="vtPlitka__znak">${znak}</span>
        <span class="vtPlitka__teg">${teg}</span>
        <span class="vtPlitka__val">${val}<small>млн ₽</small></span>
        <span class="vtPlitka__pod">${pod.map((line) => `<span>${line}</span>`).join("")}</span>
      </article>`;

    const box = document.createElement("div");
    box.className = "vtPlitki";
    box.innerHTML = [
      plitka({ mod: "vtPlitka--ship", znak: VT_IKONKI.korobka, teg: "Отгружено", val: dec2(v.ship),
        pod: [`<b>${number(v.shipPallets)}</b> паллет`, `окупаемость <b>${decimal(v.shipOkup)}</b>`] }),
      plitka({ znak: VT_IKONKI.mishen, teg: "В работе", val: dec2(v.work),
        pod: [`<b>${number(v.workPallets)}</b> паллет`,
              `<b>${v.workStages}</b> ${v.workStages === 1 ? "этап" : "этапа"} до отгрузки`] }),
      plitka({ mod: "vtPlitka--plan", znak: VT_IKONKI.stolbiki, teg: "План месяца", val: dec2(v.plan), pod: planPod }),
      plitka({ mod: "vtPlitka--pot", znak: VT_IKONKI.rost, teg: "Потенциал", val: dec2(v.pot), pod: potPod }),
    ].join("");
    return box;
  }

  /** Путь к цели: отгружено и в работе одной полосой, план и цель — метками. */
  function renderPut(v) {
    // Шкала берётся по самому дальнему ориентиру, иначе метка цели уедет
    // за полосу. Запас 6% — чтобы подпись у правого края не обрезалась.
    const scale = Math.max(v.pot, v.plan, v.goal) * 1.06 || 1;
    const pct = (value) => (value / scale) * 100;
    const metka = (mod, value) => value ? `
      <div class="vtMetka ${mod}" style="left:${pct(value)}%">
        <span class="vtMetka__tochka"></span><span class="vtMetka__liniya"></span>
      </div>` : "";
    // Подписи меток живут в шапке панели, а не над полосой: ярус подписей
    // занимал всю ширину блока ради двух цифр у правого края.
    const legenda = (mod, title, value, pravka) => value ? `
      <${pravka ? 'button type="button" class="vtLeg vtLeg--knopka' : 'span class="vtLeg'} ${mod}"
        ${pravka ? 'title="Изменить план месяца и пересчитать цель"' : ""}>
        <i></i><span class="vtLeg__t">${title}</span><b>${dec2(value)} млн ₽</b>
      </${pravka ? "button" : "span"}>` : "";

    const dolg = v.dolg > 0
      ? `Цель с отставанием: план <b>${dec2(v.plan)}</b> + долг за ${v.prevName.toLowerCase()} <b>${dec2(v.dolg)} млн ₽</b>`
      : `Прошлый месяц закрыт, отставания нет: цель равна плану — <b>${dec2(v.goal)} млн ₽</b>`;

    const panel = document.createElement("section");
    panel.className = "vtPanel";
    panel.innerHTML = `
      <div class="vtPanel__head">
        <h2>Путь к цели</h2>
        <div class="vtLegenda">
          ${legenda("vtLeg--plan", "План месяца", v.plan, canEditFunnelPlan)}
          ${legenda("vtLeg--goal", "Цель с отставанием", v.goal)}
        </div>
        ${canEditFunnelPlan ? '<button type="button" class="action action--secondary vtPravkaPlana">Изменить цель</button>' : ""}
      </div>
      <div class="vtBar">
        ${metka("", v.plan)}
        ${metka("vtMetka--goal", v.goal)}
        <div class="vtBar__zhelob">
          <div class="vtBar__seg vtBar__seg--ship" style="width:${pct(v.ship)}%">${dec2(v.ship)}</div>
          <div class="vtBar__seg vtBar__seg--work" style="width:${pct(v.work)}%">${v.work ? dec2(v.work) : ""}</div>
        </div>
        <div class="vtBar__podpis">
          <span style="width:${pct(v.ship)}%">Отгружено</span>
          <span style="width:${pct(v.work)}%">В работе</span>
        </div>
      </div>
      <div class="vtItogi">
        <div class="vtItog"><span class="vtItog__znak">${VT_IKONKI.rost}</span>
          Потенциал при закрытии всех сделок: <b>${dec2(v.pot)} млн ₽</b></div>
        <div class="vtItog vtItog--net"><span class="vtItog__znak">${VT_IKONKI.mishen}</span>${dolg}</div>
      </div>`;

    // План правится прямо с графика — тем же диалогом, что и раньше.
    // Правка плана двумя путями: кнопкой в шапке панели и кликом по самой
    // метке на графике — по метке не все догадаются, кнопка привычнее.
    for (const knopka of panel.querySelectorAll(".vtLeg--knopka, .vtPravkaPlana")) {
      knopka.addEventListener("click", () => { hideTip(); openFunnelPlan("sale"); });
    }
    return panel;
  }

  /** Этапы сделки таблицей: снизу вверх, от переговоров к отгрузке. */
  function renderEtapy(list) {
    const rows = [...list].reverse();
    const max = Math.max(...rows.map((r) => vMln(r.sale_txt)), 0.001);
    const panel = document.createElement("section");
    panel.className = "vtPanel";
    panel.innerHTML = `
      <div class="vtPanel__head">
        <h2>Сделки по этапам</h2>
        <p class="vtHint">Сумма в ценах продаж, млн ₽</p>
      </div>
      <div class="vtTable">
        <table>
          <thead><tr>
            <th></th><th>Этап</th><th></th>
            <th>Лоты</th><th>Паллеты</th><th>Себест., млн ₽</th><th>Окупаемость</th>
          </tr></thead>
          <tbody>${rows.map((r, i) => {
            const sale = vMln(r.sale_txt);
            const ship = Number(r.stage_ord) === 1;
            return `<tr class="${ship ? "is-ship" : ""}">
              <td><span class="vtNum">${i + 1}</span></td>
              <td>${r.stage}</td>
              <td><span class="vtPoloska"><i style="width:${Math.max((sale / max) * 100, 2)}%"></i><b>${dec2(sale)}</b></span></td>
              <td>${number(r.lots)}</td>
              <td>${number(r.pallets_txt)}</td>
              <td>${dec2(vMln(r.cost_txt))}</td>
              <td class="${okupClass(r.okup_cls)}">${decimal(r.okup_txt) || "—"}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>`;

    // Подсказка на строке — то, что не влезло в колонки: доля месяца и конверсия.
    const vsego = summa(list[0] && list[0].total_sale_txt);
    panel.querySelectorAll("tbody tr").forEach((row, i) => {
      const stage = rows[i];
      const share = vsego ? ` · ${(summa(stage.sale_txt) / vsego * 100).toFixed(0)}% месяца` : "";
      bindTip(row, `<b>${stage.stage}</b>` +
        `<span>${decimal(stage.sale_txt)} в ценах продаж${share}</span>` +
        `<span>${number(stage.pallets_txt)} паллет · лотов ${number(stage.lots)}</span>` +
        `<span>себестоимость ${decimal(stage.cost_txt)}</span>` +
        (stage.conv_txt ? `<span class="tip__hint">к предыдущей ступени ${decimal(stage.conv_txt)}</span>` : ""));
    });
    return panel;
  }

  /** Итоги квартала: факт, потенциал и бюджет по месяцам до текущего. */
  function renderKvartal(head) {
    const kv = Math.floor((Number(head.month_num) - 1) / 3);
    let fact = 0, potential = 0, budget = 0;
    for (const list of Object.values(funnelData.поМесяцам || {})) {
      const first = list[0];
      if (!first || Math.floor((Number(first.month_num) - 1) / 3) !== kv) continue;
      if (Number(first.month_num) > Number(head.month_num)) continue;
      fact += vMln(first.sale_txt);
      potential += vMln(first.total_sale_txt);
      budget += Number(first.plan_sale_raw || 0) / 1e6;
    }
    const kart = (znak, teg, val) => `
      <article class="vtKv"><span class="vtKv__znak">${znak}</span>
        <span class="vtKv__teg">${teg}</span>
        <span class="vtKv__val">${dec2(val)}<small>млн ₽</small></span>
      </article>`;
    const box = document.createElement("div");
    box.className = "vtKvartal";
    box.innerHTML =
      kart(VT_IKONKI.stolbiki, `${["I", "II", "III", "IV"][kv]} квартал — факт`, fact) +
      kart(VT_IKONKI.summa, "С учётом всех сделок в работе", potential) +
      kart(VT_IKONKI.chasy, "Бюджет квартала", budget);
    return box;
  }

  function renderFunnel(month) {
    const list = funnelData.поМесяцам?.[month] || funnelData.ступени || [];
    funnelBox.replaceChildren();
    if (!list.length) return;

    const head = list[0];
    const shipRow = list.find((r) => Number(r.stage_ord) === 1) || head;
    const workRows = list.filter((r) => Number(r.stage_ord) !== 1);
    const { prevName, dolg } = otstavanie(head);
    const plan = Number(head.plan_sale_raw || 0) / 1e6;

    const v = {
      ship: vMln(shipRow.sale_txt),
      shipPallets: shipRow.pallets_txt,
      shipOkup: shipRow.okup_txt,
      work: workRows.reduce((sum, r) => sum + vMln(r.sale_txt), 0),
      workPallets: workRows.reduce((sum, r) => sum + (Number(r.pallets_txt) || 0), 0),
      workStages: workRows.length,
      pot: vMln(head.total_sale_txt),
      plan, prevName, dolg, goal: plan + dolg,
    };

    funnelBox.dataset.tema = localStorage.getItem("vt-tema") === "svet" ? "svet" : "temno";
    funnelBox.append(renderPlitki(v), renderPut(v), renderEtapy(list), renderKvartal(head));
  }

  /** Тема блока: тёмная как вся страница, светлая — по кнопке, с памятью. */
  const temaKnopka = $("funnelTema");
  temaKnopka?.addEventListener("click", () => {
    const tema = funnelBox.dataset.tema === "svet" ? "temno" : "svet";
    localStorage.setItem("vt-tema", tema);
    funnelBox.dataset.tema = tema;
    temaKnopka.textContent = tema === "svet" ? "Тёмная тема" : "Светлая тема";
  });
  if (temaKnopka && localStorage.getItem("vt-tema") === "svet") temaKnopka.textContent = "Тёмная тема";

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

  funnelRefresh?.addEventListener("click", async () => {
    funnelRefresh.disabled = true;
    funnelRefresh.textContent = "Обновляю из таблицы…";
    try {
      const response = await fetch("/__funnel-refresh", {
        method: "POST", credentials: "same-origin", cache: "no-store"
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error("обновление уже идёт, попробуйте через несколько секунд");
        if (response.status === 401 || response.status === 403) throw new Error("нет доступа — войдите на сайт заново");
        throw new Error(`Google-таблица недоступна или расчёт не завершился (${response.status})`);
      }
      const latest = await response.json();
      const selectedMonth = monthSelect.value;
      funnelData = latest;
      fillMonths(latest.месяц);
      if ([...monthSelect.options].some((option) => option.value === selectedMonth)) monthSelect.value = selectedMonth;
      renderFunnel(monthSelect.value);
      say(`Воронка пересчитана из Google-таблицы · ${latest.обновлено || "сейчас"}`);
    } catch (error) {
      say(`Не удалось обновить воронку: ${error.message}`, "error");
    } finally {
      funnelRefresh.disabled = false;
      funnelRefresh.textContent = "Обновить из таблицы";
    }
  });

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

  exportButton?.addEventListener("click", () => { buzz(10); exportStock(); });

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
