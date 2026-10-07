/* Пикалка в дизайне C «приборная панель» (30.09.2026, вечер).

   Степан, 30.09: «мы сделали много доработок, но проебали нормальный дизайн;
   надо чтоб ничего не сломалось, что работало; режим „пикалка быстро и мощно“ —
   бред, это просто тумблер; всё должно быть крупнее; на экране обработки
   товара сразу должно быть видно всё и очень крупно; пропала актировка
   товара». Макет — Черновики/2026-09-29/dizayn/C_pribornaya_panel.

   Как и слой A, этот файл не трогает поиск (script.js) и WMS (akt-predsort.js):
   он раскладывает готовые элементы в раму —
     рейка слева: сканер и справочник, Уценка · Предсорт · Себес · Паллеты,
       WMS: массовый пик, ТСД;
     центр: одно поле на любой запрос, карточка крупными плитками, под ней —
       что в WMS (где лежит, акты), паллета / ячейка / акт целиком;
     справа: лента сканов, а когда в WMS открыт объект — что с ним делать
       (#aktDey: актировка штуки, категория акта и куда положить, вкладки
       паллеты, действия массового пика);
     сверху: тумблер WMS и кто вошёл.
   Пикнули CON / CEL / ACT при выключенном WMS — WMS включается сам. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const B = document.body;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const naWms = () => /^\/picker\/wms\/?$/.test(location.pathname);
  const IKONKI = {
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    sort: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h7"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    pal: '<rect x="4.5" y="4" width="15" height="10" rx="1.6"/><path d="M2.5 17h19M2.5 20.5h19M5 17v3.5M12 17v3.5M19 17v3.5"/>',
    stack: '<path d="M12 3.5 3.5 8 12 12.5 20.5 8z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
    bar: '<path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12"/>',
    ekran: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m7 12 3-3 2.5 2.5L17 7"/>',
  };
  const ikonka = (k) => `<svg class="cI" viewBox="0 0 24 24" aria-hidden="true">${IKONKI[k]}</svg>`;

  let vklWms = naWms();
  let posledniyKod = "";   // штрихкод на экране — чтобы после включения WMS сразу показать панель действий

  /* ═════ рама ═════ */
  function sobrat() {
    const karta = $(".layout .searchCard:not(.costListCard):not(.palletsCard):not(.dorogieCard)");
    const ryad = karta && $(".searchRow", karta);
    const layout = $(".layout");
    if (!karta || !ryad || !layout) return false;
    B.classList.add("cSkin");

    const verh = document.createElement("div");
    verh.className = "cTop";
    verh.innerHTML = `<div class="cTitle"><h1>Пикалка</h1><span class="cCrumb"><span id="cCrumbSep">/</span> <b id="cCrumb">Уценка</b></span></div>
      <div class="cPult">
        <div class="cKto" id="cKto"></div>
      </div>`;

    const pult = document.createElement("main");
    pult.className = "cConsole";
    pult.innerHTML = `<aside class="cRail">
        <button type="button" class="cScanner" id="cBaza" title="Справочник товаров"><span class="cScanner__ico">${ikonka("bar")}<i class="cDot"></i></span><span id="cBazaT">база…</span></button>
        <!-- 30.09 Степан: «разбивку на уценку, предсорт и себес убрали — всё должно работать
             в одном». Режимов нет: одна карточка (себес, кластер, паллета для продаж), список —
             вставкой в то же поле. В рейке только то, что правда отдельное. -->
        <nav class="cRail__gr" aria-label="Пикалка">
          <button type="button" class="cRi is-on" id="cGlav" title="Карточка товара">${ikonka("tag")}Пикалка</button>
          <button type="button" class="cRi" id="cEkran" title="Бэклог живьём — на весь экран">${ikonka("ekran")}Экран</button>
        </nav>
        <nav class="cRail__gr cRail__wms" aria-label="WMS">
          <span class="cRail__lbl">WMS</span>
          <button type="button" class="cRi" id="cNovPal">${ikonka("pal")}Нов. паллета</button>
          <button type="button" class="cRi" id="cMass" data-polosa="mass">${ikonka("stack")}Масс. пик<span class="cBadge" id="cMassN" hidden></span></button>
          <button type="button" class="cRi" id="aTsdBtn">${ikonka("phone")}ТСД</button>
        </nav>
      </aside>
      <aside class="cSide">
        <section class="cLenta" id="cLenta"></section>
        <section class="cDey" id="aktDey" hidden></section>
      </aside>
      <div class="aPop cPop" id="aPop" hidden></div>`;
    layout.parentNode.insertBefore(verh, layout);
    layout.parentNode.insertBefore(pult, layout);
    // Центр — сама карточка поиска: так остаются живыми все селекторы script.js,
    // akt-predsort.js и tsd-rezhim.js («.searchCard .searchRow»).
    pult.insertBefore(karta, $(".cSide", pult));
    karta.classList.add("cCenter");

    // Поле: над ответом, с подсказкой, что ещё можно пикнуть.
    const golova = document.createElement("div");
    golova.className = "cColhead";
    ryad.parentNode.insertBefore(golova, ryad);
    golova.appendChild(ryad);
    ryad.classList.add("cField");
    ryad.insertAdjacentHTML("afterbegin", `<svg class="cField__ico" viewBox="0 0 24 24" aria-hidden="true">${IKONKI.bar}</svg>`);
    $("#kamera")?.insertAdjacentHTML("beforebegin", `<span class="cPref"><i data-primer="CON 0163233250"><b>CON</b>паллета</i><i data-primer="CEL 3923168"><b>CEL</b>ячейка</i><i data-primer="ACT 0005263917"><b>ACT</b>акт</i></span>`);
    const scan = $("#scan");
    if (scan) scan.setAttribute("inputmode", "text");

    // Списки режимов — в центр, под поле.
    ["#costListCard", ".palletsCard"].forEach((sel) => { const el = $(sel); if (el) karta.appendChild(el); });
    $("#costListCard")?.insertAdjacentHTML("afterbegin", '<button type="button" class="cBtn cBtn--sm cSpisokX" data-a="spisok-zakryt">закрыть список</button>');

    sobratKartochku();
    // Пусто — крупно, что можно пикнуть.
    $("#message")?.insertAdjacentHTML("afterend", `<section class="cPusto" id="cPusto">
        <h2>Пикните что угодно</h2>
        <div class="cPusto__g">
          <div><b>Штрихкод</b><span>себес, кластер, паллета для продаж, габариты</span></div>
          <div><b>Название</b><span>в то же поле — найдём по словарю</span></div>
          <div><b>Список</b><span>вставьте столбец названий или штрихкодов в это же поле — себес списком</span></div>
          <div><code>ACT</code><b>Акт</b><span>категория уценки крупно, пик паллеты — штука переедет в неё</span></div>
          <div><code>CON</code><b>Паллета</b><span>состав, актировка, перемещение, на другой склад</span></div>
          <div><code>CEL</code><b>Ячейка или стол</b><span>что лежит; стол — его решения для актировки</span></div>
        </div></section>`);

    // ТСД: своя шапка телефонного экрана (как в слое A).
    ($("main.shell") || B).insertAdjacentHTML("afterbegin", `<div class="aTsdTop" id="aTsdTop">
        <span class="aTsdBadge">${ikonka("phone")}ТСД</span>
        <span class="aTsdKto" id="aTsdKto"></span>
        <button type="button" class="cBtn cBtn--sm" id="aTsdVyhod">← Пикалка</button></div>`);
    return true;
  }

  function sobratKartochku() {
    const answer = $("#answer");
    if (!answer || $("#cTiles")) return;
    const box = $("#aktPs");
    const vzyat = (id) => document.getElementById(id);
    const head = document.createElement("div");
    head.className = "cCardHead";
    head.innerHTML = `<div class="cCardHead__t"><div class="cCardHead__nm"></div><div class="cSub"></div></div><div class="cActs"></div>`;
    $(".cCardHead__nm", head).append(vzyat("productName"));
    $(".cSub", head).append(vzyat("productCode"));
    $(".cActs", head).append(vzyat("siteLink"), vzyat("copyName"));
    const tiles = document.createElement("div");
    tiles.className = "cTiles";
    tiles.id = "cTiles";
    const tile = (cls, l, ...el) => {
      const t = document.createElement("div");
      t.className = `cT ${cls}`;
      t.innerHTML = `${l ? `<div class="cT__l">${l}</div>` : ""}<div class="cT__v"></div>`;
      $(".cT__v", t).append(...el.filter(Boolean));
      $(".cT__v", t).insertAdjacentHTML("beforeend", '<span class="aNet">—</span>');
      return t;
    };
    const span = (id) => { const s = document.createElement("span"); s.id = id; s.hidden = true; return s; };
    tiles.append(
      tile("cT--hero", "", vzyat("primary")),
      tile("cT--kl", '<span id="aKlasterL">Кластер предсорта</span>', span("aKlaster")),
      tile("cT--pal", 'Паллета для продаж<span class="aTag aTag--test">тест</span>', span("aPal")),
      tile("cT--rub", "Категория уценки", vzyat("secondary")),
      tile("cT--rrc", "Цена на сайте", vzyat("rrcLine")),
      tile("cT--dim", "Габариты", vzyat("razmery"), vzyat("razmerProverka"), vzyat("kgtMark")),
      tile("cT--otb", "Отбор на площадки", vzyat("otborMark")),
      tile("cT--kod", "Код сайта", span("aKod")),
    );
    const setka = $(".answer__setka", answer);
    answer.insertBefore(head, setka);
    answer.insertBefore(tiles, setka);
    setka?.remove();
    if (box) answer.appendChild(box);
  }

  /* ═════ режимы: рейка → скрытые вкладки script.js ═════ */
  const IMYA_REZHIMA = { ucenka: "всё в одном", presort: "всё в одном", costlist: "себес списком", pallets: "где паллеты" };
  function rezhim(m) {
    if ((B.dataset.mode || "ucenka") === m) return;
    $(`.tab[data-mode="${m}"]`)?.click();
  }
  /* ═════ WMS + WTIS в заголовке: горят, когда на связи, вспыхивают на каждом запросе ═════ */
  var svyaz = { wms: null, wtis: null };   // var: заголовок может рисоваться раньше этой строки
  function sysHtml() { const sv = svyaz || {}; return `<span class="sysG sysG--wms${sv.wms ? " is-on" : sv.wms === false ? " is-off" : ""}" id="sysWms" title="${sv.wms === false ? "WMS не отвечает сайту" : "WMS на связи"}">WMS</span>`
    + `<span class="sysPl">+</span><span class="sysG sysG--wtis${sv.wtis ? " is-on" : sv.wtis === false ? " is-off" : ""}" id="sysWtis" title="${sv.wtis === false ? "WTIS не отвечает сайту" : "WTIS на связи"}">WTIS</span>`; }
  function vspyshka(id, oshibka) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("is-flash", "is-err"); void el.offsetWidth;
    el.classList.add(oshibka ? "is-err" : "is-flash");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("is-flash", "is-err"), 1100);
  }
  async function proveritSvyaz() {
    try {
      const r = await fetch("/__akt/svyaz", { credentials: "same-origin", cache: "no-store" });
      if (r.ok) Object.assign(svyaz, await r.json());
    } catch (e) { /* без сети — оставляем как было */ }
    obnovitRezhim();
    risovatZastryali();
  }
  // 06.10 Степан: «должен увидеть и я и он» — свои штуки, не доехавшие из транзита СЦ→ДМД (пикалка сказала
  // «доедет сама», а круг упал позже, в фоне). Плашка внизу, пока список не пуст; «скрыть» — до нового случая.
  function risovatZastryali() {
    const sp = (svyaz && svyaz.мои_застряли) || [];
    let el = document.getElementById("cZastryali");
    const klyuch = sp.map((x) => x.id).join(",");
    if (!sp.length || localStorage.getItem("pikalka-zastryali-skryto") === klyuch) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "cZastryali"; el.className = "cZastryali"; document.body.appendChild(el); }
    const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    el.innerHTML = `<b>${sp.length} шт не доехали из транзита СЦ→ДМД</b>
      <span>Физически они на паллетах, куда вы их пикнули, по WMS — в «СЦ-ДМД Перемещение ФБ на РЦ». Не перекладывайте — Рысакову сообщено.</span>
      <ul>${sp.slice(0, 6).map((x) => `<li>${e(x.товар)} · акт ${e(x.акт)} → ${e(x.паллета)} <small>${e(x.когда)} · ${e(x.причина)}</small></li>`).join("")}</ul>
      ${sp.length > 6 ? `<small>…и ещё ${sp.length - 6}</small>` : ""}
      <button type="button" data-zastryali-skryt>скрыть</button>`;
    el.querySelector("[data-zastryali-skryt]").onclick = () => { localStorage.setItem("pikalka-zastryali-skryto", klyuch); el.remove(); };
  }
  // Каждый запрос пикалки в ВМС/ВТИС — вспышка нужного слова (ответ с ошибкой — красная)
  const fetchBez = window.fetch.bind(window);
  window.fetch = async (u, ...ost) => {
    const url = String(u && u.url || u || "");
    const id = /vtis/.test(url) ? "sysWtis" : /^\/__(akt|vms|yacheyka|wms)\//.test(url) && !/svyaz|\/hod/.test(url) ? "sysWms" : "";
    try {
      const r = await fetchBez(u, ...ost);
      if (id) vspyshka(id, !r.ok);
      return r;
    } catch (e) { if (id) vspyshka(id, true); throw e; }
  };
  setTimeout(proveritSvyaz, 800);
  setInterval(() => { if (vklWms) proveritSvyaz(); }, 300000);

  function obnovitRezhim() {
    const m = B.dataset.mode || "ucenka";
    // Предсорт остался в script.js вкладкой — здесь его нет: кластер и так на карточке.
    if (m === "presort") { rezhim("ucenka"); return; }
    $("#cGlav")?.classList.toggle("is-on", m === "ucenka");
    const kr = $("#cCrumb");
    if (kr) {
      // 03.10 «Пикалка × WMS + WTIS — чтобы светились»: в WMS-режиме крошка — две живые системы
      const pre = m === "costlist" ? "себес списком" : m === "pallets" ? "где паллеты" : "";
      const layout = `${pre}|${vklWms}|${svyaz && svyaz.wms}|${svyaz && svyaz.wtis}`;
      if (kr.dataset.sysLayout !== layout) {
        kr.innerHTML = [pre ? `<span>${pre}</span>` : "", vklWms ? sysHtml() : ""].filter(Boolean).join('<span class="sysPl">+</span>');
        kr.dataset.sysLayout = layout;
      }
      kr.parentNode.hidden = !pre && !vklWms;
      // 03.10: «ПИКАЛКА × WMS + WTIS»
      const sep = $("#cCrumbSep");
      if (sep) sep.textContent = vklWms && !pre ? "x" : "/";
    }
    risovatLentu();
    obnovitPusto();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#cGlav")) { rezhim("ucenka"); setTimeout(() => $("#scan")?.focus(), 60); }
  });

  /* ═════ одно поле на любой запрос ═════
     штрихкод → карточка; буквы → поиск по названию; CON / CEL / ACT → WMS (включится сам);
     вставка столбца → себес списком; вставка списка паллет → массовый пик. */
  const KOD = /^(?:(?:CON|CEL|ACT|АКТ)\s?\d{5,12}|0\d{9}|\d+)$/i;
  const PALLETA_IMYA = /[^\d\s]\s*-\s*0\d{9}$/;
  const PALLETA = /(?:^CON\s?\d{5,12}$)|(?:[^\d\s]\s*-\s*0\d{9}$)|(?:^0\d{9}$)/i;
  // Container labels exported from WMS can omit the name and leading zero.
  function palletCode(value) {
    const v = String(value || "").trim().replace(/^"(.*)"$/, "$1").replace(/[–—−]/g, "-").replace(/\u00a0/g, " ");
    const m = v.match(/^CON\s*(\d{5,12})$/i) || v.match(/^(?:[^\d\s].*-\s*)?(0\d{9})$/) || v.match(/^-\s*(\d{9,10})$/);
    return m && Number(m[1]) > 0 ? "CON " + m[1].padStart(10, "0") : "";
  }
  const WMS_KOD = /^(?:ACT|АКТ|CON|CEL)\s?\d{5,12}$/i;
  const poNazvaniyu = (v) => /[A-Za-zА-Яа-яЁё]/.test(v) && v.length >= 3 && !KOD.test(v) && !PALLETA_IMYA.test(v)
    && !WMS_KOD.test((window.latinica || String)(v));
  function vPole(e) {
    const scan = $("#scan");
    const v = (scan?.value || "").trim();
    if (!v) return;
    const lat = (window.latinica || String)(v);
    // Наклейка WMS при выключенном WMS: включаем и отдаём скан дальше.
    if (!window.__aktPs && (WMS_KOD.test(lat) || (v.length <= 60 && PALLETA_IMYA.test(v)) || /^0\d{9}$/.test(v))) {
      e.preventDefault(); e.stopImmediatePropagation();
      vklyuchitWms(true);
      setTimeout(() => { scan.value = v; $("#go")?.click(); }, 40);
      return;
    }
    if (WMS_KOD.test(lat) || PALLETA.test(v)) return;
    if (!["ucenka", "presort"].includes(B.dataset.mode || "ucenka")) {
      e.preventDefault(); e.stopImmediatePropagation();
      rezhim("ucenka");
      setTimeout(() => { scan.value = v; $("#go")?.click(); }, 60);
      return;
    }
    if (!poNazvaniyu(v)) return;
    const ns = $("#nameSearch");
    const go = $("#goName");
    if (!ns || !go || ns.disabled) return;
    e.preventDefault(); e.stopImmediatePropagation();
    ns.value = v;
    ns.dispatchEvent(new Event("input", { bubbles: true }));
    go.click();
    scan.value = "";
  }
  document.addEventListener("keydown", (e) => { if (e.target.id === "scan" && e.key === "Enter") vPole(e); }, true);
  document.addEventListener("click", (e) => { if (e.target.closest("#go")) vPole(e); }, true);
  document.addEventListener("paste", (e) => {
    if (e.target.id !== "scan") return;
    const tekst = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    const stroki = tekst.split(/[\r\n]+/).map((x) => x.trim()).filter(Boolean);
    const kuski = tekst.split(/[\r\n,;\t]+/).map((x) => x.trim()).filter(Boolean);
    const lat = (x) => (window.latinica || String)(x);
    const allPallets = kuski.length >= 2 && kuski.every((x) => palletCode(x));
    const allActs = kuski.length >= 2 && kuski.every((x) => /^(ACT|АКТ)\s?\d{5,12}$/i.test(lat(x)));
    if (allPallets || allActs) {
      e.preventDefault(); e.stopImmediatePropagation();
      rezhim("ucenka");
      const otdat = () => document.dispatchEvent(new CustomEvent("wms:vstavka", { detail: tekst }));
      if (vklWms) otdat(); else { vklyuchitWms(true); setTimeout(otdat, 60); }
      return;
    }
    if (kuski.length >= 2 && (kuski.some((x) => palletCode(x) || /^(CON|ACT|АКТ|CEL)\b/i.test(lat(x))) || (vklWms && (B.dataset.mode || "ucenka") !== "costlist"))) {
      e.preventDefault(); e.stopImmediatePropagation();
      const msg = document.getElementById("message");
      if (msg) { msg.textContent = "Список не загружен: есть неизвестные или разные типы наклеек. Вставьте один столбец паллет или актов."; msg.className = "message warn"; }
      return;
    }
    if (stroki.length >= 2) { e.preventDefault(); e.stopImmediatePropagation(); spisok(tekst); }
  }, true);
  function spisok(tekst) {
    rezhim("costlist");
    setTimeout(() => {
      const inp = $("#costListInput");
      if (tekst != null && inp) { inp.value = tekst; inp.dispatchEvent(new Event("input", { bubbles: true })); $("#costListGo")?.click(); }
    }, 80);
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-a=spisok-zakryt]")) rezhim("ucenka");
    const pr = e.target.closest(".cPref [data-primer]");
    if (pr) { const s = $("#scan"); if (s) { s.placeholder = "например: " + pr.dataset.primer; s.focus(); } }
  });

  /* ═════ справочник: чип в рейке и всплывашка ═════ */
  function obnovitBazu() {
    const t = $("#cBazaT");
    if (!t) return;
    const data = ($("#builtAt")?.textContent || "").trim();
    const gotovo = /Готово|Подключено/i.test($("#readyState")?.textContent || "") || data !== "—";
    t.textContent = data && data !== "—" ? `база ${data.slice(0, 5)}` : "база…";
    $("#cBaza")?.classList.toggle("is-net", !gotovo);
  }
  document.addEventListener("click", (e) => {
    const pop = $("#aPop");
    if (!pop) return;
    if (e.target.closest("#cBaza")) {
      const t = (id) => ($(`#${id}`)?.textContent || "—").trim();
      pop.innerHTML = `<dl><dt>Справочник</dt><dd>${esc(t("rowCount"))} товаров</dd><dt>Обновлён</dt><dd>${esc(t("builtAt"))}</dd>
        <dt>На один скан</dt><dd>~30 КБ, кэш браузера</dd><dt>Состояние</dt><dd>${esc(t("readyState"))}</dd></dl>`;
      pop.hidden = !pop.hidden;
      return;
    }
    if (!e.target.closest("#aPop")) pop.hidden = true;
  });

  /* ═════ найденный товар: паллета для продаж, кластер крупно, лента ═════ */
  const KLYUCH = "pikalka-poslednie";
  let poslednie = [];
  try { poslednie = JSON.parse(localStorage.getItem(KLYUCH) || "[]"); } catch (e) { poslednie = []; }
  const palletaDlya = (rubric, cluster, cena, imya) => (window.PalletaProdazh ? window.PalletaProdazh(rubric, cluster, cena, imya) : null);
  const htmlPallety = (p) => (p ? `${esc(p.imya)}${p.sporno ? ' <span class="aTag aTag--spor">спорно</span>' : ""}` : "—");
  const rubli = (s) => { const n = parseFloat(String(s || "").replace(/[^\d,.-]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

  document.addEventListener("picker:hit", (e) => {
    const d = e.detail || {};
    posledniyKod = d.barcode || "";
    const p = palletaDlya(d.rubric, d.cluster, d.rrc, d.name);
    const pal = $("#aPal");
    if (pal) { pal.innerHTML = p ? `<b>${esc(p.imya)}</b>${p.sporno ? ' <span class="aTag aTag--spor">спорно</span>' : ""}${p.pochemu ? `<small>${esc(p.pochemu)}</small>` : ""}` : ""; pal.hidden = !p; }
    const presort = d.mode === "presort";
    // кластер — категория, а не шкала: 1 расходники, 4 крупногабарит, 2 и 3 — по разделу каталога
    const chtoKlaster = (n, rub) => n === "1" ? "расходные материалы" : n === "4" ? "крупногабарит (КГТ)"
      : rub ? `по разделу «${String(rub).split("/")[0].trim()}»` : "по разделу каталога";
    const k = $("#aKlaster");
    const kl = $("#aKlasterL");
    if (k && kl) {
      // 30.09 Айдэр: «номер кластера большими цифрами, как в предыдущей версии».
      kl.textContent = presort ? "Себестоимость" : "Кластер предсорта";
      const kn = String(d.cluster || "").match(/^\d/);
      k.innerHTML = presort ? esc(d.price || "—")
        : d.cluster ? `<b class="cKl">${esc(String(d.cluster).split("·")[0].trim())}</b><small class="cKl__chto">${esc(chtoKlaster(kn && kn[0], d.rubric))}</small>` : "";
      k.hidden = !(presort || d.cluster);
    }
    B.classList.toggle("cPresort", presort);
    const kod = $("#aKod");
    if (kod) { kod.textContent = d.kod || ""; kod.hidden = !d.kod; }
    const vremya = new Date().toTimeString().slice(0, 5);
    poslednie = [{ t: vremya, n: d.name || "", c: d.price || "", r: d.rubric || "", k: d.cluster || "", b: d.barcode || "", rr: d.rrc || "" },
      ...poslednie.filter((x) => x.b !== d.barcode)].slice(0, 40);
    try { localStorage.setItem(KLYUCH, JSON.stringify(poslednie)); } catch (err) { /* не влезло — не страшно */ }
    risovatLentu();
  });

  function risovatLentu() {
    const box = $("#cLenta");
    if (!box) return;
    const summa = poslednie.reduce((n, x) => n + rubli(x.c), 0);
    const tek = posledniyKod;
    box.innerHTML = `<div class="cSideHead"><div class="cLh"><b>Лента</b><span>${poslednie.length} шт${summa ? ` · себес ${summa.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽` : ""}</span></div>
        <div class="cLh__btns"><button type="button" class="cBtn cBtn--sm" data-a="lenta-excel"${poslednie.length ? "" : " disabled"}>Excel</button>
          <button type="button" class="cBtn cBtn--sm" data-a="ochistit"${poslednie.length ? "" : " disabled"}>очистить</button></div></div>
      ${tek && !vklWms ? `<button type="button" class="cDeyStart" data-a="zaaktirovat"><b>Заактировать эту штуку</b><span>включит WMS — стол, решение, дефект, паллета</span></button>` : ""}
      <div class="cLenta__telo">${poslednie.length ? poslednie.map((x) => {
        const p = palletaDlya(x.r, x.k, x.rr, x.n);
        return `<button type="button" class="cLr${x.b === tek ? " is-cur" : ""}" data-b="${esc(x.b)}">
          <span class="cLr__n">${esc(x.n)}</span><span class="cLr__c">${esc(x.c)}</span>
          <span class="cLr__m">${p ? `<span class="aTag${p.sporno ? " aTag--spor" : ""}">${esc(p.imya)}${p.sporno ? " · спорно" : ""}</span>` : ""}<em>${esc(x.r)}</em></span><span class="cLr__t">${esc(x.t)}</span></button>`;
      }).join("") : '<p class="cLenta__pusto">Здесь будут все пикнутые за смену: себес, категория и паллета для продаж. Нажмите строку — товар откроется снова.</p>'}</div>
      ${poslednie.length ? `<div class="cLfoot"><span>за смену</span><b>${poslednie.length} шт · ${summa.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽</b></div>` : ""}`;
  }
  function lentaVExcel() {
    const stroki = [["Время", "Товар", "Штрихкод", "Себес", "Категория", "Паллета для продаж"]].concat(poslednie.map((x) => {
      const p = palletaDlya(x.r, x.k, x.rr, x.n);
      return [x.t, x.n, x.b, x.c, x.r, p ? p.imya + (p.sporno ? " (спорно)" : "") : ""];
    }));
    const csv = "﻿" + stroki.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `лента_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-a=ochistit]")) { poslednie = []; localStorage.removeItem(KLYUCH); risovatLentu(); return; }
    if (e.target.closest("[data-a=lenta-excel]")) { lentaVExcel(); return; }
    if (e.target.closest("[data-a=zaaktirovat]")) { vklyuchitWms(true); return; }
    const r = e.target.closest(".cLr[data-b]");
    if (r && r.dataset.b) {
      const scan = $("#scan");
      if (!scan || scan.disabled) return;
      rezhim(["ucenka", "presort"].includes(B.dataset.mode || "ucenka") ? B.dataset.mode || "ucenka" : "ucenka");
      scan.value = r.dataset.b;
      $("#go")?.click();
    }
  });

  // Наклейки WMS не товар: строка «Найдено: …» от прошлого товара больше не про экран.
  ["picker:akt", "picker:palleta", "picker:stol"].forEach((t) => document.addEventListener(t, () => {
    const m = $("#message");
    if (m) { m.textContent = ""; m.className = "message"; }
  }));

  /* ═════ пусто / есть ответ ═════ */
  function obnovitPusto() {
    const a = $("#answer");
    const nr = $("#nameResults");
    const est = (a && getComputedStyle(a).display !== "none") || (nr && nr.style.display === "block")
      || !$("#aktPs")?.hidden;
    B.classList.toggle("cEst", Boolean(est));
    // Товара на экране нет (после ячейки, акта, в ТСД) — пустую карточку с прочерками не показываем.
    const imya = ($("#productName")?.textContent || "").trim();
    B.classList.toggle("cNetTovara", !imya || imya === "—");
  }

  /* ═════ тумблер WMS ═════ */
  function vklyuchitWms(da) {
    // 05.10: режим WMS всегда включён — выключить его больше нечем (тумблер и Alt+W убраны)
    if (!da || da === vklWms) return;
    vklWms = da;
    document.dispatchEvent(new CustomEvent("wms:vkl", { detail: da }));
    if (da) document.dispatchEvent(new CustomEvent("wms:pod", { detail: B.classList.contains("aTsd") ? "tsd" : "pikalka" }));
    risovatTumbler();
    history.replaceState(null, "", (da ? "/picker/wms" : "/picker/") + location.search.replace(/[?&]pod=\w+/, ""));
    obnovitRezhim();
    // На экране товар — сразу покажем, что с ним делать.
    if (da && posledniyKod && ["ucenka", "presort"].includes(B.dataset.mode || "ucenka")) {
      const scan = $("#scan");
      if (scan && !scan.disabled && !scan.value) setTimeout(() => { scan.value = posledniyKod; $("#go")?.click(); }, 30);
    }
  }
  function risovatTumbler() {
    B.classList.toggle("cWms", vklWms);
    $("#cTumbler")?.setAttribute("aria-checked", String(vklWms));
    // Кто вошёл и массовый пик рисует akt-predsort.js в #vmsPolosa — переносим его в шапку.
    const polosa = $("#vmsPolosa");
    const kto = $("#cKto");
    if (kto) {
      if (vklWms && polosa && polosa.parentNode !== kto) { kto.innerHTML = ""; kto.appendChild(polosa); }
    }
    obnovitMass();
  }
  function obnovitMass() {
    const n = $("#cMassN");
    const b = $("#vmsPolosa .vmsMass b");
    const vkl = Boolean($("#vmsPolosa .vmsMass.is-on"));
    $("#cMass")?.classList.toggle("is-on", vkl);
    if (n) { n.textContent = b ? b.textContent : ""; n.hidden = !vkl; }
  }
  document.addEventListener("click", (e) => {
    // Массовый пик из рейки при выключенном WMS — сначала включить.
  });
  document.addEventListener("click", (e) => { if (e.target.closest("#cMass") && !vklWms) vklyuchitWms(true); }, true);

  // 01.10 Степан: «этот режим надо добавить в пикалку» — экран «Бэклог тает» (/__ekran) на всё окно
  // поверх пикалки; закрыть — крестик или Esc. Для телевизора на складе — F11 в этом режиме.
  function ekran(da) {
    let ov = document.getElementById("cEkranOv");
    if (!da) { if (ov) ov.remove(); $("#cEkran")?.classList.remove("is-on"); return; }
    if (ov) return;
    ov = document.createElement("div");
    ov.id = "cEkranOv";
    ov.className = "cEkranOv";
    ov.innerHTML = '<iframe src="/__ekran" title="Бэклог живьём"></iframe><button type="button" class="cEkranOv__x" title="Закрыть (Esc)">×</button>';
    document.body.appendChild(ov);
    $("#cEkran")?.classList.add("is-on");
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#cEkran")) ekran(!document.getElementById("cEkranOv"));
    else if (e.target.closest(".cEkranOv__x")) ekran(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.getElementById("cEkranOv")) ekran(false); });


  /* ═════ новая паллета: категория → создать в WMS → печать ШК (30.09 вечер) ═════
     Степан: «надо создание паллет из пикалки и возможность печатать ШК сразу после этого».
     Паллету создаёт сервер (/__wms/palleta, личный вход в WMS), этикетку печатает браузер
     на принтер этого компьютера (shk-pechat.js). */
  const KATEGORII = ["ФБ-Сад", "ФБ-ОД", "ФБ-Сантехника", "ФБ-Эл Свет", "ФБ-Складское Оборудование", "ФБ-Авто", "ФБ-Клининг",
    "ФБ-Климат", "ФБ-Спорт и Туризм", "ФБ - Строительное оборудование", "ФБ-отделочные-материалы", "ФБ-Станки",
    "Инст(РАБ)", "Инст(НЕРАБ)", "РМ(ОБЩ)", "КрепФур(ОБЩ)", "СИЗ(ОБЩ)", "Руч(КРИТ)", "Руч(КОСМ)", "Рад(ОБЩ)",
    "Рохли(ОБЩ)", "ЛестСтр(ОБЩ)", "АКБ(ОБЩ)", "МисБокс", "КРГБ",
    "Маркетплейс",   // 06.10 Степан: «паллеты маркетплейс нет в создании паллеты» — тип 2272 на сервере был с 02.10
    "Утиль", "Пересорт", "Переупаковка"];   // 07.10 столы: «добавить утиль, пересорт и переупаковку» (типы — DOP_TIPY на сервере)
  let novSozdano = [];
  let novIdet = "";
  let novOshibka = "";
  function risovatNovPal() {
    let m = $("#cNovModal");
    if (!m) { m = document.createElement("div"); m.id = "cNovModal"; m.className = "cModal"; B.appendChild(m); }
    const sp = window.ShkPechat;
    m.innerHTML = `<div class="cModal__fon" data-nov-zakryt="1"></div><section class="cModal__okno" role="dialog" aria-label="Новая паллета">
      <header class="cModal__sh"><div><b>Новая паллета</b><span>создаётся в WMS, ШК печатается на принтер этого компьютера</span></div>
        <button type="button" class="cBtn cBtn--sm" data-nov-zakryt="1">закрыть</button></header>
      ${novOshibka ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(novOshibka)}</b></p>` : ""}
      ${novIdet ? `<p class="aktPs__podskaz">Создаю «${esc(novIdet)}» в WMS…</p>` : ""}
      <div class="cModal__kat">${KATEGORII.map((k) => `<button type="button" class="cBtn cModal__k" data-nov-sozdat="${esc(k)}"${novIdet ? " disabled" : ""}>${esc(k)}</button>`).join("")}</div>
      ${sp ? `<label class="cNov__fmt">формат этикетки <select data-nov-fmt>${sp.formaty.map((x) => `<option${x === sp.format() ? " selected" : ""}>${x}</option>`).join("")}</select> мм</label>
        <label class="cNov__fmt"><input type="checkbox" data-nov-pov${sp.povorot && sp.povorot(sp.format()) ? " checked" : ""}> печатает боком — повернуть</label>` : ""}
      ${novSozdano.length ? `<div class="cModal__spisok"><p class="aktPs__zag">Создано сейчас</p>${novSozdano.map((g, i) => `<div class="cModal__str">
        ${sp ? `<span class="cNov__shk">${sp.svg(g.штрихкод)}</span>` : ""}<b>${esc(g.имя)}</b><span>${esc(g.штрихкод)}</span>
        <button type="button" class="cBtn cBtn--sm" data-nov-pech="${i}">печать ШК</button></div>`).join("")}</div>` : ""}
    </section>`;
    m.hidden = false;
  }
  async function sozdatPalletu(kat) {
    if (novIdet) return;
    if (!vklWms) vklyuchitWms(true);
    novIdet = kat; novOshibka = ""; risovatNovPal();
    try {
      const o = await fetch("/__wms/palleta", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ категория: kat, сохранить: true, откуда: "пикалка" }) });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) throw new Error("войдите в WMS — вверху «войти в WMS», потом создайте ещё раз");
      if (!o.ok || !d.готово) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      novSozdano = [d, ...novSozdano].slice(0, 10);
      if (window.ShkPechat) window.ShkPechat.pechat({ shk: d.штрихкод, imya: d.имя, kategoriya: d.категория });
    } catch (oshibka) {
      novOshibka = oshibka.message || String(oshibka);
    }
    novIdet = "";
    risovatNovPal();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#cNovPal")) { novOshibka = ""; risovatNovPal(); return; }
    if (e.target.closest("[data-nov-zakryt]")) { const m = $("#cNovModal"); if (m) m.hidden = true; $("#scan")?.focus(); return; }
    const k = e.target.closest("[data-nov-sozdat]");
    if (k) { sozdatPalletu(k.dataset.novSozdat); return; }
    const pe = e.target.closest("[data-nov-pech]");
    if (pe && window.ShkPechat) { const g = novSozdano[+pe.dataset.novPech]; if (g) window.ShkPechat.pechat({ shk: g.штрихкод, imya: g.имя, kategoriya: g.категория }); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches && e.target.matches("[data-nov-fmt]") && window.ShkPechat) {
      window.ShkPechat.zadatFormat(e.target.value);
      const pov = document.querySelector("[data-nov-pov]");
      if (pov && window.ShkPechat.povorot) pov.checked = window.ShkPechat.povorot(e.target.value);
    }
    if (e.target.matches && e.target.matches("[data-nov-pov]") && window.ShkPechat && window.ShkPechat.zadatPovorot) {
      window.ShkPechat.zadatPovorot(window.ShkPechat.format(), e.target.checked);
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const m = $("#cNovModal"); if (m && !m.hidden) m.hidden = true; } });

  /* ═════ ТСД — телефонный экран той же страницы ═════ */
  function vTsd(da) {
    B.classList.toggle("aTsd", da);
    if (da) {
      if (!vklWms) vklyuchitWms(true);
      document.dispatchEvent(new CustomEvent("wms:pod", { detail: "tsd" }));
      const k = $("#aTsdKto");
      if (k) k.textContent = ($("#vmsPolosa b")?.textContent || "").trim();
      const scan = $("#scan");
      if (scan && !scan.disabled) scan.placeholder = "Скан ячейки CEL…";
      history.replaceState(null, "", "/picker/wms?pod=tsd");
    } else {
      document.dispatchEvent(new CustomEvent("wms:pod", { detail: "pikalka" }));
      history.replaceState(null, "", "/picker/wms");
    }
    window.scrollTo(0, 0);
    $("#scan")?.focus();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#aTsdBtn")) vTsd(true);
    if (e.target.closest("#aTsdVyhod")) vTsd(false);
  });

  /* ═════ запуск ═════ */
  function zapusk() {
    if (!sobrat()) return;
    obnovitBazu();
    setInterval(obnovitBazu, 3000);
    obnovitRezhim();
    risovatTumbler();
    new MutationObserver(obnovitRezhim).observe(B, { attributes: true, attributeFilter: ["data-mode"] });
    // akt-predsort.js пересоздаёт строку WMS при включении — забираем её в шапку.
    new MutationObserver(() => { if (vklWms && $("#vmsPolosa") && $("#vmsPolosa").parentNode !== $("#cKto")) risovatTumbler(); })
      .observe($(".cCenter") || B, { childList: true, subtree: true });
    const kto = $("#cKto");
    if (kto) new MutationObserver(obnovitMass).observe(kto, { childList: true, subtree: true, characterData: true });
    const ans = $("#answer");
    if (ans) new MutationObserver(obnovitPusto).observe(ans, { attributes: true, attributeFilter: ["style", "class"] });
    const pn = $("#productName");
    if (pn) new MutationObserver(obnovitPusto).observe(pn, { childList: true, characterData: true, subtree: true });
    const box = $("#aktPs");
    if (box) new MutationObserver(obnovitPusto).observe(box, { attributes: true, attributeFilter: ["hidden"] });
    const nr = $("#nameResults");
    if (nr) new MutationObserver(obnovitPusto).observe(nr, { attributes: true, attributeFilter: ["class", "style"] });
    obnovitPusto();
    const pod = new URLSearchParams(location.search).get("pod");
    if (naWms() && pod === "tsd") setTimeout(() => vTsd(true), 50);
    else if (naWms()) setTimeout(() => document.dispatchEvent(new CustomEvent("wms:pod", { detail: "pikalka" })), 0);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", zapusk);
  else zapusk();
})();
