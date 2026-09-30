/* Пикалка в дизайне A (30.09.2026).

   Степан, 29.09 ночью: «ужас дизайнерский, всё разного размера, в разных
   местах; WMS — всё равно другая страница, а не анимация улучшенной пикалки;
   в анимации нет смысла; ТСД — экран ровно для телефона; пикалка — большое
   пустое поле; левый блок смысла не имеет». Из трёх макетов выбрал A
   («командная строка»), попросил шрифты и формат крупнее.

   Этот файл не трогает логику поиска (script.js): он переставляет готовые
   элементы по макету A и добавляет своё —
   - полоса: вкладки режимов + переключатель «Пикалка · быстро → мощно · WMS»
     по мотивам Effort-слайдера + кнопка «ТСД»;
   - одна строка скана: штрихкод и название вместе, база — маленьким чипом;
   - карточка товара плитками, среди них «Паллета для продаж» (palleta-prodazh.js);
   - последние сканы с паллетой для продаж и «спорно»;
   - включение WMS на месте: один параметр p от 0 до 1 ведёт всё — дорожку,
     заливку строки, цвет, чипы CON/CEL/ACT и искры, которые из ручки летят
     в строку (точки = возможности, каждая пройденная секция — свой чип);
   - ТСД — телефонный экран той же страницы: скан, ячейка, причины, красная кнопка. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const R = document.documentElement;
  const B = document.body;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const eo = (t) => 1 - Math.pow(1 - t, 3);
  const ss = (t) => t * t * (3 - 2 * t);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const naWms = () => /^\/picker\/wms\/?$/.test(location.pathname);

  let P = naWms() ? 1 : 0;       // 0 — пикалка, 1 — WMS
  let vklWms = naWms();          // режим WMS включён в akt-predsort.js

  /* ═════ сборка страницы по макету A ═════ */
  function sobrat() {
    const searchCard = $(".layout .searchCard:not(.costListCard)") || $(".searchCard");
    const ryad = searchCard && $(".searchRow", searchCard);
    const tabs = $(".pickerTabs");
    if (!searchCard || !ryad || !tabs) return false;
    B.classList.add("aSkin");

    // Полоса: режимы слева, переключатель и ТСД справа.
    const layout = $(".layout");
    const strip = document.createElement("div");
    strip.className = "aStrip";
    strip.innerHTML = `<div class="aStrip__l"></div><div class="aStrip__r">
        <div class="aEff" id="aEff" tabindex="0" role="switch" aria-checked="false" aria-label="Пикалка или WMS"></div>
        <button type="button" class="aBtn aTsdBtn" id="aTsdBtn" title="Экран для телефона и ТСД">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>ТСД</button>
      </div>`;
    layout.parentNode.insertBefore(strip, layout);
    $(".aStrip__l", strip).appendChild(tabs);
    window.dispatchEvent(new Event("resize"));   // script.js перемерит линзу вкладок

    // Строка скана: иконка, заливка WMS, чип базы. Штрихкод и название — в одной строке.
    ryad.classList.add("aField");
    ryad.insertAdjacentHTML("afterbegin", `<span class="aFill"></span><span class="aEdge"></span>
      <svg class="aScanIco" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13.5 8v8M17 8v8"/></svg>`);
    const kamera = $("#kamera");
    kamera?.insertAdjacentHTML("beforebegin", `<button type="button" class="aDb" id="aDb" title="Справочник товаров">база —</button>`);
    ryad.insertAdjacentHTML("afterend", `<div class="aPop" id="aPop" hidden></div>`);
    const scan = $("#scan");
    if (scan) scan.setAttribute("inputmode", "text");

    // Карточка товара плитками.
    sobratKartochku();
    // Последние сканы и подсказка.
    const posle = $("#details") || $("#answer");
    posle.insertAdjacentHTML("afterend", `<section class="aCard aRecent" id="aRecent" hidden></section>
      <section class="aHint" id="aHint" hidden>
        <div><b>Штрихкод</b><span>себес, рубрика, паллета для продаж, габариты</span></div>
        <div><b>Название</b><span>в ту же строку — найдём по словарю</span></div>
        <div><b>Режим WMS</b><span>паллеты, ячейки, акты, перемещения — слайдер вправо</span></div>
        <button type="button" data-a="excel"><b>Список</b><span>вставьте столбец в строку или загрузите Excel — себес списком</span></button>
      </section>`);

    // Себес списком — без вкладки: закрыть список и вернуться к карточке.
    $("#costListCard")?.insertAdjacentHTML("afterbegin", '<button type="button" class="aBtn aBtn--sm aSpisokX" data-a="spisok-zakryt">закрыть список</button>');
    // ТСД: своя шапка телефонного экрана.
    const shell = $("main.shell") || B;
    shell.insertAdjacentHTML("afterbegin", `<div class="aTsdTop" id="aTsdTop">
        <span class="aTsdBadge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/></svg>ТСД</span>
        <span class="aTsdKto" id="aTsdKto"></span>
        <button type="button" class="aBtn aBtn--sm" id="aTsdVyhod">← Пикалка</button></div>`);
    return true;
  }

  function sobratKartochku() {
    const answer = $("#answer");
    if (!answer || $("#aTiles")) return;
    const box = $("#aktPs");
    const vzyat = (id) => document.getElementById(id);
    const head = document.createElement("div");
    head.className = "aCardHead";
    head.innerHTML = `<div class="aCardHead__t"><div class="aCardHead__nm"></div><div class="aSub"></div></div><div class="aActs"></div>`;
    $(".aCardHead__nm", head).append(vzyat("productName"));
    $(".aSub", head).append(vzyat("productCode"));
    $(".aActs", head).append(vzyat("siteLink"), vzyat("copyName"));
    const tiles = document.createElement("div");
    tiles.className = "aTiles";
    tiles.id = "aTiles";
    const tile = (cls, l, ...el) => {
      const t = document.createElement("div");
      t.className = `aTile ${cls}`;
      t.innerHTML = `<div class="l">${l}</div><div class="v"></div>`;
      $(".v", t).append(...el.filter(Boolean));
      $(".v", t).insertAdjacentHTML("beforeend", '<span class="aNet">—</span>');
      return t;
    };
    const pal = document.createElement("span");
    pal.id = "aPal";
    pal.hidden = true;
    const klaster = document.createElement("span");
    klaster.id = "aKlaster";
    klaster.hidden = true;
    const kod = document.createElement("span");
    kod.id = "aKod";
    kod.hidden = true;
    tiles.append(
      tile("aTile--hero", "", vzyat("primary")),
      tile("", "Цена на сайте", vzyat("rrcLine")),
      tile("", "Категория уценки", vzyat("secondary")),
      tile("aTile--pal", 'Паллета для продаж<span class="aTag aTag--test">тест</span>', pal),
      tile("", '<span id="aKlasterL">Кластер предсорта</span>', klaster),
      tile("aTile--dl", "Габариты", vzyat("razmery"), vzyat("razmerProverka"), vzyat("kgtMark")),
      tile("", "Отбор на площадки", vzyat("otborMark")),
      tile("", "Код сайта", kod),
    );
    const setka = $(".answer__setka", answer);
    answer.insertBefore(head, setka);
    answer.insertBefore(tiles, setka);
    setka?.remove();
    if (box) answer.appendChild(box);
  }

  /* ═════ одно поле на любой запрос (30.09, Степан: «надо убирать режимы, если поле
     выдаёт по любому запросу информацию») ═════
     штрихкод → карточка (себес, кластер, рубрика, паллета для продаж);
     буквы → поиск по названию; CON/CEL/ACT → WMS (script.js и akt-predsort.js);
     вставка столбца штрихкодов или названий → «себес списком»;
     вставка списка паллет → массовый пик (WMS включается сам).
     Вкладки остались в разметке спрятанными — ими переключаем режим script.js. */
  const KOD = /^(?:(?:CON|CEL|ACT|АКТ)\s?\d{5,12}|0\d{9}|\d+)$/i;
  const PALLETA_IMYA = /[^\d\s]\s*-\s*0\d{9}$/;
  const PALLETA = /(?:^CON\s?\d{5,12}$)|(?:[^\d\s]\s*-\s*0\d{9}$)|(?:^0\d{9}$)/i;
  function poNazvaniyu(v) {
    return /[A-Za-zА-Яа-яЁё]/.test(v) && v.length >= 3 && !KOD.test(v) && !PALLETA_IMYA.test(v);
  }
  function rezhim(m) {
    if ((B.dataset.mode || "ucenka") === m) return;
    $(`.tab[data-mode="${m}"]`)?.click();
  }
  function vPole(e) {
    const scan = $("#scan");
    const v = (scan?.value || "").trim();
    if (!v) return;
    // Из «себес списком» одиночный запрос возвращает к карточке товара.
    if (!["ucenka", "presort"].includes(B.dataset.mode || "ucenka")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      rezhim("ucenka");
      setTimeout(() => { scan.value = v; $("#go")?.click(); }, 60);
      return;
    }
    if (!poNazvaniyu(v)) return;
    const ns = $("#nameSearch");
    const go = $("#goName");
    if (!ns || !go || ns.disabled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
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
    if (kuski.length >= 2 && kuski.every((x) => PALLETA.test(x))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const otdat = () => document.dispatchEvent(new CustomEvent("wms:vstavka", { detail: tekst }));
      if (vklWms) otdat(); else { dovesti(1); setTimeout(otdat, 250); }
      return;
    }
    if (stroki.length >= 2) {
      e.preventDefault();
      e.stopImmediatePropagation();
      spisok(tekst);
    }
  }, true);
  function spisok(tekst) {
    rezhim("costlist");
    setTimeout(() => {
      const inp = $("#costListInput");
      if (tekst != null && inp) { inp.value = tekst; inp.dispatchEvent(new Event("input", { bubbles: true })); $("#costListGo")?.click(); }
      $("#costListCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-a=excel]")) { spisok(null); setTimeout(() => $("#costListFile")?.click(), 120); }
    if (e.target.closest("[data-a=spisok-zakryt]")) rezhim("ucenka");
  });

  /* ═════ база: чип и всплывашка ═════ */
  function obnovitBazu() {
    const d = $("#aDb");
    if (!d) return;
    const data = ($("#builtAt")?.textContent || "").trim();
    const gotovo = /Готово|Подключено/i.test($("#readyState")?.textContent || "") || data !== "—";
    d.textContent = data && data !== "—" ? `база ${data.slice(0, 5)}` : "база…";
    d.classList.toggle("is-net", !gotovo);
  }
  document.addEventListener("click", (e) => {
    const pop = $("#aPop");
    if (!pop) return;
    if (e.target.closest("#aDb")) {
      const t = (id) => ($(`#${id}`)?.textContent || "—").trim();
      pop.innerHTML = `<dl><dt>Справочник</dt><dd>${esc(t("rowCount"))} товаров</dd><dt>Обновлён</dt><dd>${esc(t("builtAt"))}</dd>
        <dt>На один скан</dt><dd>~30 КБ, кэш браузера</dd><dt>В памяти</dt><dd>${esc(t("partCount"))} кусочков</dd><dt>Состояние</dt><dd>${esc(t("readyState"))}</dd></dl>`;
      pop.hidden = !pop.hidden;
      return;
    }
    if (!e.target.closest("#aPop")) pop.hidden = true;
  });

  /* ═════ найденный товар: паллета для продаж, кластер, последние сканы ═════ */
  const KLYUCH = "pikalka-poslednie";
  let poslednie = [];
  try { poslednie = JSON.parse(localStorage.getItem(KLYUCH) || "[]"); } catch (e) { poslednie = []; }

  function palletaDlya(rubric, cluster) {
    return window.PalletaProdazh ? window.PalletaProdazh(rubric, cluster) : null;
  }
  function htmlPalletы(p) {
    if (!p) return "—";
    return `${esc(p.imya)}${p.sporno ? ' <span class="aTag aTag--spor">спорно</span>' : ""}${p.pochemu ? ` <small>${esc(p.pochemu)}</small>` : ""}`;
  }

  document.addEventListener("picker:hit", (e) => {
    const d = e.detail || {};
    const p = palletaDlya(d.rubric, d.cluster);
    const pal = $("#aPal");
    if (pal) { pal.innerHTML = htmlPalletы(p); pal.hidden = !p; }
    const presort = d.mode === "presort";
    const k = $("#aKlaster");
    const kl = $("#aKlasterL");
    if (k && kl) {
      kl.textContent = presort ? "Себестоимость" : "Кластер предсорта";
      const kn = String(d.cluster || "").match(/^\d/);
      k.innerHTML = presort ? esc(d.price || "—")
        : d.cluster ? `${esc(String(d.cluster).split("·")[0].trim())}<span class="aBars">${[1, 2, 3, 4].map((i) => `<i${kn && i <= Number(kn[0]) ? ' class="on"' : ""}></i>`).join("")}</span><small>из 4</small>` : "—";
      k.hidden = false;
    }
    const kod = $("#aKod");
    if (kod) { kod.textContent = d.kod || "—"; kod.hidden = !d.kod; }
    const vremya = new Date().toTimeString().slice(0, 5);
    poslednie = [{ t: vremya, n: d.name || "", c: d.price || "", r: d.rubric || "", k: d.cluster || "", b: d.barcode || "" },
      ...poslednie.filter((x) => x.b !== d.barcode)].slice(0, 12);
    try { localStorage.setItem(KLYUCH, JSON.stringify(poslednie)); } catch (err) { /* не влезло — не страшно */ }
    risovatPoslednie();
  });

  function risovatPoslednie() {
    const box = $("#aRecent");
    const hint = $("#aHint");
    if (!box) return;
    const odinochnyy = ["ucenka", "presort"].includes(B.dataset.mode || "ucenka");
    if (!poslednie.length || !odinochnyy) { box.hidden = true; if (hint) hint.hidden = !odinochnyy || poslednie.length > 0; return; }
    if (hint) hint.hidden = true;
    box.hidden = false;
    box.innerHTML = `<div class="aRh"><h3>Последние сканы</h3><span class="aSub">категория → паллета для продаж: тестовое соответствие по остаткам ДМД</span>
        <button type="button" class="aBtn aBtn--sm" data-a="ochistit">Очистить</button></div>
      <div class="aRgrid aRhead"><span>Время</span><span>Товар</span><span class="r">Себес</span><span>Категория</span><span>Паллета для продаж</span></div>
      ${poslednie.map((x) => `<button type="button" class="aRgrid aRrow" data-b="${esc(x.b)}"><span class="t">${esc(x.t)}</span><span class="n">${esc(x.n)}</span>
        <span class="c">${esc(x.c)}</span><span class="k">${esc(x.r)}</span><span class="p">${htmlPalletы(palletaDlya(x.r, x.k))}</span></button>`).join("")}`;
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-a=ochistit]")) { poslednie = []; localStorage.removeItem(KLYUCH); risovatPoslednie(); return; }
    const r = e.target.closest(".aRrow[data-b]");
    if (r && r.dataset.b) {
      const scan = $("#scan");
      if (!scan || scan.disabled) return;
      scan.value = r.dataset.b;
      $("#go")?.click();
    }
  });

  /* ═════ переключатель «Пикалка → WMS» (по мотивам Effort-слайдера) ═════
     Точки — возможности: слева мало и тускло, справа густо и ярко; всё, что
     левее ручки, горит. Под дорожкой — что включается: товар, паллета, ячейка,
     акт, действия. Пройденная секция выпускает искру в строку скана — там
     раскрывается её чип. */
  const BAY = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  function postroitEff(el) {
    let d = "";
    const cols = 62, rows = 5;
    for (let c = 0; c < cols; c++) {
      const x = c / (cols - 1), dens = 0.12 + 0.88 * Math.pow(x, 1.15);
      for (let r = 0; r < rows; r++) {
        if ((BAY[r % 4][(c + (r >> 2) * 2) % 4] + 0.5) / 16 > dens) continue;
        d += `<i style="--x:${x.toFixed(3)};--y:${(r / (rows - 1)).toFixed(3)}"></i>`;
      }
    }
    el.innerHTML = `<div class="aEff__top"><span class="aEff__l"><b>Пикалка</b> · быстро</span><span class="aEff__r">мощно · <b>WMS</b></span></div>
      <div class="aEff__track"><div class="aEff__dots">${d}</div><div class="aEff__knob"></div></div>
      <div class="aEff__caps">${["товар", "паллета", "ячейка", "акт", "действия"].map((t, i) => `<span style="--c:${0.1 + 0.2 * i}">${t}</span>`).join("")}</div>`;
  }
  const kxOf = (p) => 0.2 + 0.8 * clamp(p / 0.8);
  const SP = [0.02, 0.22, 0.42, 0.62], FL = 0.16;
  const SPK = [];

  function iskry() {
    const box = document.createElement("div");
    box.id = "aSparks";
    B.appendChild(box);
    for (let i = 0; i < 4; i++) {
      const g = [];
      for (let j = 0; j < 16; j++) { const d = document.createElement("i"); if (!j) d.className = "h"; box.appendChild(d); g.push(d); }
      SPK.push(g);
    }
  }
  function celIskry(i) {
    const chips = $$("#vmsVozm .aChip");
    if (i < 3 && chips[i]) return chips[i];
    const karta = $("#answer");
    if (karta && getComputedStyle(karta).display !== "none") return karta;
    return chips[2] || $(".aField");
  }
  function risovatIskry(p) {
    const eff = $("#aEff");
    if (!eff || !SPK.length) return;
    const tr = $(".aEff__track", eff).getBoundingClientRect();
    SPK.forEach((g, i) => {
      const f = (p - SP[i]) / FL;
      if (f <= 0 || f >= 1.4 || B.classList.contains("aTsd") || !tr.width) { g.forEach((d) => { d.style.opacity = 0; }); return; }
      const sx = tr.left + 12 + kxOf(SP[i]) * (tr.width - 24), sy = tr.top + tr.height / 2;
      const r = celIskry(i).getBoundingClientRect();
      const ex = r.left + Math.min(r.width / 2, 40), ey = r.top + Math.min(r.height / 2, 30);
      const cx = ex + (sx - ex) * 0.5, cy = Math.min(sy, ey) - 44;
      g.forEach((d, j) => {
        const fj = f - j * 0.02;
        if (fj <= 0 || fj >= 1) { d.style.opacity = 0; return; }
        const t = 1 - (1 - fj) * (1 - fj), u = 1 - t;
        const x = u * u * sx + 2 * u * t * cx + t * t * ex, y = u * u * sy + 2 * u * t * cy + t * t * ey;
        const s = (1 - j / 17) * (0.75 + 0.5 * Math.sin(Math.PI * fj));
        d.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
        d.style.opacity = ((1 - j / 16.5) * Math.pow(Math.sin(Math.PI * fj), 0.3)).toFixed(3);
      });
    });
  }

  function risovat(p) {
    P = p;
    const kc = ss(seg(p, 0.05, 0.8)), kf = seg(p, 0, 0.7), kx = kxOf(p);
    R.style.setProperty("--kc", kc.toFixed(4));
    R.style.setProperty("--kf", kf.toFixed(4));
    const eff = $("#aEff");
    if (eff) {
      eff.style.setProperty("--kx", kx.toFixed(4));
      $$(".aEff__caps span", eff).forEach((s, i) => s.style.setProperty("--on", seg(kx, 0.1 + 0.2 * i - 0.07, 0.1 + 0.2 * i + 0.01).toFixed(3)));
      eff.setAttribute("aria-checked", String(p >= 0.5));
    }
    const wrow = $("#vmsVozm");
    if (wrow) wrow.style.setProperty("--kr", eo(seg(p, 0.08, 0.18)).toFixed(4));
    $$("#vmsVozm .aChip").forEach((c, i) => c.style.setProperty("--k", eo(seg(p, SP[i] + FL - 0.02, SP[i] + FL + 0.1)).toFixed(4)));
    const who = $("#vmsPolosa");
    if (who) who.style.setProperty("--kl", eo(seg(p, 0.6, 0.78)).toFixed(4));
    B.classList.toggle("aWms", p >= 0.5);
    risovatIskry(p);
  }
  function kadr(fn) { let bylo = false; const run = () => { if (!bylo) { bylo = true; fn(); } }; requestAnimationFrame(run); setTimeout(run, 24); }
  let tokAnim = 0;
  function dovesti(k) {
    const tok = ++tokAnim, ot = P, dist = Math.abs(k - ot);
    if (k > 0.5 && !vklWms) vklyuchitWms(true);
    const kon = () => {
      if (k <= 0 && vklWms) vklyuchitWms(false);
      history.replaceState(null, "", (k >= 0.5 ? "/picker/wms" : "/picker/") + location.search.replace(/[?&]pod=\w+/, ""));
    };
    if (!dist) { risovat(k); kon(); return; }
    const dur = (k > ot ? 1700 : 1000) * dist, t0 = performance.now();
    const shag = () => {
      if (tok !== tokAnim) return;
      const t = clamp((performance.now() - t0) / dur);
      risovat(ot + (k - ot) * eio(t));
      if (t < 1) kadr(shag); else kon();
    };
    kadr(shag);
  }
  function vklyuchitWms(da) {
    vklWms = da;
    document.dispatchEvent(new CustomEvent("wms:vkl", { detail: da }));
    if (da) document.dispatchEvent(new CustomEvent("wms:pod", { detail: B.classList.contains("aTsd") ? "tsd" : "pikalka" }));
  }
  function podklyuchitEff() {
    const eff = $("#aEff");
    if (!eff) return;
    postroitEff(eff);
    const tr = $(".aEff__track", eff);
    let drag = null;
    tr.addEventListener("pointerdown", (e) => { tokAnim++; drag = { x: e.clientX, moved: false, start: P }; tr.setPointerCapture(e.pointerId); });
    tr.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) > 4) drag.moved = true;
      if (!drag.moved) return;
      if (!vklWms) vklyuchitWms(true);
      const r = tr.getBoundingClientRect();
      const kx = clamp((e.clientX - r.left - 12) / (r.width - 24));
      risovat(clamp((kx - 0.2) / 0.8) * 0.8);
    });
    tr.addEventListener("pointerup", () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (!d.moved) { dovesti(d.start >= 0.5 ? 0 : 1); return; }
      dovesti(P >= 0.4 ? 1 : 0);
    });
    eff.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { dovesti(1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { dovesti(0); e.preventDefault(); }
      else if (e.key === " " || e.key === "Enter") { dovesti(P >= 0.5 ? 0 : 1); e.preventDefault(); }
    });
  }

  /* ═════ ТСД — телефонный экран той же страницы ═════ */
  function vTsd(da) {
    B.classList.toggle("aTsd", da);
    if (da) {
      if (!vklWms) vklyuchitWms(true);
      risovat(1);
      document.dispatchEvent(new CustomEvent("wms:pod", { detail: "tsd" }));
      const kto = ($("#vmsPolosa b")?.textContent || "").trim();
      const k = $("#aTsdKto");
      if (k) k.textContent = kto;
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
    iskry();
    podklyuchitEff();
    obnovitBazu();
    setInterval(obnovitBazu, 3000);
    risovatPoslednie();
    // Режим меняется вкладками script.js — последние сканы только для «одного товара».
    new MutationObserver(risovatPoslednie).observe(B, { attributes: true, attributeFilter: ["data-mode"] });
    // Строка чипов появляется, когда akt-predsort.js включил режим, — дорисуем её состояние.
    new MutationObserver(() => risovat(P)).observe($(".searchCard") || B, { childList: true });
    risovat(P);
    const pod = new URLSearchParams(location.search).get("pod");
    // ?kadr=0.5 — застывший кадр перехода (проверка анимации скриншотом).
    const kadrP = parseFloat(new URLSearchParams(location.search).get("kadr"));
    if (kadrP >= 0 && kadrP <= 1) { setTimeout(() => { if (kadrP > 0.5 && !vklWms) vklyuchitWms(true); if (!vklWms) vklyuchitWms(true); setTimeout(() => risovat(kadrP), 60); }, 400); }
    else if (naWms() && pod === "tsd") setTimeout(() => vTsd(true), 50);
    else if (naWms()) setTimeout(() => document.dispatchEvent(new CustomEvent("wms:pod", { detail: "pikalka" })), 0);
    addEventListener("resize", () => risovatIskry(P));
    requestAnimationFrame(() => requestAnimationFrame(() => B.classList.remove("aBoot")));
  }
  B.classList.add("aBoot");
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", zapusk);
  else zapusk();
})();
