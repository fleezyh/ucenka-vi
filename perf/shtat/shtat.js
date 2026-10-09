/* Производительность штата — все действия в WMS (09.10.2026).

   Степан: «паноптикум два — разбивка производительности, основанная на всех действиях ВМС, которая даёт
   понимание исключительно о трудоустроенных сотрудниках; второй блок в производе, куда можно попасть и
   посмотреть, что и кто делает». Старый «Паноптикум два» снят.

   Данные — ../../data/perf_shtat.json (task_perf.py → shtat()): люди из выгрузки HR, их проведённые
   перемещения в WMS по дням и по «тип · зона откуда». Мера — действий (строк документов) за смену;
   смена — день человека с 10 и больше действиями. Стиль и фильтр — как на «Производительности». */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const box = $("shtat");
  const message = $("message");
  const stamp = $("stamp");
  const MES = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  const MIN_SMENA = 10;
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
  const count = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const one = (v) => Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  const dayLabel = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  const mesLabel = (m) => `${MES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
  const plural = (n, w) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? w[2] : b === 1 ? w[0] : b >= 2 && b <= 4 ? w[1] : w[2]; };
  const smen = (n) => plural(n, ["смена", "смены", "смен"]);
  const chel = (n) => plural(n, ["человек", "человека", "человек"]);

  let D = null;
  const s = { period: "", sravn: "", otdel: "", otkryt: "", chelovek: "" };

  function periody() {
    const m = [...new Set(D.люди.flatMap((p) => p.дни.map((d) => d[0].slice(0, 7))))].sort().reverse();
    return [{ key: "все", label: `все ${m.length} мес. (${dayLabel(D.с)}–${dayLabel(D.по)})`, months: m }, ...m.map((x) => ({ key: x, label: mesLabel(x), months: [x] }))];
  }

  /** Человек за месяцы: смены (дни ≥ 10 действий), действия, штуки, по дням, по «тип · зона». */
  function za(p, months) {
    const mes = new Set(months);
    const dni = p.дни.filter((d) => mes.has(d[0].slice(0, 7)));
    const smeny = dni.filter((d) => d[1] >= MIN_SMENA);
    const deystv = smeny.reduce((a, d) => a + d[1], 0);
    const op = p.оп.filter((o) => mes.has(o[0]));
    return { dni, smen: smeny.length, deystv, shtuk: smeny.reduce((a, d) => a + d[2], 0), na: smeny.length ? deystv / smeny.length : 0, op };
  }

  function polosa(imya, val, maks, note, cls = "", data = "") {
    return `<button type="button" class="contourRow ${cls}" ${data}><span class="contourRow__name">${esc(imya)}</span>`
      + `<span class="contourRow__track"><i style="width:${(100 * val / Math.max(maks, 1)).toFixed(1)}%"></i></span>`
      + `<b class="contourRow__value">${one(val)}</b><span class="contourRow__note">${note}</span></button>`;
  }

  function grafik(tochki, edinica) {
    return window.ViGrafik.sozdat({
      tochki: tochki.map((t) => ({ znach: t.z, os: t.os, zag: t.zag, dop: t.dop || [] })),
      format: one, formatTochno: one, edinica, mediana: true, osVse: tochki.length <= 31,
      legendaLinii: edinica, vysota: 220,
    });
  }

  function block(title, lead, body) {
    const sec = document.createElement("section");
    sec.className = "perfBlock";
    sec.innerHTML = `<div class="perfHead"><div><h2>${title}</h2>${lead ? `<p class="perfLead">${lead}</p>` : ""}</div></div>`;
    sec.appendChild(body);
    return sec;
  }

  const tipZona = (t, z) => `${D.типы[String(t)] || "тип " + t} · ${D.зоны[String(z)] || (z ? "зона " + z : "без зоны")}`;

  function render() {
    const P = periody();
    if (!P.some((x) => x.key === s.period)) s.period = P.length > 2 ? P[2].key : P[0].key;   // последний закрытый месяц
    const cur = P.find((x) => x.key === s.period);
    const sravnP = s.sravn === "нет" ? null : P.find((x) => x.key === s.sravn && x.key !== cur.key)
      || (cur.key === "все" ? null : P[P.findIndex((x) => x.key === cur.key) + 1] || null);
    const otdely = [...new Set(D.люди.map((p) => p.отдел))].sort();
    const lyudi = D.люди.filter((p) => !s.otdel || p.отдел === s.otdel);
    const zz = lyudi.map((p) => ({ p, z: za(p, cur.months), b: sravnP ? za(p, sravnP.months) : null })).filter((x) => x.z.smen);
    const parts = [];

    // фильтры — одна строка, как на «Производительности»
    const bar = document.createElement("div");
    bar.className = "perfPeriod";
    const sel = (opts, val, on) => {
      const el = document.createElement("select");
      el.className = "perfSelect";
      el.innerHTML = opts.map(([k, t]) => `<option value="${esc(k)}"${k === val ? " selected" : ""}>${esc(t)}</option>`).join("");
      el.addEventListener("change", () => on(el.value));
      return el;
    };
    const lbl = (t, el) => { const l = document.createElement("label"); l.className = "perfFiltr"; l.append(t, el); return l; };
    bar.append(
      lbl("период", sel(P.map((x) => [x.key, x.label]), cur.key, (v) => { s.period = v; s.sravn = ""; render(); })),
      lbl("сравнить с", sel([["нет", "не сравнивать"], ...P.filter((x) => x.key !== cur.key && x.key !== "все").map((x) => [x.key, x.label])],
        sravnP ? sravnP.key : "нет", (v) => { s.sravn = v; render(); })),
      lbl("отдел", sel([["", "все отделы"], ...otdely.map((o) => [o, o])], s.otdel, (v) => { s.otdel = v; s.otkryt = ""; s.chelovek = ""; render(); })),
    );
    const xl = document.createElement("button");
    xl.type = "button"; xl.className = "action"; xl.textContent = "Excel — все графики";
    xl.addEventListener("click", () => vygruzka(cur, sravnP, zz));
    bar.appendChild(xl);
    parts.push(bar);

    // карточки
    const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
    const itog = (k) => { const sm = sum(zz, (x) => x[k] ? x[k].smen : 0); const d = sum(zz, (x) => x[k] ? x[k].deystv : 0); return { sm, d, na: sm ? d / sm : 0, sh: sum(zz, (x) => x[k] ? x[k].shtuk : 0), lyud: zz.filter((x) => x[k] && x[k].smen).length }; };
    const t = itog("z"), b = sravnP ? itog("b") : null;
    const dl = b && b.na ? (t.na - b.na) / b.na * 100 : null;
    const top = document.createElement("div");
    top.className = "perfTop";
    const vShtate = lyudi.length ? new Set(lyudi.map((p) => p.логин)).size : 0;
    top.innerHTML = `<article class="perfCard perfCard--glav"><p class="perfCard__title">Действий за смену</p><b class="perfCard__value">${one(t.na)}</b>`
      + `<span class="perfCard__delta ${dl === null ? "" : dl < 0 ? "isDown" : "isUp"}">${dl === null ? "без сравнения" : `${dl > 0 ? "+" : ""}${one(dl)}% к периоду «${esc(sravnP.label)}»`}</span></article>`
      + `<article class="perfCard perfCard--sin"><p class="perfCard__title">Действий в WMS</p><b class="perfCard__value">${count(t.d)}</b><span class="perfCard__note">строк проведённых перемещений</span></article>`
      + `<article class="perfCard perfCard--zhel"><p class="perfCard__title">Смен</p><b class="perfCard__value">${count(t.sm)}</b><span class="perfCard__note">дней от ${MIN_SMENA} действий</span></article>`
      + `<article class="perfCard perfCard--fiol"><p class="perfCard__title">Человек из штата</p><b class="perfCard__value">${t.lyud}</b><span class="perfCard__note">работали в WMS · всего с действиями ${vShtate}</span></article>`;
    parts.push(top);

    // динамика по дням: действий за смену, все люди фильтра
    const poDnyam = new Map();
    zz.forEach((x) => x.z.dni.forEach((d) => { if (d[1] < MIN_SMENA) return; const v = poDnyam.get(d[0]) || [0, 0]; v[0] += d[1]; v[1] += 1; poDnyam.set(d[0], v); }));
    const dniT = [...poDnyam.entries()].sort().map(([d, v]) => ({ z: v[0] / v[1], os: dayLabel(d), zag: dayLabel(d), dop: [`${count(v[0])} действий · ${v[1]} ${chel(v[1])}`] }));
    if (dniT.length) parts.push(block("Динамика", `${esc(cur.label)} · действий за смену по дням`, grafik(dniT, "действий за смену")));

    // подразделения → люди → что делают
    const podr = new Map();
    zz.forEach((x) => { const k = x.p.подразделение; const v = podr.get(k) || { k, otdel: x.p.отдел, sm: 0, d: 0, lyudi: [] }; v.sm += x.z.smen; v.d += x.z.deystv; v.lyudi.push(x); podr.set(k, v); });
    const podrSp = [...podr.values()].map((v) => ({ ...v, na: v.sm ? v.d / v.sm : 0 })).sort((a, b2) => b2.d - a.d);
    const maksP = Math.max(1, ...podrSp.map((v) => v.na));
    const spisok = document.createElement("div");
    spisok.className = "polosy";
    podrSp.forEach((v) => {
      const otkryt = s.otkryt === v.k;
      spisok.insertAdjacentHTML("beforeend", polosa(v.k, v.na, maksP,
        `${v.lyudi.length} из ${D.штат[v.k] || v.lyudi.length} в штате · ${count(v.d)} действий · ${esc(v.otdel)}`, otkryt ? "is-on" : "", `data-podr="${esc(v.k)}"`));
      if (!otkryt) return;
      const lp = v.lyudi.sort((a, b2) => b2.z.na - a.z.na);
      const maksL = Math.max(1, ...lp.map((x) => x.z.na));
      const vnutri = document.createElement("div");
      vnutri.className = "polosy polosy--vnutri";
      lp.forEach((x) => {
        const d2 = x.b && x.b.na ? (x.z.na - x.b.na) / x.b.na * 100 : null;
        vnutri.insertAdjacentHTML("beforeend", polosa(x.p.фио, x.z.na, maksL,
          `${x.z.smen} ${smen(x.z.smen)} · ${count(x.z.deystv)} действий${d2 === null ? "" : ` · <i class="${d2 < 0 ? "isDown" : "isUp"}">${d2 > 0 ? "+" : ""}${Math.round(d2)}%</i>`} · ${esc(x.p.должность)}`,
          s.chelovek === x.p.логин ? "is-on" : "", `data-chel="${esc(x.p.логин)}"`));
        if (s.chelovek === x.p.логин) vnutri.appendChild(kartochka(x, cur));
      });
      spisok.appendChild(vnutri);
    });
    spisok.addEventListener("click", (e) => {
      const c = e.target.closest("[data-chel]");
      if (c) { s.chelovek = s.chelovek === c.dataset.chel ? "" : c.dataset.chel; render(); return; }
      const p = e.target.closest("[data-podr]");
      if (p) { s.otkryt = s.otkryt === p.dataset.podr ? "" : p.dataset.podr; s.chelovek = ""; render(); }
    });
    parts.push(block("Подразделения и люди",
      `${esc(cur.label)} · действий в WMS за смену · клик по подразделению — его люди, по человеку — что и когда он делает`, spisok));

    // что делают — все люди фильтра
    const chto = new Map();
    zz.forEach((x) => x.z.op.forEach((o) => { const k = tipZona(o[1], o[2]); chto.set(k, (chto.get(k) || 0) + o[3]); }));
    const chtoSp = [...chto.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 15);
    const vsegoD = [...chto.values()].reduce((a, v) => a + v, 0) || 1;
    const chtoBox = document.createElement("div");
    chtoBox.className = "polosy";
    chtoBox.innerHTML = chtoSp.map(([k, v]) => polosa(k, v, chtoSp[0] ? chtoSp[0][1] : 1, `${one(100 * v / vsegoD)}% всех действий`)).join("");
    if (chtoSp.length) parts.push(block("Что делают", `${esc(cur.label)} · тип перемещения · зона, откуда брали — действий за период, 15 самых частых`, chtoBox));

    box.replaceChildren(...parts);
    stamp.textContent = `обновлено ${D.обновлено}`;
    message.textContent = "";
  }

  function kartochka(x, cur) {
    const card = document.createElement("div");
    card.className = "personCard";
    const dni = x.z.dni.map((d) => ({ z: d[1], os: dayLabel(d[0]), zag: dayLabel(d[0]), dop: [`${count(d[2])} шт · ${d[3]} документов`] }));
    const op = new Map();
    x.z.op.forEach((o) => { const k = tipZona(o[1], o[2]); op.set(k, (op.get(k) || 0) + o[3]); });
    const opSp = [...op.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    card.innerHTML = `<div class="personCard__head"><div><h3>${esc(x.p.фио)}</h3><p>${esc(x.p.должность)} · ${esc(x.p.подразделение)} · `
      + `${one(x.z.na)} действий за смену · ${x.z.smen} ${smen(x.z.smen)} · в штате с ${esc(x.p.принят || "—")}</p></div></div>`;
    card.appendChild(grafik(dni, "действий за день"));
    const p = document.createElement("div");
    p.className = "polosy polosy--vnutri";
    p.innerHTML = `<p class="perfLead">что делает · ${esc(cur.label)}</p>` + opSp.map(([k, v]) => polosa(k, v, opSp[0][1], `${one(100 * v / (x.z.deystv || 1))}%`)).join("");
    card.appendChild(p);
    return card;
  }

  function vygruzka(cur, sravnP, zz) {
    const listy = [];
    listy.push({ imya: "Люди", rows: [["сотрудник", "должность", "подразделение", "отдел", "смен", "действий", "штук", "действий за смену",
      ...(sravnP ? [`действий за смену, ${sravnP.label}`] : [])],
      ...zz.map((x) => [x.p.фио, x.p.должность, x.p.подразделение, x.p.отдел, x.z.smen, x.z.deystv, x.z.shtuk, Number(x.z.na.toFixed(1)),
        ...(sravnP ? [x.b && x.b.smen ? Number(x.b.na.toFixed(1)) : ""] : [])])] });
    listy.push({ imya: "По дням", rows: [["сотрудник", "день", "действий", "штук", "документов", "кг"],
      ...zz.flatMap((x) => x.z.dni.map((d) => [x.p.фио, d[0], d[1], d[2], d[3], d[4]]))] });
    listy.push({ imya: "Что делают", rows: [["сотрудник", "месяц", "тип", "зона откуда", "действий", "штук"],
      ...zz.flatMap((x) => x.z.op.map((o) => [x.p.фио, o[0], D.типы[String(o[1])] || o[1], D.зоны[String(o[2])] || o[2], o[3], o[4]]))] });
    window.saveXlsxKniga(listy, `Производительность штата ${cur.label}${s.otdel ? " · " + s.otdel : ""}`);
  }

  fetch("../../data/perf_shtat.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(`сервер вернул ${r.status}`); return r.json(); })
    .then((d) => { D = d; render(); })
    .catch((e) => { message.textContent = `Не удалось загрузить данные: ${e.message || e}`; });
})();
