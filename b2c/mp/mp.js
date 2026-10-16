/* Маркетплейсы — дашборд НИП и маркетплейсов на b2c-vi.ru (17.10.2026).

   Вместо Superset 259 «Работа с маркетплейсами». ТЗ Павла (аналитик МП): стр. 1 — топ метрик (SLA, производительность,
   необеспеченный сток, операции → отгружено / не отгружено → инциденты / нет товара), тотал сверху, динамика
   день / неделя / месяц; стр. 2 — возвраты и отмены (динамика, топ причин, деньги). Рома — операционка Ozon | ЯМ.

   Данные — ../data/mp.json (vitriny/sajt.py на сервере): «кубики» — разрезы номерами в словарях + числа.
   Считает страница: фильтр → вёдра по шагу → суммы → доли. Сток и брак — штуки, заказы — заказы WMS. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const box = $("mp");
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
  const count = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const one = (v) => Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  const two = (v) => Number(v || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (a, b, z = 1) => (b ? `${Number(100 * a / b).toLocaleString("ru-RU", { minimumFractionDigits: z, maximumFractionDigits: z })}%` : "—");
  const rub = (v) => { const a = Math.abs(v); return a >= 1e6 ? `${one(v / 1e6)} млн ₽` : a >= 1e3 ? `${Math.round(v / 1e3).toLocaleString("ru-RU")} тыс ₽` : `${count(v)} ₽`; };
  const dd = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  const MES = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

  let D = null;
  const K = {};                    // кубики строками-объектами
  const s = { vkl: "top", dney: 30, shag: "день", mp: "", shema: "", gorod: "" };

  /** Кубик из файла → массив объектов {разрез: значение, число: …}. */
  function razvernut(kub) {
    if (!kub || !kub.stroki) return [];
    const r = kub.razrezy, ch = kub.chisla, sl = kub.slovari;
    return kub.stroki.map((st) => {
      const o = {};
      r.forEach((imya, i) => { o[imya] = sl[imya][st[i]]; });
      ch.forEach((imya, i) => { o[imya] = st[r.length + i]; });
      return o;
    });
  }

  /** ISO-неделя: понедельник. */
  function ponedelnik(iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0, 10);
  }
  function klyuch(iso) {
    if (s.shag === "неделя") return ponedelnik(iso);
    if (s.shag === "месяц") return iso.slice(0, 7);
    return iso;
  }
  function podpis(k) {
    if (s.shag === "месяц") return `${MES[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;
    return dd(k);
  }

  /** Конец периода — последний день с данными (вчера), начало — s.dney дней назад. */
  let POSL = null;
  function granicy() {
    if (!POSL) {
      // последний день с данными в любом кубике, но не позже вчера: сегодняшний день ещё идёт
      const vchera = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      POSL = ["zakazy", "vozvraty", "otmeny", "proizv"].flatMap((k) => K[k].map((r) => r.den))
        .filter((d) => d <= vchera).sort().pop() || vchera;
    }
    const po = POSL;
    const d = new Date(`${po}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - s.dney + 1);
    return { s: d.toISOString().slice(0, 10), po };
  }

  function filtr(rows, est = {}) {
    const g = granicy();
    return rows.filter((r) => r.den >= g.s && r.den <= g.po
      && (!s.mp || !("mp" in r) || r.mp === s.mp || est.mp === false)
      && (!s.shema || !("shema" in r) || r.shema === s.shema || est.shema === false)
      && (!s.gorod || !("gorod" in r) || r.gorod === s.gorod || est.gorod === false));
  }

  /** Вёдра: ключ шага → строки. Порядок — по времени. */
  function vedra(rows) {
    const m = new Map();
    rows.forEach((r) => { const k = klyuch(r.den); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  const sum = (rows, k, usl = () => true) => rows.reduce((a, r) => a + (usl(r) ? (r[k] || 0) : 0), 0);

  /** Заказы склада: итог «1. Отгружен» … «7. Нет товара». */
  function zakazy(rows) {
    const z = (pref) => sum(rows, "zakazov", (r) => r.itog.startsWith(pref));
    const o = { zak: sum(rows, "zakazov"), otgr: z("1."), poteri: z("2."), brak: z("3."), nekompl: z("4."), uz: z("5."), otm: z("6."), stok: z("7.") };
    o.ne = o.zak - o.otgr - o.otm;
    o.inc = o.poteri + o.brak + o.nekompl + o.uz;
    o.sla = o.zak - o.otm ? 100 * o.otgr / (o.zak - o.otm) : null;
    return o;
  }

  function grafik(tochki, o = {}) {
    return window.ViGrafik.sozdat({
      tochki, format: o.format || ((v) => (Math.abs(v) >= 1e6 ? `${one(v / 1e6)} млн` : Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}к` : one(v))),
      formatTochno: o.formatTochno || one, edinica: o.edinica || "", otNulya: o.otNulya !== false, trend: 0,
      mediana: false, linii: o.linii || [], legendaLinii: o.legenda || "", vysota: o.vysota || 240, klik: o.klik, ugol: true,
    });
  }

  function block(title, lead, ...body) {
    const sec = document.createElement("section");
    sec.className = "perfBlock";
    sec.innerHTML = `<div class="perfHead"><div><h2>${title}</h2>${lead ? `<p class="perfLead">${lead}</p>` : ""}</div></div>`;
    body.forEach((b) => b && sec.appendChild(typeof b === "string" ? Object.assign(document.createElement("div"), { innerHTML: b }) : b));
    return sec;
  }

  function karta(title, value, note, cls = "", yakor = "") {
    return `<a class="perfCard mpKarta ${cls}" href="#${yakor}"><p class="perfCard__title">${title}</p>`
      + `<b class="perfCard__value">${value}</b><span class="perfCard__note">${note}</span></a>`;
  }

  /** Полосы: [{imya, val, note, filtr: {mp|shema|gorod: …}}] — клик ставит фильтр. */
  function polosy(spisok, fmt = count) {
    const maks = Math.max(...spisok.map((x) => x.val), 1e-9);
    return `<div class="polosy mpPolosy">${spisok.map((x) => {
      const on = x.filtr && Object.entries(x.filtr).every(([k, v]) => s[k] === v);
      const data = x.filtr ? `data-filtr='${esc(JSON.stringify(x.filtr))}'` : "";
      return `<button type="button" class="contourRow ${on ? "is-on" : ""}" ${data}><span class="contourRow__name">${esc(x.imya)}</span>`
        + `<span class="contourRow__track"><i style="width:${(100 * x.val / maks).toFixed(1)}%"></i></span>`
        + `<b class="contourRow__value">${fmt(x.val)}</b><span class="contourRow__note">${x.note || ""}</span></button>`;
    }).join("")}</div>`;
  }

  function razbivka(rows, pole, val, note) {
    const m = new Map();
    rows.forEach((r) => { const k = r[pole]; m.set(k, [...(m.get(k) || []), r]); });
    return [...m.entries()].map(([k, rr]) => ({ imya: k, val: val(rr), note: note ? note(rr) : "", filtr: { [pole]: k } }))
      .sort((a, b) => b.val - a.val);
  }

  // ------------------------------------------------------------------ фильтры
  function knopki(imya, znach, varianty) {
    return `<span class="mpFiltry__gruppa"><span class="mpFiltry__podpis">${imya}</span><span class="stepSwitch">${varianty.map(([v, t]) =>
      `<button type="button" class="stepSwitch__item ${String(s[znach]) === String(v) ? "is-on" : ""}" data-s="${znach}" data-v="${esc(v)}">${t}</button>`).join("")}</span></span>`;
  }

  function filtry() {
    const goroda = [...new Set(K.zakazy.map((r) => r.gorod))];
    const glavnye = ["МСК", "СПб", "ЕКБ", "РНД", "КАЗ"].filter((g) => goroda.includes(g));
    $("filtry").innerHTML = knopki("период", "dney", [[7, "7 дней"], [30, "30 дней"], [90, "90 дней"], [365, "год"]])
      + knopki("шаг", "shag", [["день", "день"], ["неделя", "неделя"], ["месяц", "месяц"]])
      + knopki("маркетплейс", "mp", [["", "все"], ["Ozon", "Ozon"], ["ЯМ", "ЯМ"], ["WB", "WB"], ["ТШоп", "ТШоп"]])
      + knopki("схема", "shema", [["", "все"], ["FBS", "FBS"], ["DBS", "DBS"]])
      + knopki("город", "gorod", [["", "все"], ...glavnye.map((g) => [g, g])]);
  }

  // ------------------------------------------------------------------ стр. 1: топ метрик
  function stranicaTop(out) {
    const rows = filtr(K.zakazy);
    if (!rows.length) { out.push(block("Заказы маркетплейсов", "", `<p class="mpPusto">За период с этими фильтрами заказов нет.</p>`)); return; }
    const t = zakazy(rows);
    const pr = filtr(K.proizv.filter((r) => !r.operaciya.startsWith("5.")), { shema: false });
    const sht = sum(pr, "sht"), ch = sum(pr, "chelovekochasov");
    out.push(Object.assign(document.createElement("div"), { className: "perfTop", innerHTML:
      karta("Заказов", count(t.zak), "в WMS, по волне", "", "g-zak")
      + karta("Отгружено", count(t.otgr), `уехало · отменил покупатель ${count(t.otm)}`, "", "g-zak")
      + karta("SLA отгрузки", t.sla == null ? "—" : `${one(t.sla)}%`, "отгружено / (заказов − отмены)", t.sla >= 99.5 ? "mpKarta--horosho" : "mpKarta--plokho", "g-sla")
      + karta("Не отгружено", count(t.ne), `${pct(t.ne, t.zak, 2)} от заказов`, t.ne ? "mpKarta--plokho" : "", "g-ne")
      + karta("Инциденты", count(t.inc), `потеряли ${count(t.poteri)} · брак ${count(t.brak)} · некомпл. ${count(t.nekompl)} · УЗ ${count(t.uz)}`, "", "g-ne")
      + karta("Нет товара", count(t.stok), `необеспеченный сток · ${pct(t.stok, t.zak, 2)}`, "", "g-ne")
      + karta("Производительность", ch ? `${two(sht / ch)}` : "—", `шт в час · ${count(sht)} шт за ${count(ch)} чел.-ч`, "", "g-pr") }));
    out.push(Object.assign(document.createElement("p"), { className: "mpFormula", innerHTML:
      `<b>${count(t.zak)}</b> заказов = <b>${count(t.otgr)}</b> отгружено + <b>${count(t.otm)}</b> отменил покупатель + <b>${count(t.ne)}</b> не отгружено`
      + ` (<b>${count(t.inc)}</b> инциденты + <b>${count(t.stok)}</b> нет товара)` }));

    const V = vedra(rows).map(([k, rr]) => ({ k, ...zakazy(rr) }));
    const tochki = (f) => V.map((v) => ({ znach: f(v), os: podpis(v.k), zag: podpis(v.k) }));
    const g1 = block("SLA отгрузки", "% отгружено от заказов без отмен покупателя, по волне", grafik(tochki((v) => (v.sla == null ? null : Math.round(v.sla * 100) / 100)), { otNulya: false, edinica: "%", formatTochno: two }));
    g1.id = "g-sla";
    const g2 = block("Заказов и отгружено", "линия — заказы в WMS, пунктир — отгружено", grafik(tochki((v) => v.zak), { linii: [{ znach: V.map((v) => v.otgr), klass: "limit", podpis: "отгружено" }], legenda: "заказов" }));
    g2.id = "g-zak";
    const g3 = block("Не отгружено", "инциденты (потери, брак, некомплект, УЗ) и нет товара", grafik(tochki((v) => v.inc), { linii: [{ znach: V.map((v) => v.stok), klass: "limit", podpis: "нет товара" }], legenda: "инциденты" }));
    g3.id = "g-ne";
    const Vp = vedra(pr).map(([k, rr]) => ({ k, sht: sum(rr, "sht"), ch: sum(rr, "chelovekochasov") }));
    const g4 = block("Производительность", "штук в час на участках МП: подача, перекладка, комплектация, оклейка", grafik(Vp.map((v) => ({ znach: v.ch ? Math.round(100 * v.sht / v.ch) / 100 : null, os: podpis(v.k), zag: `${podpis(v.k)} · ${count(v.sht)} шт за ${count(v.ch)} чел.-ч` })), { otNulya: false, formatTochno: two }));
    g4.id = "g-pr";
    // много точек (30 дней по дню) — графики по одному в строку, иначе подписи по оси слипаются
    out.push(Object.assign(document.createElement("div"), { className: V.length > 16 ? "mpOdin" : "mpDva" }));
    out[out.length - 1].append(g1, g2, g3, g4);

    out.push(Object.assign(document.createElement("div"), { className: "mpDva" }));
    out[out.length - 1].append(
      block("По маркетплейсам", "заказов · SLA", polosy(razbivka(filtr(K.zakazy, { mp: false }), "mp", (rr) => sum(rr, "zakazov"), (rr) => { const z = zakazy(rr); return `SLA ${z.sla == null ? "—" : one(z.sla) + "%"} · нет товара ${count(z.stok)}`; }))),
      block("По схемам и городам", "заказов · SLA",
        polosy(razbivka(filtr(K.zakazy, { shema: false }), "shema", (rr) => sum(rr, "zakazov"), (rr) => { const z = zakazy(rr); return `SLA ${z.sla == null ? "—" : one(z.sla) + "%"}`; })),
        polosy(razbivka(filtr(K.zakazy, { gorod: false }), "gorod", (rr) => sum(rr, "zakazov"), (rr) => { const z = zakazy(rr); return `SLA ${z.sla == null ? "—" : one(z.sla) + "%"}`; }).slice(0, 10))));

    const nip = filtr(K.nip);
    if (nip.length) {
      const tn = zakazy(nip);
      out.push(block("Весь b2c (НИП)", `заказы WMS всех веток НИП: ${count(tn.zak)} · SLA ${tn.sla == null ? "—" : one(tn.sla) + "%"} · нет товара ${count(tn.stok)}`,
        polosy(razbivka(nip, "vetka", (rr) => sum(rr, "zakazov"), (rr) => { const z = zakazy(rr); return `SLA ${z.sla == null ? "—" : one(z.sla) + "%"} · нет товара ${count(z.stok)}`; }).map((x) => ({ ...x, filtr: null })))));
    }
  }

  // ------------------------------------------------------------------ стр. 2: возвраты и отмены
  const VYDANO = /^(4|5|6|9)\./;
  function stranicaVozvraty(out) {
    const vz = filtr(K.vozvraty);
    const vyd = vz.filter((r) => VYDANO.test(r.kategoriya));
    const v = { vyd: sum(vyd, "sht"), srok: sum(vz, "sht", (r) => r.kategoriya.startsWith("4.")), pozzhe: sum(vz, "sht", (r) => r.kategoriya.startsWith("5.")),
      ne: sum(vz, "sht", (r) => r.kategoriya.startsWith("6.")), pret: sum(vz, "sht", (r) => r.kategoriya.startsWith("9.")),
      brak: sum(vyd, "brak"), rub: sum(vyd, "rub"), ozon: sum(vz, "sht", (r) => /^(2|3|7)\./.test(r.kategoriya)) };
    const ot = filtr(K.otmeny, { gorod: false });
    const pd = filtr(K.prodazhi, { gorod: false });
    const o = { sht: sum(ot, "sht"), rub: sum(ot, "rub"), vsego: sum(pd, "sht") };
    out.push(Object.assign(document.createElement("div"), { className: "perfTop", innerHTML:
      karta("Возвратов", count(v.vyd), `выдано маркетплейсом · ещё у МП ${count(v.ozon)}`, "", "g-vz")
      + karta("Принято в срок · 48 ч", pct(v.srok, v.vyd), `${count(v.srok)} шт · позже ${count(v.pozzhe)}`, "", "g-vz")
      + karta("Не принято", count(v.ne), `${pct(v.ne, v.vyd)} от выданного · претензии ${count(v.pret)}`, v.ne ? "mpKarta--plokho" : "", "g-vz")
      + karta("Брак в возвратах", count(v.brak), `${pct(v.brak, v.srok + v.pozzhe)} от принятых`, "", "g-pv")
      + karta("Деньги в возвратах", rub(v.rub), "по цене товара", "", "g-pv")
      + karta("Отмен", count(o.sht), `${pct(o.sht, o.vsego)} от заказанного · ${rub(o.rub)}`, "", "g-ot") }));

    const Vv = vedra(vyd).map(([k, rr]) => ({ k, sht: sum(rr, "sht") }));
    const Vo = vedra(ot).map(([k, rr]) => ({ k, sht: sum(rr, "sht") }));
    const g1 = block("Возвраты", "штук выдано маркетплейсом, по дате статуса", grafik(Vv.map((x) => ({ znach: x.sht, os: podpis(x.k), zag: podpis(x.k) })))); g1.id = "g-vz";
    const g2 = block("Отмены", "штук, по дню заказа", grafik(Vo.map((x) => ({ znach: x.sht, os: podpis(x.k), zag: podpis(x.k) })))); g2.id = "g-ot";
    out.push(Object.assign(document.createElement("div"), { className: Vv.length > 16 ? "mpOdin" : "mpDva" }));
    out[out.length - 1].append(g1, g2);

    const top = (rows, pole, val, n = 10) => razbivka(rows, pole, val).slice(0, n).map((x) => ({ ...x, filtr: null }));
    const b1 = block("Причины возвратов · топ-10", "штук", polosy(top(vyd, "prichina", (rr) => sum(rr, "sht"))));
    const b2 = block("Деньги в возвратах по причинам", "₽ по цене товара", polosy(top(vyd, "prichina", (rr) => sum(rr, "rub")), rub)); b2.id = "g-pv";
    const b3 = block("Причины отмен · топ-10", "штук", polosy(top(ot, "prichina", (rr) => sum(rr, "sht"))));
    const b4 = block("Деньги в отменах по причинам", "₽", polosy(top(ot, "prichina", (rr) => sum(rr, "rub")), rub));
    const b5 = block("Кто отменил", "штук", polosy(top(ot, "kto", (rr) => sum(rr, "sht"))));
    out.push(Object.assign(document.createElement("div"), { className: "mpDva" }));
    out[out.length - 1].append(b1, b2, b3, b4, b5);

    // возвраты по категориям — когорта по месяцу заказа (Рома 16.10)
    const g = granicy();
    const mesS = g.s.slice(0, 7), mesPo = g.po.slice(0, 7);
    const kat = new Map();
    (Array.isArray(D.kategorii) ? D.kategorii : []).forEach(([mes, mp, k, otgr, vozvr, brak]) => {
      if (mes < mesS || mes > mesPo || (s.mp && mp !== s.mp) || k === "BLANK") return;
      const x = kat.get(k) || { otgr: 0, vozvr: 0, brak: 0 }; x.otgr += otgr; x.vozvr += vozvr; x.brak += brak; kat.set(k, x);
    });
    const ks = [...kat.entries()].filter(([, x]) => x.otgr >= 50).map(([k, x]) => ({ imya: k, val: 100 * x.vozvr / x.otgr,
      note: `${count(x.vozvr)} из ${count(x.otgr)} шт · брак ${pct(x.brak, x.vozvr, 0)}` })).sort((a, b) => b.val - a.val);
    out.push(block("Возвраты по категориям", `доля отгруженного, которая вернулась · когорта отправлений ${MES[+mesS.slice(5) - 1]}–${MES[+mesPo.slice(5) - 1]} (последний месяц ещё досчитывается)`,
      ks.length ? polosy(ks, (x) => `${one(x)}%`) : `<p class="mpPusto">Нет данных за период.</p>`));
  }

  // ------------------------------------------------------------------ стр. 3: операционка
  function polovina(mp) {
    const rows = filtr(K.zakazy, { mp: false }).filter((r) => r.mp === mp);
    const t = zakazy(rows);
    const pr = filtr(K.proizv, { mp: false, shema: false }).filter((r) => r.mp === mp && !r.operaciya.startsWith("5."));
    const sht = sum(pr, "sht"), ch = sum(pr, "chelovekochasov");
    const sec = document.createElement("section");
    sec.className = "mpPolovina";
    sec.innerHTML = `<h3>${mp === "ЯМ" ? "Яндекс Маркет" : mp}</h3><div class="perfTop">`
      + karta("Заказов", count(t.zak), `FBS ${count(sum(rows, "zakazov", (r) => r.shema === "FBS"))} · DBS ${count(sum(rows, "zakazov", (r) => r.shema === "DBS"))}`)
      + karta("SLA", t.sla == null ? "—" : `${one(t.sla)}%`, `не отгружено ${count(t.ne)}`, t.sla >= 99.5 ? "mpKarta--horosho" : "mpKarta--plokho")
      + karta("Нет товара", count(t.stok), `инциденты ${count(t.inc)}`)
      + karta("Шт в час", ch ? two(sht / ch) : "—", `${count(sht)} шт`) + "</div>";
    const V = vedra(rows).map(([k, rr]) => ({ k, ...zakazy(rr) }));
    sec.appendChild(grafik(V.map((v) => ({ znach: v.sla == null ? null : Math.round(v.sla * 100) / 100, os: podpis(v.k), zag: `${podpis(v.k)} · заказов ${count(v.zak)}` })), { otNulya: false, edinica: "%", formatTochno: two, vysota: 200 }));
    return sec;
  }

  function stranicaOper(out) {
    const dva = Object.assign(document.createElement("div"), { className: "mpDva" });
    dva.append(polovina("Ozon"), polovina("ЯМ"));
    out.push(block("Ozon | Яндекс Маркет", "операционный борд пополам · SLA по волне", dva));

    const pr = filtr(K.proizv, { shema: false });
    const ops = new Map();
    pr.forEach((r) => { const k = `${r.gorod} · ${r.operaciya}`; const x = ops.get(k) || { sht: 0, ch: 0 }; x.sht += r.sht; x.ch += r.chelovekochasov; ops.set(k, x); });
    const sp = [...ops.entries()].filter(([, x]) => x.ch >= 5).map(([k, x]) => ({ imya: k, val: x.sht / x.ch, note: `${count(x.sht)} шт · ${count(x.ch)} чел.-ч` }))
      .sort((a, b) => (a.imya < b.imya ? -1 : 1));
    out.push(block("Производительность по участкам", "штук в час: город · операция (5. — приёмка возвратов)", sp.length ? polosy(sp, two) : `<p class="mpPusto">Нет данных за период.</p>`));

    const vol = (D.volna && D.volna.stroki) || [];
    const vv = vol.filter((r) => !s.mp || r[1] === s.mp);
    const uch = [...new Set(vv.map((r) => r[2]))].sort();
    const gor = [...new Set(vv.map((r) => r[0]))];
    const tab = `<div class="mpTablica"><table><thead><tr><th>город</th>${uch.map((u) => `<th>${esc(u)}</th>`).join("")}</tr></thead><tbody>${gor.map((g) =>
      `<tr><td>${esc(g)}</td>${uch.map((u) => { const r = vv.filter((x) => x[0] === g && x[2] === u); const z = r.reduce((a, x) => a + x[3], 0); const sh = r.reduce((a, x) => a + x[4], 0); return `<td>${z ? `${count(z)} <span class="vz-mute">(${count(sh)} шт)</span>` : "—"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;
    out.push(block("Волна сейчас", `заказов на участках · срез ${D.volna && D.volna.srez ? D.volna.srez.replace("T", " ") : "—"} (DWH отстаёт от WMS на часы)`, vv.length ? tab : `<p class="mpPusto">Среза ещё нет.</p>`));
  }

  // ------------------------------------------------------------------ сборка
  function render() {
    filtry();
    document.querySelectorAll("#vkladki .perfView").forEach((a) => a.classList.toggle("is-on", a.dataset.vkl === s.vkl));
    const out = [];
    if (s.vkl === "vozvraty") stranicaVozvraty(out);
    else if (s.vkl === "oper") stranicaOper(out);
    else stranicaTop(out);
    box.replaceChildren(...out);
    const g = granicy();
    $("primechanie").textContent = `Период ${dd(g.s)}–${dd(g.po)}. Заказы и SLA — по волне WMS (заказ до 12:00 — волна этого дня). `
      + "Маркетплейс — по контрагенту заказа ВТИС, схема: FBS — через ТК маркетплейса, DBS — везём сами / магазины / ПВЗ. "
      + "Возвраты — выданные маркетплейсом (в срок, позже, не принято, претензии).";
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-s]");
    if (b) { const k = b.dataset.s; s[k] = k === "dney" ? +b.dataset.v : b.dataset.v; render(); return; }
    const f = e.target.closest("[data-filtr]");
    if (f) { const x = JSON.parse(f.dataset.filtr); for (const [k, v] of Object.entries(x)) s[k] = s[k] === v ? "" : v; render(); return; }
    const t = e.target.closest("#vkladki [data-vkl]");
    if (t) { e.preventDefault(); s.vkl = t.dataset.vkl; history.replaceState(null, "", `#${s.vkl}`); render(); }
  });

  async function start() {
    try {
      const o = await fetch("../data/mp.json", { cache: "no-store" });
      if (!o.ok) throw new Error(`сервер ответил ${o.status}`);
      D = await o.json();
      for (const k of ["zakazy", "nip", "proizv", "vozvraty", "otmeny", "prodazhi"]) K[k] = razvernut(D[k]);
      const h = location.hash.slice(1);
      if (["top", "vozvraty", "oper"].includes(h)) s.vkl = h;
      $("message").hidden = true;
      $("stamp").textContent = `данные на ${D.obnovleno.replace("T", " ")}`;
      render();
    } catch (e) {
      $("message").textContent = `Не загрузилось: ${e.message}`;
    }
  }
  start();
})();
