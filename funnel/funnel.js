(() => {
  "use strict";

  // Данные считает «10 — Воронка отгрузок на сайт.py» тем же запросом, что и
  // чарт 2870 в Superset: ступени, деньги и окупаемость приходят готовыми.
  // Здесь только отрисовка.
  const DATA_URL = "../data/funnel.json";

  const $ = (id) => document.getElementById(id);
  const message = $("message");
  const box = $("funnel");
  const monthSelect = $("month");
  const stamp = $("stamp");

  let payload = null;

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
    message.style.display = text ? "block" : "none";
  }

  /** Запрос отдаёт «0.37 млн» с точкой — в русском тексте это выглядит чужеродно. */
  function decimal(text) {
    return String(text ?? "").replace(/(\d)\.(\d)/g, "$1,$2");
  }

  function number(value) {
    const n = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(n) ? n.toLocaleString("ru-RU") : String(value ?? "");
  }

  /** Ширина ступени. Воронка центрированная: самая широкая — максимум месяца. */
  function widthOf(stage, all) {
    const values = all.map((s) => Number(s.pallets_txt) || 0);
    const max = Math.max(...values, 1);
    const own = Number(stage.pallets_txt) || 0;
    // Нижняя граница, иначе ступень в пару паллет вырождается в полоску без числа.
    return Math.max(18, (own / max) * 100);
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
    // Оттенок задаёт запрос — он же красит ступени в самом Superset.
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

    // Переход между ступенями: на сколько процентов сузилась воронка.
    if (index > 0 && stage.conv_txt) {
      const link = document.createElement("p");
      link.className = "stage__link";
      link.textContent = decimal(stage.conv_txt);
      box.appendChild(link);
    }
    return row;
  }

  function render(month) {
    const list = payload.поМесяцам?.[month] || payload.ступени || [];
    box.replaceChildren();

    if (!list.length) {
      say("За этот месяц данных нет.", "warn");
      return;
    }

    const head = document.createElement("div");
    head.className = "funnelHead";
    const lots = list.reduce((sum, s) => sum + (Number(s.lots) || 0), 0);
    head.innerHTML =
      `<b>${month}</b>` +
      `<span>${number(list[0].total_pallets ?? "")} паллет · ${lots} лотов` +
      `${list[0].total_okup_txt ? ` · окупаемость ${decimal(list[0].total_okup_txt)}` : ""}</span>`;
    box.appendChild(head);

    list.forEach((stage, index) => box.appendChild(renderStage(stage, list, index)));
    box.appendChild(renderTotals(list[0]));

    stamp.textContent = `обновлено ${payload.обновлено}`;
    say("");
  }


  /** Итоги месяца против плана и годовой цели.
   *
   * Все числа считает тот же запрос — здесь только раскладка. Полоса показывает
   * выполнение: план и цель идут отдельными строками, потому что расходятся
   * (цель учитывает накопленное отставание).
   */
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
          // Больше ста процентов полоса не рисует — иначе вылезет за дорожку.
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

  function fillMonths(current) {
    const months = payload.месяцы?.length ? [...payload.месяцы].reverse() : [current];
    monthSelect.replaceChildren();
    for (const name of months) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      monthSelect.appendChild(option);
    }
    monthSelect.value = current;
  }

  monthSelect.addEventListener("change", () => render(monthSelect.value));

  fetch(DATA_URL, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`сервер вернул ошибку ${response.status}`);
      return response.json();
    })
    .then((data) => {
      payload = data;
      fillMonths(data.месяц);
      render(data.месяц);
    })
    .catch((error) => {
      say(`Не удалось загрузить воронку: ${error?.message || error}`, "error");
    });
})();
