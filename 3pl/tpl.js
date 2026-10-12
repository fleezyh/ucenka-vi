/* 3PL ГСМ — до и после переезда (12.10.2026).

   ТЗ со скрина (Степан: «давай вот эту хуйню собирать»): продажи по дням и неделям, оборачиваемость в днях,
   неликвид (SKU без продаж 60+ дней), паллетоместа, % товара без движения с переезда, приёмка на 3PL
   (переезд с ДМД и поставщики), отгрузка с 3PL по направлениям и рейсам. «До» — бункер ДМД с января,
   «переход» — отдельно, «после» — с 18.09. Сравнение на одном наборе SKU.

   Данные — ../data/3pl/gsm.json (task_3pl.py): по дням колонками, по направлениям, по товарам.
   Уровни (остаток, паллетоместа) за неделю — среднее, потоки (продажи, приёмка, отгрузка) — сумма. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const box = $("tpl");
  const message = $("message");
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
  const count = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const one = (v) => Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  const rub = (v) => { const a = Math.abs(v); return a >= 1e6 ? `${one(v / 1e6)} млн ₽` : a >= 1e3 ? `${Math.round(v / 1e3).toLocaleString("ru-RU")} тыс ₽` : `${count(v)} ₽`; };
  const pct = (v) => `${one(v)}%`;
  const dd = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  const PER_IMYA = { до: "до · бункер ДМД", переход: "переход", после: "после · 3PL" };

  let D = null;
  let R = [];            // дни объектами
  const s = { shag: "неделя", mera: "шт", napr: "", tov: "все", tovSort: "ост3pl_руб", tovOtkryt: "" };

  /** ISO-неделя: ключ 2026-W01, понедельник. */
  function nedelya(iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    const dn = (d.getUTCDay() + 6) % 7;
    const pn = new Date(d); pn.setUTCDate(d.getUTCDate() - dn);
    const ch = new Date(pn); ch.setUTCDate(pn.getUTCDate() + 3);          // четверг недели решает год
    const g = ch.getUTCFullYear();
    const j4 = new Date(Date.UTC(g, 0, 4));
    const pn1 = new Date(j4); pn1.setUTCDate(j4.getUTCDate() - (j4.getUTCDay() + 6) % 7);   // понедельник 1-й недели
    const w = 1 + Math.round((pn - pn1) / (7 * 864e5));
    return { key: `${g}-W${String(w).padStart(2, "0")}`, pn: pn.toISOString().slice(0, 10) };
  }

  function period(iso) {
    for (const [k, [a, b]] of Object.entries(D.периоды)) if (iso >= a && iso <= b) return k;
    return "";
  }

  const UROVNI = ["ост3pl_шт", "ост3pl_руб", "ост3pl_sku", "ост3pl_палл", "бункер_шт", "бункер_руб", "бункер_sku", "бункер_палл",
    "нелик3pl_sku", "нелик3pl_шт", "нелик3pl_руб", "неликбун_sku", "неликбун_шт", "неликбун_руб", "бездв_sku", "бездв_шт", "бездв_руб",
    "хран_sku", "нелик_sku", "нелик_шт", "нелик_руб"];

  /** Ведро дней: потоки — сумма, уровни — среднее, плюс последний день (для долей «на конец»). */
  function vedro(dni) {
    const o = { dney: dni.length, posl: dni[dni.length - 1] };
    for (const k of D.колонки.slice(1)) {
      const sum = dni.reduce((a, r) => a + (r[k] || 0), 0);
      o[k] = UROVNI.includes(k) ? sum / (dni.length || 1) : sum;
    }
    o.ост_шт = o["ост3pl_шт"] + o["бункер_шт"];
    o.ост_руб = o["ост3pl_руб"] + o["бункер_руб"];
    o.палл = o["ост3pl_палл"] + o["бункер_палл"];
    o.вдень = o["все_шт"] / (o.dney || 1);
    o.вдень_мск = o["мск_шт"] / (o.dney || 1);
    o.оборот_мск = o.вдень_мск ? o.ост_шт / o.вдень_мск : null;
    o.оборот = o.вдень ? o.ост_шт / o.вдень : null;
    const p = o.posl || {};
    // SKU, лежащий и в бункере, и на 3PL, — один SKU (хран_sku — объединённый набор на хранении)
    o.нелик_доля = p["хран_sku"] ? 100 * p["нелик_sku"] / p["хран_sku"] : null;
    const sht = (p["ост3pl_шт"] || 0) + (p["бункер_шт"] || 0);
    o.нелик_доля_шт = sht ? 100 * (p["нелик_шт"] || 0) / sht : null;
    o.бездв_доля = p["ост3pl_sku"] ? 100 * p["бездв_sku"] / p["ост3pl_sku"] : null;
    o.бездв_доля_шт = p["ост3pl_шт"] ? 100 * p["бездв_шт"] / p["ост3pl_шт"] : null;
    return o;
  }

  function vedra(dni, vseNedeli = false) {
    if (s.shag === "день") return dni.map((r) => ({ key: r.дата, os: dd(r.дата), zag: `${dd(r.дата)} · ${PER_IMYA[r.пер] || ""}`, per: r.пер, ...vedro([r]) }));
    const m = new Map();
    dni.forEach((r) => { const n = nedelya(r.дата); const v = m.get(n.key) || { key: n.key, pn: n.pn, dni: [] }; v.dni.push(r); m.set(n.key, v); });
    // первая неделя года неполная (01–04.01, праздники) — выброс по оборачиваемости, не показываем
    return [...m.values()].filter((v, i) => vseNedeli || i > 0 || v.dni.length >= 7).map((v) => {
      const pers = [...new Set(v.dni.map((r) => r.пер))];
      return { key: v.key, os: dd(v.pn), zag: `неделя ${v.key.slice(6)} · с ${dd(v.pn)} · ${pers.map((p) => PER_IMYA[p] || p).join(" / ")}`, per: pers.length === 1 ? pers[0] : "переход", ...vedro(v.dni) };
    });
  }

  function grafik(tochki, o = {}) {
    return window.ViGrafik.sozdat({
      // над точкой коротко («167к», «1,2 млн») — под углом длинные подписи налезают на соседей; точно — в подсказке
      tochki, format: o.format || ((v) => (Math.abs(v) >= 1e6 ? `${one(v / 1e6)} млн` : Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}к` : one(v))),
      formatTochno: o.formatTochno || one, edinica: o.edinica || "", otNulya: o.otNulya !== false, trend: 0,
      mediana: false, linii: o.linii || [], legendaLinii: o.legenda || "", vysota: o.vysota || 260, klik: o.klik,
      zony: o.zony || [],
      ugol: true,
    });
  }

  /** Подписанные полосы фона по периодам: «до · бункер ДМД», «переход», «после · 3PL». */
  const ZONA_KLASS = { до: "do", переход: "perehod", после: "posle" };
  const ZONA_PODPIS = { до: "до · бункер ДМД", переход: "переход", после: "после · 3PL" };
  function zonyDlya(V) {
    const out = [];
    V.forEach((v, i) => {
      const z = out[out.length - 1];
      if (z && z.per === v.per) z.po = i;
      else if (v.per) out.push({ per: v.per, s: i, po: i, podpis: ZONA_PODPIS[v.per], klass: ZONA_KLASS[v.per] });
    });
    return out;
  }

  function block(title, lead, ...body) {
    const sec = document.createElement("section");
    sec.className = "perfBlock";
    sec.innerHTML = `<div class="perfHead"><div><h2>${title}</h2>${lead ? `<p class="perfLead">${lead}</p>` : ""}</div></div>`;
    body.forEach((b) => b && sec.appendChild(b));
    return sec;
  }

  function polosa(imya, val, maks, note, cls = "", data = "", fmt = one) {
    return `<button type="button" class="contourRow ${cls}" ${data}><span class="contourRow__name">${esc(imya)}</span>`
      + `<span class="contourRow__track"><i style="width:${(100 * val / Math.max(maks, 1e-9)).toFixed(1)}%"></i></span>`
      + `<b class="contourRow__value">${fmt(val)}</b><span class="contourRow__note">${note}</span></button>`;
  }

  /** Карточка «после против до»: крупно — после, ниже — до и разница; переход — мелко. */
  function kartochka(title, k, P, fmt, cls, vverhHorosho, note = "", yakor = "") {
    const a = P.до[k], b = P.после[k], c = P.переход[k];
    const dl = a && b != null ? (b - a) / Math.abs(a) * 100 : null;
    const horosho = dl === null ? "" : (dl >= 0) === vverhHorosho ? "isUp" : "isDown";
    return `<a class="perfCard tplCard ${cls}" href="#${yakor}"><p class="perfCard__title">${title}</p>`
      + `<b class="perfCard__value">${b == null ? "—" : fmt(b)}</b>`
      + `<span class="perfCard__delta ${horosho}">${dl === null ? "нет сравнения" : `${dl > 0 ? "+" : ""}${one(dl)}% к «до»`}</span>`
      + `<span class="perfCard__note">до: ${a == null ? "—" : fmt(a)} · переход: ${c == null ? "—" : fmt(c)}${note ? ` · ${note}` : ""}</span></a>`;
  }

  function render() {
    const parts = [];
    const dni = R.filter((r) => r.пер);
    const P = {};
    for (const k of Object.keys(D.периоды)) P[k] = vedro(dni.filter((r) => r.пер === k));
    for (const k of Object.keys(P)) {
      const p = P[k];
      p.руб_вдень = p["все_руб"] / (p.dney || 1);
      p.зак_вдень = p["все_заказов"] / (p.dney || 1);
      p.доля3pl = p["все_шт"] ? 100 * p["3pl_шт"] / p["все_шт"] : null;
      p.доля3pl_мск = p["мск_шт"] ? 100 * p["3pl_мск_шт"] / p["мск_шт"] : null;
    }
    const [pa, pb] = D.периоды.после;

    // управление
    const bar = document.createElement("div");
    bar.className = "perfPeriod";
    const pereklyuch = (opts, val, on) => {
      const w = document.createElement("span");
      w.className = "stepSwitch";
      w.innerHTML = opts.map(([k, t]) => `<button type="button" class="stepSwitch__item${k === val ? " is-on" : ""}" data-k="${esc(k)}">${esc(t)}</button>`).join("");
      w.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) on(b.dataset.k); });
      return w;
    };
    bar.append(pereklyuch([["день", "по дням"], ["неделя", "по неделям"]], s.shag, (v) => { s.shag = v; render(); }),
      pereklyuch([["шт", "штуки"], ["руб", "выручка"], ["заказов", "заказы"]], s.mera, (v) => { s.mera = v; render(); }));
    const xl = document.createElement("button");
    xl.type = "button"; xl.className = "action"; xl.textContent = "Excel — всё";
    xl.addEventListener("click", () => vygruzka(P));
    bar.appendChild(xl);
    parts.push(bar);

    // карточки
    const top = document.createElement("div");
    top.className = "perfTop";
    top.innerHTML = kartochka("Продаж в день, шт", "вдень", P, count, "perfCard--glav", true, "вся компания", "prodazhi")
      + kartochka("Выручка в день", "руб_вдень", P, rub, "perfCard--sin", true, "без НДС", "prodazhi")
      + kartochka("Заказов в день", "зак_вдень", P, count, "perfCard--sin", true, "", "prodazhi")
      + kartochka("Оборачиваемость, дней", "оборот", P, one, "perfCard--zhel", false, "остаток / продажи в день", "ostatok")
      + kartochka("Неликвид, % SKU", "нелик_доля", P, pct, "perfCard--fiol", false, `без продаж ${D.неликвид_дней}+ дн, на конец`, "nelikvid")
      + kartochka("Паллетомест", "палл", P, count, "perfCard--zhel", false, "оценка по габаритам", "ostatok")
      + `<a class="perfCard tplCard perfCard--fiol" href="#nelikvid"><p class="perfCard__title">Без движения с переезда</p>`
      + `<b class="perfCard__value">${P.после.бездв_доля == null ? "—" : pct(P.после.бездв_доля)}</b>`
      + `<span class="perfCard__delta">SKU на 3PL, ни одной отгрузки с 3PL</span>`
      + `<span class="perfCard__note">${count(P.после.posl ? P.после.posl["бездв_sku"] : 0)} из ${count(P.после.posl ? P.после.posl["ост3pl_sku"] : 0)} SKU · ${P.после.бездв_доля_шт == null ? "" : pct(P.после.бездв_доля_шт) + " штук"}</span></a>`
      + `<a class="perfCard tplCard perfCard--glav" href="#prodazhi"><p class="perfCard__title">Через 3PL</p>`
      + `<b class="perfCard__value">${P.после.доля3pl == null ? "—" : pct(P.после.доля3pl)}</b>`
      + `<span class="perfCard__delta">продаж набора «после» — заказ шёл через 3PL</span>`
      + `<span class="perfCard__note">в Москве ${P.после.доля3pl_мск == null ? "—" : pct(P.после.доля3pl_мск)} · остальное — с региональных остатков и остатка ДМД</span></a>`;
    parts.push(top);
    const sravn = document.createElement("p");
    sravn.className = "perfLead tplPeriody";
    sravn.innerHTML = Object.entries(D.периоды).map(([k, [a, b]]) => `<b>${PER_IMYA[k]}</b> ${dd(a)}–${dd(b)} (${P[k].dney} дн)`).join(" · ")
      + ` · набор: ${count(D.товаров)} SKU`;
    parts.push(sravn);

    const V = vedra(dni);
    const Z = zonyDlya(V);
    const tochkaDop = (v) => [`вся компания: ${count(v["все_шт"])} шт · ${rub(v["все_руб"])} · ${count(v["все_заказов"])} заказов`,
      `Москва ${count(v["мск_шт"])} шт · ${rub(v["мск_руб"])} · регионы ${count(v["рег_шт"])} шт · ${rub(v["рег_руб"])}`,
      `через 3PL: ${count(v["3pl_шт"])} шт (Москва ${count(v["3pl_мск_шт"])}, регионы ${count(v["3pl_рег_шт"])}) · ${count(v["3pl_заказов"])} заказов`];

    // продажи
    const mk = { шт: ["все_шт", "3pl_шт", "шт", "мск_шт"], руб: ["все_руб", "3pl_руб", "₽", "мск_руб"], заказов: ["все_заказов", "3pl_заказов", "заказов", "мск_заказов"] }[s.mera];
    const gP = grafik(V.map((v) => ({ znach: v[mk[0]], os: v.os, zag: v.zag, dop: tochkaDop(v) })), {
      edinica: mk[2], legenda: "продажи набора — вся компания", zony: Z,
      linii: [{ znach: V.map((v) => (v.posl.дата < "2026-08-17" ? null : v[mk[1]] || null)), klass: "tpl", podpis: "из них уехало с 3PL" }],
    });
    gP.id = "prodazhi";
    // доля через 3PL — отдельно: на общем графике оранжевая линия теряется внизу
    const gD = grafik(V.map((v) => ({ znach: v.posl.дата < "2026-08-17" || !v["все_шт"] ? null : Math.round(1000 * v["3pl_шт"] / v["все_шт"]) / 10,
      os: v.os, zag: v.zag, dop: [`через 3PL ${count(v["3pl_шт"])} из ${count(v["все_шт"])} шт`,
        `в Москве через 3PL ${v["мск_шт"] ? pct(100 * v["3pl_мск_шт"] / v["мск_шт"]) : "—"} (${count(v["3pl_мск_шт"])} из ${count(v["мск_шт"])} шт)`] })), {
      edinica: "%", format: (x) => `${one(x)}%`, legenda: "доля продаж набора, заказ которых уехал с 3PL", zony: Z, vysota: 200,
      linii: [{ znach: V.map((v) => (v.posl.дата < "2026-08-17" || !v["мск_шт"] ? null : Math.round(1000 * v["3pl_мск_шт"] / v["мск_шт"]) / 10)), klass: "msk", podpis: "то же в Москве" }],
    });
    parts.push(block("Продажи набора", `Синее — все продажи этих SKU по компании, оранжевое — та их часть, заказ по которой собран и уехал с 3PL (3PL возит и в регионы) · ниже — эта часть в процентах · ${s.shag === "день" ? "по дням" : "по неделям, сумма"} · реализация минус возвраты, выручка без НДС`, gP, gD));

    // остаток и оборачиваемость
    const gO = grafik(V.map((v) => ({ znach: Math.round(v.ост_шт), os: v.os, zag: v.zag,
      dop: [`бункер ДМД ${count(v["бункер_шт"])} шт · ${rub(v["бункер_руб"])} · ${count(v["бункер_sku"])} SKU`,
        `3PL ${count(v["ост3pl_шт"])} шт · ${rub(v["ост3pl_руб"])} · ${count(v["ост3pl_sku"])} SKU`,
        `паллетомест ≈ ${count(v.палл)} (бункер ${count(v["бункер_палл"])}, 3PL ${count(v["ост3pl_палл"])})`] })), {
      edinica: "шт", legenda: "всего на хранении", otNulya: true, zony: Z,
      linii: [{ znach: V.map((v) => v["бункер_шт"] || null), klass: "bun", podpis: "в бункере ДМД" },
        { znach: V.map((v) => v["ост3pl_шт"] || null), klass: "tpl", podpis: "на 3PL" }],
    });
    gO.id = "ostatok";
    const gT = grafik(V.map((v) => ({ znach: v.оборот == null ? null : Math.round(v.оборот), os: v.os, zag: v.zag,
      dop: [`средний остаток ${count(v.ост_шт)} шт`, `продаж в день ${count(v.вдень)} шт (вся компания)`,
        `по продажам одной Москвы — ${v.оборот_мск == null ? "—" : count(v.оборот_мск)} дней`] })), { edinica: "дней", legenda: "дней запаса", zony: Z, vysota: 200 });
    parts.push(block("Остаток набора и оборачиваемость", `Пунктир — бункер ДМД, оранжевое — 3PL, синее — всё вместе: в конце июля товар ушёл из бункера, на 3PL в ВМС появился 18.08 и 14.09, между ними был в дороге и на отгрузке ДМД · ниже — сколько дней продаж лежит на хранении · остаток — дневной снимок, за неделю среднее · оборачиваемость = средний остаток / средние продажи набора в день по всей компании · паллетоместа — оценка: штуки × габарит из ВТИС / ${one(D.паллета_м3)} м³ на паллету (у 3PL в ВМС одна ячейка на весь склад)`, gO, gT));

    // неликвид и без движения
    const gN = grafik(V.map((v) => ({ znach: v.нелик_доля == null ? null : Math.round(v.нелик_доля * 10) / 10, os: v.os, zag: v.zag,
      dop: [`${count(v.posl["нелик_sku"])} SKU без продаж ${D.неликвид_дней}+ дн из ${count(v.posl["хран_sku"])} на хранении`,
        `в штуках ${v.нелик_доля_шт == null ? "—" : pct(v.нелик_доля_шт)} · ${rub(v.posl["нелик_руб"] || 0)}`,
        v.бездв_доля == null ? "" : `на 3PL без отгрузки с переезда: ${count(v.posl["бездв_sku"])} SKU, ${pct(v.бездв_доля_шт)} штук`].filter(Boolean) })), {
      edinica: "%", format: (x) => `${one(x)}%`, legenda: "неликвид, % SKU на хранении (бункер + 3PL)", zony: Z,
      linii: [{ znach: V.map((v) => (v.бездв_доля == null ? null : Math.round(v.бездв_доля * 10) / 10)), klass: "tpl", podpis: "без движения с переезда, % SKU 3PL" }],
    });
    gN.id = "nelikvid";
    parts.push(block("Неликвид и товар без движения", `На последний день ${s.shag === "день" ? "" : "недели "}· неликвид — SKU с остатком, который ${D.неликвид_дней}+ дней нигде не продавался · без движения — SKU на 3PL, по которому с приезда на 3PL не было ни одной отгрузки`, gN));

    // отгрузка с 3PL
    const nap = new Map();
    D.направления.filter((r) => r[0] >= pa && r[0] <= pb).forEach((r) => { const v = nap.get(r[1]) || { sht: 0, pall: 0, zak: 0 }; v.sht += r[2]; v.pall += r[3]; v.zak += r[4]; nap.set(r[1], v); });
    const napSp = [...nap.entries()].sort((a, b) => b[1].sht - a[1].sht);
    const vsegoN = napSp.reduce((a, [, v]) => a + v.sht, 0) || 1;
    const napBox = document.createElement("div");
    napBox.className = "polosy";
    napBox.innerHTML = `<button type="button" class="contourRow${s.napr ? "" : " is-on"}" data-napr=""><span class="contourRow__name">все направления</span><span class="contourRow__track"><i style="width:100%"></i></span><b class="contourRow__value">${count(vsegoN)}</b><span class="contourRow__note">шт «после»</span></button>`
      + napSp.map(([k, v]) => polosa(k, v.sht, napSp[0][1].sht, `${pct(100 * v.sht / vsegoN)} · ${count(v.pall)} паллет · ${count(v.zak)} заказов`, s.napr === k ? "is-on" : "", `data-napr="${esc(k)}"`, count)).join("");
    napBox.addEventListener("click", (e) => { const b = e.target.closest("[data-napr]"); if (b) { s.napr = b.dataset.napr; render(); } });
    const otgr = dni.filter((r) => r.дата >= "2026-08-17");
    const poNapr = new Map();
    if (s.napr) D.направления.filter((r) => r[1] === s.napr).forEach((r) => { const v = poNapr.get(r[0]) || [0, 0, 0]; v[0] += r[2]; v[1] += r[3]; v[2] += r[4]; poNapr.set(r[0], v); });
    const otgrDni = otgr.map((r) => (s.napr ? { ...r, "выход_шт": (poNapr.get(r.дата) || [0])[0], "выход_палл": (poNapr.get(r.дата) || [0, 0])[1], "выход_заказов": (poNapr.get(r.дата) || [0, 0, 0])[2] } : r));
    const VO = vedra(otgrDni);
    const gV = grafik(VO.map((v) => ({ znach: v["выход_шт"], os: v.os, zag: v.zag,
      dop: [`${count(v["выход_палл"])} паллет · ${count(v["выход_заказов"])} заказов`,
        `рейсов на ДМД ${count(v["рейсов"])} · ${one(v["рейсы_м3"])} м³ · ${count(v["рейсы_кг"])} кг`] })), {
      edinica: "шт", legenda: s.napr ? `отгружено · ${s.napr}` : "отгружено с 3PL", zony: zonyDlya(VO),
    });
    gV.id = "otgruzka";
    const gR = grafik(VO.map((v) => ({ znach: v["рейсов"], os: v.os, zag: v.zag,
      dop: [`${one(v["рейсы_м3"])} м³ · ${count(v["рейсы_кг"])} кг`, v["рейсов"] ? `в среднем ${one(v["рейсы_м3"] / v["рейсов"])} м³ на машину` : ""].filter(Boolean) })), {
      edinica: "рейсов", format: count, formatTochno: count, legenda: "рейсов с 3PL на ДМД (все направления)", vysota: 200, zony: zonyDlya(VO),
    });
    parts.push(block("Отгрузка с 3PL", `Внутренняя отгрузка с 3PL на ДМД под заказы, с 17.08 · направление — ячейка отгрузки 3PL · паллеты — контейнеры, в которых уехало · рейс — пачка заданий приёмки на ДМД в пределах получаса · клик по направлению — график штук только по нему`, napBox, gV, gR));

    // приёмка на 3PL
    const vh = R.filter((r) => r["вход_переезд_шт"] || r["вход_пост_шт"]);
    const vhBox = document.createElement("div");
    vhBox.className = "polosy";
    const maksV = Math.max(1, ...vh.map((r) => r["вход_переезд_шт"] + r["вход_пост_шт"]));
    vhBox.innerHTML = vh.map((r) => {
      const pe = r["вход_переезд_шт"], po = r["вход_пост_шт"];
      const chto = pe ? "переезд с ДМД" : "поставщик";
      const note = pe ? `${count(r["вход_переезд_sku"])} SKU · паллет в ВМС нет — одним контейнером`
        : `${count(r["вход_пост_sku"])} SKU · ${count(r["вход_пост_палл"])} паллет · ${count(r["вход_поставок"])} поставок`;
      return polosa(`${dd(r.дата)} · ${chto}`, pe + po, maksV, note, "", "", count);
    }).join("");
    const itPe = R.reduce((a, r) => a + r["вход_переезд_шт"], 0), itPo = R.reduce((a, r) => a + r["вход_пост_шт"], 0);
    parts.push(block("Приёмка на 3PL", `Два потока: переезд с Домодедово (поступление по переезду) — ${count(itPe)} шт; поставщики напрямую с 18.09 — ${count(itPo)} шт`, vhBox));

    // товары
    parts.push(tovary());

    box.replaceChildren(...parts);
    $("stamp").textContent = `обновлено ${D.обновлено} · данные по ${dd(D.по)}`;
    $("primechanie").textContent = `Набор — ${D.товаров} SKU: всё, что пришло на 3PL переездом и от поставщиков, и что лежит там сейчас; модели учёта ГСМ, ЛВЖ, аэрозоли, жидкости. `
      + "Бункер ДМД — блоки (Г) и (Д) Домодедово; остатки набора в регионах (СПБ, КРД, Казань) не считаются. "
      + "Продажи — витрина продаж ВТИС по точке продажи, «Москва» — точки «МСК - …»; «через 3PL» — номер заказа есть во внутренней отгрузке с 3PL. "
      + `Габариты есть у ${D.товаров_с_габаритами} из ${D.товаров} SKU. Остаток — снимок на конец дня, обновляется утром за вчера.`;
    message.textContent = "";
  }

  const TOV_KOL = [["товар", "товар"], ["модель", "модель"], ["ост3pl_шт", "на 3PL, шт"], ["ост3pl_руб", "на 3PL, ₽"], ["бункер_шт", "в бункере, шт"],
    ["на3pl_с", "на 3PL с"], ["посл_продажа", "посл. продажа"], ["дней_без_продаж", "дней без продаж"], ["продано_до_шт", "продано до"],
    ["продано_после_шт", "продано после"], ["уехало_с3pl_шт", "уехало с 3PL"]];

  function tovary() {
    const sp = D.товары.filter((t) => (s.tov === "неликвид" ? t.неликвид : s.tov === "без_движения" ? t.без_движения : s.tov === "на3pl" ? t["ост3pl_шт"] > 0 : true));
    const k = s.tovSort;
    sp.sort((a, b) => (typeof a[k] === "string" || typeof b[k] === "string" ? String(b[k] || "").localeCompare(String(a[k] || "")) : (b[k] ?? -1) - (a[k] ?? -1)));
    const n = (f) => D.товары.filter(f).length;
    const wrap = document.createElement("div");
    const filtr = document.createElement("span");
    filtr.className = "stepSwitch";
    filtr.innerHTML = [["все", `все · ${n(() => true)}`], ["на3pl", `на 3PL · ${n((t) => t["ост3pl_шт"] > 0)}`],
      ["неликвид", `неликвид · ${n((t) => t.неликвид)}`], ["без_движения", `без движения · ${n((t) => t.без_движения)}`]]
      .map(([kk, t]) => `<button type="button" class="stepSwitch__item${kk === s.tov ? " is-on" : ""}" data-tov="${kk}">${t}</button>`).join("");
    filtr.addEventListener("click", (e) => { const b = e.target.closest("[data-tov]"); if (b) { s.tov = b.dataset.tov; render(); } });
    const fmt = (kk, v) => (v == null || v === "" ? "—" : kk.endsWith("_руб") ? rub(v) : /_шт$|дней/.test(kk) ? count(v) : /^(на3pl_с|посл_продажа)$/.test(kk) ? dd(v) : esc(v));
    const tab = document.createElement("div");
    tab.className = "tplTablica";
    tab.innerHTML = `<table><thead><tr>${TOV_KOL.map(([kk, t]) => `<th data-sort="${kk}"${kk === k ? ' class="is-on"' : ""}>${t}</th>`).join("")}</tr></thead><tbody>`
      + sp.slice(0, 300).map((t) => {
        const id = String(t.кодсайта);
        const flag = t.неликвид ? '<i class="tplFlag tplFlag--nel">неликвид</i>' : t.без_движения ? '<i class="tplFlag">без движения</i>' : "";
        let tr = `<tr data-tovar="${esc(id)}"${s.tovOtkryt === id ? ' class="is-on"' : ""}>${TOV_KOL.map(([kk]) => `<td>${kk === "товар" ? `${esc(t.товар)} ${flag}` : fmt(kk, t[kk])}</td>`).join("")}</tr>`;
        if (s.tovOtkryt === id) {
          tr += `<tr class="tplTablica__razvorot"><td colspan="${TOV_KOL.length}">код сайта ${esc(id)} · на 3PL ${count(t["ост3pl_шт"])} шт на ${rub(t["ост3pl_руб"])}`
            + ` · в бункере ДМД ${count(t["бункер_шт"])} шт на ${rub(t["бункер_руб"])} · на 3PL с ${t.на3pl_с ? dd(t.на3pl_с) : "—"}`
            + ` · последняя продажа ${t.посл_продажа ? dd(t.посл_продажа) : "не было с ноября"} · дней с продажей за последние 30: ${t.дней_с_продажей_30}`
            + ` · продано «до» ${count(t.продано_до_шт)} шт, «после» ${count(t.продано_после_шт)} шт · уехало с 3PL ${count(t["уехало_с3pl_шт"])} шт`
            + ` · объём штуки ${t["объём_м3"] ? one(t["объём_м3"] * 1000) + " л" : "нет габаритов"}`
            + ` · <a href="https://www.vseinstrumenti.ru/search/?what=${encodeURIComponent(id)}" target="_blank" rel="noopener">на сайте</a></td></tr>`;
        }
        return tr;
      }).join("") + "</tbody></table>"
      + (sp.length > 300 ? `<p class="perfLead">показаны первые 300 из ${count(sp.length)} — все в Excel</p>` : "");
    tab.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const th = e.target.closest("[data-sort]");
      if (th) { s.tovSort = th.dataset.sort; render(); return; }
      const tr = e.target.closest("[data-tovar]");
      if (tr) { s.tovOtkryt = s.tovOtkryt === tr.dataset.tovar ? "" : tr.dataset.tovar; render(); }
    });
    wrap.append(filtr, tab);
    const sec = block("Товары набора", "Сейчас: где лежит, когда приехал на 3PL, когда последний раз продавался · клик по строке — подробности, по заголовку — сортировка", wrap);
    sec.id = "tovary";
    return sec;
  }

  function vygruzka(P) {
    const listy = [];
    const pk = [["показатель", "до", "переход", "после"],
      ...[["дней", "dney"], ["продаж в день, шт (вся компания)", "вдень"], ["продаж в день, шт (Москва)", "вдень_мск"], ["выручка в день, ₽ без НДС", "руб_вдень"], ["заказов в день", "зак_вдень"],
        ["средний остаток, шт (бункер + 3PL)", "ост_шт"], ["средний остаток, ₽", "ост_руб"], ["оборачиваемость, дней", "оборот"], ["оборачиваемость по продажам Москвы, дней", "оборот_мск"],
        ["паллетомест (оценка)", "палл"], ["неликвид на конец, % SKU", "нелик_доля"], ["неликвид на конец, % шт", "нелик_доля_шт"],
        ["без движения с переезда на конец, % SKU 3PL", "бездв_доля"], ["через 3PL, % продаж", "доля3pl"], ["через 3PL, % московских продаж", "доля3pl_мск"]]
        .map(([t, k]) => [t, ...["до", "переход", "после"].map((p) => (P[p][k] == null ? "" : Number(Number(P[p][k]).toFixed(2))))])];
    listy.push({ imya: "Сравнение", rows: pk });
    listy.push({ imya: "По дням", rows: [["период", ...D.колонки], ...R.map((r) => [r.пер, ...D.колонки.map((k) => r[k])])] });
    const sh = s.shag; s.shag = "неделя";
    const V = vedra(R.filter((r) => r.пер), true);   // в Excel — все недели, и неполная первая
    s.shag = sh;
    listy.push({ imya: "По неделям", rows: [["неделя", "понедельник", "период", "продажи, шт", "выручка, ₽", "заказов", "Москва, шт", "через 3PL, шт",
      "остаток бункер, шт (ср.)", "остаток 3PL, шт (ср.)", "оборачиваемость, дней", "паллетомест (ср.)", "неликвид, % SKU", "без движения, % SKU 3PL",
      "приёмка переезд, шт", "приёмка поставщики, шт", "отгружено с 3PL, шт", "паллет отгружено", "рейсов"],
    ...V.map((v) => [v.key, v.os, v.per, Math.round(v["все_шт"]), Math.round(v["все_руб"]), v["все_заказов"], Math.round(v["мск_шт"]), Math.round(v["3pl_шт"]),
      Math.round(v["бункер_шт"]), Math.round(v["ост3pl_шт"]), v.оборот == null ? "" : Math.round(v.оборот), Math.round(v.палл),
      v.нелик_доля == null ? "" : Number(v.нелик_доля.toFixed(1)), v.бездв_доля == null ? "" : Number(v.бездв_доля.toFixed(1)),
      v["вход_переезд_шт"], v["вход_пост_шт"], v["выход_шт"], v["выход_палл"], v["рейсов"]])] });
    listy.push({ imya: "Отгрузка по направлениям", rows: [D.направления_колонки, ...D.направления] });
    listy.push({ imya: "Товары", rows: [["код сайта", "товар", "модель учёта", "на 3PL, шт", "на 3PL, ₽", "в бункере, шт", "в бункере, ₽", "на 3PL с",
      "последняя продажа", "дней без продаж", "дней с продажей за 30", "продано до, шт", "продано после, шт", "уехало с 3PL, шт", "неликвид", "без движения", "объём штуки, м³"],
    ...D.товары.map((t) => [t.кодсайта, t.товар, t.модель, t["ост3pl_шт"], t["ост3pl_руб"], t["бункер_шт"], t["бункер_руб"], t.на3pl_с || "",
      t.посл_продажа || "", t.дней_без_продаж ?? "", t.дней_с_продажей_30, t.продано_до_шт, t.продано_после_шт, t["уехало_с3pl_шт"],
      t.неликвид ? "да" : "", t.без_движения ? "да" : "", t["объём_м3"]])] });
    window.saveXlsxKniga(listy, `3PL ГСМ до и после переезда ${D.по}`);
  }

  fetch("../data/3pl/gsm.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(`сервер вернул ${r.status}`); return r.json(); })
    .then((d) => {
      D = d;
      R = d.дни.map((row) => { const o = {}; d.колонки.forEach((k, i) => { o[k] = row[i]; }); o.пер = ""; return o; });
      R.forEach((r) => { r.пер = period(r.дата); });
      render();
    })
    .catch((e) => { message.textContent = `Не удалось загрузить данные: ${e.message || e}`; });
})();
