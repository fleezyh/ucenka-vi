/* Экран обстановки склада — карта Домодедова сверху.
 *
 * Не инфографика, а сам склад: двор с КПП и стоянкой, дорога вокруг здания,
 * длинное здание с секторами отсеками, стена приёмки с воротами по номерам.
 * Обстановку видно по движению и цвету:
 *   — машины на стоянке стоят плитками, цвет — сколько ждут;
 *   — точки едут от КПП на стоянку, со стоянки к своим воротам и на выезд —
 *     в темпе последнего часа, час ужат в минуту;
 *   — у занятых ворот стоят машины, от них внутрь бежит товар в полосу
 *     приёмки, из неё — в хранение; если приёмка забита, полоса краснеет,
 *     а в хранение уходит тонкая струйка.
 *
 * Раскладка честная, из WMS: ворота пронумерованы подряд вдоль здания и
 * привязаны к секторам по порядку (0 → 18–19, А → 21–31, … И → 108–112).
 * Сторона здания и место КПП — схематично.
 *
 * Данные: data/dvor.json (раз в 10 минут) и data/priyomka.json (раз в час).
 * Экран перечитывает их каждую минуту, раз в шесть часов перезагружается.
 * Параметр ?chas=14 показывает темп потока за 14:00 — для разбора пика. */
(() => {
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const DATA = "../../data/";
  const CHAS_IZ_ADRESA = new URLSearchParams(location.search).get("chas");

  const CVET = { krasnyy: "#f05d72", zhyoltyy: "#e3a93f", zelyonyy: "#2fc97c", siniy: "#4d8df7", seryy: "#46525f" };
  const PO_RUSSKI = { "красный": "krasnyy", "жёлтый": "zhyoltyy", "зелёный": "zelyonyy", "недогруз": "siniy" };
  const PORYADOK = ["0", "А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К"];

  const num = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const chmm = (minut) => {
    const m = Math.max(0, Math.round(Number(minut) || 0));
    return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`;
  };
  const tys = (v) => {
    const x = Number(v) || 0;
    return x >= 10000 ? `${Math.round(x / 1000)} тыс` : x >= 1000 ? `${(x / 1000).toFixed(1).replace(".", ",")} тыс` : num(x);
  };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (tag, atr = {}, roditel = null, tekst = null) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(atr)) n.setAttribute(k, v);
    if (tekst !== null) n.textContent = tekst;
    if (roditel) roditel.appendChild(n);
    return n;
  };
  const bukva = (imya) => (String(imya || "").match(/Сектор\s+(\S+)/) || [])[1] || null;
  const cvetOzhidaniya = (m) => (m >= 240 ? "krasnyy" : m >= 120 ? "zhyoltyy" : "zelyonyy");

  /* ── геометрия карты (координаты viewBox) ────────────────────────── */
  const W = 1760, H = 720;
  const ZD = { x0: 540, x1: 1692, y0: 196, y1: 540 };              // здание
  const DOR = { levo: 500, pravo: 1726, verh: 160, niz: 618 };      // кольцо вокруг
  const KPP = { x: 108, vhod: 118, vyhod: 86 };                      // две полосы у шлагбаума
  const ST = { x0: 132, y0: 34, kol: 12, ryad: 6, dx: 28, dy: 32 }; // стоянка
  const POLOSA = { y0: ZD.y1 - 66, y1: ZD.y1 - 6 };                 // полоса приёмки
  const BAK = { y0: ZD.y0 + 66, y1: ZD.y1 - 82 };                   // хранение

  let dvor = null;
  let priyomka = null;
  let versiya = "";
  let scena = null;
  const chastitsy = [];

  /* ── сборка неподвижной части карты ──────────────────────────────── */
  function postroitKartu() {
    const dmd = (dvor?.склады || []).find((s) => s.склад === "ДМД") || { машины: [], поток: [] };
    const vorota = dvor?.ворота_дмд || [];

    // Секторы: отсек на каждый сектор ДМД с местами хранения, в порядке
    // номеров ворот. Ширина — по корню из числа мест, чтобы маленькие
    // секторы не превращались в щель.
    const sektory = (priyomka?.секторы || [])
      .map((s) => ({ ...s, b: bukva(s.сектор) }))
      .filter((s) => /ДМД$/.test(s.сектор) && PORYADOK.includes(s.b) && (s.мест_хранения || 0) > 0)
      .sort((a, b) => PORYADOK.indexOf(a.b) - PORYADOK.indexOf(b.b));
    const ves = sektory.map((s) => Math.max(0.6, Math.sqrt(s.мест_хранения)));
    const vsegoVes = ves.reduce((a, b) => a + b, 0) || 1;
    const vnutri = ZD.x1 - ZD.x0 - 16;
    let x = ZD.x0 + 8;
    const otseki = sektory.map((s, i) => {
      const w = vnutri * ves[i] / vsegoVes;
      const o = { s, b: s.b, x0: x, x1: x + w };
      x += w;
      return o;
    });
    const otsekPoBukve = new Map(otseki.map((o) => [o.b, o]));

    // Приёмка по секторам: сколько лежит, сколько дольше 48 часов, сколько
    // пришло за сутки. Висяки — доля старше недели.
    const priem = new Map();
    for (const z of priyomka?.возраст?.зоны || []) {
      const b = bukva(z.сектор);
      if (!b) continue;
      const k = z.корзины || {};
      const p = priem.get(b) || { shtuk: 0, staroe: 0, izvestno: 0, svezh: 0 };
      p.shtuk += z.штук || 0;
      p.staroe += k["3. больше 48 ч"] || 0;
      p.izvestno += (z.штук || 0) - (k["4. движения не найдено"] || 0);
      p.svezh += k["1. до 24 ч"] || 0;
      priem.set(b, p);
    }
    const maxPriem = Math.max(1, ...[...priem.values()].map((p) => p.shtuk));
    const maxSvezh = Math.max(1, ...[...priem.values()].map((p) => p.svezh));

    // Ворота вдоль стены: внутри своего отсека, по порядку номеров.
    const vorotaX = new Map();
    const poOtseku = new Map();
    for (const v of vorota) {
      const b = bukva(v.сектор);
      if (!otsekPoBukve.has(b)) continue;
      if (!poOtseku.has(b)) poOtseku.set(b, []);
      poOtseku.get(b).push(v);
    }
    for (const [b, spisok] of poOtseku) {
      const o = otsekPoBukve.get(b);
      spisok.sort((a, c) => (a.номер || 0) - (c.номер || 0));
      spisok.forEach((v, i) => vorotaX.set(v.id, { x: o.x0 + (o.x1 - o.x0) * (i + 1) / (spisok.length + 1), v, b }));
    }

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet" });
    el("defs", {}, svg).innerHTML = `
      <pattern id="ekSetka" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="#0f1822" stroke-width="1"/>
      </pattern>
      <radialGradient id="ekPyatno"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    const fon = el("g", {}, svg);
    const zdanie = el("g", {}, svg);
    const mashinySloi = el("g", {}, svg);
    const tovarSloi = el("g", {}, svg);
    const dvizhenie = el("g", {}, svg);
    const tekst = el("g", {}, svg);

    // Территория и дороги.
    el("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#ekSetka)" }, fon);
    el("rect", { x: 18, y: 16, width: W - 36, height: H - 60, rx: 18, fill: "#080e15", stroke: "#152233", "stroke-width": 2 }, fon);
    const doroga = (d) => {
      el("path", { d, fill: "none", stroke: "#111b27", "stroke-width": 30, "stroke-linejoin": "round", "stroke-linecap": "round" }, fon);
      el("path", { d, fill: "none", stroke: "#233246", "stroke-width": 1.5, "stroke-dasharray": "10 12", class: "ekRazmetka" }, fon);
    };
    doroga(`M${DOR.levo},${DOR.verh} H${DOR.pravo} V${DOR.niz} H${DOR.levo} Z`);
    doroga(`M-20,${KPP.vhod} H${ST.x0 - 16} M-20,${KPP.vyhod} H${ST.x0 - 16}`);
    doroga(`M${ST.x0 + ST.kol * ST.dx + 4},${DOR.verh + 40} H${DOR.levo}`);
    // Стрелки направления по кольцу — движение по часовой стрелке.
    const strelka = (x0, y0, ugol) => el("path", { d: "M-7,-6 L7,0 L-7,6 Z", fill: "#2b3c54",
      transform: `translate(${x0},${y0}) rotate(${ugol})` }, fon);
    for (const xx of [800, 1100, 1400]) { strelka(xx, DOR.niz, 0); strelka(xx, DOR.verh, 180); }
    strelka(DOR.pravo, 390, -90);
    strelka(DOR.levo, 390, 90);

    // КПП и стоянка.
    el("rect", { x: KPP.x - 3, y: KPP.vyhod - 16, width: 6, height: KPP.vhod - KPP.vyhod + 32, rx: 2, fill: "#e3a93f" }, fon);
    el("text", { x: KPP.x, y: KPP.vyhod - 26, "text-anchor": "middle", fill: "#8f9cad", "font-size": 15, "font-weight": 700 }, tekst, "КПП");
    el("rect", { x: ST.x0 - 10, y: ST.y0 - 12, width: ST.kol * ST.dx + 20, height: ST.ryad * ST.dy + 18, rx: 10,
      fill: "#0a121b", stroke: "#1b2a3c", "stroke-dasharray": "6 6" }, fon);
    for (let r = 0; r < ST.ryad; r++) {
      for (let c = 0; c < ST.kol; c++) {
        el("rect", { x: ST.x0 + c * ST.dx + 2, y: ST.y0 + r * ST.dy + 2, width: ST.dx - 6, height: ST.dy - 8, rx: 3,
          fill: "none", stroke: "#141f2c" }, fon);
      }
    }

    // Здание, отсеки секторов, хранение «баками», полоса приёмки.
    el("rect", { x: ZD.x0, y: ZD.y0, width: ZD.x1 - ZD.x0, height: ZD.y1 - ZD.y0, rx: 6,
      fill: "#0c1520", stroke: "#26374f", "stroke-width": 2.5 }, zdanie);
    for (const o of otseki) {
      const cvet = CVET[PO_RUSSKI[o.s.цвет] || "seryy"];
      const w = o.x1 - o.x0;
      const proc = Math.max(0, Math.min(100, Number(o.s.процент_хранения) || 0));
      el("rect", { x: o.x0 + 4, y: BAK.y0, width: w - 8, height: BAK.y1 - BAK.y0, rx: 4, fill: "#0f1a27" }, zdanie);
      const vys = (BAK.y1 - BAK.y0) * proc / 100;
      el("rect", { x: o.x0 + 4, y: BAK.y1 - vys, width: w - 8, height: vys, rx: 4, fill: cvet, "fill-opacity": 0.28 }, zdanie);
      el("line", { x1: o.x0 + 4, x2: o.x1 - 4, y1: BAK.y1 - vys, y2: BAK.y1 - vys, stroke: cvet, "stroke-width": 2, "stroke-opacity": 0.8 }, zdanie);
      el("line", { x1: o.x1, x2: o.x1, y1: ZD.y0 + 8, y2: ZD.y1 - 8, stroke: "#1c2a3c", "stroke-width": 1.5 }, zdanie);
      el("text", { x: (o.x0 + o.x1) / 2, y: ZD.y0 + 40, "text-anchor": "middle", fill: "#e7eef7", "font-size": 30, "font-weight": 700 }, tekst, o.b);
      el("text", { x: (o.x0 + o.x1) / 2, y: ZD.y0 + 58, "text-anchor": "middle", fill: cvet, "font-size": 14, "font-weight": 700 },
        tekst, `${String(o.s.процент_хранения ?? "—").replace(".", ",")}%`);

      // Полоса приёмки: насколько забита и насколько залежалась.
      const p = priem.get(o.b);
      if (p && p.shtuk) {
        const dolya = p.izvestno > 0 ? p.staroe / p.izvestno : 0;
        const cvetP = dolya > 0.5 ? "krasnyy" : dolya > 0.25 ? "zhyoltyy" : "zelyonyy";
        const sila = 0.18 + 0.62 * Math.sqrt(p.shtuk / maxPriem);
        el("rect", { x: o.x0 + 4, y: POLOSA.y0, width: w - 8, height: POLOSA.y1 - POLOSA.y0, rx: 4,
          fill: CVET[cvetP], "fill-opacity": sila, class: cvetP === "krasnyy" ? "ekPuls" : "" }, zdanie);
        if (p.shtuk >= maxPriem * 0.25) {
          el("text", { x: (o.x0 + o.x1) / 2, y: (POLOSA.y0 + POLOSA.y1) / 2 + 5, "text-anchor": "middle",
            fill: "#fff", "font-size": 14, "font-weight": 700 }, tekst, tys(p.shtuk));
        }
      } else {
        el("rect", { x: o.x0 + 4, y: POLOSA.y0, width: w - 8, height: POLOSA.y1 - POLOSA.y0, rx: 4, fill: "#111b27" }, zdanie);
      }
    }
    el("text", { x: ZD.x0 - 12, y: (POLOSA.y0 + POLOSA.y1) / 2 + 5, "text-anchor": "end", fill: "#5f6f84", "font-size": 13 }, tekst, "приёмка");
    el("text", { x: ZD.x0 - 12, y: (BAK.y0 + BAK.y1) / 2 + 5, "text-anchor": "end", fill: "#5f6f84", "font-size": 13 }, tekst, "хранение");
    // Стена приёмки.
    el("line", { x1: ZD.x0, x2: ZD.x1, y1: ZD.y1, y2: ZD.y1, stroke: "#3a4f6b", "stroke-width": 4 }, zdanie);

    // Ворота: засечка на стене, ярче — чем больше машин сегодня.
    const maxSeg = Math.max(1, ...vorota.map((v) => v.машин_сегодня || 0));
    for (const { x: gx, v } of vorotaX.values()) {
      const yarko = 0.25 + 0.75 * (v.машин_сегодня || 0) / maxSeg;
      el("rect", { x: gx - 4, y: ZD.y1 - 2, width: 8, height: 7, rx: 1.5, fill: "#8fb4f8", "fill-opacity": yarko }, zdanie);
    }

    // Машины на воротах — у своей засечки. Номер подписываем, только если
    // рядом нет другого: соседние ворота стоят через десяток пикселей.
    const zanyatye = [];
    const podpisannye = [];
    for (const m of dmd.машины || []) {
      if (m.этап !== "на разгрузке") continue;
      const g = vorotaX.get(m.ворота_id);
      if (!g) continue;
      zanyatye.push({ gx: g.x, b: g.b });
      const cvet = (m.разгрузка_мин || 0) > 60 ? CVET.zhyoltyy : CVET.siniy;
      el("rect", { x: g.x - 7, y: ZD.y1 + 8, width: 14, height: 34, rx: 3, fill: cvet, "fill-opacity": 0.9 }, mashinySloi);
      el("rect", { x: g.x - 7, y: ZD.y1 + 34, width: 14, height: 8, rx: 2, fill: "#0b121b", "fill-opacity": 0.55 }, mashinySloi);
      if (!podpisannye.some((px) => Math.abs(px - g.x) < 26)) {
        podpisannye.push(g.x);
        el("text", { x: g.x, y: ZD.y1 + 58, "text-anchor": "middle", fill: "#8fb4f8", "font-size": 12, "font-weight": 700 },
          tekst, String(g.v.номер ?? ""));
      }
    }

    // Очередь на стоянке: плитка на машину, дольше всех — первыми.
    const zhdut = (dmd.машины || []).filter((m) => m.этап !== "на разгрузке")
      .sort((a, b) => b.на_дворе_мин - a.на_дворе_мин);
    const mest = ST.kol * ST.ryad;
    zhdut.slice(0, mest).forEach((m, i) => {
      const c = i % ST.kol, r = Math.floor(i / ST.kol);
      const cvet = CVET[cvetOzhidaniya(m.на_дворе_мин)];
      const dlinnaya = m.тип === "фура";
      el("rect", { x: ST.x0 + c * ST.dx + 4, y: ST.y0 + r * ST.dy + (dlinnaya ? 3 : 8), width: ST.dx - 10,
        height: dlinnaya ? ST.dy - 10 : ST.dy - 16, rx: 3, fill: cvet, "fill-opacity": 0.9 }, mashinySloi);
    });
    const hudshiy = zhdut[0];
    el("text", { x: ST.x0 - 2, y: ST.y0 + ST.ryad * ST.dy + 28, fill: "#e7eef7", "font-size": 20, "font-weight": 700 },
      tekst, zhdut.length ? `${num(zhdut.length)} ждут ворот` : "очереди нет");
    if (hudshiy) {
      el("text", { x: ST.x0 - 2, y: ST.y0 + ST.ryad * ST.dy + 50, fill: CVET[cvetOzhidaniya(hudshiy.на_дворе_мин)], "font-size": 15, "font-weight": 600 },
        tekst, `дольше всех ${chmm(hudshiy.на_дворе_мин)}`);
    }
    if (zhdut.length > mest) {
      el("text", { x: ST.x0 + ST.kol * ST.dx + 18, y: ST.y0 + ST.ryad * ST.dy - 6, fill: "#f05d72", "font-size": 18, "font-weight": 700 },
        tekst, `+${num(zhdut.length - mest)}`);
    }

    // Подпись-легенда внизу карты.
    el("text", { x: 30, y: H - 16, fill: "#4f5f73", "font-size": 13 }, tekst,
      "Машины на стоянке — цвет по времени ожидания · синие у стены — на разгрузке · точки — движение в темпе последнего часа, час ужат в минуту · "
      + "полоса приёмки краснеет, когда товар лежит дольше 48 часов · высота заливки сектора — занятость мест");

    $("ekKarta").replaceChildren(svg);

    // Сцена для анимации: маршруты и темпы.
    const potok = tempPotoka(dmd);
    const vesVorot = [...vorotaX.values()].map((g) => ({ g, ves: (g.v.машин_сегодня || 0) + (g.v.машин_14д || 0) / 14 + 0.2 }));
    const vesSumma = vesVorot.reduce((a, b) => a + b.ves, 0) || 1;
    const razmeshchenie = otseki.map((o) => {
      const p = priem.get(o.b);
      if (!p || !p.svezh) return null;
      const dolya = p.izvestno > 0 ? p.staroe / p.izvestno : 0;
      // В хранение уходит тем тоньше, чем сильнее забита приёмка.
      return { o, temp: 2.2 * Math.sqrt(p.svezh / maxSvezh) * (1 - 0.8 * dolya),
        cvet: dolya > 0.5 ? CVET.krasnyy : dolya > 0.25 ? CVET.zhyoltyy : CVET.zelyonyy };
    }).filter(Boolean);

    scena = { dvizhenie, potok, vesVorot, vesSumma, zanyatye, razmeshchenie, nakopleno: {} };
    for (const c of chastitsy.splice(0)) c.n.remove();
  }

  // Темп за последний закрытый час (или за час из адреса ?chas=), машин в
  // «экранную» секунду: час ужат в минуту.
  function tempPotoka(dmd) {
    const potok = dmd.поток || [];
    const seychas = new Date();
    const chas = CHAS_IZ_ADRESA !== null ? Number(CHAS_IZ_ADRESA) : seychas.getHours() - 1;
    const den = (dvor?.обновлено || "").slice(0, 10);
    const zapis = potok.filter((h) => h.час === chas).sort((a, b) => (a.день === den ? -1 : b.день === den ? 1 : 0))[0];
    const h = zapis || { приехало: 0, на_ворота: 0, разгружено: 0 };
    return { chas, den: zapis?.день || "", priezd: h.приехало / 60, kVorotam: h.на_ворота / 60, vyezd: h.разгружено / 60,
      shtuk: h };
  }

  /* ── движение ────────────────────────────────────────────────────── */
  // Маршрут — ломаная; точка идёт по ней с постоянной скоростью.
  function marshrut(tochki) {
    const dliny = [0];
    for (let i = 1; i < tochki.length; i++) {
      dliny.push(dliny[i - 1] + Math.hypot(tochki[i][0] - tochki[i - 1][0], tochki[i][1] - tochki[i - 1][1]));
    }
    return { tochki, dliny, vsego: dliny[dliny.length - 1] };
  }
  function tochkaNa(m, dolya) {
    const s = Math.max(0, Math.min(1, dolya)) * m.vsego;
    let i = 1;
    while (i < m.dliny.length - 1 && m.dliny[i] < s) i++;
    const d0 = m.dliny[i - 1], d1 = m.dliny[i];
    const t = d1 > d0 ? (s - d0) / (d1 - d0) : 0;
    const [x0, y0] = m.tochki[i - 1], [x1, y1] = m.tochki[i];
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  }
  function pustit(m, skorost, r, cvet, prozr = 0.95) {
    const n = el("circle", { r, fill: cvet, "fill-opacity": prozr }, scena.dvizhenie);
    chastitsy.push({ m, n, t0: performance.now(), dur: (m.vsego / skorost) * 1000 });
  }
  const sluchaynyeVorota = () => {
    let x = Math.random() * scena.vesSumma;
    for (const v of scena.vesVorot) { x -= v.ves; if (x <= 0) return v.g; }
    return scena.vesVorot[scena.vesVorot.length - 1]?.g;
  };

  function porodit(dt) {
    if (!scena) return;
    const nak = scena.nakopleno;
    const shag = (klyuch, temp, deystvie) => {
      nak[klyuch] = (nak[klyuch] || 0) + temp * dt;
      let predel = 6;
      while (nak[klyuch] >= 1 && predel-- > 0) { nak[klyuch] -= 1; deystvie(); }
    };
    const { potok } = scena;
    // Въезд: от края карты через КПП на стоянку.
    shag("priezd", potok.priezd, () => {
      const c = Math.floor(Math.random() * ST.kol), r = Math.floor(Math.random() * ST.ryad);
      pustit(marshrut([[-20, KPP.vhod], [KPP.x, KPP.vhod], [ST.x0 - 16, KPP.vhod],
        [ST.x0 + c * ST.dx + ST.dx / 2, ST.y0 + r * ST.dy + ST.dy / 2]]), 260, 5, "#dfe7f2");
    });
    // Вызов на ворота: со стоянки по кольцу к своим воротам.
    shag("kVorotam", potok.kVorotam, () => {
      const g = sluchaynyeVorota();
      if (!g) return;
      pustit(marshrut([[ST.x0 + ST.kol * ST.dx, DOR.verh + 40], [DOR.levo, DOR.verh + 40], [DOR.levo, DOR.niz],
        [g.x, DOR.niz], [g.x, ZD.y1 + 22]]), 300, 5, "#8fb4f8");
    });
    // Выезд: от ворот дальше по кольцу и через КПП наружу.
    shag("vyezd", potok.vyezd, () => {
      const g = sluchaynyeVorota();
      if (!g) return;
      pustit(marshrut([[g.x, ZD.y1 + 22], [g.x, DOR.niz], [DOR.pravo, DOR.niz], [DOR.pravo, DOR.verh], [DOR.levo, DOR.verh],
        [ST.x0 + ST.kol * ST.dx, KPP.vyhod], [KPP.x, KPP.vyhod], [-20, KPP.vyhod]]), 380, 4, "#5f6f84", 0.8);
    });
    // Разгрузка: от каждой машины на воротах товар идёт в полосу приёмки.
    scena.zanyatye.forEach((z, i) => shag(`r${i}`, 1.1, () => {
      const dx = (Math.random() - 0.5) * 30;
      pustit(marshrut([[z.gx, ZD.y1 + 6], [z.gx + dx, POLOSA.y0 + 10 + Math.random() * 40]]), 60, 2.4, "#cfe0ff", 0.9);
    }));
    // Размещение: из полосы приёмки в хранение, тоньше — если приёмка забита.
    scena.razmeshchenie.forEach((p, i) => shag(`p${i}`, p.temp, () => {
      const x0 = p.o.x0 + 10 + Math.random() * (p.o.x1 - p.o.x0 - 20);
      const x1 = p.o.x0 + 10 + Math.random() * (p.o.x1 - p.o.x0 - 20);
      pustit(marshrut([[x0, POLOSA.y0 + 4], [x1, BAK.y0 + 8 + Math.random() * (BAK.y1 - BAK.y0 - 16)]]), 70, 2.2, p.cvet, 0.85);
    }));
  }

  let proshloe = performance.now();
  let posledniyKadr = 0;
  // Один шаг анимации. Обычно его зовёт requestAnimationFrame, но браузер
  // перестаёт отдавать кадры, когда окно перекрыто или свёрнуто, — тогда
  // шаги ведёт запасной таймер, и экран на стене не замирает.
  function shag(seychas) {
    const dt = Math.min(0.25, (seychas - proshloe) / 1000);
    proshloe = seychas;
    porodit(dt);
    for (let i = chastitsy.length - 1; i >= 0; i--) {
      const c = chastitsy[i];
      const dolya = (seychas - c.t0) / c.dur;
      if (dolya >= 1) { c.n.remove(); chastitsy.splice(i, 1); continue; }
      const [x, y] = tochkaNa(c.m, dolya);
      c.n.setAttribute("cx", x.toFixed(1));
      c.n.setAttribute("cy", y.toFixed(1));
      // Гаснет в конце пути — прибыла.
      if (dolya > 0.85) c.n.setAttribute("opacity", ((1 - dolya) / 0.15).toFixed(2));
    }
  }
  function kadr(seychas) {
    posledniyKadr = seychas;
    shag(seychas);
    requestAnimationFrame(kadr);
  }
  setInterval(() => {
    const seychas = performance.now();
    if (seychas - posledniyKadr > 400) shag(seychas);
  }, 60);

  /* ── статус, тревоги, кривая ─────────────────────────────────────── */
  function narisovatStatus() {
    const modeli = window.PrCepochka ? window.PrCepochka.sobrat(dvor, priyomka) : [];
    const krasnye = modeli.filter((m) => m.cvet === "krasnyy").map((m) => m.imya.toLowerCase());
    const zhyoltye = modeli.filter((m) => m.cvet === "zhyoltyy").map((m) => m.imya.toLowerCase());
    const status = $("ekStatus");
    status.className = `ekStatus ${krasnye.length ? "is-krasnyy" : zhyoltye.length ? "is-zhyoltyy" : "is-zelyonyy"}`;
    status.textContent = krasnye.length ? `в красном: ${krasnye.join(", ")}`
      : zhyoltye.length ? `на пределе: ${zhyoltye.join(", ")}` : "вход работает штатно";
  }

  function narisovatTrevogi() {
    const t = [];
    const dmd = (dvor?.склады || []).find((s) => s.склад === "ДМД");
    if (dmd) {
      if (dmd.старше_4_часов) t.push({ cvet: "krasnyy", ves: 100, b: `${num(dmd.старше_4_часов)} машин ждут ворот дольше 4 часов`,
        s: `в очереди ${num(dmd.паллет_в_очереди)} паллет` });
      const segodnya = (dmd.кривая || []).filter((k) => k.t.slice(0, 10) === (dvor.обновлено || "").slice(0, 10));
      const posled = segodnya[segodnya.length - 1];
      if (posled) {
        const d = new Date(posled.t.replace(" ", "T")); d.setHours(d.getHours() - 1);
        const p2 = (n) => String(n).padStart(2, "0");
        const granica = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
        const chasNazad = segodnya.filter((k) => k.t <= granica).pop();
        const delta = chasNazad ? posled.ждут - chasNazad.ждут : 0;
        if (delta >= 10) t.push({ cvet: "krasnyy", ves: 95, b: `Очередь растёт: +${num(delta)} машин за час`, s: `было ${num(chasNazad.ждут)}, стало ${num(posled.ждут)}` });
        else if (delta <= -10) t.push({ cvet: "zelyonyy", ves: 30, b: `Очередь уходит: −${num(-delta)} машин за час`, s: `было ${num(chasNazad.ждут)}, стало ${num(posled.ждут)}` });
      }
      if (dmd.среднее_ожидание_мин > 60) t.push({ cvet: dmd.среднее_ожидание_мин > 120 ? "krasnyy" : "zhyoltyy", ves: 70,
        b: `Ворот ждут в среднем ${chmm(dmd.среднее_ожидание_мин)}`, s: `сама разгрузка — ${chmm(dmd.средняя_разгрузка_мин)}` });
    }
    const sektory = (priyomka?.секторы || []).filter((s) => /Сектор .+ ДМД$/.test(s.сектор) && s.цвет === "красный")
      .sort((a, b) => (b.процент_хранения || 0) - (a.процент_хранения || 0));
    if (sektory[0]) t.push({ cvet: "krasnyy", ves: 60, b: `Сектор ${bukva(sektory[0].сектор)}: ${String(sektory[0].процент_хранения).replace(".", ",")}% мест занято`,
      s: sektory.length > 1 ? `ещё красных секторов: ${sektory.length - 1}` : "" });
    const vis = priyomka?.висяки;
    if (vis?.старое_штук) t.push({ cvet: "zhyoltyy", ves: 40, b: `${tys(vis.старое_штук)} шт висят на входе дольше недели`, s: `самый старый — ${num(vis.максимум_дней)} дней` });
    const chas = new Date().getHours();
    const minutOt = (s) => (s ? (Date.now() - new Date(s.replace(" ", "T")).getTime()) / 60000 : Infinity);
    if (chas >= 7 && chas <= 22 && minutOt(dvor?.обновлено) > 30) t.push({ cvet: "siniy", ves: 99, b: "Двор не обновлялся больше получаса", s: `последние данные — ${dvor?.обновлено || "нет"}` });
    // Задача отработала, а регистраций нет полтора часа — застыл WMS, не двор;
    // тогда «ждут дольше 4 часов» растёт на бумаге, и эта тревога важнее.
    const tishina = dmd?.последняя_регистрация && dvor?.обновлено
      ? minutOt(dmd.последняя_регистрация) - minutOt(dvor.обновлено) : 0;
    const chasDannyh = Number(String(dvor?.обновлено || "").slice(11, 13));
    if (chasDannyh >= 8 && chasDannyh <= 21 && tishina > 90) t.push({ cvet: "siniy", ves: 101,
      b: `WMS молчит ${chmm(tishina)}: новых регистраций нет`, s: `последняя — ${String(dmd.последняя_регистрация).slice(11, 16)}, очередь и ожидание ниже не живые` });

    t.sort((a, b) => b.ves - a.ves);
    $("ekTrevogi").innerHTML = (t.length ? t.slice(0, 3) : [{ cvet: "zelyonyy", b: "Тревог нет", s: "вход работает штатно" }])
      .map((x) => `<li class="ekTrevoga ek--${x.cvet}"><i></i><div><b>${esc(x.b)}</b>${x.s ? `<span>${esc(x.s)}</span>` : ""}</div></li>`).join("");
  }

  function narisovatKrivuyu() {
    const holst = $("ekKrivaya");
    const dmd = (dvor?.склады || []).find((s) => s.склад === "ДМД");
    const tochki = dmd?.кривая || [];
    if (!tochki.length) { holst.innerHTML = ""; return; }
    const den = (dvor.обновлено || tochki[tochki.length - 1].t).slice(0, 10);
    const w = 1000, h = Math.max(80, Math.round(w * holst.clientHeight / Math.max(holst.clientWidth, 1)));
    const OT = 5 * 60, DO = 23 * 60;
    const minuty = (t) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));
    const ryad = (segodnya) => {
      const map = new Map(tochki.filter((k) => (k.t.slice(0, 10) === den) === segodnya).map((k) => [minuty(k.t), k.ждут]));
      const kon = segodnya ? Math.min(DO, minuty(dvor.обновлено || "0000-00-00 00:00")) : DO;
      const out = [];
      for (let m = OT; m <= kon; m += 10) out.push([m, map.get(m) || 0]);
      return out;
    };
    const s = ryad(true), v = ryad(false);
    const maks = Math.max(10, ...s.map((p) => p[1]), ...v.map((p) => p[1])) * 1.15;
    const x = (m) => 8 + (w - 16) * (m - OT) / (DO - OT);
    const y = (n) => 6 + (h - 22) * (1 - n / maks);
    const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "none" });
    const put = (r) => r.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
    for (let c = 6; c <= 22; c += 4) el("text", { x: x(c * 60), y: h - 2, "text-anchor": "middle", fill: "#4f5f73", "font-size": 13 }, svg, `${c}:00`);
    el("path", { d: put(v), fill: "none", stroke: "#46525f", "stroke-width": 2, "stroke-dasharray": "6 5" }, svg);
    if (s.length) {
      el("path", { d: `${put(s)} L${x(s[s.length - 1][0])},${y(0)} L${x(OT)},${y(0)} Z`, fill: "#f05d72", "fill-opacity": 0.14 }, svg);
      el("path", { d: put(s), fill: "none", stroke: "#f05d72", "stroke-width": 3 }, svg);
      const pik = s.reduce((a, p) => (p[1] > a[1] ? p : a), s[0]);
      if (pik[1] > 0) el("text", { x: x(pik[0]), y: y(pik[1]) - 6, "text-anchor": "middle", fill: "#ff8a9a", "font-size": 15, "font-weight": 700 },
        svg, `${num(pik[1])}`);
    }
    holst.replaceChildren(svg);
  }

  /* ── часы, загрузка, обновление ──────────────────────────────────── */
  function chasy() {
    const d = new Date();
    $("ekChasy").textContent = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    $("ekData").textContent = d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  }

  function podval() {
    const p = scena?.potok;
    const temp = p && (p.shtuk.приехало || p.shtuk.на_ворота)
      ? `движение — темп ${String(p.chas).padStart(2, "0")}:00${p.den ? ` ${p.den.slice(8, 10)}.${p.den.slice(5, 7)}` : ""}: приехало ${num(p.shtuk.приехало)}, на ворота ${num(p.shtuk.на_ворота)}, уехало ${num(p.shtuk.разгружено)}`
      : "за последний час машин не было — двор стоит";
    $("ekSvezhest").innerHTML = `<span>${esc(temp)}</span><span>двор: ${esc(dvor?.обновлено || "—")}</span>`
      + `<span>зоны: ${esc(priyomka?.обновлено || "—")}</span><span>источник: WMS · ucenka-vi.ru/priyomka/ekran/</span>`;
  }

  async function zagruzit() {
    const vzyat = (imya) => fetch(DATA + imya, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [d, p] = await Promise.all([vzyat("dvor.json"), vzyat("priyomka.json")]);
    if (d) dvor = d;
    if (p) priyomka = p;
    const novaya = `${dvor?.обновлено}|${priyomka?.обновлено}|${new Date().getHours()}`;
    // Карту пересобираем, только когда пришли новые данные или сменился час:
    // иначе каждую минуту обрывалось бы движение.
    if (novaya !== versiya) { versiya = novaya; postroitKartu(); }
    narisovatStatus();
    narisovatTrevogi();
    narisovatKrivuyu();
    podval();
  }

  $("ekPolnyi").addEventListener("click", () => document.documentElement.requestFullscreen?.());
  let tishina = null;
  document.addEventListener("mousemove", () => {
    document.body.classList.remove("is-tiho");
    clearTimeout(tishina);
    tishina = setTimeout(() => document.body.classList.add("is-tiho"), 3000);
  });
  window.addEventListener("resize", () => narisovatKrivuyu());

  chasy();
  setInterval(chasy, 1000);
  zagruzit().then(() => requestAnimationFrame(kadr));
  setInterval(zagruzit, 60 * 1000);
  setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
})();
