/* Звук в пикалке (06.10, чат «Обновления пикалка»: «есть вариант в пикалку звуковой сигнал добавить?»).
   Найден товар — короткий высокий «пик». Не найден, или WMS вернула ошибку — низкое двойное «бзз»: на складе
   на экран смотрят не всегда, а сканер пищит одинаково на любой код.
   Звук генерируется в браузере (WebAudio), файлов нет. Браузер разрешает звук только после первого действия
   человека, поэтому включаемся на первом нажатии клавиши или клике (сканер печатает как клавиатура — подходит).
   Выключить у себя — кнопка «Звук» в шапке пикалки, запоминается в этом браузере. */
(function () {
  "use strict";
  const KLYUCH = "pikalkaZvuk";
  let ctx = null;
  const vklyuchen = () => localStorage.getItem(KLYUCH) !== "0";

  function razbudit() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
    } catch { ctx = null; }
  }
  ["keydown", "pointerdown"].forEach((t) => document.addEventListener(t, razbudit, { capture: true, passive: true }));

  function ton(chastota, nachalo, dlit, forma, gromko) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = forma;
    o.frequency.value = chastota;
    const t = ctx.currentTime + nachalo;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gromko, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dlit);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dlit + 0.02);
  }

  let poslednee = 0;
  // 06.10 «очень страшный звук, нестандартный»: квадратная волна звучала сиреной. Теперь как у кассы/сканера —
  // чистый синус с мягким затуханием: удачно — две ноты вверх (ми–ля), ошибка — две ноты вниз (ми–до).
  function sygrat(vid) {
    if (vid === "ok") { ton(1318.5, 0, 0.09, "sine", 0.28); ton(1760, 0.08, 0.16, "sine", 0.24); }
    else { ton(659.3, 0, 0.16, "sine", 0.3); ton(523.3, 0.17, 0.24, "sine", 0.3); }
  }
  function zvuk(vid) {
    if (!vklyuchen()) return;
    const seychas = Date.now();
    if (seychas - poslednee < 250) return;   // «нашёл» и «ошибка» от одного скана не накладываются
    poslednee = seychas;
    // 06.10 «на компе не слышу»: раньше молчали, пока браузер не перевёл звук в «running» — первый пик после
    // загрузки страницы терялся. Теперь будим и играем, как только браузер разрешит.
    razbudit();
    if (!ctx) return;
    if (ctx.state === "running") sygrat(vid);
    else ctx.resume().then(() => sygrat(vid)).catch(() => {});
  }
  window.pikalkaZvukSostoyanie = () => ({ vklyuchen: vklyuchen(), kontekst: ctx ? ctx.state : "нет" });
  window.pikalkaZvuk = zvuk;

  document.addEventListener("picker:hit", () => zvuk("ok"));
  document.addEventListener("picker:miss", () => zvuk("oshibka"));

  // 06.10 «когда вписываю вручную — ничего не слышно»: ручной ввод названия даёт список, а не «товар найден»,
  // и событий hit/miss нет. Слушаем строку сообщений пикалки: ok — «пик», error/warn — «бзз». Только в ответ на
  // действие человека (5 с после клавиши или клика), иначе пищало бы при загрузке и фоновых обновлениях.
  let deystvie = 0;
  ["keydown", "pointerdown"].forEach((t) => document.addEventListener(t, () => { deystvie = Date.now(); }, { capture: true, passive: true }));
  function slushatSoobshchenie() {
    const m = document.getElementById("message");
    if (!m) return false;
    let bylTekst = m.textContent;
    new MutationObserver(() => {
      const tekst = m.textContent.trim();
      if (!tekst || tekst === bylTekst || Date.now() - deystvie > 5000) { bylTekst = tekst; return; }
      bylTekst = tekst;
      if (/\b(error|warn)\b/.test(m.className)) zvuk("oshibka");
      else if (/\bok\b/.test(m.className)) zvuk("ok");
    }).observe(m, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return true;
  }
  if (!slushatSoobshchenie()) document.addEventListener("DOMContentLoaded", slushatSoobshchenie);

  // Ошибки WMS-панели (акт, паллета, перемещение) — красные строки .aktPs__oshibka. Панель перерисовывается
  // целиком, поэтому звучим только на новый текст ошибки, а не на каждую перерисовку.
  // 06.10 «звук есть только при нажатии на кнопку»: в режиме WMS пикают наклейки акта, паллеты и стола, а не
  // штрихкод товара — на них «пик» не звучал совсем. Теперь: после такого скана ждём, пока панель перестанет
  // «смотреть в WMS»; не появилось новой ошибки — «пик». Готово (перекладка, заказ, перемещение) — тоже «пик».
  let bylo = new Set();
  let byloGotovo = new Set();
  let zhdemOtvet = null;   // { t, oshibka }
  ["picker:akt", "picker:palleta", "picker:stol", "wms:yacheyka"].forEach((t) =>
    document.addEventListener(t, () => {
      zhdemOtvet = { t: Date.now(), oshibka: false };
      // быстрый ответ мог отрисоваться раньше 250 мс — тогда новых изменений страницы не будет, проверяем сами
      [400, 1200, 3000].forEach((ms) => setTimeout(proverit, ms));
    }));
  const tekstyPaneli = () => ["aktDey", "aktPs"].map((id) => {
    const el = document.getElementById(id);
    return el && !el.hidden ? el.textContent : "";
  }).join(" ");
  function proverit() {
    const est = new Set([...document.querySelectorAll(".aktPs__oshibka, .aktPs__gotovo.is-oshibka")]
      .map((x) => x.textContent.trim()).filter(Boolean));
    const novayaOshibka = [...est].some((t) => !bylo.has(t));
    if (novayaOshibka) { zvuk("oshibka"); if (zhdemOtvet) zhdemOtvet.oshibka = true; }
    bylo = est;
    const gotovo = new Set([...document.querySelectorAll(".aktPs__gotovo:not(.is-oshibka)")]
      .map((x) => x.textContent.trim()).filter(Boolean));
    if ([...gotovo].some((t) => !byloGotovo.has(t)) && !novayaOshibka) zvuk("ok");
    byloGotovo = gotovo;
    if (zhdemOtvet) {
      const proshlo = Date.now() - zhdemOtvet.t;
      const zhdet = /Смотрю|Загружаю|Ищу|Открываю|смотрю в WMS/.test(tekstyPaneli());
      if (zhemOtvetGotov(proshlo, zhdet)) {
        if (!zhdemOtvet.oshibka) zvuk("ok");
        zhdemOtvet = null;
      } else if (proshlo > 20000) zhdemOtvet = null;
    }
  }
  const zhemOtvetGotov = (proshlo, zhdet) => proshlo > 250 && !zhdet;
  let zhdu = false;
  new MutationObserver(() => {
    if (zhdu) return;
    zhdu = true;
    requestAnimationFrame(() => { zhdu = false; proverit(); });
  }).observe(document.body, { childList: true, subtree: true });

  // кнопка «Звук» в шапке пикалки
  function knopka() {
    const pult = document.querySelector(".cPult");
    if (!pult || document.getElementById("cZvuk")) return Boolean(pult);
    const b = document.createElement("button");
    b.type = "button";
    b.id = "cZvuk";
    b.className = "cZvuk";
    const podpis = () => { b.textContent = vklyuchen() ? "Звук: вкл" : "Звук: выкл"; b.classList.toggle("is-off", !vklyuchen()); };
    podpis();
    b.addEventListener("click", () => {
      localStorage.setItem(KLYUCH, vklyuchen() ? "0" : "1");
      podpis();
      razbudit();
      zvuk("ok");
    });
    pult.prepend(b);
    return true;
  }
  if (!knopka()) {
    const t = setInterval(() => { if (knopka()) clearInterval(t); }, 300);
    setTimeout(() => clearInterval(t), 10000);
  }
})();
