/* Пикалка · актировка с предсорта (/picker/?akt).
   Человек пикнул товар на столе предсорта и выбрал решение. Если по решению
   нужен акт, появляются дефекты и кнопка «Заактировать»: касание, и в WMS
   создаётся акт приёмки (внутренний брак). Остальное в акт подставляется само,
   так же, как оператор предсорта заполняет его руками: исходная и целевая
   ячейка = её стол, комплектность полная, внешний вид одинаковый.
   Разбор актов Перевезенцевой 09–25.09: 700 актов, ровно на утиль и контроль ОК;
   уценка, переупаковка и некомплекты уходят со стола без акта.

   26.09: отдельная панель на всю ширину под карточкой — решения и дефекты
   ровными сетками, вход в WMS плашкой в шапке («перегруз кнопочек и нет
   симметрии»). */
(function () {
  "use strict";

  // 27.09 Степан: «picker/wms» — у площадки свой адрес; старые ссылки ?akt ведут туда же.
  const naWms = /^\/picker\/wms\/?$/.test(location.pathname);
  if (!naWms && /[?&]akt\b/.test(location.search)) {
    const q = new URLSearchParams(location.search); q.delete("akt");
    location.replace("/picker/wms" + (q.toString() ? "?" + q : ""));
    return;
  }
  if (!naWms) return;
  const box = document.getElementById("aktPs");
  if (!box) return;
  window.__aktPs = true;   // script.js: наклейки CEL/CON есть кому принять

  /* Площадка WMS (27.09, Степан: «из ?akt — плейграунд-тест: не уценка и
     предсорт, а одно поле, где объясняются возможности с WMS»). Режим
     «Предсорт» включаем сами — решения стола живут в нём; вкладки, справочник
     и поиск по названию прячем, под полем — что можно пикнуть и что будет. */
  function ploshchadka() {
    document.body.classList.add("vmsPlg");
    const tab = document.querySelector('.tab[data-mode="presort"]');
    if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
    const tekst = (id, t) => { const x = document.getElementById(id); if (x) x.textContent = t; };
    tekst("eyebrow", "тест · возможности WMS");
    tekst("pageTitle", "WMS");
    document.title = "WMS · Уценка";
    tekst("modeDescription", "Одно поле: пикните товар, паллету, ячейку или акт — покажу, что с этим можно сделать в WMS, и всё можно попробовать.");
    const shapka = document.querySelector(".searchHeading");
    if (shapka) {
      const ov = shapka.querySelector(".overline"); if (ov) ov.textContent = "WMS";
      const h2 = shapka.querySelector("h2"); if (h2) h2.textContent = "Пикните что угодно";
    }
    const metka = document.querySelector('label[for="scan"]');
    if (metka) metka.textContent = "Товар, паллета, ячейка или акт";
    const scan = document.getElementById("scan");
    const podpis = () => { if (scan && !scan.disabled) scan.placeholder = "Сканируйте что угодно…"; };
    [300, 1500, 4000, 9000].forEach((t) => setTimeout(podpis, t));
    const ryad = document.querySelector(".searchCard .searchRow");
    if (ryad && !document.getElementById("vmsVozm")) {
      ryad.insertAdjacentHTML("afterend", `<div class="vmsVozm" id="vmsVozm">
        <button type="button" class="vmsVozm__k" data-primer="штрихкод или код товара">
          <b>Товар</b><small>штрихкод, код сайта</small>
          <span>Где лежит по всему складу и последние акты на него. Выбрать стол → решение → акт (крит/косм, дефект) → «куда положили»: перемещение.</span></button>
        <button type="button" class="vmsVozm__k" data-primer="CON 0163233250 или Уценка-0165326648">
          <b>Паллета</b><small>CON …, «Уценка-…», номер</small>
          <span>Где стоит и что на ней — прямо сейчас, лот и заказ. Заактировать всё без акта, переместить в ячейку, история, Excel.</span></button>
        <button type="button" class="vmsVozm__k" data-primer="CEL 3923168">
          <b>Ячейка</b><small>наклейка CEL …</small>
          <span>Стол — его решения для актов. Любая другая — что в ней лежит, по паллетам; паллета открывается кликом.</span></button>
        <button type="button" class="vmsVozm__k" data-primer="ACT 0005263917">
          <b>Акт</b><small>наклейка ACT …</small>
          <span>Что за товар, дефект, кто и когда заактировал — и где эта штука сейчас, в каком заказе.</span></button>
      </div>`);
      document.getElementById("vmsVozm").insertAdjacentHTML("afterend", `<div class="vmsPolosa" id="vmsPolosa"></div>
        <div class="vmsProba"><span>Попробовать:</span>
          <button type="button" data-probovat="4603731306678">товар: радиатор ROMMER</button>
          <button type="button" data-probovat="CON 0163233250">паллета на буфере столов</button>
          <button type="button" data-probovat="CEL 3923168">ячейка «буфер, группа 3»</button>
          <button type="button" data-probovat="CEL 4089525">отгрузка уценки ДНЛ</button>
          <button type="button" data-probovat="CEL 3099400">стол 3 предсорта</button>
          <button type="button" data-probovat="ACT 0005263917">акт на радиатор</button>
        </div>`);
      document.querySelector(".vmsProba").addEventListener("click", (e) => {
        const k = e.target.closest("[data-probovat]");
        const go = document.getElementById("go");
        if (!k || !scan || scan.disabled) return;
        scan.value = k.dataset.probovat;
        if (go) go.click();
      });
      document.getElementById("vmsVozm").addEventListener("click", (e) => {
        const k = e.target.closest("[data-primer]");
        if (!k || !scan) return;
        scan.placeholder = "например: " + k.dataset.primer;
        scan.focus();
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ploshchadka);
  else ploshchadka();

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Решения — от стола (26.09): человек пикает наклейку своего стола (CEL…),
  // и пикалка показывает, что с этого стола реально делают: сервер собирает
  // это каждую ночь по перемещениям WMS. Стол помним до конца дня.
  const KLYUCH_STOLA = "akt-stol";
  const segodnya = () => new Date().toISOString().slice(0, 10);
  let stol = null;
  try {
    const z = JSON.parse(localStorage.getItem(KLYUCH_STOLA) || "null");
    if (z && z.день === segodnya()) stol = z.стол;
  } catch (e) { /* нет — пикнут заново */ }
  let oshibkaStola = "";
  // Куда положили (26.09): после решения — пик паллеты «CON …», и по ней
  // создаётся перемещение «стол → ячейка решения → паллета» (с актом, если был).
  let zhdemPalletu = null;   // { ishod, akt }
  let perItog = null;        // { ok, tekst }
  let perIdet = false;
  // Паллета стоит не в ячейке решения (живой отчёт WMS, 27.09) — спрашиваем.
  let perVopros = null;      // { kod, tekst }
  // Крит / косм: на предсорте это решают и так, в акт пишем вместе с дефектом.
  const KRIT = [{ k: "крит", имя: "Критичный" }, { k: "косм", имя: "Косметический" }];
  let krit = "";
  // Как дефекты пишут руками сейчас (топ по её актам), только одним текстом.
  // На кнопке коротко, в акт — полностью.
  const DEFEKTY = [
    { k: "переломан", имя: "Переломан" }, { k: "расколот", имя: "Расколот" },
    { k: "погнут", имя: "Погнут" }, { k: "порвана упаковка", имя: "Порвана упаковка" },
    { k: "надорван", имя: "Надорван" }, { k: "потёртости", имя: "Потёртости" },
    { k: "следы загрязнения, нетоварный вид", имя: "Загрязнение" }, { k: "не работает", имя: "Не работает" },
  ];
  let tovar = null;
  let reshenie = "";
  let defekt = "";
  let nomer = 7713001;
  let zaSmenu = 0;
  let gotovo = null;          // только что созданный акт — показываем до следующего пика
  let boevoy = false;         // включена в админке: кнопка создаёт настоящий черновик
  // Личный вход в WMS (26.09): акты идут от имени того, кто вошёл. Пароль
  // уходит на сервер один раз, там не хранится — только сессия.
  let vms = { подключено: false };
  let obshchiyMozhno = false;
  let formaVhoda = false;
  let oshibkaVhoda = "";
  let oshibkaAkta = "";

  fetch("/__akt/sostoyanie", { cache: "no-store" }).then((o) => o.ok ? o.json() : {})
    .then((d) => {
      boevoy = Boolean(d.включена);
      obshchiyMozhno = Boolean(d.общий_можно);
      vms = d.WMS || { подключено: false };
      risovat();
    })
    .catch(() => {});

  // «Рысаков Степан Максимович» → «Рысаков С. М.»: в плашке нужна фамилия.
  const korotko = (fio) => {
    const s = String(fio || "").trim().split(/\s+/);
    return s.length >= 2 ? `${s[0]} ${s.slice(1, 3).map((w) => w[0] + ".").join(" ")}` : String(fio || "");
  };

  function plashkaVms() {
    if (!boevoy) return `<span class="aktPs__chip is-demo">демо</span>`;
    if (vms.подключено) {
      return `<span class="aktPs__chip is-ok" title="Акты уходят от имени: ${esc(vms.имя)}"><i></i>WMS · ${esc(korotko(vms.имя))}
        <button type="button" class="aktPs__x" id="aktVmsVyyti" title="Выйти из WMS" aria-label="Выйти из WMS">×</button></span>`;
    }
    return `<button type="button" class="aktPs__chip is-net" id="aktVmsVoyti"
      title="${obshchiyMozhno ? "Пока акты под общим логином" : "Без входа акт не создать"}">WMS · войти</button>`;
  }

  function formaVms() {
    if (!formaVhoda || vms.подключено) return "";
    return `<form class="aktPs__vhod" id="aktVmsForma" autocomplete="off">
      <input name="login" placeholder="Логин WMS" autocapitalize="off" spellcheck="false" required>
      <input name="parol" type="password" placeholder="Пароль WMS" required>
      <button class="aktPs__kn is-on" type="submit">Войти</button>
      <p class="aktPs__chto">${oshibkaVhoda ? `<b class="aktPs__oshibka">${esc(oshibkaVhoda)}</b> · ` : ""}пароль не сохраняется: сайт входит в WMS один раз и держит сессию до конца смены</p>
    </form>`;
  }

  const RESHENIYA = () => (stol && stol.исходы) || [];

  function blokPalety() {
    if (perItog) {
      return `<div class="aktPs__gotovo${perItog.ok ? "" : " is-oshibka"}"><b>${esc(perItog.zag)}</b>
        <span>${esc(perItog.tekst)}</span></div>
        <p class="aktPs__chto">${perItog.ok ? "Пикните следующий товар." : "Пикните паллету ещё раз или переместите руками в WMS."}</p>`;
    }
    if (!zhdemPalletu) return "";
    if (perVopros) {
      return `<div class="aktPs__palleta aktPs__palleta--vopros">
        <p class="aktPs__zag">Точно эта паллета?</p>
        <p class="aktPs__podskaz">${esc(perVopros.tekst)}</p>
        <div class="aktPs__vopros">
          <button type="button" class="aktPs__kn is-on" data-per-da>Всё равно переместить</button>
          <button type="button" class="aktPs__kn" data-per-net>Пикну другую</button>
        </div>
      </div>`;
    }
    return `<div class="aktPs__palleta">
      <p class="aktPs__zag">Куда положили</p>
      <p class="aktPs__podskaz">${perIdet ? "Создаю перемещение…" : `Пикните наклейку паллеты в «${esc(zhdemPalletu.ishod.куда)}» (CON …)`}</p>
      <form class="aktPs__vhod aktPs__palForma" id="aktPalForma" autocomplete="off">
        <input name="kod" placeholder="или введите номер паллеты" inputmode="numeric">
        <button class="aktPs__kn is-on" type="submit"${perIdet ? " disabled" : ""}>Переместить</button>
      </form>
    </div>`;
  }

  // --- Актировка целой паллеты прямо в пикалке (26.09) ---------------------
  // Пикнули паллету «CON …» не после решения по товару — показываем её
  // состав без акта и «Заактировать все»: акт на каждую штуку, в фоне.
  let pal = null;          // состав паллеты
  let palKrit = "";
  let palDefekt = "";
  let palRabota = null;    // ход фоновой работы
  let palOshibka = "";
  let palKarta = null;     // где стоит, лот, заказы — /__palleta/karta (27.09)
  // Перемещение целой паллеты (27.09, «а возможность перемещения?»):
  // null | { zhdem } | { idet } | { predv, yach } | { gotovo } | { oshibka }
  let palPer = null;
  const kartochka = document.getElementById("answer");

  function vRezhimPalety(vkl) {
    if (!kartochka) return;
    kartochka.classList.toggle("is-palleta", vkl);
    if (vkl) kartochka.style.display = "flex";
  }

  async function otkrytPalletu(kod) {
    pal = null; palKrit = ""; palDefekt = ""; palRabota = null; palOshibka = ""; palPer = null; yach = null;
    aktK = null; istP = null;
    tovar = null; gotovo = null; zhdemPalletu = null; perItog = null;
    vRezhimPalety(true);
    box.hidden = false;
    box.innerHTML = '<p class="aktPs__chto">Смотрю паллету…</p>';
    palKarta = null;
    // Где стоит, лот и заказы — параллельно составу; не пришло — панель и без них.
    fetch(`/__palleta/karta?kod=${encodeURIComponent(kod)}`, { cache: "no-store" })
      .then((o) => (o.ok ? o.json() : null)).then((d) => { palKarta = d; if (pal) risovat(); }).catch(() => {});
    try {
      const o = await fetch(`/__akt/palleta?kod=${encodeURIComponent(kod)}`, { cache: "no-store" });
      const d = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      pal = d;
    } catch (e) {
      palOshibka = e.message || String(e);
      pal = { паллета: kod, ячейка: "", строки: [], без_акта: 0 };
    }
    risovat();
  }

  function risovatPalletu() {
    const vsego = pal.строки.reduce((n, x) => n + x.штук, 0);
    const spisok = pal.строки.map((x) => `<div class="palStroka${x.без_акта ? " is-bez" : ""}">
        <span class="palStroka__tovar">${esc(x.товар)}</span>
        <span class="palStroka__sht">${x.штук} шт</span>
        <span class="palStroka__akt">${x.акт ? `акт №${x.акт}` : x.уже_нами && !x.без_акта ? "заактировано нами" : "без акта"}</span>
      </div>`).join("");
    let niz;
    if (palOshibka) {
      niz = `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(palOshibka)}</b></p>`;
    } else if (palRabota) {
      const proc = palRabota.всего ? Math.round(100 * palRabota.готово / palRabota.всего) : 0;
      niz = `<div class="palHod"><p class="aktPs__podskaz">${palRabota.идёт ? "Актирую…" : "Готово"} ${palRabota.готово} из ${palRabota.всего}</p>
        <div class="palHod__polosa"><i style="width:${proc}%"></i></div>
        <p class="aktPs__chto">актов создано: ${palRabota.акты.length}${palRabota.ошибки.length ? ` · ошибок: ${palRabota.ошибки.length}` : ""}</p>
        ${palRabota.ошибки.slice(-3).map((o) => `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(o.товар)}</b> ${esc(o.ошибка)}</p>`).join("")}
        ${palRabota.идёт ? "" : `<p class="aktPs__chto">Пикните следующую паллету или товар.</p>`}</div>`;
    } else if (pal.без_акта) {
      const gotov = palKrit && palDefekt;
      niz = `<p class="aktPs__zag">Крит или косм</p>
        <div class="aktPs__krit">${KRIT.map((x) => `<button type="button" class="aktPs__kn${x.k === palKrit ? " is-on" : ""}" data-pkrit="${x.k}">${x.имя}</button>`).join("")}</div>
        <p class="aktPs__zag">Дефект — один на все штуки</p>
        <div class="aktPs__defekty">${DEFEKTY.map((d) => `<button type="button" class="aktPs__kn aktPs__kn--def${d.k === palDefekt ? " is-on" : ""}" data-pdef="${esc(d.k)}">${esc(d.имя)}</button>`).join("")}</div>
        <button type="button" class="aktPs__akt" id="palGo"${gotov && boevoy ? "" : " disabled"}>${
          !boevoy ? "Актировка выключена в админке" : !palKrit ? "Выберите крит или косм" : !palDefekt ? "Выберите дефект" : `Заактировать ${pal.без_акта} шт`}</button>
        <p class="aktPs__chto">Внутренний брак · качество брак · «мех. повреждения, ${esc(palDefekt || "…")}${palKrit ? ", " + palKrit : ""}» · исходная ячейка и паллета — где лежит</p>`;
    } else {
      niz = `<p class="aktPs__chto">На паллете нет штук без акта.</p>`;
    }
    box.innerHTML = `<header class="aktPs__shapka">
        <div><p class="aktPs__nad">${esc(pal.паллета)}</p>
          <p class="aktPs__rezhim">${esc(pal.ячейка || "")}${vsego ? ` · без акта ${pal.без_акта} шт из ${vsego}` : ""}</p></div>
        ${plashkaVms()}
      </header>${formaVms()}
      ${blokKarty()}
      ${blokPeremeshcheniya()}
      ${blokIstorii()}
      ${spisok ? `<div class="palSpisok">${spisok}</div>` : ""}
      ${niz}`;
  }

  // Карточка паллеты (27.09, «вставляю название паллеты — ничего не могу
  // сделать»): где стоит сейчас, лот, заказ, расхождение WMS и действия.
  function blokKarty() {
    const k = palKarta;
    const gde = k && (k.где || [])[0];
    const yachTovara = k ? [...new Set((k.товары || []).map((t) => t.ячейка).filter(Boolean))] : [];
    const rashod = gde && yachTovara.length && !yachTovara.includes(gde.ячейка);
    return `<div class="palKartaAkt">
      ${k ? `<div class="palKartaAkt__fakty">
        ${!gde ? "<span>в ячейке не числится</span>" : gde.ячейка !== pal.ячейка ? `<span>стоит: <b>${esc(gde.ячейка)}</b></span>` : ""}
        ${k.лот ? `<span>лот <b>${esc(k.лот.номер)}</b> · ${esc(k.лот.статус || "—")}</span>` : "<span>не в лоте</span>"}
        ${(k.в_заказах || []).length ? `<span>в заказе <b>${k.в_заказах.map(esc).join(", ")}</b></span>` : ""}
      </div>
      ${rashod ? `<p class="aktPs__net"><b class="aktPs__oshibka">Паллета стоит в «${esc(gde.ячейка)}», а товар на ней числится в «${esc(yachTovara.join("», «"))}».</b></p>` : ""}` : ""}
      <div class="palKartaAkt__knopki">
        <button type="button" class="aktPs__kn" data-pkk="excel">Состав в Excel</button>
        <button type="button" class="aktPs__kn" data-pkk="kopir">Копировать</button>
        ${k ? `<a class="aktPs__kn" href="${esc(k.WMS)}" target="_blank" rel="noopener">Открыть в WMS</a>` : ""}
      </div>
      <div class="palKartaAkt__dva">
        ${palPer ? "" : `<button type="button" class="aktPs__kn" data-pkk="peremestit">Переместить паллету</button>`}
        <button type="button" class="aktPs__kn" data-pkk="istoriya">История</button>
      </div>
    </div>`;
  }

  function blokPeremeshcheniya() {
    if (!palPer) return "";
    const p = palPer;
    let telo = "";
    if (p.zhdem) {
      telo = `<p class="aktPs__podskaz">Пикните наклейку ячейки, куда везёте (CEL …)</p>
        <form class="aktPs__vhod aktPs__palForma" id="palPerForma" autocomplete="off">
          <input name="kod" placeholder="или номер ячейки" inputmode="numeric">
          <button class="aktPs__kn is-on" type="submit">Дальше</button>
        </form>`;
    } else if (p.idet) {
      telo = `<p class="aktPs__podskaz">${p.idet}</p>`;
    } else if (p.predv) {
      const d = p.predv;
      const oshibki = d.ошибки_WMS ? Object.values(d.ошибки_WMS).flat().join("; ") : "";
      telo = `<p class="aktPs__podskaz">${esc(d.откуда.join(", "))} → <b>${esc(d.куда)}</b></p>
        <p class="aktPs__chto">${esc(d.склад)} · ${d.строк} строк · ${d.штук} шт${d.в_заказах ? ` · резерв ${d.в_заказах} заказа(ов) едет с товаром` : ""}</p>
        ${oshibki ? `<p class="aktPs__net"><b class="aktPs__oshibka">WMS не примет: ${esc(oshibki)}</b></p>` : ""}
        <div class="aktPs__vopros">
          <button type="button" class="aktPs__kn is-on" data-pkk="per-da"${oshibki || !boevoy ? " disabled" : ""}>${boevoy ? "Переместить" : "Актировка выключена"}</button>
          <button type="button" class="aktPs__kn" data-pkk="per-net">Отмена</button>
        </div>`;
    } else if (p.gotovo) {
      telo = `<div class="aktPs__gotovo"><b>Перемещение${p.gotovo.перемещение ? ` №${esc(p.gotovo.перемещение)}` : ""} создано черновиком</b>
        <span>${esc(p.gotovo.паллета)} → ${esc(p.gotovo.куда)} · ${p.gotovo.строк} строк</span></div>`;
    } else if (p.oshibka) {
      telo = `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(p.oshibka)}</b></p>
        <button type="button" class="aktPs__kn" data-pkk="per-net">Закрыть</button>`;
    }
    return `<div class="aktPs__palleta palPer"><p class="aktPs__zag">Переместить паллету</p>${telo}</div>`;
  }

  async function peremestitPalletu(yach, sohranit) {
    palPer = { idet: sohranit ? "Создаю перемещение в WMS…" : "Проверяю в WMS — до полуминуты…", yach };
    risovat();
    try {
      const o = await fetch("/__akt/palleta/peremestit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: String(pal.паллета_id || pal.паллета), ячейка: yach, сохранить: sohranit }),
      });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом «Переместить» ещё раз"; palPer = { predv: palPer.predv || null, yach }; risovat(); return; }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      palPer = d.готово ? { gotovo: d } : { predv: d, yach };
      if (d.готово && navigator.vibrate) navigator.vibrate(150);
    } catch (e) {
      palPer = { oshibka: e.message || String(e) };
    }
    risovat();
    vFokus();
  }

  function sostavVExcel() {
    const imya = (palKarta && palKarta.паллета) || pal.паллета;
    const stroki = [["Паллета", "Ячейка", "Товар", "Акт", "Качество", "Кол-во", "Заказ"]].concat(
      palKarta ? palKarta.товары.map((t) => [imya, t.ячейка, t.товар, t.акт || "", t.качество, t.штук, t.заказ || ""])
        : pal.строки.map((x) => [imya, x.ячейка, x.товар, x.акт || "", x.качество || "", x.штук, ""]));
    const csv = "\ufeff" + stroki.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${String(imya).replace(/[\\/:*?"<>|]/g, "_")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function palStart() {
    const kn = document.getElementById("palGo");
    if (kn) kn.disabled = true;
    try {
      const o = await fetch("/__akt/palleta/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: String(pal.паллета_id), дефект: palDefekt, крит: palKrit }),
      });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом снова «Заактировать»"; risovat(); return; }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      palRabota = { id: d.id, всего: pal.без_акта, готово: 0, акты: [], ошибки: [], идёт: true };
      risovat();
      while (palRabota && palRabota.идёт) {
        await new Promise((ok) => setTimeout(ok, 1200));
        try {
          const h = await (await fetch(`/__akt/palleta/hod?id=${palRabota.id}`, { cache: "no-store" })).json();
          if (h.ошибка) { palRabota.идёт = false; palRabota.ошибки.push({ товар: "", ошибка: h.ошибка }); }
          else palRabota = { id: palRabota.id, ...h };
        } catch (e) { /* сеть моргнула — следующий опрос */ }
        if (pal) risovat();
      }
      zaSmenu += palRabota ? palRabota.акты.length : 0;
      if (navigator.vibrate) navigator.vibrate(150);
    } catch (e) {
      palOshibka = e.message || String(e);
      risovat();
    }
    vFokus();
  }

  // --- Ячейка (27.09, площадка WMS): наклейка CEL не стол — что в ней лежит ---
  let yach = null;
  // Акт по наклейке, «где ещё лежит» товар, история паллеты (27.09, «там не весь спектр»).
  let aktK = null;
  let gdeT = null;
  let istP = null;
  let aktyT = null;        // последние акты на товар (27.09, «товар взять и увидеть, что с ним делать»)
  let stolyVse = null;     // столы кнопками — без наклейки
  let vyborStola = false;
  let vozvrat = null;      // открыли паллету/акт из карточки товара — можно вернуться
  function zagruzitTovar(t) {
    gdeT = { zhdu: true }; aktyT = { zhdu: true };
    const q = `imya=${encodeURIComponent(t.name || "")}&kod=${encodeURIComponent(t.kod || "")}`;
    chitat(`/__vms/tovar_gde?${q}`).then((d) => { gdeT = d; }).catch((err) => { gdeT = { oshibka: err.message || String(err) }; })
      .finally(() => { if (tovar === t) risovat(); });
    chitat(`/__vms/tovar_akty?${q}`).then((d) => { aktyT = d; }).catch((err) => { aktyT = { oshibka: err.message || String(err) }; })
      .finally(() => { if (tovar === t) risovat(); });
  }
  function zagruzitStoly() {
    if (stolyVse) return;
    stolyVse = { zhdu: true };
    chitat("/__akt/stoly").then((d) => { stolyVse = d; }).catch((err) => { stolyVse = { oshibka: err.message || String(err) }; })
      .finally(() => { if (tovar) risovat(); });
  }
  function blokStolov() {
    zagruzitStoly();
    const spisok = Array.isArray(stolyVse) ? stolyVse : [];
    return `<p class="aktPs__zag">Заактировать — выберите стол</p>
      <p class="aktPs__chto">Решения (утиль, ДВК, категории уценки) у каждого стола свои. На складе стол выбирают наклейкой CEL, здесь — кнопкой.</p>
      ${stolyVse && stolyVse.zhdu ? '<p class="aktPs__chto">Загружаю столы…</p>' : ""}
      ${stolyVse && stolyVse.oshibka ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(stolyVse.oshibka)}</b></p>` : ""}
      <div class="aktPs__resheniya vmsStoly">${spisok.map((x) => `<button type="button" class="aktPs__kn${stol && String(stol.id) === String(x.id) ? " is-on" : ""}" data-vybrat-stol="${esc(x.id)}">${esc(String(x.имя || "").replace(/^ФБ \(ДМД\) /, ""))}<small>${(x.исходы || []).length} реш.</small></button>`).join("")}</div>`;
  }
  function blokAktyTovara() {
    if (!tovar || !aktyT) return "";
    if (aktyT.zhdu) return '<p class="aktPs__zag">Акты на этот товар</p><p class="aktPs__chto">Смотрю акты в хранилище — секунд десять…</p>';
    if (aktyT.oshibka) return `<p class="aktPs__zag">Акты на этот товар</p><p class="aktPs__net"><b class="aktPs__oshibka">${esc(aktyT.oshibka)}</b></p>`;
    return `<p class="aktPs__zag">Акты на этот товар · ${aktyT.акты.length ? `последние ${aktyT.акты.length}` : "нет"}</p>
      ${aktyT.акты.length ? `<div class="yachPallety">${aktyT.акты.map((a) => `
        <button type="button" class="yachPalleta yachPalleta--stolb" data-akt-otkryt="${esc(a.наклейка)}">
          <span class="yachPalleta__imya">Акт №${esc(a.акт)} · ${esc(`${a.когда.slice(8, 10)}.${a.когда.slice(5, 7)}.${a.когда.slice(2, 4)}`)}</span>
          <span>${esc(a.дефект || "—")}</span>
          <span class="yachPalleta__zak">${esc(a.вид)} · ${esc(a.кто)}</span>
        </button>`).join("")}</div>` : '<p class="aktPs__chto">На этот товар актов не было.</p>'}
      <p class="aktPs__chto">Из хранилища — акты за последние часы ещё не видны. Нажмите акт — где эта штука сейчас.</p>`;
  }
  function knopkaNazad() {
    return vozvrat ? `<button type="button" class="aktPs__kn vmsNazad" data-nazad="1">← к товару</button>` : "";
  }
  async function chitat(url) {
    const o = await fetch(url, { cache: "no-store" });
    const d = await o.json().catch(() => ({}));
    if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
    return d;
  }

  async function otkrytAkt(kod) {
    aktK = { zhdu: true }; pal = null; yach = null; tovar = null; vRezhimPalety(true); risovat();
    try { aktK = await chitat(`/__vms/akt?kod=${encodeURIComponent(kod)}`); } catch (e) { aktK = { oshibka: e.message || String(e) }; }
    risovat();
  }

  function risovatAkt() {
    const a = aktK;
    if (a.zhdu) { box.innerHTML = '<p class="aktPs__chto">Смотрю акт…</p>'; return; }
    if (a.oshibka) { box.innerHTML = `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(a.oshibka)}</b></p>`; return; }
    box.innerHTML = `<header class="aktPs__shapka"><div><p class="aktPs__nad">Акт №${esc(a.акт)}</p>
        <p class="aktPs__rezhim">${esc(a.вид)} · ${esc(a.когда)} · ${esc(a.автор)}</p></div></header>
      <p class="aktPs__podskaz">${esc(a.товар)}</p>
      <p class="aktPs__chto">дефект: ${esc(a.дефект || "—")}${a.из_ячейки ? ` · заактирован в «${esc(a.из_ячейки)}»` : ""}</p>
      <p class="aktPs__zag">Где сейчас</p>
      ${a.где.length ? `<div class="yachPallety">${a.где.map((g) => `
        <button type="button" class="yachPalleta yachPalleta--stolb" data-pal-otkryt="${esc(g.паллета)}"${g.паллета ? "" : " disabled"}>
          <span class="yachPalleta__imya">${esc(g.паллета || "без паллеты")}</span>
          <span>${esc(g.ячейка)} <span class="yachPalleta__zak">· ${esc(g.зона)}</span></span>
          ${g.заказ ? `<span class="yachPalleta__zak">заказ ${esc(g.заказ)}</span>` : ""}
        </button>`).join("")}</div>` : '<p class="aktPs__chto">На складе этой штуки уже нет — продана, списана или уехала.</p>'}
      <div class="palKartaAkt__knopki"><a class="aktPs__kn" href="${esc(a.WMS)}" target="_blank" rel="noopener">Открыть акт в WMS</a></div>
      <p class="aktPs__chto">Данные хранилища — свежий акт появляется через несколько часов.</p>`;
  }

  function blokGde() {
    if (!tovar) return "";
    if (!gdeT) return `<button type="button" class="aktPs__kn palKartaAkt__per" data-gde="1">Где лежит этот товар</button>`;
    if (gdeT.zhdu) return '<p class="aktPs__chto">Ищу товар по всему складу в WMS…</p>';
    if (gdeT.oshibka) return `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(gdeT.oshibka)}</b></p>`;
    return `<p class="aktPs__zag">Где лежит сейчас · ${gdeT.штук} шт в ${gdeT.мест} местах</p>
      <div class="yachPallety">${gdeT.места.map((m) => `
        <button type="button" class="yachPalleta" data-pal-otkryt="${esc(m.паллета)}"${m.паллета ? "" : " disabled"}>
          <span class="yachPalleta__imya">${esc(m.ячейка)}</span>
          <span>${m.штук} шт</span>
          <span class="yachPalleta__zak">${esc(m.паллета || "без паллеты")}</span>
          <span class="yachPalleta__zak">${esc(m.качество.join(", "))}${m.заказы.length ? ` · заказ ${esc(m.заказы.join(", "))}` : ""}</span>
        </button>`).join("")}</div>`;
  }

  function blokIstorii() {
    if (!istP) return "";
    if (istP.zhdu) return `<p class="aktPs__chto">Смотрю историю паллеты за ${istP.zhdu} дней — ${istP.zhdu > 10 ? "до пары минут" : "до полуминуты"}…</p>`;
    if (istP.oshibka) return `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(istP.oshibka)}</b></p>`;
    return `<p class="aktPs__zag">История за ${istP.дней} дней · ${istP.шаги.length}</p>
      ${istP.шаги.length ? `<div class="palIst">${istP.шаги.map((h) => `
        <div class="palIst__shag"><span class="palIst__kogda">${esc(`${h.когда.slice(8, 10)}.${h.когда.slice(5, 7)} ${h.когда.slice(11, 16)}`)}</span>
          <span>${esc(h.откуда || "—")} → <b>${esc(h.куда || "—")}</b></span>
          <span class="yachPalleta__zak">${esc(h.что || "")} · ${esc(h.кто)} · ${h.строк} стр.</span></div>`).join("")}</div>`
        : `<p class="aktPs__chto">Перемещений не было.${istP.дней < 60 ? ' <button type="button" class="aktPs__kn" data-pkk="istoriya60">Искать за 60 дней</button>' : ""}</p>`}
      <p class="aktPs__chto">Хранилище отстаёт на несколько часов: самые свежие перемещения здесь ещё не видны.</p>`;
  }

  async function otkrytYacheyku(kod) {
    aktK = null;
    yach = { zhdu: true, kod };
    pal = null; tovar = null; vRezhimPalety(true);
    risovat();
    try {
      const o = await fetch(`/__yacheyka/karta?kod=${encodeURIComponent(kod)}`, { cache: "no-store" });
      const d = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      yach = d;
    } catch (e) {
      yach = { oshibka: e.message || String(e), kod };
    }
    risovat();
  }

  function risovatYacheyku() {
    const y = yach;
    if (y.zhdu) { box.innerHTML = '<p class="aktPs__chto">Смотрю ячейку в WMS — большая ячейка до полуминуты…</p>'; return; }
    if (y.oshibka) { box.innerHTML = `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(y.oshibka)}</b></p>`; return; }
    box.innerHTML = `<header class="aktPs__shapka">
        <div><p class="aktPs__nad">${esc(y.ячейка)}</p>
          <p class="aktPs__rezhim">${esc(y.зона)}${y.склад ? ` · ${esc(y.склад)}` : ""}</p></div>
      </header>
      <div class="palKartaAkt__fakty">
        <span><b>${y.паллеты.length}</b> паллет</span><span><b>${y.штук}</b> шт</span>
        <span class="${y.без_акта ? "is-vazhno" : ""}"><b>${y.без_акта}</b> без акта</span>
      </div>
      ${y.паллеты.length ? `<div class="yachPallety">${y.паллеты.map((p) => `
        <button type="button" class="yachPalleta" data-pal-otkryt="${esc(p.паллета)}"${p.паллета ? "" : " disabled"}>
          <span class="yachPalleta__imya">${esc(p.паллета || "без паллеты")}</span>
          <span>${p.штук} шт</span>
          <span class="${p.без_акта ? "is-bez" : ""}">${p.без_акта ? `${p.без_акта} без акта` : "все с актом"}</span>
          ${p.заказы.length ? `<span class="yachPalleta__zak">${esc(p.заказы.join(", "))}</span>` : "<span></span>"}
        </button>`).join("")}</div>` : '<p class="aktPs__chto">Ячейка пустая.</p>'}
      <p class="aktPs__chto">Нажмите паллету — откроется её карточка: состав, актировка, перемещение.</p>`;
  }

  // Строка состояния площадки (27.09, «где сам тест и где вход в WMS»): вход в
  // WMS, стол и включена ли актировка — видно сразу, до первого пика.
  let formaPolosy = false;
  function risovatPolosu() {
    const u = document.getElementById("vmsPolosa");
    if (!u) return;
    const vmsChast = vms.подключено
      ? `<span class="vmsPolosa__ok">WMS: <b>${esc(korotko(vms.имя))}</b> — акты и перемещения от вас</span>
         <button type="button" class="vmsPolosa__kn" data-polosa="vyyti">выйти</button>`
      : `<span class="vmsPolosa__net">WMS: не вошли${obshchiyMozhno ? " — пока работает общий логин (тест)" : " — без входа акты не создаются"}</span>
         <button type="button" class="vmsPolosa__kn is-glav" data-polosa="voyti">Войти в WMS</button>`;
    u.innerHTML = `
      <div class="vmsPolosa__ryad">${vmsChast}</div>
      ${formaPolosy && !vms.подключено ? `<form class="aktPs__vhod" id="vmsPolosaForma" autocomplete="off">
        <input name="login" placeholder="Логин WMS" autocapitalize="off" spellcheck="false" required>
        <input name="parol" type="password" placeholder="Пароль WMS" required>
        <button class="aktPs__kn is-on" type="submit">Войти</button>
        <p class="aktPs__chto">${oshibkaVhoda ? `<b class="aktPs__oshibka">${esc(oshibkaVhoda)}</b> · ` : ""}пароль не сохраняется: сайт входит в WMS один раз и держит сессию до конца смены</p>
      </form>` : ""}
      <div class="vmsPolosa__ryad">
        <span>${stol ? `Стол: <b>${esc(stol.имя)}</b> — сменить: пикните наклейку другого` : "Стол не выбран — пикните наклейку стола (CEL …), чтобы появились решения для актов"}</span>
      </div>
      <div class="vmsPolosa__ryad">
        <span class="${boevoy ? "vmsPolosa__ok" : "vmsPolosa__net"}">${boevoy
          ? `Актировка включена — кнопки создают настоящие документы в WMS${obshchiyMozhno ? " (тест: можно и без входа)" : ""}`
          : "Актировка выключена в админке — всё только показывается, в WMS ничего не создаётся"}</span>
      </div>`;
  }

  function risovat() {
    risovatPolosu();
    if (aktK && !pal) { box.hidden = false; risovatAkt(); box.insertAdjacentHTML("afterbegin", knopkaNazad()); return; }
    if (yach && !pal) { box.hidden = false; risovatYacheyku(); return; }
    if (pal) { box.hidden = false; risovatPalletu(); box.insertAdjacentHTML("afterbegin", knopkaNazad()); return; }
    if (!tovar) { box.hidden = true; return; }
    box.hidden = false;
    risovatTovar();
    box.insertAdjacentHTML("beforeend", blokGde() + blokAktyTovara());
  }

  function risovatTovar() {
    const r = RESHENIYA().find((x) => String(x.id) === String(reshenie));
    const shapka = `<header class="aktPs__shapka">
        <div><p class="aktPs__nad">${stol ? esc(stol.имя.replace(/^ФБ \(ДМД\) /, "")) : "Стол не выбран"}</p>
          <p class="aktPs__rezhim">${stol ? `сменить — пикните наклейку другого стола или <button type="button" class="vmsSmenit" data-smenit-stol="1">выберите</button>` : "стол не выбран"}${
            boevoy ? "" : " · демо"}${zaSmenu ? ` · за смену ${zaSmenu}` : ""}</p></div>
        ${plashkaVms()}
      </header>${formaVms()}`;

    if (!stol || vyborStola) {
      box.innerHTML = `${shapka}${oshibkaStola ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(oshibkaStola)}</b></p>` : ""}${blokStolov()}`;
      return;
    }

    if (gotovo) {
      box.innerHTML = `${shapka}
        <div class="aktPs__gotovo"><b>Акт №${esc(gotovo.nomer)}</b>
          <span>${esc(gotovo.tovar)}</span><span>${esc(gotovo.reshenie)} · мех. повреждения, ${esc(gotovo.defekt)}</span></div>
        ${blokPalety()}`;
      return;
    }

    const n = RESHENIYA().length;
    const kolonok = n <= 5 ? n : 4;
    const gotovKnopka = defekt && krit;
    box.innerHTML = `${shapka}
      <p class="aktPs__zag">Решение</p>
      <div class="aktPs__resheniya" style="grid-template-columns:repeat(${kolonok},minmax(0,1fr))">${RESHENIYA().map((x) => `<button type="button" class="aktPs__kn${String(x.id) === String(reshenie) ? " is-on" : ""}" data-resh="${x.id}" title="${esc(x.куда)}">${esc(x.имя)}</button>`).join("")}</div>
      ${!r ? "" : !r.акт ? `<p class="aktPs__net">«${esc(r.имя)}» — акт не нужен.</p>${blokPalety()}` : `
        <p class="aktPs__zag">Крит или косм</p>
        <div class="aktPs__krit">${KRIT.map((x) => `<button type="button" class="aktPs__kn${x.k === krit ? " is-on" : ""}" data-krit="${x.k}">${x.имя}</button>`).join("")}</div>
        <p class="aktPs__zag">Дефект</p>
        <div class="aktPs__defekty">${DEFEKTY.map((d) => `<button type="button" class="aktPs__kn aktPs__kn--def${d.k === defekt ? " is-on" : ""}" data-def="${esc(d.k)}">${esc(d.имя)}</button>`).join("")}</div>
        <button type="button" class="aktPs__akt" id="aktPsGo"${gotovKnopka ? "" : " disabled"}>${gotovKnopka ? "Заактировать" : !krit ? "Выберите крит или косм" : "Выберите дефект"}</button>
        <p class="aktPs__chto">Внутренний брак · качество брак · «мех. повреждения, ${esc(defekt || "…")}${krit ? ", " + krit : ""}» · ${esc(stol.имя)} → ${esc(r.куда)} · комплектность полная</p>
        ${oshibkaAkta ? `<p class="aktPs__net"><b class="aktPs__oshibka">Акт не создан:</b> ${esc(oshibkaAkta)}</p>` : ""}`}`;
  }

  function vFokus() {
    const vvod = document.getElementById("scan");
    if (vvod) vvod.focus();
  }

  document.addEventListener("picker:hit", (e) => {
    tovar = e.detail; reshenie = ""; defekt = ""; krit = ""; gotovo = null; oshibkaAkta = "";
    aktK = null; gdeT = null; yach = null; vozvrat = null; vyborStola = false;
    zagruzitTovar(tovar);
    zhdemPalletu = null; perItog = null;
    if (pal && !(palRabota && palRabota.идёт)) { pal = null; vRezhimPalety(false); }
    risovat();
  });
  // С карточки паллеты «Заактировать» ведёт сюда с ?palleta=CON… — сразу её панель.
  const palIzAdresa = new URLSearchParams(location.search).get("palleta");
  if (palIzAdresa) setTimeout(() => otkrytPalletu(palIzAdresa), 300);

  document.addEventListener("picker:akt", (e) => { vozvrat = null; otkrytAkt(e.detail.kod); });
  document.addEventListener("picker:palleta", (e) => {
    if (!zhdemPalletu) vozvrat = null;
    // После решения по товару — «куда положили» (перемещение);
    // просто так — актировка целой паллеты.
    if (zhdemPalletu) { peremestit(e.detail.kod); return; }
    otkrytPalletu(e.detail.kod);
  });

  async function peremestit(kod, podtverdil = false) {
    if (perIdet || !zhdemPalletu) return;
    perIdet = true; perVopros = null; risovat();
    const { ishod, akt } = zhdemPalletu;
    try {
      if (!boevoy) {
        await new Promise((ok) => setTimeout(ok, 400));
        perItog = { ok: true, zag: "Перемещение (демо)", tekst: `${stol.имя} → ${ishod.куда} · паллета ${kod}` };
      } else {
        const otvet = await fetch("/__akt/peremeshchenie", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ исход: ishod.id, товар: tovar.name, код: tovar.kod || "", паллета: kod, акт: akt || null,
            подтвердил: podtverdil }),
        });
        const d = await otvet.json().catch(() => ({}));
        if (d.предупреждение) { perVopros = { kod, tekst: d.предупреждение }; if (navigator.vibrate) navigator.vibrate([80, 60, 80]); return; }
        if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом пикните паллету ещё раз"; return; }
        if (!otvet.ok || !d.готово) throw new Error(d.ошибка || `сервер ответил ${otvet.status}`);
        perItog = { ok: true, zag: "Перемещение создано черновиком",
          tekst: `${ishod.куда} · ${d.паллета}${akt ? ` · с актом №${akt}` : ""}` };
      }
      zhdemPalletu = null;
      if (navigator.vibrate) navigator.vibrate(120);
    } catch (oshibka) {
      perItog = { ok: false, zag: "Перемещение не создано", tekst: oshibka.message || String(oshibka) };
      zhdemPalletu = null;
    } finally {
      perIdet = false; risovat(); vFokus();
    }
  }
  document.addEventListener("picker:stol", async (e) => {
    vyborStola = false;
    // Ждём ячейку для перемещения паллеты — наклейка ячейки идёт туда, а не в смену стола.
    if (pal && palPer && palPer.zhdem) { peremestitPalletu(e.detail.kod, false); return; }
    oshibkaStola = "";
    try {
      const otvet = await fetch(`/__akt/stol?kod=${encodeURIComponent(e.detail.kod)}`, { cache: "no-store" });
      const d = await otvet.json().catch(() => ({}));
      // Не стол — значит, просто ячейка: показываем, что в ней лежит (площадка WMS).
      if (otvet.status === 404) { otkrytYacheyku(e.detail.kod); return; }
      if (!otvet.ok) throw new Error(d.ошибка || "стол не найден");
      stol = d;
      localStorage.setItem(KLYUCH_STOLA, JSON.stringify({ день: segodnya(), стол: d }));
      reshenie = ""; defekt = ""; krit = ""; gotovo = null;
      const m = document.getElementById("message");
      if (m) { m.textContent = `Стол: ${d.имя}. Теперь пикайте товар.`; m.className = "message ok"; }
    } catch (oshibka) {
      oshibkaStola = oshibka.message || String(oshibka);
      const m = document.getElementById("message");
      if (m) { m.textContent = oshibkaStola; m.className = "message warn"; }
    }
    if (tovar) risovat();
  });
  document.addEventListener("picker:miss", () => { tovar = null; risovat(); });

  box.addEventListener("submit", async (e) => {
    if (e.target.id === "palPerForma") {
      e.preventDefault();
      const kod = e.target.kod.value.trim();
      if (kod) peremestitPalletu(kod, false);
      return;
    }
    if (e.target.id === "aktPalForma") {
      e.preventDefault();
      const kod = e.target.kod.value.trim();
      if (kod) peremestit(kod);
      return;
    }
    if (e.target.id !== "aktVmsForma") return;
    e.preventDefault();
    await voytiVVms(e.target);
  });

  async function voytiVVms(f) {
    const kn = f.querySelector("button");
    kn.disabled = true;
    kn.textContent = "Вхожу…";
    try {
      const otvet = await fetch("/__wms/voyti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ логин: f.login.value.trim(), пароль: f.parol.value }),
      });
      const d = await otvet.json().catch(() => ({}));
      if (!otvet.ok) throw new Error(d.ошибка || "не вошли");
      vms = d; formaVhoda = false; formaPolosy = false; oshibkaVhoda = "";
    } catch (oshibka) {
      oshibkaVhoda = oshibka.message || String(oshibka);
    }
    risovat();
  }
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "vmsPolosaForma") return;
    e.preventDefault();
    voytiVVms(e.target);
  });
  document.addEventListener("click", async (e) => {
    const k = e.target.closest("[data-polosa]");
    if (!k) return;
    if (k.dataset.polosa === "voyti") {
      formaPolosy = !formaPolosy; oshibkaVhoda = ""; risovat();
      document.querySelector("#vmsPolosaForma input")?.focus();
    }
    if (k.dataset.polosa === "vyyti") {
      await fetch("/__wms/vyyti", { method: "POST" }).catch(() => {});
      vms = { подключено: false }; risovat();
    }
  });

  async function aktirovat() {
    const kn = document.getElementById("aktPsGo");
    kn.disabled = true;
    kn.textContent = "Создаю акт…";
    const r = RESHENIYA().find((x) => String(x.id) === String(reshenie));
    let nomerAkta = nomer++;
    oshibkaAkta = "";
    if (boevoy) {
      try {
        const otvet = await fetch("/__akt/sozdat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ товар: tovar.name, код: tovar.kod || "", дефект: `${defekt}, ${krit}`,
            решение: r.имя, исход: r.id }),
        });
        const d = await otvet.json().catch(() => ({}));
        if (d.нужен_вход || /сессия вмс закончилась/.test(d.ошибка || "")) {
          vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом снова «Заактировать»";
          risovat(); return;
        }
        if (!otvet.ok || !d.акт) throw new Error(d.ошибка || `сервер ответил ${otvet.status}`);
        nomerAkta = d.акт;
      } catch (oshibka) {
        oshibkaAkta = `${oshibka.message || oshibka}. Заактируйте руками в WMS.`;
        risovat();
        return;
      }
    } else {
      await new Promise((ok) => setTimeout(ok, 400));
    }
    zaSmenu += 1;
    gotovo = { nomer: nomerAkta, tovar: tovar.name || "", reshenie: `${r.имя} → ${r.куда}`, defekt: `${defekt}, ${krit}` };
    zhdemPalletu = { ishod: r, akt: nomerAkta };
    perItog = null;
    risovat();
    if (navigator.vibrate) navigator.vibrate(120);
    vFokus();
  }

  box.addEventListener("click", async (e) => {
    if (e.target.closest("#aktVmsVoyti")) {
      formaVhoda = !formaVhoda; oshibkaVhoda = ""; risovat();
      box.querySelector("#aktVmsForma input")?.focus();
      return;
    }
    if (e.target.closest("#aktVmsVyyti")) {
      await fetch("/__wms/vyyti", { method: "POST" }).catch(() => {});
      vms = { подключено: false }; risovat(); return;
    }
    const r = e.target.closest("[data-resh]");
    if (r) {
      reshenie = r.dataset.resh; defekt = ""; krit = ""; oshibkaAkta = ""; perItog = null;
      const ish = RESHENIYA().find((x) => String(x.id) === String(reshenie));
      zhdemPalletu = ish && !ish.акт ? { ishod: ish, akt: null } : null;
      return risovat();
    }
    if (e.target.closest("[data-gde]") && tovar) {
      gdeT = { zhdu: true }; risovat();
      const t = tovar;
      chitat(`/__vms/tovar_gde?imya=${encodeURIComponent(t.name || "")}&kod=${encodeURIComponent(t.kod || "")}`)
        .then((d) => { gdeT = d; }).catch((err) => { gdeT = { oshibka: err.message || String(err) }; })
        .finally(() => { if (tovar === t) risovat(); });
      return;
    }
    const vs = e.target.closest("[data-vybrat-stol]");
    if (vs && Array.isArray(stolyVse)) {
      const d = stolyVse.find((x) => String(x.id) === vs.dataset.vybratStol);
      if (d) {
        stol = d; vyborStola = false; reshenie = ""; defekt = ""; krit = ""; gotovo = null; oshibkaStola = "";
        localStorage.setItem(KLYUCH_STOLA, JSON.stringify({ день: segodnya(), стол: d }));
      }
      return risovat();
    }
    if (e.target.closest("[data-smenit-stol]")) { vyborStola = true; return risovat(); }
    const zapomnit = () => { if (tovar && !vozvrat) vozvrat = { tovar, gdeT, aktyT, reshenie }; };
    const ao = e.target.closest("[data-akt-otkryt]");
    if (ao) { zapomnit(); otkrytAkt(ao.dataset.aktOtkryt); return; }
    if (e.target.closest("[data-nazad]") && vozvrat) {
      const v = vozvrat; vozvrat = null;
      pal = null; aktK = null; yach = null; palPer = null; istP = null; vRezhimPalety(false);
      tovar = v.tovar; gdeT = v.gdeT; aktyT = v.aktyT; reshenie = v.reshenie;
      return risovat();
    }
    const po = e.target.closest("[data-pal-otkryt]");
    if (po && po.dataset.palOtkryt) { zapomnit(); otkrytPalletu(po.dataset.palOtkryt); return; }
    const pkk = e.target.closest("[data-pkk]");
    if (pkk && pal) {
      if (pkk.dataset.pkk === "excel") sostavVExcel();
      if (pkk.dataset.pkk === "peremestit") { palPer = { zhdem: true }; risovat(); vFokus(); }
      if (pkk.dataset.pkk === "istoriya" || pkk.dataset.pkk === "istoriya60") {
        const dney = pkk.dataset.pkk === "istoriya60" ? 60 : 10;
        istP = { zhdu: dney }; risovat();
        chitat(`/__vms/palleta_istoriya?kod=${encodeURIComponent(pal.паллета_id || pal.паллета)}&dney=${dney}`)
          .then((d) => { istP = d; }).catch((err) => { istP = { oshibka: err.message || String(err) }; })
          .finally(() => { if (pal) risovat(); });
      }
      if (pkk.dataset.pkk === "per-da" && palPer && palPer.yach) peremestitPalletu(palPer.yach, true);
      if (pkk.dataset.pkk === "per-net") { palPer = null; risovat(); vFokus(); }
      if (pkk.dataset.pkk === "kopir") {
        const imya = (palKarta && palKarta.паллета) || pal.паллета;
        navigator.clipboard.writeText(imya).then(() => { pkk.textContent = "Скопировано"; setTimeout(() => { pkk.textContent = "Копировать"; }, 1500); });
      }
      return;
    }
    if (e.target.closest("[data-per-da]") && perVopros) { peremestit(perVopros.kod, true); return; }
    if (e.target.closest("[data-per-net]")) { perVopros = null; risovat(); vFokus(); return; }
    const pk = e.target.closest("[data-pkrit]");
    if (pk) { palKrit = pk.dataset.pkrit; return risovat(); }
    const pd = e.target.closest("[data-pdef]");
    if (pd) { palDefekt = pd.dataset.pdef; return risovat(); }
    if (e.target.closest("#palGo")) { palStart(); return; }
    const kr = e.target.closest("[data-krit]");
    if (kr) { krit = kr.dataset.krit; oshibkaAkta = ""; return risovat(); }
    const d = e.target.closest("[data-def]");
    if (d) { defekt = d.dataset.def; oshibkaAkta = ""; return risovat(); }
    if (e.target.closest("#aktPsGo")) aktirovat();
  });
})();
