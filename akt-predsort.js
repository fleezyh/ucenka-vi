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
  ];
  let tovar = null;
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
    const katT = tovar && window.PalletaProdazh ? (window.PalletaProdazh(tovar.rubric, tovar.cluster, tovar.rrc, tovar.name) || {}).imya : "";
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
  const IMYA_MARSHRUTA = { ДАНИЛОВО: "в Данилово", "СЦ-ДМД": "на СЦ-ДМД", ДОМОДЕДОВО: "в ДМД (РЦ)" };
  // Выбор части паллеты (29.09, «надо добавить выбор части паллет»): ключи строк.
  let palVybor = null;
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
    aktK = null; istP = null; palVybor = null; palSvoy = ""; palDb = null;
    tovar = null; gotovo = null; zhdemPalletu = null; perItog = null;
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
      palVybor = new Set((pal.строки || []).map((x) => x.ключ));
    } catch (e) {
      palOshibka = e.message || String(e);
      pal = { паллета: kod, ячейка: "", строки: [], без_акта: 0 };
    }
    risovat();
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
    const spisok = pal.строки.map((x) => `<label class="palStroka palStroka--vybor${x.без_акта ? " is-bez" : ""}${vkl(x) ? "" : " is-vykl"}">
        <input type="checkbox" data-pvyb="${esc(x.ключ)}"${vkl(x) ? " checked" : ""}${palRabota && palRabota.идёт ? " disabled" : ""}>
        <span class="palStroka__tovar">${esc(x.товар)}${x.качество && !/^брак$/i.test(x.качество) ? ` <i class="palStroka__kach">${esc(x.качество)}</i>` : ""}</span>
        <span class="palStroka__kat">${katPal(x)}</span>
        <span class="palStroka__sht">${x.штук} шт</span>
        <span class="palStroka__akt">${x.акт ? `акт №${x.акт}` : x.уже_нами && !x.без_акта ? "заактировано нами" : "без акта"}</span>
      </label>`).join("");
    const shtVybr = vybrano().reduce((n, x) => n + x.штук, 0);
    const bezVybr = bezAktaVybrano();
    const panelVybora = pal.строки.length > 1 ? `<div class="palVybor">
        <span>выбрано <b>${shtVybr}</b> из ${vsego} шт${bezVybr ? ` · без акта ${bezVybr}` : ""}</span>
        <button type="button" data-pvsyo="vse">все</button>
        <button type="button" data-pvsyo="bez">только без акта</button>
        <button type="button" data-pvsyo="nichego">снять</button>
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
    const glav = `<header class="aktPs__shapka">
        <div><p class="aktPs__nad">${esc(pal.паллета)}</p>
          <p class="aktPs__rezhim">${esc(pal.ячейка || "")}${vsego ? ` · без акта ${pal.без_акта} шт из ${vsego}` : ""}</p></div>
        ${est ? "" : plashkaVms()}
      </header>${est ? "" : formaVms()}
      ${blokKarty()}
      ${est ? "" : blokPeremeshcheniya() + blokDb()}
      ${blokIstorii()}
      ${spisok ? `${panelVybora}<div class="palSpisok">${spisok}</div>` : ""}
      ${est ? "" : niz}`;
    if (!est) { box.innerHTML = glav; return; }
    const tab = palPer ? "per" : palDb ? "db" : "akt";
    const zanyato = (palPer && palPer.idet) || (palDb && palDb.idet) || (palRabota && palRabota.идёт);
    const vkladki = [["akt", `Акт${bezVybr ? ` · <em>${bezVybr}</em>` : ""}`], ["per", "Переместить"], ["db", "На склад"]];
    vyvesti(glav, `${shapkaDey("Паллета", pal.паллета, `<span class="cDey__pod">${vseVybrany() ? `${vsego} шт` : `выбрано ${shtVybr} из ${vsego} шт`}</span>`)}
      ${plashkaVms()}${formaVms()}
      <div class="cSeg">${vkladki.map(([k, t]) => `<button type="button" class="${k === tab ? "is-on" : ""}" data-ptab="${k}"${zanyato && k !== tab ? " disabled" : ""}>${t}</button>`).join("")}</div>
      <div class="cDey__telo">${tab === "per" ? blokPeremeshcheniya() : tab === "db" ? blokDb() : niz}</div>
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
      telo = `<p class="aktPs__podskaz">${esc(d.паллета)} · ${esc(d.откуда)}${d.куда ? ` → <b>${esc(d.база_куда)}</b> · через «${esc(d.ячейка_отгрузки)}» · поток ${esc(d.поток)}` : " — куда везём?"}</p>
        ${marshruty}
        <p class="aktPs__chto">${d.паллет > 1 ? `${d.паллет} паллет · ` : ""}${d.строк} строк · ${d.штук} шт${kach ? ` · ${kach}` : ""}${d.уже_в_заказе ? ` · ${d.уже_в_заказе} строк уже в заказе — пропущены` : ""}</p>
        ${oshibki ? `<p class="aktPs__net"><b class="aktPs__oshibka">WMS не примет: ${esc(oshibki)}</b></p>` : ""}
        ${d.куда ? `<div class="aktPs__vopros">
          <button type="button" class="aktPs__kn is-on" data-pkk="db-da"${oshibki || !boevoy || !vhod() || !vkl ? " disabled" : ""}>${!vkl ? "Создание пока не включено" : !boevoy ? "WMS выключена" : !vhod() ? "Войдите в WMS" : "Создать заказ ДБ и отбор"}</button>
          <button type="button" class="aktPs__kn" data-pkk="db-net">Отмена</button>
        </div>
        <p class="aktPs__chto">${d.можно ? "WMS примет заказ и задание на отбор. " : ""}Дальше по регламенту: отбор «Создать перемещение с контейнером», задание на внутреннюю отгрузку, «Отгрузить», приёмка.</p>` : ""}`;
    } else if (p.gotovo) {
      telo = `<div class="aktPs__gotovo"><b>Заказ ${esc(p.gotovo.номер)} создан и проведён${p.gotovo.задание_id ? ` · отбор №${esc(p.gotovo.задание_id)}` : ""}</b>
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
  async function zakazDb(sohranit) {
    palDb = { idet: sohranit ? "Создаю заказ ДБ в WMS…" : "Проверяю в WMS — до полуминуты…" };
    risovat();
    try {
      const o = await fetch("/__akt/palleta/zakaz_db", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллета: String(pal.паллета_id || pal.паллета), строки: vyborDlyaServera(), куда: dbKuda, сохранить: sohranit }),
      });
      const d = await o.json().catch(() => ({}));
      if (d.нужен_вход) { vms = { подключено: false }; formaPolosy = true; oshibkaVhoda = "войдите в WMS, потом «Создать заказ ДБ» ещё раз"; palDb = null; risovat(); return; }
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      palDb = d.готово ? { gotovo: d } : { predv: d };
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
    aktK = { zhdu: true }; aktPer = null; defRed = null; novP = null; pal = null; yach = null; tovar = null; vRezhimPalety(true); risovat();
    try { aktK = await chitat(`/__vms/akt?kod=${encodeURIComponent(kod)}`); } catch (e) { aktK = { oshibka: e.message || String(e) }; }
    risovat();
  }

  function shagiAkta(a) {
    const itog = aktPer && aktPer.itog;
    const gotovo = itog && itog.ok;
    return `<div class="cShag3">
      <div class="${stol ? "is-ok" : "is-net"}"><i>1</i><span>стол</span><b>${stol ? esc(String(stol.имя).replace(/^ФБ \(ДМД\) /, "")) : "без стола"}</b></div>
      <div class="${a.категория ? "is-ok" : "is-net"}"><i>2</i><span>категория</span><b>${esc(a.категория || "нет")}</b></div>
      <div class="${gotovo ? "is-ok" : "is-sled"}"><i>3</i><span>паллета</span><b>${gotovo ? "переложена" : "пикните"}</b></div>
    </div>`;
  }

  function risovatAkt() {
    const a = aktK;
    if (a.zhdu) { vyvesti('<p class="aktPs__chto">Смотрю акт в WMS…</p>', shapkaDey("Акт", "смотрю в WMS…")); return; }
    if (a.oshibka) { vyvesti(`<p class="aktPs__net"><b class="aktPs__oshibka">${esc(a.oshibka)}</b></p>`, ""); return; }
    const est = a.живьём && a.где && a.где.length;
    const panel = Boolean(deyEl());
    const kat = a.живьём ? `<div class="aktKat"><span class="aktKat__nad">категория уценки${a.цена ? ` <b class="aktKat__cena">${esc(Number(a.цена).toLocaleString("ru-RU"))} ₽${a.цена_откуда === "сайт" ? " · цена сайта" : ""}</b>` : ""}</span>
        <b class="aktKat__imya">${esc(a.категория || "не определилась")}</b>${a.спорно ? ' <span class="aTag aTag--spor">спорно</span>' : ""}
        <span class="aktKat__rub">${a.мисбокс ? "цена до 1 000 ₽ — мистери бокс · " : ""}рубрика «${esc(a.рубрика || "—")}»${a.рубрика_вмс ? ` · ${esc(a.рубрика_вмс)}` : ""}</span></div>` : "";
    const vWms = `<div class="palKartaAkt__knopki"><a class="aktPs__kn" href="${esc(a.вмс || a.WMS)}" target="_blank" rel="noopener">Открыть акт в WMS</a></div>`;
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
          <span>${esc(g.ячейка)}${g.зона ? ` <span class="yachPalleta__zak">· ${esc(g.зона)}</span>` : ""}${g.база ? ` <span class="yachPalleta__zak">· база ${esc(g.база)}</span>` : ""}</span>
          ${g.заказ ? `<span class="yachPalleta__zak">заказ ${esc(g.заказ)}</span>` : ""}
        </button>`).join("")}</div>` : '<p class="aktPs__chto">На складе этой штуки уже нет — продана, списана или уехала.</p>'}
      ${panel ? "" : (est ? blokAktPer(a) : "") + vWms + otkuda}`;
    if (!panel) { box.innerHTML = glav; return; }
    vyvesti(glavAkta(a), `${shapkaDey("Акт", "№" + a.акт, a.особый ? `<span class="cDey__osob">${esc(a.особый)}</span>` : "")}
      ${plashkaVms()}${formaVms()}
      ${shagiAkta(a)}
      ${kat}
      ${est ? blokAktPer(a, true) : ""}
      <div class="cDey__niz">${vWms}</div>
      ${otkuda}`);
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
        <div class="cT cT--big"><div class="cT__l">Себестоимость</div><div class="cT__v">${sebes}</div></div>
        <div class="cT cT--big"><div class="cT__l">${a.цена_откуда === "сайт" ? "Цена на сайте" : "Цена в акте"}</div><div class="cT__v">${a.цена ? `<b class="cBig">${esc(rub(a.цена))}</b>` : '<span class="aNet" style="display:inline">—</span>'}${
          sb && Number.isFinite(sb.unitCost) && a.цена ? `<small>в ${(a.цена / sb.unitCost).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} раза к себесу</small>` : ""}</div></div>
        <div class="cT cT--big cT--gde"><div class="cT__l">Где сейчас</div><div class="cT__v">${g
          ? `<b class="cBig cBig--s">${esc(g.паллета || "без паллеты")}</b><small>${esc(g.ячейка)}${g.база ? ` · ${esc(g.база)}` : ""}${g.заказ ? ` · заказ ${esc(g.заказ)}` : ""}</small>`
          : '<span class="aNet" style="display:inline">на складе уже нет — продана, списана или уехала</span>'}</div></div>
        <div class="cT cT--def">${a.живьём ? blokDefekta(a) : `<div class="cT__l">заявленный дефект</div><div class="cT__v">${esc(a.дефект || "—")}</div>`}</div>
        <div class="cT cT--vid"><div class="cT__l">Вид обращения</div><div class="cT__v">${esc(a.вид || "—")}</div></div>
        ${polya.length ? `<div class="cT cT--opis"><div class="cT__l">Описание акта</div>
          <dl class="cOpis">${polya.map((x) => `<div><dt>${esc(x.что)}</dt><dd>${esc(x.значение)}</dd></div>`).join("")}</dl></div>` : ""}
      </div>
      ${(a.где || []).length > 1 ? `<p class="aktPs__zag">Где ещё</p><div class="yachPallety">${a.где.slice(1).map((x) => `
        <button type="button" class="yachPalleta yachPalleta--stolb" data-pal-otkryt="${esc(x.паллета)}"${x.паллета ? "" : " disabled"}>
          <span class="yachPalleta__imya">${esc(x.паллета || "без паллеты")}</span><span>${esc(x.ячейка)}</span></button>`).join("")}</div>` : ""}
      ${a.комментарии && a.комментарии.length ? `<p class="aktPs__zag">Комментарии</p><div class="aktKom cT">${a.комментарии.map((k) => `<p><span>${esc(k.когда)} · ${esc(k.кто)}</span>${esc(k.текст)}</p>`).join("")}</div>` : ""}`;
  }

  /* 30.09: «пока приехал, может поменяться дефект» — поменять заявленный дефект прямо в акте. */
  let defRed = null;   // null | { tekst, idet, oshibka, gotovo }
  function blokDefekta(a) {
    if (defRed && !defRed.gotovo) {
      return `<form class="aktDef aktDef--red" id="aktDefForma" autocomplete="off"><span>заявленный дефект — новый текст уйдёт в акт в WMS</span>
        <textarea name="defekt" rows="3">${esc(defRed.tekst)}</textarea>
        ${defRed.oshibka ? `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(defRed.oshibka)}</b></p>` : ""}
        <div class="aktPs__vopros"><button class="aktPs__kn is-on" type="submit"${defRed.idet ? " disabled" : ""}>${defRed.idet ? "Сохраняю…" : "Сохранить в WMS"}</button>
          <button type="button" class="aktPs__kn" data-def-otmena${defRed.idet ? " disabled" : ""}>Отмена</button></div></form>`;
    }
    const mozhno = boevoy && vms.подключено;
    return `<div class="aktDef"><span>заявленный дефект${defRed && defRed.gotovo ? " · изменён" : ""}</span><b>${esc(a.дефект || "—")}</b>
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
      return `<div class="cNov"><b>Паллета ${esc(g.имя)} создана</b>
        ${window.ShkPechat ? `<div class="cNov__shk">${window.ShkPechat.svg(g.штрихкод)}</div>` : ""}<span class="cNov__kod">${esc(g.штрихкод)}</span>
        <div class="aktPs__vopros"><button type="button" class="aktPs__kn is-on" data-nov-v="${esc(g.штрихкод)}">Переложить в неё</button>
          <button type="button" class="aktPs__kn" data-nov-pechat="1">Печать ШК</button></div>
        ${window.ShkPechat ? `<label class="cNov__fmt">этикетка <select data-nov-format>${window.ShkPechat.formaty.map((x) => `<option${x === f ? " selected" : ""}>${x}</option>`).join("")}</select> мм</label>` : ""}</div>`;
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
  let aktPer = null;   // null | { idet } | { vopros: { kod, tekst } } | { itog: { ok, zag, tekst } }
  function blokAktPer(a, krupno = false) {
    if (aktPer && aktPer.itog) {
      const r = aktPer.itog;
      return `<div class="aktPs__gotovo${r.ok ? "" : " is-oshibka"}"><b>${esc(r.zag)}</b><span>${esc(r.tekst)}</span></div>
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
    aktPer = { idet: true }; risovat();
    try {
      const otvet = await fetch("/__akt/akt_v_palletu", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ акт: aktK.наклейка || String(aktK.акт), паллета: kod, стол: stol ? stol.имя : "",
          стол_id: stol ? stol.id : null, подтвердил: podtverdil }),
      });
      const d = await otvet.json().catch(() => ({}));
      if (d.предупреждение) { aktPer = { vopros: { kod, tekst: d.предупреждение } }; if (navigator.vibrate) navigator.vibrate([80, 60, 80]); return; }
      if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в WMS, потом пикните паллету ещё раз"; aktPer = null; return; }
      if (!otvet.ok || !d.готово) throw new Error(d.ошибка || `сервер ответил ${otvet.status}`);
      aktPer = { itog: { ok: true, zag: `${d.проведено ? "Перемещено" : "Перемещение черновиком"} → ${d.паллета}`,
        tekst: `${d.откуда} → ${d.ячейка} · перемещение №${d.перемещение}${d.подходит === false ? " · паллета не своей категории" : ""}` } };
      aktK.где = [{ паллета: d.паллета, ячейка: d.ячейка, зона: "", заказ: "" }];
      if (navigator.vibrate) navigator.vibrate(120);
    } catch (oshibka) {
      aktPer = { itog: { ok: false, zag: "Не переместилось", tekst: oshibka.message || String(oshibka) } };
    } finally {
      if (aktPer && aktPer.idet) aktPer = null;
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
      <button type="button" class="aBtn aBtn--sm vmsMass${massPik ? " is-on" : ""}" data-polosa="mass">массовый пик${massPik ? ` · <b>${korzina.length}</b>` : ""}</button>`;
    const f = document.getElementById("vmsVhod");
    if (f) f.innerHTML = formaPolosy && !vms.подключено ? `<form class="aktPs__vhod" id="vmsPolosaForma" autocomplete="off">
        <input name="login" placeholder="Логин WMS" autocapitalize="off" spellcheck="false" required>
        <input name="parol" type="password" placeholder="Пароль WMS" required>
        <button class="aktPs__kn is-on" type="submit">Войти</button>
        <p class="aktPs__chto">${oshibkaVhoda ? `<b class="aktPs__oshibka">${esc(oshibkaVhoda)}</b> · ` : ""}пароль не сохраняется — сессия до конца смены</p>
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
  let korzIdet = false;
  let korzPer = null;        // { yach, proverka: [...] }
  let korzDb = null;         // ответ проверки заказа ДБ
  let korzDbKuda = "";

  async function vKorzinu(kod) {
    const kid = Number((String(kod).match(/(\d{6,12})\s*$/) || [])[1]);
    if (!kid) return;
    if (korzina.some((x) => x.id === kid)) { signal(`${kod} уже в списке`); return; }
    if (korzina.length >= 30) { signal("в списке уже 30 паллет — сначала сделайте действие"); return; }
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
  const PALLETA = /(?:^CON\s?\d{5,12}$)|(?:[^\d\s]\s*-\s*0\d{9}$)|(?:^0\d{9}$)/i;
  function vstavitPallety(tekst) {
    const kody = String(tekst || "").split(/[\r\n,;\t]+/).map((x) => x.trim()).filter((x) => PALLETA.test(x));
    if (kody.length < 2) return false;
    if (!massPik) { massPik = true; pal = null; aktK = null; yach = null; tovar = null; }
    const naKlad = kody.map((k) => (/^CON/i.test(k) ? k : "CON " + k.slice(-10)));
    let i = 0;
    const potok = async () => { while (i < naKlad.length) { const k = naKlad[i++]; await vKorzinu(k); } };
    Promise.all([potok(), potok(), potok(), potok()]).then(() => signal(`В списке ${korzina.length} паллет`));
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
          ${(p.proverka || []).filter((x) => x.oshibka).map((x) => `<p class="aktPs__net">${esc(x.паллета)}: ${esc(x.oshibka)}</p>`).join("")}
          ${p.proverka && p.proverka.length === korzina.length ? `<div class="aktPs__vopros">
            <button type="button" class="aktPs__kn is-on" id="korzPerGo"${korzIdet || !vhod() || oshibok === korzina.length ? " disabled" : ""}>${!vhod() ? "Войдите в WMS" : `Переместить ${korzina.length - oshibok} паллет`}</button>
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
          ${(d.куда_можно || []).length > 1 ? `<div class="aktPs__krit">${d.куда_можно.map((k) => `<button type="button" class="aktPs__kn${k === d.куда ? " is-on" : ""}" data-kz-kuda="${esc(k)}">${esc(IMYA_MARSHRUTA[k] || k)}</button>`).join("")}</div>` : ""}
          <p class="aktPs__chto">${d.строк} строк · ${d.штук} шт${kach ? ` · ${kach}` : ""}${d.уже_в_заказе ? ` · ${d.уже_в_заказе} строк уже в заказе — пропущены` : ""}</p>
          ${oshibki ? `<p class="aktPs__net"><b class="aktPs__oshibka">WMS не примет: ${esc(oshibki)}</b></p>` : d.можно ? `<p class="aktPs__chto">WMS примет заказ и задание на отбор.</p>` : ""}
          ${d.готово ? `<div class="aktPs__gotovo"><b>Заказ ${esc(d.номер)} создан и проведён${d.задание_id ? ` · отбор №${esc(d.задание_id)}` : ""}</b>
            ${d.без_задания ? `<span class="aktPs__oshibka">${esc(d.без_задания)}</span>` : ""}
            ${d.вмс ? `<a href="${esc(d.вмс)}" target="_blank" rel="noopener">открыть в WMS</a>` : ""}</div>`
          : d.куда ? `<button type="button" class="aktPs__akt" id="korzDbGo"${oshibki || d.создание_включено === false || !boevoy || !vhod() || korzIdet ? " disabled" : ""}>${
            d.создание_включено === false ? "Создание заказа ДБ пока не включено" : !vhod() ? "Войдите в WMS" : korzIdet ? "Создаю…" : `Создать заказ ДБ и отбор — ${d.паллет} паллет`}</button>` : ""}</div>`;
      }
    }
    const knopkiKorz = korzina.length ? `<div class="palKartaAkt__glav">
        <button type="button" class="aktPs__kn${korzRezhim === "akt" ? " is-on" : ""}" data-kz="akt"${bez && !korzIdet ? "" : " disabled"}>Заактировать без акта</button>
        <button type="button" class="aktPs__kn${korzRezhim === "per" ? " is-on" : ""}" data-kz="per"${korzIdet ? " disabled" : ""}>Переместить в ячейку</button>
        <button type="button" class="aktPs__kn${korzRezhim === "db" ? " is-on" : ""}" data-kz="db"${korzIdet || korzina.length > 10 ? " disabled" : ""}>На другой склад</button>
        <button type="button" class="aktPs__kn" data-kz="ochistit"${korzIdet ? " disabled" : ""}>Очистить</button>
      </div>` : "";
    const log = korzLog.length ? `<div class="aktPs__nomera korzLog">${korzLog.slice(-14).map((x) => `<p>${x}</p>`).join("")}</div>` : "";
    const glav = `<header class="aktPs__shapka"><div><p class="aktPs__nad">Массовый пик · ${korzina.length} паллет</p>
        <p class="aktPs__rezhim">${sht} шт · без акта ${bez} · пикайте ещё или выберите действие</p></div></header>
      ${korzina.length ? `<div class="palSpisok">${spisok}</div>` : '<p class="aktPs__chto">Список пуст — пикайте паллеты (CON …) или вставьте список.</p>'}`;
    if (!deyEl()) { box.innerHTML = glav + knopkiKorz + blok + log; return; }
    vyvesti(glav, `${shapkaDey("Массовый пик", `${korzina.length} паллет`, `<span class="cDey__pod">${sht} шт · без акта ${bez}</span>`)}
      ${plashkaVms()}${formaVms()}
      ${knopkiKorz || '<p class="aktPs__podskaz">Пикайте паллеты подряд — действие потом одно на весь список.</p>'}
      ${blok}${log}`);
  }

  async function korzAktirovat() {
    korzIdet = true; korzLog = []; risovat();
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
        korzPer.proverka.push({ паллета: x.паллета, id: x.id, oshibka: osh ? Object.values(osh).flat().join("; ") : "", kuda: d.куда });
        if (d.куда) korzPer.yach = d.куда;
      } catch (e) {
        korzPer.proverka.push({ паллета: x.паллета, id: x.id, oshibka: e.message || String(e) });
      }
      risovat();
    }
    korzPer.kod = yachKod;
    risovat();
  }

  async function korzPeremestit() {
    korzIdet = true; korzLog = []; risovat();
    for (const x of (korzPer.proverka || []).filter((k) => !k.oshibka)) {
      try {
        const o = await fetch("/__akt/palleta/peremestit", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ паллета: String(x.id), ячейка: korzPer.kod, сохранить: true }) });
        const d = await o.json().catch(() => ({}));
        if (d.нужен_вход) { vms = { подключено: false }; korzLog.push(`<b class="aktPs__oshibka">войдите в WMS</b>`); break; }
        if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
        korzLog.push(`${esc(x.паллета)} → ${esc(d.куда)}: перемещение${d.перемещение ? ` №${esc(d.перемещение)}` : ""} черновиком`);
      } catch (e) {
        korzLog.push(`${esc(x.паллета)}: <b class="aktPs__oshibka">${esc(e.message || e)}</b>`);
      }
      risovat();
    }
    korzIdet = false; korzRezhim = ""; korzPer = null; risovat();
  }

  async function korzProveritDb(sohranit = false) {
    if (sohranit) { korzIdet = true; } else { korzDb = null; }
    risovat();
    try {
      const o = await fetch("/__akt/palleta/zakaz_db", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ паллеты: korzina.map((x) => `CON ${String(x.id).padStart(10, "0")}`), куда: korzDbKuda || (korzDb && korzDb.куда) || "", сохранить: sohranit }) });
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
          <span>${esc(gotovo.tovar)}</span><span>${esc(gotovo.reshenie)} · мех. повреждения, ${esc(gotovo.defekt)}</span></div>
        ${blokPalety()}`);
      return;
    }

    const n = RESHENIYA().length;
    const kolonok = n <= 5 ? n : 4;
    const gotovKnopka = defekt && krit && (!boevoy || vhod());
    const aktBlok = (zag) => `
        <p class="aktPs__zag">${zag}</p>
        <div class="aktPs__krit">${KRIT.map((x) => `<button type="button" class="aktPs__kn${x.k === krit ? " is-on" : ""}" data-krit="${x.k}">${x.имя}</button>`).join("")}</div>
        <p class="aktPs__zag">Дефект</p>
        <div class="aktPs__defekty">${DEFEKTY.map((d) => `<button type="button" class="aktPs__kn aktPs__kn--def${d.k === defekt && !svoyDefekt ? " is-on" : ""}" data-def="${esc(d.k)}">${esc(d.имя)}</button>`).join("")}</div>
        <input class="aktPs__svoy" id="aktSvoy" maxlength="80" autocomplete="off" placeholder="или свой дефект" value="${esc(svoyDefekt)}">
        <button type="button" class="aktPs__akt" id="aktPsGo"${gotovKnopka ? "" : " disabled"}>${gotovKnopka ? "Заактировать" : !krit ? "Выберите крит или косм" : !defekt ? "Выберите дефект" : "Войдите в WMS"}</button>
        <p class="aktPs__chto">Внутренний брак · качество брак · «мех. повреждения, ${esc(defekt || "…")}${krit ? ", " + krit : ""}» · ${esc(stol.имя)}${r ? ` → ${esc(r.куда)}` : ""} · комплектность полная</p>
        ${oshibkaAkta ? `<p class="aktPs__net"><b class="aktPs__oshibka">Акт не создан:</b> ${esc(oshibkaAkta)}</p>` : ""}`;
    const knopkaVsyo = (t) => `<button type="button" class="aktPs__kn aktVsyo" data-akt-vsyo="1">${t}</button>`;
    vyvestiTovar(`${shapka}
      <p class="aktPs__zag">Решение</p>
      <div class="aktPs__resheniya" style="grid-template-columns:repeat(${kolonok},minmax(0,1fr))">${RESHENIYA().map((x) => `<button type="button" class="aktPs__kn${String(x.id) === String(reshenie) ? " is-on" : ""}" data-resh="${x.id}" title="${esc(x.куда)}">${esc(x.имя)}</button>`).join("")}</div>
      ${!r ? (aktVsyo ? aktBlok("Акт без решения · крит или косм") : knopkaVsyo("Заактировать без решения"))
        : !r.акт ? `<p class="aktPs__net">«${esc(r.имя)}» — обычно без акта.</p>${aktVsyo ? aktBlok("Акт всё равно · крит или косм") : knopkaVsyo("Всё равно заактировать")}${blokPalety()}`
        : aktBlok("Крит или косм")}`);
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
    wmsZakryt();
    tovar = e.detail; reshenie = ""; defekt = ""; krit = ""; gotovo = null; oshibkaAkta = ""; aktVsyo = false; novP = null;
    aktK = null; gdeT = null; yach = null; vozvrat = null; vyborStola = false;
    zagruzitTovar(tovar);
    zhdemPalletu = null; perItog = null;
    if (pal && !(palRabota && palRabota.идёт)) { pal = null; vRezhimPalety(false); }
    risovat();
  });
  // С карточки паллеты «Заактировать» ведёт сюда с ?palleta=CON… — сразу её панель.
  const palIzAdresa = new URLSearchParams(location.search).get("palleta");
  if (palIzAdresa && naWms) setTimeout(() => otkrytPalletu(palIzAdresa), 300);

  document.addEventListener("picker:akt", (e) => { vozvrat = null; otkrytAkt(e.detail.kod); });
  document.addEventListener("picker:palleta", (e) => {
    if (!zhdemPalletu) vozvrat = null;
    // После решения по товару — «куда положили» (перемещение);
    // просто так — актировка целой паллеты.
    if (zhdemPalletu) { peremestit(e.detail.kod); return; }
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
    if (massPik && korzRezhim === "per" && !korzIdet) { korzProveritPer(e.detail.kod); return; }
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
  document.addEventListener("picker:miss", () => { if (aktivno) { tovar = null; risovat(); } });

  naPaneli("change", (e) => {
    if (e.target.matches && e.target.matches("[data-nov-format]") && window.ShkPechat) { window.ShkPechat.zadatFormat(e.target.value); return; }
    const g = e.target.closest("[data-pvyb]");
    if (!g || !pal) return;
    if (!palVybor) palVybor = new Set(pal.строки.map((x) => x.ключ));
    if (g.checked) palVybor.add(g.dataset.pvyb); else palVybor.delete(g.dataset.pvyb);
    if (palDb && palDb.predv) palDb = null;   // проверка была по другому выбору
    risovat();
  });
  naPaneli("input", (e) => {
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
      const gotov = defekt && krit && (!boevoy || vhod());
      if (kn) { kn.disabled = !gotov; kn.textContent = gotov ? "Заактировать" : !krit ? "Выберите крит или косм" : !defekt ? "Выберите дефект" : "Войдите в WMS"; }
    }
  });

  naPaneli("submit", async (e) => {
    if (e.target.id === "palNaPalForma") {
      e.preventDefault();
      const kod = e.target.kod.value.trim();
      if (kod && palPer) peremestitPalletu(palPer.yach, false, kod);
      return;
    }
    if (e.target.id === "palPerForma") {
      e.preventDefault();
      const kod = e.target.kod.value.trim();
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
          body: JSON.stringify(r && r.акт
            ? { товар: tovar.name, код: tovar.kod || "", дефект: `${defekt}, ${krit}`, решение: r.имя, исход: r.id }
            : { товар: tovar.name, код: tovar.kod || "", дефект: `${defekt}, ${krit}`, решение: r ? r.имя : "без решения",
                стол_id: stol ? stol.id : null }),
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
    gotovo = { nomer: nomerAkta, tovar: tovar.name || "", reshenie: r ? `${r.имя} → ${r.куда}` : "без решения", defekt: `${defekt}, ${krit}` };
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
      reshenie = r.dataset.resh; defekt = ""; krit = ""; oshibkaAkta = ""; perItog = null; aktVsyo = false;
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
    if (e.target.closest("[data-stol-sbros]")) {
      stol = null; reshenie = ""; localStorage.removeItem(KLYUCH_STOLA);
      return risovat();
    }
    const pt = e.target.closest("[data-ptab]");
    if (pt && pal) {
      const t = pt.dataset.ptab;
      if (t === "per") { palDb = null; if (!palPer) palPer = { zhdem: true }; risovat(); vFokus(); return; }
      if (t === "db") { palPer = null; if (!palDb) { dbKuda = ""; zakazDb(false); } else risovat(); return; }
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
      if (pkk.dataset.pkk === "db") { dbKuda = ""; zakazDb(false); }
      if (pkk.dataset.pkk === "db-da" && palDb && palDb.predv) zakazDb(true);
      if (pkk.dataset.pkk === "db-net") { palDb = null; risovat(); vFokus(); }
      if (pkk.dataset.pkk === "kopir") {
        const imya = (palKarta && palKarta.паллета) || pal.паллета;
        navigator.clipboard.writeText(imya).then(() => { pkk.textContent = "Скопировано"; setTimeout(() => { pkk.textContent = "Копировать"; }, 1500); });
      }
      return;
    }
    if (e.target.closest("[data-def-red]") && aktK) { defRed = { tekst: aktK.дефект || "" }; risovat(); document.querySelector("#aktDefForma textarea")?.focus(); return; }
    if (e.target.closest("[data-def-otmena]")) { defRed = null; risovat(); vFokus(); return; }
    if (e.target.closest("[data-akt-da]") && aktPer && aktPer.vopros) { aktVPalletu(aktPer.vopros.kod, true); return; }
    if (e.target.closest("[data-akt-net]")) { aktPer = null; risovat(); vFokus(); return; }
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
      if (r === "ochistit") { korzina = []; korzRezhim = ""; korzLog = []; korzPer = null; korzDb = null; return risovat(); }
      korzRezhim = korzRezhim === r ? "" : r;
      if (korzRezhim === "per") korzPer = null;
      if (korzRezhim === "db") { korzDbKuda = ""; korzProveritDb(); }
      return risovat();
    }
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
    if (e.target.closest("#korzDbGo") && korzDb && korzDb.можно) { korzProveritDb(true); return; }
    const dk = e.target.closest("[data-db-kuda]");
    if (dk && pal) { dbKuda = dk.dataset.dbKuda; zakazDb(false); return; }
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
    if (e.target.closest("#aktPsGo")) aktirovat();
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
    massPik = false; korzina = []; korzRezhim = ""; korzLog = [];
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
