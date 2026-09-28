/* Хитмап «как на бирже» — тестовый вид (29.09.2026).
 *
 * Данные те же, что у обычного хитмапа (../data/heatmap.json): плитки периода,
 * история по дням, описания расчёта из metodika.js. Здесь только раскладка:
 * блоки — как отрасли, квадраты — показатели, площадь — важность, цвет —
 * отклонение от цели в процентах от цели (чем ярче, тем дальше).
 */
(() => {
  "use strict";

  const DATA_URL = "../data/heatmap.json";
  const MES = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август",
               "сентябрь", "октябрь", "ноябрь", "декабрь"];

  /* Важность = площадь. Главные деньги и качество — крупно, у кого есть цель —
     средне, справочные без цели — мелко. Меняется здесь одной строкой. */
  const VAZHNOST = {
    prodano_rub: 5, finres_pct: 5, payback_pct: 4, brak_share: 4, vyhod_vhod: 4,
    otgr_rub: 3, fot_rub: 3, spisanie_rub: 3, pereupak_rub: 3, backlog: 3, reserve_now: 3,
  };
  const ZELYONYY = "#2f8a2f", KRASNYY = "#c0392b", ZHYOLTYY = "#e8a838";

  const $ = (id) => document.getElementById(id);
  const map = $("map");
  let data = null;
  let period = "";
  let tip = null;

  /* ── числа ─────────────────────────────────────────────────────────── */

  function chislo(t) {
    if (t == null) return NaN;
    return parseFloat(String(t).replace(/\s| | /g, "").replace("−", "-").replace(",", "."));
  }

  /** «цель 6,86 · Δ -1,64» → {cel: 6.86, delta: -1.64} */
  function celIDelta(meta) {
    const m = /цель\s*([−\-]?[\d\s ,.]+)\s*·\s*Δ\s*([+\-−]?[\d\s ,.]+)/.exec(meta || "");
    if (!m) return null;
    const cel = chislo(m[1]), delta = chislo(m[2]);
    return Number.isFinite(cel) && Number.isFinite(delta) ? { cel, delta } : null;
  }

  function procent(x) {
    return `${Math.round(x * 100)}%`;
  }

  /** Цвет и подпись отклонения. Направление «лучше/хуже» уже решено запросом
      хитмапа (цвет плитки), здесь только сила — |Δ| / |цель|. */
  function ocenka(t) {
    const cd = celIDelta(t.meta_txt);
    if (t.bg_color === ZHYOLTYY) {
      return { klass: "a", dev: cd ? `на грани · Δ ${String(t.meta_txt).split("Δ")[1].trim()}` : "на грани", sila: null };
    }
    if (!cd || (t.bg_color !== ZELYONYY && t.bg_color !== KRASNYY)) {
      return { klass: "n", dev: t.meta_txt && !cd ? t.meta_txt : "справочно", sila: null };
    }
    const sila = cd.cel ? Math.abs(cd.delta) / Math.abs(cd.cel) : 1;
    const stupen = sila < 0.02 ? 1 : sila < 0.1 ? 2 : 3;
    const horosho = t.bg_color === ZELYONYY;
    return {
      klass: (horosho ? "g" : "r") + stupen,
      dev: `${horosho ? "+" : "−"}${procent(sila)} к цели`,
      sila, horosho, cd,
    };
  }

  /* ── раскладка: squarified treemap ─────────────────────────────────── */

  function hudshee(ryad, storona) {
    const s = ryad.reduce((a, n) => a + n.a, 0);
    let mx = 0, mn = Infinity;
    for (const n of ryad) { mx = Math.max(mx, n.a); mn = Math.min(mn, n.a); }
    return Math.max((storona * storona * mx) / (s * s), (s * s) / (storona * storona * mn));
  }

  function polozhit(ryad, r, out) {
    const s = ryad.reduce((a, n) => a + n.a, 0);
    if (r.w >= r.h) {
      const w = s / r.h;
      let y = r.y;
      for (const n of ryad) { const h = n.a / w; out.push({ ...n, x: r.x, y, w, h }); y += h; }
      return { x: r.x + w, y: r.y, w: r.w - w, h: r.h };
    }
    const h = s / r.w;
    let x = r.x;
    for (const n of ryad) { const w = n.a / h; out.push({ ...n, x, y: r.y, w, h }); x += w; }
    return { x: r.x, y: r.y + h, w: r.w, h: r.h - h };
  }

  function raskladka(elementy, x, y, w, h) {
    const vsego = elementy.reduce((a, e) => a + e.ves, 0) || 1;
    const uzly = elementy.slice().sort((a, b) => b.ves - a.ves)
      .map((e) => ({ ...e, a: (e.ves * w * h) / vsego }));
    const out = [];
    let r = { x, y, w, h };
    let ryad = [];
    for (let i = 0; i < uzly.length;) {
      const storona = Math.min(r.w, r.h);
      if (!ryad.length || hudshee([...ryad, uzly[i]], storona) <= hudshee(ryad, storona)) {
        ryad.push(uzly[i]); i += 1;
      } else {
        r = polozhit(ryad, r, out); ryad = [];
      }
    }
    if (ryad.length) polozhit(ryad, r, out);
    return out;
  }

  /* ── рисование ─────────────────────────────────────────────────────── */

  function ves(t) {
    return VAZHNOST[t.metric_key] || (celIDelta(t.meta_txt) ? 2 : 1.2);
  }

  function risovat() {
    const plitki = (data.поПериодам && data.поПериодам[period]) || data.плитки || [];
    map.replaceChildren();
    if (!plitki.length) { $("message").textContent = "За этот период плиток нет."; return; }
    $("message").textContent = "";
    const W = map.clientWidth;
    const H = Math.max(560, window.innerHeight - map.getBoundingClientRect().top - 60);
    map.style.height = `${H}px`;

    const bloki = new Map();
    for (const t of plitki) {
      const k = `${t.block_ord}|${t.block_name}`;
      if (!bloki.has(k)) bloki.set(k, { imya: t.block_name, plitki: [] });
      bloki.get(k).plitki.push(t);
    }
    const spisok = [...bloki.values()].map((b) => ({ ...b, ves: b.plitki.reduce((a, t) => a + ves(t), 0) }));

    for (const b of raskladka(spisok, 0, 0, W, H)) {
      const blok = document.createElement("section");
      blok.className = "blk";
      Object.assign(blok.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      const zag = document.createElement("div");
      zag.className = "blk__name";
      zag.textContent = b.imya;
      blok.append(zag);
      const ZAG = 20;
      const kvadraty = raskladka(b.plitki.map((t) => ({ t, ves: ves(t) })), 0, ZAG, b.w - 2, b.h - ZAG - 2);
      for (const k of kvadraty) blok.append(kletka(k));
      map.append(blok);
    }
  }

  function kletka({ t, x, y, w, h }) {
    const o = ocenka(t);
    const el = document.createElement("div");
    el.className = `cell ${o.klass}`;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${t.metric}: ${t.fact_txt}, ${o.dev}`);
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    const s = Math.sqrt(w * h);
    const razm = (k, lo, hi) => `${Math.max(lo, Math.min(hi, s / k)).toFixed(1)}px`;
    const malo = w < 92 || h < 58;
    const krokha = w < 58 || h < 34;
    if (!krokha) {
      const n = document.createElement("div");
      n.className = "cell__name";
      n.style.fontSize = razm(12, 10, 17);
      n.textContent = malo ? t.metric.split(/[,(]/)[0] : t.metric;
      el.append(n);
    }
    const v = document.createElement("div");
    v.className = "cell__val";
    v.style.fontSize = razm(krokha ? 7 : 5.2, 11, 46);
    v.textContent = t.fact_txt;
    el.append(v);
    if (!malo) {
      const d = document.createElement("div");
      d.className = "cell__dev";
      d.style.fontSize = razm(11.5, 10, 17);
      d.textContent = o.dev;
      el.append(d);
    }
    el.addEventListener("click", () => otkryt(t));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); otkryt(t); } });
    el.addEventListener("mousemove", (e) => podskazka(e, t, o));
    el.addEventListener("mouseleave", ubratPodskazku);
    return el;
  }

  /* ── подсказка и панель ────────────────────────────────────────────── */

  function podskazka(e, t, o) {
    if (!tip) { tip = document.createElement("div"); tip.className = "tip"; document.body.append(tip); }
    const m = (window.HEATMAP_METHOD || {})[t.metric_key];
    tip.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = `${t.metric} · ${t.fact_txt}`;
    tip.append(b, document.createElement("br"), document.createTextNode(t.meta_txt || o.dev));
    if (m && m.формула) tip.append(document.createElement("br"), document.createTextNode(m.формула));
    const x = Math.min(e.clientX + 14, window.innerWidth - 340);
    const y = Math.min(e.clientY + 14, window.innerHeight - 120);
    Object.assign(tip.style, { left: `${x}px`, top: `${y}px`, display: "block" });
  }

  function ubratPodskazku() {
    if (tip) tip.style.display = "none";
  }

  function tochkiPerioda(key) {
    const r = data.ряды && data.ряды[key];
    return r && r.точки ? r.точки.filter((p) => String(p.день).startsWith(period)) : [];
  }

  function otkryt(t) {
    ubratPodskazku();
    const o = ocenka(t);
    $("drBlock").textContent = t.block_name;
    $("drTitle").textContent = t.metric;
    const body = $("drBody");
    body.replaceChildren();

    const big = document.createElement("div");
    big.className = "big";
    big.textContent = t.fact_txt;
    const pill = document.createElement("span");
    pill.className = `pill cell ${o.klass}`;
    pill.style.position = "static";
    pill.textContent = o.dev;
    body.append(big, pill);

    const kv = document.createElement("dl");
    kv.className = "kv";
    const para = (k, v) => { const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; kv.append(dt, dd); };
    para("период", podpisPerioda(period));
    if (o.cd) {
      para("цель", o.cd.cel.toLocaleString("ru-RU"));
      para("отклонение", `${o.cd.delta > 0 ? "+" : ""}${o.cd.delta.toLocaleString("ru-RU")}`);
    } else if (t.meta_txt) {
      para("примечание", t.meta_txt);
    }
    if (t.val2_txt) para("ещё", t.val2_txt);
    body.append(kv);

    const tochki = tochkiPerioda(t.metric_key);
    const sec = document.createElement("p");
    sec.className = "sec";
    sec.textContent = "по дням";
    body.append(sec);
    if (tochki.length) {
      const mx = Math.max(...tochki.map((p) => Math.abs(p.значение))) || 1;
      const sp = document.createElement("div");
      sp.className = "spark";
      for (const p of tochki) {
        const i = document.createElement("i");
        i.style.height = `${Math.max(2, (Math.abs(p.значение) / mx) * 100)}%`;
        if (p.значение < 0) i.style.background = "#d93a4a";
        i.title = `${p.день.split("-").reverse().join(".")}: ${Number(p.значение).toLocaleString("ru-RU")}`;
        sp.append(i);
      }
      const cap = document.createElement("div");
      cap.className = "spark__cap";
      const f = (d) => d.split("-").reverse().slice(0, 2).join(".");
      cap.innerHTML = "";
      cap.append(Object.assign(document.createElement("span"), { textContent: f(tochki[0].день) }),
                 Object.assign(document.createElement("span"), { textContent: f(tochki[tochki.length - 1].день) }));
      body.append(sp, cap);
    } else {
      body.append(Object.assign(document.createElement("p"), { className: "spark__cap", textContent: "за этот период ряда по дням нет" }));
    }

    const m = (window.HEATMAP_METHOD || {})[t.metric_key];
    if (m) {
      const s2 = document.createElement("p");
      s2.className = "sec";
      s2.textContent = `откуда число · ${m.тип || ""}`;
      const box = document.createElement("div");
      box.className = "method";
      box.textContent = m.формула || "";
      if (m.оговорка) box.append(Object.assign(document.createElement("small"), { textContent: m.оговорка }));
      body.append(s2, box);
    }

    const go = document.createElement("a");
    go.className = "go";
    go.href = `./#${period}/${t.metric_key}`;
    go.textContent = "открыть в обычном хитмапе";
    body.append(go);

    $("scrim").hidden = false;
    $("drawer").classList.add("open");
    $("drawer").setAttribute("aria-hidden", "false");
    $("drClose").focus();
  }

  function zakryt() {
    $("scrim").hidden = true;
    $("drawer").classList.remove("open");
    $("drawer").setAttribute("aria-hidden", "true");
  }

  function podpisPerioda(p) {
    const [g, m] = String(p).split("-");
    return m ? `${MES[Number(m) - 1]} ${g}` : `${g} год`;
  }

  /* ── старт ─────────────────────────────────────────────────────────── */

  function start() {
    const sel = $("period");
    const periody = (data.периоды || []).slice().reverse();
    for (const p of periody) sel.append(new Option(podpisPerioda(p), p));
    const izAdresa = decodeURIComponent(location.hash.slice(1));
    period = periody.includes(izAdresa) ? izAdresa : data.период || periody[0];
    sel.value = period;
    sel.addEventListener("change", () => {
      period = sel.value;
      history.replaceState(null, "", `#${period}`);
      $("back").href = `./#${period}`;
      risovat();
    });
    $("back").href = `./#${period}`;
    $("stamp").textContent = data.обновлено ? `обновлено ${data.обновлено}` : "";
    risovat();
    let t = null;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(risovat, 120); });
  }

  $("drClose").addEventListener("click", zakryt);
  $("scrim").addEventListener("click", zakryt);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") zakryt(); });

  fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { data = d; start(); })
    .catch((e) => { $("message").textContent = `Не удалось загрузить показатели: ${e.message}`; });
})();
