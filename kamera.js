/* Пикалка · скан камерой (26.09): кнопка с камерой рядом с «Найти».
   Штрихкод распознаёт сам браузер (BarcodeDetector) — без библиотек: он есть
   в Chrome на Android, то есть на телефонах и ТСД. На iPhone и в части
   настольных браузеров его нет — там кнопка честно говорит, что не умеет.

   08.10 (Таня: «подошёл с товаром, пикнул и видишь, переместился или нет»;
   Степан: «сканер только в верхнем поле работал, надо, чтоб поочерёдно давал»):
   камера больше не закрывается после кода — ловит подряд: акт → паллета →
   следующий акт. Окно — шторкой снизу, страница с итогом видна над ней, и
   итог дублируется в самой шторке. Каждый код идёт туда же, куда его отдал бы
   ручной сканер: в верхнее поле, а оно само понимает CON / CEL / ACT / товар.
   У полей в панели («номер паллеты», «ячейки», «стола», «акта») — своя
   кнопка: открытая с неё камера кладёт подходящий код в это поле. */
(function () {
  "use strict";

  const scan = document.getElementById("scan");
  const kn = document.getElementById("kamera");
  if (!scan || !kn) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { kn.hidden = true; return; }

  const FORMATY = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf", "qr_code", "data_matrix"];
  // поля панели, у которых своя кнопка камеры
  const POLYA = ".aktPs__vhod input[name=kod], .cKuda__forma input[name=kod], #izlKod";
  const PAUZA = 1500;        // после кода — дать странице отработать
  const TOT_ZHE = 4000;      // тот же код повторно не шлём столько
  let potok = null;
  let taymer = 0;
  let okno = null;
  let tsel = null;           // селектор поля панели, с которого открыли камеру
  let zhdatDo = 0;
  let posledniy = { kod: "", t: 0 };
  let bylKod = false;

  const skazat = (tekst) => {
    const m = document.getElementById("message");
    if (m) { m.textContent = tekst; m.className = "message warn"; }
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function zakryt() {
    clearInterval(taymer);
    taymer = 0;
    if (potok) potok.getTracks().forEach((t) => t.stop());
    potok = null;
    if (okno) okno.remove();
    okno = null;
    tsel = null;
    document.body.classList.remove("kameraOtkryta");
  }

  // по какому селектору найти поле заново — панель перерисовывается целиком
  function selektor(pole) {
    if (pole.id) return "#" + pole.id;
    const f = pole.form;
    if (f && f.id) return `#${f.id} [name="${pole.name}"]`;
    return null;
  }

  // Подходит ли код полю панели. Не подходит — уходит в верхнее поле:
  // открыли камеру у «номер паллеты», а пикнули следующий акт — пусть откроется акт.
  function podhodit(kod, pole) {
    const k = (window.latinica || String)(kod).trim();
    if (pole.id === "izlKod") return /^(ACT|АКТ)\s?\d{5,12}$/i.test(k) || /^\d{4,10}$/.test(k);
    if (pole.id === "stolPoisk") return /^CEL\s?\d{5,10}$/i.test(k);
    return /^(CON|CEL)\s?\d{5,12}$/i.test(k) || /[^\d\s]\s*-\s*0\d{9}$/.test(k) || /^\d{5,10}$/.test(k);
  }

  function otdat(kod) {
    const pole = tsel ? document.querySelector(tsel) : null;
    if (pole && !pole.disabled && podhodit(kod, pole)) {
      pole.value = kod;
      pole.dispatchEvent(new Event("input", { bubbles: true }));
      if (pole.form) {
        if (pole.form.requestSubmit) pole.form.requestSubmit();
        else pole.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      } else {
        pole.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
      return;
    }
    scan.value = kod;
    scan.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }

  function nayden(kod) {
    const t = Date.now();
    if (kod === posledniy.kod && t - posledniy.t < TOT_ZHE) return;
    posledniy = { kod, t };
    zhdatDo = t + PAUZA;
    bylKod = true;
    if (navigator.vibrate) navigator.vibrate(80);
    const p = okno && okno.querySelector(".kamera__kod");
    if (p) p.textContent = "✓ " + kod;
    otdat(kod);
    // итог — над шторкой: подтягиваем панель акта к верху экрана
    setTimeout(() => {
      const panel = document.getElementById("aktDey");
      if (panel && panel.offsetParent) panel.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 350);
  }

  // Что сейчас на странице — повторяем в шторке, чтобы не отрываться от камеры.
  function itogVShtorku() {
    if (!okno) return;
    const el = okno.querySelector(".kamera__itog");
    if (!el) return;
    let html = "", klass = "kamera__itog";
    const big = document.querySelector(".bigIt");
    const msg = document.getElementById("message");
    const dalshe = document.querySelector("#aktDey .cKuda__chto");
    if (!bylKod) html = "Наведите камеру на штрихкод — коды ловятся подряд";
    else if (big) {
      const b = big.querySelector("b"), s = big.querySelector("span");
      html = `<b>${esc(b ? b.textContent : big.textContent)}</b>${s ? `<span>${esc(s.textContent)}</span>` : ""}`;
      klass += big.classList.contains("is-ok") ? " is-ok" : big.classList.contains("is-err") ? " is-err" : "";
    } else if (msg && msg.textContent.trim()) {
      html = esc(msg.textContent.trim());
      klass += msg.classList.contains("ok") ? " is-ok" : "";
    }
    if (bylKod && dalshe && !(big && big.classList.contains("is-idet"))) html += `<i>дальше: ${esc(dalshe.textContent.trim())}</i>`;
    if (el.innerHTML !== html) el.innerHTML = html;
    if (el.className !== klass) el.className = klass;
  }

  async function otkryt(sel) {
    if (!("BarcodeDetector" in window)) {
      skazat("Этот браузер не распознаёт штрихкоды камерой. Работает в Chrome на Android — на телефоне и ТСД.");
      return;
    }
    if (okno) { tsel = sel || null; return; }   // уже открыта — только меняем, куда класть
    let formaty = FORMATY;
    try {
      const est = await window.BarcodeDetector.getSupportedFormats();
      formaty = FORMATY.filter((f) => est.includes(f));
    } catch (e) { /* берём все, браузер сам отбросит лишние */ }
    const detektor = new window.BarcodeDetector({ formats: formaty });

    tsel = sel || null;
    bylKod = false;
    posledniy = { kod: "", t: 0 };
    okno = document.createElement("div");
    okno.className = "kamera kamera--niz";
    okno.innerHTML = `<div class="kamera__ramka"><video class="kamera__video" playsinline muted></video>
        <span class="kamera__pritsel" aria-hidden="true"></span></div>
      <div class="kamera__niz"><div class="kamera__tekst"><p class="kamera__kod"></p><p class="kamera__itog"></p></div>
      <button type="button" class="kamera__zakryt">Закрыть</button></div>`;
    document.body.append(okno);
    document.body.classList.add("kameraOtkryta");
    okno.querySelector(".kamera__zakryt").addEventListener("click", zakryt);
    const video = okno.querySelector("video");
    itogVShtorku();
    try {
      potok = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (oshibka) {
      zakryt();
      skazat("Нет доступа к камере — разрешите его браузеру (значок замка у адреса сайта).");
      return;
    }
    if (!okno) { potok.getTracks().forEach((t) => t.stop()); potok = null; return; }   // закрыли, пока спрашивали доступ
    video.srcObject = potok;
    await video.play().catch(() => {});
    let zanyat = false;
    taymer = setInterval(async () => {
      itogVShtorku();
      if (!okno || zanyat || video.readyState < 2 || Date.now() < zhdatDo) return;
      zanyat = true;
      try {
        const kody = await detektor.detect(video);
        const kod = kody.map((k) => String(k.rawValue || "").trim()).find(Boolean);
        if (kod && okno) nayden(kod);
      } catch (e) { /* кадр не прочитался — ждём следующий */ }
      finally { zanyat = false; }
    }, 180);
  }

  kn.addEventListener("click", () => otkryt(null));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && okno) zakryt(); });

  // Кнопка камеры у полей панели. Панель перерисовывается целиком —
  // после каждой перерисовки дорисовываем кнопки заново.
  const ZNACHOK = kn.innerHTML;
  function knopkiUPoley() {
    document.querySelectorAll(POLYA).forEach((pole) => {
      if (pole.parentElement && pole.parentElement.classList.contains("kameraPole")) return;
      const vFokuse = document.activeElement === pole;
      const obertka = document.createElement("span");
      obertka.className = "kameraPole";
      pole.replaceWith(obertka);
      obertka.append(pole);
      if (vFokuse) pole.focus();
      const b = document.createElement("button");
      b.type = "button";
      b.className = "kameraMini";
      b.title = "Сканировать камерой в это поле";
      b.setAttribute("aria-label", b.title);
      b.innerHTML = ZNACHOK;
      obertka.append(b);
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".kameraMini");
    if (!b) return;
    e.preventDefault();
    const pole = b.parentElement.querySelector("input");
    if (pole) otkryt(selektor(pole));
  });
  if (!("BarcodeDetector" in window)) return;   // на компьютере кнопки у полей не нужны
  let zhdu = false;
  new MutationObserver(() => {
    if (zhdu) return;
    zhdu = true;
    requestAnimationFrame(() => { zhdu = false; knopkiUPoley(); });
  }).observe(document.body, { childList: true, subtree: true });
  knopkiUPoley();
})();
