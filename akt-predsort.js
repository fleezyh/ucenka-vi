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
  const box = document.getElementById("aktPs");
  if (!box) return;
  // 30.09 вечер, дизайн C «приборная панель» (Степан: «всё крупнее, на экране сразу
  // видно всё»): что это — в центре (#aktPs), что с этим делать — в правой панели
  // (#aktDey, её строит pikalka-c.js). Нет панели (старый слой, /tsd/) — одним куском.
  const deyEl = () => document.getElementById("aktDey");
  function vyvesti(glav, dey) {
    const d = deyEl();
    if (!d) { box.innerHTML = glav + (dey || ""); return; }
    box.innerHTML = glav;
    d.innerHTML = dey || "";
    d.hidden = !dey;
  }
  function spryatatDey() { const d = deyEl(); if (d) { d.innerHTML = ""; d.hidden = true; } }
  // Обработчики — на документе, но только для кликов внутри центра или панели.
  const vPaneli = (e) => e.target && e.target.closest && e.target.closest("#aktPs, #aktDey");
  const naPaneli = (tip, fn) => document.addEventListener(tip, (e) => { if (vPaneli(e)) fn(e); });
  // 08.10: строки истории в ленте на главной (#cLenta, вне панели) — открыть акт или паллету
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest("#cLenta")) return;
    const ao = e.target.closest("[data-akt-otkryt]");
    if (ao) { otkrytAkt(ao.dataset.aktOtkryt); return; }
    const po = e.target.closest("[data-pal-otkryt]");
    if (po) otkrytPalletu(po.dataset.palOtkryt);
  });
  const vPanelyah = (sel) => [...document.querySelectorAll(sel)].filter((x) => x.closest("#aktPs, #aktDey"));
  const shapkaDey = (chto, imya, dop = "") => `<div class="cDey__shapka"><span class="cDey__chto">${chto}</span>
    <b class="cDey__imya">${esc(imya)}</b>${dop}</div>`;
  // 29.09 ночь, Степан: «WMS это всё равно другая страница, а не анимация
  // улучшенной пикалки». Теперь скрипт живёт и на /picker/, но спит, пока режим
  // выключен; включает его переключатель событием «wms:vkl» — без перезагрузки.
  // Адрес /picker/wms остаётся (ссылки, закладки): с него режим включён сразу.
  let aktivno = false;

  /* Режим WMS (27.09 площадка; 29.09 вечер Степан: «это не другая страница, а
     режим — мощный»). Раньше площадка прятала вкладки, справочник и поиск по
     названию и сама включала «Предсорт» — выглядело как отдельная страница.
     Теперь пикалка остаётся целиком, режим только добавляет под полем, что
     можно пикнуть, строку входа в WMS и действия. */
  function ploshchadka() {
    document.body.classList.add("vmsRezhimVkl");
    document.title = "WMS · Пикалка";
    const scan = document.getElementById("scan");
    const podpis = () => { if (scan && !scan.disabled && !/CON|CEL/.test(scan.placeholder) && !document.body.classList.contains("aTsd")) scan.placeholder = "штрихкод, CON …, CEL … или ACT …"; };
    [300, 1500, 4000, 9000].forEach((t) => setTimeout(podpis, t));
    const ryad = document.querySelector(".searchCard .searchRow");
    // 30.09, дизайн A (Степан выбрал из трёх макетов): под строкой скана «прорастают»
    // три чипа — что ещё можно пикнуть в WMS, — а справа вход и массовый пик.
    // Чипы проявляет слайдер (pikalka-a.js, --k), здесь только разметка.
    if (ryad && !document.getElementById("vmsVozm")) {
      const chip = (kod, chto, dalshe, primer) => `<button type="button" class="aChip" data-primer="${primer}"><code>${kod}</code>${chto}<span>— ${dalshe}</span></button>`;
      ryad.insertAdjacentHTML("afterend", `<div class="aWrow" id="vmsVozm">
          <div class="aChips">${chip("CON", "паллета", "состав, акт, куда", "CON 0163233250")}${chip("CEL", "ячейка", "что лежит", "CEL 3923168")}${chip("ACT", "акт", "чей, где штука", "ACT 0005263917")}</div>
          <div class="aWho" id="vmsPolosa"></div>
        </div><div class="aVhod" id="vmsVhod"></div>`);
      document.getElementById("vmsVozm").addEventListener("click", (e) => {
        const kn = e.target.closest("[data-primer]");
        if (!kn || !scan) return;
        scan.placeholder = "например: " + kn.dataset.primer;
        scan.focus();
      });
    }
  }
  function ubratPloshchadku() {
    document.body.classList.remove("vmsRezhimVkl");
    document.title = "Уценка · Пикалка";
    document.getElementById("vmsVozm")?.remove();
    document.getElementById("vmsPolosa")?.remove();
    document.getElementById("vmsVhod")?.remove();
    const scan = document.getElementById("scan");
    if (scan && /CON/.test(scan.placeholder)) scan.placeholder = "Сканируйте штрихкод…";
  }

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
    { k: "некомплект", имя: "Некомплект" },   // 08.10 Шелехов: в акте — комплектность неполная, без «мех. повреждения»
  ];
  let tovar = null;
  // 08.10 Шелехов: «сначала выбрать ячейку, откуда дёргать, потом дефект — а сейчас в конце и как ошибка, и долго».
  // При пике товара сразу спрашиваем вмс, где он на складе стола, пока человек выбирает крит и дефект.
  let otk = null;        // {zhdu} | ответ /__akt/otkuda: на_столе | сам | варианты | уже_акт | нет | ошибка
  let otkVybor = null;   // откуда взял: вариант (кнопка), {id} (пикнул CEL) или {контейнер} (пикнул CON)
  let svezhiy = null;    // только что созданный акт — крупно наверху его карточки, с печатью
  let reshenie = "";
  let aktVsyo = false;        // акт по штуке, даже если решение его не требует (30.09)
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
  let zametkaAkta = "";   // 06.10: что сервер сделал до акта (перенёс из буфера входа на стол)

  function zagruzitSostoyanie() {
    fetch("/__akt/sostoyanie", { cache: "no-store" }).then((o) => o.ok ? o.json() : {})
      .then((d) => {
        boevoy = Boolean(d.включена);
        obshchiyMozhno = Boolean(d.общий_можно);
        vms = d.вмс || d.WMS || { подключено: false };   // сервер отдаёт «вмс»: с «WMS» плашка всегда была «не вошли»
        risovat();
      })
      .catch(() => {});
  }

  // 29.09 Степан: «с запретом действий до входа в ВМС» — без личного входа
  // кнопки действий закрыты, а не отправляют и потом просят войти.
  const vhod = () => vms.подключено || obshchiyMozhno;

  // «Рысаков Степан Максимович» → «Рысаков С. М.»: в плашке нужна фамилия.
  const korotko = (fio) => {
    const s = String(fio || "").trim().split(/\s+/);
    return s.length >= 2 ? `${s[0]} ${s.slice(1, 3).map((w) => w[0] + ".").join(" ")}` : String(fio || "");
  };

  function plashkaVms() {
    // На площадке WMS вход уже виден строкой под полем — в карточке не дублируем (29.09).
    if (document.getElementById("vmsPolosa")) return "";
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
    const katT = tovar && window.PalletaProdazh ? (window.PalletaProdazh(tovar.rubric, tovar.cluster, tovar.rrc, tovar.name, krit) || {}).imya : "";
    return `<div class="aktPs__palleta">
      <p class="aktPs__zag">Куда положили</p>
      <p class="aktPs__podskaz">${perIdet ? "Создаю перемещение…" : `Пикните наклейку паллеты в «${esc(zhdemPalletu.ishod.куда)}» (CON …)`}</p>
      <form class="aktPs__vhod aktPs__palForma" id="aktPalForma" autocomplete="off">
        <input name="kod" placeholder="или введите номер паллеты" inputmode="numeric">
        <button class="aktPs__kn is-on" type="submit"${perIdet ? " disabled" : ""}>Переместить</button>
      </form>
      ${perIdet ? "" : knopkiNovoy(katT)}
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
  // На другой склад заказом ДБ (29.09, задача Гамлета: форма вмс берёт только брак).
  // null | { idet } | { predv } | { gotovo } | { oshibka }
  let palDb = null;
  // 07.10 Сверка паллеты (служба контроля сверяет контейнеры с ВМС руками в книге «Ошибки ДРП»; Степан: «всё в
  // одном, отдельный блок не надо — для всех»): вкладка панели паллеты. Пока она открыта, пик акта не уводит с
  // паллеты, а отмечает штуку. sverka: { pid, imya, nashli: Map(ключ строки → штук), lishnie: [], kat: Map(акт →
  // {…}), zhdut, posl, itog }.
  let palTab = "";
  let palNetZapisano = new Set();   // строки, по которым уже записали «нет в паллете»
  let palNetItog = null;            // { zag, str[] } — что записали и кто виноват
  // 07.10 ночь Степан: «а если надо туда добавить товар, который нашёлся, а его нет по акту? с возможностью найти
  // его и принудительно перенести». { kod, zhdu, karta, oshibka, zapisat, idet, vopros, itog }
  let izl = null;
  let zhdemSverku = false;   // 07.10 «а где сверка»: нажали «Сверка» в меню — следующая паллета открывается на ней
  let sverka = null;
  let sverkaPosl = null;   // прошлая сверка этой паллеты — с сервера
  const IMYA_MARSHRUTA = { ДАНИЛОВО: "в Данилово", "СЦ-ДМД": "на СЦ-ДМД", ДОМОДЕДОВО: "в ДМД (РЦ)" };
  // Выбор части паллеты (29.09, «надо добавить выбор части паллет»): ключи строк.
  let palVybor = null;
  // Выбор «как в таблице» (30.09 ночь): поиск по списку, Shift+клик — диапазон, «первые N».
  let palPoisk = "";
  let palPosledniy = null;   // ключ последней кликнутой галки — начало диапазона для Shift
  const palNaydeno = () => {
    const q = palPoisk.trim().toLowerCase();
    if (!pal) return [];
    if (!q) return pal.строки;
    const slova = q.split(/\s+/);
    return pal.строки.filter((x) => {
      const t = `${x.товар} ${x.акт || ""} ${x.качество || ""} ${x.без_акта ? "без акта" : ""} ${x.рубрика || ""}`.toLowerCase();
      return slova.every((w) => t.includes(w));
    });
  };
  // Свой дефект (29.09, встреча): «погнут» на весь ГСМ одним текстом во все акты.
  let palSvoy = "";
  let svoyDefekt = "";
  const vybrano = () => (pal ? pal.строки.filter((x) => !palVybor || palVybor.has(x.ключ)) : []);
  const vseVybrany = () => !pal || !palVybor || pal.строки.every((x) => palVybor.has(x.ключ));
  const vyborDlyaServera = () => (vseVybrany() ? null : vybrano().map((x) => x.ключ));
  const bezAktaVybrano = () => vybrano().reduce((n, x) => n + (x.без_акта || 0), 0);
  const kartochka = document.getElementById("answer");

  function vRezhimPalety(vkl) {
    if (!kartochka) return;
    kartochka.classList.toggle("is-palleta", vkl);
    if (vkl) kartochka.style.display = "flex";
  }

  // «Сделать в WMS» (28.09): универсальное задание — общий блок с ТСД (wms-deystviya.js).
  function wmsHost() {
    let h = document.getElementById("wmsDHost");
    if (!h) { h = document.createElement("div"); h.id = "wmsDHost"; box.insertAdjacentElement("afterend", h); }
    return h;
  }
  function wmsZakryt() { const h = document.getElementById("wmsDHost"); if (h) h.innerHTML = ""; }
  function wmsUz(opc) {
    if (!window.WmsDeystviya) return;
    const h = wmsHost();
    window.WmsDeystviya.uz(h, { otkuda: "пикалка", ...opc });
    h.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function otkrytPalletu(kod) {
    wmsZakryt();
    pal = null; palKrit = ""; palDefekt = ""; palRabota = null; palOshibka = ""; palPer = null; yach = null;
    aktK = null; istP = null; palVybor = null; palSvoy = ""; palDb = null; palPoisk = ""; palPosledniy = null;
    tovar = null; gotovo = null; zhdemPalletu = null; perItog = null;
    palTab = ""; sverka = null; sverkaPosl = null; palNetZapisano = new Set(); palNetItog = null; izl = null;
    vRezhimPalety(true);
    box.hidden = false;
    vyvesti('<p class="aktPs__chto">Смотрю паллету…</p>', shapkaDey("Паллета", kod));
    palKarta = null;
    // Где стоит, лот и заказы — параллельно составу; не пришло — панель и без них.
    fetch(`/__palleta/karta?kod=${encodeURIComponent(kod)}`, { cache: "no-store" })
      .then((o) => (o.ok ? o.json() : null)).then((d) => { palKarta = d; if (pal) risovat(); }).catch(() => {});
    try {
      const o = await fetch(`/__akt/palleta?kod=${encodeURIComponent(kod)}`, { cache: "no-store" });
      const d = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      pal = d;
      PikIst.dobavit({ vid: "паллета", kod: pal.паллета || kod, n: `${pal.паллета || kod} · ${(pal.строки || []).length} строк${pal.ячейка ? " · " + pal.ячейка : ""}` });
      palVybor = new Set((pal.строки || []).map((x) => x.ключ));
      posledPal = pal.паллета || posledPal;
      if (zhdemSverku) { zhdemSverku = false; palTab = "sverka"; sverkaNachat(); }
      if (pal.паллета_id) {
        chitat(`/__akt/sverka?palleta_id=${encodeURIComponent(pal.паллета_id)}`)
          .then((s) => { if (pal && s.сверка) { sverkaPosl = s.сверка; risovat(); } }).catch(() => {});
      }
    } catch (e) {
      palOshibka = e.message || String(e);
      pal = { паллета: kod, ячейка: "", строки: [], без_акта: 0 };
    }
    risovat();
  }

  async function obnovitSostav() {
    if (!pal) return;
    const kod = String(pal.паллета_id || pal.паллета);
    try {
      const o = await fetch(`/__akt/palleta?kod=${encodeURIComponent(kod)}&_=${Date.now()}`, { cache: "no-store" });
      const d = await o.json().catch(() => ({}));
      if (!o.ok || !pal) return;
      pal = d;
      palVybor = new Set((pal.строки || []).map((x) => x.ключ));
      risovat();
    } catch (e) { /* состав обновится при следующем пике */ }
  }

  function tekstPalGo() {
    const bez = bezAktaVybrano();
    return !boevoy ? "Актировка выключена в админке" : !vhod() ? "Войдите в WMS" : !bez ? "Среди выбранного нет штук без акта"
      : !palKrit ? "Выберите крит или косм" : !palDefekt ? "Выберите дефект" : `Заактировать ${bez} шт`;
  }

  /* 30.09: категория уценки (паллета для продаж) по рубрике — прямо в составе, «по акту он не показывает нихера» */
  function katPal(x) {
    const p = window.PalletaProdazh && (x.рубрика || x.цена) ? window.PalletaProdazh(x.рубрика, "", x.цена, x.товар) : null;
    if (!p) return '<i class="palStroka__nokat">категория —</i>';
    return `<b title="${esc(x.рубрика + (p.pochemu ? " · " + p.pochemu : ""))}">${esc(p.imya)}</b>${p.sporno ? ' <span class="aTag aTag--spor">спорно</span>' : ""}`;
  }

  function risovatPalletu() {
    const vsego = pal.строки.reduce((n, x) => n + x.штук, 0);
    const vkl = (x) => !palVybor || palVybor.has(x.ключ);
    const vidno = palNaydeno();
    // на сверке у каждой строки — отметка: ✓ сверено, 2/5 по штукам без акта, «не та категория»
    const sv = palTab === "sverka" && sverka;
    const svMetka = (x) => {
      if (!sv) return "";
      const est = sverka.nashli.get(x.ключ) || 0;
      const kat = x.акт && sverka.kat.get(String(x.акт));
      return `<span class="palStroka__sv${est >= x.штук ? " is-ok" : est ? " is-chast" : ""}${kat ? " is-kat" : ""}">${kat ? `не та категория → ${esc(kat.нужна)}`
        : est >= x.штук ? "✓ сверено" : est ? `${est} из ${x.штук}` : "не пикнута"}</span>`;
    };
    const spisok = vidno.map((x) => `<label class="palStroka palStroka--vybor${x.без_акта ? " is-bez" : ""}${vkl(x) ? "" : " is-vykl"}">
        <input type="checkbox" data-pvyb="${esc(x.ключ)}"${vkl(x) ? " checked" : ""}${palRabota && palRabota.идёт ? " disabled" : ""}>
        <span class="palStroka__tovar">${esc(x.товар)}${x.качество && !/^брак$/i.test(x.качество) ? ` <i class="palStroka__kach">${esc(x.качество)}</i>` : ""}${svMetka(x)}</span>
        <span class="palStroka__kat">${katPal(x)}</span>
        <span class="palStroka__sht">${x.штук} шт</span>
        <span class="palStroka__akt">${x.акт ? `<button type="button" class="palStroka__aktKn" data-akt-detal="${esc(x.акт)}" title="Акт целиком: что с ним и фото">акт №${x.акт}</button>` : x.уже_нами && !x.без_акта ? "заактировано нами" : "без акта"}</span>
        <button type="button" class="palNet${palNetZapisano.has(x.ключ) ? " is-on" : ""}" data-pal-net="${esc(x.ключ)}" title="Физически на паллете нет — записать ошибку «Недостача»">${palNetZapisano.has(x.ключ) ? "записано: нет" : "нет в паллете"}</button>
      </label>`).join("");
    const shtVybr = vybrano().reduce((n, x) => n + x.штук, 0);
    const bezVybr = bezAktaVybrano();
    const q = palPoisk.trim();
    const panelVybora = pal.строки.length > 1 ? `<div class="palVybor">
        <span>выбрано <b>${shtVybr}</b> из ${vsego} шт${bezVybr ? ` · без акта ${bezVybr}` : ""}</span>
        <button type="button" data-pvsyo="vse">все</button>
        <button type="button" data-pvsyo="bez">только без акта</button>
        <button type="button" data-pvsyo="nichego">снять</button>
      </div>
      <div class="palVybor palVybor--poisk">
        <input id="palPoisk" type="search" autocomplete="off" placeholder="поиск: название, акт, качество…" value="${esc(palPoisk)}">
        ${q ? `<span>найдено <b>${vidno.length}</b> из ${pal.строки.length}</span>
          <button type="button" data-pvnay="tolko">выбрать найденные</button>
          <button type="button" data-pvnay="plus">+ найденные</button>
          <button type="button" data-pvnay="minus">− найденные</button>` : ""}
        <input id="palPervye" type="number" min="1" max="${pal.строки.length}" inputmode="numeric" placeholder="N">
        <button type="button" data-pvnay="pervye">выбрать первые N</button>
        <span class="palVybor__podsk">Shift+клик — выделить диапазон</span>
      </div>` : "";
    let niz;
    if (palOshibka) {
      niz = `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(palOshibka)}</b></p>`;
    } else if (palRabota) {
      const proc = palRabota.всего ? Math.round(100 * palRabota.готово / palRabota.всего) : 0;
      niz = `<div class="palHod"><p class="aktPs__podskaz">${palRabota.идёт ? "Актирую…" : "Готово"} ${palRabota.готово} из ${palRabota.всего}</p>
        <div class="palHod__polosa"><i style="width:${proc}%"></i></div>
        <p class="aktPs__chto">актов создано: ${palRabota.акты.length}${palRabota.ошибки.length ? ` · ошибок: ${palRabota.ошибки.length}` : ""}</p>
        ${palRabota.акты.length ? `<div class="aktPs__nomera" style="display:grid;gap:3px;margin-top:8px;font-size:13px;color:var(--muted)">${palRabota.акты.slice(-12).map((a) => `<p style="margin:0"><b style="color:var(--text);font-feature-settings:'tnum' 1">ACT ${String(a.акт).padStart(10, "0")}</b> — ${esc(a.товар)}</p>`).join("")}${palRabota.акты.length > 12 ? `<p style="margin:0">…и ещё ${palRabota.акты.length - 12} — все номера в журнале актировки</p>` : ""}</div>` : ""}
        ${palRabota.ошибки.slice(-3).map((o) => `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(o.товар)}</b> ${esc(o.ошибка)}</p>`).join("")}
        ${!palRabota.идёт && palRabota.акты.length ? knopkiPechati(palRabota.акты.map((a) => a.акт)) : ""}
        ${palRabota.идёт ? "" : `<p class="aktPs__chto">Пикните следующую паллету или товар.</p>`}</div>`;
    } else if (pal.без_акта) {
      const gotov = palKrit && palDefekt && bezVybr > 0;
      niz = `<p class="aktPs__zag">Крит или косм</p>
        <div class="aktPs__krit">${KRIT.map((x) => `<button type="button" class="aktPs__kn${x.k === palKrit ? " is-on" : ""}" data-pkrit="${x.k}">${x.имя}</button>`).join("")}</div>
        <p class="aktPs__zag">Дефект — один на все выбранные</p>
        <div class="aktPs__defekty">${DEFEKTY.map((d) => `<button type="button" class="aktPs__kn aktPs__kn--def${d.k === palDefekt && !palSvoy ? " is-on" : ""}" data-pdef="${esc(d.k)}">${esc(d.имя)}</button>`).join("")}</div>
        <input class="aktPs__svoy" id="palSvoy" maxlength="80" autocomplete="off" placeholder="или свой дефект — одним текстом во все акты" value="${esc(palSvoy)}">
        <button type="button" class="aktPs__akt" id="palGo"${gotov && boevoy && vhod() ? "" : " disabled"}>${tekstPalGo()}</button>
        <p class="aktPs__chto">Внутренний брак · качество брак · «мех. повреждения, ${esc(palDefekt || "…")}${palKrit ? ", " + palKrit : ""}» · исходная ячейка и паллета — где лежит</p>`;
    } else {
      niz = `<p class="aktPs__chto">На паллете нет штук без акта.</p>`;
    }
    const est = Boolean(deyEl());
    const glav = `${palNetItog ? `<div class="aktPs__gotovo palNetItog"><b>${esc(palNetItog.zag)}</b>${palNetItog.str.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
      <header class="aktPs__shapka">
        <div><p class="aktPs__nad">${esc(pal.паллета)}</p>
          <p class="aktPs__rezhim">${esc(pal.ячейка || "")}${vsego ? ` · без акта ${pal.без_акта} шт из ${vsego}` : ""}</p></div>
        ${est ? "" : plashkaVms()}
      </header>${est ? "" : formaVms()}
      ${blokKarty()}
      ${est ? "" : blokPeremeshcheniya() + blokDb()}
      ${blokIstorii()}
      ${pal.строки.length ? `${panelVybora}${spisok ? `<div class="palSpisok">${spisok}</div>` : `<p class="aktPs__chto">По «${esc(q)}» в составе ничего нет.</p>`}` : ""}
      ${blokIzlishka()}
      ${est ? "" : niz}`;
    if (!est) { box.innerHTML = glav; return; }
    const tab = palTab === "sverka" ? "sverka" : palPer ? "per" : palDb ? "db" : "akt";
    const zanyato = (palPer && palPer.idet) || (palDb && palDb.idet) || (palRabota && palRabota.идёт);
    // 06.10 Бершацкая: «в пикалке удалилась кнопка принять» — «Принять» было только у списка паллет (масс. пик);
    // у одной паллеты — та же кнопка, ведёт в тот же приём с этой паллетой.
    // 07.10: «Сверка» — пятой вкладкой, остальные четыре не меняются.
    // 07.10 ночь Степан: «сверка не нужна — должно быть "этого товара нет в паллете"» — вкладку убрали, у строк кнопка
    const vkladki = [["akt", `Акт${bezVybr ? ` · <em>${bezVybr}</em>` : ""}`], ["per", "Переместить"], ["db", "На склад"], ["priyom", "Принять"]];
    vyvesti(glav, `${shapkaDey("Паллета", pal.паллета, `<span class="cDey__pod">${vseVybrany() ? `${vsego} шт` : `выбрано ${shtVybr} из ${vsego} шт`}</span>`)}
      ${plashkaVms()}${formaVms()}
      <div class="cSeg">${vkladki.map(([k, t]) => `<button type="button" class="${k === tab ? "is-on" : ""}" data-ptab="${k}"${zanyato && k !== tab ? " disabled" : ""}>${t}</button>`).join("")}</div>
      <div class="cDey__telo">${tab === "sverka" ? blokSverki() : tab === "per" ? blokPeremeshcheniya() : tab === "db" ? blokDb() : niz}</div>
      <div class="cDey__niz"><button type="button" class="aktPs__kn" data-pkk="istoriya">История</button>
        <button type="button" class="aktPs__kn" data-pkk="uz">Задание</button></div>`);
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
      ${deyEl() ? "" : `<div class="palKartaAkt__glav">
        <button type="button" class="aktPs__kn" data-pkk="peremestit"${palPer ? " disabled" : ""}>${vseVybrany() ? "Переместить паллету" : "Переместить выбранное"}</button>
        <button type="button" class="aktPs__kn" data-pkk="db"${palDb ? " disabled" : ""}>На другой склад</button>
        <button type="button" class="aktPs__kn" data-pkk="istoriya">История</button>
        <button type="button" class="aktPs__kn" data-pkk="uz">Универсальное задание</button>
      </div>`}
      <div class="palKartaAkt__mel">
        <button type="button" data-pkk="excel">Состав в Excel</button>
        <button type="button" data-pkk="kopir">Копировать</button>
        ${k ? `<a href="${esc(k.вмс || k.WMS)}" target="_blank" rel="noopener">Открыть в WMS</a>` : ""}
      </div>
    </div>`;
  }

  // Варианты «куда» — ячейки из решений столов (сервер присылает с составом паллеты).
  function variantyKuda(atr) {
    const v = (pal && pal.куда_варианты) || kudaVarianty || [];
    if (!v.length) return "";
    return `<div class="kudaVarianty">${v.map((x) => `<button type="button" class="aktPs__kn" ${atr}="${esc(x.код)}" title="${esc(x.решения)}">
      <b>${esc(x.ячейка)}</b><small>${esc(x.решения)}</small></button>`).join("")}</div>`;
  }
  let kudaVarianty = null;

  function blokDb() {
    if (!palDb) return "";
    const p = palDb;
    let telo = "";
    if (p.idet) {
      telo = `<p class="aktPs__podskaz">${p.idet}</p>`;
    } else if (p.predv) {
      const d = p.predv;
      const oshibki = d.ошибки_вмс ? Object.entries(d.ошибки_вмс).map(([k, v]) => `${k}: ${[].concat(v).join(", ")}`).join("; ") : "";
      const kach = Object.entries(d.по_качеству || {}).map(([k, n]) => `${esc(k.toLowerCase())} ${n}`).join(" · ");
      const marshruty = (d.куда_можно || []).length > 1 ? `<div class="aktPs__krit">${d.куда_можно.map((k) =>
        `<button type="button" class="aktPs__kn${k === d.куда ? " is-on" : ""}" data-db-kuda="${esc(k)}">${esc(IMYA_MARSHRUTA[k] || k)}</button>`).join("")}</div>` : "";
      const vkl = d.создание_включено !== false;
      // 30.09 ночь: форма брака берёт паллету, только если на ней один брак — остальное сначала
      // уезжает на другую паллету в той же ячейке (пикнуть её).
      const nb = d.не_брак || [];
      const nbSpisok = nb.length ? `<div class="aktPs__net"><b>Не брак — ${nb.length} шт. Переведу в «Брак» инвентаризацией (пересорт по тому же акту), паллета уйдёт целиком:</b>
        ${nb.slice(0, 6).map((x) => `<span>${esc(x.товар)} · ${esc(String(x.качество || "").toLowerCase())}${x.акт ? ` · акт ${esc(x.акт)}` : ""}</span>`).join("")}${nb.length > 6 ? `<span>…и ещё ${nb.length - 6}</span>` : ""}
        ${d.паллета_для_небрака ? `<span>→ переложу на <b>${esc(d.паллета_для_небрака)}</b>, потом заказ ДБ на брак</span>` : ""}</div>` : "";
      const nbForma = d.стоп_небрак ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(d.стоп_небрак)}</b></p>` : d.нужна_паллета_для_небрака ? `<p class="aktPs__podskaz">Пикните паллету для не-брака (CON …) — она должна стоять в этой же ячейке:</p>
        <form class="aktPs__vhod aktPs__palForma" id="palNbForma" autocomplete="off">
          <input name="kod" placeholder="номер паллеты" inputmode="numeric" autofocus>
          <button class="aktPs__kn is-on" type="submit">Дальше</button>
        </form>` : "";
      telo = `<p class="aktPs__podskaz">${esc(d.паллета)} · ${esc(d.откуда)}${d.куда ? ` → <b>${esc(d.база_куда)}</b> · через «${esc(d.ячейка_отгрузки)}» · поток ${esc(d.поток)}` : " — куда везём?"}</p>
        ${marshruty}
        ${d.разорвана ? `<p class="aktPs__podskaz">Паллета разорвана: ${d.разорвана.уже_на_месте} шт уже на ${esc(d.разорвана.где)} — их не трогаю, везу остаток ${d.разорвана.остаток} шт с ${esc(d.разорвана.откуда)}.</p>` : ""}
        <p class="aktPs__chto">${d.паллет > 1 ? `${d.паллет} паллет · ` : ""}${d.строк} строк · ${d.штук} шт${kach ? ` · ${kach}` : ""}${d.уже_в_заказе ? ` · ${d.уже_в_заказе} строк уже в заказе — пропущены` : ""}</p>
        ${(d.снимутся_с_заказов || []).length ? `<p class="aktPs__podskaz">${d.снимутся_штук || d.снимутся_с_заказов.length} шт в старых заказах — сайт снимет с них резерв во ВТИС и повезёт: ${esc(d.снимутся_с_заказов.join(", "))}</p>` : ""}
        ${oshibki ? `<p class="aktPs__net"><b class="aktPs__oshibka">WMS не примет: ${esc(oshibki)}</b></p>` : ""}
        ${nbSpisok}${nbForma}
        ${d.куда === "ДОМОДЕДОВО" && d.откуда === "СЦ - ДОМОДЕДОВО" && vseVybrany() && !d.нужна_паллета_для_небрака && !d.стоп_небрак ? `<div class="aktPs__vopros">
          <button type="button" class="aktPs__kn is-on" data-pkk="scdmd"${oshibki || !boevoy || !vhod() || !vkl ? " disabled" : ""}>${!vkl ? "Создание пока не включено" : !boevoy ? "WMS выключена" : !vhod() ? "Войдите в WMS" : "Перенести на ДМД — весь круг"}</button>
        </div>
        <p class="aktPs__chto">Сайт сам сделает то, что Гамлет делает руками: заказ ДБ → отбор с контейнером → задание и внутренняя отгрузка → задание и внутреннее поступление. Паллета встанет в «Брак из СЦ (ДМД)». До пары минут. Встанет на каком-то шаге — покажу где, дальше руками в WMS.</p>` : ""}
        ${d.куда && !d.нужна_паллета_для_небрака && !d.стоп_небрак ? `<div class="aktPs__vopros">
          <button type="button" class="aktPs__kn${d.откуда === "СЦ - ДОМОДЕДОВО" ? "" : " is-on"}" data-pkk="db-da"${oshibki || !boevoy || !vhod() || !vkl ? " disabled" : ""}>${!vkl ? "Создание пока не включено" : !boevoy ? "WMS выключена" : !vhod() ? "Войдите в WMS" : nb.length ? "Перевести в брак и создать заказ ДБ" : d.откуда === "СЦ - ДОМОДЕДОВО" ? "Только заказ ДБ (дальше руками)" : "Создать заказ ДБ и отбор"}</button>
          <button type="button" class="aktPs__kn" data-pkk="db-net">Отмена</button>
        </div>
        <p class="aktPs__chto">${d.можно ? "Форма брака WMS нашла все штуки. " : ""}Заказ и задание на отбор создаёт форма «Формирование внутренних перемещений брака». Дальше по регламенту: отбор «Создать перемещение с контейнером», задание на внутреннюю отгрузку, «Отгрузить», приёмка.</p>` : ""}`;
    } else if (p.scdmd) {
      const x = p.scdmd, dk = x.документы || {};
      const VMS = "https://wms.vseinstrumenti.ru/Document/";
      const ssylki = [["заказ", dk.заказ_id ? `${VMS}DocShipmentOrder/update?id=${dk.заказ_id}` : "", dk.заказ],
        ["отбор", dk.отбор ? `${VMS}docMovement/update?id=${dk.отбор}` : "", dk.отбор],
        ["задание на отгрузку", dk.задание_отгрузки ? `${VMS}DocInternalShipmentTask/update?id=${dk.задание_отгрузки}` : "", dk.задание_отгрузки],
        ["отгрузка", dk.отгрузка ? `${VMS}DocInternalShipment/update?id=${dk.отгрузка}` : "", dk.отгрузка],
        ["задание на поступление", dk.задание_поступления ? `${VMS}DocInternalPurchaseTask/update?id=${dk.задание_поступления}` : "", dk.задание_поступления],
        ["поступление", dk.поступление ? `${VMS}DocInternalPurchase/update?id=${dk.поступление}` : "", dk.поступление]]
        .filter((r) => r[2]).map((r) => `<span>${r[0]}: ${r[1] ? `<a href="${esc(r[1])}" target="_blank" rel="noopener">${esc(r[2])}</a>` : esc(r[2])}</span>`).join("");
      telo = x.готово
        ? `<div class="aktPs__gotovo"><b>Перенесено на ДМД${dk.встал ? ` · стоит в «${esc(dk.встал)}»` : ""}</b>${ssylki}</div>`
        : `<p class="aktPs__net"><b class="aktPs__oshibka">Встало на шаге «${esc(x.shag)}»: ${esc(x.ошибка || "")}</b></p>
           ${ssylki ? `<div class="aktPs__net"><b>Уже сделано — дальше руками в WMS с этого шага:</b>${ssylki}</div>` : ""}
           <button type="button" class="aktPs__kn" data-pkk="db-net">Закрыть</button>`;
    } else if (p.gotovo) {
      telo = `<div class="aktPs__gotovo"><b>Заказ ${esc(p.gotovo.номер)} и задание на отбор созданы${p.gotovo.задание_id ? ` · отбор №${esc(p.gotovo.задание_id)}` : ""}</b>
        ${p.gotovo.смена_качества ? `<span>в «Брак» переведено ${(p.gotovo.не_брак || []).length} шт — инвентаризация ${esc(p.gotovo.смена_качества.map((x) => x.инвентаризация).join(", "))}</span>` : ""}
        ${p.gotovo.без_задания ? `<span class="aktPs__oshibka">${esc(p.gotovo.без_задания)}</span>` : ""}
        <span>${esc(p.gotovo.паллета)} → ${esc(p.gotovo.куда)} · ${p.gotovo.строк} строк · ${p.gotovo.штук} шт · дальше задание на отбор в ячейку отгрузки</span>
        ${p.gotovo.вмс ? `<a href="${esc(p.gotovo.вмс)}" target="_blank" rel="noopener">открыть в WMS</a>` : ""}</div>`;
    } else if (p.oshibka) {
      telo = `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(p.oshibka)}</b></p>
        <button type="button" class="aktPs__kn" data-pkk="db-net">Закрыть</button>`;
    }
    return `<div class="aktPs__palleta palPer"><p class="aktPs__zag">${vseVybrany() ? "Паллета" : "Выбранное"} на другой склад — заказ ДБ</p>${telo}</div>`;
  }

  let dbKuda = "";
  let dbNeBrak = "";
  async function scDmd() {
    palDb = { idet: "Переношу на ДМД: заказ ДБ → отбор → отгрузка → поступление — до пары минут, не закрывайте…" };
    risovat();
    try {
      const o = await fetch("/__akt/palleta/sc_dmd", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: String(pal.паллета_id || pal.паллета), сохранить: true }),
      });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaPolosy = true; oshibkaVhoda = "войдите в WMS и нажмите ещё раз"; palDb = null; risovat(); return; }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      palDb = { scdmd: d };
      if (d.готово) { obnovitSostav(); if (navigator.vibrate) navigator.vibrate(150); }
    } catch (e) {
      palDb = { oshibka: e.message || String(e) };
    }
    risovat();
  }
  async function zakazDb(sohranit) {
    palDb = { idet: sohranit ? (palDb && palDb.predv && (palDb.predv.не_брак || []).length
      ? "Перевожу не-брак в брак (перемещение, инвентаризация, обратно) и создаю заказ ДБ — до минуты…" : "Создаю заказ ДБ в WMS…")
      : "Проверяю в WMS — до полуминуты…" };
    risovat();
    try {
      const o = await fetch("/__akt/palleta/zakaz_db", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: String(pal.паллета_id || pal.паллета), строки: vyborDlyaServera(), куда: dbKuda, паллета_небрак: dbNeBrak, сохранить: sohranit }),
      });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaPolosy = true; oshibkaVhoda = "войдите в WMS, потом «Создать заказ ДБ» ещё раз"; palDb = null; risovat(); return; }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      palDb = d.готово ? { gotovo: d } : { predv: d };
      if (d.готово) obnovitSostav();
      if (d.готово && navigator.vibrate) navigator.vibrate(150);
    } catch (e) {
      palDb = { oshibka: e.message || String(e) };
    }
    risovat();
    vFokus();
  }

  function blokPeremeshcheniya() {
    if (!palPer) return "";
    const p = palPer;
    let telo = "";
    if (p.zhdem) {
      telo = `<p class="aktPs__podskaz">Пикните наклейку ячейки, куда везёте (CEL …), или выберите:</p>
        ${variantyKuda("data-per-kuda")}
        <form class="aktPs__vhod aktPs__palForma" id="palPerForma" autocomplete="off">
          <input name="kod" placeholder="или номер ячейки" inputmode="numeric">
          <button class="aktPs__kn is-on" type="submit">Дальше</button>
        </form>`;
    } else if (p.zhdemPal) {
      telo = `<p class="aktPs__podskaz">Часть паллеты → <b>${esc(p.yach)}</b>. Пикните паллету, на которую перекладываете (CON …)</p>
        <form class="aktPs__vhod aktPs__palForma" id="palNaPalForma" autocomplete="off">
          <input name="kod" placeholder="или номер паллеты" inputmode="numeric">
          <button class="aktPs__kn is-on" type="submit">Дальше</button>
        </form>`;
    } else if (p.idet) {
      telo = `<p class="aktPs__podskaz">${p.idet}</p>`;
    } else if (p.predv) {
      const d = p.predv;
      const oshibkiVms = d.ошибки_вмс || d.ошибки_WMS;   // сервер отдаёт «ошибки_вмс» — по «ошибки_WMS» отказ вмс не показывался
      const oshibki = oshibkiVms ? Object.values(oshibkiVms).flat().join("; ") : "";
      telo = `<p class="aktPs__podskaz">${esc(d.откуда.join(", "))} → <b>${esc(d.куда)}</b>${d.на_паллету ? ` · на паллету <b>${esc(d.на_паллету)}</b>` : ""}</p>
        <p class="aktPs__chto">${esc(d.склад)} · ${d.строк} строк · ${d.штук} шт${d.в_заказах ? ` · резерв ${d.в_заказах} заказа(ов) едет с товаром` : ""}</p>
        ${oshibki ? `<p class="aktPs__net"><b class="aktPs__oshibka">WMS не примет: ${esc(oshibki)}</b></p>` : ""}
        <div class="aktPs__vopros">
          <button type="button" class="aktPs__kn is-on" data-pkk="per-da"${oshibki || !boevoy || !vhod() ? " disabled" : ""}>${!boevoy ? "Актировка выключена" : !vhod() ? "Войдите в WMS" : "Переместить"}</button>
          <button type="button" class="aktPs__kn" data-pkk="per-net">Отмена</button>
        </div>`;
    } else if (p.gotovo) {
      telo = `<div class="aktPs__gotovo"><b>Перемещение${p.gotovo.перемещение ? ` №${esc(p.gotovo.перемещение)}` : ""} создано черновиком</b>
        <span>${esc(p.gotovo.паллета)} → ${esc(p.gotovo.куда)} · ${p.gotovo.строк} строк</span></div>`;
    } else if (p.oshibka) {
      telo = `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(p.oshibka)}</b></p>
        <button type="button" class="aktPs__kn" data-pkk="per-net">Закрыть</button>`;
    }
    return `<div class="aktPs__palleta palPer"><p class="aktPs__zag">${vseVybrany() ? "Переместить паллету" : "Переместить выбранное"}</p>${telo}</div>`;
  }

  async function peremestitPalletu(yach, sohranit, naPal = "") {
    // Часть паллеты едет только на другую паллету — сначала спросим её.
    if (!vseVybrany() && !naPal) { palPer = { zhdemPal: true, yach }; risovat(); vFokus(); return; }
    palPer = { idet: sohranit ? "Создаю перемещение в WMS…" : "Проверяю в WMS — до полуминуты…", yach, naPal };
    risovat();
    try {
      const o = await fetch("/__akt/palleta/peremestit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: String(pal.паллета_id || pal.паллета), ячейка: yach, сохранить: sohranit,
          строки: vyborDlyaServera(), на_паллету: naPal || "" }),
      });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом «Переместить» ещё раз"; palPer = { predv: palPer.predv || null, yach }; risovat(); return; }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      palPer = d.готово ? { gotovo: d } : { predv: d, yach, naPal };
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

  // ---------------- Сверка паллеты (07.10) ----------------
  // Колонки — как в книге «Ошибки ДРП» службы контроля, чтобы строки можно было вставить к ним как есть.
  const SVERKA_KOL = ["Дата нарушения", "Номер контейнера", "Номер акта", "Товар", "Стоимость сайт", "Программное размещение",
    "Вид ошибки", "ДВК ГРУ", "Виновный", "Комментарий"];
  const sverkaVsego = () => (pal ? pal.строки.reduce((n, x) => n + x.штук, 0) : 0);
  const sverkaNashli = () => (sverka ? [...sverka.nashli.values()].reduce((n, v) => n + v, 0) : 0);
  const nomerAkta = (kod) => { const m = String(kod || "").match(/(\d{5,12})\s*$/); return m ? String(Number(m[1])) : ""; };
  const gdeStr = (g) => (g && g.length ? g.map((x) => [x.ячейка, x.паллета].filter(Boolean).join(" · ")).join("; ") : "нигде не числится");
  const zvukPik = (vid) => { if (window.pikalkaZvuk) setTimeout(() => window.pikalkaZvuk(vid), 280); };
  function sverkaNachat() {
    sverka = { pid: pal.паллета_id || null, imya: (palKarta && palKarta.паллета) || pal.паллета, nashli: new Map(),
      lishnie: [], kat: new Map(), zhdut: 0, posl: "", itog: null };
  }

  async function sverkaAkt(kod) {
    if (!sverka) sverkaNachat();
    if (sverka.itog) { sverka.posl = "сверка закончена — «Новая сверка», чтобы начать заново"; zvukPik("oshibka"); risovat(); return; }
    const akt = nomerAkta(kod);
    if (!akt) return;
    const x = pal.строки.find((s) => s.акт && String(s.акт) === akt);
    if (x && sverka.nashli.get(x.ключ)) { sverka.posl = `акт ${akt} уже отмечен`; zvukPik("oshibka"); risovat(); return; }
    if (!x && sverka.lishnie.some((l) => String(l.акт) === akt)) { sverka.posl = `акт ${akt} уже в излишках`; zvukPik("oshibka"); risovat(); return; }
    if (x) { sverka.nashli.set(x.ключ, x.штук || 1); sverka.posl = `✓ ${x.товар}`; zvukPik("ok"); }
    sverka.zhdut += 1; risovat();
    try {
      // свой акт — проверить категорию; чужой — где числится по ВМС и кто клал
      const d = await chitat(`/__akt/sverka/akt?kod=${encodeURIComponent(kod)}&palleta=${encodeURIComponent(sverka.imya)}`);
      if (x || d.на_этой) {
        if (!x) { sverka.nashli.set(`акт ${akt}`, 1); sverka.posl = `✓ ${d.товар} (появился в ВМС после открытия)`; zvukPik("ok"); }
        if (d.подходит === false) {
          sverka.kat.set(akt, { акт: akt, товар: d.товар, нужна: d.категория, кто: d.кто, цена: d.цена });
          sverka.posl = `не та категория: ${d.товар} → нужна «${d.категория}»`; zvukPik("oshibka");
        }
      } else {
        sverka.lishnie.push({ акт: akt, товар: d.товар, где: d.где, кто: d.кто, цена: d.цена, вид: d.принят ? "Излишек" : "Не принят в ВМС" });
        sverka.posl = `${d.принят ? "излишек" : "не принят в ВМС"}: ${d.товар}`; zvukPik("oshibka");
      }
    } catch (e) {
      if (!x) sverka.lishnie.push({ акт: akt, товар: "", где: [], кто: null, вид: "Излишек", комм: `ВМС не ответила: ${e.message || e}` });
    } finally {
      sverka.zhdut -= 1; risovat();
    }
  }

  // Штука без акта — по штрихкоду товара: засчитываем в строку «без акта» с тем же названием.
  function sverkaTovar(t) {
    if (!sverka) sverkaNachat();
    if (sverka.itog) return;
    const imya = String(t.name || "").trim();
    const x = pal.строки.find((s) => !s.акт && s.товар === imya && (sverka.nashli.get(s.ключ) || 0) < s.штук);
    if (x) {
      sverka.nashli.set(x.ключ, (sverka.nashli.get(x.ключ) || 0) + 1);
      sverka.posl = `✓ ${imya} — без акта, ${sverka.nashli.get(x.ключ)} из ${x.штук}`; zvukPik("ok");
    } else if (pal.строки.some((s) => s.акт && s.товар === imya)) {
      sverka.posl = `«${imya}» на паллете с актом — пикните наклейку акта`; zvukPik("oshibka");
    } else {
      sverka.lishnie.push({ акт: "", товар: imya, где: [], кто: null, цена: t.price || "", вид: "Излишек", комм: "без акта, по штрихкоду" });
      sverka.posl = `излишек без акта: ${imya}`; zvukPik("oshibka");
    }
    risovat();
  }

  function sverkaStroka(vid, o) {
    return { "Дата нарушения": new Date().toLocaleDateString("ru-RU"), "Номер контейнера": sverka.imya, "Номер акта": o.акт || "",
      "Товар": o.товар || "", "Стоимость сайт": o.цена || "", "Программное размещение": o.размещение || "", "Вид ошибки": vid,
      "ДВК ГРУ": "", "Виновный": o.кто ? o.кто.кто : "", "Комментарий": o.комм || "" };
  }

  async function sverkaKonec() {
    const stroki = [];
    sverka.lishnie.forEach((l) => stroki.push(sverkaStroka(l.вид, { ...l, размещение: gdeStr(l.где),
      комм: l.комм || (l.кто ? `перекладывал(а) пикалкой ${l.кто.когда} на ${l.кто.паллета}` : "") })));
    sverka.kat.forEach((k) => stroki.push(sverkaStroka("Ошибка Категории", { ...k, размещение: sverka.imya, комм: `нужна «${k.нужна}»` })));
    pal.строки.forEach((x) => {
      const est = sverka.nashli.get(x.ключ) || 0;
      if (est < x.штук) stroki.push(sverkaStroka("Недостача", { акт: x.акт || "", товар: x.товар, цена: x.цена, размещение: sverka.imya,
        комм: x.акт ? "" : `без акта: нет ${x.штук - est} из ${x.штук}` }));
    });
    sverka.zhdut += 1; risovat();
    try {
      const o = await fetch("/__akt/sverka", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: sverka.imya, паллета_id: sverka.pid, всего: sverkaVsego(),
          совпало: Math.min(sverkaNashli(), sverkaVsego()), строки: stroki }) });
      const d = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      sverka.itog = d.строки || stroki;
      sverka.posl = "";
      sverkaPosl = { когда: "только что", кто: "вы", всего: sverkaVsego(), совпало: Math.min(sverkaNashli(), sverkaVsego()), ошибок: stroki.length };
    } catch (e) {
      sverka.itog = stroki;
      sverka.posl = `на сервере не сохранилось (${e.message || e}) — выгрузите Excel`;
    } finally {
      sverka.zhdut -= 1; risovat();
    }
  }

  function sverkaExcel() {
    const rows = [SVERKA_KOL].concat((sverka.itog || []).map((s) => SVERKA_KOL.map((k) => s[k] ?? "")));
    const csv = String.fromCharCode(0xFEFF) + rows.map((r) => r.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `сверка ${String(sverka.imya).replace(/[\\/:*?"<>|]/g, "_")} ${new Date().toLocaleDateString("ru-RU")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function blokSverki() {
    if (!sverka) sverkaNachat();
    const N = sverkaVsego();
    const n = Math.min(sverkaNashli(), N);
    const posl = sverkaPosl ? `<p class="aktPs__chto">Прошлая сверка: ${esc(sverkaPosl.когда)} · ${esc(sverkaPosl.кто)} · сошлось ${sverkaPosl.совпало} из ${sverkaPosl.всего}, ошибок ${sverkaPosl.ошибок}</p>` : "";
    if (sverka.itog) {
      const it = sverka.itog;
      return `<div class="sverka">
        <div class="sverka__schet"><b>${it.length ? it.length : "✓"}</b><span>${it.length ? "ошибок по паллете" : "всё сошлось с ВМС"}</span></div>
        ${sverka.posl ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(sverka.posl)}</b></p>` : ""}
        ${it.length ? `<div class="sverka__spisok">${it.map((s) => `<p><b>${esc(s["Вид ошибки"])}</b> ${s["Номер акта"] ? `акт ${esc(s["Номер акта"])} · ` : ""}${esc(s["Товар"])}
          <span>${esc(s["Программное размещение"] || "")}${s["Виновный"] ? ` · кандидат: ${esc(s["Виновный"])}` : ""}${s["Комментарий"] ? ` · ${esc(s["Комментарий"])}` : ""}</span></p>`).join("")}</div>` : ""}
        <div class="aktPs__vopros">${it.length ? '<button type="button" class="aktPs__kn is-on" data-sverka="excel">Excel — в колонках книги ошибок</button>' : ""}
          <button type="button" class="aktPs__kn" data-sverka="novaya">Новая сверка</button></div>
        <p class="aktPs__chto">«Кандидат» — кто последним перекладывал штуку пикалкой; перекладки руками в WMS пикалка не видит.</p>
      </div>`;
    }
    const kat = [...sverka.kat.values()];
    return `<div class="sverka">
      <div class="sverka__schet"><b>${n}</b><span>из ${N} шт сверено</span>${sverka.lishnie.length ? `<em>излишков ${sverka.lishnie.length}</em>` : ""}${kat.length ? `<em>не та категория ${kat.length}</em>` : ""}${sverka.zhdut ? `<i>проверяю в ВМС…</i>` : ""}</div>
      <p class="aktPs__chto">${sverka.posl ? esc(sverka.posl) : "Пикайте акты с паллеты по одному — пикалка сравнит с составом по ВМС. Штуки без акта — штрихкодом товара."}</p>
      ${sverka.lishnie.length ? `<p class="aktPs__zag">Лежат здесь, по ВМС — не здесь</p><div class="sverka__spisok">${sverka.lishnie.map((l) => `<p><b>${l.акт ? `акт ${esc(l.акт)}` : "без акта"}</b> ${esc(l.товар)}
        <span>${l.вид === "Не принят в ВМС" ? "акт не принят в ВМС" : `числится: ${esc(gdeStr(l.где))}`}${l.кто ? ` · клал(а) ${esc(l.кто.кто)} ${esc(l.кто.когда)}` : ""}</span></p>`).join("")}</div>` : ""}
      ${kat.length ? `<p class="aktPs__zag">Не та категория</p><div class="sverka__spisok">${kat.map((k) => `<p><b>акт ${esc(k.акт)}</b> ${esc(k.товар)}
        <span>нужна «${esc(k.нужна)}»${k.кто ? ` · клал(а) ${esc(k.кто.кто)} ${esc(k.кто.когда)}` : ""}</span></p>`).join("")}</div>` : ""}
      <div class="aktPs__vopros"><button type="button" class="aktPs__kn is-on" data-sverka="konec"${sverka.zhdut ? " disabled" : ""}>Закончить сверку${N - n > 0 ? ` · не пикнуто ${N - n} — в недостачу` : ""}</button>
        <button type="button" class="aktPs__kn" data-sverka="sbros">Сначала</button></div>
      ${posl}
    </div>`;
  }

  // 07.10 ночь: «этого товара нет в паллете» — ошибка «Недостача» по строке состава. Сервер дописывает виновного
  // (кто клал пикалкой, когда, откуда → куда) и шлёт ему уведомление; здесь — сразу показываем, кто и почему.
  function vinovnyStroki(r) {
    if (!r || !r.Виновный) return ["виновный не определён — штуку клали не через пикалку (руками в WMS)"];
    return [`виновный: ${r.Виновный}`, r.Основание || "", `уведомление: ${r.Уведомление || "не отправлялось"}`].filter(Boolean);
  }
  async function palNet(kluch) {
    const x = pal && pal.строки.find((z) => z.ключ === kluch);
    if (!x || palNetZapisano.has(kluch)) return;
    if (!confirm(`Записать ошибку «Недостача»: на паллете ${pal.паллета} нет «${x.товар}»${x.акт ? ` (акт ${x.акт})` : ""}?`)) return;
    const stroka = { "Дата нарушения": new Date().toLocaleDateString("ru-RU"), "Номер контейнера": pal.паллета, "Номер акта": x.акт || "",
      "Товар": x.товар, "Стоимость сайт": x.цена || "", "Программное размещение": pal.паллета, "Вид ошибки": "Недостача",
      "ДВК ГРУ": "", "Виновный": "", "Комментарий": x.акт ? "" : `без акта, ${x.штук} шт` };
    try {
      const o = await fetch("/__akt/sverka", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: pal.паллета, паллета_id: pal.паллета_id || null, всего: 1, совпало: 0, строки: [stroka] }) });
      const d = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      const r = (d.строки || [stroka])[0];
      palNetZapisano.add(kluch);
      palNetItog = { zag: `Записано: недостача — ${x.товар}${x.акт ? ` · акт ${x.акт}` : ""}`, str: vinovnyStroki(r) };
      zvukPik("ok");
    } catch (e) {
      palNetItog = { zag: "Не записалось", str: [e.message || String(e)] };
    }
    risovat();
  }

  function blokIzlishka() {
    if (!pal || palOshibka) return "";
    if (!izl) return `<div class="izl"><button type="button" class="aktPs__kn izl__kn" data-izl="otkryt">+ нашли на паллете то, чего нет в составе</button></div>`;
    const k = izl.karta;
    const gde = k && k.где && k.где[0];
    const tut = gde && String(gde.паллета || "") === String(pal.паллета);
    let telo = "";
    if (izl.zhdu) telo = '<p class="aktPs__chto">Ищу акт в WMS…</p>';
    else if (izl.oshibka) telo = `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(izl.oshibka)}</b></p>`;
    else if (k && k.акт) {
      telo = `<div class="izl__karta"><b><button type="button" class="palStroka__aktKn" data-akt-detal="${esc(k.акт)}" title="Акт целиком: что с ним и фото">акт ${esc(k.акт)}</button> · ${esc(k.товар || "")}</b>
          <span>${k.категория ? `категория: ${esc(k.категория)} · ` : ""}по WMS числится: ${gde ? `${esc(gde.ячейка || "")} · ${esc(gde.паллета || "без паллеты")}` : "нигде (не принят или в пути)"}</span></div>
        ${tut ? '<p class="aktPs__chto">По WMS штука уже на этой паллете — излишка нет, обновите состав.</p>' : `
        <label class="izl__gal"><input type="checkbox" data-izl-zap${izl.zapisat ? " checked" : ""}> записать ошибку «Излишек» (с виновным и уведомлением)</label>
        ${izl.vopros ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(izl.vopros)}</b></p>
          <button type="button" class="aktPs__akt" data-izl="podtv"${izl.idet ? " disabled" : ""}>Всё равно перенести на ${esc(pal.паллета)}</button>`
          : gde ? `<button type="button" class="aktPs__akt" data-izl="perenesti"${izl.idet ? " disabled" : ""}>${izl.idet ? "Переношу…" : `Перенести принудительно на ${esc(pal.паллета)}`}</button>`
            : '<p class="aktPs__chto">Перенести нельзя, пока штуку не примут в WMS — можно только записать ошибку.</p>'}
        <button type="button" class="aktPs__kn" data-izl="tolkoOsh"${izl.idet ? " disabled" : ""}>только записать ошибку, без переноса</button>`}`;
    }
    const itog = izl.itog ? `<div class="aktPs__gotovo palNetItog${izl.itog.ok ? "" : " is-ploho"}"><b>${esc(izl.itog.zag)}</b>${izl.itog.str.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : "";
    return `<div class="izl is-otkr"><p class="aktPs__zag">Нашли на паллете, а в составе нет — излишек</p>
      ${itog}
      <div class="izl__poisk"><input id="izlKod" autocomplete="off" placeholder="ACT … или номер акта" value="${esc(izl.kod || "")}">
        <button type="button" class="aktPs__kn" data-izl="nayti">найти</button>
        <button type="button" class="aktPs__kn" data-izl="zakryt">закрыть</button></div>
      ${telo}
      <p class="aktPs__chto">Без наклейки акта штуку не найти — сначала заактируйте её (пикните товар → акт).</p></div>`;
  }
  async function izlNayti() {
    const kod = String(izl.kod || "").trim();
    if (!kod) return;
    izl = { kod, zhdu: true, zapisat: izl.zapisat };
    risovat();
    try { izl.karta = await chitat(`/__vms/akt?kod=${encodeURIComponent(kod)}`); if (!izl.karta || !izl.karta.акт) throw new Error("акт не найден"); }
    catch (e) { izl.oshibka = e.message || String(e); }
    izl.zhdu = false;
    risovat();
  }
  async function izlZapisat(k, pereneseno) {
    const gde = k.где && k.где[0];
    const bylo = gde ? `${gde.ячейка || ""} · ${gde.паллета || "без паллеты"}` : "нигде (не принят)";
    const stroka = { "Дата нарушения": new Date().toLocaleDateString("ru-RU"), "Номер контейнера": pal.паллета, "Номер акта": String(k.акт),
      "Товар": k.товар || "", "Стоимость сайт": k.цена || "", "Программное размещение": bylo, "Вид ошибки": "Излишек",
      "ДВК ГРУ": "", "Виновный": "", "Комментарий": `найден на ${pal.паллета}, по WMS: ${bylo}${pereneseno ? " — переносим сюда" : ""}` };
    const o = await fetch("/__akt/sverka", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ паллета: pal.паллета, паллета_id: pal.паллета_id || null, всего: 1, совпало: 0, строки: [stroka] }) });
    const d = await o.json().catch(() => ({}));
    if (!o.ok) throw new Error(d.ошибка || `ошибка не записалась: сервер ответил ${o.status}`);
    return vinovnyStroki((d.строки || [stroka])[0]);
  }
  async function izlPerenesti(podtv, bezPerenosa) {
    const k = izl && izl.karta;
    if (!k || izl.idet) return;
    if (!bezPerenosa && !vms.подключено) { formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом нажмите «перенести» ещё раз"; risovat(); return; }
    izl.idet = true; izl.itog = null; risovat();
    const str = [];
    try {
      // ошибку — ДО переноса: виновный берётся по последней перекладке пикалкой, а после переноса последний — сам ДВК
      if (izl.zapisat && !izl.zapisano) { str.push(...await izlZapisat(k, !bezPerenosa)); izl.zapisano = true; }
      if (bezPerenosa) {
        izl.itog = { ok: true, zag: `Записано: излишек — акт ${k.акт}`, str };
      } else {
        const o = await fetch("/__akt/akt_v_palletu", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ акт: k.наклейка || String(k.акт), паллета: pal.паллета, излишек: true, подтвердил: Boolean(podtv) }) });
        const d = await o.json().catch(() => ({}));
        if (d.предупреждение) { izl.vopros = d.предупреждение; izl.itog = str.length ? { ok: true, zag: "Ошибка записана, перенос ждёт подтверждения", str } : null; return; }
        if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом нажмите «перенести» ещё раз"; izl.itog = str.length ? { ok: true, zag: "Ошибка записана, перенос — после входа в WMS", str } : null; return; }
        if (!o.ok || !d.готово) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
        izl.vopros = null;
        izl.itog = d.уже ? { ok: true, zag: `Уже на ${d.паллета} · акт ${k.акт}`, str: ["по WMS штука уже лежит на этой паллете — переносить не нужно", ...str] }
          : { ok: true, zag: `${d.проведено ? "Перенесено" : "Перемещение черновиком"} → ${d.паллета} · акт ${k.акт}`,
          str: [`${d.откуда} → ${d.ячейка} · перемещение №${d.перемещение}`, ...str] };
        izl.karta = null; izl.kod = "";
        zvukPik("ok");
        obnovitSostav();
      }
    } catch (e) {
      izl.itog = { ok: false, zag: izl.zapisano ? "Ошибка записана, но перенос не прошёл" : "Не получилось", str: [e.message || String(e), ...str] };
      zvukPik("oshibka");
    } finally {
      if (izl) izl.idet = false;
      risovat();
    }
  }

  async function palStart() {
    const kn = document.getElementById("palGo");
    if (kn) kn.disabled = true;
    try {
      const o = await fetch("/__akt/palleta/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: String(pal.паллета_id), дефект: palDefekt, крит: palKrit, строки: vyborDlyaServera() }),
      });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом снова «Заактировать»"; risovat(); return; }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      palRabota = { id: d.id, всего: bezAktaVybrano(), готово: 0, акты: [], ошибки: [], идёт: true };
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
  // Под-режим ТСД (29.09): каждый скан ячейки — ещё и в форму «брак в ячейке» (tsd-rezhim.js).
  let podTsd = false;
  document.addEventListener("wms:pod", (e) => { podTsd = e.detail === "tsd"; });
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
  // 02.10: столы группами (предсорт, уценка, отгрузка, СЦ-ДМД), по номерам; над ними поле — пикнуть
  // наклейку стола (CEL …) или набрать «А1», «12»: список сужается, Enter выбирает.
  const imyaStola = (x) => String(x.имя || "").replace(/^ФБ \(ДМД\) /, "");
  function gruppaStola(x) {
    const n = String(x.имя || "");
    if (x.тип === "предсорт" || /предсорт/i.test(n)) return "Предсорт";
    if (x.тип === "отгрузка") return "Отгрузка";
    if (/^СЦ-ДМД/i.test(n)) return "Уценка СЦ-ДМД";
    return "Уценка ДМД";
  }
  function blokStolov() {
    zagruzitStoly();
    const spisok = Array.isArray(stolyVse) ? stolyVse : [];
    const gruppy = {};
    for (const x of spisok) (gruppy[gruppaStola(x)] = gruppy[gruppaStola(x)] || []).push(x);
    const knopka = (x) => `<button type="button" class="aktPs__kn${stol && String(stol.id) === String(x.id) ? " is-on" : ""}" data-vybrat-stol="${esc(x.id)}" data-stol-imya="${esc(imyaStola(x).toLowerCase())}">${esc(imyaStola(x))}<small>${(x.исходы || []).length} реш.</small></button>`;
    const bloki = ["Предсорт", "Уценка ДМД", "Отгрузка", "Уценка СЦ-ДМД"].filter((g) => gruppy[g]).map((g) =>
      `<div class="vmsStoly__gr" data-stol-gr><p class="aktPs__nad">${g}</p><div class="aktPs__resheniya vmsStoly">${gruppy[g]
        .sort((a, b) => imyaStola(a).localeCompare(imyaStola(b), "ru", { numeric: true })).map(knopka).join("")}</div></div>`).join("");
    return `<p class="aktPs__zag">Заактировать — выберите стол</p>
      <form class="aktPs__vhod" id="stolForma" autocomplete="off">
        <input name="kod" id="stolPoisk" placeholder="пикните наклейку стола или наберите: А1, 12…" inputmode="text">
        <button class="aktPs__kn is-on" type="submit">Выбрать</button>
      </form>
      ${stolyVse && stolyVse.zhdu ? '<p class="aktPs__chto">Загружаю столы…</p>' : ""}
      ${stolyVse && stolyVse.oshibka ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(stolyVse.oshibka)}</b></p>` : ""}
      ${oshibkaStola ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(oshibkaStola)}</b></p>` : ""}
      ${bloki}`;
  }
  function postavitStol(d) {
    stol = d; vyborStola = false; reshenie = ""; defekt = ""; krit = ""; gotovo = null; oshibkaStola = "";
    localStorage.setItem(KLYUCH_STOLA, JSON.stringify({ день: segodnya(), стол: d }));
    if (tovar) zagruzitOtkuda();
    risovat();
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

  // 06.10: сканер на подставке сыпал одну наклейку 5 раз в секунду — тот же акт в течение 2 с не открываем заново
  let aktPosl = { kod: "", t: 0 };
  async function otkrytAkt(kod) {
    if (kod === aktPosl.kod && Date.now() - aktPosl.t < 2000) return;
    aktPosl = { kod, t: Date.now() };
    if (svezhiy && nomerAkta(kod) !== svezhiy.nomer) svezhiy = null;
    // 07.10 (руководитель контроля: «сотрудник отсканировал акт, идёт на контейнер, но не пикнул перемещение, —
    // чтобы пикалка запомнила»): прошлый акт так и лежит на столе, а пикнули следующий — в список и звук.
    const byl = aktK && aktK.акт ? aktK : null;
    if (byl && !(aktPer && aktPer.itog && aktPer.itog.ok) && naStole(byl) && nomerAkta(kod) !== String(byl.акт)) {
      nePerZapisat(nePerSpisok().filter((x) => String(x.акт) !== String(byl.акт))
        .concat([{ акт: byl.акт, товар: byl.товар, наклейка: byl.наклейка || "", когда: new Date().toTimeString().slice(0, 5) }]));
      signal(`акт ${byl.акт} пикнут и не переложен — так и лежит на столе`);
      zvukPik("oshibka");
    }
    aktK = { zhdu: true }; aktPer = null; vtisZ = null; defRed = null; novP = null; pal = null; yach = null; tovar = null; vRezhimPalety(true); risovat();
    try { aktK = await chitat(`/__vms/akt?kod=${encodeURIComponent(kod)}`); } catch (e) { aktK = { oshibka: e.message || String(e) }; }
    // переоткрыли акт из списка «не переложены», а он уже не на столе — убрать из списка
    if (aktK && aktK.акт && aktK.живьём && !naStole(aktK)) nePerUbrat(aktK.акт);
    if (aktK && aktK.акт) PikIst.dobavit({ vid: "акт", kod: aktK.наклейка || String(aktK.акт), akt: aktK.акт, n: aktK.товар,
      itog: neprinyat(aktK) ? "не принят в WMS" : (aktK.категория || ""), ok: neprinyat(aktK) ? false : null });
    risovat();
    if (neprinyat(aktK)) stopPokazat(aktK);
  }

  // Меню слева (pikalka-c.js): «Сверка» — ждём паллету; «Ошибки» — журнал за день.
  document.addEventListener("pikalka:sverka", () => {
    if (pal) { palPer = null; palDb = null; palTab = "sverka"; if (!sverka) sverkaNachat(); risovat(); return; }
    zhdemSverku = true;
    signal("Сверка: пикните паллету (CON …) — откроется сразу на сверке");
  });

  // «Не переложены за смену» — в этом браузере, сбрасывается с новым днём.
  const KL_NEPER = "pikNePer";
  const naStole = (a) => Boolean(a && a.живьём && a.где && a.где.length && /стол/i.test(`${a.где[0].ячейка} ${a.где[0].зона || ""}`));
  function nePerSpisok() {
    try { const d = JSON.parse(localStorage.getItem(KL_NEPER) || "{}"); return d.den === new Date().toDateString() ? d.akty || [] : []; } catch { return []; }
  }
  function nePerZapisat(akty) { localStorage.setItem(KL_NEPER, JSON.stringify({ den: new Date().toDateString(), akty: akty.slice(-50) })); }
  function nePerUbrat(akt) { const sp = nePerSpisok(); const ost = sp.filter((x) => String(x.акт) !== String(akt)); if (ost.length !== sp.length) nePerZapisat(ost); }
  /* 08.10 Степан: «лента не даёт понимания, что ты пикал из актов — сделать там историю всех пиков твоих
     и спрятать ниже выпадающим окном, сейчас она видна только с главной». История пиков за смену — одна на
     пикалку: акты (с итогом — перемещено, не принят), товары по ШК, паллеты. На главной — лента (pikalka-c.js),
     в панели акта — выпадающий список. Строка открывает тот же акт, товар или паллету. */
  const IST_KL = "pikalka-istoriya-v1";
  const PikIst = {
    den: () => new Date().toLocaleDateString("ru-RU"),
    spisok() {
      try { const d = JSON.parse(localStorage.getItem(IST_KL) || "{}"); return d.den === this.den() ? (d.sp || []) : []; }
      catch { return []; }
    },
    dobavit(z) {
      if (!z || !z.kod) return;
      const sp = this.spisok();
      const i = sp.findIndex((x) => x.vid === z.vid && String(x.kod) === String(z.kod));
      const bylo = i >= 0 ? sp.splice(i, 1)[0] : {};
      sp.unshift({ ...bylo, ...Object.fromEntries(Object.entries(z).filter(([, v]) => v !== undefined && v !== "")),
        t: new Date().toTimeString().slice(0, 5) });
      try { localStorage.setItem(IST_KL, JSON.stringify({ den: this.den(), sp: sp.slice(0, 300) })); } catch { /* не влезло */ }
      document.dispatchEvent(new CustomEvent("pikalka:istoriya"));
    },
    ochistit() { localStorage.removeItem(IST_KL); document.dispatchEvent(new CustomEvent("pikalka:istoriya")); },
    html(sp) {
      return sp.map((x) => {
        const atr = x.vid === "акт" ? `data-akt-otkryt="${esc(x.kod)}"` : x.vid === "паллета" ? `data-pal-otkryt="${esc(x.kod)}"`
          : `data-b="${esc(x.kod)}"`;
        return `<button type="button" class="istR${x.vid === "товар" ? " cLr" : ""}" ${atr}>
          <span class="istR__t">${esc(x.t)}</span><span class="istR__vid istR__vid--${esc(x.vid)}">${esc(x.vid)}${x.akt ? ` ${esc(x.akt)}` : ""}</span>
          <span class="istR__n">${esc(x.n || x.kod)}</span>
          ${x.itog ? `<span class="istR__itog${x.ok === true ? " is-ok" : x.ok === false ? " is-err" : ""}">${esc(x.itog)}</span>` : ""}</button>`;
      }).join("");
    },
  };
  window.PikIst = PikIst;
  function istoriyaBlok() {
    const sp = PikIst.spisok();
    if (!sp.length) return "";
    return `<details class="istPik"><summary>История пиков за смену · ${sp.length}</summary><div class="istPik__sp">${PikIst.html(sp)}</div></details>`;
  }
  // крупно наверху панели: чем кончилась перекладка — видно издалека, без прокрутки
  function bolshoyItog() {
    if (aktPer && aktPer.idet) return '<div class="bigIt is-idet"><b>Перекладываю…</b></div>';
    if (svezhiy && !(aktPer && aktPer.itog) && aktK && (aktK.zhdu || String(aktK.акт) === svezhiy.nomer)) {
      const pod = [svezhiy.reshenie, svezhiy.zametka, aktK.zhdu ? "открываю карточку…" : "пикните паллету — переложу"].filter(Boolean).join(" · ");
      return `<div class="bigIt is-ok"><b>Акт №${esc(svezhiy.nomer)} создан</b><span>${esc(pod)}</span></div>${pechatSvezhego(svezhiy.nomer)}`;
    }
    if (aktPer && aktPer.itog) {
      const r = aktPer.itog;
      return `<div class="bigIt ${r.ok ? "is-ok" : "is-err"}"><b>${esc(r.zag)}</b><span>${esc(r.tekst)}</span></div>`;
    }
    return "";
  }

  function nePerPolosa() {
    const sp = nePerSpisok();
    if (!sp.length) return "";
    return `<div class="nePer"><p><b>Пикнуты и не переложены за смену: ${sp.length}</b> — нажмите, чтобы открыть и доделать</p>
      <div>${sp.slice(-8).reverse().map((x) => `<button type="button" class="aktPs__kn" data-akt-otkryt="${esc(x.наклейка || x.акт)}">${esc(x.когда)} · акт ${esc(x.акт)} · ${esc(String(x.товар || "").slice(0, 36))}</button>`).join("")}</div></div>`;
  }

  /* 07.10 «Контейнер с остатком» (руководитель контроля: «чтобы не давала завершить работу с контейнером, пока остаток
     не перемещён: на контейнере 100, обработали 99 — уведомление, что числится ещё 1»). Исходный контейнер — откуда
     реально переложили штуку (ответ перекладки). Перешли к штуке из другого контейнера — смотрим прошлый по ВМС;
     что-то числится — окно: доразобрать или «физически нет» (в журнал сверок недостачей). */
  let istKont = "";
  let ostatok = null;   // { imya, stroki } — окно открыто
  // 08.10 Степан: «это бред, а не правило, непонятно зачем… надо выключить» — окно выключено (код оставлен:
  // вернуть — OSTATOK_VKL = true)
  const OSTATOK_VKL = false;
  async function proveritOstatok(imya) {
    if (!OSTATOK_VKL) return;
    try {
      const d = await chitat(`/__akt/palleta?kod=${encodeURIComponent(imya)}`);
      const stroki = (d.строки || []).filter((x) => x.штук > 0);
      if (!stroki.length) return;
      ostatok = { imya: d.паллета || imya, pid: d.паллета_id || null, stroki };
      ostatokPokazat();
    } catch { /* ВМС не ответила — не мешаем работе */ }
  }
  function ostatokPokazat() {
    let el = document.getElementById("kontOst");
    if (!el) {
      el = document.createElement("div");
      el.id = "kontOst";
      el.className = "aktStop aktStop--ost";
      el.setAttribute("role", "alertdialog");
      document.body.appendChild(el);
      el.addEventListener("click", (e) => { const b = e.target.closest("[data-ost]"); if (b) ostatokReshit(b.dataset.ost); });
    }
    const o = ostatok;
    const sht = o.stroki.reduce((n, x) => n + x.штук, 0);
    el.innerHTML = `<div class="aktStop__okno">
        <p class="aktStop__nad">Вы перешли к другому контейнеру</p>
        <h2 class="aktStop__zag">В ${esc(o.imya)} ещё числится ${sht} шт</h2>
        <div class="aktStop__spisok">${o.stroki.slice(0, 8).map((x) => `<p>${x.акт ? `акт ${esc(x.акт)} · ` : ""}${esc(x.товар)}${x.штук > 1 ? ` · ${x.штук} шт` : ""}</p>`).join("")}${o.stroki.length > 8 ? `<p>…и ещё ${o.stroki.length - 8}</p>` : ""}</div>
        <p class="aktStop__chto">Если штуки там лежат — доразберите контейнер. Если их физически нет — отметьте, это уйдёт в журнал недостачей.</p>
        <div class="aktStop__knopki">
          <button type="button" class="aktStop__da" data-ost="vernus">Вернусь и доразберу</button>
          <button type="button" class="aktStop__snova" data-ost="net">Физически нет — записать недостачу</button>
          <button type="button" class="aktStop__snova" data-ost="dalshe">Контейнер не мой — дальше</button>
        </div>
      </div>`;
    el.hidden = false;
    document.body.classList.add("is-aktStop");
    zvukPik("oshibka");
  }
  async function ostatokReshit(kak) {
    const o = ostatok;
    if (kak === "net" && o) {
      const den = new Date().toLocaleDateString("ru-RU");
      const stroki = o.stroki.map((x) => ({ "Дата нарушения": den, "Номер контейнера": o.imya, "Номер акта": x.акт || "", "Товар": x.товар,
        "Стоимость сайт": x.цена || "", "Программное размещение": o.imya, "Вид ошибки": "Недостача", "ДВК ГРУ": "", "Виновный": "",
        "Комментарий": `контейнер оставлен с остатком${x.штук > 1 ? `, ${x.штук} шт` : ""}` }));
      fetch("/__akt/sverka", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: o.imya, паллета_id: o.pid, всего: stroki.length, совпало: 0, строки: stroki }) }).catch(() => {});
    }
    ostatok = null;
    const el = document.getElementById("kontOst");
    if (el) el.hidden = true;
    if (!stopAkt) document.body.classList.remove("is-aktStop");
  }

  /* 07.10 Струков, Белитов (разбор ошибок с ДВК, «очень много у Калачёва»): акт в вмс не числится, а человек
     видит крупную категорию, плашку ниже не читает и кладёт штуку в паллету — по камерам не отследить, в паллете
     излишек. Теперь: категории нет («не раскладывать»), экран стопорится, пики паллет/товаров/актов не проходят,
     пока человек не нажмёт «Отложил в сторону». Нажатие пишется в журнал (/__akt/otlozheno) — список для Гамлета. */
  const neprinyat = (a) => Boolean(a && a.живьём && !(a.где && a.где.length) && !(a.транзит && (a.транзит.причина || a.транзит.едет)));
  let stopAkt = null;
  function stopPokazat(a) {
    stopAkt = a;
    let el = document.getElementById("aktStop");
    if (!el) {
      el = document.createElement("div");
      el.id = "aktStop";
      el.className = "aktStop";
      el.setAttribute("role", "alertdialog");
      document.body.appendChild(el);
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-stop-otlozhil]")) stopOtlozhil();
        else if (e.target.closest("[data-stop-snova]")) stopProverit();
      });
    }
    el.innerHTML = `<div class="aktStop__okno">
        <p class="aktStop__nad">Акт №${esc(a.акт)}${a.статус ? ` · ${esc(a.статус.toLowerCase())}` : ""}</p>
        <h2 class="aktStop__zag">Стоп. Акт не принят в WMS</h2>
        <p class="aktStop__tovar">${esc(a.товар || "")}</p>
        <p class="aktStop__chto">В паллету <b>не класть</b> — получится излишек. Отложите товар в сторону, к непринятым.
          Когда его примут, пикните акт снова.</p>
        <div class="aktStop__knopki">
          <button type="button" class="aktStop__da" data-stop-otlozhil="1">Отложил(а) в сторону</button>
          <button type="button" class="aktStop__snova" data-stop-snova="1">Проверить ещё раз</button>
        </div>
        <p class="aktStop__poka">пока не нажмёте — пикалка не принимает паллеты, товары и другие акты</p>
      </div>`;
    el.hidden = false;
    document.body.classList.add("is-aktStop");
    setTimeout(() => window.pikalkaZvuk && window.pikalkaZvuk("oshibka"), 300);
    setTimeout(() => el.querySelector("[data-stop-otlozhil]")?.focus(), 50);
  }
  function stopSnyat() {
    stopAkt = null;
    const el = document.getElementById("aktStop");
    if (el) el.hidden = true;
    document.body.classList.remove("is-aktStop");
    const sk = document.getElementById("scan");
    if (sk) { sk.value = ""; sk.focus(); }
  }
  function stopOtlozhil() {
    const a = stopAkt;
    if (!a) return stopSnyat();
    fetch("/__akt/otlozhil", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ акт: a.акт, товар: a.товар, наклейка: a.наклейка || "", стол: stol ? stol.имя : "", статус: a.статус || "" }) })
      .catch(() => {});
    stopSnyat();
  }
  async function stopProverit() {
    const a = stopAkt;
    if (!a) return stopSnyat();
    const kn = document.querySelector("#aktStop [data-stop-snova]");
    if (kn) { kn.disabled = true; kn.textContent = "смотрю в WMS…"; }
    let svezh = null;
    try { svezh = await chitat(`/__vms/akt?kod=${encodeURIComponent(a.наклейка || `ACT ${String(a.акт).padStart(10, "0")}`)}`); } catch { svezh = null; }
    if (svezh && !neprinyat(svezh)) { aktK = svezh; stopSnyat(); risovat(); return; }
    if (kn) { kn.disabled = false; kn.textContent = "всё ещё не принят — проверить ещё раз"; }
    window.pikalkaZvuk && window.pikalkaZvuk("oshibka");
  }
  // Пока стоп — любые пики гасим раньше остальных обработчиков (захват, этот файл грузится до pikalka-c.js).
  ["picker:hit", "picker:akt", "picker:palleta", "picker:miss"].forEach((tip) => document.addEventListener(tip, (e) => {
    if (!stopAkt && !ostatok) return;
    e.stopImmediatePropagation();
    const el = document.getElementById(stopAkt ? "aktStop" : "kontOst");
    if (el) { el.classList.remove("is-tryas"); void el.offsetWidth; el.classList.add("is-tryas"); }
    setTimeout(() => window.pikalkaZvuk && window.pikalkaZvuk("oshibka"), 260);
  }, { capture: true }));

  function shagiAkta(a) {
    const itog = aktPer && aktPer.itog;
    const gotovo = itog && itog.ok;
    const net = neprinyat(a);
    return `<div class="cShag3">
      <div class="${stol ? "is-ok" : "is-net"}"><i>1</i><span>стол</span><b>${stol ? esc(String(stol.имя).replace(/^ФБ \(ДМД\) /, "")) : "без стола"}</b></div>
      <div class="${a.категория && !net ? "is-ok" : "is-net"}"><i>2</i><span>категория</span><b>${net ? "не принят" : esc(a.категория || "нет")}</b></div>
      <div class="${gotovo ? "is-ok" : net ? "is-net" : "is-sled"}"><i>3</i><span>паллета</span><b>${gotovo ? "переложена" : net ? "нельзя" : "пикните"}</b></div>
    </div>`;
  }

  /* 02.10 Гамлет: «бывают товары которые не приняты, ещё в перемещении — в вмс в остатках не числятся,
     и сотрудник этого не видит, когда пикает» — идёт к паллете и получает ошибку. Говорим сразу при пике акта. */
  function nelzyaPerelozhit(a) {
    if (!a.живьём) return "";
    // 06.10: штука пикнута через транзит СЦ→ДМД — говорим, куда пикнули и почему не доехала (раньше было видно
    // только «лежит в СЦ-ДМД Перемещение ФБ на РЦ», и человек не понимал, что учёт застрял)
    const tr = a.транзит;
    if (tr && tr.причина) {
      return `<div class="aktPs__gotovo is-oshibka"><b>Не доехала из транзита СЦ→ДМД — пикнули ${esc(tr.когда)} на ${esc(tr.паллета || "паллету")}</b>
        <span>${esc(tr.кто || "")} · ${esc(tr.транзит || "")} · ${esc(tr.причина)}. Физически она на паллете, по WMS — в транзите. Не перекладывайте: Рысакову сообщено.</span></div>`;
    }
    if (tr && tr.едет) {
      return `<div class="aktPs__gotovo"><b>Едет через транзит СЦ→ДМД на ${esc(tr.паллета || "паллету")} — пикнули ${esc(tr.когда)}</b>
        <span>по WMS доедет сама за 10–20 минут, перекладывать не нужно.</span></div>`;
    }
    if (!a.где || !a.где.length) {
      return `<div class="aktPs__gotovo is-oshibka"><b>В WMS эта штука сейчас не числится — переложить нельзя</b>
        <span>ещё не принята, едет в перемещении — или уже продана, списана. Отложите её: когда примут, пикните акт снова.</span></div>`;
    }
    const zavis = a.где.find((g) => /завис|в пути/i.test(`${g.ячейка} ${g.зона || ""}`));
    if (zavis) {
      return `<div class="aktPs__gotovo is-oshibka"><b>По WMS штука ещё в «${esc(zavis.ячейка)}» — не принята на место</b>
        <span>переложить можно только на паллету базы ${esc(zavis.база || "где она числится")}; на другую базу — сначала её должны принять там.</span></div>`;
    }
    return "";
  }

  function risovatAkt() {
    const a = aktK;
    if (a.zhdu) { vyvesti('<p class="aktPs__chto">Смотрю акт в WMS…</p>', shapkaDey("Акт", "смотрю в WMS…") + bolshoyItog()); return; }
    if (a.oshibka) { vyvesti(`<p class="aktPs__net"><b class="aktPs__oshibka">${esc(a.oshibka)}</b></p>`, ""); return; }
    const est = a.живьём && a.где && a.где.length;
    const panel = Boolean(deyEl());
    const kat = neprinyat(a) ? `<div class="aktKat aktKat--stop"><span class="aktKat__nad">категория уценки</span>
        <b class="aktKat__imya">не раскладывать</b>
        <span class="aktKat__rub">акт не принят в WMS — товар в сторону, в паллету не класть</span></div>`
      : a.живьём ? `<div class="aktKat"><span class="aktKat__nad">категория уценки${a.цена ? ` <b class="aktKat__cena">${esc(Number(a.цена).toLocaleString("ru-RU"))} ₽${a.цена_откуда === "сайт" ? " · цена сайта" : ""}</b>` : ""}</span>
        <b class="aktKat__imya">${esc(a.категория || "не определилась")}</b>${a.спорно ? ' <span class="aTag aTag--spor">спорно</span>' : ""}
        <span class="aktKat__rub">${a.мисбокс ? "цена до 1 000 ₽ — мистери бокс · " : ""}рубрика «${esc(a.рубрика || "—")}»${a.рубрика_вмс ? ` · ${esc(a.рубрика_вмс)}` : ""}</span></div>` : "";
    // 07.10 столы: «когда пикаешь акт — чтобы можно было его прямо там распечатать, как у контейнера»
    const vWms = `<div class="palKartaAkt__knopki"><a class="aktPs__kn" href="${esc(a.вмс || a.WMS)}" target="_blank" rel="noopener">Открыть акт в WMS</a>${
      window.ShkPechat && a.акт ? '<button type="button" class="aktPs__kn" data-akt-pechat="1">Печать наклейки акта</button>' : ""}</div>`;
    const otkuda = `<p class="aktPs__chto">${a.живьём ? `живьём из WMS · ${esc(a.за_с)} с` : `Данные хранилища — WMS не ответила${a.почему_не_живьём ? ` (${esc(a.почему_не_живьём)})` : ""}.`}</p>`;
    const glav = `<header class="aktPs__shapka"><div><p class="aktPs__nad">Акт №${esc(a.акт)}</p>
        <p class="aktPs__rezhim">${esc(a.вид)} · ${esc(a.когда)} · ${esc(a.автор)}${a.статус ? ` · ${esc(a.статус.toLowerCase())}` : ""}</p></div></header>
      <p class="aktPs__podskaz aktTovar">${esc(a.товар)}</p>
      ${a.особый ? `<div class="aktOsob"><b>${esc(a.особый)}</b><span>товар клиента, не уценка — отдельно</span></div>` : ""}
      ${a.живьём ? blokDefekta(a) : ""}
      ${panel ? "" : kat}
      ${a.описание && a.описание.length ? `<dl class="aktOp">${a.описание.filter((x) => x.что !== "заявленный дефект").map((x) => `<dt>${esc(x.что)}</dt><dd>${esc(x.значение)}</dd>`).join("")}</dl>`
        : `<p class="aktPs__chto">дефект: ${esc(a.дефект || "—")}</p>`}
      ${a.комментарии && a.комментарии.length ? `<p class="aktPs__zag">Комментарии</p><div class="aktKom">${a.комментарии.map((k) => `<p><span>${esc(k.когда)} · ${esc(k.кто)}</span>${esc(k.текст)}</p>`).join("")}</div>` : ""}
      ${a.из_ячейки ? `<p class="aktPs__chto">заактирован в «${esc(a.из_ячейки)}»</p>` : ""}
      <p class="aktPs__zag">Где сейчас</p>
      ${a.где.length ? `<div class="yachPallety">${a.где.map((g) => `
        <button type="button" class="yachPalleta yachPalleta--stolb" data-pal-otkryt="${esc(g.паллета)}"${g.паллета ? "" : " disabled"}>
          <span class="yachPalleta__imya">${esc(g.паллета || "без паллеты")}</span>
          <span>${skladTip(g.база) ? `<em class="cGde__tip cGde__tip--${skladTip(g.база) === "СЦ" ? "sc" : "fb"}">${skladTip(g.база)}</em> ` : ""}${esc(g.ячейка)}${g.зона ? ` <span class="yachPalleta__zak">· ${esc(g.зона)}</span>` : ""}${g.база ? ` <span class="yachPalleta__zak">· ${esc(g.база)}</span>` : ""}</span>
          ${g.заказ ? `<span class="yachPalleta__zak">заказ ${esc(g.заказ)}</span>` : ""}
        </button>`).join("")}</div>` : '<p class="aktPs__chto">По WMS штука нигде не числится — не принята, в перемещении, продана или списана.</p>'}
      ${panel ? "" : nelzyaPerelozhit(a) + (est ? blokAktPer(a) : "") + vWms + otkuda}
      ${panel || !window.AktDetal || !a.акт ? "" : window.AktDetal.blok(a.акт)}`;
    if (!panel) { box.innerHTML = glav; return; }
    vyvesti(glavAkta(a), `${shapkaDey("Акт", "№" + a.акт, a.особый ? `<span class="cDey__osob">${esc(a.особый)}</span>` : "")}
      ${plashkaVms()}${formaVms()}
      ${bolshoyItog()}
      ${shagiAkta(a)}
      ${kat}
      ${nelzyaPerelozhit(a)}
      ${est ? blokAktPer(a, true) : ""}
      ${istoriyaBlok()}
      ${blokOshibki(a)}
      <div class="cDey__niz">${vWms}</div>
      ${otkuda}`);
  }

  /* 07.10 Степан: «а где я вижу, где ошибка, и как выставить ошибку — не вижу». Блок «Ошибка ДВК» на карточке
     любого акта: вид из книги «Ошибки ДРП», контейнер, где нашли (по умолчанию — последняя открытая паллета),
     комментарий. Где числится по ВМС и «кто клал» (журнал пикалки) сервер подставит сам. Журнал за день —
     «Ошибки» в меню слева. Паллету целиком — пикнуть паллету → вкладка «Сверка». */
  const VIDY_OSHIBOK = ["Излишек", "Недостача", "Ошибка Категории", "Неверный дефект", "Дисконт", "Ошибка Дисконта", "Переупаковка",
    "Ошибка акта", "Ошибка Описи", "Нет заключения ССЦ", "Вывод в сток", "Проверка СБ", "Маркетплейс", "Товары до 1000р"];
  let oshAkt = null;      // { akt, vid, kont, komm, idet, gotovo, oshibka }
  let posledPal = "";     // последняя открытая паллета — «где нашли» по умолчанию
  function blokOshibki(a) {
    if (!a || !a.акт) return "";
    if (!oshAkt || oshAkt.akt !== a.акт) oshAkt = { akt: a.акт, vid: "", kont: posledPal, komm: "" };
    const o = oshAkt;
    const gde = a.где && a.где.length ? gdeStr(a.где) : (a.живьём ? "не принят в ВМС" : "");
    if (o.gotovo) {
      return `<details class="oshDvk" open><summary>Ошибка ДВК</summary>
        <div class="aktPs__gotovo"><b>Записано: ${esc(o.vid)}${o.kont ? ` · ${esc(o.kont)}` : ""}</b>
          ${vinovnyStroki(o.gotovo).map((t) => `<span>${esc(t)}</span>`).join("")}
          <span>в журнале ошибок за сегодня — меню слева, «Ошибки»</span></div>
        <button type="button" class="aktPs__kn" data-osh="eshche">Записать ещё одну по этому акту</button></details>`;
    }
    return `<details class="oshDvk"${o.vid ? " open" : ""}><summary>Ошибка ДВК — записать</summary>
      <p class="aktPs__chto">по ВМС: ${esc(gde || "—")}</p>
      <div class="oshDvk__vidy">${VIDY_OSHIBOK.map((v) => `<button type="button" class="aktPs__kn${v === o.vid ? " is-on" : ""}" data-osh-vid="${esc(v)}">${esc(v)}</button>`).join("")}</div>
      <input class="aktPs__svoy" data-osh-pole="kont" placeholder="контейнер, где нашли (CON … или имя)" value="${esc(o.kont)}">
      <input class="aktPs__svoy" data-osh-pole="komm" placeholder="комментарий" value="${esc(o.komm)}">
      ${o.oshibka ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(o.oshibka)}</b></p>` : ""}
      <button type="button" class="aktPs__kn is-on" data-osh="zapisat"${!o.vid || o.idet ? " disabled" : ""}>${o.idet ? "Записываю…" : o.vid ? `Записать: ${esc(o.vid)}` : "Выберите вид ошибки"}</button>
    </details>`;
  }
  async function zapisatOshibku() {
    const a = aktK, o = oshAkt;
    if (!a || !o || !o.vid || o.idet) return;
    o.idet = true; o.oshibka = ""; risovat();
    const stroka = { "Дата нарушения": new Date().toLocaleDateString("ru-RU"), "Номер контейнера": o.kont || "", "Номер акта": a.акт,
      "Товар": a.товар || "", "Стоимость сайт": a.цена || "", "Программное размещение": a.где && a.где.length ? gdeStr(a.где) : "не принят в ВМС",
      "Вид ошибки": o.vid, "ДВК ГРУ": "", "Виновный": "", "Комментарий": o.komm || "" };
    try {
      const otv = await fetch("/__akt/sverka", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: o.kont || "", паллета_id: null, всего: 1, совпало: 0, строки: [stroka] }) });
      const d = await otv.json().catch(() => ({}));
      if (!otv.ok) throw new Error(d.ошибка || `сервер ответил ${otv.status}`);
      o.gotovo = (d.строки || [stroka])[0];
      zvukPik("ok");
    } catch (e) {
      o.oshibka = `не записалось: ${e.message || e}`;
    } finally {
      o.idet = false; risovat();
    }
  }

  /* Центр акта плитками (дизайн C): себес, цена, где сейчас — крупно; дефект и вид обращения;
     поля акта — каждое своей плиткой. Себес — по имени из справочника сайта (cost-list.js). */
  const rub = (n) => `${Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
  function sebesAkta(a) {
    if (a.sebes !== undefined || !window.sebesPoImeni) return;
    a.sebes = null;
    window.sebesPoImeni(a.товар).then((x) => { a.sebes = x || false; }).catch(() => { a.sebes = false; })
      .finally(() => { if (aktK === a) risovat(); });
  }
  /* 08.10 Степан: «где сейчас» не бросается в глаза — «у них в терминале понятнее». Как строка отчёта
     остатков: склад (СЦ или ФБ — с верхов Х(…) иначе не понять), ячейка, контейнер, качество; мест несколько —
     строками той же таблицы. Имя паллеты делим на тип и номер — длинное «ФБ-Утилизация-0139810414» рвалось. */
  const skladTip = (baza) => (/^СЦ/i.test(baza || "") ? "СЦ" : baza ? "ФБ" : "");
  const skladImya = (baza) => String(baza || "").replace(/^СЦ\s*-\s*/i, "");
  function kontRazbor(imya) {
    const m = String(imya || "").match(/^(.*?)[\s-]*(\d{6,12})$/);
    return m ? { tip: m[1], nomer: m[2] } : { tip: "", nomer: String(imya || "") };
  }
  function blokGdeAkta(a) {
    const gde = a.где || [];
    if (!gde.length) return `<div class="cT cT--gk cT--gkNet"><div class="cT__l">Где сейчас</div>
      <div class="cT__v"><span class="aNet" style="display:inline">на складе уже нет — продана, списана или уехала</span></div></div>`;
    // 08.10 «сам видишь, чем криво»: не таблица в плитке, а четыре плитки той же сетки — стыки совпадают с плитками ниже
    const plitka = (l, v, pod = "", kl = "") => `<div class="cT cT--gk${kl}"><div class="cT__l">${l}</div><div class="cT__v">${v}</div>${pod ? `<div class="cT__pod">${pod}</div>` : ""}</div>`;
    return gde.map((g, i) => {
      const k = kontRazbor(g.паллета);
      const tip = skladTip(g.база);
      const nad = i === 0 ? "Где сейчас" : `Ещё место ${i + 1}`;
      return plitka(`${nad} · склад`, `${tip ? `<em class="cGde__tip cGde__tip--${tip === "СЦ" ? "sc" : "fb"}">${tip}</em>` : ""}${esc(skladImya(g.база) || "—")}`)
        + plitka("Ячейка", esc(g.ячейка || "—"), g.зона ? esc(g.зона) : "")
        + (g.паллета
          ? `<button type="button" class="cT cT--gk cT--gkPal" data-pal-otkryt="${esc(g.паллета)}"><div class="cT__l">${esc(k.tip || "Паллета")}</div><div class="cT__v">${esc(k.nomer)}</div><div class="cT__pod">открыть паллету →</div></button>`
          : plitka("Паллета", "без паллеты"))
        + plitka("Качество", `${esc(g.качество || "—")} · ${esc(String(g.штук ?? 1).replace(/\.0$/, ""))} шт`, g.заказ ? `заказ ${esc(g.заказ)}` : "");
    }).join("");
  }
  function glavAkta(a) {
    sebesAkta(a);
    const sb = a.sebes;
    const sebes = sb === null || sb === undefined ? '<span class="aNet" style="display:inline">ищу…</span>'
      : sb && Number.isFinite(sb.unitCost) ? `<b class="cBig">${esc(rub(sb.unitCost))}</b>${sb.status && sb.status !== "Найдено" ? `<small>${esc(sb.status.toLowerCase())}</small>` : ""}`
      : `<span class="aNet" style="display:inline">${sb && sb.status ? esc(sb.status.toLowerCase()) : "нет в справочнике"}</span>`;
    const g = (a.где || [])[0];
    const polya = (a.описание || []).filter((x) => !["заявленный дефект", "вид обращения"].includes(x.что));
    if (a.из_ячейки) polya.push({ что: "заактирован в", значение: a.из_ячейки });
    return `<div class="cCardHead"><div class="cCardHead__t">
        <div class="cAktNad">Акт №${esc(a.акт)} · ${esc(a.когда)} · ${esc(a.автор)}${a.статус ? ` · ${esc(a.статус.toLowerCase())}` : ""}</div>
        <h3 class="cAktTovar">${esc(a.товар)}</h3>
        <div class="cSub">${sb && sb.code ? `<span class="cChip">код ${esc(sb.code)}</span>` : ""}<span class="cChip">${esc(a.наклейка || "")}</span></div></div></div>
      ${a.особый ? `<div class="aktOsob"><b>${esc(a.особый)}</b><span>товар клиента, не уценка — отдельно</span></div>` : ""}
      <div class="cTiles cTiles--akt">
        <div class="cT cT--big cT--pol"><div class="cT__l">Себестоимость</div><div class="cT__v">${sebes}</div></div>
        <div class="cT cT--big cT--pol"><div class="cT__l">${a.цена_откуда === "сайт" ? "Цена на сайте" : "Цена в акте"}</div><div class="cT__v">${a.цена ? `<b class="cBig">${esc(rub(a.цена))}</b>` : '<span class="aNet" style="display:inline">—</span>'}${
          sb && Number.isFinite(sb.unitCost) && a.цена ? `<small>в ${(a.цена / sb.unitCost).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} раза к себесу</small>` : ""}</div></div>
        ${blokGdeAkta(a)}
        <div class="cT cT--def cT--pol">${a.живьём ? blokDefekta(a) : `<div class="aktDef"><span>Заявленный дефект</span><b>${esc(a.дефект || "—")}</b></div>`}</div>
        <div class="cT cT--vid cT--pol"><div class="cT__l">Вид обращения</div><div class="cT__v">${esc(a.вид || "—")}</div></div>
        ${polya.length ? `<div class="cT cT--opis"><div class="cT__l">Описание акта</div>
          <dl class="cOpis">${polya.map((x) => `<div><dt>${esc(x.что)}</dt><dd>${esc(x.значение)}</dd></div>`).join("")}${
            "<div class=\"cOpis__pus\"></div>".repeat((4 - (polya.length % 4)) % 4)}</dl></div>` : ""}
      </div>
      ${a.комментарии && a.комментарии.length ? `<p class="aktPs__zag">Комментарии</p><div class="aktKom cT">${a.комментарии.map((k) => `<p><span>${esc(k.когда)} · ${esc(k.кто)}</span>${esc(k.текст)}</p>`).join("")}</div>` : ""}
      ${window.AktDetal && a.акт ? window.AktDetal.blok(a.акт) : ""}`;
  }

  /* 30.09: «пока приехал, может поменяться дефект» — поменять заявленный дефект прямо в акте. */
  let defRed = null;   // null | { tekst, idet, oshibka, gotovo }
  function blokDefekta(a) {
    if (defRed && !defRed.gotovo) {
      return `<form class="aktDef aktDef--red" id="aktDefForma" autocomplete="off"><span>Заявленный дефект — новый текст уйдёт в акт в WMS</span>
        <textarea name="defekt" rows="3">${esc(defRed.tekst)}</textarea>
        ${defRed.oshibka ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(defRed.oshibka)}</b></p>` : ""}
        <div class="aktPs__vopros"><button class="aktPs__kn is-on" type="submit"${defRed.idet ? " disabled" : ""}>${defRed.idet ? "Сохраняю…" : "Сохранить в WMS"}</button>
          <button type="button" class="aktPs__kn" data-def-otmena${defRed.idet ? " disabled" : ""}>Отмена</button></div></form>`;
    }
    const mozhno = boevoy && vms.подключено;
    return `<div class="aktDef"><span>Заявленный дефект${defRed && defRed.gotovo ? " · изменён" : ""}</span><b>${esc(a.дефект || "—")}</b>
      ${mozhno ? '<button type="button" class="aLnk" data-def-red>изменить дефект</button>' : ""}</div>`;
  }
  async function sohranitDefekt(tekst) {
    defRed = { tekst, idet: true }; risovat();
    try {
      const otvet = await fetch("/__akt/defekt", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ акт: aktK.наклейка || String(aktK.акт), дефект: tekst }) });
      const d = await otvet.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS и сохраните дефект ещё раз"; defRed = { tekst }; return; }
      if (!otvet.ok || !d.готово) throw new Error(d.ошибка || `сервер ответил ${otvet.status}`);
      aktK.дефект = d.стало;
      (aktK.описание || []).forEach((x) => { if (x.что === "заявленный дефект") x.значение = d.стало; });
      defRed = { gotovo: true };
    } catch (oshibka) {
      defRed = { tekst, oshibka: oshibka.message || String(oshibka) };
    } finally {
      risovat();
    }
  }

  /* 30.09 вечер: новая паллета категории прямо отсюда — создали в вмс, сразу печать ШК
     (shk-pechat.js, принтер стола), «переложить в неё». */
  let novP = null;   // null | { idet, kat } | { gotovo: {...} } | { oshibka, kat }
  function knopkiNovoy(kat) {
    const k = String(kat || "").replace(" (спорно)", "").trim();
    if (!k || /^нет своей/.test(k)) return "";
    if (novP && novP.idet) return `<p class="aktPs__podskaz">Создаю паллету «${esc(novP.kat)}» в WMS…</p>`;
    if (novP && novP.gotovo) {
      const g = novP.gotovo;
      const f = window.ShkPechat ? window.ShkPechat.format() : "";
      return `<div class="cNov"><b>Паллета ${esc(g.имя)} создана${g.ячейка ? ` и стоит в «${esc(g.ячейка)}»` : ""}</b>
        ${g.ячейка_ошибка ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(g.ячейка_ошибка)}</b></p>` : ""}
        ${window.ShkPechat ? `<div class="cNov__shk">${window.ShkPechat.svg(g.штрихкод)}</div>` : ""}<span class="cNov__kod">${esc(g.штрихкод)}</span>
        <div class="aktPs__vopros"><button type="button" class="aktPs__kn is-on" data-nov-v="${esc(g.штрихкод)}">Переложить в неё</button>
          <button type="button" class="aktPs__kn" data-nov-pechat="1">Печать ШК</button></div>
        ${window.ShkPechat ? `<label class="cNov__fmt">этикетка <select data-nov-format>${window.ShkPechat.formaty.map((x) => `<option${x === f ? " selected" : ""}>${x}</option>`).join("")}</select> мм</label>
          <label class="cNov__fmt"><input type="checkbox" data-nov-pov${window.ShkPechat.povorot && window.ShkPechat.povorot(f) ? " checked" : ""}> печатает боком — повернуть</label>` : ""}</div>`;
    }
    const varianty = k.split("/").map((x) => x.trim()).filter(Boolean);
    return `${novP && novP.oshibka ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(novP.oshibka)}</b></p>` : ""}
      <div class="cNov__knopki">${varianty.map((x) => `<button type="button" class="aktPs__kn cNov__kn" data-nov-kat="${esc(x)}">+ новая паллета «${esc(x)}»</button>`).join("")}</div>`;
  }
  async function novayaPalleta(kat) {
    if (novP && novP.idet) return;
    novP = { idet: true, kat }; risovat();
    try {
      const o = await fetch("/__wms/palleta", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ категория: kat, сохранить: true, откуда: "пикалка" }) });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом «новая паллета» ещё раз"; novP = null; risovat(); return; }
      if (!o.ok || !d.готово) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      novP = { gotovo: d };
      if (navigator.vibrate) navigator.vibrate(120);
      if (window.ShkPechat) window.ShkPechat.pechat({ shk: d.штрихкод, imya: d.имя, kategoriya: d.категория });
    } catch (oshibka) {
      novP = { oshibka: oshibka.message || String(oshibka), kat };
    }
    risovat();
  }

  /* 30.09: скан акта → категория → пик паллеты — штука с актом едет в эту паллету (живьём). */
  let aktPer = null;   // null | { idet } | { vopros: { kod, tekst } } | { itog: { ok, zag, tekst, zakaz } }
  /* 02.10: штуку с СЦ держит чужой заказ — удалить его во ВТИС, как Гамлет руками; резерв в ВМС
     снимает робот wtis. Номер сервер берёт из резерва самой штуки. */
  let vtisZ = null;    // null | { zhdu } | { idet } | { oshibka } | ответ /__akt/vtis_zakaz
  function blokVtis(r) {
    if (r.ok || !r.zakaz) return "";
    if (!vtisZ) return `<button type="button" class="aktPs__kn" data-vtis="pokazat">Снять резерв заказа ${esc(r.zakaz)} во ВТИС…</button>`;
    if (vtisZ.zhdu) return '<p class="aktPs__chto">Открываю заказ во ВТИС…</p>';
    if (vtisZ.idet) return '<p class="aktPs__chto">Снимаю резерв во ВТИС — несколько секунд…</p>';
    // 06.10 Степан: «если нельзя снять с резерва — пишешь исключительный случай, автоматизировать нельзя,
    // только снимать с заказа через ХД»
    if (vtisZ.oshibka) return `<div class="aktPs__gotovo is-oshibka"><b>Исключительный случай — снять резерв сайт не может</b>
      <span>Снять штуку с заказа ${esc(r.zakaz || "")} можно только через ХД: оформите заявку на снятие с заказа (акт, номер заказа).
      Штуку не кладите на паллету, пока её не снимут.</span><span class="aktPs__chto">${esc(vtisZ.oshibka)}</span></div>`;
    const z = vtisZ.заказ;
    if (vtisZ.готово) {
      return `<div class="aktPs__gotovo"><b>Резерв заказа ${esc(z.номер)} снят во ВТИС</b><span>${vtisZ.резерв_снят
        ? "резерв в ВМС снят — пикните паллету снова" : "ВМС ещё не сняла резерв — подождите минуту и пикните паллету снова"}</span></div>`;
    }
    return `<div class="aktPs__palleta aktPs__palleta--vopros"><p class="aktPs__zag">Снять резерв заказа ${esc(z.номер)} с этой штуки?</p>
      <p class="aktPs__podskaz">от ${esc(z.дата)} · ${esc(z.статус)}${z.создал ? ` · создал ${esc(z.создал)}` : ""}</p>
      ${z.примечание ? `<p class="aktPs__podskaz">«${esc(z.примечание)}»</p>` : ""}
      <p class="aktPs__podskaz">Заказ держит ${esc(z.товар)} (акт ${esc(String(z.акт))}). Заказ останется, из него уйдёт только резерв этой штуки.</p>
      <div class="aktPs__vopros"><button type="button" class="aktPs__kn is-on" data-vtis="da">Снять резерв</button>
        <button type="button" class="aktPs__kn" data-vtis="net">Не надо</button></div></div>`;
  }
  async function vtisZakaz(chto) {
    if (chto === "net") { vtisZ = null; risovat(); vFokus(); return; }
    if (!aktK || (vtisZ && (vtisZ.zhdu || vtisZ.idet))) return;
    const sohr = chto === "da";
    vtisZ = sohr ? { idet: true } : { zhdu: true }; risovat();
    try {
      const o = await fetch("/__akt/vtis_zakaz", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ акт: aktK.наклейка || String(aktK.акт), сохранить: sohr }),
      });
      const d = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      vtisZ = d;
      if (d.готово && d.резерв_снят) aktK.где = (aktK.где || []).map((x) => ({ ...x, заказ: "" }));
    } catch (e) {
      vtisZ = { oshibka: e.message || String(e) };
    }
    risovat(); vFokus();
  }
  function blokAktPer(a, krupno = false) {
    if (aktPer && aktPer.itog && krupno) {   // 08.10: сам итог — крупно наверху панели (bolshoyItog)
      const r = aktPer.itog;
      return `${blokVtis(r)}<p class="aktPs__chto">${r.ok ? "Пикните следующий акт." : "Пикните паллету ещё раз или переместите руками в WMS."}</p>`;
    }
    if (aktPer && aktPer.itog) {
      const r = aktPer.itog;
      return `<div class="aktPs__gotovo${r.ok ? "" : " is-oshibka"}"><b>${esc(r.zag)}</b><span>${esc(r.tekst)}</span></div>
        ${blokVtis(r)}
        <p class="aktPs__chto">${r.ok ? "Пикните следующий акт." : "Пикните паллету ещё раз или переместите руками в WMS."}</p>`;
    }
    if (aktPer && aktPer.vopros) {
      return `<div class="aktPs__palleta aktPs__palleta--vopros"><p class="aktPs__zag">Точно эта паллета?</p>
        <p class="aktPs__podskaz">${esc(aktPer.vopros.tekst)}</p>
        <div class="aktPs__vopros"><button type="button" class="aktPs__kn is-on" data-akt-da>Всё равно переместить</button>
          <button type="button" class="aktPs__kn" data-akt-net>Пикну другую</button></div></div>`;
    }
    if (!boevoy) return '<p class="aktPs__chto">Перемещение в паллету — когда актировку включат в админке.</p>';
    if (!vms.подключено) return '<p class="aktPs__podskaz">Войдите в WMS — тогда пик паллеты переложит штуку в неё.</p>';
    const kat = a.категория && !/^нет своей/.test(a.категория) ? ` «${esc(a.категория)}»` : "";
    if (krupno) {
      const idet = aktPer && aktPer.idet;
      return `<div class="cKuda"><p class="cKuda__zag">Куда положить</p>
        <p class="cKuda__chto">${idet ? "Перекладываю…" : `Пикните паллету <b>${a.категория && !/^нет своей/.test(a.категория) ? esc(a.категория) : "(CON …)"}</b>`}</p>
        <form class="cKuda__forma" id="aktPerForma" autocomplete="off">
          <input name="kod" placeholder="или номер паллеты" inputmode="numeric"${idet ? " disabled" : ""}>
          <button class="aktPs__kn is-on" type="submit"${idet ? " disabled" : ""}>Переложить</button></form>
        <p class="cKuda__pod">штука с актом переедет в эту паллету${stol ? ` · стол ${esc(String(stol.имя).replace(/^ФБ \(ДМД\) /, ""))}` : ""}</p>
        ${idet ? "" : knopkiNovoy(a.категория)}</div>`;
    }
    return `<div class="aktPs__palleta"><p class="aktPs__zag">Куда положить${stol ? ` · стол ${esc(stol.имя)}` : ""}</p>
      <p class="aktPs__podskaz">${aktPer && aktPer.idet ? "Перемещаю…" : `Пикните паллету${kat} (CON …) — штука с актом переедет в неё`}</p></div>`;
  }

  async function aktVPalletu(kod, podtverdil = false) {
    if (!aktK || (aktPer && aktPer.idet)) return;
    if (!vms.подключено) { formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом пикните паллету ещё раз"; risovat(); return; }
    aktPer = { idet: true }; vtisZ = null; risovat();
    try {
      const otvet = await fetch("/__akt/akt_v_palletu", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ акт: aktK.наклейка || String(aktK.акт), паллета: kod, стол: stol ? stol.имя : "",
          стол_id: stol ? stol.id : null, подтвердил: podtverdil }),
      });
      const d = await otvet.json().catch(() => ({}));
      if (d.предупреждение) { aktPer = { vopros: { kod, tekst: d.предупреждение } }; if (navigator.vibrate) navigator.vibrate([80, 60, 80]); return; }
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом пикните паллету ещё раз"; aktPer = null; return; }
      if (d.нужен_стол) { vyborStola = true; }   // 02.10: без стола перекладка не идёт — сразу выбор стола
      if (!otvet.ok || !d.готово) {
        const e = new Error(d.ошибка || `сервер ответил ${otvet.status}`);
        e.zakaz = d.заказ_втис || "";   // 02.10: чужой заказ — кнопка «удалить во ВТИС»
        throw e;
      }
      // 08.10: повторный пик той же паллеты после перекладки — сервер отвечает «уже»: зелёным, а не красным
      // «Не переместилось» поверх прошлого успеха (07.10 так 15 раз за день)
      if (d.уже) {
        aktPer = { itog: { ok: true, zag: `Уже на ${d.паллета}`, tekst: `штука уже лежит на этой паллете (${d.ячейка}) — перекладывать не нужно` } };
        nePerUbrat(aktK.акт);
        aktK.где = [{ паллета: d.паллета, ячейка: d.ячейка, зона: "", заказ: "" }];
        if (navigator.vibrate) navigator.vibrate(120);
        return;
      }
      // 01.10: штука с СЦ — по учёту в транзите, на паллету доедет сама (wms_sc_dmd)
      aktPer = d.через_сц ? { itog: { ok: true, zag: `Принято → ${d.паллета} · через СЦ`, tekst: `${d.через_сц} · перемещение №${d.перемещение}` } }
        : { itog: { ok: true, zag: `${d.проведено ? "Перемещено" : "Перемещение черновиком"} → ${d.паллета}`,
        tekst: `${d.откуда} → ${d.ячейка} · перемещение №${d.перемещение}${d.подходит === false ? " · паллета не своей категории" : ""}` } };
      nePerUbrat(aktK.акт);
      // исходный контейнер — «ячейка · паллета» из ответа; сменился — проверить, не остался ли хвост в прошлом
      const ist = String(d.откуда || "").split(" · ")[1] || "";
      if (ist && ist !== "без паллеты") {
        if (istKont && ist !== istKont) proveritOstatok(istKont);
        istKont = ist;
      }
      aktK.где = [{ паллета: d.паллета, ячейка: d.ячейка, зона: "", заказ: "" }];
      if (navigator.vibrate) navigator.vibrate(120);
    } catch (oshibka) {
      aktPer = { itog: { ok: false, zag: "Не переместилось", tekst: oshibka.message || String(oshibka), zakaz: oshibka.zakaz || "" } };
    } finally {
      if (aktPer && aktPer.idet) aktPer = null;
      if (aktPer && aktPer.itog && aktK && aktK.акт) PikIst.dobavit({ vid: "акт", kod: aktK.наклейка || String(aktK.акт), akt: aktK.акт,
        n: aktK.товар, itog: aktPer.itog.zag, ok: aktPer.itog.ok });
      risovat(); vFokus();
    }
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
    wmsZakryt();
    aktK = null;
    yach = { zhdu: true, kod };
    pal = null; tovar = null; vRezhimPalety(true);
    risovat();
    try {
      const o = await fetch(`/__yacheyka/karta?kod=${encodeURIComponent(kod)}`, { cache: "no-store" });
      const d = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      yach = { ...d, kod };
    } catch (e) {
      yach = { oshibka: e.message || String(e), kod };
    }
    risovat();
  }

  function risovatYacheyku() {
    const y = yach;
    if (y.zhdu) { vyvesti('<p class="aktPs__chto">Смотрю ячейку в WMS — большая ячейка до полуминуты…</p>', shapkaDey("Ячейка", "смотрю в WMS…")); return; }
    if (y.oshibka) { vyvesti(`<p class="aktPs__net"><b class="aktPs__oshibka">${esc(y.oshibka)}</b></p>`, ""); return; }
    const panel = Boolean(deyEl());
    const glav = `<header class="aktPs__shapka">
        <div><p class="aktPs__nad">${esc(y.ячейка)}</p>
          <p class="aktPs__rezhim">${esc(y.зона)}${y.склад ? ` · ${esc(y.склад)}` : ""}</p></div>
        ${panel ? "" : '<button type="button" class="aktPs__kn" data-yach-uz="1">Универсальное задание</button>'}
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
    if (!panel) { box.innerHTML = glav; return; }
    vyvesti(glav, `${shapkaDey("Ячейка", y.ячейка, `<span class="cDey__pod">${esc(y.зона)}</span>`)}
      <div class="cCifry"><div><b>${y.паллеты.length}</b><span>паллет</span></div><div><b>${y.штук}</b><span>шт</span></div>
        <div class="${y.без_акта ? "is-vazhno" : ""}"><b>${y.без_акта}</b><span>без акта</span></div></div>
      <p class="aktPs__chto">Нажмите паллету слева — её состав, актировка и перемещение откроются здесь.</p>
      <div class="cDey__niz"><button type="button" class="aktPs__kn" data-yach-uz="1">Универсальное задание</button></div>`);
  }

  // Строка состояния площадки (27.09, «где сам тест и где вход в WMS»): вход в
  // WMS, стол и включена ли актировка — видно сразу, до первого пика.
  let formaPolosy = false;
  // 07.10 ночь: «у каждого, кому выставлена ошибка, это должно светиться — кто, когда, почему»
  let moiOsh = null;
  async function zagruzitMoiOsh() {
    try {
      const o = await fetch("/__akt/oshibki/moi", { cache: "no-store" });
      if (!o.ok) return;
      const n = (await o.json()).строки || [];
      const bylo = JSON.stringify(moiOsh);
      moiOsh = n;
      if (bylo !== JSON.stringify(n)) risovatPolosu();
    } catch { /* следующая попытка через 5 минут */ }
  }
  setTimeout(zagruzitMoiOsh, 2500);
  setInterval(zagruzitMoiOsh, 300000);
  function pokazatMoiOsh() {
    let m = document.getElementById("moiOshModal");
    if (!m) { m = document.createElement("div"); m.id = "moiOshModal"; m.className = "cModal"; document.body.appendChild(m); }
    const st = moiOsh || [];
    m.innerHTML = `<div class="cModal__fon" data-moi-osh-zakryt="1"></div><section class="cModal__okno cModal__okno--shir" role="dialog" aria-label="Ошибки на мне">
      <header class="cModal__sh"><div><b>Ошибки на мне — ${st.length} за 30 дней</b><span>кто записал, когда и почему</span></div>
        <button type="button" class="cBtn cBtn--sm" data-moi-osh-zakryt="1">закрыть</button></header>
      <div class="oshZh__tab"><table><thead><tr><th>Когда</th><th>Вид</th><th>Акт</th><th>Товар</th><th>Контейнер</th><th>Основание</th><th>Записал</th><th>Комментарий</th></tr></thead><tbody>
      ${st.map((x) => `<tr><td>${esc(x._когда)}</td><td><b>${esc(x["Вид ошибки"])}</b></td><td>${x["Номер акта"] ? `<button type="button" class="palStroka__aktKn" data-akt-detal="${esc(x["Номер акта"])}">${esc(x["Номер акта"])}</button>` : ""}</td><td>${esc(String(x["Товар"] || "").slice(0, 60))}</td>
        <td>${esc(x["Номер контейнера"])}</td><td>${esc(x.Основание || "")}</td><td>${esc(x._кто_записал)}</td><td>${esc(x["Комментарий"])}</td></tr>`).join("")}</tbody></table></div></section>`;
    m.hidden = false;
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-moi-osh]")) { pokazatMoiOsh(); return; }
    if (e.target.closest("[data-moi-osh-zakryt]")) { const m = document.getElementById("moiOshModal"); if (m) m.hidden = true; }
  });
  function risovatPolosu() {
    const u = document.getElementById("vmsPolosa");
    if (!u) return;
    // 30.09 Степан: «непонятно почему я за столом» — стол здесь больше не висит,
    // он виден только в карточке товара при актировке (со «сбросить»).
    const kto = !boevoy
      ? `<span class="aDot is-net"></span><span>WMS выключена в админке</span>`
      : vms.подключено
        ? `<span class="aDot"></span><span class="aWho__nm">WMS:</span><b>${esc(korotko(vms.имя))}</b>
           <button type="button" class="aLnk" data-polosa="vyyti">выйти</button>`
        : `<span class="aDot is-net"></span><span>без входа — только смотреть</span>
           <button type="button" class="aBtn aBtn--sm aBtn--vio" data-polosa="voyti">войти в WMS</button>`;
    u.innerHTML = `${kto}
      ${moiOsh && moiOsh.length ? `<button type="button" class="aBtn aBtn--sm moiOsh" data-moi-osh="1" title="Ошибки, записанные на вас за 30 дней">ошибки на мне: <b>${moiOsh.length}</b></button>` : ""}
      <button type="button" class="aBtn aBtn--sm vmsMass${massPik ? " is-on" : ""}" data-polosa="mass">массовый пик${massPik ? ` · <b>${korzina.length}</b>` : ""}</button>`;
    const f = document.getElementById("vmsVhod");
    if (f) f.innerHTML = formaPolosy && !vms.подключено ? `<form class="aktPs__vhod" id="vmsPolosaForma" autocomplete="off">
        <input name="login" placeholder="Логин WMS" autocapitalize="off" spellcheck="false" required>
        <input name="parol" type="password" placeholder="Пароль WMS" required>
        <button class="aktPs__kn is-on" type="submit">Войти</button>
        <p class="aktPs__chto">${oshibkaVhoda ? `<b class="aktPs__oshibka">${esc(oshibkaVhoda)}</b> · ` : ""}пароль не сохраняется — вход держится, пока его не закроет WMS</p>
      </form>` : "";
  }

  /* ── Массовый пик (29.09, Степан: «сначала много пикаешь, потом работаешь») ──
     Включён — пикнутая паллета не открывается, а встаёт в список; потом одно
     действие на весь список: актировка без акта, перемещение в ячейку, заказ ДБ
     (регламент: 5–7 контейнеров за раз). Паллеты обрабатываются по очереди. */
  let massPik = false;
  let korzina = [];          // [{kod, id, паллета, ячейка, штук, без_акта, zhdu, oshibka}]
  let korzRezhim = "";       // "" | "akt" | "per" | "db"
  let korzKrit = "", korzDefekt = "", korzSvoy = "";
  let korzLog = [];          // строки хода работы
  let korzPechat = [];       // 03.10: номера созданных актов — для печати одной кнопкой
  /* 03.10 Струков: «опцию печати актов брака в пикалке, после того как массово заактировали» — формы ВМС
     (наклейка 70×70 или акт A4) одной страницей, печать открывается сама. */
  function knopkiPechati(ids) {
    if (!ids.length) return "";
    const q = encodeURIComponent(ids.join(","));
    return `<div class="aktPs__vopros" style="margin-top:10px">
      <a class="aktPs__kn is-on" target="_blank" rel="noopener" href="/__akt/pechat?forma=nakleyka&akty=${q}">Печать наклеек 70×70 · ${ids.length}</a>
      <a class="aktPs__kn" target="_blank" rel="noopener" href="/__akt/pechat?forma=akt&akty=${q}">Акты A4</a></div>`;
  }
  let korzIdet = false;
  let korzVstavka = null;
  let korzPer = null;        // { yach, proverka: [...] }
  let korzDb = null;         // ответ проверки заказа ДБ
  let korzDbKuda = "";

  /* 02.10 (чат «Обновления пикалка»: «утилизируем много товаров одного скю, каждый имеет свой акт,
     и чтоб переместить все за раз»): в массовом пике пикают и наклейки актов — список актов,
     «+ такие же отсюда», потом одна паллета или ячейка — одно перемещение. */
  let korzAkty = [];     // [{kod, akt, товар, ячейка, паллета, zhdu, oshibka}]
  let aktyKuda = null;   // {palleta, yacheyka, proverka, idet, itog, oshibka}
  const aktIzKoda = (kod) => Number((String(kod).match(/(\d{5,12})\s*$/) || [])[1]);
  async function vKorzinuAkt(kod) {
    const akt = aktIzKoda(kod);
    if (!akt) return;
    if (korzAkty.some((x) => x.akt === akt)) { signal(`акт ${akt} уже в списке`); return; }
    if (korzAkty.length >= 200) { signal("в списке уже 200 актов — сначала переместите"); return; }
    const z = { kod, akt, zhdu: true };
    korzAkty.push(z); aktyKuda = null; risovat();
    try {
      const d = await chitat(`/__vms/akt?kod=${encodeURIComponent(`ACT ${String(akt).padStart(10, "0")}`)}`);
      // 07.10 «ну конечно делай в массовом»: непринятый в вмс акт в список не берём — стоп до «отложил в сторону»
      if (neprinyat(d)) {
        korzAkty.splice(korzAkty.indexOf(z), 1);
        risovat();
        stopPokazat(d);
        return;
      }
      const g = (d.где || [])[0] || {};
      Object.assign(z, { товар: d.товар || "", ячейка: g.ячейка || "", паллета: g.паллета || "", zhdu: false,
        категория: d.категория || "", спорно: !!d.спорно, product_id: d.product_id,
        oshibka: (d.где || []).length ? "" : "на складе этой штуки нет" });
    } catch (e) {
      Object.assign(z, { zhdu: false, oshibka: e.message || String(e) });
    }
    if (navigator.vibrate) navigator.vibrate(60);
    risovat();
  }
  async function aktyRyadom(akt) {
    signal("ищу такие же акты рядом…");
    const obrazec = korzAkty.find((k) => k.akt === akt) || {};
    try {
      const d = await chitat(`/__akt/akty_ryadom?kod=${encodeURIComponent(`ACT ${String(akt).padStart(10, "0")}`)}`);
      let novyh = 0;
      for (const x of d.акты || []) {
        if (korzAkty.some((k) => k.akt === x.акт)) continue;
        korzAkty.push({ kod: x.наклейка, akt: x.акт, товар: x.товар, ячейка: x.ячейка, паллета: x.паллета, zhdu: false,
          категория: obrazec.категория || "", спорно: !!obrazec.спорно });
        novyh++;
      }
      aktyKuda = null;
      signal(novyh ? `добавлено ${novyh} актов «${d.товар}» из ${d.паллета || d.ячейка}` : "других таких же актов там нет");
    } catch (e) {
      signal(e.message || String(e));
    }
    risovat();
  }
  async function aktyCel(chast, sohranit = false) {
    if (aktyKuda?.idet) return;
    if (!stol || !stol.id) {
      aktyKuda = { ...(aktyKuda || {}), ...chast, idet: false, oshibka: "Сначала выберите свой стол (CEL …)." };
      risovat(); return;
    }
    if (sohranit && String(aktyKuda?.proverka?.стол?.id) !== String(stol.id)) {
      aktyKuda = { ...(aktyKuda || {}), idet: false, proverka: null,
        oshibka: "Стол изменился после проверки — пикните место назначения ещё раз." };
      risovat(); return;
    }
    const gotovye = korzAkty.filter((x) => !x.zhdu && !x.oshibka);
    if (!gotovye.length) { signal("в списке нет актов, которые можно переместить"); return; }
    if (sohranit && !vms.подключено) { formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом «Переместить» ещё раз"; risovat(); return; }
    aktyKuda = { ...(aktyKuda || {}), ...chast, idet: true, oshibka: "" };
    if (!sohranit) aktyKuda.proverka = null;
    risovat();
    try {
      const o = await fetch("/__akt/akty_v_palletu", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ акты: gotovye.map((x) => x.kod), паллета: aktyKuda.palleta || "", ячейка: aktyKuda.yacheyka || "", сохранить: sohranit, стол_id: stol.id }) });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом «Переместить» ещё раз"; aktyKuda.idet = false; risovat(); return; }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      if (sohranit) {
        aktyKuda.itog = d;
        if (Array.isArray(d.перемещенные_акты)) {
          const uehali = new Set(d.перемещенные_акты);
          korzAkty = korzAkty.filter((x) => !uehali.has(x.akt));
        } else {
          // Совместимость с прежним сервером при раздельной выкладке файлов.
          const uehali = new Set((d.строки || []).map((x) => x.акт));
          const s_oshibkoy = new Set();
          (d.ошибки || []).forEach((e) => (d.строки || []).filter((x) => (x.паллета || "без паллеты") === e.откуда).forEach((x) => s_oshibkoy.add(x.акт)));
          korzAkty = korzAkty.filter((x) => !uehali.has(x.akt) || s_oshibkoy.has(x.akt));
        }
        if (navigator.vibrate) navigator.vibrate(120);
      } else {
        aktyKuda.proverka = d;
      }
    } catch (e) {
      aktyKuda.oshibka = e.message || String(e);
    }
    aktyKuda.idet = false;
    risovat();
  }
  function blokAktySpisok() {
    if (!korzAkty.length) return "";
    const gruppy = new Set();
    const stroki = korzAkty.map((x) => {
      const kl = `${x.товар}|${x.паллета}|${x.ячейка}`;
      const pervyy = !x.zhdu && !x.oshibka && !gruppy.has(kl);
      if (pervyy) gruppy.add(kl);
      return `<div class="palStroka${x.oshibka ? " is-bez" : ""}">
        <span class="palStroka__tovar">ACT ${x.akt} · ${esc(x.товар || "…")}${x.паллета || x.ячейка ? ` <i class="palStroka__kach">${esc(x.паллета || x.ячейка)}</i>` : ""}</span>
        <span class="palStroka__kat">${x.категория ? `<b>${esc(x.категория)}</b>${x.спорно ? ' <span class="aTag aTag--spor">спорно</span>' : ""}` : x.zhdu ? "" : '<i class="palStroka__nokat">категория —</i>'}</span>
        <span class="palStroka__sht">${x.zhdu ? "…" : x.oshibka ? `<b class="aktPs__oshibka">${esc(x.oshibka)}</b>` : pervyy ? `<button type="button" class="aLnk" data-ka-ryadom="${x.akt}">+ такие же отсюда</button>` : ""}</span>
        <span class="palStroka__akt"><button type="button" class="korzX" data-ka-ubrat="${x.akt}" title="Убрать из списка">×</button></span>
      </div>`;
    }).join("");
    const poKat = {};
    korzAkty.forEach((x) => { if (x.категория) poKat[x.категория] = (poKat[x.категория] || 0) + 1; });
    const svod = Object.entries(poKat).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} — ${n}`).join(" · ");
    return `<p class="aktPs__zag">Акты · ${korzAkty.length}</p>${svod ? `<p class="aktPs__chto">${svod}</p>` : ""}<div class="palSpisok korzAkty">${stroki}</div>`;
  }
  function blokAktyKuda() {
    if (!korzAkty.length) return "";
    const k = aktyKuda || {};
    const n = korzAkty.filter((x) => !x.zhdu && !x.oshibka).length;
    let telo;
    if (k.itog) {
      const d = k.itog;
      telo = `<div class="aktPs__gotovo${(d.ошибки || []).length ? " is-oshibka" : ""}"><b>${d.проведено ? "Перемещено" : "Перемещение черновиком"}: ${d.перемещено || 0} шт → ${esc(d.куда.паллета || d.куда.ячейка)}</b>
        <span>${(d.документы || []).map((x) => `${esc(x.откуда)} — ${x.штук} шт`).join(" · ")}</span>
        ${(d.ошибки || []).map((x) => `<span class="aktPs__oshibka">${esc(x.откуда)}: ${esc(x.этап || "перемещение")}${x.на_стол ? ` · на стол №${esc(x.на_стол)}` : ""} · ${esc(x.ошибка)}</span>`).join("")}</div>
        ${(d.проблемы || []).length ? `<p class="aktPs__chto">не перемещены: ${d.проблемы.map((x) => `ACT ${x.акт} — ${esc(x.почему)}`).join("; ")}</p>` : ""}`;
    } else if (k.idet) {
      telo = `<p class="aktPs__podskaz">${k.proverka ? "Перемещаю…" : "Проверяю в WMS…"}</p>`;
    } else if (k.oshibka) {
      telo = `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(k.oshibka)}</b></p>
        <p class="aktPs__podskaz">${/нигде не стоит/.test(k.oshibka) ? "Пикните ячейку (CEL …), куда ставим паллету." : "Пикните паллету (CON …) или ячейку (CEL …) ещё раз."}</p>`;
    } else if (k.proverka) {
      const d = k.proverka;
      telo = `<p class="aktPs__podskaz">→ ${d.куда.паллета ? `<b>${esc(d.куда.паллета)}</b> в ` : ""}<b>${esc(d.куда.ячейка)}</b> · ${esc(d.куда.база)}</p>
        <p class="aktPs__chto">${d.стол ? `Через стол «${esc(d.стол.имя)}» · ` : ""}готово ${d.готово_к_перемещению} из ${n}${(d.проблемы || []).length ? ` · не пойдут: ${d.проблемы.length}` : ""}</p>
        ${(d.проблемы || []).slice(0, 8).map((x) => `<p class="aktPs__net">ACT ${x.акт}: ${esc(x.почему)}</p>`).join("")}
        ${d.готово_к_перемещению ? `<button type="button" class="aktPs__akt" id="aktyGo"${!boevoy || !vms.подключено ? " disabled" : ""}>${!boevoy ? "Актировка выключена в админке" : !vms.подключено ? "Войдите в WMS" : `Переместить ${d.готово_к_перемещению} шт`}</button>` : ""}`;
    } else {
      telo = `<p class="aktPs__podskaz">Пикните паллету (CON …) или ячейку (CEL …) — ${n} шт пройдут через выбранный стол, затем переедут туда; у каждой штуки свой акт.</p>`;
    }
    return `<div class="aktPs__palleta palPer"><p class="aktPs__zag">Переместить акты — ${n} шт</p>${telo}
      <div class="aktPs__vopros"><button type="button" class="aktPs__kn" data-ka-ochistit>Очистить акты</button></div></div>`;
  }

  /* 02.10 (Белитов: «приём контейнеров в пикалку для массового приёма в ДНЛ»): режим «Принять» у
     списка паллет — сайт по каждой узнаёт плановую ячейку приёма (как ТСД «Принять контейнер»),
     потом пик ячейки — принимает все, что запланированы в неё. */
  const PRIYOM_MARSHRUTY = ["ДМД→ДНЛ", "СЦ-ДМД→ДМД", "ДМД→СЦ-ДМД"];
  let priyom = null;     // { marshrut, plany: {id: {план, ошибка}}, idet, itogi }
  async function priyomProverit() {
    const m = priyom.marshrut;
    priyom.plany = {}; risovat();
    let i = 0;
    const spisok = korzina.filter((x) => !x.zhdu);
    const potok = async () => {
      while (i < spisok.length) {
        const x = spisok[i++];
        try {
          const d = await chitat(`/__wms/priyom/proverit?kod=${encodeURIComponent(`CON ${String(x.id).padStart(10, "0")}`)}&marshrut=${encodeURIComponent(m)}`);
          if (priyom && priyom.marshrut === m) priyom.plany[x.id] = d;
        } catch (e) {
          if (priyom && priyom.marshrut === m) priyom.plany[x.id] = { ошибка: e.message || String(e) };
        }
        risovat();
      }
    };
    await Promise.all([potok(), potok(), potok()]);
  }
  async function priyomYacheyka(kodYach) {
    if (!priyom || priyom.idet) return;
    if (!vms.подключено) { formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом пикните ячейку ещё раз"; risovat(); return; }
    const zhdut = korzina.filter((x) => priyom.plany[x.id] && !priyom.plany[x.id].ошибка && !priyom.plany[x.id].готово);
    if (!zhdut.length) { signal("в списке нет паллет, которые ждут приёма"); return; }
    priyom.idet = true; risovat();
    try {
      const o = await fetch("/__wms/priyom", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллеты: zhdut.map((x) => `CON ${String(x.id).padStart(10, "0")}`), ячейка: kodYach, маршрут: priyom.marshrut, сохранить: true }) });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом пикните ячейку ещё раз"; }
      else if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      for (const r of d.итоги || []) {
        const x = korzina.find((k) => k.id === r.id);
        if (!x) continue;
        if (r.готово) priyom.plany[x.id] = { ...priyom.plany[x.id], готово: true, ячейка: r.ячейка };
        else if (/не соответствует запланированной/i.test(r.ошибка || "")) priyom.plany[x.id] = { ...priyom.plany[x.id], другая: true };
        else priyom.plany[x.id] = { ...priyom.plany[x.id], ошибка: r.ошибка };
      }
      priyom.itog = `принято ${d.принято || 0} из ${zhdut.length}`;
      if (navigator.vibrate) navigator.vibrate(120);
    } catch (e) {
      priyom.itog = e.message || String(e);
    }
    priyom.idet = false; risovat();
  }
  function blokPriyoma() {
    if (!priyom) return "";
    const p = priyom;
    const gotovo = korzina.filter((x) => p.plany[x.id] && p.plany[x.id].готово).length;
    const gruppy = {};
    for (const x of korzina) {
      const q = p.plany[x.id];
      const kl = !q ? "…проверяю" : q.готово ? "✓ принято" : q.ошибка ? "не ждёт приёма" : (q.план || "ячейка не названа");
      (gruppy[kl] = gruppy[kl] || []).push({ x, q });
    }
    return `<div class="aktPs__palleta palPer"><p class="aktPs__zag">Принять паллеты · ${esc(p.marshrut)}${gotovo ? ` · принято ${gotovo}` : ""}</p>
      <div class="aktPs__krit">${PRIYOM_MARSHRUTY.map((m) => `<button type="button" class="aktPs__kn${m === p.marshrut ? " is-on" : ""}" data-pr-marshrut="${esc(m)}"${p.idet ? " disabled" : ""}>${esc(m)}</button>`).join("")}</div>
      ${Object.entries(gruppy).map(([kl, ryad]) => `<p class="aktPs__chto"><b>${esc(kl)}</b> — ${ryad.length}: ${ryad.map(({ x, q }) => `${esc(x.паллета)}${q && q.ошибка ? ` (${esc(q.ошибка)})` : q && q.другая ? " (другая ячейка)" : ""}`).join(", ")}</p>`).join("")}
      <p class="aktPs__podskaz">${p.idet ? "Принимаю — паллета за паллетой…" : "Поставьте паллеты в ячейку приёма и пикните её (CEL …) — примутся все, что запланированы в неё."}</p>
      ${p.itog ? `<p class="aktPs__chto">${esc(p.itog)}</p>` : ""}</div>`;
  }

  let korzAdr = false;   // массовый пик: адреса таблицей
  let korzKop = "";      // «скопировано …»
  function korzKopirovat(chto) {
    const g = korzina.filter((x) => !x.zhdu && !x.oshibka);
    const tekst = chto === "pal" ? g.map((x) => x.паллета).join("\n")
      : chto === "adr" ? g.map((x) => x.ячейка || "").join("\n")
      : ["паллета\tадрес\tшт"].concat(g.map((x) => `${x.паллета}\t${x.ячейка || ""}\t${x.штук}`)).join("\n");
    const gotovo = () => { korzKop = `скопировано: ${g.length} строк`; risovat(); setTimeout(() => { korzKop = ""; risovat(); }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tekst).then(gotovo, () => { korzKop = "не скопировалось — выделите таблицу мышкой"; risovat(); });
    else { korzKop = "не скопировалось — выделите таблицу мышкой"; risovat(); }
  }

  async function vKorzinu(kod) {
    const kid = Number((String(kod).match(/(\d{6,12})\s*$/) || [])[1]);
    if (!kid) return;
    if (korzina.some((x) => x.id === kid)) { signal(`${kod} уже в списке`); return; }
    if (korzina.length >= 2500) { signal("в списке уже 2500 паллет"); return; }
    const z = { kod, id: kid, паллета: kod, zhdu: true };
    korzina.push(z);
    korzDb = null; korzPer = null;
    risovat();
    try {
      const d = await chitat(`/__akt/palleta?kod=${encodeURIComponent(kod)}`);
      if (d.куда_варианты && d.куда_варианты.length) kudaVarianty = d.куда_варианты;
      Object.assign(z, { паллета: d.паллета || kod, ячейка: d.ячейка || "", без_акта: d.без_акта || 0,
        штук: (d.строки || []).reduce((n, x) => n + x.штук, 0), zhdu: false });
    } catch (e) {
      Object.assign(z, { oshibka: e.message || String(e), zhdu: false });
    }
    if (navigator.vibrate) navigator.vibrate(60);
    risovat();
  }

  // Вставка списка (29.09, «всю пачку вставить не смог»): поле скана — однострочное,
  // переносы строк пропадали и имена слипались. Ловим вставку до поля: если в ней
  // больше одной паллеты — включаем массовый пик и кладём все, по 4 параллельно.
  // Container labels exported from WMS can omit the name and leading zero.
  function palletCode(value) {
    const v = String(value || "").trim().replace(/^"(.*)"$/, "$1").replace(/[–—−]/g, "-").replace(/\u00a0/g, " ");
    const m = v.match(/^CON\s*(\d{5,12})$/i) || v.match(/^(?:[^\d\s].*-\s*)?(0\d{9})$/) || v.match(/^-\s*(\d{9,10})$/);
    return m && Number(m[1]) > 0 ? "CON " + m[1].padStart(10, "0") : "";
  }
  function vstavitPallety(tekst) {
    const stroki = String(tekst || "").split(/[\r\n,;\t]+/).map((x) => (window.latinica || String)(x.trim())).filter(Boolean);
    if (stroki.length < 2) return false;
    const akty = stroki.every((x) => /^(ACT|АКТ)\s?\d{5,12}$/i.test(x));
    const kody = stroki.map(palletCode);
    if (!akty && kody.some((x) => !x)) { signal("Список не загружен: проверьте неизвестные наклейки. Нужен один столбец паллет или актов."); return true; }
    if (korzVstavka) { signal("Дождитесь загрузки текущего списка паллет"); return true; }
    const naKlad = [...new Set(akty ? stroki : kody)];
    const existing = akty ? korzAkty.length : korzina.length;
    const additions = akty ? naKlad.length : naKlad.filter((k) => !korzina.some((x) => x.id === Number(k.slice(4)))).length;
    if (existing + additions > 2500) { signal("Список не загружен: максимум 2500 паллет или актов"); return true; }
    if (!massPik) { massPik = true; pal = null; aktK = null; yach = null; tovar = null; }
    korzVstavka = { total: naKlad.length, done: 0 };
    let i = 0;
    const potok = async () => {
      while (i < naKlad.length) {
        const k = naKlad[i++];
        if (akty) await vKorzinuAkt(k); else await vKorzinu(k);
        korzVstavka.done++; risovat();
      }
    };
    Promise.all([potok(), potok(), potok(), potok()]).finally(() => {
      korzVstavka = null; risovat(); signal(akty ? `В списке ${korzAkty.length} актов` : `В списке ${korzina.length} паллет`);
    });
    return true;
  }
  document.addEventListener("paste", (e) => {
    if (e.target.id !== "scan" || !aktivno) return;
    if (vstavitPallety((e.clipboardData || window.clipboardData)?.getData("text") || "")) e.preventDefault();
  });
  // 30.09: вставку списка паллет разбирает pikalka-a.js — WMS мог быть выключен, он включает и отдаёт сюда.
  document.addEventListener("wms:vstavka", (e) => { if (aktivno) vstavitPallety(e.detail); });

  function signal(tekst) {
    const m = document.getElementById("message");
    if (m) { m.textContent = tekst; m.className = "message warn"; }
  }

  let scQueue = null;
  let scQueueError = "";
  let scQueueBusy = false;
  let scQueueToken = "";
  async function scQueueRead() {
    if (!aktivno) return;
    try {
      const response = await fetch("/__akt/palleta/sc_queue", { cache: "no-store" });
      if (!response.ok) return;
      const d = await response.json();
      const next = JSON.stringify(d.очередь || null);
      if (next !== JSON.stringify(scQueue)) { scQueue = d.очередь || null; if (massPik) risovat(); }
    } catch (e) { /* next poll will recover */ }
  }
  async function scQueueAction(action) {
    if (scQueueBusy) return;
    if (action === "create" && korzVstavka) { signal("Дождитесь загрузки всего списка паллет"); return; }
    scQueueBusy = true; scQueueError = ""; risovat();
    try {
      if (action === "create" && !scQueueToken) scQueueToken = crypto.randomUUID().replaceAll("-", "");
      const o = await fetch("/__akt/palleta/sc_queue", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ действие: action, id: action === "create" ? scQueueToken : scQueue?.id,
          паллеты: action === "create" ? korzina.map((x) => `CON ${String(x.id).padStart(10, "0")}`) : undefined }) });
      const d = await o.json();
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      scQueue = d.очередь;
      if (action === "create") scQueueToken = "";
      // 07.10 «сбросить, чтоб заново начинать»: очередь закрыта — и список паллет масс. пика пустой
      if (action === "reset") { korzina = []; korzAkty = []; korzLog = []; aktyKuda = null; signal("Очередь сброшена — пикайте паллеты заново"); }
    } catch (e) { scQueueError = e.message || String(e); }
    finally { scQueueBusy = false; risovat(); }
  }
  function scQueueBlock() {
    if (!scQueue && !scQueueError) return "";
    const q = scQueue, counts = q?.счётчики || {};
    const names = { prepared: "Готова к запуску", running: "Обрабатывается", paused: "Пауза", cancelled: "Останавливается", finished: "Завершена" };
    const row = (r) => `<p class="aktPs__net"><b>${esc(r.паллета)}</b>: ${esc(r.ошибка || r.шаг || "")}${(r.резервы || []).length ? ` · обработаны резервы ${r.резервы.length} актов` : ""}${r.state === "review" ? " · требуется проверка WMS" : ""}
      ${Object.entries(r.документы || {}).filter(([k,v]) => /заказ_id|поступление|задание_/.test(k) && Number.isInteger(v)).map(([k,v]) => `<span>${esc(k.replaceAll("_", " "))} №${v}</span>`).join("")}</p>`;
    return `<div class="aktPs__palleta palPer"><p class="aktPs__zag">Очередь СЦ → ДМД${q ? ` · ${esc(names[q.состояние] || q.состояние)}` : ""}</p>
      ${q ? `<p class="aktPs__chto">Всего ${q.всего} · готовы ${counts.done || 0} · пропущены ${counts.skipped || 0} · проверить ${counts.review || 0} · ожидают ${counts.waiting || 0}</p>
        ${q.текущая ? `<p class="aktPs__podskaz">${esc(q.текущая.паллета)} · ${esc(q.текущая.шаг || "проверка")}</p>` : ""}
        ${q.причина ? `<p class="aktPs__podskaz">${esc(q.причина)}</p>` : ""}
        ${["prepared", "paused"].includes(q.состояние) ? `<p class="aktPs__podskaz">Полный круг до поступления на ДМД. Резервы нужных актов снимаются через ВТИС; при отказе у курьера снимаются только строки этих актов. Заказ целиком не удаляется. Если снять нельзя, вся паллета пропускается. Отремонтированное переводится в «Брак». Прогресс сохраняется на сервере.</p>
          <button type="button" class="aktPs__kn is-on" data-sc-queue="start"${scQueueBusy || !vhod() ? " disabled" : ""}>${!vhod() ? "Войдите в WMS" : q.состояние === "prepared" ? "Запустить очередь" : "Продолжить оставшиеся"}</button>` : ""}
        ${q.состояние === "running" ? `<button type="button" class="aktPs__kn" data-sc-queue="pause"${scQueueBusy ? " disabled" : ""}>Пауза после текущей паллеты</button>` : ""}
        ${["prepared", "running", "paused"].includes(q.состояние) ? `<button type="button" class="aktPs__kn" data-sc-queue="cancel"${scQueueBusy ? " disabled" : ""}>Отменить оставшиеся</button>` : ""}
        ${(q.проблемы || []).map(row).join("")}${(counts.skipped || 0) + (counts.review || 0) > 50 ? "<p>Показаны первые 50 проблемных паллет.</p>" : ""}
        ${(counts.skipped || 0) + (counts.review || 0) ? '<button type="button" class="aktPs__kn" data-sc-queue="report">Скачать список проблем</button>' : ""}
        ${q.состояние !== "running" ? `<button type="button" class="aktPs__kn" data-sc-queue="reset"${scQueueBusy ? " disabled" : ""} title="Закрыть очередь и очистить список — начать заново">Сбросить очередь</button>` : ""}` : ""}
      ${scQueueError ? `<p class="aktPs__net">${esc(scQueueError)}</p>` : ""}</div>`;
  }
  document.addEventListener("click", (e) => {
    const k = e.target.closest("[data-sc-queue]");
    if (k && vPaneli(e)) {
      if (k.dataset.scQueue === "reset" && !confirm("Сбросить очередь? Необработанные паллеты будут сняты, список очистится.")) return;
      if (k.dataset.scQueue === "report") scQueueReport(); else scQueueAction(k.dataset.scQueue);
    }
  });
  async function scQueueReport() {
    try {
      const o = await fetch("/__akt/palleta/sc_queue?report=1", { cache: "no-store" });
      if (!o.ok) throw new Error("не удалось получить список проблем");
      const d = await o.json();
      const cell = (x) => { const s = String(x || "").replace(/[\t\r\n]/g, " "); return /^[=+@-]/.test(s) ? "'" + s : s; };
      const text = ["Паллета\tСтатус\tПричина\tШаг\tДокументы\tРезервы", ...(d.строки || []).map((r) =>
        [r.паллета, r.state === "review" ? "Проверить WMS" : "Пропущена", r.ошибка, r.шаг,
          JSON.stringify(r.документы || {}), JSON.stringify(r.резервы || [])].map(cell).join("\t"))].join("\r\n");
      const url = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/tab-separated-values;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = "Паллеты — проблемы.tsv"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { scQueueError = e.message || String(e); risovat(); }
  }
  setInterval(scQueueRead, 4000);
  setTimeout(scQueueRead, 1500);

  function risovatKorzinu() {
    const sht = korzina.reduce((n, x) => n + (x.штук || 0), 0);
    const bez = korzina.reduce((n, x) => n + (x.без_акта || 0), 0);
    const spisok = korzina.map((x) => `<div class="palStroka${x.без_акта ? " is-bez" : ""}">
        <span class="palStroka__tovar">${esc(x.паллета)}${x.ячейка ? ` <i class="palStroka__kach">${esc(x.ячейка)}</i>` : ""}</span>
        <span class="palStroka__sht">${x.zhdu ? "…" : x.oshibka ? `<b class="aktPs__oshibka">${esc(x.oshibka)}</b>` : `${x.штук} шт`}</span>
        <span class="palStroka__akt">${x.zhdu ? "" : x.без_акта ? `без акта ${x.без_акта}` : "все с актом"}
          <button type="button" class="korzX" data-kz-ubrat="${x.id}" title="Убрать из списка"${korzIdet ? " disabled" : ""}>×</button></span>
      </div>`).join("");
    let blok = "";
    if (korzRezhim === "akt") {
      const def = korzDefekt;
      const gotov = korzKrit && def && bez && boevoy && vhod() && !korzIdet;
      blok = `<div class="aktPs__palleta palPer"><p class="aktPs__zag">Заактировать всё без акта — ${bez} шт на ${korzina.filter((x) => x.без_акта).length} паллетах</p>
        <div class="aktPs__krit">${KRIT.map((x) => `<button type="button" class="aktPs__kn${x.k === korzKrit ? " is-on" : ""}" data-kz-krit="${x.k}">${x.имя}</button>`).join("")}</div>
        <div class="aktPs__defekty">${DEFEKTY.map((d) => `<button type="button" class="aktPs__kn aktPs__kn--def${d.k === def && !korzSvoy ? " is-on" : ""}" data-kz-def="${esc(d.k)}">${esc(d.имя)}</button>`).join("")}</div>
        <input class="aktPs__svoy" id="korzSvoy" maxlength="80" autocomplete="off" placeholder="или свой дефект — одним текстом во все акты" value="${esc(korzSvoy)}">
        <button type="button" class="aktPs__akt" id="korzAktGo"${gotov ? "" : " disabled"}>${!vhod() ? "Войдите в WMS" : !korzKrit ? "Выберите крит или косм" : !def ? "Выберите дефект" : korzIdet ? "Идёт…" : `Заактировать ${bez} шт`}</button></div>`;
    } else if (korzRezhim === "per") {
      const p = korzPer || {};
      const oshibok = (p.proverka || []).filter((x) => x.oshibka).length;
      blok = `<div class="aktPs__palleta palPer"><p class="aktPs__zag">Переместить все паллеты в одну ячейку</p>
        ${!p.yach ? `<p class="aktPs__podskaz">Пикните ячейку, куда везёте (CEL …), или выберите:</p>${variantyKuda("data-kz-per-kuda")}`
          : `<p class="aktPs__podskaz">→ <b>${esc(p.yach)}</b>${p.proverka ? ` · проверено ${p.proverka.length} из ${korzina.length}${oshibok ? ` · <b class="aktPs__oshibka">не примет: ${oshibok}</b>` : ""}` : " · проверяю…"}</p>
          ${(p.proverka || []).filter((x) => x.uzhe).length ? `<p class="aktPs__chto">уже в этой ячейке: ${(p.proverka || []).filter((x) => x.uzhe).length} — двигать не нужно</p>` : ""}
          ${(p.proverka || []).filter((x) => x.oshibka).map((x) => `<p class="aktPs__net">${esc(x.паллета)}: ${esc(x.oshibka)}</p>`).join("")}
          ${p.hod ? `<p class="aktPs__podskaz"><b>Перемещаю: ${p.hod.sdelano + p.hod.oshibok} из ${p.hod.vsego}</b> · готово ${p.hod.sdelano}${p.hod.oshibok ? ` · <b class="aktPs__oshibka">не вышло ${p.hod.oshibok}</b>` : ""} — не закрывайте пикалку</p>`
            : p.proverka && p.proverka.length === korzina.length ? `<div class="aktPs__vopros">
            <button type="button" class="aktPs__kn is-on" id="korzPerGo"${korzIdet || !vhod() || !kDvizheniyu(p).length ? " disabled" : ""}>${!vhod() ? "Войдите в WMS" : `Переместить ${kDvizheniyu(p).length} паллет`}</button>
            ${oshibok ? `<p class="aktPs__chto">с замечаниями ${oshibok} — попробую и их; что вмс не примет, уйдёт в реестр ошибок</p>` : ""}
          </div>` : ""}`}</div>`;
    } else if (korzRezhim === "db") {
      const d = korzDb;
      if (!d) blok = `<div class="aktPs__palleta palPer"><p class="aktPs__podskaz">Проверяю заказ ДБ…</p></div>`;
      else if (d.oshibka) blok = `<div class="aktPs__palleta palPer"><p class="aktPs__net"><b class="aktPs__oshibka">${esc(d.oshibka)}</b></p></div>`;
      else {
        const oshibki = d.ошибки_вмс ? Object.entries(d.ошибки_вмс).map(([k, v]) => `${k}: ${[].concat(v).join(", ")}`).join("; ") : "";
        const kach = Object.entries(d.по_качеству || {}).map(([k, n]) => `${esc(k.toLowerCase())} ${n}`).join(" · ");
        blok = `<div class="aktPs__palleta palPer"><p class="aktPs__zag">На другой склад — один заказ ДБ</p>
          <p class="aktPs__podskaz">${d.паллет} паллет · ${esc(d.откуда)}${d.куда ? ` → <b>${esc(d.база_куда)}</b> · через «${esc(d.ячейка_отгрузки)}»` : " — куда везём?"}</p>
          ${(d.куда_можно || []).length > 1 ? `<div class="aktPs__krit">${d.куда_можно.map((k) => `<button type="button" class="aktPs__kn${k === d.куда ? " is-on" : ""}" data-kz-kuda="${esc(k)}"${korzIdet ? " disabled" : ""}>${esc(IMYA_MARSHRUTA[k] || k)}</button>`).join("")}</div>` : ""}
          <p class="aktPs__chto">${d.строк} строк · ${d.штук} шт${kach ? ` · ${kach}` : ""}${d.уже_в_заказе ? ` · ${d.уже_в_заказе} строк уже в заказе — пропущены` : ""}</p>
        ${(d.снимутся_с_заказов || []).length ? `<p class="aktPs__podskaz">${d.снимутся_штук || d.снимутся_с_заказов.length} шт в старых заказах — сайт снимет с них резерв во ВТИС и повезёт: ${esc(d.снимутся_с_заказов.join(", "))}</p>` : ""}
          ${d.стоп_небрак ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(d.стоп_небрак)}</b></p>` : ""}
          ${d.сменю_на_брак && !d.готово ? `<p class="aktPs__net"><b>Сначала переведу в «Брак» ${d.не_брак_штук} шт на ${(new Set((d.не_брак || []).map((x) => x.паллета))).size} паллетах, затем создам заказ ДБ на весь груз.</b>
            ${(d.не_брак || []).slice(0, 6).map((x) => `<span>${esc(x.паллета)} · ${esc(x.товар)} · ${esc(x.качество)}${x.акт ? ` · акт ${esc(x.акт)}` : ""}</span>`).join("")}</p>` : ""}
          ${oshibki ? `<p class="aktPs__net"><b class="aktPs__oshibka">WMS не примет: ${esc(oshibki)}</b></p>` : d.можно ? `<p class="aktPs__chto">Проверка пройдена. Заказ создаётся после смены качества и повторной проверки остатков.</p>` : ""}
          ${d.готово ? `<div class="aktPs__gotovo"><b>Заказ ${esc(d.номер)} создан и проведён${d.задание_id ? ` · отбор №${esc(d.задание_id)}` : ""}</b>
            ${(d.смена_качества || []).length ? `<span>Качество изменено на ${(d.смена_качества || []).length} паллетах.</span>` : ""}
            ${d.без_задания ? `<span class="aktPs__oshibka">${esc(d.без_задания)}</span>` : ""}
            ${d.вмс ? `<a href="${esc(d.вмс)}" target="_blank" rel="noopener">открыть в WMS</a>` : ""}</div>`
          : d.куда ? `<button type="button" class="aktPs__akt" id="korzDbGo"${!d.можно || d.стоп_небрак || oshibki || d.создание_включено === false || !boevoy || !vhod() || korzIdet ? " disabled" : ""}>${
            d.создание_включено === false ? "Создание заказа ДБ пока не включено" : !vhod() ? "Войдите в WMS" : korzIdet ? "Обрабатываю паллеты…" : d.сменю_на_брак ? `Перевести в брак и создать заказ ДБ — ${d.паллет} паллет` : `Создать заказ ДБ и отбор — ${d.паллет} паллет`}</button>` : ""}</div>`;
      }
    }
    const knopkiKorz = korzina.length ? `<div class="palKartaAkt__glav">
        <button type="button" class="aktPs__kn${korzRezhim === "akt" ? " is-on" : ""}" data-kz="akt"${bez && !(korzIdet || !!korzVstavka) ? "" : " disabled"}>Заактировать без акта</button>
        <button type="button" class="aktPs__kn${korzRezhim === "per" ? " is-on" : ""}" data-kz="per"${(korzIdet || !!korzVstavka) ? " disabled" : ""}>Переместить в ячейку</button>
        <button type="button" class="aktPs__kn" data-sc-queue="create"${(korzIdet || !!korzVstavka) || scQueueBusy || (scQueue && scQueue.состояние !== "finished") ? " disabled" : ""}>Полный круг СЦ → ДМД · весь список</button>
        <button type="button" class="aktPs__kn${korzRezhim === "db" ? " is-on" : ""}" data-kz="db"${(korzIdet || !!korzVstavka) || korzina.length > 10 ? " disabled" : ""}>На другой склад</button>
        <button type="button" class="aktPs__kn${korzRezhim === "priyom" ? " is-on" : ""}" data-kz="priyom"${(korzIdet || !!korzVstavka) ? " disabled" : ""}>Принять</button>
        <button type="button" class="aktPs__kn" data-kz="ochistit"${(korzIdet || !!korzVstavka) ? " disabled" : ""}>Очистить</button>
      </div>` : "";
    const log = (korzLog.length ? `<div class="aktPs__nomera korzLog">${korzLog.slice(-14).map((x) => `<p>${x}</p>`).join("")}</div>` : "")
      + (!korzIdet && korzPechat.length ? knopkiPechati(korzPechat) : "");
    // 01.10 (Белитов: «адреса таблицей, чтобы копировать столбиком — облегчило бы поиск паллет на продажу»)
    const gotovye = korzina.filter((x) => !x.zhdu && !x.oshibka);
    const tablica = korzAdr && gotovye.length ? `<table class="korzTab"><thead><tr>
        <th>паллета <button type="button" class="aLnk" data-kz-kop="pal">копировать</button></th>
        <th>адрес <button type="button" class="aLnk" data-kz-kop="adr">копировать</button></th>
        <th>шт</th></tr></thead><tbody>${gotovye.map((x) => `<tr><td>${esc(x.паллета)}</td><td>${esc(x.ячейка || "—")}</td><td>${x.штук}</td></tr>`).join("")}</tbody></table>` : "";
    const glav = `<header class="aktPs__shapka"><div><p class="aktPs__nad">Массовый пик · ${korzina.length} паллет</p>
        <p class="aktPs__rezhim">${sht} шт · без акта ${bez} · ${korzVstavka ? `загружаю ${korzVstavka.done} из ${korzVstavka.total}` : "пикайте ещё или выберите действие"}</p></div></header>
      ${korzina.length ? `<div class="korzAdrKn"><button type="button" class="aktPs__kn${korzAdr ? " is-on" : ""}" data-kz-adr>адреса таблицей</button>
        <button type="button" class="aktPs__kn" data-kz-kop="vse">копировать всё (в Excel)</button>${korzKop ? `<span class="aktPs__chto">${esc(korzKop)}</span>` : ""}</div>` : ""}
      ${tablica || (korzina.length ? `<div class="palSpisok">${spisok}</div>` : korzAkty.length ? "" : '<p class="aktPs__chto">Список пуст — пикайте паллеты (CON …), акты (ACT …) или вставьте список.</p>')}
      ${blokAktySpisok()}`;
    const akty = blokAktyKuda() + (korzRezhim === "priyom" ? blokPriyoma() : "");
    if (!deyEl()) { box.innerHTML = glav + knopkiKorz + blok + scQueueBlock() + akty + log; return; }
    vyvesti(glav, `${shapkaDey("Массовый пик", `${korzina.length} паллет${korzAkty.length ? ` · ${korzAkty.length} актов` : ""}`, `<span class="cDey__pod">${sht} шт · без акта ${bez}</span>`)}
      ${plashkaVms()}${formaVms()}
      ${knopkiKorz || (korzAkty.length ? "" : '<p class="aktPs__podskaz">Пикайте паллеты или акты подряд — действие потом одно на весь список.</p>')}
      ${blok}${scQueueBlock()}${akty}${log}`);
  }

  async function korzAktirovat() {
    korzIdet = true; korzLog = []; korzPechat = []; risovat();
    const defekt = korzDefekt;
    for (const x of korzina.filter((k) => k.без_акта)) {
      try {
        const o = await fetch("/__akt/palleta/start", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ паллета: String(x.id), дефект: defekt, крит: korzKrit }) });
        const d = await o.json().catch(() => ({}));
        if (d.нужен_вход) { vms = { подключено: false }; korzLog.push(`<b class="aktPs__oshibka">войдите в WMS</b>`); break; }
        if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
        let h = { идёт: true };
        while (h.идёт) {
          await new Promise((ok) => setTimeout(ok, 1200));
          try { h = await chitat(`/__akt/palleta/hod?id=${d.id}`); } catch (e) { /* сеть моргнула */ }
          if (h.ошибка) break;
        }
        korzLog.push(`${esc(x.паллета)}: актов ${(h.акты || []).length}${(h.ошибки || []).length ? ` · <b class="aktPs__oshibka">ошибок ${h.ошибки.length}</b>` : ""}`);
        zaSmenu += (h.акты || []).length;
        (h.акты || []).forEach((a) => korzPechat.push(a.акт));
        x.без_акта = Math.max(0, x.без_акта - (h.акты || []).length);
      } catch (e) {
        korzLog.push(`${esc(x.паллета)}: <b class="aktPs__oshibka">${esc(e.message || e)}</b>`);
      }
      risovat();
    }
    korzIdet = false; korzRezhim = ""; risovat();
    if (navigator.vibrate) navigator.vibrate(150);
  }

  async function korzProveritPer(yachKod) {
    korzPer = { yach: yachKod, proverka: [] }; risovat();
    for (const x of korzina) {
      try {
        const o = await fetch("/__akt/palleta/peremestit", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ паллета: String(x.id), ячейка: yachKod, сохранить: false }) });
        const d = await o.json().catch(() => ({}));
        if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
        const osh = d.ошибки_WMS || d.ошибки_вмс;
        // 06.10 (Мамян, 184 паллеты): «уже в этой ячейке» — не ошибка, а сделано: двигать нечего
        korzPer.proverka.push({ паллета: x.паллета, id: x.id, oshibka: osh ? Object.values(osh).flat().join("; ") : "", kuda: d.куда, uzhe: !!d.уже_там });
        if (d.куда) korzPer.yach = d.куда;
      } catch (e) {
        korzPer.proverka.push({ паллета: x.паллета, id: x.id, oshibka: e.message || String(e) });
      }
      risovat();
    }
    korzPer.kod = yachKod;
    risovat();
  }

  // к перемещению — всё, что прошло проверку и ещё не стоит в этой ячейке
  // 06.10: и те, что не прошли проверку, — пробуем (таймаут вмс пройдёт с повтором), настоящий отказ уйдёт в реестр ошибок
  function kDvizheniyu(p) { return (p.proverka || []).filter((k) => !k.uzhe); }

  async function korzPeremestit() {
    if (korzIdet || !korzPer) return;   // 06.10: второе нажатие во время хода не запускает второй проход
    const spisokPer = kDvizheniyu(korzPer);
    const uzhe = (korzPer.proverka || []).filter((k) => k.uzhe).length;
    korzIdet = true; korzLog = []; korzPer.hod = { vsego: spisokPer.length, sdelano: 0, oshibok: 0 }; risovat();
    let provedeno = 0, chernovik = 0;
    for (const x of spisokPer) {
      try {
        const o = await fetch("/__akt/palleta/peremestit", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ паллета: String(x.id), ячейка: korzPer.kod, сохранить: true }) });
        const d = await o.json().catch(() => ({}));
        if (d.нужен_вход) { vms = { подключено: false }; korzLog.push(`<b class="aktPs__oshibka">войдите в WMS</b>`); break; }
        if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
        korzPer.hod.sdelano += 1;
        if (d.уже_там) korzLog.push(`${esc(x.паллета)}: уже в ${esc(d.куда)}`);
        else {
          if (d.проведено) provedeno += 1; else chernovik += 1;
          korzLog.push(`${esc(x.паллета)} → ${esc(d.куда)}: перемещение${d.перемещение ? ` №${esc(d.перемещение)}` : ""} ${d.проведено ? "проведено" : "черновиком"}`);
        }
      } catch (e) {
        korzPer.hod.oshibok += 1;
        korzLog.push(`${esc(x.паллета)}: <b class="aktPs__oshibka">${esc(e.message || e)}</b> — в реестре ошибок`);
      }
      risovat();
    }
    const h = korzPer.hod;
    korzLog.push(`<b>Итог: перемещено ${h.sdelano} из ${h.vsego}</b>${provedeno ? ` · проведено ${provedeno}` : ""}${chernovik ? ` · черновиком ${chernovik}` : ""}`
      + `${uzhe ? ` · уже были там ${uzhe}` : ""}${h.oshibok ? ` · <b class="aktPs__oshibka">не вышло ${h.oshibok} — записаны в реестр ошибок</b>` : ""}`);
    korzIdet = false; korzRezhim = ""; korzPer = null; risovat();
    if (navigator.vibrate) navigator.vibrate(150);
  }

  async function korzProveritDb(sohranit = false) {
    if (korzIdet) return;
    if (sohranit && (!korzDb || !korzDb.можно || korzDb.готово || korzDb.стоп_небрак || !boevoy || !vhod())) return;
    const kuda = korzDbKuda || (korzDb && korzDb.куда) || "";
    korzIdet = true;
    if (!sohranit) korzDb = null;
    risovat();
    try {
      const o = await fetch("/__akt/palleta/zakaz_db", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллеты: korzina.map((x) => `CON ${String(x.id).padStart(10, "0")}`), куда: kuda, сохранить: sohranit }) });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaPolosy = true; oshibkaVhoda = "войдите в WMS, потом «Создать заказ ДБ» ещё раз"; throw new Error("войдите в WMS"); }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      korzDb = d;
      if (d.готово && navigator.vibrate) navigator.vibrate(150);
    } catch (e) {
      korzDb = { oshibka: e.message || String(e) };
    }
    korzIdet = false;
    risovat();
  }

  function risovat() {
    if (!aktivno) return;
    risovatPolosu();
    if (massPik) { box.hidden = false; vRezhimPalety(true); risovatKorzinu(); return; }
    if (aktK && !pal) { box.hidden = false; risovatAkt(); box.insertAdjacentHTML("afterbegin", knopkaNazad()); return; }
    if (yach && !pal) { box.hidden = false; risovatYacheyku(); return; }
    if (pal) { box.hidden = false; risovatPalletu(); box.insertAdjacentHTML("afterbegin", knopkaNazad()); return; }
    if (!tovar) { box.hidden = true; spryatatDey(); return; }
    box.hidden = false;
    risovatTovar();
  }

  function risovatTovar() {
    const r = RESHENIYA().find((x) => String(x.id) === String(reshenie));
    const shapka = `<header class="aktPs__shapka">
        <div><p class="aktPs__nad">${stol ? esc(stol.имя.replace(/^ФБ \(ДМД\) /, "")) : "Стол не выбран"}</p>
          <p class="aktPs__rezhim">${stol ? `сменить — пикните наклейку другого стола, <button type="button" class="vmsSmenit" data-smenit-stol="1">выберите</button> или <button type="button" class="vmsSmenit" data-stol-sbros="1">сбросить</button>` : "пикните наклейку стола (CEL …) — появятся его решения"}${
            boevoy ? "" : " · демо"}${zaSmenu ? ` · за смену ${zaSmenu}` : ""}</p></div>
        ${plashkaVms()}
      </header>${formaVms()}`;

    if (!stol || vyborStola) {
      vyvestiTovar(`${shapka}${oshibkaStola ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(oshibkaStola)}</b></p>` : ""}${blokStolov()}`);
      return;
    }

    if (gotovo) {
      vyvestiTovar(`${shapka}
        <div class="aktPs__gotovo"><b>Акт №${esc(gotovo.nomer)}</b>
          <span>${esc(gotovo.tovar)}</span><span>${esc(gotovo.reshenie)} · мех. повреждения, ${esc(gotovo.defekt)}</span>${gotovo.zametka ? `<span>${esc(gotovo.zametka)}</span>` : ""}</div>
        ${blokPalety()}`);
      return;
    }

    const n = RESHENIYA().length;
    const kolonok = n <= 5 ? n : 4;
    const gotovKnopka = defekt && krit && (!boevoy || vhod()) && !otkNado();
    // надпись готовой кнопки: с решением — «Заактировать», без решения или решение без акта — по-своему
    const nadpisAkta = r ? (r.акт ? "Заактировать" : "Всё равно заактировать") : "Заактировать без решения";
    const aktBlok = (zag) => `${blokOtkuda()}
        <p class="aktPs__zag">${zag}</p>
        <div class="aktPs__krit">${KRIT.map((x) => `<button type="button" class="aktPs__kn${x.k === krit ? " is-on" : ""}" data-krit="${x.k}">${x.имя}</button>`).join("")}</div>
        <p class="aktPs__zag">Дефект</p>
        <div class="aktPs__defekty">${DEFEKTY.map((d) => `<button type="button" class="aktPs__kn aktPs__kn--def${d.k === defekt && !svoyDefekt ? " is-on" : ""}" data-def="${esc(d.k)}">${esc(d.имя)}</button>`).join("")}</div>
        <input class="aktPs__svoy" id="aktSvoy" maxlength="80" autocomplete="off" placeholder="или свой дефект — напишите" value="${esc(svoyDefekt)}">
        <button type="button" class="aktPs__akt" id="aktPsGo" data-gotov="${esc(nadpisAkta)}"${gotovKnopka ? "" : " disabled"}>${gotovKnopka ? esc(nadpisAkta) : otkNado() || (!krit ? "Выберите крит или косм" : !defekt ? "Выберите дефект" : "Войдите в WMS")}</button>
        <p class="aktPs__chto">Внутренний брак · качество брак · «мех. повреждения, ${esc(defekt || "…")}${krit ? ", " + krit : ""}» · ${esc(stol.имя)}${r ? ` → ${esc(r.куда)}` : ""} · комплектность ${/^некомплект/.test(defekt) ? "неполная" : "полная"}</p>
        ${oshibkaAkta ? `<p class="aktPs__net"><b class="aktPs__oshibka">Акт не создан:</b> ${esc(oshibkaAkta)}</p>` : ""}
        `;
    vyvestiTovar(`${shapka}
      <p class="aktPs__zag">Решение</p>
      <div class="aktPs__resheniya" style="grid-template-columns:repeat(${kolonok},minmax(0,1fr))">${RESHENIYA().map((x) => `<button type="button" class="aktPs__kn${String(x.id) === String(reshenie) ? " is-on" : ""}" data-resh="${x.id}" title="${esc(x.куда)}">${esc(x.имя)}</button>`).join("")}</div>
      ${r && !r.акт ? `<p class="aktPs__net">«${esc(r.имя)}» — обычно без акта: сразу на паллету ниже, а нужен акт — выберите дефект.</p>${blokPalety()}` : ""}
      ${aktBlok(r ? "Крит или косм" : "Крит или косм · решение можно не выбирать")}`);
  }
  function vyvestiTovar(deystviya) {
    if (!deyEl()) { box.innerHTML = deystviya + blokGde() + blokAktyTovara(); return; }
    vyvesti(blokGde() + blokAktyTovara(), `${shapkaDey("Штука", tovar.name || "")}${deystviya}`);
  }

  function vFokus() {
    const vvod = document.getElementById("scan");
    if (vvod) vvod.focus();
  }

  document.addEventListener("picker:hit", (e) => {
    if (!aktivno) return;
    if (pal && palTab === "sverka") { sverkaTovar(e.detail || {}); return; }   // 07.10: штука без акта на сверке
    wmsZakryt();
    tovar = e.detail; reshenie = ""; defekt = ""; krit = ""; gotovo = null; oshibkaAkta = ""; aktVsyo = false; novP = null;
    aktK = null; gdeT = null; yach = null; vozvrat = null; vyborStola = false;
    zagruzitTovar(tovar);
    zhdemPalletu = null; perItog = null; svezhiy = null;
    zagruzitOtkuda();
    if (pal && !(palRabota && palRabota.идёт)) { pal = null; vRezhimPalety(false); }
    risovat();
  });
  // С карточки паллеты «Заактировать» ведёт сюда с ?palleta=CON… — сразу её панель.
  const palIzAdresa = new URLSearchParams(location.search).get("palleta");
  if (palIzAdresa && naWms) setTimeout(() => otkrytPalletu(palIzAdresa), 300);

  document.addEventListener("picker:akt", (e) => {
    vozvrat = null;
    if (pal && palTab === "sverka") { sverkaAkt(e.detail.kod); return; }   // 07.10: на сверке акт отмечается, а не открывается
    if (massPik) { vKorzinuAkt(e.detail.kod); return; }
    otkrytAkt(e.detail.kod);
  });
  document.addEventListener("picker:palleta", (e) => {
    if (!zhdemPalletu) vozvrat = null;
    // После решения по товару — «куда положили» (перемещение);
    // просто так — актировка целой паллеты.
    if (zhdemPalletu) { peremestit(e.detail.kod); return; }
    if (zhdemOtkuda()) { otkudaPoPallete(e.detail.kod); return; }
    if (massPik && korzAkty.length && !korzina.length) { aktyCel({ palleta: e.detail.kod, yacheyka: "" }); return; }
    if (massPik) { vKorzinu(e.detail.kod); return; }
    if (aktK && aktK.живьём && aktK.где && aktK.где.length && !(aktPer && aktPer.itog && aktPer.itog.ok)) { aktVPalletu(e.detail.kod); return; }
    if (pal && palPer && palPer.zhdemPal) { peremestitPalletu(palPer.yach, false, e.detail.kod); return; }
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
    // ТСД (30.09, экран под телефон): ячейка — только в «брак в ячейке», без её содержимого.
    if (podTsd) { document.dispatchEvent(new CustomEvent("wms:yacheyka", { detail: { kod: e.detail.kod } })); return; }
    if (massPik && korzRezhim === "priyom" && priyom) { priyomYacheyka(e.detail.kod); return; }
    if (massPik && korzAkty.length && !korzina.length) {
      if (!stol || !stol.id) {
        try {
          const o = await fetch(`/__akt/stol?kod=${encodeURIComponent(e.detail.kod)}`, { cache: "no-store" });
          const d = await o.json().catch(() => ({}));
          if (!o.ok || !d.id) throw new Error("Сначала пикните наклейку своего стола (CEL …).");
          stol = d;
          localStorage.setItem(KLYUCH_STOLA, JSON.stringify({ день: segodnya(), стол: d }));
          aktyKuda = null;
          signal(`Стол: ${d.имя}. Теперь пикните место назначения.`);
        } catch (err) { signal(err.message || String(err)); }
        risovat(); return;
      }
      // ячейка: сама цель или место для паллеты, которая ещё нигде не стоит
      const p = aktyKuda && aktyKuda.oshibka && /нигде не стоит/.test(aktyKuda.oshibka) ? aktyKuda.palleta : "";
      aktyCel({ palleta: p || "", yacheyka: e.detail.kod }); return;
    }
    if (massPik && korzRezhim === "per" && !korzIdet) { korzProveritPer(e.detail.kod); return; }
    // Ждём ячейку для перемещения паллеты — наклейка ячейки идёт туда, а не в смену стола.
    if (pal && palPer && palPer.zhdem) { peremestitPalletu(e.detail.kod, false); return; }
    oshibkaStola = "";
    try {
      const otvet = await fetch(`/__akt/stol?kod=${encodeURIComponent(e.detail.kod)}`, { cache: "no-store" });
      const d = await otvet.json().catch(() => ({}));
      // Не стол — значит, просто ячейка: показываем, что в ней лежит (площадка WMS).
      if (otvet.status === 404) {
        if (zhdemOtkuda()) { otkVybor = { id: String(e.detail.kod).replace(/\D/g, "") }; oshibkaAkta = ""; risovat(); return; }
        otkrytYacheyku(e.detail.kod); return;
      }
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
  document.addEventListener("picker:miss", () => { if (aktivno) { tovar = null; risovat(); } });

  naPaneli("click", (e) => {
    const g = e.target.closest && e.target.closest("[data-pvyb]");
    if (!g || !pal) return;
    if (e.shiftKey && palPosledniy && palPosledniy !== g.dataset.pvyb) {
      const vidno = palNaydeno().map((x) => x.ключ);
      const a = vidno.indexOf(palPosledniy), b = vidno.indexOf(g.dataset.pvyb);
      if (a >= 0 && b >= 0) {
        if (!palVybor) palVybor = new Set(pal.строки.map((x) => x.ключ));
        for (const k of vidno.slice(Math.min(a, b), Math.max(a, b) + 1)) { if (g.checked) palVybor.add(k); else palVybor.delete(k); }
      }
    }
    palPosledniy = g.dataset.pvyb;
  });
  naPaneli("change", (e) => {
    if (e.target.matches && e.target.matches("[data-nov-format]") && window.ShkPechat) { window.ShkPechat.zadatFormat(e.target.value); risovat(); return; }
    if (e.target.matches && e.target.matches("[data-nov-pov]") && window.ShkPechat && window.ShkPechat.zadatPovorot) {
      window.ShkPechat.zadatPovorot(window.ShkPechat.format(), e.target.checked); return;
    }
    const g = e.target.closest("[data-pvyb]");
    if (!g || !pal) return;
    if (!palVybor) palVybor = new Set(pal.строки.map((x) => x.ключ));
    if (g.checked) palVybor.add(g.dataset.pvyb); else palVybor.delete(g.dataset.pvyb);
    if (palDb && palDb.predv) palDb = null;   // проверка была по другому выбору
    risovat();
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.id === "izlKod" && e.key === "Enter" && izl) { e.preventDefault(); e.stopPropagation(); izl.kod = e.target.value; izlNayti(); }
  }, true);
  naPaneli("input", (e) => {
    if (e.target.dataset && e.target.dataset.oshPole && oshAkt) { oshAkt[e.target.dataset.oshPole] = e.target.value; return; }
    if (e.target.id === "izlKod" && izl) { izl.kod = e.target.value; return; }
    if (e.target.dataset && "izlZap" in e.target.dataset && izl) { izl.zapisat = e.target.checked; return; }
    if (e.target.id === "palPoisk") {
      palPoisk = e.target.value;
      const poz = e.target.selectionStart;
      risovat();
      const pole = document.getElementById("palPoisk");
      if (pole) { pole.focus(); try { pole.setSelectionRange(poz, poz); } catch (x) { /* type=search */ } }
      return;
    }
    if (e.target.id === "palSvoy") {
      palSvoy = e.target.value;
      palDefekt = palSvoy.trim();
      vPanelyah("[data-pdef]").forEach((b) => b.classList.toggle("is-on", !palSvoy && b.dataset.pdef === palDefekt));
      const kn = document.getElementById("palGo");
      if (kn) { kn.textContent = tekstPalGo(); kn.disabled = !(palKrit && palDefekt && bezAktaVybrano() > 0 && boevoy && vhod()); }
    }
    if (e.target.id === "korzSvoy") {
      korzSvoy = e.target.value;
      korzDefekt = korzSvoy.trim();
      vPanelyah("[data-kz-def]").forEach((b) => b.classList.toggle("is-on", !korzSvoy && b.dataset.kzDef === korzDefekt));
      const kn = document.getElementById("korzAktGo");
      const bez = korzina.reduce((n, x) => n + (x.без_акта || 0), 0);
      if (kn) { kn.disabled = !(korzKrit && korzDefekt && bez && boevoy && vhod() && !korzIdet); kn.textContent = !korzKrit ? "Выберите крит или косм" : !korzDefekt ? "Выберите дефект" : `Заактировать ${bez} шт`; }
    }
    if (e.target.id === "aktSvoy") {
      svoyDefekt = e.target.value;
      defekt = svoyDefekt.trim();
      vPanelyah("[data-def]").forEach((b) => b.classList.toggle("is-on", !svoyDefekt && b.dataset.def === defekt));
      const kn = document.getElementById("aktPsGo");
      const gotov = defekt && krit && (!boevoy || vhod()) && !otkNado();
      if (kn) { kn.disabled = !gotov; kn.textContent = gotov ? (kn.dataset.gotov || "Заактировать") : otkNado() || (!krit ? "Выберите крит или косм" : !defekt ? "Выберите дефект" : "Войдите в WMS"); }
    }
  });

  naPaneli("input", (e) => {
    if (e.target.id !== "stolPoisk") return;
    const q = e.target.value.trim().toLowerCase();
    // display, а не hidden: у кнопок свой display, атрибут hidden им не указ
    vPanelyah("[data-stol-imya]").forEach((b) => { b.style.display = q && !b.dataset.stolImya.includes(q) ? "none" : ""; });
    vPanelyah("[data-stol-gr]").forEach((g) => {
      g.style.display = [...g.querySelectorAll("[data-stol-imya]")].some((b) => b.style.display !== "none") ? "" : "none";
    });
  });

  naPaneli("submit", async (e) => {
    if (e.target.id === "stolForma") {
      e.preventDefault();
      // раскладку переводим только для наклейки (СУД → CEL); «А1» по-русски так и ищем
      const vvod = e.target.kod.value.trim();
      const spisok = Array.isArray(stolyVse) ? stolyVse : [];
      const kod = (window.latinica || String)(vvod).match(/^(?:CEL)?\s*0*(\d{5,10})$/i);
      if (kod) {
        const est = spisok.find((x) => String(x.id) === kod[1]);
        if (est) { postavitStol(est); return; }
        try {
          const otvet = await fetch(`/__akt/stol?kod=${encodeURIComponent(kod[1])}`, { cache: "no-store" });
          const d = await otvet.json().catch(() => ({}));
          if (!otvet.ok) throw new Error(otvet.status === 404 ? "это не стол — такой наклейки нет среди столов" : d.ошибка || "стол не найден");
          postavitStol(d);
        } catch (oshibka) { oshibkaStola = oshibka.message || String(oshibka); risovat(); }
        return;
      }
      const q = vvod.toLowerCase();
      const vidno = spisok.filter((x) => imyaStola(x).toLowerCase().includes(q));
      const tochno = vidno.filter((x) => new RegExp(`(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(imyaStola(x).toLowerCase()));
      const vybor = vidno.length === 1 ? vidno[0] : tochno.length === 1 ? tochno[0] : null;
      if (vybor) postavitStol(vybor);
      else { oshibkaStola = vidno.length ? `под «${vvod}» ${vidno.length} столов — уточните` : `стола «${vvod}» нет`; risovat(); }
      return;
    }
    if (e.target.id === "palNbForma") {
      e.preventDefault();
      const kod = (window.latinica || String)(e.target.kod.value.trim());   // 01.10: сканер в русской раскладке (СЩТ → CON)
      if (kod && palDb) { dbNeBrak = kod; zakazDb(false); }
      return;
    }
    if (e.target.id === "palNaPalForma") {
      e.preventDefault();
      const kod = (window.latinica || String)(e.target.kod.value.trim());   // 01.10: сканер в русской раскладке (СЩТ → CON)
      if (kod && palPer) peremestitPalletu(palPer.yach, false, kod);
      return;
    }
    if (e.target.id === "palPerForma") {
      e.preventDefault();
      const kod = (window.latinica || String)(e.target.kod.value.trim());   // 01.10: сканер в русской раскладке (СЩТ → CON)
      if (kod) peremestitPalletu(kod, false);
      return;
    }
    if (e.target.id === "aktPerForma") {
      e.preventDefault();
      const kod = (window.latinica || String)(e.target.kod.value.trim());
      if (kod) aktVPalletu(/^CON/i.test(kod) ? kod : "CON " + kod.replace(/\D/g, "").slice(-10).padStart(10, "0"));
      return;
    }
    if (e.target.id === "aktDefForma") {
      e.preventDefault();
      const tekst = e.target.defekt.value.trim();
      if (tekst && !(defRed && defRed.idet)) sohranitDefekt(tekst);
      return;
    }
    if (e.target.id === "aktPalForma") {
      e.preventDefault();
      const kod = (window.latinica || String)(e.target.kod.value.trim());
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
    if (k.dataset.polosa === "mass") {
      if (korzIdet) return;
      massPik = !massPik;
      if (massPik) scQueueRead();
      if (massPik) { pal = null; aktK = null; yach = null; tovar = null; }
      else { korzina = []; korzRezhim = ""; korzLog = []; korzPer = null; korzDb = null; box.hidden = true; spryatatDey(); vRezhimPalety(false); }
      risovat();
      document.getElementById("scan")?.focus();
      return;
    }
    if (k.dataset.polosa === "vyyti") {
      await fetch("/__wms/vyyti", { method: "POST" }).catch(() => {});
      vms = { подключено: false }; risovat();
    }
  });

  // 08.10: штука свободна в нескольких ячейках — человек выбирает, откуда взял; пикалка переносит её на стол и актирует
  let otkudaVar = [];
  async function zagruzitOtkuda() {
    otk = null; otkVybor = null;
    if (!boevoy || !tovar || !stol || !stol.id) return;
    const t = tovar, s = stol;
    otk = { zhdu: true };
    try {
      const o = await fetch("/__akt/otkuda", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ товар: t.name, код: t.kod || "", стол_id: s.id }) });
      const d = await o.json().catch(() => ({}));
      if (tovar !== t) return;
      otk = o.ok ? d : { ошибка: d.ошибка || `сервер ответил ${o.status}` };
      if (otk.сам) otkVybor = otk.сам;
    } catch (oshibka) { if (tovar === t) otk = { ошибка: oshibka.message || String(oshibka) }; }
    if (tovar === t && !gotovo && !aktK && !pal) risovat();
  }
  // что мешает «Заактировать» со стороны «откуда»: пусто — ничего
  function otkNado() {
    if (!boevoy || !otk || otk.zhdu) return "";
    if (otk.уже_акт) return "Уже заактирована — откройте акт";
    if ((otk.варианты || []).length && !otkVybor) return "Выберите, откуда взяли";
    return "";
  }
  function otkudaTelo(otkuda) {
    if (otkuda) return { откуда_ячейка: otkuda };
    if (!otkVybor) return {};
    return otkVybor.id ? { откуда_ячейка: otkVybor.id } : { откуда: otkVybor };
  }
  // ждём «откуда»: тогда пик ячейки (не стола) или паллеты — это ответ, а не переход
  const zhdemOtkuda = () => aktivno && tovar && !gotovo && !aktK && !pal && !massPik && otk && (otk.варианты || []).length > 0;
  const cifry = (x) => String(x || "").replace(/\D/g, "").slice(-10).replace(/^0+/, "");
  function otkudaPoPallete(kod) {
    const c = cifry(kod);
    otkVybor = (otk.варианты || []).find((x) => cifry(x.контейнер) === c) || { контейнер: kod };
    oshibkaAkta = "";
    risovat();
  }
  function blokOtkuda() {
    if (!boevoy || !otk) return "";
    const zag = '<p class="aktPs__zag">Откуда взяли</p>';
    const mesto = (x) => `${esc(x.ячейка)}${x.контейнер ? ` · ${esc(x.контейнер)}` : ""}`;
    if (otk.zhdu) return `${zag}<p class="aktPs__chto">Смотрю в WMS, где штука…</p>`;
    if (otk.ошибка) return `${zag}<p class="aktPs__chto">WMS не ответила (${esc(otk.ошибка)}) — проверю при «Заактировать»</p>`;
    if (otk.на_столе) return `${zag}<p class="otkOk">✓ по WMS уже на столе</p>`;
    if (otk.уже_акт) return `${zag}<p class="aktPs__net"><b class="aktPs__oshibka">${esc(otk.уже_акт.текст)}</b></p>
      <div class="aktPs__vopros"><button type="button" class="aktPs__kn is-on" data-otk-akt="${esc(otk.уже_акт.акт)}">Открыть акт ${esc(otk.уже_акт.акт)}</button></div>`;
    if (otk.нет) return `${zag}<p class="aktPs__net"><b class="aktPs__oshibka">${esc(otk.нет)}</b></p>`;
    if (otk.буфер && otk.сам) return `${zag}<p class="otkOk">✓ возьму из «${mesto(otk.сам)}» на стол</p>`;
    const v = otk.варианты || [];
    const vy = otkVybor;
    const eto = (x) => vy && x.ячейка === vy.ячейка && (x.зона || "") === (vy.зона || "") && (x.контейнер || "") === (vy.контейнер || "");
    const vidno = v.slice(0, 8);
    const vybrano = vy ? `<p class="otkOk">✓ ${vy.ячейка ? mesto(vy) : vy.id ? `ячейка CEL ${esc(vy.id)}` : `паллета ${esc(vy.контейнер)}`} → перенесу на стол</p>` : "";
    return `${zag}${vybrano || '<p class="aktPs__podskaz">Пикните ячейку (CEL) или паллету (CON), откуда взяли, — или нажмите:</p>'}
      <div class="otkVar">${vidno.map((x, i) => `<button type="button" class="aktPs__kn${eto(x) ? " is-on" : ""}" data-otk="${i}">${mesto(x)} · ${esc(x.штук)} шт</button>`).join("")}</div>
      ${v.length > vidno.length ? `<p class="aktPs__chto">и ещё ${v.length - vidno.length} мест — пикните ячейку или паллету, откуда взяли</p>` : ""}`;
  }
  const pechatSvezhego = (n) => `<div class="aktPs__vopros svezhPechat">
      <a class="aktPs__kn is-on" target="_blank" rel="noopener" href="/__akt/pechat?forma=akt&akty=${encodeURIComponent(n)}">Печать акта</a>
      <a class="aktPs__kn" target="_blank" rel="noopener" href="/__akt/pechat?forma=nakleyka&akty=${encodeURIComponent(n)}">Наклейка 70×70</a></div>`;
  async function aktirovat(otkuda) {
    otkudaVar = [];
    const kn = document.getElementById("aktPsGo");
    kn.disabled = true;
    kn.textContent = "Создаю акт…";
    const r = RESHENIYA().find((x) => String(x.id) === String(reshenie));
    let nomerAkta = nomer++;
    oshibkaAkta = "";
    zametkaAkta = "";
    if (boevoy) {
      try {
        const otvet = await fetch("/__akt/sozdat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(r && r.акт
            ? { товар: tovar.name, код: tovar.kod || "", дефект: `${defekt}, ${krit}`, решение: r.имя, исход: r.id, ...otkudaTelo(otkuda) }
            : { товар: tovar.name, код: tovar.kod || "", дефект: `${defekt}, ${krit}`, решение: r ? r.имя : "без решения",
                стол_id: stol ? stol.id : null, ...otkudaTelo(otkuda) }),
        });
        const d = await otvet.json().catch(() => ({}));
        if (d.нужен_вход || /сессия вмс закончилась/.test(d.ошибка || "")) {
          vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом снова «Заактировать»";
          risovat(); return;
        }
        if (!otvet.ok || !d.акт) throw Object.assign(new Error(d.ошибка || `сервер ответил ${otvet.status}`), { ponyatno: !!d.понятно, varianty: d.варианты || [] });
        nomerAkta = d.акт;
        zametkaAkta = d.заметка || "";
      } catch (oshibka) {
        // 06.10: свой текст сервера («уже заактирована: акт …», «нет на столе — числится в …») — как есть
        oshibkaAkta = oshibka.ponyatno ? `${oshibka.message}.` : `${oshibka.message || oshibka}. Заактируйте руками в WMS.`;
        // сервер всё же спросил «откуда» (вмс за это время поменялась) — те же кнопки наверху, не ошибкой внизу
        if ((oshibka.varianty || []).length) { otk = { варианты: oshibka.varianty }; otkVybor = null; oshibkaAkta = ""; }
        risovat();
        return;
      }
    } else {
      await new Promise((ok) => setTimeout(ok, 400));
    }
    zaSmenu += 1;
    if (boevoy) PikIst.dobavit({ vid: "акт", kod: String(nomerAkta), akt: nomerAkta, n: tovar.name || "", itog: "заактирован", ok: true });
    if (boevoy) {
      // 08.10 Степан: «сразу после актирования ничего нельзя сделать — провалиться в меню работы заактированного
      // товара»: открываем карточку нового акта — там «куда положить», перекладка в паллету и печать акта
      svezhiy = { nomer: String(nomerAkta), zametka: zametkaAkta, reshenie: r ? `${r.имя} → ${r.куда}` : "" };
      otk = null; otkVybor = null; zhdemPalletu = null; perItog = null;
      if (navigator.vibrate) navigator.vibrate(120);
      otkrytAkt("ACT " + String(nomerAkta).padStart(10, "0"));
      vFokus();
      return;
    }
    gotovo = { nomer: nomerAkta, zametka: zametkaAkta, tovar: tovar.name || "", reshenie: r ? `${r.имя} → ${r.куда}` : "без решения", defekt: `${defekt}, ${krit}` };
    zhdemPalletu = r ? { ishod: r, akt: nomerAkta } : null;
    perItog = null;
    risovat();
    if (navigator.vibrate) navigator.vibrate(120);
    vFokus();
  }

  naPaneli("click", async (e) => {
    if (e.target.closest("#aktVmsVoyti")) {
      formaVhoda = !formaVhoda; oshibkaVhoda = ""; risovat();
      document.querySelector("#aktVmsForma input")?.focus();
      return;
    }
    if (e.target.closest("#aktVmsVyyti")) {
      await fetch("/__wms/vyyti", { method: "POST" }).catch(() => {});
      vms = { подключено: false }; risovat(); return;
    }
    const r = e.target.closest("[data-resh]");
    if (r) {
      reshenie = r.dataset.resh; oshibkaAkta = ""; perItog = null; aktVsyo = false;
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
      if (d) postavitStol(d);
      return risovat();
    }
    if (e.target.closest("[data-smenit-stol]")) { vyborStola = true; return risovat(); }
    if (e.target.closest("[data-stol-sbros]")) {
      stol = null; reshenie = ""; localStorage.removeItem(KLYUCH_STOLA);
      return risovat();
    }
    const iz = e.target.closest("[data-izl]");
    if (iz && pal) {
      e.preventDefault();
      const d = iz.dataset.izl;
      if (d === "otkryt") {
        const q = palPoisk.trim();
        izl = { kod: /^(act\s*)?\d{5,12}$/i.test(q) && !palNaydeno().length ? q : "", zapisat: true };
        risovat();
        const pole = document.getElementById("izlKod"); if (pole) pole.focus();
        if (izl.kod) izlNayti();
      } else if (d === "zakryt") { izl = null; risovat(); }
      else if (d === "nayti") { const pole = document.getElementById("izlKod"); if (pole) izl.kod = pole.value; izlNayti(); }
      else if (d === "perenesti") izlPerenesti(false, false);
      else if (d === "podtv") izlPerenesti(true, false);
      else if (d === "tolkoOsh") izlPerenesti(false, true);
      return;
    }
    const palNetKn = e.target.closest("[data-pal-net]");
    if (palNetKn && pal) { e.preventDefault(); palNet(palNetKn.dataset.palNet); return; }
    const ov = e.target.closest("[data-osh-vid]");
    if (ov && oshAkt) { oshAkt.vid = ov.dataset.oshVid; oshAkt.oshibka = ""; risovat(); return; }
    const oz = e.target.closest("[data-osh]");
    if (oz && oshAkt) {
      if (oz.dataset.osh === "zapisat") zapisatOshibku();
      else { oshAkt = { akt: oshAkt.akt, vid: "", kont: oshAkt.kont, komm: "" }; risovat(); }
      return;
    }
    const svk = e.target.closest("[data-sverka]");
    if (svk && pal && sverka) {
      const t = svk.dataset.sverka;
      if (t === "konec") sverkaKonec();
      else if (t === "excel") sverkaExcel();
      else { sverkaNachat(); risovat(); vFokus(); }
      return;
    }
    const pt = e.target.closest("[data-ptab]");
    if (pt && pal) {
      const t = pt.dataset.ptab;
      if (t === "sverka") { palPer = null; palDb = null; palTab = "sverka"; if (!sverka) sverkaNachat(); risovat(); vFokus(); return; }
      palTab = "";
      if (t === "priyom") {
        const kod = pal.паллета_id ? `CON ${String(pal.паллета_id).padStart(10, "0")}` : (pal.паллета || "");
        massPik = true; korzina = []; korzAkty = []; korzLog = []; korzPer = null; korzDb = null;
        pal = null; aktK = null; yach = null; tovar = null; palPer = null; palDb = null;
        korzRezhim = "priyom"; priyom = { marshrut: (priyom && priyom.marshrut) || "ДМД→ДНЛ", plany: {} };
        risovat();
        vKorzinu(kod).then(() => { if (korzRezhim === "priyom" && priyom) priyomProverit(); });
        return;
      }
      if (t === "per") { palDb = null; if (!palPer) palPer = { zhdem: true }; risovat(); vFokus(); return; }
      if (t === "db") { palPer = null; if (!palDb) { dbKuda = ""; dbNeBrak = ""; zakazDb(false); } else risovat(); return; }
      palPer = null; palDb = null; risovat(); vFokus(); return;
    }
    const zapomnit = () => { if (tovar && !vozvrat) vozvrat = { tovar, gdeT, aktyT, reshenie }; };
    const ao = e.target.closest("[data-akt-otkryt]");
    if (ao) { zapomnit(); otkrytAkt(ao.dataset.aktOtkryt); return; }
    if (e.target.closest("[data-nazad]") && vozvrat) {
      const v = vozvrat; vozvrat = null;
      pal = null; aktK = null; yach = null; palPer = null; istP = null; vRezhimPalety(false);
      tovar = v.tovar; gdeT = v.gdeT; aktyT = v.aktyT; reshenie = v.reshenie;
      return risovat();
    }
    if (e.target.closest("[data-yach-uz]") && yach && yach.kod) { wmsUz({ yacheyka: yach.kod, podpis: yach.ячейка }); return; }
    const po = e.target.closest("[data-pal-otkryt]");
    if (po && po.dataset.palOtkryt) { zapomnit(); otkrytPalletu(po.dataset.palOtkryt); return; }
    const pkk = e.target.closest("[data-pkk]");
    if (pkk && pal) {
      if (pkk.dataset.pkk === "excel") sostavVExcel();
      if (pkk.dataset.pkk === "uz") wmsUz({ palleta: `CON ${String(pal.паллета_id || "").padStart(10, "0")}`, podpis: (palKarta && palKarta.паллета) || pal.паллета });
      if (pkk.dataset.pkk === "peremestit") { palPer = { zhdem: true }; risovat(); vFokus(); }
      if (pkk.dataset.pkk === "istoriya" || pkk.dataset.pkk === "istoriya60") {
        const dney = pkk.dataset.pkk === "istoriya60" ? 60 : 10;
        istP = { zhdu: dney }; risovat();
        chitat(`/__vms/palleta_istoriya?kod=${encodeURIComponent(pal.паллета_id || pal.паллета)}&dney=${dney}`)
          .then((d) => { istP = d; }).catch((err) => { istP = { oshibka: err.message || String(err) }; })
          .finally(() => { if (pal) risovat(); });
      }
      if (pkk.dataset.pkk === "per-da" && palPer && palPer.yach) peremestitPalletu(palPer.yach, true, palPer.naPal || "");
      if (pkk.dataset.pkk === "per-net") { palPer = null; risovat(); vFokus(); }
      if (pkk.dataset.pkk === "db") { dbKuda = ""; dbNeBrak = ""; zakazDb(false); }
      if (pkk.dataset.pkk === "db-da" && palDb && palDb.predv) zakazDb(true);
      if (pkk.dataset.pkk === "scdmd" && palDb && palDb.predv) scDmd();
      if (pkk.dataset.pkk === "db-net") { palDb = null; risovat(); vFokus(); }
      if (pkk.dataset.pkk === "kopir") {
        const imya = (palKarta && palKarta.паллета) || pal.паллета;
        navigator.clipboard.writeText(imya).then(() => { pkk.textContent = "Скопировано"; setTimeout(() => { pkk.textContent = "Копировать"; }, 1500); });
      }
      return;
    }
    if (e.target.closest("[data-kz-adr]")) { korzAdr = !korzAdr; risovat(); return; }
    const kop = e.target.closest("[data-kz-kop]");
    if (kop) { korzKopirovat(kop.dataset.kzKop); return; }
    if (e.target.closest("[data-def-red]") && aktK) { defRed = { tekst: aktK.дефект || "" }; risovat(); document.querySelector("#aktDefForma textarea")?.focus(); return; }
    if (e.target.closest("[data-def-otmena]")) { defRed = null; risovat(); vFokus(); return; }
    if (e.target.closest("[data-akt-da]") && aktPer && aktPer.vopros) { aktVPalletu(aktPer.vopros.kod, true); return; }
    if (e.target.closest("[data-akt-net]")) { aktPer = null; risovat(); vFokus(); return; }
    const vt = e.target.closest("[data-vtis]");
    if (vt) { vtisZakaz(vt.dataset.vtis); return; }
    if (e.target.closest("[data-per-da]") && perVopros) { peremestit(perVopros.kod, true); return; }
    if (e.target.closest("[data-per-net]")) { perVopros = null; risovat(); vFokus(); return; }
    const pk = e.target.closest("[data-pkrit]");
    if (pk) { palKrit = pk.dataset.pkrit; return risovat(); }
    const pd = e.target.closest("[data-pdef]");
    if (pd) { palDefekt = pd.dataset.pdef; palSvoy = ""; return risovat(); }
    const pvk = e.target.closest("[data-per-kuda]");
    if (pvk && pal && palPer && palPer.zhdem) { peremestitPalletu(pvk.dataset.perKuda, false); return; }
    const kpk = e.target.closest("[data-kz-per-kuda]");
    if (kpk && massPik && korzRezhim === "per" && !korzIdet) { korzProveritPer(kpk.dataset.kzPerKuda); return; }
    const kz = e.target.closest("[data-kz]");
    if (kz && massPik) {
      const r = kz.dataset.kz;
      if (r === "ochistit") { korzina = []; korzAkty = []; aktyKuda = null; korzRezhim = ""; korzLog = []; korzPer = null; korzDb = null; return risovat(); }
      korzRezhim = korzRezhim === r ? "" : r;
      if (korzRezhim === "per") korzPer = null;
      if (korzRezhim === "db") { korzDbKuda = ""; korzProveritDb(); }
      if (korzRezhim === "priyom") { priyom = { marshrut: (priyom && priyom.marshrut) || "ДМД→ДНЛ", plany: {} }; priyomProverit(); } else priyom = null;
      return risovat();
    }
    const prm = e.target.closest("[data-pr-marshrut]");
    if (prm && priyom && !priyom.idet) { priyom = { marshrut: prm.dataset.prMarshrut, plany: {} }; priyomProverit(); return risovat(); }
    const kar = e.target.closest("[data-ka-ryadom]");
    if (kar) { aktyRyadom(Number(kar.dataset.kaRyadom)); return; }
    const kau = e.target.closest("[data-ka-ubrat]");
    if (kau) { korzAkty = korzAkty.filter((x) => String(x.akt) !== kau.dataset.kaUbrat); aktyKuda = null; return risovat(); }
    if (e.target.closest("[data-ka-ochistit]")) { korzAkty = []; aktyKuda = null; return risovat(); }
    if (e.target.closest("#aktyGo") && aktyKuda && aktyKuda.proverka) { aktyCel({}, true); return; }
    const ku = e.target.closest("[data-kz-ubrat]");
    if (ku && massPik) { korzina = korzina.filter((x) => String(x.id) !== ku.dataset.kzUbrat); korzDb = null; korzPer = null; return risovat(); }
    const kk = e.target.closest("[data-kz-krit]");
    if (kk) { korzKrit = kk.dataset.kzKrit; return risovat(); }
    const kd = e.target.closest("[data-kz-def]");
    if (kd) { korzDefekt = kd.dataset.kzDef; korzSvoy = ""; return risovat(); }
    const kdk = e.target.closest("[data-kz-kuda]");
    if (kdk) { korzDbKuda = kdk.dataset.kzKuda; korzProveritDb(); return; }
    if (e.target.closest("#korzAktGo")) { korzAktirovat(); return; }
    if (e.target.closest("#korzPerGo")) { korzPeremestit(); return; }
    if (e.target.closest("#korzDbGo") && !korzIdet && korzDb && korzDb.можно && !korzDb.готово && !korzDb.стоп_небрак) { korzProveritDb(true); return; }
    const dk = e.target.closest("[data-db-kuda]");
    if (dk && pal) { dbKuda = dk.dataset.dbKuda; zakazDb(false); return; }
    const pn = e.target.closest("[data-pvnay]");
    if (pn && pal) {
      const r = pn.dataset.pvnay;
      const vidno = palNaydeno().map((x) => x.ключ);
      if (!palVybor) palVybor = new Set(pal.строки.map((x) => x.ключ));
      if (r === "tolko") palVybor = new Set(vidno);
      if (r === "plus") vidno.forEach((k) => palVybor.add(k));
      if (r === "minus") vidno.forEach((k) => palVybor.delete(k));
      if (r === "pervye") {
        const n = Math.max(0, parseInt((document.getElementById("palPervye") || {}).value, 10) || 0);
        if (!n) return;
        palVybor = new Set(vidno.slice(0, n));
      }
      if (palDb && palDb.predv) palDb = null;
      return risovat();
    }
    const pv = e.target.closest("[data-pvsyo]");
    if (pv && pal) {
      const r = pv.dataset.pvsyo;
      palVybor = new Set(pal.строки.filter((x) => r === "vse" || (r === "bez" && x.без_акта)).map((x) => x.ключ));
      if (palDb && palDb.predv) palDb = null;
      return risovat();
    }
    if (e.target.closest("#palGo")) { palStart(); return; }
    if (e.target.closest("[data-akt-vsyo]")) { aktVsyo = true; return risovat(); }
    const nk = e.target.closest("[data-nov-kat]");
    if (nk) { novayaPalleta(nk.dataset.novKat); return; }
    if (e.target.closest("[data-akt-pechat]") && aktK && aktK.акт && window.ShkPechat) {
      window.ShkPechat.pechat({ shk: aktK.наклейка || `ACT ${String(aktK.акт).padStart(10, "0")}`,
        imya: String(aktK.товар || "").slice(0, 60), kategoriya: `Акт №${aktK.акт}${aktK.категория ? " · " + aktK.категория : ""}` });
      return;
    }
    if (e.target.closest("[data-nov-pechat]") && novP && novP.gotovo && window.ShkPechat) {
      const g = novP.gotovo; window.ShkPechat.pechat({ shk: g.штрихкод, imya: g.имя, kategoriya: g.категория }); return;
    }
    const nv = e.target.closest("[data-nov-v]");
    if (nv) {
      const kod = nv.dataset.novV;
      if (aktK && aktK.живьём) aktVPalletu(kod); else if (zhdemPalletu) peremestit(kod);
      return;
    }
    const kr = e.target.closest("[data-krit]");
    if (kr) { krit = kr.dataset.krit; oshibkaAkta = ""; return risovat(); }
    const d = e.target.closest("[data-def]");
    if (d) { defekt = d.dataset.def; svoyDefekt = ""; oshibkaAkta = ""; return risovat(); }
    const otkKn = e.target.closest("[data-otk]");
    if (otkKn && otk && otk.варианты) { otkVybor = otk.варианты[Number(otkKn.dataset.otk)] || null; oshibkaAkta = ""; return risovat(); }
    const otkAkt = e.target.closest("[data-otk-akt]");
    if (otkAkt) { otkrytAkt("ACT " + String(otkAkt.dataset.otkAkt).padStart(10, "0")); return; }
    if (e.target.closest("#aktPsGo")) aktirovat();
    const otkStar = e.target.closest("[data-otkuda]");
    if (otkStar) { aktirovat(otkStar.dataset.otkuda); return; }
  });
  // ── Включение и выключение режима (29.09 ночь) ─────────────────────────
  function vklyuchit() {
    if (aktivno) return;
    aktivno = true;
    window.__aktPs = true;   // script.js: наклейки CEL/CON/ACT есть кому принять
    ploshchadka();
    zagruzitSostoyanie();
    risovat();
  }
  function vyklyuchit() {
    if (!aktivno || korzIdet || (palRabota && palRabota.идёт)) return;
    aktivno = false;
    window.__aktPs = false;
    massPik = false; korzina = []; korzAkty = []; aktyKuda = null; korzRezhim = ""; korzLog = [];
    pal = null; tovar = null; aktK = null; yach = null; palPer = null; palDb = null; istP = null;
    zhdemPalletu = null; perItog = null; vozvrat = null;
    wmsZakryt();
    box.hidden = true; box.innerHTML = "";
    spryatatDey();
    vRezhimPalety(false);
    ubratPloshchadku();
  }
  document.addEventListener("wms:vkl", (e) => (e.detail ? vklyuchit() : vyklyuchit()));
  if (naWms) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", vklyuchit);
    else vklyuchit();
  }
})();
