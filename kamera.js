/* Пикалка · скан камерой (26.09): кнопка с камерой рядом с «Найти».
   Штрихкод распознаёт сам браузер (BarcodeDetector) — без библиотек: он есть
   в Chrome на Android, то есть на телефонах и ТСД. На iPhone и в части
   настольных браузеров его нет — там кнопка честно говорит, что не умеет.
   Поймали код — подставляем в поле и запускаем тот же поиск, что по Enter. */
(function () {
  "use strict";

  const scan = document.getElementById("scan");
  const kn = document.getElementById("kamera");
  if (!scan || !kn) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { kn.hidden = true; return; }

  const FORMATY = ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf", "qr_code", "data_matrix"];
  let potok = null;
  let taymer = 0;
  let okno = null;

  const skazat = (tekst) => {
    const m = document.getElementById("message");
    if (m) { m.textContent = tekst; m.className = "message warn"; }
  };

  function zakryt() {
    clearInterval(taymer);
    taymer = 0;
    if (potok) potok.getTracks().forEach((t) => t.stop());
    potok = null;
    if (okno) okno.remove();
    okno = null;
  }

  function nayden(kod) {
    zakryt();
    if (navigator.vibrate) navigator.vibrate(80);
    scan.value = kod;
    scan.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }

  async function otkryt() {
    if (!("BarcodeDetector" in window)) {
      skazat("Этот браузер не распознаёт штрихкоды камерой. Работает в Chrome на Android — на телефоне и ТСД.");
      return;
    }
    let formaty = FORMATY;
    try {
      const est = await window.BarcodeDetector.getSupportedFormats();
      formaty = FORMATY.filter((f) => est.includes(f));
    } catch (e) { /* берём все, браузер сам отбросит лишние */ }
    const detektor = new window.BarcodeDetector({ formats: formaty });

    okno = document.createElement("div");
    okno.className = "kamera";
    okno.innerHTML = `<div class="kamera__ramka"><video class="kamera__video" playsinline muted></video>
        <span class="kamera__pritsel" aria-hidden="true"></span></div>
      <p class="kamera__tekst">Наведите камеру на штрихкод</p>
      <button type="button" class="kamera__zakryt">Закрыть</button>`;
    document.body.append(okno);
    okno.querySelector(".kamera__zakryt").addEventListener("click", zakryt);
    const video = okno.querySelector("video");
    try {
      potok = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (oshibka) {
      zakryt();
      skazat("Нет доступа к камере — разрешите его браузеру (значок замка у адреса сайта).");
      return;
    }
    video.srcObject = potok;
    await video.play().catch(() => {});
    taymer = setInterval(async () => {
      if (!okno || video.readyState < 2) return;
      try {
        const kody = await detektor.detect(video);
        const kod = kody.map((k) => String(k.rawValue || "").trim()).find(Boolean);
        if (kod) nayden(kod);
      } catch (e) { /* кадр не прочитался — ждём следующий */ }
    }, 180);
  }

  kn.addEventListener("click", otkryt);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && okno) zakryt(); });
})();
