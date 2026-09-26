/* ТСД · актировка целой паллеты (26.09): «актировку по паллете целой — это
   прямо можно точно делать». Пикнул паллету «CON …» — видно, какие штуки на
   ней без акта; крит/косм и один дефект — и на каждую штуку создаётся акт
   (акт в ВМС — одна штука). Работа идёт на сервере в фоне, здесь — ход.
   С ?demo страница показывает прежнее демо (akt.js). */
(function () {
  "use strict";
  if (/[?&]demo/.test(location.search)) return;

  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const DEFEKTY = [
    { k: "переломан", имя: "Переломан" }, { k: "расколот", имя: "Расколот" },
    { k: "погнут", имя: "Погнут" }, { k: "порвана упаковка", имя: "Порвана упаковка" },
    { k: "надорван", имя: "Надорван" }, { k: "потёртости", имя: "Потёртости" },
    { k: "следы загрязнения, нетоварный вид", имя: "Загрязнение" }, { k: "не работает", имя: "Не работает" },
  ];
  const KRIT = [{ k: "крит", имя: "Критичный" }, { k: "косм", имя: "Косметический" }];

  let sost = { включена: false, общий_можно: false, вмс: { подключено: false } };
  let pal = null;       // состав паллеты
  let krit = "";
  let defekt = "";
  let rabota = null;    // { id, ... ход }
  let oshibka = "";
  let formaVhoda = false;

  const demo = el("aktDemo");
  if (demo) demo.textContent = "Актировка целой паллеты: пикните наклейку паллеты (CON …) — на каждую штуку без акта создастся акт в ВМС.";

  const vFokus = () => setTimeout(() => el("aktSkan") && el("aktSkan").focus(), 50);

  function strokaVms() {
    if (!sost.включена) return `<p class="aktPs__net"><b class="aktPs__oshibka">Актировка выключена в админке.</b></p>`;
    if (sost.вмс && sost.вмс.подключено) return `<p class="aktPs__chto">ВМС: ${esc(sost.вмс.имя)} · акты от вашего имени</p>`;
    if (!formaVhoda) {
      return `<p class="aktPs__chto">ВМС: не подключено${sost.общий_можно ? " · пока акты под общим логином" : ""}
        <button type="button" class="aktPs__kn" id="palVoyti" style="width:auto;min-height:36px;padding:6px 14px">Войти в ВМС</button></p>`;
    }
    return `<form class="aktPs__vhod" id="palVhod" autocomplete="off">
      <input name="login" placeholder="Логин ВМС" autocapitalize="off" required>
      <input name="parol" type="password" placeholder="Пароль ВМС" required>
      <button class="aktPs__kn is-on" type="submit">Войти</button></form>`;
  }

  function narisovat() {
    const karta = el("aktKarta");
    if (!pal) {
      karta.innerHTML = `${strokaVms()}${oshibka ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(oshibka)}</b></p>` : ""}
        <p class="tsdPusto">Пикните наклейку паллеты (CON …)</p>`;
      el("aktZhurnal").innerHTML = "";
      return;
    }
    const bez = pal.без_акта;
    const spisok = pal.строки.map((x) => `<div class="palStroka${x.без_акта ? " is-bez" : ""}">
        <span class="palStroka__tovar">${esc(x.товар)}</span>
        <span class="palStroka__sht">${x.штук} шт</span>
        <span class="palStroka__akt">${x.акт ? `акт №${x.акт}` : x.уже_нами && !x.без_акта ? "заактировано нами" : "без акта"}</span>
      </div>`).join("");
    let niz = "";
    if (rabota) {
      const proc = rabota.всего ? Math.round(100 * rabota.готово / rabota.всего) : 0;
      niz = `<div class="palHod"><p class="aktPs__podskaz">${rabota.идёт ? "Актирую…" : "Готово"} ${rabota.готово} из ${rabota.всего}</p>
        <div class="palHod__polosa"><i style="width:${proc}%"></i></div>
        <p class="aktPs__chto">актов создано: ${rabota.акты.length}${rabota.ошибки.length ? ` · ошибок: ${rabota.ошибки.length}` : ""}</p>
        ${rabota.ошибки.slice(-3).map((o) => `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(o.товар)}</b> ${esc(o.ошибка)}</p>`).join("")}
        ${rabota.идёт ? "" : `<p class="aktPs__chto">Пикните следующую паллету.</p>`}</div>`;
    } else if (bez) {
      const gotov = krit && defekt;
      niz = `<p class="aktPs__zag">Крит или косм</p>
        <div class="aktPs__krit">${KRIT.map((x) => `<button type="button" class="aktPs__kn${x.k === krit ? " is-on" : ""}" data-krit="${x.k}">${x.имя}</button>`).join("")}</div>
        <p class="aktPs__zag">Дефект — один на все штуки</p>
        <div class="aktPs__defekty">${DEFEKTY.map((d) => `<button type="button" class="aktPs__kn aktPs__kn--def${d.k === defekt ? " is-on" : ""}" data-def="${esc(d.k)}">${esc(d.имя)}</button>`).join("")}</div>
        <button type="button" class="aktPs__akt" id="palGo"${gotov && sost.включена ? "" : " disabled"}>${
          !sost.включена ? "Актировка выключена" : !krit ? "Выберите крит или косм" : !defekt ? "Выберите дефект" : `Заактировать ${bez} шт`}</button>
        <p class="aktPs__chto">Внутренний брак · качество брак · «мех. повреждения, ${esc(defekt || "…")}${krit ? ", " + krit : ""}» · исходная ячейка и паллета — где лежит</p>`;
    } else {
      niz = `<p class="tsdGotovo">На паллете нет штук без акта — обрабатывайте.</p>`;
    }
    karta.innerHTML = `${strokaVms()}
      <div class="tsdKarta"><h2>${esc(pal.паллета)}</h2>
        <p class="tsdKarta__pod">${esc(pal.ячейка || "")} · без акта ${bez} шт из ${pal.строки.reduce((n, x) => n + x.штук, 0)}</p>
        <div class="palSpisok">${spisok}</div></div>
      ${niz}`;
  }

  async function zagruzitSost() {
    try {
      const o = await fetch("/__akt/sostoyanie", { cache: "no-store" });
      if (o.ok) sost = await o.json();
    } catch (e) { /* покажем, что выключено */ }
  }

  async function skan(kod) {
    oshibka = ""; rabota = null; krit = ""; defekt = "";
    el("aktKarta").innerHTML = '<p class="tsdPusto">Смотрю паллету…</p>';
    try {
      const o = await fetch(`/__akt/palleta?kod=${encodeURIComponent(kod)}`, { cache: "no-store" });
      const d = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      pal = d;
    } catch (e) {
      pal = null; oshibka = e.message || String(e);
    }
    narisovat();
    el("aktSkan").value = "";
    vFokus();
  }

  async function start() {
    el("palGo").disabled = true;
    try {
      const o = await fetch("/__akt/palleta/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: String(pal.паллета_id), дефект: defekt, крит: krit }),
      });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { formaVhoda = true; narisovat(); return; }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      rabota = { id: d.id, всего: pal.без_акта, готово: 0, акты: [], ошибки: [], идёт: true };
      narisovat();
      oprashivat();
    } catch (e) {
      oshibka = e.message || String(e);
      rabota = null;
      narisovat();
    }
  }

  async function oprashivat() {
    while (rabota && rabota.идёт) {
      await new Promise((ok) => setTimeout(ok, 1200));
      try {
        const o = await fetch(`/__akt/palleta/hod?id=${rabota.id}`, { cache: "no-store" });
        const d = await o.json();
        if (d.ошибка) { rabota.идёт = false; rabota.ошибки.push({ товар: "", ошибка: d.ошибка }); }
        else rabota = { id: rabota.id, ...d };
      } catch (e) { /* сеть моргнула — следующий опрос */ }
      narisovat();
    }
    if (navigator.vibrate) navigator.vibrate(150);
    vFokus();
  }

  el("aktForma").addEventListener("submit", (e) => {
    e.preventDefault();
    const kod = el("aktSkan").value.trim();
    if (kod) skan(kod);
  });
  document.addEventListener("click", async (e) => {
    const t = e.target;
    const k = t.closest("[data-krit]");
    if (k) { krit = k.dataset.krit; narisovat(); return; }
    const d = t.closest("[data-def]");
    if (d) { defekt = d.dataset.def; narisovat(); return; }
    if (t.closest("#palGo")) { start(); return; }
    if (t.closest("#palVoyti")) { formaVhoda = true; narisovat(); return; }
    if (!t.closest("input, button, a, label, form")) vFokus();
  });
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "palVhod") return;
    e.preventDefault();
    const f = e.target;
    const o = await fetch("/__wms/voyti", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ логин: f.login.value.trim(), пароль: f.parol.value }),
    });
    const r = await o.json().catch(() => ({}));
    if (o.ok) { sost.вмс = r; formaVhoda = false; oshibka = ""; } else { oshibka = r.ошибка || "не вошли"; }
    narisovat();
  });

  zagruzitSost().then(narisovat);
  vFokus();
})();
