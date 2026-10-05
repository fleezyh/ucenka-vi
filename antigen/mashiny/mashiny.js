/* Машины: как загрузили и как приехала (27.09.2026).
 *
 * Встреча 25.09: брак на магистрали второй по величине, регионы винят погрузку
 * в ДМД, ДМД — перевозчика, и доказать никто ничего не может. Здесь у каждой
 * машины две стороны — фото погрузки и фото выгрузки — и рейс из ВМС: госномер,
 * выезд, сколько приняли и сколько записали в брак на приёмке.
 * Сюда же переехала таблица Лёхи «Отправка ОЛ с регионов»: с ней Таня ходит к
 * руководителям обратной логистики.
 *
 * Фото сжимаются здесь, в браузере: полное — до 1600 px, превью — до 480 px.
 * Оригинал с телефона весит 3–5 МБ, а диск сервера маленький.
 */
(function () {
  "use strict";

  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ETAPY = [
    { k: "pogruzka", imya: "Погрузка", pod: "как загрузили" },
    { k: "vygruzka", imya: "Выгрузка", pod: "как приехала" },
  ];
  const OCENKI = [
    { k: "норма", imya: "Норма" },
    { k: "навал", imya: "Навал" },
    { k: "повреждения", imya: "Повреждения" },
  ];
  // Коды складов ВМС → город. Остальные берём из названия после « - ».
  const GORODA = {
    ПНЗ: "Пенза", НСК: "Новосибирск", ЕКБ: "Екатеринбург", СПБ: "Санкт-Петербург", КАЗ: "Казань", САМ: "Самара",
    УФА: "Уфа", ЧЕЛ: "Челябинск", ПЕР: "Пермь", ВРЖ: "Воронеж", ВЛГ: "Вологда", ВГГ: "Волгоград", ТУЛ: "Тула",
    РНД: "Ростов-на-Дону", КРД: "Краснодар", НН: "Нижний Новгород", РЯЗ: "Рязань", ТЮМ: "Тюмень", ЯР: "Ярославль",
    ТВР: "Тверь", КЛН: "Клинцы", БРК: "Брянск", ЛПЦ: "Липецк", ОРЛ: "Орёл", КУР: "Курск", БЛГ: "Белгород",
    ИЖК: "Ижевск", ОМС: "Омск", КРС: "Красноярск", СРТ: "Саратов", УЛН: "Ульяновск", ТОМ: "Томск", БРЛ: "Барнаул",
  };

  let dannye = { рейсы: [], склады: [], я: "" };
  const filtr = { vid: "", gorod: "", q: "", mes: "" };
  // 29.09 (Чударов): «фильтр… чтобы вот кто встреча за сентябрь, чтобы сразу только сентябрь, сколько было»
  const mesyac = (r) => String(r.дата || "").slice(0, 7);
  const imyaMes = (m) => {
    const d = new Date(`${m}-01T00:00:00`);
    return isNaN(d) ? m : d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
  };
  let otkryt = null;       // id машины в окне
  let svet = { spisok: [], n: 0 };
  let zagruzka = null;     // { reys, etap } — куда льём выбранные файлы
  let idet = 0;            // сколько фото сейчас грузится

  // ------------------------------------------------------------ названия

  function gorod(imya) {
    const s = String(imya || "").trim();
    if (/домодедов/i.test(s)) return "Домодедово";
    if (/данилов/i.test(s)) return "Данилово";
    if (/чашников/i.test(s)) return "Чашниково";
    const m = s.match(/^([А-ЯЁA-Z]{2,4})\s*-\s*(.*)$/);
    if (!m) return s;
    if (GORODA[m[1]]) return GORODA[m[1]];
    return (m[2].split(/\s+/)[0] || m[1]);
  }
  const marshrut = (r) => `${gorod(r.откуда)} → ${gorod(r.куда)}`;
  const region = (r) => (r.вид === "ol" ? gorod(r.откуда) : gorod(r.куда));
  const data = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    return isNaN(d) ? iso : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  };
  const korotko = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    return isNaN(d) ? iso : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  };
  const vyezd = (s) => (s ? `${korotko(s.slice(0, 10))} в ${s.slice(11, 16)}` : "");
  const chislo = (n) => Number(n || 0).toLocaleString("ru-RU");
  const src = (f, mini) => `/__mashiny/foto/${f.id}${mini && f.мини ? "-m" : ""}.jpg`;
  // Сзади на фото виден номер прицепа, а не тягача — показываем оба, прицеп первым.
  function nomera(r, s_podpisyu) {
    const pr = ((r.tms || {}).прицеп || "").trim();
    const tg = (r.госномер || "").trim();
    const chast = [];
    if (pr) chast.push(`${s_podpisyu ? "прицеп " : ""}<b class="msNomer" title="прицеп">${esc(pr)}</b>`);
    if (tg) chast.push(`${s_podpisyu ? "тягач " : ""}<b class="msNomer msNomer--tyagach" title="тягач">${esc(tg)}</b>`);
    return chast.join(s_podpisyu ? " · " : " ");
  }
  const foto = (r, etap) => r.фото.filter((f) => !etap || f.этап === etap);

  // ------------------------------------------------------------ данные

  async function zagruzit() {
    const o = await fetch("/__mashiny", { cache: "no-store" });
    if (!o.ok) {
      el("msSvodka").textContent = o.status === 403 ? "Нет доступа к разделу — попросите в админке право «Машины»." : `Сервер ответил ${o.status}`;
      return;
    }
    dannye = await o.json();
    risovat();
    if (otkryt) risovatKartu();
  }

  async function post(put, telo, tip = "application/json") {
    const o = await fetch(put, {
      method: "POST", headers: { "Content-Type": tip },
      body: tip === "application/json" ? JSON.stringify(telo) : telo,
    });
    const d = await o.json().catch(() => ({}));
    if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
    return d;
  }

  // ------------------------------------------------------------ список

  function vidimye() {
    const q = filtr.q.trim().toLowerCase();
    return dannye.рейсы.filter((r) => {
      if (filtr.vid && r.вид !== filtr.vid) return false;
      if (filtr.gorod && region(r) !== filtr.gorod) return false;
      if (filtr.mes && mesyac(r) !== filtr.mes) return false;
      if (q) {
        const stroka = `${r.откуда} ${r.куда} ${gorod(r.откуда)} ${gorod(r.куда)} ${r.госномер} ${r.комментарий} ${(r.tms || {}).прицеп || ""}`.toLowerCase();
        if (!stroka.includes(q)) return false;
      }
      return true;
    });
  }

  function risovatGoroda() {
    const schet = {};
    dannye.рейсы.filter((r) => (!filtr.vid || r.вид === filtr.vid) && (!filtr.mes || mesyac(r) === filtr.mes))
      .forEach((r) => { schet[region(r)] = (schet[region(r)] || 0) + 1; });
    const spisok = Object.keys(schet).sort((a, b) => schet[b] - schet[a] || a.localeCompare(b, "ru"));
    el("msGoroda").innerHTML = spisok.length < 2 ? "" : [
      `<button type="button" class="msChip${filtr.gorod ? "" : " is-on"}" data-gorod="">Все города</button>`,
      ...spisok.map((g) => `<button type="button" class="msChip${g === filtr.gorod ? " is-on" : ""}" data-gorod="${esc(g)}">${esc(g)} <b>${schet[g]}</b></button>`),
    ].join("");
  }

  function risovatMesyacy() {
    const box = el("msMesyacy");
    if (!box) return;
    const schet = {};
    dannye.рейсы.filter((r) => (!filtr.vid || r.вид === filtr.vid) && (!filtr.gorod || region(r) === filtr.gorod))
      .forEach((r) => { const m = mesyac(r); if (m) schet[m] = (schet[m] || 0) + 1; });
    const spisok = Object.keys(schet).sort().reverse();
    box.innerHTML = spisok.length < 2 ? "" : [
      `<button type="button" class="msChip${filtr.mes ? "" : " is-on"}" data-mes="">Все месяцы</button>`,
      ...spisok.map((m) => `<button type="button" class="msChip${m === filtr.mes ? " is-on" : ""}" data-mes="${esc(m)}">${esc(imyaMes(m))} <b>${schet[m]}</b></button>`),
    ].join("");
  }

  function oblozhka(r) {
    const p = foto(r, "pogruzka")[0];
    const v = foto(r, "vygruzka")[0];
    if (p && v) {
      return `<div class="msKart__foto msKart__foto--dve"><img loading="lazy" src="${src(p, true)}" alt=""><img loading="lazy" src="${src(v, true)}" alt=""></div>`;
    }
    const f = p || v;
    if (f) return `<div class="msKart__foto"><img loading="lazy" src="${src(f, true)}" alt=""></div>`;
    return `<div class="msKart__foto msKart__foto--net"><span>нет фото</span></div>`;
  }

  function plashkaOcenki(o) {
    return o ? `<span class="msOcenka msOcenka--${o === "норма" ? "ok" : o === "навал" ? "naval" : "povr"}">${esc(o)}</span>` : "";
  }

  function vmsKorotko(r) {
    const v = (r.tms || {}).вмс;
    if (!v || !v.принято) return "";
    return `<span class="msKart__vms${v.брак_в_расхождениях ? " is-brak" : ""}">брак на приёмке ${chislo(v.брак_в_расхождениях)} шт</span>`;
  }

  function risovat() {
    risovatMesyacy();
    risovatGoroda();
    const spisok = vidimye();
    const vseFoto = spisok.reduce((n, r) => n + r.фото.length, 0);
    const obe = spisok.filter((r) => foto(r, "pogruzka").length && foto(r, "vygruzka").length).length;
    el("msSvodka").textContent = dannye.рейсы.length
      ? `${spisok.length} ${sklon(spisok.length, "машина", "машины", "машин")} · ${vseFoto} фото · с обеих сторон — ${obe}`
      : "Пока ни одной машины. Нажмите «Новая машина».";
    el("msSetka").innerHTML = spisok.map((r) => `
      <button type="button" class="msKart" data-reys="${r.id}">
        ${oblozhka(r)}
        <span class="msKart__vid">${r.вид === "ol" ? "ОЛ" : "Отгрузка"}</span>
        ${plashkaOcenki(r.оценка)}
        <span class="msKart__telo">
          <span class="msKart__marshrut">${esc(marshrut(r))}</span>
          <span class="msKart__meta">${esc(data(r.дата))} ${nomera(r, false)}</span>
          <span class="msKart__schet">
            <span>погрузка ${foto(r, "pogruzka").length}</span><span>выгрузка ${foto(r, "vygruzka").length}</span>${vmsKorotko(r)}
          </span>
        </span>
      </button>`).join("");
  }

  function sklon(n, a, b, c) {
    const m = n % 10, s = n % 100;
    if (s >= 11 && s <= 14) return c;
    return m === 1 ? a : m >= 2 && m <= 4 ? b : c;
  }

  // ------------------------------------------------------------ карточка машины

  function zakrytOkno() {
    el("msOkno").hidden = true;
    otkryt = null;
    document.body.classList.remove("msZamok");
    if (location.hash) history.replaceState(null, "", location.pathname);
  }

  function otkrytMashinu(id) {
    otkryt = Number(id);
    el("msOkno").hidden = false;
    document.body.classList.add("msZamok");
    history.replaceState(null, "", `#${otkryt}`);
    risovatKartu();
  }

  function blokVms(r) {
    const t = r.tms || {};
    if (!t.рейс) {
      return `<div class="msVms msVms--net">Рейс ВМС не привязан. <button type="button" class="msSsylka" data-deystvie="pravka">Найти рейс</button></div>`;
    }
    const v = t.вмс || {};
    const fakty = v.принято
      ? `<div class="msVms__fakty">
          <span><b>${chislo(v.принято)}</b> шт приняли</span>
          <span class="${v.брак_в_расхождениях ? "is-brak" : ""}"><b>${chislo(v.брак_в_расхождениях)}</b> шт брака в расхождениях</span>
          <span><b>${chislo(v.расхождений)}</b> шт расхождений всего</span>
        </div>
        <p class="msVms__pod">Приёмка ${esc(korotko(v.с))}–${esc(korotko(v.по))}${v.машин > 1 ? ` · общая на ${v.машин} машины этого дня` : ""}. Брак — причины «брак», «мятая коробка», «некомплект».</p>`
      : `<p class="msVms__pod">${r.вид === "ol" ? "Приёмку ОЛ в Домодедово ВМС к рейсам пока не привязывает — сравнение по фото." : "Приёмки по рейсу в ВМС пока нет."}</p>`;
    return `<div class="msVms">
      <div class="msVms__shapka"><span class="msVms__metka">ВМС</span>
        <span>рейс <b>${esc(t.рейс)}</b> · выезд ${esc(vyezd(t.выезд))}${t.прицеп ? ` · прицеп ${esc(t.прицеп)}` : ""}${t.госномер ? ` · тягач ${esc(t.госномер)}` : ""}</span></div>
      ${fakty}
    </div>`;
  }

  function galereya(r, etap) {
    const spisok = foto(r, etap.k);
    return `<section class="msEtap" data-etap="${etap.k}">
      <header class="msEtap__shapka"><h3>${etap.imya}</h3><span>${etap.pod} · ${spisok.length}</span></header>
      <div class="msEtap__setka${spisok.length ? "" : " is-pusto"}">
        ${spisok.map((f) => `
          <div class="msFoto">
            <button type="button" class="msFoto__img" data-foto="${f.id}"><img loading="lazy" src="${src(f, true)}" alt=""></button>
            <span class="msFoto__deystviya">
              <button type="button" data-perenos="${f.id}" data-kuda="${etap.k === "pogruzka" ? "vygruzka" : "pogruzka"}"
                title="Перенести в «${etap.k === "pogruzka" ? "Выгрузка" : "Погрузка"}»">⇄</button>
              <button type="button" data-udalit-foto="${f.id}" title="Удалить фото">×</button>
            </span>
          </div>`).join("")}
        <button type="button" class="msFoto msFoto--dobavit" data-dobavit="${etap.k}">
          <svg class="msPlus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>${spisok.length ? "Добавить фото" : `Добавить фото ${etap.k === "pogruzka" ? "погрузки" : "выгрузки"}`}</span><small>${spisok.length ? "или перетащите сюда" : "с телефона — сразу камерой, с компьютера — перетащите файлы сюда"}</small>
        </button>
      </div>
    </section>`;
  }

  function risovatKartu() {
    const r = dannye.рейсы.find((x) => x.id === otkryt);
    if (!r) { zakrytOkno(); return; }
    el("msKarta").innerHTML = `
      <header class="msKarta__shapka">
        <div>
          <p class="msKicker">${r.вид === "ol" ? "ОЛ из региона" : "Отгрузка из ДМД"}</p>
          <h2>${esc(marshrut(r))}</h2>
          <p class="msKarta__pod">${esc(data(r.дата))}${nomera(r, true) ? ` · ${nomera(r, true)}` : ""}
            <span class="msKarta__polno">${esc(r.откуда)} → ${esc(r.куда)}</span></p>
        </div>
        <div class="msKarta__knopki">
          <button type="button" class="msBtn msBtn--ghost msBtn--mal" data-deystvie="pravka">Изменить</button>
          <button type="button" class="msKarta__x" data-zakryt aria-label="Закрыть">×</button>
        </div>
      </header>
      <div class="msOcenki" role="group" aria-label="Как приехала">
        <span>Оценка:</span>
        ${OCENKI.map((o) => `<button type="button" class="msChip${r.оценка === o.k ? " is-on" : ""}" data-ocenka="${o.k}">${o.imya}</button>`).join("")}
      </div>
      ${blokVms(r)}
      <div class="msEtapy">${ETAPY.map((e) => galereya(r, e)).join("")}</div>
      <label class="msKomm"><span>Комментарий</span>
        <textarea id="msKomm" rows="2" placeholder="Что видно на фото, кто грузил, что сказал перевозчик…">${esc(r.комментарий)}</textarea></label>
      <footer class="msKarta__niz">
        <span>Создал ${esc(r.создал || "—")} · изменено ${esc(new Date(r.изменено).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}${r.изменил && r.изменил !== r.создал ? ` · ${esc(r.изменил)}` : ""}</span>
        <button type="button" class="msSsylka msSsylka--red" data-deystvie="udalit">Удалить машину</button>
      </footer>
      <p class="msZagruzka" id="msZagruzka" hidden></p>`;
  }

  async function sohranitPole(r, polya) {
    const itog = await post("/__mashiny/reys", { ...rToTelo(r), ...polya });
    Object.assign(r, itog);
    risovat();
    risovatKartu();
  }

  const rToTelo = (r) => ({ id: r.id, откуда: r.откуда, куда: r.куда, дата: r.дата, госномер: r.госномер,
    tms: r.tms || {}, комментарий: r.комментарий, оценка: r.оценка });

  // ------------------------------------------------------------ фото: сжатие и загрузка

  async function kartinka(file) {
    if ("createImageBitmap" in window) {
      try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* ниже — через <img> */ }
    }
    return await new Promise((ok, ne) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ne(new Error("не открылось как картинка"));
      img.src = URL.createObjectURL(file);
    });
  }

  function vJpeg(img, max, kach) {
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    const k = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement("canvas");
    c.width = Math.round(w0 * k);
    c.height = Math.round(h0 * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return new Promise((ok) => c.toBlob((b) => ok({ b, w: c.width, h: c.height }), "image/jpeg", kach));
  }

  const novyyId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "")
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, "0")).join(""));

  function hod(tekst) {
    const p = el("msZagruzka");
    if (!p) return;
    p.hidden = !tekst;
    p.textContent = tekst || "";
  }

  async function zalit(fayly, reysId, etap) {
    const spisok = Array.from(fayly).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    if (!spisok.length) return;
    const r = dannye.рейсы.find((x) => x.id === reysId);
    let gotovo = 0, oshibki = 0;
    idet += spisok.length;
    for (const f of spisok) {
      hod(`Загружаю фото ${gotovo + 1} из ${spisok.length}…`);
      try {
        const img = await kartinka(f);
        const polnoe = await vJpeg(img, 1600, 0.82);
        const mini = await vJpeg(img, 480, 0.74);
        const fid = novyyId();
        await post(`/__mashiny/foto?reys=${reysId}&etap=${etap}&id=${fid}&vid=full&w=${polnoe.w}&h=${polnoe.h}`, polnoe.b, "image/jpeg");
        await post(`/__mashiny/foto?reys=${reysId}&etap=${etap}&id=${fid}&vid=mini`, mini.b, "image/jpeg").catch(() => null);
        if (r) r.фото.push({ id: fid, этап: etap, w: polnoe.w, h: polnoe.h, мини: true });
        gotovo += 1;
        if (otkryt === reysId) risovatKartu();
        hod(`Загружено ${gotovo} из ${spisok.length}`);
      } catch (e) {
        oshibki += 1;
        hod(`Не загрузилось: ${f.name} — ${e.message}`);
      }
    }
    idet -= spisok.length;
    risovat();
    if (otkryt === reysId) risovatKartu();
    hod(oshibki ? `Загружено ${gotovo}, не вышло ${oshibki}` : `Загружено ${gotovo} ${sklon(gotovo, "фото", "фото", "фото")}`);
    setTimeout(() => { if (!idet) hod(""); }, 3500);
  }

  // ------------------------------------------------------------ новая машина / правка

  function formaMashiny(r) {
    const novaya = !r;
    const t = (r && r.tms) || {};
    const vid = r ? r.вид : "ol";
    const drugoy = r ? (vid === "ol" ? r.откуда : r.куда) : "";
    const segodnya = new Date().toISOString().slice(0, 10);
    el("msKarta").innerHTML = `
      <header class="msKarta__shapka">
        <div><p class="msKicker">${novaya ? "новая запись" : "правка"}</p><h2>${novaya ? "Новая машина" : esc(marshrut(r))}</h2></div>
        <div class="msKarta__knopki"><button type="button" class="msKarta__x" data-zakryt aria-label="Закрыть">×</button></div>
      </header>
      <form class="msForma" id="msForma" autocomplete="off">
        <div class="msSeg msSeg--forma" id="msFormaVid">
          <button type="button" data-fvid="ol" class="${vid === "ol" ? "is-on" : ""}">ОЛ: регион → Домодедово</button>
          <button type="button" data-fvid="otgruzka" class="${vid === "otgruzka" ? "is-on" : ""}">Отгрузка: Домодедово → регион</button>
        </div>
        <div class="msForma__ryad">
          <label><span id="msFormaGorodMetka">${vid === "ol" ? "Откуда (регион)" : "Куда (регион)"}</span>
            <input name="gorod" list="msSklady" value="${esc(drugoy)}" placeholder="Пенза, НСК, ЕКБ…" required></label>
          <label><span>Дата</span><input name="data" type="date" value="${esc(r ? r.дата : segodnya)}" required></label>
          <label><span>Прицеп</span><input name="pricep" value="${esc(t.прицеп || "")}" placeholder="ВО686066" autocapitalize="characters"></label>
          <label><span>Тягач</span><input name="nomer" value="${esc(r ? r.госномер : "")}" placeholder="Х263МВ196" autocapitalize="characters"></label>
        </div>
        <datalist id="msSklady">${(dannye.склады || []).filter((s) => !/^МСК/.test(s)).map((s) => `<option value="${esc(s)}">`).join("")}</datalist>
        <div class="msTms">
          <div class="msTms__shapka"><b>Рейсы ВМС рядом с этой датой</b><span id="msTmsHod"></span></div>
          <div class="msTms__spisok" id="msTmsSpisok"><p class="msTms__pusto">Введите город — покажу машины ±5 дней.</p></div>
          <p class="msTms__vybran" id="msTmsVybran">${t.рейс ? `Выбран рейс ${esc(t.рейс)} · ${esc(t.госномер || "")}` : ""}</p>
        </div>
        <label class="msKomm"><span>Комментарий</span><textarea name="komm" rows="2">${esc(r ? r.комментарий : "")}</textarea></label>
        <div class="msForma__niz">
          <p class="msForma__oshibka" id="msFormaOsh"></p>
          <button type="submit" class="msBtn msBtn--main">${novaya ? "Создать и добавить фото" : "Сохранить"}</button>
        </div>
      </form>`;
    const forma = el("msForma");
    forma.dataset.vid = vid;
    forma.dataset.tms = JSON.stringify(t);
    if (drugoy) iskatTms();
  }

  let tmsTaymer = null;
  async function iskatTms() {
    const forma = el("msForma");
    if (!forma) return;
    const g = forma.gorod.value.trim();
    const kod = g.match(/^([А-ЯЁ]{2,4})\s*-/);
    const zapros = kod ? kod[1] : g;
    if (zapros.length < 2) { el("msTmsSpisok").innerHTML = `<p class="msTms__pusto">Введите город — покажу машины ±5 дней.</p>`; return; }
    el("msTmsHod").textContent = "ищу…";
    const o = await fetch(`/__mashiny/tms?gorod=${encodeURIComponent(zapros)}&data=${encodeURIComponent(forma.data.value)}&nomer=${encodeURIComponent(forma.pricep.value || forma.nomer.value)}`, { cache: "no-store" });
    const d = await o.json().catch(() => ({ рейсы: [] }));
    const vid = forma.dataset.vid;
    const reysy = (d.рейсы || []).filter((x) => (vid === "ol" ? /домодедов|данилов/i.test(x.куда) : /домодедов|данилов/i.test(x.откуда)));
    el("msTmsHod").textContent = d.обновлено ? `ВМС на ${d.обновлено.replace("T", " ")}` : "";
    const vybran = JSON.parse(forma.dataset.tms || "{}").рейс;
    el("msTmsSpisok").innerHTML = reysy.length ? reysy.map((x) => `
      <button type="button" class="msTmsReys${String(x.рейс) === String(vybran) ? " is-on" : ""}" data-tms="${esc(JSON.stringify(x))}">
        <span class="msTmsReys__data">${esc(korotko(x.выезд.slice(0, 10)))}<small>${esc(x.выезд.slice(11, 16))}</small></span>
        <span class="msTmsReys__put">${esc(gorod(x.откуда))} → ${esc(gorod(x.куда))}<small>${esc(x.откуда)}</small></span>
        <span class="msTmsReys__nomer">${x.прицеп ? `<b class="msNomer" title="прицеп">${esc(x.прицеп)}</b>` : ""}<b class="msNomer msNomer--tyagach" title="тягач">${esc(x.госномер || "—")}</b></span>
        <span class="msTmsReys__vms">${x.вмс && x.вмс.принято ? `брак ${chislo(x.вмс.брак_в_расхождениях)} шт` : ""}</span>
      </button>`).join("") : `<p class="msTms__pusto">Рядом с этой датой рейсов не нашлось. Можно сохранить и без рейса.</p>`;
  }

  async function sohranitFormu(e) {
    e.preventDefault();
    const forma = el("msForma");
    const vid = forma.dataset.vid;
    const tms = JSON.parse(forma.dataset.tms || "{}");
    const pricep = forma.pricep.value.trim().toUpperCase();
    if (pricep) tms.прицеп = pricep;
    const g = forma.gorod.value.trim();
    const dmd = "МСК - Склад Домодедово";
    const telo = {
      откуда: vid === "ol" ? (tms.откуда || g) : (tms.откуда || dmd),
      куда: vid === "ol" ? (tms.куда || dmd) : (tms.куда || g),
      дата: forma.data.value, госномер: forma.nomer.value.trim(), tms, комментарий: forma.komm.value,
    };
    const byl = otkryt ? dannye.рейсы.find((x) => x.id === otkryt) : null;
    if (byl) { telo.id = byl.id; telo.оценка = byl.оценка; }
    try {
      const itog = await post("/__mashiny/reys", telo);
      if (byl) Object.assign(byl, itog); else dannye.рейсы.unshift(itog);
      risovat();
      otkrytMashinu(itog.id);
    } catch (oshibka) {
      el("msFormaOsh").textContent = oshibka.message;
    }
  }

  // ------------------------------------------------------------ просмотр фото

  function svetOtkryt(spisok, n) {
    svet = { spisok, n };
    el("msSvet").hidden = false;
    document.body.classList.add("msZamok");
    svetRisovat();
  }

  function svetRisovat() {
    const x = svet.spisok[svet.n];
    if (!x) return;
    el("msSvetImg").src = src(x.f, false);
    const etap = ETAPY.find((e) => e.k === x.f.этап);
    el("msSvetPod").innerHTML = `<b>${esc(marshrut(x.r))}</b> · ${esc(data(x.r.дата))}${x.r.госномер ? ` · ${esc(x.r.госномер)}` : ""}
      · ${etap ? etap.imya.toLowerCase() : ""}<span>${svet.n + 1} из ${svet.spisok.length}</span>`;
    const sled = svet.spisok[svet.n + 1];
    if (sled) new Image().src = src(sled.f, false);
  }

  function svetZakryt() {
    el("msSvet").hidden = true;
    el("msSvetImg").removeAttribute("src");
    if (el("msOkno").hidden) document.body.classList.remove("msZamok");
  }

  const svetShag = (d) => { svet.n = (svet.n + d + svet.spisok.length) % svet.spisok.length; svetRisovat(); };

  // ------------------------------------------------------------ события

  document.addEventListener("click", async (e) => {
    const t = e.target;
    const vidKn = t.closest("#msVid [data-vid]");
    if (vidKn) {
      filtr.vid = vidKn.dataset.vid; filtr.gorod = "";
      document.querySelectorAll("#msVid [data-vid]").forEach((b) => b.classList.toggle("is-on", b === vidKn));
      risovat(); return;
    }
    const g = t.closest("[data-gorod]");
    if (g) { filtr.gorod = g.dataset.gorod; risovat(); return; }
    const mk = t.closest("#msMesyacy [data-mes]");
    if (mk) { filtr.mes = mk.dataset.mes; risovat(); return; }
    const k = t.closest(".msKart[data-reys]");
    if (k) { otkrytMashinu(k.dataset.reys); return; }
    if (t.closest("#msNovaya")) {
      otkryt = null; el("msOkno").hidden = false; document.body.classList.add("msZamok"); formaMashiny(null); return;
    }
    if (t.closest("#msPokaz")) {
      const spisok = [];
      vidimye().forEach((r) => ETAPY.forEach((et) => foto(r, et.k).forEach((f) => spisok.push({ r, f }))));
      if (spisok.length) svetOtkryt(spisok, 0);
      return;
    }
    if (t.closest("[data-zakryt]")) { zakrytOkno(); return; }
    const sv = t.closest("[data-svet]");
    if (sv) {
      if (sv.dataset.svet === "x") svetZakryt(); else svetShag(sv.dataset.svet === "l" ? -1 : 1);
      return;
    }
    if (t.id === "msSvet" || t.closest(".msSvet__fig") && !t.closest("img")) { svetZakryt(); return; }

    const r = otkryt ? dannye.рейсы.find((x) => x.id === otkryt) : null;
    const fv = t.closest("[data-fvid]");
    if (fv) {
      const forma = el("msForma");
      forma.dataset.vid = fv.dataset.fvid;
      forma.dataset.tms = "{}";
      el("msTmsVybran").textContent = "";
      document.querySelectorAll("[data-fvid]").forEach((b) => b.classList.toggle("is-on", b === fv));
      el("msFormaGorodMetka").textContent = fv.dataset.fvid === "ol" ? "Откуда (регион)" : "Куда (регион)";
      iskatTms(); return;
    }
    const tmsKn = t.closest("[data-tms]");
    if (tmsKn) {
      const x = JSON.parse(tmsKn.dataset.tms);
      const forma = el("msForma");
      forma.dataset.tms = JSON.stringify(x);
      forma.nomer.value = x.госномер || forma.nomer.value;
      forma.pricep.value = x.прицеп || "";
      forma.data.value = x.выезд.slice(0, 10);
      forma.gorod.value = forma.dataset.vid === "ol" ? x.откуда : x.куда;
      document.querySelectorAll("[data-tms]").forEach((b) => b.classList.toggle("is-on", b === tmsKn));
      el("msTmsVybran").textContent = `Выбран рейс ${x.рейс} · ${x.госномер || ""}`;
      return;
    }
    if (!r) return;
    const fotoKn = t.closest("[data-foto]");
    if (fotoKn) {
      const spisok = [];
      ETAPY.forEach((et) => foto(r, et.k).forEach((f) => spisok.push({ r, f })));
      svetOtkryt(spisok, Math.max(0, spisok.findIndex((x) => x.f.id === fotoKn.dataset.foto)));
      return;
    }
    const dob = t.closest("[data-dobavit]");
    if (dob) { zagruzka = { reys: r.id, etap: dob.dataset.dobavit }; el("msFayl").value = ""; el("msFayl").click(); return; }
    const per = t.closest("[data-perenos]");
    if (per) {
      await post("/__mashiny/foto/pravka", { id: per.dataset.perenos, этап: per.dataset.kuda });
      const f = r.фото.find((x) => x.id === per.dataset.perenos);
      if (f) f.этап = per.dataset.kuda;
      risovat(); risovatKartu(); return;
    }
    const ud = t.closest("[data-udalit-foto]");
    if (ud) {
      if (!confirm("Удалить это фото?")) return;
      await post("/__mashiny/foto/pravka", { id: ud.dataset.udalitFoto, удалить: true });
      r.фото = r.фото.filter((x) => x.id !== ud.dataset.udalitFoto);
      risovat(); risovatKartu(); return;
    }
    const oc = t.closest("[data-ocenka]");
    if (oc) { await sohranitPole(r, { оценка: r.оценка === oc.dataset.ocenka ? "" : oc.dataset.ocenka }); return; }
    const d = t.closest("[data-deystvie]");
    if (d && d.dataset.deystvie === "pravka") { formaMashiny(r); return; }
    if (d && d.dataset.deystvie === "udalit") {
      if (!confirm(`Удалить машину «${marshrut(r)}, ${data(r.дата)}» вместе с фото из списка?`)) return;
      await post("/__mashiny/reys/udalit", { id: r.id });
      dannye.рейсы = dannye.рейсы.filter((x) => x.id !== r.id);
      zakrytOkno(); risovat();
    }
  });

  document.addEventListener("submit", (e) => { if (e.target.id === "msForma") sohranitFormu(e); });
  document.addEventListener("input", (e) => {
    if (e.target.id === "msPoisk") { filtr.q = e.target.value; risovat(); return; }
    if (e.target.closest("#msForma") && ["gorod", "data", "nomer", "pricep"].includes(e.target.name)) {
      if (e.target.name === "gorod") { el("msForma").dataset.tms = "{}"; el("msTmsVybran").textContent = ""; }
      clearTimeout(tmsTaymer); tmsTaymer = setTimeout(iskatTms, 350);
    }
  });
  document.addEventListener("focusout", async (e) => {
    if (e.target.id !== "msKomm" || !otkryt) return;
    const r = dannye.рейсы.find((x) => x.id === otkryt);
    if (r && e.target.value !== r.комментарий) await sohranitPole(r, { комментарий: e.target.value });
  });
  el("msFayl").addEventListener("change", (e) => {
    if (zagruzka) zalit(e.target.files, zagruzka.reys, zagruzka.etap);
  });
  // Перетаскивание файлов прямо на колонку «Погрузка» или «Выгрузка».
  document.addEventListener("dragover", (e) => {
    const z = e.target.closest && e.target.closest(".msEtap");
    if (!z) return;
    e.preventDefault();
    document.querySelectorAll(".msEtap").forEach((x) => x.classList.toggle("is-nad", x === z));
  });
  document.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest(".msEtap")) {
      document.querySelectorAll(".msEtap").forEach((x) => x.classList.remove("is-nad"));
    }
  });
  document.addEventListener("drop", (e) => {
    const z = e.target.closest && e.target.closest(".msEtap");
    document.querySelectorAll(".msEtap").forEach((x) => x.classList.remove("is-nad"));
    if (!z || !otkryt) return;
    e.preventDefault();
    zalit(e.dataTransfer.files, otkryt, z.dataset.etap);
  });
  document.addEventListener("keydown", (e) => {
    if (!el("msSvet").hidden) {
      if (e.key === "Escape") svetZakryt();
      if (e.key === "ArrowLeft") svetShag(-1);
      if (e.key === "ArrowRight") svetShag(1);
      return;
    }
    if (e.key === "Escape" && !el("msOkno").hidden) zakrytOkno();
  });
  // Свайп в просмотре фото.
  let x0 = null;
  el("msSvet").addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el("msSvet").addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) svetShag(dx > 0 ? -1 : 1);
    x0 = null;
  });
  window.addEventListener("beforeunload", (e) => { if (idet) { e.preventDefault(); e.returnValue = ""; } });

  zagruzit().then(() => {
    const id = Number(location.hash.slice(1));
    if (id && dannye.рейсы.some((r) => r.id === id)) otkrytMashinu(id);
  });
})();
