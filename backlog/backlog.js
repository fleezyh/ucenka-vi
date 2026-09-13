(() => {
  "use strict";

  // Данные готовит task_backlog.py на сервере: детальная выгрузка по актам,
  // свод по зонам и история по дням из PostgreSQL. Здесь только отрисовка.
  const DATA_URL = "../data/backlog.json";

  const $ = (id) => document.getElementById(id);
  const message = $("message");

  const count = (value) => Number(value || 0).toLocaleString("ru-RU");

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
    message.style.display = text ? "block" : "none";
  }

  /** «13 сентября», без года — год и так текущий. */
  function denPodpis(iso) {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }

  function korotkiyDen(iso) {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  }

  function delta(n) {
    if (!n) return { text: "—", klass: "zero" };
    return { text: `${n > 0 ? "+" : "−"}${count(Math.abs(n))}`, klass: n > 0 ? "up" : "down" };
  }

  function megabayty(bytes) {
    return `${(Number(bytes || 0) / 1048576).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
  }

  let dannye = null;
  let vybrannyDen = null;   // iso выбранного дня
  let otkrytaZona = null;   // зона, подсвеченная на графике

  function render() {
    renderSummary();
    renderChart();
    renderZones();
    renderMethod();
  }

  function istoriya() {
    return dannye.история || [];
  }

  function denPoIso(iso) {
    return istoriya().find((d) => d.день === iso) || null;
  }

  function renderSummary() {
    const dni = istoriya();
    const pervyy = dni[0];
    const posledniy = dni[dni.length - 1] || { штук: dannye.штук };
    const izmenenie = pervyy ? posledniy.штук - pervyy.штук : 0;
    const znak = delta(izmenenie);
    const box = $("summary");

    const karty = [
      { b: count(dannye.штук), s: "штук лежит сейчас" },
      { b: count(dannye.актов), s: "актов приёмки в бэклоге" },
      { b: count(dannye.по_зонам.length), s: "зон фильтра брака" },
      {
        b: znak.text,
        s: pervyy ? `штук за ${dni.length} дней, с ${denPodpis(pervyy.день)}` : "история копится",
        klass: izmenenie > 0 ? "summaryCard--up" : izmenenie < 0 ? "summaryCard--down" : "",
      },
    ];

    box.innerHTML = karty.map((k) =>
      `<article class="summaryCard ${k.klass || ""}"><b>${k.b}</b><span>${k.s}</span></article>`).join("");
    box.hidden = false;
  }

  function renderChart() {
    const dni = istoriya();
    const panel = $("history-panel");
    if (dni.length < 2) { panel.hidden = true; return; }

    $("history-days").textContent = dni.length;

    const znacheniya = dni.map((d) => (otkrytaZona ? zonaVDen(d, otkrytaZona) : d.штук));
    const max = Math.max(...znacheniya, 1);
    const min = Math.min(...znacheniya);
    // Шкала от нуля врёт: рост со 134 до 155 тысяч выглядел бы ровной полкой.
    // Отталкиваемся от минимума, оставляя ему четверть высоты.
    const niz = min - (max - min) * 0.35 || 0;

    const chart = document.createElement("div");
    chart.className = "chart";
    dni.forEach((d, i) => {
      const znachenie = znacheniya[i];
      const vysota = Math.max(6, Math.round(((znachenie - niz) / (max - niz || 1)) * 150));
      const knopka = document.createElement("button");
      knopka.type = "button";
      knopka.className = "day";
      knopka.setAttribute("aria-pressed", String(d.день === vybrannyDen));
      knopka.innerHTML = `<b>${count(znachenie)}</b><i style="height:${vysota}px"></i>`
        + `<em>${korotkiyDen(d.день)}</em>`;
      knopka.title = `${denPodpis(d.день)}: ${count(znachenie)} шт`;
      knopka.addEventListener("click", () => {
        vybrannyDen = d.день;
        render();
      });
      chart.appendChild(knopka);
    });

    const wrap = $("chart");
    wrap.innerHTML = "";
    wrap.appendChild(chart);

    const pervyy = dni[0];
    const posledniy = dni[dni.length - 1];
    const shag = posledniy.штук - pervyy.штук;
    $("history-note").textContent = otkrytaZona
      ? `На графике только зона «${otkrytaZona}». Щёлкните по ней в таблице ещё раз, чтобы вернуть общий итог.`
      : `С ${denPodpis(pervyy.день)} по ${denPodpis(posledniy.день)} бэклог ${shag >= 0 ? "вырос" : "снизился"} `
        + `на ${count(Math.abs(shag))} штук — ${count(pervyy.штук)} → ${count(posledniy.штук)}. `
        + `Прошлые дни восстановлены по движениям, дальше история копится сама.`;
    panel.hidden = false;
  }

  function zonaVDen(den, imya) {
    const najdeno = (den.по_зонам || []).find((z) => z.зона === imya);
    return najdeno ? najdeno.штук : 0;
  }

  function renderZones() {
    const dni = istoriya();
    const den = denPoIso(vybrannyDen) || dni[dni.length - 1];
    const pervyy = dni[0];
    const stroki = den ? den.по_зонам : dannye.по_зонам;
    const vsego = stroki.reduce((s, z) => s + z.штук, 0) || 1;

    $("zones-day").textContent = den ? `на ${denPodpis(den.день)}` : "";

    const golova = `<thead><tr><th>Зона</th><th>Штук</th><th>Доля</th><th>SKU</th>`
      + `<th>Контейнеров</th><th>За период</th></tr></thead>`;

    const telo = stroki.map((z) => {
      const bylo = pervyy ? zonaVDen(pervyy, z.зона) : 0;
      const d = delta(pervyy ? z.штук - bylo : 0);
      const dolya = (z.штук / vsego) * 100;
      return `<tr data-zona="${z.зона}" class="${z.зона === otkrytaZona ? "is-open" : ""}">`
        + `<td>${z.зона}<i class="share" style="width:${Math.max(2, dolya)}%"></i></td>`
        + `<td class="num">${count(z.штук)}</td>`
        + `<td class="num">${dolya.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</td>`
        + `<td class="num">${count(z.sku)}</td>`
        + `<td class="num">${count(z.контейнеров)}</td>`
        + `<td class="num ${d.klass}">${d.text}</td></tr>`;
    }).join("");

    const itogoBylo = pervyy ? pervyy.штук : 0;
    const itogD = delta(pervyy && den ? den.штук - itogoBylo : 0);
    const noga = `<tfoot><tr><td>Итого</td><td class="num">${count(vsego)}</td><td></td>`
      + `<td></td><td></td><td class="num ${itogD.klass}">${itogD.text}</td></tr></tfoot>`;

    const tablica = $("zones");
    tablica.innerHTML = golova + `<tbody>${telo}</tbody>` + noga;
    tablica.querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        otkrytaZona = otkrytaZona === tr.dataset.zona ? null : tr.dataset.zona;
        render();
      });
    });
    $("zones-panel").hidden = false;
  }

  function renderMethod() {
    const m = dannye.методика;
    if (!m) return;
    const blok = $("method");
    blok.innerHTML =
      `<h3>Зоны, которые считаем бэклогом</h3>`
      + `<div class="methodZones">${m.зоны.map((z) => `<span>${z}</span>`).join("")}</div>`
      + m["как отбираем"].map((p) => `<p>${p}</p>`).join("")
      + `<h3>Откуда прошлые дни</h3><p>${m.история}</p>`;
    $("method-panel").hidden = false;
  }

  fetch(DATA_URL, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((json) => {
      dannye = json;
      vybrannyDen = json.день;
      say("");
      $("stamp").textContent = `посчитано ${json.посчитано}`;
      $("download-note").textContent =
        `${count(json.строк_в_выгрузке)} строк · ${megabayty(json.выгрузка.размер)} сжато`;
      render();
    })
    .catch(() => say("Не получилось загрузить бэклог. Обновите страницу через минуту.", "error"));
})();
