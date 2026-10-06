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
  function zvuk(vid) {
    if (!vklyuchen() || !ctx || ctx.state !== "running") return;
    const seychas = Date.now();
    if (seychas - poslednee < 250) return;   // «нашёл» и «ошибка» от одного скана не накладываются
    poslednee = seychas;
    if (vid === "ok") ton(1320, 0, 0.09, "sine", 0.25);
    else { ton(220, 0, 0.16, "square", 0.12); ton(220, 0.22, 0.16, "square", 0.12); }
  }
  window.pikalkaZvuk = zvuk;

  document.addEventListener("picker:hit", () => zvuk("ok"));
  document.addEventListener("picker:miss", () => zvuk("oshibka"));

  // Ошибки WMS-панели (акт, паллета, перемещение) — красные строки .aktPs__oshibka. Панель перерисовывается
  // целиком, поэтому звучим только на новый текст ошибки, а не на каждую перерисовку.
  let bylo = new Set();
  function proverit() {
    const est = new Set([...document.querySelectorAll(".aktPs__oshibka")].map((x) => x.textContent.trim()).filter(Boolean));
    if ([...est].some((t) => !bylo.has(t))) zvuk("oshibka");
    bylo = est;
  }
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
