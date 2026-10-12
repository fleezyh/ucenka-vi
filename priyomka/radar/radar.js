/* Склад-радар · вход Москвы (13.10.2026).
 *
 * Степан: «экран слабый, а дашик слишком много инфы имеет — хочется прям ВСЁ видеть»; «карта нужна не ровно такая же,
 * а под наши метрики… сама карта конченная где это находится — надо красиво, стиль управления вооружённых сил,
 * палантир, но чтоб реально эта карта ебать че-то говорила, и можно было крутить историю».
 *
 * Что говорит карта (Подмосковье в настоящих координатах):
 *   — склад: кольцо из шести дуг — двор, ворота, приёмка, размещение, вход (буферы), хранение; цвет дуги — состояние этапа,
 *     в центре — сколько машин ждут ворот; мигает, если что-то сломано;
 *   — прилетающие штрихи — машины поставщиков за последний час;
 *   — челнок ДМД ⇄ ЧШК и 3PL → ДМД: толщина — штук за сутки (внутренние отгрузки ВМС);
 *   — стрелки направлений из ДМД и ЧШК — куда уходит товар (регионы и магазины Москвы), за сутки.
 * Шкала времени внизу: три недели по часам (data/radar_istoriya.json, task_radar.py). Ползунок, проигрывание, ← →.
 * В прошлом всё считается по истории; в «сейчас» поверх неё — живые файлы (двор, зоны и темп из ВМС, хранение из DWH).
 * Пороги — как на /priyomka/: двор 2 ч / 4 ч, темп < 70% нормы тормозит, < 40% стоит. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const DATA = new URLSearchParams(location.search).get("data") || "../../data/";   // ?data= — для проверки на копиях
  const NS = "http://www.w3.org/2000/svg";
  const C = { krit: "#ff4d5e", vys: "#f2b33d", sred: "#7fa0b2", norma: "#2ee6d6", net: "#2a3d49", svoy: "#2ee6d6", trans: "#5fa8ff" };
  const SLOVO = { krit: "КРИТ", vys: "ВНИМАНИЕ", sred: "СРЕД", norma: "НОРМА", net: "НЕТ ДАННЫХ" };
  const VES = { krit: 4, vys: 3, sred: 2, norma: 1, net: 0 };
  const SKLADY = ["ДМД", "ЧШК"];
  const IMYA = { ДМД: "ДОМОДЕДОВО", ЧШК: "ЧАШНИКОВО", "3PL": "3PL ЧЕХОВ" };
  const ETAPY = [["dvor", "Двор"], ["vorota", "Ворота"], ["priyomka", "Приёмка"], ["razm", "Размещение"], ["vhod", "Буферы входа"], ["hran", "Хранение"]];

  const num = (v) => (v == null ? "—" : Math.round(Number(v) || 0).toLocaleString("ru-RU"));
  const tys = (v) => { if (v == null) return "—"; const x = Number(v) || 0; return x >= 1e6 ? `${(x / 1e6).toFixed(2).replace(".", ",")} млн` : x >= 10000 ? `${Math.round(x / 1000)} тыс` : x >= 1000 ? `${(x / 1000).toFixed(1).replace(".", ",")} тыс` : num(x); };
  const chmm = (m) => { m = Math.max(0, Math.round(Number(m) || 0)); return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`; };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const huzhe = (a, b) => (VES[a] >= VES[b] ? a : b);
  const pct = (a, b) => (b ? Math.round(100 * a / b) : null);
  const ddmm = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  const el = (tag, atr = {}, rod = null, tekst = null) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(atr)) n.setAttribute(k, v);
    if (tekst !== null) n.textContent = tekst;
    if (rod) rod.appendChild(n);
    return n;
  };
  const vozrastMin = (s) => (s ? (Date.now() - new Date(s.replace(" ", "T") + ":00+03:00").getTime()) / 60000 : Infinity);
  const noch = () => { const t = new Date(); const m = t.getHours() * 60 + t.getMinutes(); return m >= 22 * 60 + 50 || m < 6 * 60; };

  /* ── география: проекция и подложка ─────────────────────────────── */
  const W = 1048, H = 690, LAT0 = 55.65, LON0 = 37.55, S = 511, KX = Math.cos(LAT0 * Math.PI / 180);
  const P = (lat, lon) => [W / 2 + (lon - LON0) * KX * S, H / 2 - (lat - LAT0) * S];
  const GEO = { ДМД: [55.44, 37.75], ЧШК: [56.026, 37.173], "3PL": [55.18, 37.51], МСК: [55.756, 37.617] };
  const TRASSY = [
    ["М-11", [[55.80, 37.49], [55.885, 37.43], [55.98, 37.22], [56.03, 37.15], [56.18, 36.98], [56.36, 36.7]]],
    ["М-8", [[55.85, 37.66], [55.91, 37.73], [56.01, 37.85], [56.30, 38.13], [56.4, 38.2]]],
    ["М-7", [[55.75, 37.82], [55.80, 37.94], [55.85, 38.44], [55.88, 39.2]]],
    ["М-5", [[55.68, 37.85], [55.68, 37.89], [55.42, 38.26], [55.15, 38.85]]],
    ["М-4", [[55.62, 37.71], [55.44, 37.76], [55.25, 37.85], [54.95, 38.06]]],
    ["М-2", [[55.58, 37.60], [55.43, 37.55], [55.14, 37.46], [54.92, 37.41]]],
    ["М-3", [[55.63, 37.44], [55.55, 37.07], [55.39, 36.73], [55.2, 36.3]]],
    ["М-1", [[55.71, 37.39], [55.68, 37.28], [55.61, 36.99], [55.5, 36.2]]],
    ["М-9", [[55.79, 37.37], [55.80, 37.10], [55.92, 36.86], [55.98, 36.1]]],
  ];
  const GORODA = [["Москва", 55.756, 37.617, 1], ["Зеленоград", 55.99, 37.21], ["Солнечногорск", 56.18, 36.98], ["Химки", 55.89, 37.44],
    ["Мытищи", 55.91, 37.73], ["Балашиха", 55.80, 37.94], ["Люберцы", 55.68, 37.89], ["Подольск", 55.43, 37.54], ["Домодедово", 55.44, 37.76],
    ["Чехов", 55.14, 37.46], ["Серпухов", 54.92, 37.41], ["Одинцово", 55.68, 37.28], ["Истра", 55.92, 36.86], ["Сергиев Посад", 56.30, 38.13],
    ["Ногинск", 55.85, 38.44], ["Наро-Фоминск", 55.39, 36.73], ["Клин", 56.33, 36.73], ["Ступино", 54.89, 38.08], ["Воскресенск", 55.32, 38.65]];
  // куда уходит товар: координаты городов назначения (для направления стрелки)
  const REG = { СПБ: [59.94, 30.31], КАЗ: [55.79, 49.12], ЕКБ: [56.84, 60.6], КРД: [45.04, 38.98], НН: [56.33, 44.0], САМ: [53.2, 50.15],
    РНД: [47.23, 39.72], ТУЛ: [54.19, 37.62], НСК: [55.03, 82.92], ВРЖ: [51.67, 39.18], ЯР: [57.63, 39.87], ВГГ: [48.71, 44.51], УФА: [54.74, 55.97],
    ЧЕЛ: [55.16, 61.4], САР: [51.53, 46.03], ПНЗ: [53.2, 45.0], ТЮМ: [57.15, 65.53], ПЕР: [58.01, 56.25], ВЛ: [56.13, 40.4], СРГ: [61.25, 73.4],
    ВЛГ: [59.22, 39.89], ИЖ: [56.85, 53.2], СТВ: [45.04, 41.97], КСК: [56.01, 92.89], РЯЗ: [54.63, 39.74], ТВР: [56.86, 35.9], КАЛ: [54.51, 36.26],
    БРН: [53.24, 34.36], ЛПЦ: [52.61, 39.6], БЛГ: [50.6, 36.59], КРС: [51.73, 36.19], ОРЛ: [52.97, 36.07], СМЛ: [54.78, 32.05], ИВН: [57.0, 40.97],
    КСТ: [57.77, 40.93], ТМБ: [52.72, 41.45], УЛН: [54.31, 48.4], ЧБК: [56.15, 47.25], ОМС: [54.99, 73.37], ТЛТ: [53.51, 49.42], ОРБ: [51.77, 55.1] };

  let D = {};             // сырьё
  let I = 0;              // выбранный час (индекс в истории)
  let N = 0;              // часов в истории
  let zhivoy = true;      // стоим на последнем часе — едем вместе со временем
  let igraet = null;
  let fokus = null;
  let ST = null;          // посчитанное состояние на I
  let INC = [];           // журнал инцидентов

  function vpisat() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    $("rdHolst").style.transform = `translate(${(innerWidth - 1920 * k) / 2}px, ${(innerHeight - 1080 * k) / 2}px) scale(${k})`;
  }

  /* ── состояние склада в час i ───────────────────────────────────── */
  const ist = (sk) => D.ist?.склады?.[sk] || {};
  const v = (sk, k, i) => { const a = ist(sk)[k]; return a && i >= 0 && i < a.length ? a[i] : null; };
  const sum3 = (sk, k, i) => { let s = 0, n = 0; for (let j = i - 2; j <= i; j++) { const x = v(sk, k, j); if (x != null) { s += x; n++; } } return n ? s : null; };
  const mediana = (a) => { const z = a.filter((x) => x != null).sort((x, y) => x - y); return z.length ? z[Math.floor(z.length / 2)] : null; };

  function tempSost(f3, n3, f1, n1) {
    if (f3 == null || n3 == null || n3 < 600) return { sev: "net", tekst: n3 != null && n3 < 600 ? "тихий час" : "нет нормы", d: null };
    const d = f3 / n3, d1 = n1 ? (f1 || 0) / n1 : 1;
    const sev = d < 0.4 && d1 < 0.4 ? "krit" : d < 0.7 ? "vys" : "norma";
    return { sev, tekst: `${Math.round(d * 100)}% нормы за 3 ч`, d };
  }

  /** Двор против нормы часа: у ДМД долгое ожидание обычное — красим только то, что хуже обычного.
      Стоп без оговорок — 6 часов; 4 часа — красное, если это в полтора раза дольше обычного; 2 часа — жёлтое, если в 1,3 раза. */
  function sevDvor(z, zn, dl, dln) {
    if (z == null) return "net";
    const huzheObych = (k) => dln == null || dl >= k * dln;
    if (dl >= 360 || (dl >= 240 && huzheObych(1.5))) return "krit";
    if ((dl >= 120 && huzheObych(1.3)) || (zn != null && z > Math.max(8, 2.5 * zn))) return "vys";
    return "norma";
  }

  function sostoyanie(sk, i) {
    const e = {};
    const z = v(sk, "ждут", i), zn = v(sk, "ждут_норма", i), dl = v(sk, "дольше_мин", i), dln = v(sk, "дольше_норма", i);
    const sev = sevDvor(z, zn, dl, dln);
    e.dvor = { sev, zn: z == null ? "—" : `${num(z)} ждут`,       st: z ? `дольше всех ${chmm(dl)}${dln != null ? ` (обычно ${chmm(dln)})` : ""}` : `очереди нет${zn ? ` · обычно ${num(zn)}` : ""}`,
      z, nz: zn, dl, dln, pal: v(sk, "паллет_ждут", i) };
    const na = v(sk, "на_воротах", i), pr = v(sk, "приехало", i), prn = v(sk, "приехало_норма", i);
    e.vorota = { sev: na == null ? "net" : "norma", zn: `${num(na)} на воротах`, st: `за час приехало ${num(pr)}${prn != null ? ` · норма ${num(prn)}` : ""}`, na, pr, prn };
    for (const [k, uch] of [["priyomka", "приёмка"], ["razm", "размещение"]]) {
      const f3 = sum3(sk, uch, i), n3 = sum3(sk, `${uch}_норма`, i), f1 = v(sk, uch, i), n1 = v(sk, `${uch}_норма`, i);
      const t = tempSost(f3, n3, f1, n1);
      e[k] = { sev: t.sev, zn: f1 == null ? "—" : `${tys(f1)} шт/ч`, st: t.tekst, f3, n3, f1, n1, d: t.d };
    }
    const vh = v(sk, "вход_шт", i);
    const med = mediana(ist(sk).вход_шт || []);
    const k = vh != null && med ? vh / med : null;
    e.vhod = { sev: k == null ? "net" : k >= 1.6 ? "krit" : k >= 1.3 ? "vys" : "norma", zn: vh == null ? "—" : `${tys(vh)} шт`,
      st: k == null ? "нет снимка" : `${Math.round(k * 100)}% от обычного (3 нед)`, vh, med, ist: v(sk, "вход_источник", i) };
    e.hran = { sev: "net", zn: "—", st: "только в «сейчас»" };
    return e;
  }

  // «сейчас»: поверх истории — живые файлы
  function zhivyeNalozhit(sk, e) {
    const dv = (D.dvor?.склады || []).find((s) => s.склад === sk);
    if (dv) {
      const m = dv.дольше_всех_мин || 0;
      e.dvor = { ...e.dvor, sev: sevDvor(dv.ждут_ворот, e.dvor.nz, m, e.dvor.dln),
        zn: `${num(dv.ждут_ворот)} ждут`, st: dv.ждут_ворот ? `дольше всех ${chmm(m)}${e.dvor.dln != null ? ` (обычно ${chmm(e.dvor.dln)})` : ""}` : "очереди нет",
        z: dv.ждут_ворот, dl: m, pal: dv.паллет_в_очереди, mash: dv.машины };
      e.vorota = { ...e.vorota, zn: `${num(dv.на_разгрузке)} на воротах`, na: dv.на_разгрузке };
    }
    const temp = sk === "ДМД" ? D.temp : D.tempCh;
    for (const [k, uch] of [["priyomka", "приёмка"], ["razm", "размещение"]]) {
      const vr = temp?.вердикт?.[uch];
      if (!vr) continue;
      const t = tempSost(vr.факт_3ч, vr.норма_3ч, vr.факт_час, vr.норма_час);
      e[k] = { ...e[k], sev: t.sev, st: t.tekst, f3: vr.факт_3ч, n3: vr.норма_3ч, f1: vr.факт_час, n1: vr.норма_час, tekCh: vr.текущий_час };
    }
    const zony = sk === "ДМД" ? D.zhivo?.зоны : D.zhivo?.чшк?.зоны;
    if (zony) {
      const zz = Object.entries(zony).map(([imya, z]) => ({ imya, ...z }));
      const vh = zz.reduce((a, z) => a + (z.штук || 0), 0), n48 = zz.reduce((a, z) => a + (z.ждут_больше_48ч || 0), 0);
      const maks = Math.max(0, ...zz.map((z) => z.ждут_макс_ч || 0));
      const kk = e.vhod.med ? vh / e.vhod.med : null;
      e.vhod = { ...e.vhod, vh, zn: `${tys(vh)} шт`, zony: zz, n48, maks,
        sev: huzhe(kk == null ? "norma" : kk >= 1.6 ? "krit" : kk >= 1.3 ? "vys" : "norma", n48 >= 100 ? "vys" : "norma"),
        st: `${n48 ? `висят > 48 ч: ${num(n48)} конт. · ` : ""}${kk == null ? "" : `${Math.round(kk * 100)}% от обычного`}` };
    }
    if (sk === "ДМД" && D.mon?.секторы) {
      const sek = D.mon.секторы.filter((s) => /Сектор .* ДМД$/.test(s.сектор) && s.мест_хранения);
      const mest = sek.reduce((a, s) => a + s.мест_хранения, 0), zan = sek.reduce((a, s) => a + s.занято_хранения, 0);
      const kr = sek.filter((s) => s.процент_хранения > 92);
      e.hran = { sev: kr.length >= 3 ? "vys" : kr.length ? "sred" : "norma", zn: `${Math.round(100 * zan / (mest || 1))}%`,
        st: kr.length ? `забито: ${kr.map((s) => (s.сектор.match(/Сектор (\S+)/) || [])[1]).join(", ")}` : "секторы в норме", sektory: sek };
    }
    return e;
  }

  function poschitat() {
    const st = {};
    for (const sk of SKLADY) {
      let e = sostoyanie(sk, I);
      if (I === N - 1) e = zhivyeNalozhit(sk, e);
      let sev = "norma";
      for (const [k] of ETAPY) if (e[k].sev !== "net") sev = huzhe(sev, e[k].sev);
      st[sk] = { e, sev, problem: ETAPY.filter(([k]) => VES[e[k].sev] >= VES.vys).map(([, n]) => n) };
    }
    return st;
  }

  /* ── журнал инцидентов: подряд идущие часы, где этап сломан ────── */
  function zhurnal() {
    const out = [];
    for (const sk of SKLADY) {
      for (const [k, imya] of [["dvor", "Двор"], ["priyomka", "Приёмка"], ["razm", "Размещение"]]) {
        let tek = null;
        for (let i = 0; i < N; i++) {
          const x = sostoyanie(sk, i)[k];
          const plokho = VES[x.sev] >= VES.vys;
          if (plokho) {
            if (!tek) tek = { sk, k, imya, s: i, po: i, sev: x.sev, pik: x };
            tek.po = i;
            if (VES[x.sev] > VES[tek.sev]) tek.sev = x.sev;
            if (k === "dvor" ? (x.dl || 0) > (tek.pik.dl || 0) : (x.d ?? 9) < (tek.pik.d ?? 9)) tek.pik = x;
          } else if (tek) { out.push(tek); tek = null; }
        }
        if (tek) out.push(tek);
      }
    }
    return out.filter((x) => x.po - x.s >= 1 || x.sev === "krit").sort((a, b) => b.s - a.s);
  }

  /* ── шапка ──────────────────────────────────────────────────────── */
  function shapka() {
    const t = D.ist.часы[I];
    const r = $("rdRezhim");
    if (I === N - 1) { r.className = "rdRezhim"; r.textContent = "● ПРЯМОЙ ЭФИР"; }
    else {
      const ch = N - 1 - I;
      r.className = "rdRezhim is-istoriya";
      r.textContent = `◷ ИСТОРИЯ · ${ddmm(t)} ${t.slice(11, 16)} · −${ch >= 24 ? `${Math.floor(ch / 24)} сут ` : ""}${ch % 24} ч`;
    }
    const ist_ = [["ВМС живьём", D.zhivo?.обновлено, 15], ["двор", D.dvor?.обновлено, 25], ["темп", D.temp?.обновлено, 15], ["история", D.ist?.обновлено, 90]];
    $("rdIstochniki").innerHTML = ist_.map(([imya, tt, norm]) => {
      const vz = vozrastMin(tt);
      const c = noch() && imya !== "история" ? C.net : vz <= norm ? C.norma : vz <= norm * 3 ? C.vys : C.krit;
      return `<span style="--c:${c}">${imya} <b>${tt ? tt.slice(11) : "нет"}</b></span>`;
    }).join("") + (D.svezh?.застыл ? `<span style="--c:${C.vys}">DWH <b>застыл</b></span>` : "")
      + (noch() ? `<span style="--c:${C.net}">ночью двор и зоны не пересчитываются</span>` : "");
    const sev = SKLADY.reduce((a, k) => huzhe(a, ST[k].sev), "norma");
    $("rdRisk").innerHTML = `ОБСТАНОВКА<b style="color:${C[sev]}">${{ krit: "КРИТИЧНАЯ", vys: "НАПРЯЖЁННАЯ", sred: "СРЕДНЯЯ", norma: "ШТАТНАЯ", net: "—" }[sev]}</b>`;
  }

  /* ── обстановка: этап × склад ───────────────────────────────────── */
  function obstanovka() {
    $("rdObstT").textContent = I === N - 1 ? "СЕЙЧАС" : `${ddmm(D.ist.часы[I])} ${D.ist.часы[I].slice(11, 16)}`;
    let h = `<div class="rdObst"><span></span>${SKLADY.map((sk) => `<span class="rdObst__sk" data-sk="${sk}" style="color:${C[ST[sk].sev] === C.norma ? "#e8f6ff" : C[ST[sk].sev]}">${IMYA[sk]}</span>`).join("")}`;
    for (const [k, imya] of ETAPY) {
      h += `<span class="rdObst__etap">${imya}</span>`;
      for (const sk of SKLADY) { const x = ST[sk].e[k]; h += `<div class="rdObst__kl" style="--c:${C[x.sev]}" data-sk="${sk}" data-etap="${k}"><b>${esc(x.zn)}</b><span>${esc(x.st)}</span></div>`; }
    }
    $("rdObst").innerHTML = h + "</div>";
  }

  /* ── воронка суток до выбранного часа ───────────────────────────── */
  function voronka() {
    const t = D.ist.часы[I], den = t.slice(0, 10);
    $("rdVorT").textContent = `${ddmm(t)} ДО ${t.slice(11, 16)}`;
    const ot = D.ist.часы.findIndex((x) => x.startsWith(den));
    const s = (sk, k) => { let a = 0, est = false; for (let i = Math.max(ot, 0); i <= I; i++) { const x = v(sk, k, i); if (x != null) { a += x; est = true; } } return est ? a : null; };
    $("rdVoronka").innerHTML = SKLADY.map((sk) => {
      const pr = s(sk, "приехало"), prn = s(sk, "приехало_норма"), rz = s(sk, "разгружено");
      const pm = s(sk, "приёмка"), pmn = s(sk, "приёмка_норма"), ra = s(sk, "размещение"), ran = s(sk, "размещение_норма");
      const cv = (d) => (d == null ? C.sred : d >= 0.7 ? C.norma : d >= 0.4 ? C.vys : C.krit);
      const ryad = (imya, fakt, norma, tekst, cvet) => {
        const maks = Math.max(fakt || 0, norma || 0, 1);
        return `<div class="rdVor__ryad"><span>${imya}</span><i><u style="width:${Math.round(100 * (fakt || 0) / maks)}%;--c:${cvet}"></u>${norma ? `<s style="left:${Math.round(100 * norma / maks)}%"></s>` : ""}</i><b>${tekst}</b></div>`;
      };
      return `<div class="rdVor"><div class="rdVor__sk">${IMYA[sk]}</div>`
        + ryad("машин", pr, prn, `${num(pr)}${prn ? ` · норма ${num(prn)}` : ""}`, pr > 1.4 * (prn || Infinity) ? C.vys : C.norma)
        + ryad("разгружено", rz, pr, `${num(rz)} маш`, cv(pr ? rz / pr : null))
        + ryad("принято", pm, pmn, `${tys(pm)}${pmn ? ` · ${pct(pm, pmn)}%` : ""}`, cv(pmn ? pm / pmn : null))
        + ryad("размещено", ra, ran, `${tys(ra)}${ran ? ` · ${pct(ra, ran)}%` : ""}`, cv(ran ? ra / ran : null)) + "</div>";
    }).join("") + '<div class="rdVor__pri">белая черта — норма к этому часу (тот же день недели и час, медиана 4–5 недель)</div>';
  }

  /* ── карта ──────────────────────────────────────────────────────── */
  function karta() {
    const box = $("rdKarta");
    box.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, box);
    const defs = el("defs", {}, svg);
    const g = el("radialGradient", { id: "rdGlow" }, defs);
    el("stop", { offset: 0, "stop-color": "#2ee6d6", "stop-opacity": 0.12 }, g);
    el("stop", { offset: 1, "stop-color": "#2ee6d6", "stop-opacity": 0 }, g);
    for (const [k, c] of Object.entries(C)) {
      const gg = el("radialGradient", { id: `rdSv_${k}` }, defs);
      el("stop", { offset: 0, "stop-color": c, "stop-opacity": 0.32 }, gg);
      el("stop", { offset: 1, "stop-color": c, "stop-opacity": 0 }, gg);
      const m = el("marker", { id: `rdStr_${k}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0 0 L10 5 L0 10 z", fill: c }, m);
    }
    const sweep = el("linearGradient", { id: "rdSweep", x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    el("stop", { offset: 0, "stop-color": "#2ee6d6", "stop-opacity": 0 }, sweep);
    el("stop", { offset: 1, "stop-color": "#2ee6d6", "stop-opacity": 0.1 }, sweep);

    // координатная сетка с подписями — как на оперативной карте
    const setka = el("g", { stroke: "#0c1b24", "stroke-width": 1 }, svg);
    for (let lat = 55.0; lat <= 56.31; lat += 0.25) {
      const [, y] = P(lat, LON0);
      el("line", { x1: 0, x2: W, y1: y, y2: y }, setka);
      el("text", { x: 6, y: y - 4, fill: "#2b4352", "font-size": 10.5 }, svg, `${Math.floor(lat)}°${String(Math.round((lat % 1) * 60)).padStart(2, "0")}′ С`);
    }
    for (let lon = 35.75; lon <= 39.3; lon += 0.25) {
      const [x] = P(LAT0, lon);
      el("line", { x1: x, x2: x, y1: 0, y2: H }, setka);
      if (Math.abs((lon * 4) % 2) < 0.01) el("text", { x: x + 4, y: H - 6, fill: "#2b4352", "font-size": 10.5 }, svg, `${Math.floor(lon)}°${String(Math.round((lon % 1) * 60)).padStart(2, "0")}′ В`);
    }
    // ЦКАД и МКАД
    const [mx, my] = P(55.745, 37.62);
    el("ellipse", { cx: mx, cy: my, rx: 0.73 * KX * S, ry: 0.40 * S, fill: "none", stroke: "#173040", "stroke-width": 2, "stroke-dasharray": "7 6" }, svg);
    el("text", { x: mx + 0.5 * KX * S, y: my - 0.33 * S, fill: "#2b4352", "font-size": 11, "letter-spacing": 2 }, svg, "ЦКАД");
    el("ellipse", { cx: mx, cy: my, rx: 0.245 * KX * S, ry: 0.168 * S, fill: "#0a1a24", stroke: "#1f4256", "stroke-width": 2.5 }, svg);
    el("text", { x: mx + 0.17 * KX * S, y: my - 0.15 * S, fill: "#2b4352", "font-size": 11, "letter-spacing": 2 }, svg, "МКАД");
    // трассы
    const tg = el("g", { fill: "none", stroke: "#12293a", "stroke-width": 2 }, svg);
    for (const [imya, tochki] of TRASSY) {
      const pts = tochki.map(([a, b]) => P(a, b));
      el("polyline", { points: pts.map((p) => p.join(",")).join(" ") }, tg);
      const [x, y] = pts[pts.length - 2];
      el("text", { x: x + 6, y: y - 6, fill: "#26495c", "font-size": 10.5, "font-weight": 600 }, svg, imya);
    }
    // города
    for (const [imya, a, b, glav] of GORODA) {
      const [x, y] = P(a, b);
      el("circle", { cx: x, cy: y, r: glav ? 3.5 : 2, fill: "#2b4352" }, svg);
      el("text", { x: x + 6, y: y + 4, fill: glav ? "#5d7a8a" : "#33505f", "font-size": glav ? 13 : 11, "letter-spacing": glav ? 3 : 0.5 }, svg, glav ? imya.toUpperCase() : imya);
    }
    const [ax, ay] = P(55.41, 37.90);
    el("text", { x: ax - 6, y: ay + 5, fill: "#33505f", "font-size": 13 }, svg, "✈");
    el("text", { x: ax + 10, y: ay + 5, fill: "#33505f", "font-size": 10 }, svg, "DME");

    // луч радара от Москвы
    const luch = el("g", { class: "rdLuch", style: `transform-origin:${mx}px ${my}px` }, svg);
    el("path", { d: `M${mx} ${my} L${mx + 420} ${my - 60} A 424 424 0 0 1 ${mx + 424} ${my} Z`, fill: "url(#rdSweep)" }, luch);

    perevozkiNaKarte(svg);
    for (const sk of SKLADY) uzel(svg, sk);
    uzel3pl(svg);
    legendaKarty(svg);
  }

  /* перевозки за сутки выбранного часа */
  function perevozkiNaKarte(svg) {
    const pv = D.ist?.перевозки;
    if (!pv) return;
    let den = D.ist.часы[I].slice(0, 10);
    let j = pv.дни.indexOf(den);
    if (j < 0) return;
    // сутки только начались и перевозок ещё нет — показываем вчерашние, с подписью
    const za = (jj) => Object.values(pv.пары).concat(Object.values(pv.регионы)).reduce((a, arr) => a + (arr[jj] || 0), 0);
    if (j > 0 && za(j) < 1000) { j -= 1; den = pv.дни[j]; }
    const ves = (x) => Math.max(1.2, Math.min(14, Math.sqrt(x / 1000) * 1.1));
    const duga = (a, b, izgib, sht, c, podpis, smesh = 0, podpisXY = null) => {
      const [x1, y1] = a, [x2, y2] = b;
      const nx = -(y2 - y1), ny = x2 - x1, dl = Math.hypot(nx, ny) || 1;
      const cx = (x1 + x2) / 2 + nx / dl * izgib, cy = (y1 + y2) / 2 + ny / dl * izgib;
      const d = `M${x1 + nx / dl * smesh} ${y1 + ny / dl * smesh} Q ${cx} ${cy}, ${x2 + nx / dl * smesh} ${y2 + ny / dl * smesh}`;
      el("path", { d, fill: "none", stroke: c, "stroke-opacity": 0.22, "stroke-width": ves(sht) + 4 }, svg);
      el("path", { d, fill: "none", stroke: c, "stroke-opacity": 0.85, "stroke-width": ves(sht), "stroke-dasharray": "14 6", class: "rdPotok",
        style: `animation-duration:${Math.max(0.6, 3.2 - Math.log10(sht + 1) * 0.5)}s`, "marker-end": `url(#rdStr_${c === C.trans ? "trans" : "svoy"})` }, svg);
      if (podpis) el("text", { x: podpisXY ? podpisXY[0] : cx + 6, y: podpisXY ? podpisXY[1] : cy, fill: c, "font-size": 12.5, "font-weight": 600,
        "text-anchor": podpisXY ? "end" : "start" }, svg, podpis);
    };
    const pD = P(...GEO.ДМД), pC = P(...GEO.ЧШК), p3 = P(...GEO["3PL"]);
    const dc = pv.пары["ДМД>ЧШК"]?.[j] || 0, cd = pv.пары["ЧШК>ДМД"]?.[j] || 0, td = pv.пары["3PL>ДМД"]?.[j] || 0;
    // челнок одной подписью — слева от дуги, подальше от Москвы
    const pod = [Math.min(pD[0], pC[0]) - 30, (pD[1] + pC[1]) / 2 + 40];
    if (dc) duga(pD, pC, -60, dc, C.trans, "", 6);
    if (cd) duga(pC, pD, -60, cd, C.trans, "", 6);
    if (dc || cd) {
      el("text", { x: pod[0], y: pod[1], fill: C.trans, "font-size": 13, "font-weight": 600, "text-anchor": "end" }, svg, "ЧЕЛНОК ДМД ⇄ ЧШК");
      el("text", { x: pod[0], y: pod[1] + 16, fill: C.trans, "font-size": 12, "text-anchor": "end" }, svg, `в ЧШК ${tys(dc)} · в ДМД ${tys(cd)} шт`);
    }
    if (td) duga(p3, pD, 25, td, C.trans, `3PL → ДМД ${tys(td)} шт`);

    // направления: самые крупные за сутки, из ДМД и ЧШК; Москва — в город
    const vse = Object.entries(pv.регионы).map(([k, a]) => { const [ot, kuda] = k.split(">"); return { ot, kuda, sht: a[j] || 0 }; }).filter((x) => x.sht > 0);
    const top = vse.filter((x) => x.kuda !== "МСК").sort((a, b) => b.sht - a.sht).slice(0, 12);
    const kraya = [];
    for (const x of top.concat(vse.filter((y) => y.kuda === "МСК"))) {
      const ot = P(...GEO[x.ot]);
      let kon;
      if (x.kuda === "МСК") {
        const m = P(...GEO.МСК);
        kon = [m[0] + (ot[0] - m[0]) * 0.18, m[1] + (ot[1] - m[1]) * 0.18];
      } else {
        const r = REG[x.kuda];
        if (!r) continue;
        const cel = P(...r);
        let dx = cel[0] - ot[0], dy = cel[1] - ot[1];
        const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
        const tt = Math.min(...[dx > 0 ? (W - 40 - ot[0]) / dx : dx < 0 ? (40 - ot[0]) / dx : Infinity, dy > 0 ? (H - 30 - ot[1]) / dy : dy < 0 ? (30 - ot[1]) / dy : Infinity]);
        kon = [ot[0] + dx * tt, ot[1] + dy * tt];
      }
      const st = x.ot === "ДМД" ? C.svoy : C.vys;
      el("line", { x1: ot[0], y1: ot[1], x2: kon[0], y2: kon[1], stroke: st, "stroke-opacity": 0.5, "stroke-width": ves(x.sht) * 0.8,
        "stroke-dasharray": "2 7", class: "rdPotok", style: "animation-duration:2.6s", "marker-end": `url(#rdStr_${x.ot === "ДМД" ? "svoy" : "vys"})` }, svg);
      if (x.kuda !== "МСК") {
        let ty = kon[1] + (kon[1] < 40 ? 16 : -6);
        while (kraya.some((k) => Math.abs(k[0] - kon[0]) < 120 && Math.abs(k[1] - ty) < 14)) ty += 14;
        kraya.push([kon[0], ty]);
        el("text", { x: Math.min(W - 130, Math.max(8, kon[0] - 40)), y: ty, fill: st, "font-size": 11.5, "font-weight": 600 }, svg, `${x.kuda} ${tys(x.sht)}${x.ot === "ЧШК" ? " · ЧШК" : ""}`);
      } else {
        // подпись у склада, на трети пути к городу
        const lx = ot[0] + (kon[0] - ot[0]) * 0.32, ly = ot[1] + (kon[1] - ot[1]) * 0.32;
        el("text", { x: lx + 10, y: ly + (x.ot === "ДМД" ? 4 : -4), fill: st, "font-size": 11.5, "font-weight": 600 }, svg, `→ магазины МСК ${tys(x.sht)}`);
      }
    }
    const prochie = pv.прочие?.[j] || 0;
    el("text", { x: W - 230, y: 22, fill: "#46606f", "font-size": 11 }, svg, `отгрузки в регионы за ${ddmm(den)}${prochie ? `, мелкие ещё ${tys(prochie)}` : ""}`);
  }

  /* склад: кольцо из шести этапов, в центре очередь */
  function uzel(svg, sk) {
    const [x, y] = P(...GEO[sk]);
    const s = ST[sk];
    const g = el("g", { class: "rdUzel" }, svg);
    g.addEventListener("click", () => otkryt({ tip: "sklad", sk }));
    el("circle", { cx: x, cy: y, r: 120, fill: `url(#rdSv_${s.sev})` }, g);
    // машины поставщиков за последний час — штрихи, летящие к складу
    const pr = Math.min(40, (I === N - 1 ? v(sk, "приехало", I) : v(sk, "приехало", I)) || 0);
    for (let k = 0; k < pr; k++) {
      const a = (k * 137.5) * Math.PI / 180, r1 = 70 + (k % 5) * 9;
      el("line", { x1: x + Math.cos(a) * r1, y1: y + Math.sin(a) * r1, x2: x + Math.cos(a) * (r1 - 14), y2: y + Math.sin(a) * (r1 - 14),
        stroke: C.svoy, "stroke-opacity": 0.55, "stroke-width": 1.5 }, g);
    }
    if (s.sev === "krit" || s.sev === "vys") el("circle", { cx: x, cy: y, r: 30, fill: "none", stroke: C[s.sev], "stroke-width": 2, class: "rdPing" }, g);
    const R = 34;
    ETAPY.forEach(([k], i) => {
      const a0 = (-90 + i * 60 + 3) * Math.PI / 180, a1 = (-90 + (i + 1) * 60 - 3) * Math.PI / 180;
      const d = `M${x + R * Math.cos(a0)} ${y + R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${x + R * Math.cos(a1)} ${y + R * Math.sin(a1)}`;
      el("path", { d, fill: "none", stroke: C[s.e[k].sev], "stroke-width": 7 }, g);
    });
    el("circle", { cx: x, cy: y, r: 24, fill: "#04090d", stroke: "#1f4256", "stroke-width": 1 }, g);
    const z = s.e.dvor.z;
    el("text", { x, y: y + 7, fill: C[s.e.dvor.sev] === C.norma ? "#e8f6ff" : C[s.e.dvor.sev], "font-size": 20, "font-weight": 600, "text-anchor": "middle" }, g, z == null ? "—" : String(z));
    // подпись: имя, очередь против нормы, темп
    const lx = sk === "ЧШК" ? x - 52 : x + 52, an = sk === "ЧШК" ? "end" : "start";
    el("text", { x: lx, y: y - 22, fill: "#e8f6ff", "font-size": 18, "font-weight": 600, "letter-spacing": 3, "text-anchor": an }, g, IMYA[sk]);
    el("text", { x: lx, y: y - 4, fill: C[s.sev], "font-size": 12, "letter-spacing": 1.5, "text-anchor": an }, g,
      s.problem.length ? `${SLOVO[s.sev]} · ${s.problem.join(", ").toLowerCase()}` : "ШТАТНО");
    el("text", { x: lx, y: y + 13, fill: "#7fa0b2", "font-size": 12, "text-anchor": an }, g,
      `во дворе ${num(s.e.dvor.z)}${s.e.dvor.nz != null ? ` (норма ${num(s.e.dvor.nz)})` : ""} · ворота ${num(s.e.vorota.na)}`);
    el("text", { x: lx, y: y + 29, fill: "#7fa0b2", "font-size": 12, "text-anchor": an }, g,
      `приёмка ${s.e.priyomka.d != null ? Math.round(s.e.priyomka.d * 100) + "%" : "—"} · размещение ${s.e.razm.d != null ? Math.round(s.e.razm.d * 100) + "%" : "—"} нормы`);
    el("text", { x: lx, y: y + 45, fill: "#46606f", "font-size": 11, "text-anchor": an }, g, `буферы входа ${s.e.vhod.zn}`);
  }

  function uzel3pl(svg) {
    const [x, y] = P(...GEO["3PL"]);
    const tpl = D.tpl;
    const g = el("g", { class: "rdUzel" }, svg);
    g.addEventListener("click", () => window.open("../../3pl/", "_blank"));
    el("rect", { x: x - 9, y: y - 9, width: 18, height: 18, fill: "#04090d", stroke: C.trans, "stroke-width": 2, transform: `rotate(45 ${x} ${y})` }, g);
    el("text", { x: x + 18, y: y - 2, fill: "#e8f6ff", "font-size": 14, "font-weight": 600, "letter-spacing": 2 }, g, "3PL ЧЕХОВ");
    el("text", { x: x + 18, y: y + 14, fill: C.trans, "font-size": 11.5 }, g,
      tpl?.биллинг?.месяц ? `ГСМ · ≈ ${num(tpl.биллинг.месяц.паллет_сейчас)} паллет на хранении` : "ГСМ · внешний склад");
  }

  function legendaKarty(svg) {
    const g = el("g", {}, svg);
    el("rect", { x: 10, y: H - 108, width: 270, height: 96, fill: "#04090dee", stroke: "#12212c" }, g);
    const st = [["кольцо склада: двор · ворота · приёмка", "#7fa0b2"], ["  · размещение · буферы · хранение (по часовой)", "#7fa0b2"],
      ["цифра в центре — машин ждут ворот", "#7fa0b2"], ["штрихи — машины за последний час", C.svoy], ["синие дуги — внутренние перевозки за сутки", C.trans]];
    st.forEach(([t, c], i) => el("text", { x: 20, y: H - 88 + i * 17, fill: c, "font-size": 11 }, g, t));
  }

  /* ── сигналы на выбранный час ───────────────────────────────────── */
  let SIG = [];
  function signaly() {
    SIG = [];
    for (const sk of SKLADY) {
      const e = ST[sk].e;
      for (const [k, imya] of ETAPY) {
        const x = e[k];
        if (VES[x.sev] < VES.vys) continue;
        SIG.push({ sk, k, sev: x.sev, zag: `${imya}: ${x.zn}`, tekst: x.st });
      }
      if (I === N - 1 && e.dvor.mash) e.dvor.mash.filter((m) => m.этап !== "на разгрузке" && m.на_дворе_мин >= 120).slice(0, 4).forEach((m) =>
        SIG.push({ sk, k: "dvor", sev: sevDvor(1, null, m.на_дворе_мин, e.dvor.dln) === "norma" ? "sred" : sevDvor(1, null, m.на_дворе_мин, e.dvor.dln), zag: `Фура ждёт ворот ${chmm(m.на_дворе_мин)}`, tekst: `${m.тип} · ${num(m.паллет)} пал.${m.ворота ? ` · ворота ${m.ворота}` : ""}` }));
      if (I === N - 1 && e.vhod.zony) e.vhod.zony.filter((z) => z.ждут_макс_ч >= 168 && z.ждут_больше_48ч >= 10).sort((a, b) => b.ждут_больше_48ч - a.ждут_больше_48ч).slice(0, 3).forEach((z) =>
        SIG.push({ sk, k: "vhod", sev: z.ждут_макс_ч >= 720 ? "krit" : "vys", zag: `${z.imya}: висят ${z.ждут_сотня ? "100+" : num(z.ждут_больше_48ч)} конт.`, tekst: `${tys(z.штук)} шт · дольше всех ${Math.round(z.ждут_макс_ч / 24)} дн` }));
    }
    if (I === N - 1) for (const [imya, t, norm] of [["зоны входа", D.zhivo?.обновлено, 15], ["двор", D.dvor?.обновлено, 25]])
      if (!noch() && vozrastMin(t) > norm * 2) SIG.push({ sk: "", k: "", sev: "vys", zag: `${imya} не обновляются ${chmm(vozrastMin(t))}`, tekst: "задача на сервере не отработала" });
    SIG.sort((a, b) => VES[b.sev] - VES[a.sev]);
    $("rdSchet").textContent = `${SIG.length} · ${I === N - 1 ? "СЕЙЧАС" : D.ist.часы[I].slice(5, 16).replace("-", ".")}`;
    $("rdLenta").innerHTML = SIG.length ? SIG.slice(0, 9).map((x, i) => `<div class="rdSig" data-sig="${i}" style="--c:${C[x.sev]}"><span>${SLOVO[x.sev]}${x.sk ? ` · ${x.sk}` : ""}</span>`
      + `<b>${esc(x.zag)}</b><i>${esc(x.tekst)}</i></div>`).join("") : '<div class="rdPusto">сигналов нет — всё идёт штатно</div>';
  }

  function zhurnalPanel() {
    $("rdZhurnal").innerHTML = INC.length ? INC.slice(0, 18).map((x, i) => {
      const t = D.ist.часы[x.s], ch = x.po - x.s + 1;
      const pik = x.k === "dvor" ? `пик: ждали ${chmm(x.pik.dl)}, в очереди ${num(x.pik.z)}` : `хуже всего ${x.pik.d != null ? Math.round(x.pik.d * 100) + "% нормы" : "—"}`;
      return `<div class="rdSig" data-inc="${i}" style="--c:${C[x.sev]}"><span>${ddmm(t)} ${t.slice(11, 16)} · ${ch} ч · ${x.sk}</span><b>${esc(x.imya)} ${x.k === "dvor" ? "— пробка" : "— просел темп"}</b><i>${esc(pik)}</i></div>`;
    }).join("") : '<div class="rdPusto">за три недели инцидентов не было</div>';
  }

  /* ── шкала времени ──────────────────────────────────────────────── */
  let shkala = null;
  function shkalaRis() {
    const box = $("rdShkalaHolst");
    const Wd = 1888 - 28, Hd = 236;
    box.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${Wd} ${Hd}`, preserveAspectRatio: "none" }, box);
    const x = (i) => (i + 0.5) * Wd / N;
    const yT = 8, yB = Hd - 46;
    const zD = ist("ДМД").ждут || [], zC = ist("ЧШК").ждут || [], nD = ist("ДМД").ждут_норма || [];
    const maks = Math.max(10, ...zD, ...zC, ...nD.filter((q) => q != null));
    const y = (q) => yB - (yB - yT) * q / maks;
    // ночь и границы суток
    D.ist.часы.forEach((t, i) => {
      const h = +t.slice(11, 13);
      if (h >= 22 || h < 6) el("rect", { x: i * Wd / N, y: yT, width: Wd / N + 0.5, height: yB - yT, fill: "#081118" }, svg);
      if (h === 0) {
        el("line", { x1: i * Wd / N, x2: i * Wd / N, y1: yT, y2: Hd - 14, stroke: "#173040", "stroke-width": 1 }, svg);
        const dn = new Date(t.slice(0, 10) + "T12:00:00");
        el("text", { x: i * Wd / N + 4, y: Hd - 3, fill: dn.getDay() % 6 === 0 ? "#46606f" : "#7fa0b2", "font-size": 11 }, svg,
          `${ddmm(t)} ${["вс", "пн", "вт", "ср", "чт", "пт", "сб"][dn.getDay()]}`);
      }
    });
    const lin = (a) => a.map((q, i) => (q == null ? null : `${x(i).toFixed(1)},${y(q).toFixed(1)}`)).filter(Boolean).join(" ");
    el("polygon", { points: `${x(0)},${yB} ${lin(zD)} ${x(N - 1)},${yB}`, fill: "#2ee6d6", "fill-opacity": 0.16 }, svg);
    el("polyline", { points: lin(zD), fill: "none", stroke: "#2ee6d6", "stroke-width": 1.4, "vector-effect": "non-scaling-stroke" }, svg);
    el("polyline", { points: lin(nD), fill: "none", stroke: "#7fa0b2", "stroke-width": 1, "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke" }, svg);
    el("polyline", { points: lin(zC), fill: "none", stroke: "#f2b33d", "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }, svg);
    // полосы критичности по складам
    SKLADY.forEach((sk, r) => {
      el("text", { x: 2, y: yB + 13 + r * 12, fill: "#46606f", "font-size": 9 }, svg, sk);
      for (let i = 0; i < N; i++) {
        const e = sostoyanie(sk, i);
        let s = "norma";
        for (const k of ["dvor", "priyomka", "razm"]) if (e[k].sev !== "net") s = huzhe(s, e[k].sev);
        if (VES[s] >= VES.vys) el("rect", { x: i * Wd / N, y: yB + 5 + r * 12, width: Wd / N + 0.4, height: 9, fill: C[s], "fill-opacity": s === "krit" ? 0.9 : 0.55 }, svg);
      }
    });
    el("text", { x: 4, y: yT + 10, fill: "#46606f", "font-size": 10 }, svg, `машин ждут ворот · макс ${maks}`);
    // курсор
    const kur = el("g", {}, svg);
    shkala = { svg, kur, x, Wd, Hd, yT, yB };
    kursor();
    const k2i = (ev) => { const r = box.getBoundingClientRect(); return Math.max(0, Math.min(N - 1, Math.floor((ev.clientX - r.left) / r.width * N))); };
    let tyanu = false;
    box.onmousedown = (ev) => { tyanu = true; vybrat(k2i(ev)); };
    window.onmousemove = (ev) => { if (tyanu) vybrat(k2i(ev)); };
    window.onmouseup = () => { tyanu = false; };
  }
  function kursor() {
    if (!shkala) return;
    const { kur, x, Hd } = shkala;
    kur.innerHTML = "";
    el("line", { x1: x(I), x2: x(I), y1: 0, y2: Hd - 16, stroke: I === N - 1 ? "#2ee6d6" : "#f2b33d", "stroke-width": 2, "vector-effect": "non-scaling-stroke" }, kur);
    el("rect", { x: x(I) - 5, y: 0, width: 10, height: 8, fill: I === N - 1 ? "#2ee6d6" : "#f2b33d" }, kur);
    const t = D.ist.часы[I];
    $("rdShkalaT").textContent = I === N - 1 ? `СЕЙЧАС · ${t.slice(11, 16)}` : `${ddmm(t)} · ${t.slice(11, 16)}`;
  }

  function vybrat(i) {
    i = Math.max(0, Math.min(N - 1, i));
    if (i === I && ST) return;
    I = i;
    zhivoy = I === N - 1;
    risovat();
  }

  /* ── карточка фокуса ────────────────────────────────────────────── */
  function otkryt(f) { fokus = f; fokusRis(); }
  function fokusRis() {
    const box = $("rdFokus");
    if (!fokus) { box.hidden = true; return; }
    const t = (gol, str) => `<table><thead><tr>${gol.map((q) => `<th>${q}</th>`).join("")}</tr></thead><tbody>${str.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    let sev = "sred", zag = "", h = "", p = "", tab = "";
    if (fokus.tip === "sklad" || fokus.tip === "etap") {
      const sk = fokus.sk, s = ST[sk], e = s.e;
      sev = fokus.tip === "etap" ? e[fokus.etap].sev : s.sev;
      zag = `ФОКУС · ${IMYA[sk]} · ${I === N - 1 ? "СЕЙЧАС" : `${ddmm(D.ist.часы[I])} ${D.ist.часы[I].slice(11, 16)}`}`;
      h = s.problem.length ? `Не в норме: ${s.problem.join(", ").toLowerCase()}` : "Все этапы в норме";
      tab = t(["этап", "сейчас", "против нормы"], ETAPY.map(([k, imya]) => [imya, esc(e[k].zn), `<span style="color:${C[e[k].sev]}">${esc(e[k].st)}</span>`]));
      const pr = e.priyomka, rz = e.razm;
      p = `Двор: ждут ворот ${num(e.dvor.z)} машин${e.dvor.pal ? `, ${num(e.dvor.pal)} паллет` : ""}, дольше всех ${chmm(e.dvor.dl)}`
        + `${e.dvor.nz != null ? `; обычно в это время ${num(e.dvor.nz)} машин` : ""}${e.dvor.dln != null ? `, дольше всех обычно ${chmm(e.dvor.dln)}` : ""}. Приёмка за 3 ч ${tys(pr.f3)} шт при норме ${tys(pr.n3)}, размещение ${tys(rz.f3)} при норме ${tys(rz.n3)}.`;
      // только в «сейчас»: ворота, машины, зоны, секторы
      if (I === N - 1) {
        if (sk === "ДМД" && D.dvor?.ворота_дмд) {
          const vv = D.dvor.ворота_дмд, mk = Math.max(1, ...vv.map((q) => q.машин_сегодня || 0));
          tab += `<p>Ворота ДМД за сегодня (ярче — больше машин):</p><div class="rdVorota">${vv.map((q) => `<i title="ворота ${esc(q.имя)} · ${esc(q.сектор)} · машин ${q.машин_сегодня}" style="background:rgba(46,230,214,${0.1 + 0.85 * (q.машин_сегодня || 0) / mk})"></i>`).join("")}</div>`;
        }
        if (sk === "ЧШК" && e.vhod.zony) {
          const vv = e.vhod.zony.filter((z) => /^Ворота/.test(z.imya)).sort((a, b) => a.imya.localeCompare(b.imya, "ru", { numeric: true }));
          tab += `<p>Ворота ЧШК — что стоит у ворот сейчас (жёлтый — товар не убран, красный — дольше 48 ч):</p><div class="rdVorota">${vv.map((z) => `<i title="${esc(z.imya)} · ${num(z.штук)} шт" style="background:${z.штук ? (z.ждут_больше_48ч ? C.krit : C.vys) : "#0e1d27"}"></i>`).join("")}</div>`;
        }
        const mash = (e.dvor.mash || []).filter((m) => m.этап !== "на разгрузке").slice(0, 10);
        if (mash.length) tab += t(["ждут ворот", "паллет", "ворота", "во дворе"], mash.map((m) => [esc(m.тип), num(m.паллет), esc(m.ворота || "—"), `<span style="color:${m.на_дворе_мин >= 240 ? C.krit : m.на_дворе_мин >= 120 ? C.vys : "#cfdce4"}">${chmm(m.на_дворе_мин)}</span>`]));
        if (e.vhod.zony) {
          const zz = e.vhod.zony.filter((z) => z.штук || z.ждут_больше_48ч).sort((a, b) => (b.ждут_больше_48ч - a.ждут_больше_48ч) || (b.штук - a.штук)).slice(0, 10);
          tab += t(["зона входа", "штук", "конт.", "> 48 ч", "дольше всех"], zz.map((z) => [esc(z.imya), num(z.штук), num(z.контейнеров), z.ждут_сотня ? "100+" : num(z.ждут_больше_48ч), z.ждут_макс_ч ? `${Math.round(z.ждут_макс_ч / 24)} дн` : "—"]));
        }
        if (e.hran.sektory) tab += t(["сектор", "занято хранения", "худшая зона"], e.hran.sektory.slice().sort((a, b) => b.процент_хранения - a.процент_хранения).slice(0, 8)
          .map((q) => [esc(q.сектор), `<span style="color:${q.процент_хранения > 92 ? C.krit : q.процент_хранения > 90 ? C.vys : "#cfdce4"}">${q.процент_хранения}%</span>`, `${esc(q.худшая_зона)} · ${q.худший_процент}%`]));
      } else {
        tab += "<p>Машины поимённо, ворота, зоны и секторы есть только в «сейчас» — в истории хранятся итоги по часам.</p>";
      }
    } else if (fokus.tip === "tekst") {
      sev = fokus.x.sev; zag = "ФОКУС"; h = esc(fokus.x.zag); p = esc(fokus.x.tekst);
    }
    box.style.setProperty("--c", C[sev]);
    box.innerHTML = `<div class="rdFokus__zag"><span>● ${zag}</span><button type="button" id="rdZakryt">✕</button></div><h2>${h}</h2>${p ? `<p>${p}</p>` : ""}${tab}`;
    box.hidden = false;
    $("rdZakryt").onclick = () => { fokus = null; fokusRis(); };
  }

  /* ── сборка ─────────────────────────────────────────────────────── */
  function risovat() {
    ST = poschitat();
    shapka(); obstanovka(); voronka(); karta(); signaly(); kursor();
    if (fokus) fokusRis();
  }
  function chasy() {
    const t = new Date();
    $("rdChasy").textContent = t.toTimeString().slice(0, 5);
    $("rdSmena").textContent = `${t.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} · смена ${t.getHours() >= 9 && t.getHours() < 21 ? "день" : "ночь"}`;
  }

  async function zagruzit() {
    const vzyat = (imya) => fetch(DATA + imya, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [ist_, dvor, zhivo, temp, tempCh, mon, svezh, tpl] = await Promise.all(["radar_istoriya.json", "dvor.json", "priyomka_zhivo.json",
      "priyomka_temp_zhivo.json", "priyomka_temp_zhivo_chshk.json", "priyomka.json", "svezhest.json", "3pl/gsm.json"].map(vzyat));
    if (!ist_) { $("rdRezhim").textContent = "нет истории радара"; return; }
    const bylN = N;
    D = { ist: ist_, dvor, zhivo, temp, tempCh, mon, svezh, tpl };
    N = ist_.часы.length;
    if (zhivoy || !bylN) I = N - 1;
    INC = zhurnal();
    zhurnalPanel();
    shkalaRis();
    risovat();
  }

  // события
  $("rdObst").addEventListener("click", (ev) => {
    const k = ev.target.closest("[data-etap]"); if (k) return otkryt({ tip: "etap", sk: k.dataset.sk, etap: k.dataset.etap });
    const s = ev.target.closest("[data-sk]"); if (s) otkryt({ tip: "sklad", sk: s.dataset.sk });
  });
  $("rdLenta").addEventListener("click", (ev) => { const r = ev.target.closest("[data-sig]"); if (!r) return; const x = SIG[+r.dataset.sig];
    otkryt(x.sk ? { tip: "etap", sk: x.sk, etap: x.k } : { tip: "tekst", x }); });
  $("rdZhurnal").addEventListener("click", (ev) => { const r = ev.target.closest("[data-inc]"); if (!r) return; const x = INC[+r.dataset.inc];
    stop(); vybrat(x.s + Math.floor((x.po - x.s) / 2)); otkryt({ tip: "etap", sk: x.sk, etap: x.k }); });
  const stop = () => { if (igraet) { clearInterval(igraet); igraet = null; $("rdPlay").textContent = "▶"; } };
  $("rdPlay").addEventListener("click", () => {
    if (igraet) return stop();
    if (I >= N - 1) vybrat(Math.max(0, N - 1 - 24 * 3));
    $("rdPlay").textContent = "❚❚";
    igraet = setInterval(() => { if (I >= N - 1) return stop(); vybrat(I + 1); }, 160);
  });
  $("rdSeychas").addEventListener("click", () => { stop(); vybrat(N - 1); });
  $("rdPolnyi").addEventListener("click", () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { fokus = null; fokusRis(); }
    else if (e.key === "ArrowLeft") { stop(); vybrat(I - (e.shiftKey ? 24 : 1)); }
    else if (e.key === "ArrowRight") { stop(); vybrat(I + (e.shiftKey ? 24 : 1)); }
    else if (e.key === "End") { stop(); vybrat(N - 1); }
    else if (e.key === " ") { e.preventDefault(); $("rdPlay").click(); }
  });
  addEventListener("resize", vpisat);
  vpisat(); chasy();
  setInterval(chasy, 10000);
  zagruzit();
  setInterval(zagruzit, 60000);
  setTimeout(() => location.reload(), 6 * 3600 * 1000);
})();
