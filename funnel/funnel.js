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

    stamp.textContent = `обновлено ${payload.обновлено}`;
    say("");
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
