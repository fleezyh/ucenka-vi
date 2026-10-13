/* Экран бэклога ФБ — пульт (13.10.2026).
 *
 * Было (01.10): одно большое число «осталось разобрать», четыре счётчика и три коротких списка.
 * Степан 13.10: «экран бэклога тоже должен иметь всю информацию — сейчас я покрутить не могу ничего,
 * не видно детализаций, не хватает по визуалу мощности».
 *
 * Данные — /__ekran/dannye?den=ГГГГ-ММ-ДД (gate.py, ekran_dannye): итог дня, поток по 10 минут (и вчера),
 * люди с почасовым темпом и категориями, столы, приход/уход, лента; из data/backlog.json — зоны с историей
 * за 50 дней, «зависшие» по дню захода, поток по дням. Сегодня обновляется раз в 5 секунд, прошлый день — один раз.
 * Клик по зоне, человеку, дню — карточка; по дню внизу — весь экран за тот день. */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const C = { svoy: "#2ee6d6", prish: "#f2b33d", krit: "#ff4d5e", sred: "#7fa0b2", net: "#2a3d49", trans: "#5fa8ff" };
  const f = (n) => (n == null ? "—" : Math.round(Number(n) || 0).toLocaleString("ru-RU"));
  const tys = (v) => { const x = Number(v) || 0; return x >= 10000 ? `${Math.round(x / 1000)} тыс` : x >= 1000 ? `${(x / 1000).toFixed(1).replace(".", ",")} тыс` : f(x); };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ddmm = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  const DNI = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const el = (tag, atr = {}, rod = null, t = null) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(atr)) n.setAttribute(k, v); if (t !== null) n.textContent = t; if (rod) rod.appendChild(n); return n; };
  const korotko = (z) => String(z).replace(/^\d+\s+/, "").replace(/ Домодедово| ДМД|\(ДМД\)/g, "").trim();

  let D = null, den = "", bylo = null, vidno = new Set(), anim = null;

  function vpisat() {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    $("bkHolst").style.transform = `translate(${(innerWidth - 1920 * k) / 2}px, ${(innerHeight - 1080 * k) / 2}px) scale(${k})`;
  }

  /* ── главное число ─────────────────────────────────────────────── */
  function glavnoe() {
    const ost = D.осталось;
    const big = $("bkOst");
    if (bylo !== null && ost !== bylo && D.сегодня) {
      const ot = bylo, t0 = performance.now();
      cancelAnimationFrame(anim);
      const shag = (t) => { const k = Math.min(1, (t - t0) / 900); big.textContent = f(ot + (ost - ot) * k); if (k < 1) anim = requestAnimationFrame(shag); };
      anim = requestAnimationFrame(shag);
      const minus = ost < bylo;
      big.classList.add(minus ? "is-minus" : "is-plus");
      setTimeout(() => big.classList.remove("is-minus", "is-plus"), 1200);
      const e = document.createElement("div");
      e.className = "bkLetit";
      e.style.color = minus ? C.svoy : C.prish;
      e.textContent = `${minus ? "−" : "+"}${f(Math.abs(ost - bylo))}`;
      e.style.left = "560px"; e.style.top = "130px";
      $("bkHolst").appendChild(e);
      setTimeout(() => e.remove(), 1700);
    } else big.textContent = f(ost);
    bylo = ost;
    $("bkLbl").textContent = D.сегодня ? "ОСТАЛОСЬ РАЗОБРАТЬ" : `ОСТАЛОСЬ НА КОНЕЦ ${ddmm(D.день)}`;
    const dl = ost - D.утро;
    $("bkDelta").innerHTML = `${dl <= 0 ? `<span style="color:${C.svoy}">−${f(-dl)}</span>` : `<span style="color:${C.prish}">+${f(dl)}</span>`} с утра`
      + ` · бэклог на утро ${f(D.утро)}${D.снимок ? ` (пересчитан в ${D.снимок})` : ""}`;
    const s = [["УТРОМ БЫЛО", f(D.утро), "#e8f6ff"], ["− РАЗОБРАЛИ ПИКАЛКОЙ", `−${f(D.обработано)}`, C.svoy],
      ["− УШЛО ДРУГИМИ ПУТЯМИ", `−${f(D.ушло)}`, C.svoy], ["+ ПРИШЛО НОВОГО", `+${f(D.пришло)}`, C.prish]];
    $("bkSchet").innerHTML = s.map(([t, v, c]) => `<div style="--c:${c}"><span>${t}</span><b>${v}</b></div>`).join("");
    if (D.сегодня) {
      const chasov = Math.max(0.5, (Date.now() - new Date(`${D.день}T08:00:00+03:00`).getTime()) / 3600000);
      const temp = D.обработано / Math.min(chasov, 13);
      $("bkChas").innerHTML = `за последний час: <b style="color:${C.svoy}">−${f(D.за_час)}</b> разобрали · <b style="color:${C.svoy}">−${f(D.ушло_за_час)}</b> ушло · `
        + `<b style="color:${C.prish}">+${f(D.пришло_за_час)}</b> пришло${D.обработано ? ` · средний темп ${f(temp)} шт/ч` : ""}`;
    } else $("bkChas").textContent = "прошлый день — данные на конец дня";
  }

  /* ── как шёл день: изменение с утра (сегодня и вчера) и поток по часам ── */
  function denGrafik() {
    const box = $("bkDenHolst");
    box.innerHTML = "";
    const Wd = 672, Hd = 410;
    const svg = el("svg", { viewBox: `0 0 ${Wd} ${Hd}` }, box);
    const nakop = (arr) => { const m = new Map(arr.map((x) => [x[0], x])); let s = 0; const out = []; for (let i = 0; i < 144; i++) { const k = `${String(Math.floor(i / 6)).padStart(2, "0")}:${i % 6}0`; const x = m.get(k); if (x) s += -x[1] - x[3] + x[2]; out.push(s); } return out; };
    const seg = nakop(D.по_10мин), vch = nakop(D.вчера_по_10мин);
    const doI = D.сегодня ? Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / 10) : 143;
    const vals = seg.slice(0, doI + 1).concat(vch);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const x = (i) => 40 + i * (Wd - 50) / 143;
    const y1 = (v) => 20 + (196 - 20) * (hi - v) / ((hi - lo) || 1);
    el("text", { x: 40, y: 12, fill: "#46606f", "font-size": 11 }, svg, "изменение бэклога с утра, шт · сплошная — этот день, пунктир — день до него");
    el("line", { x1: 40, x2: Wd - 10, y1: y1(0), y2: y1(0), stroke: "#1f4256" }, svg);
    for (let h = 0; h <= 24; h += 3) { const xx = x(h * 6 - (h === 24 ? 1 : 0)); el("line", { x1: xx, x2: xx, y1: 20, y2: Hd - 20, stroke: "#0b1820" }, svg); el("text", { x: xx, y: Hd - 6, fill: "#46606f", "font-size": 10, "text-anchor": "middle" }, svg, `${String(h).padStart(2, "0")}:00`); }
    [lo, hi].forEach((v) => el("text", { x: 36, y: y1(v) + 4, fill: "#46606f", "font-size": 10, "text-anchor": "end" }, svg, `${v > 0 ? "+" : ""}${tys(v)}`));
    const lin = (a, n) => a.slice(0, n).map((v, i) => `${x(i).toFixed(1)},${y1(v).toFixed(1)}`).join(" ");
    el("polyline", { points: lin(vch, 144), fill: "none", stroke: "#7fa0b2", "stroke-width": 1.4, "stroke-dasharray": "4 4" }, svg);
    el("polyline", { points: lin(seg, doI + 1), fill: "none", stroke: seg[doI] <= 0 ? C.svoy : C.prish, "stroke-width": 2.6 }, svg);
    // по часам: разобрали (вниз), ушло (вниз, синее), пришло (вверх)
    const ch = Array.from({ length: 24 }, () => [0, 0, 0]);
    D.по_10мин.forEach((q) => { const h = +q[0].slice(0, 2); ch[h][0] += q[1]; ch[h][1] += q[2]; ch[h][2] += q[3]; });
    const mk = Math.max(1, ...ch.map((q) => Math.max(q[0] + q[2], q[1])));
    const yb0 = 300, hb = 70;
    el("text", { x: 40, y: 220, fill: "#46606f", "font-size": 11 }, svg, "по часам: вверх — пришло, вниз — разобрали пикалкой и ушло другими путями");
    el("line", { x1: 40, x2: Wd - 10, y1: yb0, y2: yb0, stroke: "#1f4256" }, svg);
    const wb = (Wd - 50) / 24 - 3;
    ch.forEach(([o, p, u_], h) => {
      const xx = 40 + h * (Wd - 50) / 24;
      if (p) el("rect", { x: xx, y: yb0 - hb * p / mk, width: wb, height: hb * p / mk, fill: C.prish, "fill-opacity": 0.8 }, svg);
      if (o) el("rect", { x: xx, y: yb0, width: wb, height: hb * o / mk, fill: C.svoy, "fill-opacity": 0.85 }, svg);
      if (u_) el("rect", { x: xx, y: yb0 + hb * o / mk, width: wb, height: hb * u_ / mk, fill: C.trans, "fill-opacity": 0.8 }, svg);
      if (o + p + u_) el("text", { x: xx + wb / 2, y: yb0 + hb * (o + u_) / mk + 11, fill: "#7fa0b2", "font-size": 9, "text-anchor": "middle" }, svg, o + u_ ? `−${tys(o + u_)}` : "");
    });
    // подсказка по наведению
    const tip = document.createElement("div");
    tip.className = "bkTip"; tip.hidden = true;
    box.appendChild(tip);
    svg.addEventListener("mousemove", (ev) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(143, Math.round(((ev.clientX - r.left) / r.width * Wd - 40) / ((Wd - 50) / 143))));
      const k = `${String(Math.floor(i / 6)).padStart(2, "0")}:${i % 6}0`, q = D.по_10мин.find((z) => z[0] === k) || [k, 0, 0, 0];
      tip.hidden = false;
      tip.style.left = `${Math.min(r.width - 230, ev.clientX - r.left + 12)}px`; tip.style.top = "30px";
      tip.innerHTML = `<b>${k}</b> · с утра ${i <= doI ? `${seg[i] > 0 ? "+" : ""}${f(seg[i])}` : "—"} (день до: ${vch[i] > 0 ? "+" : ""}${f(vch[i])})<br>за 10 минут: −${f(q[1])} пикалкой · −${f(q[3])} ушло · +${f(q[2])} пришло`;
    });
    svg.addEventListener("mouseleave", () => { tip.hidden = true; });
    $("bkDenT").textContent = D.сегодня ? `СЕГОДНЯ, ${ddmm(D.день)}` : ddmm(D.день);
  }

  /* ── где лежит: зоны ───────────────────────────────────────────── */
  function zony() {
    const zz = (D.зоны || []).slice().sort((a, b) => (b.штук || 0) - (a.штук || 0));
    const mk = Math.max(1, ...zz.map((z) => z.штук || 0));
    $("bkZony").innerHTML = zz.map((z, i) => {
      const r = (z.ряд || []).filter((v) => v != null);
      const d1 = r.length >= 2 ? r[r.length - 1] - r[r.length - 2] : null;
      return `<div class="bkStr" data-zona="${i}"><span class="bkStr__imya" title="${esc(z.зона)}">${esc(korotko(z.зона))}</span>`
        + `<span>${spark(z.ряд || [], 150, 20)}</span><b class="bkStr__zn">${tys(z.штук)}</b>`
        + `<span class="bkStr__d" style="color:${d1 == null ? "#46606f" : d1 > 0 ? C.prish : C.svoy}">${d1 == null ? "" : `${d1 > 0 ? "+" : "−"}${tys(Math.abs(d1))}`}</span></div>`;
    }).join("") || '<div class="bkPusto">зон нет</div>';
    $("bkZony").onclick = (ev) => { const r = ev.target.closest("[data-zona]"); if (r) kartaZony(zz[+r.dataset.zona]); };
    void mk;
  }
  function spark(ryad, w, h) {
    const v = ryad.map((q) => (q == null ? null : +q)), est = v.filter((q) => q != null);
    if (est.length < 2) return "";
    const lo = Math.min(...est), hi = Math.max(...est);
    const pts = v.map((q, i) => (q == null ? null : `${(i * (w - 2) / (v.length - 1) + 1).toFixed(1)},${(h - 2 - (h - 4) * (q - lo) / ((hi - lo) || 1)).toFixed(1)}`)).filter(Boolean).join(" ");
    const posl = est[est.length - 1], pervyy = est[0];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${posl > pervyy ? C.prish : C.svoy}" stroke-width="1.4"/></svg>`;
  }

  /* ── сколько лежит: зависшие по дню захода ─────────────────────── */
  function lezhit() {
    const z = (D.зависшие || []).slice().sort((a, b) => a.день.localeCompare(b.день));
    const ranshe = D.зависшие_раньше || 0;
    const vse = [{ день: "раньше", лежит: ranshe, зашло: null }].concat(z);
    const mk = Math.max(1, ...vse.map((q) => q.лежит || 0));
    const Wd = 532, Hd = 220, wb = (Wd - 20) / vse.length - 3;
    const svg = el("svg", { viewBox: `0 0 ${Wd} ${Hd}`, width: "100%", height: Hd });
    const segodnya = new Date();
    vse.forEach((q, i) => {
      const x = 10 + i * (wb + 3), h = 160 * (q.лежит || 0) / mk;
      const dney = q.день === "раньше" ? 99 : Math.round((segodnya - new Date(`${q.день}T12:00:00`)) / 864e5);
      const c = dney >= 14 ? C.krit : dney >= 7 ? C.prish : C.svoy;
      const g = el("g", {}, svg);
      el("rect", { x, y: 180 - h, width: wb, height: h, fill: c, "fill-opacity": 0.8 }, g);
      el("title", {}, g, q.день === "раньше" ? `зашло раньше и всё ещё лежит: ${f(q.лежит)} шт` : `зашло ${ddmm(q.день)}: ${f(q.зашло)} шт, лежит до сих пор ${f(q.лежит)}`);
      if (q.лежит && wb > 14) el("text", { x: x + wb / 2, y: 176 - h, fill: "#cfdce4", "font-size": 9.5, "text-anchor": "middle" }, g, tys(q.лежит));
      el("text", { x: x + wb / 2, y: 196, fill: "#46606f", "font-size": 9, "text-anchor": "middle" }, g, q.день === "раньше" ? "раньше" : ddmm(q.день));
    });
    el("text", { x: 10, y: 214, fill: "#46606f", "font-size": 10 }, svg, "сколько из зашедшего в тот день лежит до сих пор · красное — две недели и дольше");
    $("bkLezhit").replaceChildren(svg);
  }

  /* ── люди ──────────────────────────────────────────────────────── */
  function lyudi() {
    const ll = (D.люди || []).slice().sort((a, b) => b.штук - a.штук);
    const seychasHM = new Date().toTimeString().slice(0, 5);
    const aktiven = (p) => D.сегодня && (() => { const [h, m] = p.по.split(":").map(Number); const [h2, m2] = seychasHM.split(":").map(Number); return h2 * 60 + m2 - (h * 60 + m) <= 15; })();
    const mkCh = Math.max(1, ...ll.flatMap((p) => Object.values(p.часы || {})));
    $("bkLyudiT").textContent = ll.length ? `${ll.length} ЧЕЛ · ${f(ll.reduce((a, p) => a + p.штук, 0))} ШТ · КЛИК — ПОДРОБНО` : "";
    $("bkLyudi").innerHTML = ll.length ? ll.slice(0, 9).map((p, i) => `<div class="bkChel" data-chel="${i}">`
      + `<span class="bkChel__imya"><i class="${aktiven(p) ? "is-on" : ""}"></i>${esc(p.кто)}</span><b class="bkChel__sht">${f(p.штук)}</b>`
      + `<span class="bkChel__ch">${Array.from({ length: 15 }, (_, k) => { const v = (p.часы || {})[String(k + 7)] || 0; return `<i class="${v ? "" : "is-0"}" style="height:${Math.max(2, 22 * v / mkCh)}px" title="${k + 7}:00 — ${v} шт"></i>`; }).join("")}</span>`
      + `<span class="bkChel__temp">${D.сегодня ? `${f(p.за_час)}/ч` : `${p.с}–${p.по}`}</span></div>`).join("")
      : `<div class="bkPusto">${D.сегодня ? "ещё никто не разбирал" : "в этот день пикалкой не разбирали"}</div>`;
    $("bkLyudi").onclick = (ev) => { const r = ev.target.closest("[data-chel]"); if (r) kartaCheloveka(ll[+r.dataset.chel]); };
  }

  function malo(box, spisok, c, pusto) {
    const mk = Math.max(1, ...spisok.map((q) => q.штук || 0));
    box.innerHTML = spisok.length ? spisok.map((q) => `<div class="bkMalo" style="--c:${c}" title="${esc(q.что)}"><span>${esc(q.что)}</span><b>${tys(q.штук)}</b></div>`).join("") : `<div class="bkPusto">${pusto}</div>`;
    void mk;
  }
  function kudaOtkuda() {
    malo($("bkKat"), (D.категории || []).slice(0, 9).map((q) => ({ что: q.что === "—" ? "без категории" : q.что, штук: q.штук })), C.svoy, "пока ничего");
    const box = $("bkOtk");
    box.innerHTML = "";
    const a = document.createElement("div"), b = document.createElement("div");
    malo(a, (D.откуда || []).slice(0, 5).map((q) => ({ ...q, что: `+ ${q.что}` })), C.prish, "не приходило");
    malo(b, (D.куда || []).slice(0, 4).map((q) => ({ ...q, что: `− ${q.что}` })), C.trans, "не уходило");
    box.append(a, b);
  }

  function lenta() {
    const l = D.лента || [];
    $("bkLenta").innerHTML = l.slice(0, 9).map((x) => `<div class="bkLen${bylo !== null && vidno.size && !vidno.has(x.id) ? " is-new" : ""}">`
      + `<span>${esc(x.когда)}</span><b>${esc(x.товар)}</b><i>${esc(x.кто)} → ${esc(x.паллета || x.категория)}</i></div>`).join("") || '<div class="bkPusto">сканов нет</div>';
    l.forEach((x) => vidno.add(x.id));
  }

  /* ── бэклог по дням ───────────────────────────────────────────── */
  function istoriya() {
    const box = $("bkIst");
    box.innerHTML = "";
    const ist = D.история || [];
    if (!ist.length) return;
    const Wd = 1860, Hd = 118;
    const svg = el("svg", { viewBox: `0 0 ${Wd} ${Hd}`, preserveAspectRatio: "none" }, box);
    const vals = ist.map((q) => q.штук || 0), lo = Math.min(...vals) * 0.96, hi = Math.max(...vals);
    const wb = Wd / ist.length;
    const potok = Object.fromEntries((D.потоки_по_дням || []).map((q) => [q.день, q]));
    const zhurnal = new Set(D.дни_журнала || []);
    ist.forEach((q, i) => {
      const x = i * wb, h = 80 * ((q.штук || 0) - lo) / ((hi - lo) || 1) + 4;
      const vybran = q.день === D.день || (D.сегодня && i === ist.length - 1 && q.день < D.день);
      const g = el("g", { "data-den": q.день, style: "cursor:pointer" }, svg);
      const prev = i ? ist[i - 1].штук : q.штук, rost = (q.штук || 0) > (prev || 0);
      el("rect", { x: x + 1, y: 92 - h, width: wb - 2, height: h, fill: vybran ? "#e8f6ff" : rost ? C.prish : C.svoy, "fill-opacity": vybran ? 0.9 : 0.55 }, g);
      el("rect", { x, y: 0, width: wb, height: Hd, fill: "transparent" }, g);
      const pt = potok[q.день];
      el("title", {}, g, `${ddmm(q.день)} ${DNI[new Date(`${q.день}T12:00:00`).getDay()]}: бэклог на конец дня ${f(q.штук)}${pt ? ` · пришло ${f(pt.пришло)}, ушло ${f(pt.ушло)}` : ""}${zhurnal.has(q.день) ? " · есть журнал пикалки — клик покажет день" : ""}`);
      if (zhurnal.has(q.день)) el("rect", { x: x + 1, y: 95, width: wb - 2, height: 3, fill: C.svoy }, g);
      if (i % 3 === 0 || vybran) el("text", { x: x + wb / 2, y: 112, fill: vybran ? "#e8f6ff" : "#46606f", "font-size": 10, "text-anchor": "middle" }, g, ddmm(q.день));
    });
    el("text", { x: 4, y: 12, fill: "#46606f", "font-size": 10 }, svg, `бэклог на конец дня · ${tys(lo / 0.96)}–${tys(hi)} · голубая черта — есть журнал пикалки`);
    svg.addEventListener("click", (ev) => { const g = ev.target.closest("[data-den]"); if (g) vybratDen(g.dataset.den); });
  }

  /* ── выбор дня ─────────────────────────────────────────────────── */
  function dniKnopki() {
    const segodnya = new Date().toLocaleDateString("sv-SE");
    const dd = [...new Set((D.дни_журнала || []).concat([segodnya]))].sort().slice(-8);
    $("bkDni").innerHTML = dd.map((x) => `<button type="button" class="bkDen__k${x === D.день ? " is-on" : ""}" data-den="${x}">${x === segodnya ? "СЕГОДНЯ" : `${ddmm(x)} ${DNI[new Date(`${x}T12:00:00`).getDay()]}`}</button>`).join("");
    $("bkDni").onclick = (ev) => { const b = ev.target.closest("[data-den]"); if (b) vybratDen(b.dataset.den); };
  }
  function vybratDen(d) {
    const segodnya = new Date().toLocaleDateString("sv-SE");
    den = d >= segodnya ? "" : d;
    bylo = null; vidno = new Set();
    zagruzit();
  }

  /* ── карточки ──────────────────────────────────────────────────── */
  function karta(zag, h, html) {
    const k = $("bkKarta");
    k.innerHTML = `<div class="bkKarta__zag"><span>● ${esc(zag)}</span><button type="button" id="bkZakryt">✕</button></div><h2>${h}</h2>${html}`;
    k.hidden = false;
    $("bkZakryt").onclick = () => { k.hidden = true; };
  }
  function grafikRyad(ryad, dni, w = 1030, h = 220) {
    const v = ryad.map((q) => (q == null ? null : +q)), est = v.filter((q) => q != null);
    if (est.length < 2) return "";
    const lo = Math.min(...est) * 0.95, hi = Math.max(...est);
    const x = (i) => 40 + i * (w - 50) / (v.length - 1), y = (q) => 14 + (h - 40) * (hi - q) / ((hi - lo) || 1);
    const pts = v.map((q, i) => (q == null ? null : `${x(i).toFixed(1)},${y(q).toFixed(1)}`)).filter(Boolean).join(" ");
    let s = `<svg viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${C.svoy}" stroke-width="2.2"/>`;
    v.forEach((q, i) => { if (q != null && (i % 7 === 0 || i === v.length - 1)) s += `<circle cx="${x(i)}" cy="${y(q)}" r="3" fill="${C.svoy}"/><text x="${x(i)}" y="${y(q) - 8}" fill="#cfdce4" font-size="11" text-anchor="middle">${tys(q)}</text><text x="${x(i)}" y="${h - 6}" fill="#46606f" font-size="10" text-anchor="middle">${ddmm(dni[i])}</text>`; });
    return s + "</svg>";
  }
  function kartaZony(z) {
    const dni = (D.история || []).map((q) => q.день);
    const r = (z.ряд || []).filter((q) => q != null);
    const nedelya = r.length > 7 ? r[r.length - 1] - r[r.length - 8] : null;
    karta(`ЗОНА · ${z.зона}`, `${f(z.штук)} шт · ${f(z.sku)} SKU · ${f(z.контейнеров)} контейнеров`,
      `<p>За неделю ${nedelya == null ? "—" : `${nedelya > 0 ? "выросла на" : "уменьшилась на"} ${f(Math.abs(nedelya))} шт`}; за 50 дней — от ${f(Math.min(...r))} до ${f(Math.max(...r))}.</p>`
      + grafikRyad(z.ряд || [], dni) + '<p>Полная выгрузка по актам — в хитмапе, «Бэклог ФБ» → Excel.</p>');
  }
  function kartaCheloveka(p) {
    const ch = Array.from({ length: 24 }, (_, h) => (p.часы || {})[String(h)] || 0);
    const mk = Math.max(1, ...ch);
    let svg = '<svg viewBox="0 0 1030 170">';
    ch.forEach((v, h) => { const x = 20 + h * 42, hh = 120 * v / mk; if (v) svg += `<rect x="${x}" y="${140 - hh}" width="34" height="${hh}" fill="${C.svoy}" fill-opacity=".8"/><text x="${x + 17}" y="${134 - hh}" fill="#cfdce4" font-size="11" text-anchor="middle">${v}</text>`; svg += `<text x="${x + 17}" y="160" fill="#46606f" font-size="10" text-anchor="middle">${h}:00</text>`; });
    svg += "</svg>";
    const kat = Object.entries(p.категории || {}).sort((a, b) => b[1] - a[1]);
    const moi = (D.лента || []).filter((x) => x.кто === p.кто).slice(0, 12);
    karta(`КТО РАЗБИРАЕТ · ${ddmm(D.день)}`, `${esc(p.кто)}: ${f(p.штук)} шт, с ${p.с} до ${p.по}`,
      `<p>${D.сегодня ? `За последний час ${f(p.за_час)} шт.` : ""} Работал ${Object.keys(p.часы || {}).length} ч, в среднем ${f(p.штук / Math.max(1, Object.keys(p.часы || {}).length))} шт в час работы.</p>`
      + svg + `<table><thead><tr><th>куда разобрал (категория)</th><th>штук</th></tr></thead><tbody>${kat.map(([k, v]) => `<tr><td>${esc(k === "—" ? "без категории" : k)}</td><td>${f(v)}</td></tr>`).join("")}</tbody></table>`
      + (moi.length ? `<table><thead><tr><th>последние</th><th>товар</th><th>паллета</th></tr></thead><tbody>${moi.map((x) => `<tr><td>${esc(x.когда)}</td><td>${esc(x.товар)}</td><td>${esc(x.паллета)}</td></tr>`).join("")}</tbody></table>` : ""));
  }

  /* ── загрузка ──────────────────────────────────────────────────── */
  async function zagruzit() {
    try {
      const proba = new URLSearchParams(location.search).get("data");   // ?data= — проверка на копиях ответа
      const r = await fetch(proba ? `${proba}ekran_${den || "segodnya"}.json` : `/__ekran/dannye${den ? `?den=${den}` : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) throw new Error(r.status);
      D = await r.json();
      $("bkZhivo").className = D.сегодня ? "" : "is-ist";
      $("bkRezhim").textContent = D.сегодня ? "ЖИВЬЁМ · РАЗ В 5 СЕКУНД" : `ПРОШЛЫЙ ДЕНЬ · ${ddmm(D.день)}`;
      $("bkRezhim").className = D.сегодня ? "" : "is-ist";
      $("bkObn").textContent = `обновлено ${D.сейчас.slice(11, 19)}`;
      glavnoe(); denGrafik(); zony(); lezhit(); lyudi(); kudaOtkuda(); lenta(); istoriya(); dniKnopki();
    } catch (e) {
      $("bkZhivo").className = "is-off";
      $("bkObn").textContent = "нет связи, пробую снова";
    }
  }

  function chasy() { $("bkChasy").textContent = new Date().toTimeString().slice(0, 5); }
  addEventListener("resize", vpisat);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("bkKarta").hidden = true;
    const ist = (D?.история || []).map((q) => q.день).concat([new Date().toLocaleDateString("sv-SE")]);
    const tek = D?.день || "";
    const i = ist.indexOf(tek);
    if (e.key === "ArrowLeft" && i > 0) vybratDen(ist[i - 1]);
    else if (e.key === "ArrowRight" && i >= 0 && i < ist.length - 1) vybratDen(ist[i + 1]);
    else if (e.key === "End") vybratDen(ist[ist.length - 1]);
  });
  $("bkPolnyi").addEventListener("click", () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}));
  vpisat(); chasy();
  setInterval(chasy, 10000);
  zagruzit();
  setInterval(() => { if (!den) zagruzit(); }, 5000);
  setTimeout(() => location.reload(), 6 * 3600 * 1000);
})();
