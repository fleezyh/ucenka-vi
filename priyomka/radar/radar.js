/* Склад-радар · вход Москвы (13.10.2026).
 *
 * Степан: «экран слабый, а дашик слишком много инфы имеет — хочется прям ВСЁ видеть»; «карта нужна не ровно такая же,
 * а под наши метрики… сама карта конченная где это находится — надо красиво, стиль управления вооружённых сил,
 * палантир, но чтоб реально эта карта ебать че-то говорила, и можно было крутить историю».
 *
 * 13.10 утром: «мне не нравится такая абстрактная карта» — карта Подмосковья заменена планом складов сверху
 * (выбор Степана): ДМД по секторам — хранение, буферы, приёмка, ворота; ЧШК по сторонам и мезонину; двор; перевозки.
 * Ниже — как было на карте (осталось в смысле этапов и перевозок):
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

  /* ── план складов сверху ─────────────────────────────────────────
     13.10, Степан: «мне не нравится такая абстрактная карта» → схема складов сверху (выбрал сам).
     ДМД: секторы столбцами — сверху хранение (занятость мест), ниже буферы сектора (разноска, перемещения, адресные),
     ниже приёмка сектора (приёмка товара, столы, поступление, зоны ворот), внизу ворота сектора по номерам.
     Стрелки между ярусами — штук за 2 часа по участкам (приёмка, размещение) и сколько людей сейчас.
     Слева двор с машинами. ЧШК — свой план по сторонам А/Б/В и мезонину. Справа внизу — челнок и 3PL, куда уходит товар.
     В прошлом — зоны из почасовых снимков (с 13.10), хранение/люди/ворота/машины только в «сейчас». */
  const W = 1048, H = 690;
  const PORYADOK = ["0", "А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И"];
  const zonaPriem = (n) => /Приёмка товара|Столы приемки|ПОСТУПЛЕНИЕ|Ворота|Ошибки приемки|переназначения доверительной/i.test(n);
  const zonaBufer = (n) => /Разноска|Перемещени|Адресный буфер|Бункер|Вывоз столов/i.test(n);
  const vsSev = (n48, maks) => (maks >= 168 && n48 >= 5 ? "krit" : n48 ? "vys" : "norma");
  let ZONY_IST = null;            // radar_zony.json — грузим один раз, когда уходим в историю
  let zonyIstZagruzka = null;

  /** Зоны входа склада на выбранный час: в «сейчас» — живьём, в прошлом — снимок часа (если есть). */
  function zonyNa(sk) {
    if (I === N - 1) {
      const z = sk === "ДМД" ? D.zhivo?.зоны : D.zhivo?.чшк?.зоны;
      return z ? Object.entries(z).map(([imya, x]) => ({ imya, ...x })) : null;
    }
    const sn = ZONY_IST?.часы?.[D.ist.часы[I]]?.[sk];
    if (!sn) return null;
    return Object.entries(sn).map(([imya, [sht, n48]]) => ({ imya, штук: sht, ждут_больше_48ч: n48, ждут_макс_ч: 0, istoriya: true }));
  }
  function nuzhnyZonyIst() {
    if (ZONY_IST || zonyIstZagruzka || I === N - 1) return;
    zonyIstZagruzka = fetch(DATA + "radar_zony.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((d) => { ZONY_IST = d || { часы: {} }; risovat(); });
  }

  /** Зона ДМД → буква сектора: по монитору (зоны сектора), иначе по имени. */
  let ZONA_SEKTOR = null;
  function bukvaZony(imya) {
    if (!ZONA_SEKTOR) {
      ZONA_SEKTOR = {};
      (D.mon?.секторы || []).forEach((s) => { const b = (s.сектор.match(/Сектор (\S+) ДМД/) || [])[1]; if (b) (s.зоны || []).forEach((z) => { ZONA_SEKTOR[z.зона] = b; }); });
    }
    if (ZONA_SEKTOR[imya]) return ZONA_SEKTOR[imya];
    const m = imya.match(/\(([0-9А-ЯЁ])-\d+\)/) || imya.match(/товара ([0-9А-ЯЁ])\b/) || imya.match(/сектор[еа]?\s+([0-9А-ЯЁ])\b/i)
      || imya.match(/секторами (?:из )?([0-9А-ЯЁ])\b/) || imya.match(/\(([0-9А-ЯЁ])\)/) || imya.match(/ ([А-ЯЁ]) (?:мез|\(ДМД\)|Клиент)/);
    return m ? m[1] : null;
  }

  const sostZony = (zz) => {
    const sht = zz.reduce((a, z) => a + (z.штук || 0), 0), n48 = zz.reduce((a, z) => a + (z.ждут_больше_48ч || 0), 0);
    const maks = Math.max(0, ...zz.map((z) => z.ждут_макс_ч || 0));
    return { sht, n48, maks, sev: vsSev(n48, maks), zz };
  };

  function karta() {
    const box = $("rdKarta");
    box.innerHTML = "";
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}` }, box);
    const defs = el("defs", {}, svg);
    for (const [k, c] of Object.entries(C)) {
      const m = el("marker", { id: `rdStr_${k}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0 0 L10 5 L0 10 z", fill: c }, m);
    }
    const pat = el("pattern", { id: "rdSetka", width: 24, height: 24, patternUnits: "userSpaceOnUse" }, defs);
    el("path", { d: "M24 0H0V24", fill: "none", stroke: "#0a161e", "stroke-width": 1 }, pat);
    el("rect", { width: W, height: H, fill: "url(#rdSetka)" }, svg);
    nuzhnyZonyIst();
    planDmd(svg);
    planChshk(svg);
    planSvyazi(svg);
    if (I !== N - 1 && !ZONY_IST?.часы?.[D.ist.часы[I]]) {
      el("text", { x: W / 2, y: 22, fill: C.vys, "font-size": 12, "text-anchor": "middle", "letter-spacing": 1 }, svg,
        "в этот час снимка зон нет (снимки копятся с 13.10) — на плане только итоги по складу");
    }
  }

  const klikom = (g, f) => { g.style.cursor = "pointer"; g.addEventListener("click", (ev) => { ev.stopPropagation(); f(); }); };
  const pryam = (rod, x, y, w, h, atr = {}) => el("rect", { x, y, width: Math.max(0, w), height: Math.max(0, h), ...atr }, rod);
  const tekst = (rod, x, y, t, atr = {}) => el("text", { x, y, fill: "#b8c7d1", "font-size": 11, ...atr }, rod, t);
  const strelka = (rod, x1, y1, x2, y2, sht, c) => {
    if (!sht) return;
    const w = Math.max(1, Math.min(7, Math.sqrt(sht) / 9));
    el("line", { x1, y1, x2, y2, stroke: c, "stroke-width": w, "stroke-opacity": 0.85, "stroke-dasharray": "6 4", class: "rdPotok",
      style: `animation-duration:${Math.max(0.5, 2.6 - Math.log10(sht + 1) * 0.5)}s`, "marker-end": `url(#rdStr_${c === C.trans ? "trans" : "svoy"})` }, rod);
  };

  /** Двор: точки — машины, которые ждут ворот, цвет — сколько ждут против обычного. */
  function planDvor(rod, sk, x, y, w, h) {
    const s = ST[sk], e = s.e.dvor;
    const g = el("g", {}, rod);
    klikom(g, () => otkryt({ tip: "etap", sk, etap: "dvor" }));
    pryam(g, x, y, w, h, { fill: "#06111a", stroke: C[e.sev] === C.norma ? "#173040" : C[e.sev], "stroke-width": 1.2 });
    tekst(g, x + 8, y + 15, "ДВОР", { fill: "#7fa0b2", "font-size": 10.5, "letter-spacing": 2, "font-weight": 600 });
    tekst(g, x + 8, y + 47, e.z == null ? "—" : num(e.z), { fill: C[e.sev] === C.norma ? "#e8f6ff" : C[e.sev], "font-size": 26, "font-weight": 600 });
    tekst(g, x + 8, y + 64, "ждут ворот", { fill: "#7fa0b2", "font-size": 10 });
    if (e.nz != null) tekst(g, x + 8, y + 77, `обычно ${num(e.nz)}`, { fill: "#46606f", "font-size": 10 });
    const mash = I === N - 1 ? (e.mash || []).filter((m) => m.этап !== "на разгрузке") : [];
    const kol = Math.max(1, Math.floor((w - 16) / 11));
    mash.slice(0, kol * Math.floor((h - 106) / 11)).forEach((m, i) => {
      const sev = sevDvor(1, null, m.на_дворе_мин, e.dln);
      pryam(g, x + 8 + (i % kol) * 11, y + 86 + Math.floor(i / kol) * 11, 8, 8, { fill: C[sev === "norma" ? "svoy" : sev], "fill-opacity": 0.85 });
    });
    if (!mash.length && I !== N - 1) tekst(g, x + 8, y + 96, e.dl ? `дольше всех ${chmm(e.dl)}` : "", { fill: "#7fa0b2", "font-size": 10 });
    tekst(g, x + 8, y + h - 8, `дольше всех ${chmm(e.dl)}`, { fill: C[e.sev] === C.norma ? "#7fa0b2" : C[e.sev], "font-size": 10.5 });
  }

  function planDmd(svg) {
    const sk = "ДМД", s = ST[sk];
    const X0 = 8, Y0 = 34, HB = 400;
    const g = el("g", {}, svg);
    tekst(g, X0, 20, "ДОМОДЕДОВО · ВХОД ОТ ВОРОТ ДО ЯЧЕЙКИ", { fill: "#e8f6ff", "font-size": 14, "font-weight": 600, "letter-spacing": 2 });
    tekst(g, W - 8, 20, s.problem.length ? `${SLOVO[s.sev]} · ${s.problem.join(", ").toLowerCase()}` : "штатно", { fill: C[s.sev], "font-size": 12, "letter-spacing": 1, "text-anchor": "end" });
    planDvor(g, sk, X0, Y0, 112, HB);

    const zony = zonyNa(sk);
    const sek = (D.mon?.секторы || []).filter((x) => /Сектор .* ДМД$/.test(x.сектор)).map((x) => ({ ...x, b: (x.сектор.match(/Сектор (\S+) ДМД/) || [])[1] }))
      .filter((x) => PORYADOK.includes(x.b)).sort((a, b) => PORYADOK.indexOf(a.b) - PORYADOK.indexOf(b.b));
    const uch = (u_, b) => (D.mon?.участки?.строки || []).find((r) => r.участок === u_ && (r.сектор.match(/Сектор (\S+) ДМД/) || [])[1] === b);
    const vorota = D.dvor?.ворота_дмд || [];
    const naVorotah = new Set((s.e.dvor.mash || []).filter((m) => m.этап === "на разгрузке" && m.ворота).map((m) => String(m.ворота).replace(/\D/g, "")));
    const maksMash = Math.max(1, ...vorota.map((v_) => v_.машин_сегодня || 0));

    // зоны без сектора (возвраты, ФБ, ошибки приёмки) — отдельным столбцом справа
    const bezSek = zony ? zony.filter((z) => !PORYADOK.includes(bukvaZony(z.imya))) : [];
    const XS = X0 + 122, WS = W - XS - 96;
    const kor = sek.map((x) => Math.sqrt(x.мест_хранения || 1)), kMax = Math.max(1, ...kor);
    const ves = kor.map((k) => 0.55 + 0.45 * k / kMax);
    const vsego = ves.reduce((a, b) => a + b, 0) || 1;
    // корпус здания
    pryam(g, XS - 4, Y0, WS + 8 + 92, HB, { fill: "#050d13", stroke: "#1f4256", "stroke-width": 1.5 });
    let x = XS;
    const ya = { hr: Y0 + 8, hrH: 120, buf: Y0 + 160, bufH: 70, pr: Y0 + 262, prH: 70, vor: Y0 + HB - 30 };
    tekst(g, XS - 2, ya.hr - 1 + 132, "", {});
    sek.forEach((sx, i) => {
      const w = WS * ves[i] / vsego - 4, b = sx.b;
      const col = el("g", {}, g);
      klikom(col, () => otkryt({ tip: "sektor", b }));
      // хранение
      const p = sx.процент_хранения || 0;
      const cvH = I === N - 1 ? (p > 92 ? C.krit : p > 90 ? C.vys : p < 80 ? C.trans : C.svoy) : C.net;
      pryam(col, x, ya.hr, w, ya.hrH, { fill: "#071621", stroke: "#173040" });
      pryam(col, x, ya.hr + ya.hrH * (1 - p / 100), w, ya.hrH * p / 100, { fill: cvH, "fill-opacity": I === N - 1 ? 0.35 : 0.12 });
      tekst(col, x + w / 2, ya.hr + 26, b, { fill: "#e8f6ff", "font-size": 22, "font-weight": 600, "text-anchor": "middle" });
      tekst(col, x + w / 2, ya.hr + 48, I === N - 1 ? `${Math.round(p)}%` : "—", { fill: cvH, "font-size": 12.5, "font-weight": 600, "text-anchor": "middle" });
      if (w > 60) tekst(col, x + w / 2, ya.hr + 60, `${tys(sx.мест_хранения)} мест`, { fill: "#46606f", "font-size": 9.5, "text-anchor": "middle" });
      // буферы и приёмка сектора
      const zsk = zony ? zony.filter((z) => bukvaZony(z.imya) === b) : [];
      const yarus = (yy, hh, zz, podpis) => {
        const st = zony ? sostZony(zz) : null;
        const c = st ? C[st.sev === "norma" ? "svoy" : st.sev] : C.net;
        pryam(col, x, yy, w, hh, { fill: st && st.sev !== "norma" ? `${C[st.sev]}22` : "#08141c", stroke: st && st.sev !== "norma" ? C[st.sev] : "#173040" });
        if (w > 64) tekst(col, x + 5, yy + 12, podpis, { fill: "#46606f", "font-size": 9, "letter-spacing": 1 });
        tekst(col, x + 4, yy + 33, st ? tys(st.sht) : "—", { fill: st ? "#e8f6ff" : "#46606f", "font-size": w > 70 ? 15 : 11, "font-weight": 600 });
        if (st?.n48) tekst(col, x + 4, yy + 49, w > 64 ? `${num(st.n48)} > 48ч` : `${num(st.n48)}!`, { fill: c, "font-size": 10, "font-weight": 600 });
        if (st?.maks >= 48 && w > 70) tekst(col, x + 5, yy + 62, `до ${Math.round(st.maks / 24)} дн`, { fill: c, "font-size": 9.5 });
      };
      yarus(ya.buf, ya.bufH, zsk.filter((z) => zonaBufer(z.imya)), "БУФЕРЫ");
      yarus(ya.pr, ya.prH, zsk.filter((z) => zonaPriem(z.imya)), "ПРИЁМКА");
      // потоки по участкам (DWH, ~раз в час): приёмка — ворота → приёмка, размещение — приёмка → хранение
      if (I === N - 1) {
        const pu = uch("приёмка", b), ru = uch("размещение", b);
        strelka(col, x + w / 2, ya.vor - 4, x + w / 2, ya.pr + ya.prH + 4, pu?.штук_2ч, C.svoy);
        strelka(col, x + w / 2, ya.buf - 2, x + w / 2, ya.hr + ya.hrH + 4, ru?.штук_2ч, C.svoy);
        if (pu?.людей_сейчас) tekst(col, x + w / 2 + 5, ya.pr + ya.prH + 17, `${pu.людей_сейчас} чел`, { fill: "#7fa0b2", "font-size": 9.5 });
        if (ru?.людей_сейчас) tekst(col, x + w / 2 + 5, ya.hr + ya.hrH + 20, `${ru.людей_сейчас} чел`, { fill: "#7fa0b2", "font-size": 9.5 });
      }
      // ворота сектора
      const vv = vorota.filter((v_) => (v_.сектор.match(/Сектор (\S+) ДМД/) || [])[1] === b).sort((a, c2) => a.номер - c2.номер);
      const wv = vv.length ? Math.max(2, (w - 2) / vv.length - 1.5) : 0;
      vv.forEach((v_, j) => {
        const sejchas = I === N - 1 && naVorotah.has(String(v_.номер));
        const c = sejchas ? C.trans : I === N - 1 && v_.машин_сегодня ? `rgba(46,230,214,${0.15 + 0.7 * v_.машин_сегодня / maksMash})` : "#0e1d27";
        const gr = el("g", {}, col);
        pryam(gr, x + 1 + j * (wv + 1.5), ya.vor, wv, 18, { fill: c });
        el("title", {}, gr, `ворота ${v_.имя} · машин сегодня ${v_.машин_сегодня}, паллет ${v_.паллет_сегодня}${sejchas ? " · сейчас разгружается" : ""}`);
      });
      if (vv.length) tekst(col, x + 1, ya.vor + 30, `${vv[0].номер}–${vv[vv.length - 1].номер}`, { fill: "#46606f", "font-size": 9 });
      x += w + 4;
    });
    // столбец без сектора: возвраты, ФБ, ошибки
    const xr = XS + WS + 6, wr = 86;
    const gr = el("g", {}, g);
    klikom(gr, () => otkryt({ tip: "zony", sk, nabor: "bez" }));
    const st = zony ? sostZony(bezSek) : null;
    pryam(gr, xr, ya.buf, wr, ya.pr + ya.prH - ya.buf, { fill: "#08141c", stroke: st && st.sev !== "norma" ? C[st.sev] : "#173040" });
    tekst(gr, xr + 6, ya.buf + 14, "ВОЗВРАТЫ, ФБ,", { fill: "#46606f", "font-size": 8.5 });
    tekst(gr, xr + 6, ya.buf + 26, "ОШИБКИ", { fill: "#46606f", "font-size": 8.5 });
    tekst(gr, xr + 6, ya.buf + 50, st ? tys(st.sht) : "—", { fill: "#e8f6ff", "font-size": 15, "font-weight": 600 });
    if (st?.n48) tekst(gr, xr + 6, ya.buf + 66, `${num(st.n48)} > 48ч`, { fill: C[st.sev], "font-size": 10, "font-weight": 600 });
    tekst(gr, XS, ya.vor + 44 > Y0 + HB ? Y0 + HB - 2 : ya.vor + 44, "", {});
    tekst(g, XS, ya.hr + ya.hrH + 16, "", {});
    // подписи ярусов слева от корпуса
  }

  /** ЧШК: стороны А/Б/В — разгрузка, поступление, приёмка, размещение; мезонин по этажам; фронты; прочее. */
  function planChshk(svg) {
    const sk = "ЧШК", s = ST[sk];
    const X0 = 8, Y0 = 474, HB = 208;
    const g = el("g", {}, svg);
    tekst(g, X0, Y0 - 10, "ЧАШНИКОВО · ВХОД", { fill: "#e8f6ff", "font-size": 14, "font-weight": 600, "letter-spacing": 2 });
    tekst(g, 650, Y0 - 10, s.problem.length ? `${SLOVO[s.sev]} · ${s.problem.join(", ").toLowerCase()}` : "штатно", { fill: C[s.sev], "font-size": 12, "letter-spacing": 1, "text-anchor": "end" });
    planDvor(g, sk, X0, Y0, 112, HB);
    const zony = zonyNa(sk);
    const XS = X0 + 122, WS = 520;
    pryam(g, XS - 4, Y0, WS + 8, HB, { fill: "#050d13", stroke: "#1f4256", "stroke-width": 1.5 });
    const kto = (rx) => (zony || []).filter((z) => rx.test(z.imya));
    const stolbcy = [["А", /\bА\b|\(А\)|\(А-|Приемка А/], ["Б", /\bБ\b|\(Б\)|\(Б-/], ["В", /\bВ\b|\(В\)/]];
    const ryady = [["РАЗГРУЗКА", /Ворота|РАЗГРУЗКА/], ["ПОСТУПЛЕНИЕ", /ПОСТУПЛЕНИЕ/], ["ПРИЁМКА", /Приёмка товара|Столы приемки|Излишки/], ["РАЗМЕЩЕНИЕ", /РАЗМЕЩЕНИЕ/]];
    const wc = 92, hc = 44;
    ryady.forEach(([imyaR, rxR], r) => {
      tekst(g, XS + 2, Y0 + 14 + r * (hc + 4) + hc / 2 + 4, imyaR, { fill: "#2b4352", "font-size": 9, "letter-spacing": 1 });
      stolbcy.forEach(([b, rxB], c) => {
        const zz = kto(rxR).filter((z) => rxB.test(z.imya) && !/мез|Фронты|фронты/.test(z.imya));
        const x = XS + 84 + c * (wc + 4), y = Y0 + 8 + r * (hc + 4);
        const st = zony ? sostZony(zz) : null;
        const gg = el("g", {}, g);
        if (zz.length) klikom(gg, () => otkryt({ tip: "zony", sk, spisok: zz.map((z) => z.imya), zag: `${imyaR} ${b}` }));
        pryam(gg, x, y, wc, hc, { fill: st && st.sev !== "norma" ? `${C[st.sev]}22` : zz.length ? "#08141c" : "#050b10", stroke: st && st.sev !== "norma" ? C[st.sev] : "#173040" });
        tekst(gg, x + 5, y + 12, `${b}`, { fill: "#46606f", "font-size": 9, "font-weight": 600 });
        if (zz.length) {
          tekst(gg, x + 22, y + 13, st ? tys(st.sht) : "—", { fill: "#e8f6ff", "font-size": 13, "font-weight": 600 });
          if (st?.n48) tekst(gg, x + 5, y + 28, `${num(st.n48)} конт. > 48ч`, { fill: C[st.sev], "font-size": 9.5, "font-weight": 600 });
          if (r === 0 && /Ворота/.test(zz.map((z) => z.imya).join())) {
            const vv = zz.filter((z) => /Ворота/.test(z.imya)).sort((a, b2) => a.imya.localeCompare(b2.imya, "ru", { numeric: true }));
            const wv = (wc - 8) / Math.max(1, vv.length) - 1;
            vv.forEach((z, j) => { const gr = el("g", {}, gg); pryam(gr, x + 4 + j * (wv + 1), y + hc - 9, wv, 6, { fill: z.штук ? (z.ждут_больше_48ч ? C.krit : C.vys) : "#0e1d27" });
              el("title", {}, gr, `${z.imya} · ${num(z.штук)} шт у ворот`); });
          }
        }
      });
    });
    // мезонин Б — по этажам
    const xm = XS + 84 + 3 * (wc + 4) + 6, wm = 136;
    tekst(g, xm, Y0 + 14, "МЕЗОНИН Б", { fill: "#2b4352", "font-size": 9, "letter-spacing": 1 });
    [4, 3, 2, 1].forEach((et, k) => {
      const zz = kto(new RegExp(`${et} эт Б мез`));
      const st = zony ? sostZony(zz) : null;
      const y = Y0 + 20 + k * 34;
      const gg = el("g", {}, g);
      if (zz.length) klikom(gg, () => otkryt({ tip: "zony", sk, spisok: zz.map((z) => z.imya), zag: `Мезонин Б, ${et} этаж` }));
      pryam(gg, xm, y, wm, 30, { fill: st && st.sev !== "norma" ? `${C[st.sev]}22` : "#08141c", stroke: st && st.sev !== "norma" ? C[st.sev] : "#173040" });
      tekst(gg, xm + 5, y + 19, `${et} эт`, { fill: "#46606f", "font-size": 9.5 });
      tekst(gg, xm + 30, y + 19, st ? tys(st.sht) : "—", { fill: "#e8f6ff", "font-size": 13, "font-weight": 600 });
      if (st?.n48) tekst(gg, xm + wm - 4, y + 19, `${num(st.n48)}>48ч`, { fill: C[st.sev], "font-size": 9.5, "font-weight": 600, "text-anchor": "end" });
    });
    const prochie = (zony || []).filter((z) => /Фронты|фронты|Входящий буфер|Сортировка|Буфер приемки на ФБ/.test(z.imya));
    const st = zony ? sostZony(prochie) : null;
    const gg = el("g", {}, g);
    klikom(gg, () => otkryt({ tip: "zony", sk, spisok: prochie.map((z) => z.imya), zag: "Фронты, входящие буферы, сортировка, ФБ" }));
    pryam(gg, xm, Y0 + 158, wm, 42, { fill: "#08141c", stroke: st && st.sev !== "norma" ? C[st.sev] : "#173040" });
    tekst(gg, xm + 5, Y0 + 171, "ФРОНТЫ, БУФЕРЫ, ФБ", { fill: "#46606f", "font-size": 8.5 });
    tekst(gg, xm + 5, Y0 + 192, st ? tys(st.sht) : "—", { fill: "#e8f6ff", "font-size": 13, "font-weight": 600 });
    if (st?.n48) tekst(gg, xm + wm - 4, Y0 + 192, `${num(st.n48)}>48ч`, { fill: C[st.sev], "font-size": 9.5, "font-weight": 600, "text-anchor": "end" });
  }

  /** Связи: челнок ДМД ⇄ ЧШК, 3PL → ДМД, куда уходит товар — за сутки выбранного часа. */
  function planSvyazi(svg) {
    const pv = D.ist?.перевозки;
    const x0 = 680, y0 = 452, w = W - x0 - 8, h = H - y0 - 8;
    const g = el("g", {}, svg);
    pryam(g, x0, y0, w, h, { fill: "#050d13", stroke: "#173040" });
    if (!pv) return;
    let den = D.ist.часы[I].slice(0, 10), j = pv.дни.indexOf(den);
    const za = (jj) => Object.values(pv.пары).concat(Object.values(pv.регионы)).reduce((a, arr) => a + (arr[jj] || 0), 0);
    if (j > 0 && za(j) < 1000) { j -= 1; den = pv.дни[j]; }
    if (j < 0) return;
    tekst(g, x0 + 10, y0 + 16, `ПЕРЕВОЗКИ ЗА ${ddmm(den)} · ШТ`, { fill: "#7fa0b2", "font-size": 10, "letter-spacing": 1.5, "font-weight": 600 });
    const dc = pv.пары["ДМД>ЧШК"]?.[j] || 0, cd = pv.пары["ЧШК>ДМД"]?.[j] || 0, td = pv.пары["3PL>ДМД"]?.[j] || 0;
    const ryad = (y, t, v_, c) => { tekst(g, x0 + 10, y, t, { fill: c, "font-size": 12, "font-weight": 600 }); tekst(g, x0 + w - 10, y, tys(v_), { fill: "#e8f6ff", "font-size": 13, "font-weight": 600, "text-anchor": "end" }); };
    ryad(y0 + 38, "ДМД → ЧШК", dc, C.trans);
    ryad(y0 + 56, "ЧШК → ДМД", cd, C.trans);
    ryad(y0 + 74, "3PL Чехов → ДМД", td, C.trans);
    const vse = Object.entries(pv.регионы).map(([k, a]) => { const [ot, kuda] = k.split(">"); return { ot, kuda, sht: a[j] || 0 }; }).filter((q) => q.sht);
    const po = {};
    vse.forEach((q) => { po[q.kuda] = (po[q.kuda] || 0) + q.sht; });
    const top = Object.entries(po).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const maks = Math.max(1, ...top.map((q) => q[1]));
    tekst(g, x0 + 10, y0 + 98, "КУДА УШЛО (ДМД + ЧШК)", { fill: "#46606f", "font-size": 9.5, "letter-spacing": 1 });
    top.forEach(([kuda, v_], i) => {
      const y = y0 + 112 + i * 14;
      tekst(g, x0 + 10, y + 8, kuda === "МСК" ? "магазины МСК" : kuda, { fill: "#b8c7d1", "font-size": 10.5 });
      pryam(g, x0 + 100, y, (w - 170) * v_ / maks, 8, { fill: C.svoy, "fill-opacity": 0.55 });
      tekst(g, x0 + w - 10, y + 8, tys(v_), { fill: "#e8f6ff", "font-size": 10.5, "text-anchor": "end" });
    });
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
    } else if (fokus.tip === "sektor") {
      const b = fokus.b, sx = (D.mon?.секторы || []).find((q) => (q.сектор.match(/Сектор (\S+) ДМД/) || [])[1] === b);
      const zz = (zonyNa("ДМД") || []).filter((z) => bukvaZony(z.imya) === b && (z.штук || z.ждут_больше_48ч)).sort((x, y) => (y.ждут_больше_48ч - x.ждут_больше_48ч) || (y.штук - x.штук));
      const st = sostZony(zz);
      sev = st.sev === "norma" ? "sred" : st.sev;
      zag = `ФОКУС · ДМД · СЕКТОР ${b}`;
      h = `Сектор ${b}: на входе ${tys(st.sht)} шт${st.n48 ? `, ${num(st.n48)} конт. висят > 48 ч` : ""}`;
      const uch = (u_) => (D.mon?.участки?.строки || []).find((r) => r.участок === u_ && (r.сектор.match(/Сектор (\S+) ДМД/) || [])[1] === b);
      const pu = uch("приёмка"), ru = uch("размещение");
      p = sx ? `Хранение занято на ${sx.процент_хранения}% (${tys(sx.занято_хранения)} из ${tys(sx.мест_хранения)} мест), худшая зона — ${esc(sx.худшая_зона)} ${sx.худший_процент}%. `
        + `Приёмка: ${pu ? `${tys(pu.штук_2ч)} шт за 2 ч, людей сейчас ${num(pu.людей_сейчас)}, за сутки ${tys(pu.штук_24)}` : "—"}. `
        + `Размещение: ${ru ? `${tys(ru.штук_2ч)} шт за 2 ч, людей ${num(ru.людей_сейчас)}, за сутки ${tys(ru.штук_24)}` : "—"} (DWH, ${esc(D.mon?.участки?.край || "")}).` : "";
      tab = t(["зона", "штук", "конт.", "> 48 ч", "дольше всех"], zz.slice(0, 14).map((z) => [esc(z.imya), num(z.штук), num(z.контейнеров), z.ждут_сотня ? "100+" : num(z.ждут_больше_48ч), z.ждут_макс_ч ? `${Math.round(z.ждут_макс_ч / 24)} дн` : "—"]));
      const dolgie = zz.flatMap((z) => (z.дольше_всех || []).map((c) => ({ ...c, zona: z.imya }))).sort((x, y) => y.часов - x.часов).slice(0, 8);
      if (dolgie.length) tab += t(["висит дольше всех · контейнер", "откуда → куда", "ждёт", "штук"], dolgie.map((c) => [esc(c.контейнер), `${esc(c.откуда)} → ${esc(c.куда)}`, `${Math.round(c.часов / 24)} дн ${Math.round(c.часов % 24)} ч`, num(c.штук)]));
      const vv = (D.dvor?.ворота_дмд || []).filter((v_) => (v_.сектор.match(/Сектор (\S+) ДМД/) || [])[1] === b);
      if (I === N - 1 && vv.length) tab += t(["ворота", "машин сегодня", "паллет сегодня", "за 14 дней"], vv.map((v_) => [esc(v_.имя), num(v_.машин_сегодня), num(v_.паллет_сегодня), num(v_.машин_14д)]));
    } else if (fokus.tip === "zony") {
      const vse = zonyNa(fokus.sk) || [];
      const zz = (fokus.spisok ? vse.filter((z) => fokus.spisok.includes(z.imya)) : vse.filter((z) => !PORYADOK.includes(bukvaZony(z.imya))))
        .sort((x, y) => (y.ждут_больше_48ч - x.ждут_больше_48ч) || (y.штук - x.штук));
      const st = sostZony(zz);
      sev = st.sev === "norma" ? "sred" : st.sev;
      zag = `ФОКУС · ${IMYA[fokus.sk]} · ${esc(fokus.zag || "ВОЗВРАТЫ, ФБ, ОШИБКИ ПРИЁМКИ")}`.toUpperCase();
      h = `${tys(st.sht)} шт${st.n48 ? ` · ${num(st.n48)} конт. висят > 48 ч` : ""}${st.maks ? ` · дольше всех ${Math.round(st.maks / 24)} дн` : ""}`;
      p = I === N - 1 ? "Живьём из ВМС, раз в 5 минут. Отчёт «контроль перемещений» отдаёт до сотни самых долгих контейнеров на зону." : "Снимок часа: штуки и сколько контейнеров висело > 48 ч.";
      tab = t(["зона", "штук", "конт.", "> 48 ч", "дольше всех"], zz.slice(0, 16).map((z) => [esc(z.imya), num(z.штук), num(z.контейнеров), z.ждут_сотня ? "100+" : num(z.ждут_больше_48ч), z.ждут_макс_ч ? `${Math.round(z.ждут_макс_ч / 24)} дн` : "—"]));
      const dolgie = zz.flatMap((z) => (z.дольше_всех || []).map((c) => ({ ...c }))).sort((x, y) => y.часов - x.часов).slice(0, 10);
      if (dolgie.length) tab += t(["висит дольше всех · контейнер", "откуда → куда", "ждёт", "штук"], dolgie.map((c) => [esc(c.контейнер), `${esc(c.откуда)} → ${esc(c.куда)}`, `${Math.round(c.часов / 24)} дн ${Math.round(c.часов % 24)} ч`, num(c.штук)]));
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
    ZONA_SEKTOR = null;
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
