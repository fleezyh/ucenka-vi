/* Общий график сайта — тот самый, что в хитмапе (29.09.2026, Степан: «графики
   сделай человеческие, как в хитмапе красивые… в производительности тоже
   такие нужны»). Один модуль на все разделы, чтобы графики не расходились.

   Что умеет, как в хитмапе:
   • плавная линия (монотонный сплайн — не рисует провал, которого нет) с
     мягкой синей заливкой;
   • число над каждой точкой: у провала — снизу, чтобы не садилось на линию;
     на длинном ряду — столбиком или через одну;
   • перекрестье и карточка-подсказка при наведении — не нужно целиться в
     точку в пять пикселей;
   • скользящее среднее за неделю, медиана пунктиром, прошлый период точками,
     выброс красным у потолка шкалы — всё по желанию;
   • шкала с ровными делениями («500 тыс», «1 млн»), даты под точками.
   Сверх хитмапа: пропуск (null) рвёт линию, «прогноз» — пунктиром, лишние
   линии (например, лимит) и клик по точке.

   ViGrafik.sozdat({
     tochki: [{ znach, os, zag, dop: ["строка подсказки", …], vid: "prognoz", vybrano }],
     edinica: "₽",               // в подсказке после числа
     format: (v) => "…",          // подпись над точкой и шкала (по умолчанию «тыс/млн»)
     formatTochno: (v) => "…",    // крупное число в подсказке
     otNulya: true,               // шкала от нуля (поток) или по данным (уровень)
     trend: 7,                    // окно скользящего среднего, 0 — без него
     mediana: true, vybros: true,
     prizrak: [числа], prizrakPodpis: "август, те же дни",
     linii: [{ znach: [числа|null], klass: "limit", podpis: "лимит ШР" }],
     legendaLinii: "день", vysota: 280,
     klik: (i) => {},             // клик по точке
   }) → HTMLElement
*/
(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function niceNumber(value) {
    const abs = Math.abs(value);
    const digits = abs >= 10 ? 0 : abs >= 1 ? 1 : abs > 0 ? 2 : 0;
    return value.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function shortNumber(value) {
    const abs = Math.abs(value);
    if (abs >= 1e6) return `${niceNumber(value / 1e6)} млн`;
    if (abs >= 10000) return `${Math.round(value / 1000).toLocaleString("ru-RU")} тыс`;
    return niceNumber(value);
  }

  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q;
    const low = Math.floor(pos);
    return sorted[low + 1] !== undefined ? sorted[low] + (pos - low) * (sorted[low + 1] - sorted[low]) : sorted[low];
  }

  function rolling(values, window) {
    return values.map((_, index) => {
      const slice = values.slice(Math.max(0, index - window + 1), index + 1).filter((v) => v != null);
      return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : null;
    });
  }

  function niceTicks(low, high, count = 4) {
    const raw = (high - low || Math.abs(high) || 1) / count;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * power).find((s) => s >= raw * 0.999);
    const from = Math.floor(low / step + 1e-9) * step;
    const to = Math.ceil(high / step - 1e-9) * step || step;
    const ticks = [];
    for (let v = from; v <= to + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
    return { ticks, from, to };
  }

  /** Монотонный сплайн: кривая не уходит за точки. */
  function smoothPath(pts) {
    const f = (v) => v.toFixed(1);
    if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])},${f(p[1])}`).join(" ");
    const n = pts.length;
    const m = [];
    for (let i = 0; i < n - 1; i++) m[i] = (pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]);
    const t = [m[0]];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    t[n - 1] = m[n - 2];
    for (let i = 0; i < n - 1; i++) {
      if (!m[i]) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const h = (pts[i + 1][0] - pts[i][0]) / 3;
      d += ` C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
    }
    return d;
  }

  /** Непрерывные куски ряда: null рвёт линию. */
  function kuski(values) {
    const out = [];
    let cur = [];
    values.forEach((v, i) => {
      if (v == null || Number.isNaN(v)) { if (cur.length) out.push(cur); cur = []; } else cur.push(i);
    });
    if (cur.length) out.push(cur);
    return out;
  }

  function svgNode(name, attrs, parent) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
    if (parent) parent.appendChild(node);
    return node;
  }

  let tip = null;
  function showTip(html, event) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "vgTip";
      document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const box = tip.getBoundingClientRect();
    let left = event.clientX + 16;
    let top = event.clientY - box.height - 14;
    if (left + box.width > window.innerWidth - 8) left = event.clientX - box.width - 16;
    if (top < 8) top = event.clientY + 16;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  function hideTip() { if (tip) tip.hidden = true; }

  let nomer = 0;

  function sozdat(o) {
    const list = o.tochki || [];
    const n = list.length;
    const format = o.format || shortNumber;
    const formatTochno = o.formatTochno || niceNumber;
    const edinica = o.edinica ? ` ${o.edinica}` : "";
    const values = list.map((p) => (p.znach == null ? null : Number(p.znach)));
    const est = values.filter((v) => v != null);
    const otNulya = o.otNulya !== false;
    const sorted = [...est].sort((a, b) => a - b);
    const prizrak = o.prizrak || [];
    const linii = o.linii || [];

    const wrap = document.createElement("div");
    if (!n || !est.length) {
      wrap.className = "vg vg--pusto";
      wrap.textContent = o.pusto || "данных нет";
      return wrap;
    }

    // Выброс не сплющивает ряд: потолок по перцентилю, сам день — у потолка красным.
    let cap = Infinity;
    if (o.vybros && est.length >= 10) {
      const p90 = quantile(sorted, 0.9);
      if (p90 > 0 && sorted[sorted.length - 1] > p90 * 2.5) cap = Math.max(quantile(sorted, 0.95) * 1.15, p90 * 1.6);
    }
    const shown = (v) => Math.min(v, cap);
    const seen = est.map(shown)
      .concat(prizrak.filter((v) => v != null).map(shown))
      .concat(linii.flatMap((l) => (l.znach || []).filter((v) => v != null).map(Number)));
    let low = otNulya ? Math.min(0, ...seen) : Math.min(...seen);
    let high = otNulya ? Math.max(0, ...seen) : Math.max(...seen);
    if (!otNulya) {
      const pad = (high - low) * 0.15 || Math.abs(high) * 0.01 || 1;
      low -= pad;
      high += pad;
    }
    if (high === low) high = low + 1;
    const nice = niceTicks(low, high, 4);
    const from = otNulya ? nice.from : Math.max(nice.from, low);
    const to = Math.min(nice.to, high + (high - low) * 0.06);
    const ticks = nice.ticks.filter((tick) => tick >= from - 1e-9 && tick <= to + 1e-9);

    const mode = n <= 31 ? "flat" : n <= 125 ? "tall" : "sparse";
    const W = 1000;
    const H = o.vysota || 280;
    const padTop = mode === "flat" ? 30 : 62;
    const padBottom = mode === "flat" ? 24 : 10;
    const padX = n > 1 ? 16 : 0;
    const x = (i) => (n === 1 ? W / 2 : padX + (i / (n - 1)) * (W - 2 * padX));
    const y = (v) => padTop + (1 - (shown(v) - from) / (to - from)) * (H - padTop - padBottom);
    const pct = (v, total) => `${((v / total) * 100).toFixed(3)}%`;
    const id = `vgZaliv${++nomer}`;

    const svg = svgNode("svg", { class: "vg__svg", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" });
    svg.style.height = `${H}px`;
    const grad = svgNode("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 }, svgNode("defs", {}, svg));
    svgNode("stop", { offset: "0%", "stop-color": "#4d8df7", "stop-opacity": 0.36 }, grad);
    svgNode("stop", { offset: "100%", "stop-color": "#4d8df7", "stop-opacity": 0.02 }, grad);

    list.forEach((p, i) => {
      if (!p.vybrano || n < 2) return;
      const w = (W - 2 * padX) / (n - 1);
      svgNode("rect", { class: "vg__band", x: x(i) - w / 2, y: 0, width: w, height: H }, svg);
    });
    for (const tick of ticks) {
      svgNode("line", { class: tick === 0 && from < 0 ? "vg__zero" : "vg__grid", x1: 0, x2: W, y1: y(tick), y2: y(tick) }, svg);
    }
    const median = quantile(sorted, 0.5);
    if (o.mediana && est.length >= 5) svgNode("line", { class: "vg__median", x1: 0, x2: W, y1: y(median), y2: y(median) }, svg);

    if (prizrak.filter((v) => v != null).length > 1) {
      for (const k of kuski(prizrak)) {
        if (k.length > 1) svgNode("path", { class: "vg__ghost", d: smoothPath(k.map((i) => [x(i), y(prizrak[i])])) }, svg);
      }
    }
    for (const l of linii) {
      for (const k of kuski(l.znach || [])) {
        if (k.length > 1) svgNode("path", { class: `vg__extra vg__extra--${l.klass || "limit"}`, d: smoothPath(k.map((i) => [x(i), y(l.znach[i])])) }, svg);
      }
    }

    const base = (otNulya ? y(Math.max(0, from)) : H - padBottom).toFixed(1);
    for (const k of kuski(values)) {
      const pts = k.map((i) => [x(i), y(values[i])]);
      const d = smoothPath(pts);
      svgNode("path", { class: "vg__area", fill: `url(#${id})`, d: `${d} L${pts[pts.length - 1][0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z` }, svg);
      // Сплошная часть — факт, пунктир — прогноз (прогноз продолжает факт).
      const fakt = k.filter((i) => list[i].vid !== "prognoz");
      const prog = k.filter((i) => list[i].vid === "prognoz");
      if (fakt.length) svgNode("path", { class: "vg__line", d: smoothPath(fakt.map((i) => [x(i), y(values[i])])) }, svg);
      if (prog.length) {
        const s = fakt.length && prog[0] === fakt[fakt.length - 1] + 1 ? [fakt[fakt.length - 1], ...prog] : prog;
        svgNode("path", { class: "vg__line vg__line--prognoz", d: smoothPath(s.map((i) => [x(i), y(values[i])])) }, svg);
      }
    }

    const trend = o.trend ? rolling(values, o.trend) : [];
    const withTrend = o.trend && est.length >= Math.max(10, o.trend + 3);
    if (withTrend) {
      for (const k of kuski(trend)) {
        if (k.length > 1) svgNode("path", { class: "vg__trend", d: smoothPath(k.map((i) => [x(i), y(trend[i])])) }, svg);
      }
    }

    const canvas = document.createElement("div");
    canvas.className = "vg__canvas";
    canvas.appendChild(svg);
    const layer = document.createElement("div");
    layer.className = "vg__dots";
    layer.style.height = `${H}px`;
    const guide = document.createElement("span");
    guide.className = "vg__guide";
    guide.hidden = true;
    layer.appendChild(guide);

    const every = mode === "sparse" ? Math.ceil(n / 60) : 1;
    const dots = [];
    const posledniy = values.reduce((last, v, i) => (v != null ? i : last), -1);
    list.forEach((point, i) => {
      const v = values[i];
      if (v == null) {
        dots.push(null);
        if (point.pustoPodpis) {
          const em = document.createElement("em");
          em.className = "vg__net";
          em.textContent = point.pustoPodpis;
          em.style.left = pct(x(i), W);
          em.style.top = pct((H - padBottom + padTop) / 2, H);
          layer.appendChild(em);
        }
        return;
      }
      const left = pct(x(i), W);
      const top = pct(y(v), H);
      const over = v > cap || point.krasnaya;
      const dot = document.createElement("i");
      dot.className = `${over ? "is-over" : ""}${i === posledniy ? " is-last" : ""}${point.vid === "prognoz" ? " is-prognoz" : ""}`;
      dot.style.left = left;
      dot.style.top = top;
      layer.appendChild(dot);
      dots.push(dot);

      const extreme = v === sorted[sorted.length - 1] || v === sorted[0];
      if (i % every && !extreme && i !== posledniy) return;
      const prev = values[i - 1];
      const next = values[i + 1];
      const valley = mode === "flat" && n > 2 && !over
        && (prev == null || v < prev) && (next == null || v < next);
      const pin = document.createElement("b");
      pin.className = "vg__pin"
        + (valley ? " is-below" : "")
        + (mode !== "flat" ? " is-tall" : "")
        + (i === 0 && mode === "flat" ? " is-first" : "")
        + (i === posledniy ? " is-last" : "")
        + (over ? " is-over" : "")
        + (point.vybrano ? " is-vybrano" : "");
      pin.textContent = format(v);
      pin.style.left = left;
      pin.style.top = top;
      layer.appendChild(pin);
    });
    canvas.appendChild(layer);

    const indexAt = (event) => {
      const box = canvas.getBoundingClientRect();
      const u = ((event.clientX - box.left) / box.width) * W;
      if (n === 1) return 0;
      return Math.max(0, Math.min(n - 1, Math.round(((u - padX) / (W - 2 * padX)) * (n - 1))));
    };
    const tipFor = (i) => {
      const p = list[i];
      const v = values[i];
      const before = values[i - 1];
      const delta = v != null && before ? (v - before) / Math.abs(before) : null;
      return `<b>${p.zag || p.os || ""}</b>`
        + (v == null ? `<strong>${p.pustoPodpis || "нет данных"}</strong>` : `<strong>${formatTochno(v)}${edinica}</strong>`)
        + (withTrend && trend[i] != null ? `<span>среднее за неделю ${format(trend[i])}</span>` : "")
        + (delta === null || o.bezDelty ? "" : `<span>к прошлой точке ${delta >= 0 ? "+" : "−"}${Math.round(Math.abs(delta) * 100)}%</span>`)
        + (prizrak[i] != null ? `<span>${o.prizrakPodpis || "прошлый период"}: ${format(prizrak[i])}</span>` : "")
        + linii.map((l) => (l.znach && l.znach[i] != null ? `<span>${l.podpis}: ${format(l.znach[i])}</span>` : "")).join("")
        + (p.dop || []).map((s) => `<span>${s}</span>`).join("")
        + (v > cap ? "<span class=\"vgTip__over\">выброс — выше шкалы</span>" : "");
    };
    let active = -1;
    canvas.addEventListener("mousemove", (event) => {
      const i = indexAt(event);
      if (i !== active) {
        if (active >= 0 && dots[active]) dots[active].classList.remove("is-on");
        active = i;
        if (dots[i]) dots[i].classList.add("is-on");
        guide.style.left = pct(x(i), W);
        guide.hidden = false;
      }
      showTip(tipFor(i), event);
    });
    canvas.addEventListener("mouseleave", () => {
      if (active >= 0 && dots[active]) dots[active].classList.remove("is-on");
      active = -1;
      guide.hidden = true;
      hideTip();
    });
    if (o.klik) {
      canvas.classList.add("is-klik");
      canvas.addEventListener("click", (event) => { hideTip(); o.klik(indexAt(event)); });
    }

    const scale = document.createElement("div");
    scale.className = "vg__scale";
    scale.style.height = `${H}px`;
    for (const tick of ticks) {
      const mark = document.createElement("span");
      mark.textContent = format(tick);
      mark.style.top = pct(y(tick), H);
      scale.appendChild(mark);
    }
    const plot = document.createElement("div");
    plot.className = "vg__plot";
    plot.append(scale, canvas);

    const axis = document.createElement("div");
    axis.className = "vg__axis";
    const axisStep = o.osVse ? 1 : n <= 31 ? 1 : n <= 62 ? 2 : Math.ceil(n / 30);
    list.forEach((p, i) => {
      if (i !== n - 1 && (i % axisStep || n - 1 - i < axisStep)) return;
      const mark = document.createElement("span");
      if (p.tusklo) mark.className = "is-weekend";
      if (p.vybrano) mark.className = "is-vybrano";
      mark.textContent = p.os || "";
      mark.style.left = pct(x(i), W);
      axis.appendChild(mark);
    });

    const legend = document.createElement("div");
    legend.className = "vg__legend";
    const estProg = list.some((p) => p.vid === "prognoz");
    legend.innerHTML = `<span><i class="k k--line"></i>${o.legendaLinii || "день"}</span>`
      + (estProg ? `<span><i class="k k--prognoz"></i>${o.legendaPrognoz || "прогноз"}</span>` : "")
      + (withTrend ? "<span><i class=\"k k--trend\"></i>среднее за неделю</span>" : "")
      + (o.mediana && est.length >= 5 ? `<span><i class="k k--median"></i>медиана ${format(median)}</span>` : "")
      + (prizrak.filter((v) => v != null).length > 1 ? `<span><i class="k k--ghost"></i>${o.prizrakPodpis || "прошлый период"}</span>` : "")
      + linii.map((l) => `<span><i class="k k--${l.klass || "limit"}"></i>${l.podpis}</span>`).join("")
      + (cap < Infinity ? `<span><i class="k k--over"></i>выше ${format(cap)} — не в масштабе</span>` : "")
      + (list.some((p) => p.krasnaya) ? `<span><i class="k k--over"></i>${o.legendaKrasnaya || "сверх лимита"}</span>` : "");

    wrap.className = `vg vg--${mode}`;
    wrap.append(legend, plot, axis);
    return wrap;
  }

  window.ViGrafik = { sozdat, shortNumber, niceNumber };
})();
