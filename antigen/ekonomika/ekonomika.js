/* Экономика позиций (05.10.2026).
 *
 * Степан: «как будто можно эту тему сделать изменяемой и сразу по любой позиции… если это технически
 * возможно абсолютно по всем позициям сделать огромную мощную тему — то гоу». Образец — книга
 * «экономика_пескобетон_профиль» (24.09) для ассортиментного комитета: сколько остаётся со штуки после
 * склада и брака. Здесь — по каждой позиции, что лежала на Домодедово за год (или была в актах брака).
 *
 * Первая выкладка — плитки и таблицы «млн» — «по визуалу же пиздец… ничего непонятно». Поэтому картина:
 * одна фраза «из 100 ₽ маржи склад и брак забирают N», полоса «куда уходит маржа», рубрики → категории →
 * позиции строками с той же полосой. Цифры по колонкам — только в карточке позиции.
 *
 * Данные — /data/antigen/ekonomika/: index.json.gz (словари, ставки, сводка по рубрикам, топ-300 худших) и
 * r{N}.json.gz по рубрике (сырые факты: штуки, выручка, себес, строки заказов, акты, средний остаток,
 * объём штуки). Считает браузер: ставки правятся на странице и запоминаются на этом компьютере.
 */
(function () {
  "use strict";

  const DATA_V = "20261006-sht";   // версия данных: менять при каждой пересборке v_sayt.py, иначе браузер держит старые
  const DATA = "../../data/antigen/ekonomika/";   // под правом «antigen»: себес и маржа всей номенклатуры
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chislo = (n, z = 0) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("ru-RU", { minimumFractionDigits: z, maximumFractionDigits: z }));
  const rub = (n, z = 1) => (n == null || !isFinite(n) ? "—" : `${n < 0 ? "−" : ""}${chislo(Math.abs(n), z)}`);
  const mln = (n) => (n == null || !isFinite(n) ? "—" : `${n < 0 ? "−" : ""}${chislo(Math.abs(n) / 1e6, Math.abs(n) >= 1e8 ? 0 : 1)} млн`);
  // деньги крупно: млрд / млн / тыс
  const dengi = (n) => {
    if (n == null || !isFinite(n)) return "—";
    const a = Math.abs(n), z = n < 0 ? "−" : "";
    if (a >= 1e9) return `${z}${chislo(a / 1e9, 1)} млрд`;
    if (a >= 1e6) return `${z}${chislo(a / 1e6, a >= 1e8 ? 0 : 1)} млн`;
    if (a >= 1e3) return `${z}${chislo(a / 1e3, 0)} тыс`;
    return `${z}${chislo(a, 0)}`;
  };
  const sklon = (n, f1, f2, f5) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? f5 : b > 1 && b < 5 ? f2 : b === 1 ? f1 : f5; };

  let idx = null;                 // общий файл
  const rubriki = new Map();      // r1 → колонки
  let stavki = null;              // текущие ставки
  // 07.10: + порог потерь на позицию, бренд и разрез матрицы «Где теряем больше» (фильтрация «как в антигенерации»)
  const sost = { r1: "", r2: "", tip: "", q: "", gr: "", vid: "minus", pokazano: 50, vseGrupp: false,
                 porog: 0, brend: "", razrez: "r1", mxVse: false };
  // бренд — первое слово названия («PROFFIT Профиль…», «Тара.ру Ведро…»): отдельной колонки в данных нет
  const brendOf = (k, i) => (String(k.imya[i] || "").trim().split(/\s+/)[0] || "—").toLocaleUpperCase("ru-RU");

  // 06.10 Степан: «было задание сделать конкретно по длинномерам и светильникам из антигенерации, только
  // рубрика слишком неточно — я никак их не найду». Первая версия брала словарь групп страницы брака
  // (data/antigen/gruppy.json: «профиль», «трубка», «лоток»… — 12,7 тыс. позиций), ответ: «че-то не то».
  // Направления — из записки «Куда бить» (22.09, Черновики/2026-09-22/zapiska_kuda_bit.py): там они заданы
  // моделью учёта и категорией, а не словами. Кнопками над всем, ссылкой ?gruppa=Хрупкие длинномеры.
  const NAPRAVLENIYA = [
    { имя: "Хрупкие длинномеры", модели: ["Ф(ДЛ.ХРУПК)"], признак: "модель учёта «длинномер хрупкий»",
      что: "мех. повреждение — 4 036 актов за 8 недель, 14,4% брака; хранить горизонтально в кассетах, не сгибать под ячейку" },
    { имя: "Тара с крышкой", слова: ["ведро", "ведра", "ёмкость", "емкость", "контейнер с крышкой", "банка с крышкой"],
      признак: "в названии: ведро, ёмкость, контейнер или банка с крышкой",
      что: "некомплект — 2 034 акта за 8 недель и растёт; хранить комплектом, в лоток только с надетой крышкой" },
    { имя: "Светильники и лампы", категории: ["Освещение", "Светильники"], признак: "категории «Освещение» и «Светильники»",
      что: "мех. повреждение — 1 580 актов за 8 недель; панели 595×595 на ребре, лампы T8 в кассете по длине" },
    { имя: "Сыпучка · мешки", модели: ["Ф(СЫПУЧКА)"], признак: "модель учёта «сыпучка»",
      что: "мех. повреждение и рваные мешки — 1 534 акта за 8 недель; паллет с прокладкой, не в нижний ярус" },
  ];
  let gruppyAg = [];
  function zagruzitGruppy() {
    const nomer = (spisok, slov) => new Set((spisok || []).map((x) => slov.indexOf(x)).filter((n) => n >= 0));
    gruppyAg = NAPRAVLENIYA.map((g) => ({ ...g, _m: g.модели && nomer(g.модели, idx.slov.model),
      _r2: g.категории && nomer(g.категории, idx.slov.r2), _slova: (g.слова || []).map((s) => s.toLocaleLowerCase("ru-RU")) }));
  }
  const gruppaAg = () => gruppyAg.find((g) => g.имя === sost.gr) || null;
  function vGruppe(g, k, i) {
    if (g._m) return g._m.has(k.model[i]);
    if (g._r2) return g._r2.has(k.r2[i]);
    const hay = k.imya[i].toLocaleLowerCase("ru-RU");
    return g._slova.some((w) => hay.includes(w));
  }
  // кнопки направлений теперь — карточки сравнения (ekNapr); строка кнопок не нужна
  function risovatGruppyAg() { $("ekGrAg").hidden = true; }

  // 06.10 Степан: «я всё равно тут ничего не понимаю — что самое многочисленное, что самое дорогое, суммы по
  // группам в итоге». Четыре направления рядом: сколько теряем, сколько брака, что самое массовое по браку и
  // что самое дорогое; клик — направление открывается ниже. Нужны все рубрики: грузим фоном после первого экрана.
  function itogNapr(g) {
    const s = { n: 0, minus: 0, akty: 0, sht: 0, vyr: 0, marzha: 0, brak: 0, hran: 0, rabota: 0, poteri: 0, itog: 0, topBrak: null, topPoteri: null };
    for (const k of rubriki.values()) {
      for (let i = 0; i < k.id.length; i++) {
        if (!vGruppe(g, k, i)) continue;
        const r = raschet(k, i);
        s.n += 1; s.akty += r.ak; s.sht += r.sht; s.vyr += r.vyr; s.marzha += r.marzha;
        s.brak += r.brak; s.hran += r.hran; s.rabota += r.rabota; s.itog += r.itog;
        if (r.itog < 0) { s.minus += 1; s.poteri -= r.itog; }
        if (!s.topBrak || r.ak > s.topBrak.r.ak) s.topBrak = { k, i, r };
        if (!s.topPoteri || r.itog < s.topPoteri.r.itog) s.topPoteri = { k, i, r };
      }
    }
    return s;
  }
  function risovatNapr() {
    const box = $("ekNapr");
    if (!vseZagruzheny()) {
      box.innerHTML = `<h2>Четыре направления «Куда бить» <small>считаю по всем позициям…</small></h2>`;
      return;
    }
    const it = gruppyAg.map((g) => ({ g, s: itogNapr(g) }));
    const maks = Math.max(...it.map((x) => x.s.poteri), 1);
    const sumPot = it.reduce((a, x) => a + x.s.poteri, 0), sumAkt = it.reduce((a, x) => a + x.s.akty, 0);
    const tov = (x, chto) => (x ? `<span class="ekNk__tov" data-k="${x.k.r1[x.i]}" data-i="${x.i}"><b>${esc(x.k.imya[x.i])}</b><em>${chto(x.r)}</em></span>` : "—");
    box.innerHTML = `<h2>Четыре направления «Куда бить» <small>за год по всем позициям ДМД · вместе теряем ${dengi(sumPot)} ₽ и ${chislo(sumAkt)} актов брака · щёлкните направление — разбор ниже</small>
        ${sost.gr ? `<button type="button" class="ekGrAg__sbros" data-grag="">× все товары</button>` : ""}</h2>
      <div class="ekNapr__setka">${it.map(({ g, s }) => `<div class="ekNk${g.имя === sost.gr ? " is-on" : ""}" data-grag="${esc(g.имя)}" role="button" tabindex="0">
        <p class="ekNk__imya">${esc(g.имя)}<small>${esc(g.признак)}</small></p>
        <p class="ekNk__glav"><b class="is-minus">−${dengi(s.poteri)} ₽</b><span>теряем за год</span></p>
        <div class="ekNk__pol"><i style="width:${(s.poteri / maks * 100).toFixed(1)}%"></i></div>
        <dl class="ekNk__dl">
          <dt>позиций</dt><dd>${chislo(s.n)} <small>в минусе ${chislo(s.minus)}</small></dd>
          <dt>актов брака за год</dt><dd>${chislo(s.akty)} <small>${s.sht ? chislo(s.akty / s.sht * 100, 1) + "% от проданного" : ""}</small></dd>
          <dt>продали</dt><dd>${chislo(s.sht)} шт <small>на ${dengi(s.vyr)} ₽</small></dd>
          <dt>маржа</dt><dd>${dengi(s.marzha)} ₽</dd>
          <dt>брак съел</dt><dd>${dengi(s.brak)} ₽ <small>себес и обработка</small></dd>
          <dt>склад съел</dt><dd>${dengi(s.rabota + s.hran)} ₽ <small>работа и хранение</small></dd>
        </dl>
        <p class="ekNk__pod">больше всего брака</p>${tov(s.topBrak, (r) => `${chislo(r.ak)} актов`)}
        <p class="ekNk__pod">больше всего теряем</p>${tov(s.topPoteri, (r) => `${dengi(r.itog)} ₽ за год`)}
      </div>`).join("")}</div>`;
  }

  // внутри направления: две короткие таблицы — самое массовое по браку и самое дорогое по потерям
  function risovatTopy(sp, g) {
    const box = $("ekTopy");
    if (!g) { box.hidden = true; return; }
    const poBraku = sp.filter((x) => x.r.ak > 0).sort((a, b) => b.r.ak - a.r.ak).slice(0, 10);
    const poPoteryam = sp.filter((x) => x.r.itog < 0).sort((a, b) => a.r.itog - b.r.itog).slice(0, 10);
    const tab = (zag, spisok, kol) => `<div class="ekTop"><h3>${zag}</h3><table><thead><tr><th>товар</th>${kol.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead>
      <tbody>${spisok.map(({ k, i, r }) => `<tr class="ekTopRyad" data-k="${k.r1[i]}" data-i="${i}"><td><b>${esc(k.imya[i])}</b><small>${k.art[i] || ""}</small></td>${kol.map((c) => `<td>${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    box.hidden = false;
    box.innerHTML = `<h2>«${esc(g.имя)}»: что самое массовое и что самое дорогое</h2><div class="ekTopy__setka">
      ${tab("Больше всего брака", poBraku, [["актов", (r) => chislo(r.ak)], ["продано", (r) => chislo(r.sht)], ["брак, %", (r) => (r.brakDolya != null ? chislo(r.brakDolya, 1) : "—")], ["теряем за год", (r) => `<span class="${r.itog < 0 ? "is-minus" : "is-plus"}">${dengi(r.itog)}</span>`]])}
      ${tab("Больше всего теряем", poPoteryam, [["теряем за год", (r) => `<span class="is-minus">${dengi(r.itog)}</span>`], ["со штуки", (r) => (r.sht ? rub(r.itog / r.sht) : "—")], ["актов", (r) => chislo(r.ak)], ["почему", (r) => esc(prichina(r))]])}
    </div>`;
  }

  // 05.10 Степан: «куда бить, зачем, что самое невыгодное — ВООБЩЕ ничего непонятно». Страница отвечает
  // сначала на это: сколько теряем, на чём и что с этим делать; разбор по рубрикам и позициям — ниже.
  const PRICHINY = {
    цена: { imya: "Цена не выше себестоимости", chto: "поднять цену или вывести из ассортимента", klass: "is-cena",
            pochemu: "маржи нет — продаём в ноль или в минус, а склад и брак добавляют сверху" },
    хранение: { imya: "Лежит долго — съело хранение", chto: "сократить закупку, распродать запас", klass: "is-hran",
                pochemu: "запас на месяцы вперёд: хранение за год больше, чем принесла маржа" },
    брак: { imya: "Брак съедает маржу", chto: "разбор с поставщиком и упаковкой — где бьётся", klass: "is-brak",
            pochemu: "много актов брака на проданную штуку: теряем себес и платим за обработку" },
    работа: { imya: "Мелочь дорого обрабатывать", chto: "продавать упаковкой, поднять минимальную партию", klass: "is-rab",
              pochemu: "работа склада на заказ дороже маржи с него" },
  };
  // главная причина минуса позиции: нет маржи — цена; иначе что съело больше всего
  const prichina = (r) => (r.marzha <= 0 ? "цена"
    : [["хранение", r.hran], ["брак", r.brak], ["работа", r.rabota]].sort((a, b) => b[1] - a[1])[0][0]);

  // виды списка позиций — вместо сортировки и галочек
  const VIDY = [
    ["minus", "Все потери", "в минусе за год — самые большие потери сверху"],
    ["cena", "Цена ≤ себеса", PRICHINY.цена.pochemu],
    ["hran", "Съело хранение", PRICHINY.хранение.pochemu],
    ["brak", "Съел брак", PRICHINY.брак.pochemu],
    ["rab", "Съела работа", PRICHINY.работа.pochemu],
    ["vse", "Все позиции", "все позиции, худшие сверху"],
  ];
  const VID_PRICHINA = { cena: "цена", hran: "хранение", brak: "брак", rab: "работа" };

  // ------------------------------------------------------------ загрузка

  async function gz(put) {
    const o = await fetch(`${DATA}${put}?v=${DATA_V}`, { cache: "default" });
    if (!o.ok) throw new Error(o.status === 403 ? "нет доступа к разделу" : `сервер ответил ${o.status}`);
    const bufer = await o.arrayBuffer();
    const b = new Uint8Array(bufer);
    if (b[0] === 0x1f && b[1] === 0x8b) {
      const s = new Blob([bufer]).stream().pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(s).text());
    }
    return JSON.parse(new TextDecoder().decode(b));   // сервер уже разжал по дороге
  }

  async function rubrika(r1) {
    if (!rubriki.has(r1)) {
      const f = idx.рубрики.find((x) => x.r1 === r1);
      zagruzka(`Загружаю «${f.имя}» — ${chislo(f.строк)} позиций…`);
      const d = await gz(f.файл);
      d.kol.r1 = d.kol.id.map(() => r1);
      rubriki.set(r1, d.kol);
    }
    return rubriki.get(r1);
  }
  const vseZagruzheny = () => idx && rubriki.size === idx.рубрики.length;
  async function zagruzitVse() {
    for (const f of idx.рубрики) await rubrika(f.r1);
  }
  function zagruzka(t) {
    $("ekGlav").classList.add("is-gruzhu");
    for (const id of ["ekBit", "ekGlav"]) { const p = $(id).querySelector(".ekGlav__kto"); if (p) p.textContent = t; }
  }

  // ------------------------------------------------------------ ставки

  const KL = "ekonomika-stavki-v1";
  function stavkiPoUmolch() {
    const m = idx.meta;
    return {
      аренда: m.ставки.аренда, коммуналка: m.ставки.коммуналка, эксплуатация: m.ставки.эксплуатация,
      объём: m.средний_объём_остатка_ДМД_м3, дней: m.ставки.дней,
      обработка: m.ставки.обработка, обработка_с_арендой: m.ставки.обработка_с_арендой, с_арендой_фб: false,
      тарифы: { ...m.тарифы }, место: {}, тарифы_шт: { ...(m.тарифы_шт || {}) }, по_штукам: [...(m.по_штукам || [])],
    };
  }
  function zagruzitStavki() {
    stavki = stavkiPoUmolch();
    try {
      const s = JSON.parse(localStorage.getItem(KL) || "null");
      if (s) stavki = { ...stavki, ...s, тарифы: { ...stavki.тарифы, ...(s.тарифы || {}) }, место: { ...(s.место || {}) },
        тарифы_шт: { ...stavki.тарифы_шт, ...(s.тарифы_шт || {}) }, по_штукам: s.по_штукам || stavki.по_штукам };
    } catch (e) { /* по умолчанию */ }
  }
  const sohranitStavki = () => { try { localStorage.setItem(KL, JSON.stringify(stavki)); } catch (e) { /* не страшно */ } };
  const stavkaM3 = () => 1e6 * (stavki.аренда + stavki.коммуналка + stavki.эксплуатация) / (stavki.объём * stavki.дней);
  const obrabotka = () => (stavki.с_арендой_фб ? stavki.обработка_с_арендой : stavki.обработка);
  // сводка по рубрикам в index посчитана по ставкам по умолчанию: хранение и обработку брака пересчитываем
  // пропорционально, а тарифы и «место» — только если рубрики загружены
  const tarifyIzmeneny = () => {
    const d = stavkiPoUmolch();
    return Object.keys(stavki.тарифы).some((t) => stavki.тарифы[t] !== d.тарифы[t])
      || Object.values(stavki.место).some((v) => v !== 1)
      || Object.keys(stavki.тарифы_шт).some((t) => stavki.тарифы_шт[t] !== d.тарифы_шт[t]);
  };

  // ------------------------------------------------------------ расчёт одной позиции

  function raschet(k, i) {
    const tip = idx.slov.tip[k.tip[i]];
    const sht = k.sht[i], vyr = k.vyr[i], seb = k.seb[i], ak = k.akty[i];
    const marzha = vyr - seb;
    // крупное (КГ, ДЛ, негабарит, тележки) — ₽ на штуку × штуки, как в книге 24.09 для Тани (ДЛ 12,9, КГ 29,7);
    // мелочь — тариф на операцию × строки заказов: её берут пачками, на штуку вышло бы в разы дороже правды
    const poSht = stavki.по_штукам.includes(tip) && stavki.тарифы_шт[tip];
    const ops = k.str[i];
    const rabota = poSht ? stavki.тарифы_шт[tip] * sht : (stavki.тарифы[tip] || 0) * ops;
    const mesto = stavki.место[tip] || 1;
    const hran = stavkaM3() * k.l[i] / 1000 * mesto * k.ost[i] * 365;       // ₽ за м³·сутки × объём × средний остаток × год
    const brakSeb = sht ? ak * seb / sht : 0;
    const obr = ak * obrabotka();
    const itog = marzha - rabota - hran - brakSeb - obr;
    return { tip, sht, vyr, seb, ak, marzha, rabota, hran, brakSeb, obr, brak: brakSeb + obr, itog, ops, poSht: !!poSht,
      na: (v) => (sht > 0 ? v / sht : null),
      dney: sht > 0 ? k.ost[i] / sht * 365 : null,
      brakDolya: sht > 0 ? ak / sht * 100 : null };
  }

  // ------------------------------------------------------------ выборка

  const zapros = () => sost.q.trim().toLowerCase();

  // всё, что подходит под рубрику, категорию, модель и поиск (без вида списка)
  function vybor() {
    const q = zapros();
    const art = /^\d{5,}$/.test(q) ? Number(q) : null;
    const slova = q.split(/\s+/).filter(Boolean);   // «пескобетон dauer» — каждое слово где угодно в названии
    const ist = sost.r1 !== "" ? [rubriki.get(Number(sost.r1))].filter(Boolean) : [...rubriki.values()];
    const g = gruppaAg();
    const out = [];
    for (const k of ist) {
      for (let i = 0; i < k.id.length; i++) {
        if (sost.r2 !== "" && k.r2[i] !== Number(sost.r2)) continue;
        if (sost.tip !== "" && k.tip[i] !== Number(sost.tip)) continue;
        if (g && !vGruppe(g, k, i)) continue;
        if (sost.brend && brendOf(k, i) !== sost.brend) continue;
        if (q) {
          if (art != null) { if (k.art[i] !== art) continue; }
          else { const im = k.imya[i].toLowerCase(); if (!slova.every((s) => im.includes(s))) continue; }
        }
        out.push({ k, i, r: raschet(k, i) });
      }
    }
    return out;
  }

  function poVidu(sp) {
    const v = sost.vid;
    let out = sp;
    if (v === "minus") out = sp.filter(({ r }) => r.itog < 0);
    else if (VID_PRICHINA[v]) out = sp.filter(({ r }) => r.itog < 0 && prichina(r) === VID_PRICHINA[v]);
    if (sost.porog > 0) out = out.filter(({ r }) => -r.itog >= sost.porog);
    return out.slice().sort((a, b) => a.r.itog - b.r.itog);
  }

  const pustyePoteri = () => ({ позиций: 0, рублей: 0,
    по_причине: Object.fromEntries(Object.keys(PRICHINY).map((p) => [p, { позиций: 0, рублей: 0 }])) });
  function summa(sp) {
    const s = { vyr: 0, marzha: 0, rabota: 0, hran: 0, brak: 0, itog: 0, minus: 0, n: 0, poteri: pustyePoteri() };
    for (const { r } of sp) {
      s.vyr += r.vyr; s.marzha += r.marzha; s.rabota += r.rabota; s.hran += r.hran; s.brak += r.brak; s.itog += r.itog;
      s.minus += r.itog < 0 ? 1 : 0; s.n += 1;
      if (r.itog < 0) {
        const p = s.poteri.по_причине[prichina(r)];
        s.poteri.позиций += 1; s.poteri.рублей -= r.itog; p.позиций += 1; p.рублей -= r.itog;
      }
    }
    return s;
  }
  function izSvoda(f) {
    const s = f.свод, m = idx.meta;
    const kh = stavkaM3() / m.ставка_м3_сут, ko = obrabotka() / m.ставки.обработка;
    const o = { vyr: s.выручка, marzha: s.маржа, rabota: s.работа, hran: s.хранение * kh, brak: s.брак_себес + s.обработка * ko, minus: s.в_минусе, n: f.строк,
                poteri: f.потери || pustyePoteri() };
    o.itog = o.marzha - o.rabota - o.hran - o.brak;
    return o;
  }

  // ------------------------------------------------------------ отрисовка

  // полоса «куда уходит маржа»: слева то, что съели, справа то, что осталось; если съели больше маржи —
  // черта «маржа» внутри полосы, всё правее неё — минус
  function polosa(s, klass = "") {
    const sel = s.rabota + s.hran + s.brak;
    const baza = Math.max(s.marzha, sel, 1e-9);
    const w = (v) => `${(Math.max(v, 0) / baza * 100).toFixed(2)}%`;
    const cherta = s.itog < 0 && s.marzha > 0 ? `<em class="ekPolosa__cherta" style="left:${w(s.marzha)}"><span>маржа</span></em>` : "";
    return `<div class="ekPolosa ${klass}${s.marzha <= 0 ? " is-bez" : ""}">`
      + `<i class="is-rab" style="width:${w(s.rabota)}"></i><i class="is-hran" style="width:${w(s.hran)}"></i>`
      + `<i class="is-brak" style="width:${w(s.brak)}"></i><i class="is-ost" style="width:${w(s.itog)}"></i>${cherta}</div>`;
  }
  const dolyaOst = (s) => (s.marzha > 0 ? s.itog / s.marzha * 100 : null);

  function glavnaya(s, kto, primech) {
    const sel = s.rabota + s.hran + s.brak;
    const izSta = s.marzha > 0 ? sel / s.marzha * 100 : null;
    const fraza = s.marzha <= 0
      ? `Маржи нет — продаётся в ноль или ниже себестоимости, и сверху ещё склад и брак`
      : izSta > 100
        ? `Склад и брак съедают всю маржу и ещё <b class="is-minus">${chislo(izSta - 100)} ₽</b> сверху на каждые 100 ₽`
        : `Из каждых 100 ₽ маржи склад и брак забирают <b class="is-minus">${chislo(izSta)} ₽</b>`;
    const ch = (klass, imya, v, pod = "") => `<div class="ekCh ${klass}"><span><i></i>${imya}</span><b>${dengi(v)}</b>${pod ? `<small>${pod}</small>` : ""}</div>`;
    $("ekGlav").classList.remove("is-gruzhu");
    $("ekGlav").innerHTML = `<p class="ekGlav__kto">${kto}</p>
      <h2 class="ekGlav__fraza">${fraza}</h2>
      <div class="ekGlav__chisla">
        ${ch("is-marzha", "маржа за год", s.marzha, `выручка ${dengi(s.vyr)}`)}
        ${ch("is-rab", "склад: работа", -s.rabota)}
        ${ch("is-hran", "склад: хранение", -s.hran)}
        ${ch("is-brak", "брак", -s.brak, "себес и обработка")}
        ${ch(`is-ost${s.itog < 0 ? " is-minus" : ""}`, "остаётся", s.itog, s.marzha > 0 ? `${chislo(dolyaOst(s))}% маржи` : "")}
      </div>
      ${polosa(s, "ekPolosa--big")}
      <p class="ekGlav__pod">${s.n ? `${chislo(s.n)} ${sklon(s.n, "позиция", "позиции", "позиций")} · в минусе ${chislo(s.minus)}` : ""}${primech ? ` · ${primech}` : ""}</p>`;
  }

  // полоса потерь по причинам: из чего сложился минус группы
  function polosaPoter(p, maks) {
    const w = (v) => `${(v / Math.max(maks, 1) * 100).toFixed(2)}%`;
    return `<div class="ekPolosa ekPolosa--poteri">${Object.entries(PRICHINY).map(([k, x]) =>
      `<i class="${x.klass}" style="width:${w(p.по_причине[k].рублей)}" title="${esc(x.imya)}: ${dengi(p.по_причине[k].рублей)} ₽ · ${chislo(p.по_причине[k].позиций)} поз."></i>`).join("")}</div>`;
  }

  function gruppy(spisok, zag, pod, klyuch) {
    if (!spisok.length) { $("ekGruppy").innerHTML = ""; return; }
    spisok.sort((a, b) => (b.s.poteri?.рублей || 0) - (a.s.poteri?.рублей || 0));
    const vid = sost.vseGrupp ? spisok : spisok.slice(0, 12);
    const maks = Math.max(...spisok.map((x) => x.s.poteri?.рублей || 0), 1);
    $("ekGruppy").innerHTML = `<h2>${zag} <small>${pod}</small></h2>
      <div class="ekGr__shapka"><span></span><span>из чего потери: <i class="ekLeg is-cena"></i>цена <i class="ekLeg is-hran"></i>хранение <i class="ekLeg is-brak"></i>брак <i class="ekLeg is-rab"></i>работа</span><span>теряем за год</span></div>
      ${vid.map(({ id, imya, s }) => { const p = s.poteri || pustyePoteri(); const d = dolyaOst(s); return `<button type="button" class="ekGr" data-${klyuch}="${id}">
        <span class="ekGr__imya"><b>${esc(imya)}</b><small>${chislo(p.позиций)} из ${chislo(s.n)} поз. в минусе · остаётся ${d != null ? chislo(d) + "% маржи" : "—"}</small></span>
        ${polosaPoter(p, maks)}
        <span class="ekGr__ost is-minus"><b>${p.рублей ? "−" + dengi(p.рублей) : "0"}</b><small>₽ за год</small></span></button>`; }).join("")}
      ${spisok.length > vid.length ? `<button type="button" class="ekBtn ekEshche" data-vsegrupp>Показать все ${chislo(spisok.length)}</button>` : ""}`;
  }

  // «Куда бить»: сколько теряем, на чём и что делать — первым экраном
  function kudaBit(p, n, kto, primech) {
    const vsego = p.рублей || 0;
    const prich = Object.entries(PRICHINY).map(([k, x]) => ({ k, ...x, ...p.по_причине[k] })).sort((a, b) => b.рублей - a.рублей);
    const glavn = prich[0];
    $("ekBit").innerHTML = `<p class="ekGlav__kto">${kto}</p>
      <h2 class="ekBit__fraza">Теряем <b class="is-minus">${dengi(vsego)} ₽</b> в год на <b>${chislo(p.позиций)}</b> ${sklon(p.позиций, "позиции", "позициях", "позициях")}${n ? ` из ${chislo(n)}` : ""}</h2>
      <p class="ekBit__pod">Это позиции, которые после склада и брака приносят минус. ${vsego ? `Больше всего — «${esc(glavn.imya.toLowerCase())}»: ${chislo(glavn.рублей / vsego * 100)}% потерь.` : ""} Нажмите на причину — ниже откроется список позиций.</p>
      <div class="ekRychagi">${prich.map((x) => `<button type="button" class="ekRychag ${x.klass}" data-vid="${Object.keys(VID_PRICHINA).find((v) => VID_PRICHINA[v] === x.k)}" data-k-poz>
        <span class="ekRychag__imya"><i></i>${esc(x.imya)}</span>
        <b>−${dengi(x.рублей)} ₽</b>
        <small>${chislo(x.позиций)} поз. · ${vsego ? chislo(x.рублей / vsego * 100) : 0}% потерь</small>
        <span class="ekRychag__chto">что делать: ${esc(x.chto)}</span></button>`).join("")}</div>
      ${primech ? `<p class="ekGlav__pod">${primech}</p>` : ""}`;
  }

  function pozicii(sp, primech) {
    const vid = sp.slice(0, sost.pokazano);
    const opis = VIDY.find((v) => v[0] === sost.vid)[2];
    // «показать» и модель учёта — в фильтрах наверху (07.10), здесь только заголовок
    $("ekPozicii").innerHTML = `<div class="ekPoz__verh">
        <h2>Позиции <small>${chislo(sp.length)} · ${opis}${primech ? ` · ${primech}` : ""}</small></h2>
      </div>
      ${sp.length ? `<div class="ekPoz__shapka"><span>товар</span><span>продано</span><span>куда уходит маржа штуки</span><span>остаётся со штуки</span></div>` : `<p class="ekPusto">Ничего не нашлось.</p>`}
      ${vid.map(({ k, i, r }) => { const na = (v) => (r.sht ? v / r.sht : null); return `<button type="button" class="ekPoz" data-k="${k === idx.топKol ? "top" : k.r1[i]}" data-i="${i}">
        <span class="ekPoz__imya"><b>${esc(k.imya[i])}</b><small>${r.itog < 0 ? `<em class="ekPrich ${PRICHINY[prichina(r)].klass}">${esc(prichina(r))}</em> ` : ""}${k.art[i] || ""} · ${esc(idx.slov.r2[k.r2[i]] || idx.slov.r1[k.r1[i]] || "")} · ${esc(r.tip)}</small></span>
        <span class="ekPoz__sht"><b>${chislo(r.sht)}</b><small>шт за год</small></span>
        <span class="ekPoz__pol">${polosa(r)}<small>маржа ${rub(na(r.marzha))} ₽ · склад ${rub(na(r.rabota))} · хранение ${rub(na(r.hran))} · брак ${rub(na(r.brak))}${r.dney != null && r.dney > 180 ? ` · <em class="ekZapas">запас ${r.dney >= 730 ? chislo(r.dney / 365, 1) + " года" : chislo(r.dney) + " дн."}</em>` : ""}</small></span>
        <span class="ekPoz__itog ${r.itog < 0 ? "is-minus" : "is-plus"}"><b>${r.sht ? rub(r.itog / r.sht) + " ₽" : "не продавался"}</b><small>${dengi(r.itog)} ₽ за год</small></span></button>`; }).join("")}
      ${sp.length > vid.length ? `<button type="button" class="ekBtn ekEshche" data-eshche>Показать ещё 50 из ${chislo(sp.length - vid.length)}</button>` : ""}`;
  }

  // ------------------------------------------------------------ фильтры и матрица (07.10)
  // Степан: «фильтрацию так и не прокачал и не сделал удобный вид как примерно в антигенерации — что сразу
  // видно, что куда бить». Как на странице брака: фильтры кнопками над всем, матрица «где больше» с
  // переключением разреза, клик по ячейке — фильтр и список позиций.

  const POROGI = [[0, "любые"], [10000, "от 10 тыс"], [100000, "от 100 тыс"], [1000000, "от 1 млн"]];
  const RAZREZY = [["napr", "направление"], ["r1", "рубрика"], ["r2", "категория"], ["tip", "модель учёта"], ["brend", "бренд"]];
  const KOLONKI = [["цена", "cena"], ["хранение", "hran"], ["брак", "brak"], ["работа", "rab"]];

  function risovatFiltr() {
    const seg = (spisok, attr, tek) => `<div class="ekSeg">${spisok.map(([v, t]) =>
      `<button type="button" data-${attr}="${esc(v)}" class="${String(tek) === String(v) ? "is-on" : ""}">${esc(t)}</button>`).join("")}</div>`;
    const tipy = idx.slov.tip.map((t, n) => (t ? `<option value="${n}"${String(n) === sost.tip ? " selected" : ""}>${esc(t)}</option>` : "")).join("");
    const aktiv = [];
    if (sost.gr) aktiv.push(["gr", `направление: ${sost.gr}`]);
    if (sost.vid !== "minus") aktiv.push(["vid", `показ: ${VIDY.find((v) => v[0] === sost.vid)[1]}`]);
    if (sost.r1 !== "") aktiv.push(["r1", `рубрика: ${idx.slov.r1[Number(sost.r1)] || "—"}`]);
    if (sost.r2 !== "") aktiv.push(["r2", `категория: ${idx.slov.r2[Number(sost.r2)] || "без категории"}`]);
    if (sost.tip !== "") aktiv.push(["tip", `модель: ${idx.slov.tip[Number(sost.tip)]}`]);
    if (sost.brend) aktiv.push(["brend", `бренд: ${sost.brend}`]);
    if (sost.porog) aktiv.push(["porog", `потери ${POROGI.find((p) => p[0] === sost.porog)[1]}`]);
    if (sost.q.trim()) aktiv.push(["q", `поиск: ${sost.q.trim()}`]);
    $("ekFiltr").innerHTML = `
      <div class="ekF__ryad"><span class="ekF__lbl">направление</span>
        ${seg([["", "все товары"], ...NAPRAVLENIYA.map((g) => [g.имя, g.имя])], "grag", sost.gr)}</div>
      <div class="ekF__ryad"><span class="ekF__lbl">показать</span>${seg(VIDY.map(([k, t]) => [k, t]), "vid", sost.vid)}
        <span class="ekF__lbl">потери на позицию</span>${seg(POROGI.map(([v, t]) => [v, t]), "porog", sost.porog)}
        <label class="ekSel ekSel--mal"><span>модель учёта</span><select id="ekTip"><option value="">все</option>${tipy}</select></label>
        <button type="button" class="ekBtn" id="ekVygr" data-vygr>Выгрузить в Excel</button></div>
      ${aktiv.length ? `<div class="ekF__aktiv">${aktiv.map(([k, t]) => `<button type="button" class="ekF__chip" data-snyat="${k}">${esc(t)} ×</button>`).join("")}
        <button type="button" class="ekF__sbros" data-snyat="vse">сбросить всё</button></div>` : ""}`;
  }

  function risovatMatr(sp) {
    const box = $("ekMatr");
    if (!sp) { box.innerHTML = `<h2>Где теряем больше <small>считаю по всем позициям…</small></h2>`; return; }
    const klyuch = {
      napr: (k, i) => { const g = gruppyAg.find((x) => vGruppe(x, k, i)); return g ? [g.имя, g.имя] : ["", "прочие товары"]; },
      r1: (k, i) => [k.r1[i], idx.slov.r1[k.r1[i]] || "без рубрики"],
      r2: (k, i) => [k.r2[i], idx.slov.r2[k.r2[i]] || "без категории"],
      tip: (k, i) => [k.tip[i], idx.slov.tip[k.tip[i]] || "—"],
      brend: (k, i) => { const b = brendOf(k, i); return [b, b]; },
    }[sost.razrez];
    const ryady = new Map();
    let n = 0;
    for (const { k, i, r } of sp) {
      if (r.itog >= 0 || (sost.porog && -r.itog < sost.porog)) continue;
      const [id, imya] = klyuch(k, i);
      const z = ryady.get(id) || { id, imya, vsego: 0, poz: 0, kol: { цена: 0, хранение: 0, брак: 0, работа: 0 }, kpoz: { цена: 0, хранение: 0, брак: 0, работа: 0 } };
      const p = prichina(r);
      z.vsego -= r.itog; z.poz += 1; z.kol[p] -= r.itog; z.kpoz[p] += 1;
      ryady.set(id, z); n += 1;
    }
    const vse = [...ryady.values()].sort((a, b) => b.vsego - a.vsego);
    const pokaz = sost.mxVse ? vse : vse.slice(0, 15);
    const maks = Math.max(...pokaz.flatMap((z) => Object.values(z.kol)), 1);
    const cvet = (v) => (v ? `background:rgba(240,93,114,${(0.1 + 0.75 * Math.sqrt(v / maks)).toFixed(2)})` : "");
    const itogo = KOLONKI.map(([p]) => vse.reduce((a, z) => a + z.kol[p], 0));
    box.innerHTML = `<div class="ekMatr__verh"><h2>Где теряем больше <small>${chislo(n)} позиций в минусе по фильтру · клик по ячейке — позиции этой строки и причины</small></h2>
        <div class="ekSeg">${RAZREZY.map(([v, t]) => `<button type="button" data-razrez="${v}" class="${sost.razrez === v ? "is-on" : ""}">${t}</button>`).join("")}</div></div>
      <div class="ekMatr__setka">
        <div class="ekMx ekMx--shapka"><span>${RAZREZY.find((x) => x[0] === sost.razrez)[1]}</span>${KOLONKI.map(([p, kl]) =>
          `<span><i class="ekLeg is-${kl}"></i>${p === "цена" ? "цена ≤ себеса" : p}</span>`).join("")}<span>всего за год</span></div>
        ${pokaz.map((z) => `<div class="ekMx">
          <button type="button" class="ekMx__imya" data-mx="${esc(z.id)}" data-mx-vid="minus" title="${esc(z.imya)}"><b>${esc(z.imya)}</b><small>${chislo(z.poz)} поз.</small></button>
          ${KOLONKI.map(([p, kl]) => `<button type="button" class="ekMx__ya" style="${cvet(z.kol[p])}" data-mx="${esc(z.id)}" data-mx-vid="${kl}"
            title="${esc(z.imya)} · ${p}: −${dengi(z.kol[p])} ₽ · ${chislo(z.kpoz[p])} поз.">${z.kol[p] ? `−${dengi(z.kol[p])}` : "—"}<small>${z.kpoz[p] ? chislo(z.kpoz[p]) + " поз." : ""}</small></button>`).join("")}
          <button type="button" class="ekMx__vsego" data-mx="${esc(z.id)}" data-mx-vid="minus">−${dengi(z.vsego)} ₽</button></div>`).join("")}
        <div class="ekMx ekMx--itog"><span>итого</span>${itogo.map((v) => `<span>−${dengi(v)}</span>`).join("")}<span>−${dengi(itogo.reduce((a, v) => a + v, 0))} ₽</span></div>
      </div>
      ${vse.length > pokaz.length ? `<button type="button" class="ekBtn ekEshche" data-mx-vse>Показать все ${chislo(vse.length)}</button>` : ""}`;
  }

  function primenitYacheyku(razrez, id, vid) {
    sost.pokazano = 50; sost.vid = vid;
    if (razrez === "napr") sost.gr = id;
    else if (razrez === "r1") { sost.r1 = String(id); sost.r2 = ""; }
    else if (razrez === "r2") sost.r2 = String(id);
    else if (razrez === "tip") sost.tip = String(id);
    else if (razrez === "brend") sost.brend = id;
    const u = new URL(location.href);
    if (sost.gr) u.searchParams.set("gruppa", sost.gr); else u.searchParams.delete("gruppa");
    history.replaceState(null, "", u);
    const dalshe = () => { risovat(); $("ekPozicii").scrollIntoView({ behavior: "smooth", block: "start" }); };
    if (razrez === "r1") vybratRubriku(id).then(() => $("ekPozicii").scrollIntoView({ behavior: "smooth", block: "start" })).catch(oshibka);
    else dalshe();
  }

  // 07.10 Степан («сделай, чтоб я мог выгружать»): коллега попросил объём в штуках по «хранится долго».
  // Выгрузка — ровно текущая выборка страницы (все фильтры), файл CSV для Excel: «;», запятая в дробях, BOM.
  async function vygruzit() {
    const kn = $("ekVygr");
    if (kn) { kn.disabled = true; kn.textContent = "Готовлю…"; }
    try {
      if (sost.r1 !== "") await rubrika(Number(sost.r1));
      else if (!vseZagruzheny()) await zagruzitVse();
      const sp = poVidu(vybor());
      if (sp.length > 100000 && !confirm(`В выборке ${chislo(sp.length)} позиций — файл будет большой. Выгрузить?`)) return;
      const ch = (v, z = 0) => (v == null || !isFinite(v) ? "" : Number(v).toFixed(z).replace(".", ","));
      const kl = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const shapka = ["рубрика", "категория", "код", "товар", "модель (тип)", "причина минуса", "продано за год, шт", "средний остаток, шт",
        "литров на штуку", "объём остатка, м³", "запас, дней продаж", "актов брака", "выручка, ₽", "маржа, ₽", "работа склада, ₽",
        "хранение, ₽", "брак, ₽", "остаётся за год, ₽", "остаётся со штуки, ₽"];
      const stroki = sp.map(({ k, i, r }) => [idx.slov.r1[k.r1[i]] || "", idx.slov.r2[k.r2[i]] || "", k.art[i] || "", k.imya[i], r.tip,
        r.itog < 0 ? prichina(r) : "", ch(r.sht), ch(k.ost[i], 1), ch(k.l[i], 2), ch(k.ost[i] * k.l[i] / 1000, 3), ch(r.dney),
        ch(r.ak), ch(r.vyr), ch(r.marzha), ch(r.rabota), ch(r.hran), ch(r.brak), ch(r.itog), r.sht ? ch(r.itog / r.sht, 2) : ""].map(kl).join(";"));
      const opis = [sost.gr, VIDY.find((v) => v[0] === sost.vid)[1], sost.r1 !== "" ? idx.slov.r1[Number(sost.r1)] : "",
        sost.r2 !== "" ? idx.slov.r2[Number(sost.r2)] : "", sost.brend, sost.q.trim()].filter(Boolean).join(" · ");
      const blob = new Blob([String.fromCharCode(0xFEFF) + [shapka.map(kl).join(";"), ...stroki].join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Экономика позиций — ${opis.replace(/[\\/:*?"<>|]/g, " ") || "выборка"} — ${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      const k2 = $("ekVygr");
      if (k2) { k2.disabled = false; k2.textContent = "Выгрузить в Excel"; }
    }
  }

  function snyat(chto) {
    sost.pokazano = 50; sost.vseGrupp = false;
    const vse = chto === "vse";
    if (vse || chto === "gr") sost.gr = "";
    if (vse || chto === "vid") sost.vid = "minus";
    if (vse || chto === "r2") sost.r2 = "";
    if (vse || chto === "tip") sost.tip = "";
    if (vse || chto === "brend") sost.brend = "";
    if (vse || chto === "porog") sost.porog = 0;
    if (vse || chto === "q") { sost.q = ""; $("ekPoisk").value = ""; }
    const u = new URL(location.href);
    if (!sost.gr) u.searchParams.delete("gruppa");
    history.replaceState(null, "", u);
    if (vse || chto === "r1") { sost.r1 = ""; vybratRubriku("").catch(oshibka); return; }
    risovat();
  }

  function risovat() {
    const q = zapros();
    risovatFiltr();
    if (sost.brend && !vseZagruzheny()) { zagruzitVse().then(risovat).catch(oshibka); return; }
    const imyaR1 = (n) => idx.slov.r1[n] || "без рубрики";
    risovatGruppyAg();
    risovatNapr();
    const g = gruppaAg();
    if (!g) risovatTopy(null, null);
    if (g && !vseZagruzheny() && sost.r1 === "") {
      zagruzitVse().then(risovat).catch(oshibka);
      return;
    }
    if (sost.r1 === "" && !q && !g && !vseZagruzheny()) {
      risovatMatr(null);
      // обзор без загрузки всех рубрик: сводка из index и топ-300 «маржу съели»
      const sv = idx.рубрики.filter((f) => f.свод).map((f) => ({ id: f.r1, imya: f.имя, s: izSvoda(f) }));
      const s = sv.reduce((a, { s: x }) => { for (const p in a) a[p] += x[p]; return a; }, { vyr: 0, marzha: 0, rabota: 0, hran: 0, brak: 0, itog: 0, minus: 0, n: 0 });
      kudaBit(idx.потери || pustyePoteri(), s.n, "Все рубрики · Домодедово · " + esc(idx.meta.период),
              "потери посчитаны по ставкам по умолчанию — со своими ставками выберите рубрику");
      glavnaya(s, "Куда уходит маржа · все рубрики", tarifyIzmeneny() ? "тарифы и «место» здесь по умолчанию — выберите рубрику для точного расчёта" : "");
      gruppy(sv, "Где теряем", "рубрики по потерям за год · щёлкните — категории и позиции", "r1");
      if (sost.vid !== "vse") {
        const top = idx.топKol;
        let sp = top.id.map((_, i) => ({ k: top, i, r: raschet(top, i) }));
        if (sost.tip !== "") sp = sp.filter(({ k, i }) => k.tip[i] === Number(sost.tip));
        pozicii(poVidu(sp), "худшие по всем рубрикам");
      } else {
        zagruzitVse().then(risovat).catch(oshibka);
        $("ekPozicii").innerHTML = `<p class="ekPusto">Загружаю все рубрики…</p>`;
      }
      return;
    }
    const sp = vybor();
    risovatMatr(sp);
    const s = summa(sp);
    const grPref = g ? `Направление «${esc(g.имя)}» · ${esc(g.что)}` : "";
    const mesto = q ? `Поиск «${esc(sost.q.trim())}»`
      : sost.r1 !== "" ? esc(imyaR1(Number(sost.r1))) + (sost.r2 !== "" ? " · " + esc(idx.slov.r2[Number(sost.r2)] || "без категории") : "")
        : g ? "" : "Все рубрики · Домодедово · " + esc(idx.meta.период);
    kudaBit(s.poteri, s.n, [grPref, mesto].filter(Boolean).join(" · "));
    risovatTopy(sp, g);
    if (g && !q && sost.r1 === "") {
      // группа антигенерации по всем рубрикам: где она лежит — по рубрикам, клик сужает
      glavnaya(s, `Направление «${esc(g.имя)}» · ${esc(g.признак)}`);
      const po = new Map();
      sp.forEach((x) => { const id = x.k.r1[x.i]; if (!po.has(id)) po.set(id, []); po.get(id).push(x); });
      gruppy([...po].map(([id, a]) => ({ id, imya: imyaR1(id), s: summa(a) })), "Где теряем", "рубрики группы по потерям · щёлкните — категории и позиции группы", "r1");
    } else if (q) {
      glavnaya(s, `Поиск «${esc(sost.q.trim())}»${sost.r1 !== "" ? " в рубрике " + esc(imyaR1(Number(sost.r1))) : ""}`);
      const po = new Map();
      sp.forEach((x) => { const id = x.k.r1[x.i]; if (!po.has(id)) po.set(id, []); po.get(id).push(x); });
      gruppy(sost.r1 === "" && po.size > 1 ? [...po].map(([id, a]) => ({ id, imya: imyaR1(id), s: summa(a) })) : [], "Где нашлось", "по рубрикам", "r1");
    } else if (sost.r1 !== "") {
      const r1 = Number(sost.r1);
      const r2imya = sost.r2 !== "" ? idx.slov.r2[Number(sost.r2)] || "без категории" : "";
      glavnaya(s, esc(imyaR1(r1)) + (r2imya ? " · " + esc(r2imya) : ""));
      if (sost.r2 === "") {
        const po = new Map();
        sp.forEach((x) => { const id = x.k.r2[x.i]; if (!po.has(id)) po.set(id, []); po.get(id).push(x); });
        gruppy([...po].map(([id, a]) => ({ id, imya: idx.slov.r2[id] || "без категории", s: summa(a) })), "Где теряем", "категории по потерям · щёлкните — позиции категории", "r2");
      } else $("ekGruppy").innerHTML = "";
    } else {
      // все рубрики загружены — сводка точная по текущим ставкам
      glavnaya(s, "Все рубрики · Домодедово · " + esc(idx.meta.период));
      const po = new Map();
      sp.forEach((x) => { const id = x.k.r1[x.i]; if (!po.has(id)) po.set(id, []); po.get(id).push(x); });
      gruppy([...po].map(([id, a]) => ({ id, imya: imyaR1(id), s: summa(a) })), "Где теряем", "рубрики по потерям за год · щёлкните — категории и позиции", "r1");
    }
    pozicii(poVidu(sp));
  }

  // ------------------------------------------------------------ карточка позиции

  function karta(k, i) {
    const r = raschet(k, i);
    const na = (v) => (r.sht ? v / r.sht : 0);
    const shagi = [
      ["Цена продажи", na(r.vyr), "plus"], ["− себестоимость", -na(r.seb), "minus"], ["Маржа", na(r.marzha), "itog"],
      ["− склад: работа со штукой", -na(r.rabota), "rab"], ["− склад: хранение", -na(r.hran), "hran"],
      ["− себес, потерянный на браке", -na(r.brakSeb), "brak"], ["− наша обработка брака", -na(r.obr), "brak"],
      ["Остаётся со штуки", na(r.itog), r.itog < 0 ? "itog is-minus" : "itog"],
    ];
    const maks = Math.max(...shagi.map((s) => Math.abs(s[1])), 1);
    const imyaR1 = idx.slov.r1[k.r1[i]] || "";
    $("ekKarta").innerHTML = `<button type="button" class="ekKarta__x" data-zakryt aria-label="Закрыть">×</button>
      <p class="ekKicker">${esc(imyaR1)}${idx.slov.r2[k.r2[i]] ? " · " + esc(idx.slov.r2[k.r2[i]]) : ""}${idx.slov.r3[k.r3[i]] ? " · " + esc(idx.slov.r3[k.r3[i]]) : ""}</p>
      <h2>${esc(k.imya[i])}</h2>
      <p class="ekKarta__pod">код ${k.art[i] || "—"} · модель учёта ${esc(idx.slov.model[k.model[i]])} (${esc(r.tip)}) · продано ${chislo(r.sht)} шт за год ·
        ${chislo(k.str[i])} строк заказов · актов брака ${chislo(r.ak)}${r.brakDolya != null ? ` (${chislo(r.brakDolya, 1)}%)` : ""}</p>
      <div class="ekItog ${r.itog < 0 ? "is-minus" : "is-plus"}"><span>остаётся со штуки</span><b>${r.sht ? rub(r.itog / r.sht) + " ₽" : "—"}</b>
        <span>за год</span><b>${mln(r.itog)} ₽</b></div>
      <div class="ekVodopad">${shagi.map(([imya, v, vid]) => `<div class="ekVodopad__s is-${vid}"><span>${imya}</span>
        <i style="--w:${Math.abs(v) / maks * 100}%"></i><b>${rub(v)}</b></div>`).join("")}</div>
      <dl class="ekKarta__fakty">
        <dt>Средний остаток на ДМД</dt><dd>${chislo(k.ost[i], 0)} шт · ${r.dney != null ? chislo(r.dney) + " дней продаж" : "не продаётся"}</dd>
        <dt>Объём штуки</dt><dd>${chislo(k.l[i], 2)} л${k.dl[i] ? ` · длина ${chislo(k.dl[i])} мм` : ""}${k.oc[i] ? " · габаритов нет в ВМС — медиана модели" : ""}</dd>
        <dt>Хранение за год</dt><dd>${mln(-r.hran)} ₽ — ${chislo(stavkaM3(), 1)} ₽ за м³ в сутки${(stavki.место[r.tip] || 1) !== 1 ? ` × место ${stavki.место[r.tip]}` : ""}</dd>
        <dt>Склад: работа</dt><dd>${r.poSht ? `${chislo(stavki.тарифы_шт[r.tip], 1)} ₽ на штуку × ${chislo(r.sht)} шт` : `${chislo(stavki.тарифы[r.tip] || 0, 1)} ₽ на операцию × ${chislo(r.ops)} строк заказов`} = ${mln(-r.rabota)} ₽</dd>
        <dt>Брак за год</dt><dd>себес ${mln(-r.brakSeb)} ₽ + обработка ${chislo(r.ak)} × ${chislo(obrabotka())} ₽ = ${mln(-r.obr)} ₽</dd>
      </dl>`;
    $("ekOkno").hidden = false;
    document.body.classList.add("ekZamok");
  }

  // ------------------------------------------------------------ ставки

  function risovatStavki() {
    const t = stavki.тарифы;
    const tipy = idx.slov.tip.filter(Boolean);
    $("ekStavki").innerHTML = `
      <div class="ekSt__gr"><h3>Хранение — расходы ДМД в месяц</h3>
        <label>Аренда, млн ₽<input type="number" step="0.1" data-st="аренда" value="${stavki.аренда}"></label>
        <label>Коммуналка, млн ₽<input type="number" step="0.1" data-st="коммуналка" value="${stavki.коммуналка}"></label>
        <label>Эксплуатация, млн ₽<input type="number" step="0.1" data-st="эксплуатация" value="${stavki.эксплуатация}"></label>
        <label>Средний объём товара на ДМД, м³<input type="number" step="100" data-st="объём" value="${stavki.объём}"></label>
        <p class="ekSt__itog">= ${chislo(stavkaM3(), 1)} ₽ за м³ в сутки, делим по объёму штуки</p></div>
      <div class="ekSt__gr"><h3>Брак — наша обработка</h3>
        <label>ФОТ и аутсорс ФБ, ₽ за штуку<input type="number" step="1" data-st="обработка" value="${stavki.обработка}"></label>
        <label>С арендой площадей ФБ, ₽<input type="number" step="1" data-st="обработка_с_арендой" value="${stavki.обработка_с_арендой}"></label>
        <label class="ekFlag"><input type="checkbox" data-st="с_арендой_фб"${stavki.с_арендой_фб ? " checked" : ""}> считать с арендой ФБ</label></div>
      <div class="ekSt__gr ekSt__gr--shir"><h3>Склад — сдельщина ДМД на операцию (мар–авг 2026) и место в ячейке</h3>
        <div class="ekSt__tarify">${tipy.map((tp) => `<label><b>${esc(tp)}</b>
          <span>₽ <input type="number" step="0.1" data-tarif="${esc(tp)}" value="${t[tp] ?? 0}"></span>
          <span>место × <input type="number" step="0.1" min="0.1" data-mesto="${esc(tp)}" value="${stavki.место[tp] || 1}"></span>
          ${stavki.по_штукам.includes(tp) ? `<span>₽/шт <input type="number" step="0.1" min="0" data-tsht="${esc(tp)}" value="${stavki.тарифы_шт[tp] ?? 0}"></span>` : ""}</label>`).join("")}</div>
        <p class="ekSt__itog">«место ×» — сколько объёма штука занимает сверх своего: длинномер лежит в длинной ячейке, рулон — с пустотами.
          Крупное (${esc(stavki.по_штукам.join(", "))}) — «₽/шт» × проданные штуки, как в книге 24.09; мелочь — «₽» на операцию × строки заказов (её берут пачками).</p></div>
      <div class="ekSt__kn"><button type="button" class="ekBtn" data-sbros>Вернуть ставки по умолчанию</button></div>`;
  }

  function kakSchitali() {
    const m = idx.meta;
    $("ekKak").innerHTML = `<summary>Как считали · ${esc(m.период)} · ${chislo(m.строк)} позиций · хранение ${chislo(stavkaM3(), 1)} ₽ за м³ в сутки · обработка брака ${chislo(obrabotka())} ₽ за штуку</summary><ul>
      <li>Период ${esc(m.период)}. Позиции — всё, что лежало на Домодедово хоть на одном снимке за год, или было в актах брака; на странице — с продажами от ${m.порог_продаж} шт за год или с актами (${chislo(m.строк)} из ${chislo(m.позиций)}).</li>
      <li>Продажи — витрина продаж (проведённые продажи и возвраты-продажи), без канала уценки; цена и себестоимость без НДС. Сверено с книгой 24.09 до штуки (профиль 6 мм — 38 290 шт).</li>
      <li>Склад, работа — сдельщина ДМД за март–август 2026 на одну операцию (приёмка, размещение, отбор, консолидация, комплектация) по типу модели учёта. Крупное (КГ, ДЛ, негабарит, тележки) — на штуку × проданные штуки, как в книге 24.09 (ДЛ 12,9 ₽, КГ 29,7 ₽); мелочь — на операцию × строки заказов (её берут пачками). Тип по модели учёта ВМС: Ф(ДЛ…) → ДЛ, Ф(КГ…), сыпучка, тяжёлые → КГ, лоточное хранение и «Диски» → МОС, расходка → РМ, остальное → ОС.</li>
      <li>Хранение — расходы ДМД в месяц (аренда, коммуналка, эксплуатация) / средний объём товара на складе ${chislo(m.средний_объём_остатка_ДМД_м3)} м³ / дни. Объём штуки — габариты базовой единицы в ВМС; без габаритов (${chislo(m.без_габаритов)} позиций) — медиана модели. Средний остаток ДМД — по 1-м числам 12 месяцев.</li>
      <li>Брак — акты внутреннего брака (проведённые) за год: потерянный себес и наша обработка (ФОТ и аутсорс фильтра брака на штуку входа; с арендой площадей ФБ — дороже).</li>
      <li>Не вошло: вывоз и утилизация отходов подрядчиком, логистика до клиента, продажа уценённого (выручка уценки по этим позициям мала).</li></ul>`;
  }

  // ------------------------------------------------------------ события

  async function vybratRubriku(v) {
    sost.r1 = String(v); sost.r2 = ""; sost.pokazano = 50; sost.vseGrupp = false;
    $("ekR1").value = sost.r1;
    const r2Box = $("ekR2Box");
    if (sost.r1 === "") { r2Box.hidden = true; risovat(); return; }
    const k = await rubrika(Number(sost.r1));
    const shet = new Map();
    k.r2.forEach((x) => shet.set(x, (shet.get(x) || 0) + 1));
    $("ekR2").innerHTML = `<option value="">Все категории · ${chislo(k.id.length)}</option>` + [...shet.entries()]
      .sort((a, b) => b[1] - a[1]).map(([x, n]) => `<option value="${x}">${esc(idx.slov.r2[x] || "без категории")} · ${chislo(n)}</option>`).join("");
    r2Box.hidden = false;
    risovat();
  }
  function vybratKategoriyu(v) {
    sost.r2 = String(v); sost.pokazano = 50;
    $("ekR2").value = sost.r2;
    risovat();
    $("ekGlav").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  let taymer = 0;
  async function poisk(q) {
    sost.q = q; sost.pokazano = 50; sost.vseGrupp = false;
    if (q.trim() && sost.vid !== "vse") sost.vid = "vse";   // ищут конкретный товар — показываем его, каким бы он ни был
    if (q.trim() && sost.r1 === "") await zagruzitVse();
    risovat();
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "ekR1") { vybratRubriku(t.value).catch(oshibka); return; }
    if (t.id === "ekR2") { sost.r2 = t.value; sost.pokazano = 50; risovat(); return; }
    if (t.id === "ekTip") { sost.tip = t.value; sost.pokazano = 50; risovat(); return; }
    if (t.dataset.st) {
      stavki[t.dataset.st] = t.type === "checkbox" ? t.checked : Number(t.value) || 0;
      sohranitStavki(); risovatStavki(); kakSchitali(); risovat(); return;
    }
    if (t.dataset.tarif) { stavki.тарифы[t.dataset.tarif] = Number(t.value) || 0; sohranitStavki(); risovat(); return; }
    if (t.dataset.mesto) { stavki.место[t.dataset.mesto] = Number(t.value) || 1; sohranitStavki(); risovat(); return; }
    if (t.dataset.tsht) { stavki.тарифы_шт[t.dataset.tsht] = Number(t.value) || 0; sohranitStavki(); risovat(); }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id !== "ekPoisk") return;
    clearTimeout(taymer);
    const q = e.target.value;
    taymer = setTimeout(() => poisk(q).catch(oshibka), 300);
  });
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("#ekStavkiKn")) {
      const otkr = $("ekStavki").hidden;
      $("ekStavki").hidden = !otkr;
      $("ekStavkiKn").setAttribute("aria-expanded", String(otkr));
      return;
    }
    if (t.closest("[data-sbros]")) { stavki = stavkiPoUmolch(); sohranitStavki(); risovatStavki(); kakSchitali(); risovat(); return; }
    if (t.closest("[data-eshche]")) { sost.pokazano += 50; risovat(); return; }
    if (t.closest("[data-vsegrupp]")) { sost.vseGrupp = true; risovat(); return; }
    const nt = t.closest(".ekNk__tov[data-i]");
    if (nt) { const k = rubriki.get(Number(nt.dataset.k)); if (k) karta(k, Number(nt.dataset.i)); return; }
    const mx = t.closest("[data-mx]");
    if (mx) { primenitYacheyku(sost.razrez, mx.dataset.mx, mx.dataset.mxVid); return; }
    if (t.closest("[data-mx-vse]")) { sost.mxVse = true; risovat(); return; }
    const rz = t.closest("[data-razrez]");
    if (rz) { sost.razrez = rz.dataset.razrez; sost.mxVse = false; risovat(); return; }
    const pg = t.closest("[data-porog]");
    if (pg) { sost.porog = Number(pg.dataset.porog) || 0; sost.pokazano = 50; risovat(); return; }
    const sn = t.closest("[data-snyat]");
    if (sn) { snyat(sn.dataset.snyat); return; }
    if (t.closest("[data-vygr]")) { vygruzit().catch(oshibka); return; }
    const ga = t.closest("[data-grag]");
    if (ga) {
      // из фильтров — выбор (повторный клик снимает), с карточки направления — тоже переключатель
      sost.gr = ga.dataset.grag === sost.gr ? "" : ga.dataset.grag;
      sost.pokazano = 50; sost.vseGrupp = false;
      const u = new URL(location.href);
      if (sost.gr) u.searchParams.set("gruppa", sost.gr); else u.searchParams.delete("gruppa");
      history.replaceState(null, "", u);
      risovat();
      if (sost.gr && !$("ekTopy").hidden) $("ekTopy").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const vd = t.closest("[data-vid]");
    if (vd) {
      sost.vid = vd.dataset.vid; sost.pokazano = 50; risovat();
      if (vd.hasAttribute("data-k-poz")) $("ekPozicii").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const g1 = t.closest(".ekGr[data-r1]");
    if (g1) { vybratRubriku(g1.dataset.r1).then(() => $("ekGlav").scrollIntoView({ behavior: "smooth", block: "start" })).catch(oshibka); return; }
    const g2 = t.closest(".ekGr[data-r2]");
    if (g2) { vybratKategoriyu(g2.dataset.r2); return; }
    const p = t.closest(".ekPoz[data-i], .ekTopRyad[data-i]");
    if (p) {
      const k = p.dataset.k === "top" ? idx.топKol : rubriki.get(Number(p.dataset.k));
      if (k) karta(k, Number(p.dataset.i));
      return;
    }
    if (t.closest("[data-zakryt]")) { $("ekOkno").hidden = true; document.body.classList.remove("ekZamok"); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("ekOkno").hidden) { $("ekOkno").hidden = true; document.body.classList.remove("ekZamok"); } });

  function oshibka(e) { $("ekGlav").innerHTML = `<p class="ekGlav__kto">Не загрузилось: ${esc(e.message || e)}</p>`; }

  // ------------------------------------------------------------ старт

  (async function start() {
    try {
      idx = await gz("index.json.gz");
      // топ-300 — в колонки, как рубрика: тот же расчёт
      const kol = {};
      Object.keys(idx.топ[0] || {}).forEach((p) => { kol[p] = idx.топ.map((x) => x[p]); });
      idx.топKol = kol;
      zagruzitStavki();
      await zagruzitGruppy();
      const izSsylki = new URL(location.href).searchParams.get("gruppa");
      if (izSsylki && gruppyAg.some((g) => g.имя === izSsylki)) { sost.gr = izSsylki; sost.vid = "vse"; }
      $("ekR1").innerHTML += [...idx.рубрики].sort((a, b) => a.имя.localeCompare(b.имя, "ru"))
        .map((f) => `<option value="${f.r1}">${esc(f.имя)} · ${chislo(f.строк)}</option>`).join("");
      risovatStavki();
      kakSchitali();
      risovat();
      // направления считаются по всем позициям — догружаем рубрики фоном и перерисовываем
      if (!vseZagruzheny()) zagruzitVse().then(risovat).catch(oshibka);
    } catch (e) { oshibka(e); }
  })();
})();
