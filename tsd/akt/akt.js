/* ТСД · актировка. Пикнул товар → видно, где он лежит и есть ли акт →
   одно касание по дефекту = акт приёмки (внутренний брак) в вмс.
   Пока только демо: сервер под актами ещё не подключён. */
(function () {
  "use strict";

  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const DEFEKTY = ["Мехповреждение", "Некомплект", "Рваная упаковка", "Не работает", "Протечка / сыпучка",
    "Следы эксплуатации", "Истёк срок", "Другое"];

  // Настоящие штуки из остатков вмс 25.09: лежат в зонах ФБ ДМД с качеством
  // «Новый» и без акта — именно такие и надо актировать при разборе.
  const DEMO_TOVARY = [
    { товар: "Gigant вышка-тура 0,7x1,6м H=5,2м GTT-007", артикул: "GTT-007", sku: 6297078,
      места: [{ паллета: "Конт-0163233250", ячейка: "Буфер входа на столы уценки, группа 3", зона: "001 Столы уценки (ДМД)", штук: 1 }] },
    { товар: "ZUBR Ultra 90Ah L+ ZU901", артикул: "ZU901", sku: 6421918,
      места: [{ паллета: "ФБ-Утилизация-0163139122", ячейка: "Буфер входа в утиль с предсорта", зона: "001 Столы утилизации (ДМД)", штук: 1 }] },
    { товар: "Giver HYBRID 6СТ - 190.евро конус 190N(3)-ВЛЧ-ЛЧ-0", артикул: "190N(3)-ВЛЧ-ЛЧ-0", sku: 7104481,
      места: [{ паллета: "ФБ-Утилизация-0163139122", ячейка: "Буфер входа в утиль с предсорта", зона: "001 Столы утилизации (ДМД)", штук: 2 }] },
    { товар: "STOUT мат для тёплого пола с бобышками RG008Q14OBLPB3", артикул: "RG008Q14OBLPB3", sku: 5077175,
      места: [{ паллета: "Конт-0163233250", ячейка: "Буфер входа на столы уценки, группа 3", зона: "001 Столы уценки (ДМД)", штук: 1 },
              { паллета: "Некомп-0166024467", ячейка: "Буфер входа в некомплекты с предсорта", зона: "003 Вход в некомплекты ДМД", штук: 1 }] },
    { товар: "Aquanet Душевой уголок SE-900S 90x90 00270063", артикул: "00270063", sku: 4267521, уже_акт: 7710432,
      места: [{ паллета: "ФБ-Утилизация-0163139122", ячейка: "Буфер входа в утиль с предсорта", зона: "001 Столы утилизации (ДМД)", штук: 1 }] },
  ];

  let demoN = 0;
  let demoAkt = 7712001;
  let tekushiy = null;   // отсканированный товар
  let mesto = 0;         // какая из штук (если лежит в нескольких местах)
  const zhurnal = [];    // акты этой смены

  const vFokus = () => setTimeout(() => el("aktSkan").focus(), 50);

  function narisovat() {
    const t = tekushiy;
    if (!t) { el("aktKarta").innerHTML = ""; return; }
    const m = t.места[mesto];
    el("aktKarta").innerHTML = `
      <div class="tsdKarta">
        <h2>${esc(t.товар)}</h2>
        <p class="tsdKarta__pod">арт. ${esc(t.артикул)} · sku ${t.sku}</p>
        ${t.места.length > 1 ? `<p class="tsdPred">Лежит в ${t.места.length} местах без акта — выберите, какую штуку держите:</p>
          <div class="aktMesta">${t.места.map((x, i) => `<button class="tsdPrichina${i === mesto ? " is-on" : ""}" type="button" data-mesto="${i}">${esc(x.паллета)}<small>${esc(x.ячейка)}</small></button>`).join("")}</div>`
          : `<p class="tsdKarta__sist">${esc(m.паллета)}<br><span class="aktSer">${esc(m.ячейка)} · ${esc(m.зона)}</span></p>`}
        ${t.уже_акт ? `<p class="tsdGotovo">Акт уже есть: №${t.уже_акт}. Актировать не надо — обрабатывайте.</p>` : ""}
      </div>
      ${t.уже_акт ? "" : `<p class="aktPodskazka">Что с товаром? Одно касание — акт создан.</p>
      <div class="tsdPrichiny">${DEFEKTY.map((d) => `<button class="tsdPrichina aktDefekt" type="button" data-defekt="${esc(d)}">${esc(d)}</button>`).join("")}</div>
      <label class="aktNekompl"><input type="checkbox" id="aktNeplnaya"> неполная комплектность</label>`}`;
  }

  function narisovatZhurnal() {
    el("aktZhurnal").innerHTML = zhurnal.length ? `<h3 class="tsdZag">Заактировано за смену: ${zhurnal.length}</h3>
      <div class="tsdSpisok">${zhurnal.slice().reverse().map((a) => `
        <div class="tsdZayavka"><h3>Акт №${a.акт}</h3><p>${esc(a.товар)}</p>
        <span class="tsdPrichinaMetka">${esc(a.дефект)}</span><p>${esc(a.паллета)} · ${a.время}</p></div>`).join("")}</div>` : "";
  }

  async function skan(kod) {
    if (!String(kod || "").trim() && !/[?&]demo/.test(location.search)) return;
    el("aktKarta").innerHTML = '<p class="tsdPusto">Ищу товар…</p>';
    await new Promise((r) => setTimeout(r, 200));
    tekushiy = DEMO_TOVARY[demoN++ % DEMO_TOVARY.length];
    mesto = 0;
    narisovat();
    el("aktSkan").value = "";
    vFokus();
  }

  async function aktirovat(defekt) {
    const t = tekushiy;
    if (!t) return;
    const m = t.места[mesto];
    el("aktKarta").querySelectorAll("button").forEach((b) => { b.disabled = true; });
    await new Promise((r) => setTimeout(r, 350));
    const a = { акт: demoAkt++, товар: t.товар, дефект: defekt + ((el("aktNeplnaya") || {}).checked ? ", некомплект" : ""),
      паллета: m.паллета, время: new Date().toTimeString().slice(0, 5) };
    zhurnal.push(a);
    el("aktKarta").innerHTML = `<div class="tsdGotovo aktGotovo">Акт №${a.акт} создан<span>${esc(t.товар)} · ${esc(a.дефект)}</span>
      <span>Внутренний брак · качество Брак · ${esc(m.паллета)}</span></div>
      <button class="tsdKn aktOtmena" type="button" data-otmena="${a.акт}">Ошибся — отменить акт</button>`;
    if (navigator.vibrate) navigator.vibrate(120);
    tekushiy = null;
    narisovatZhurnal();
    vFokus();
  }

  el("aktForma").addEventListener("submit", (event) => {
    event.preventDefault();
    skan(el("aktSkan").value || "demo");
  });
  document.addEventListener("click", (event) => {
    const t = event.target;
    const d = t.closest("[data-defekt]");
    if (d) return aktirovat(d.dataset.defekt);
    const m = t.closest("[data-mesto]");
    if (m) { mesto = Number(m.dataset.mesto); narisovat(); return; }
    const o = t.closest("[data-otmena]");
    if (o) {
      const i = zhurnal.findIndex((a) => String(a.акт) === o.dataset.otmena);
      if (i >= 0) zhurnal.splice(i, 1);
      el("aktKarta").innerHTML = `<p class="tsdPred">Акт №${esc(o.dataset.otmena)} помечен на удаление. Сканируйте товар заново.</p>`;
      narisovatZhurnal();
      return vFokus();
    }
    if (!t.closest("input, button, a, label")) vFokus();
  });

  skan("demo");
})();
