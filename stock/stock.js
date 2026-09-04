(() => {
  "use strict";

  // Данные считает «11 — Остатки паллет на сайт.py» напрямую из DWH.
  // Здесь только отрисовка: столбик на регион, красное сверху — зарезервировано.
  const DATA_URL = "../data/pallets-stock.json";

  const $ = (id) => document.getElementById(id);
  const message = $("message");
  const box = $("stock");
  const stamp = $("stamp");

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
    message.style.display = text ? "block" : "none";
  }

  const count = (value) => Number(value || 0).toLocaleString("ru-RU");

  /** Деньги: миллионы с одним знаком — на плитке важен порядок, не копейки. */
  function money(value) {
    const n = Number(value || 0);
    if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
    if (Math.abs(n) >= 1e3) return `${Math.round(n / 1e3).toLocaleString("ru-RU")} тыс`;
    return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  }

  function renderColumn(item, isTotal = false) {
    const total = item.всего || 1;
    const resShare = (item.зарезервировано / total) * 100;
    const freeShare = 100 - resShare;

    const card = document.createElement("article");
    card.className = `stockCard${isTotal ? " stockCard--total" : ""}`;

    const bar = document.createElement("div");
    bar.className = "stockBar";

    // Доли рисуем в процентах от высоты: столбики сравниваются по составу,
    // а абсолютный объём читается числом под ними.
    for (const [kind, share, value] of [
      ["res", resShare, item.зарезервировано],
      ["free", freeShare, item.свободно],
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
      `<div><dt>Себестоимость</dt><dd>${money(item.себестоимость)} ₽</dd></div>` +
      `<div><dt>Штук</dt><dd>${count(item.штук)}</dd></div>`;

    card.append(bar, name, split, cost);
    return card;
  }

  fetch(DATA_URL, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`сервер вернул ошибку ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const list = data.регионы || [];
      if (!list.length) {
        say("Данных нет.", "warn");
        return;
      }
      const grid = document.createElement("div");
      grid.className = "stockGrid";
      for (const item of list) grid.appendChild(renderColumn(item));
      if (data.итого) grid.appendChild(renderColumn(data.итого, true));
      box.replaceChildren(grid);
      stamp.textContent = `обновлено ${data.обновлено}`;
      say("");
    })
    .catch((error) => {
      say(`Не удалось загрузить остатки: ${error?.message || error}`, "error");
    });
})();
