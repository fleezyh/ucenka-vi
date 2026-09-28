/* Графики «Истории по дням» в админке → Посещения (28.09, Степан: «сделать как в хитмапе
   дневные графики, сейчас это картинка»). Сервер кладёт ряд в data-tochki, рисуем здесь:
   линия с заливкой, подписи в пикселях (не растягиваются), подсказка при наведении,
   шаг «дни · недели» и окно «30 · 90 дней» — общие на все три графика. */
(function () {
  "use strict";
  const blok = document.querySelector(".vsGrafiki");
  if (!blok) return;
  const MES = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const DNI = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const segodnya = new Date().toISOString().slice(0, 10);
  let shag = "день";
  let okno = 30;

  const podpis = (iso) => `${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]}`;
  const chislo = (v) => Math.round(v).toLocaleString("ru-RU");
  const ponedelnik = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };

  function ryad(tochki, nedeli) {
    let r = tochki.slice(-okno);
    if (shag === "неделя") {
      const m = new Map();
      for (const [d, v] of r) {
        const k = ponedelnik(d);
        m.set(k, (m.get(k) || 0) + v);
      }
      // Люди за неделю — уникальные с сервера, а не сумма дней (человеко-дни).
      if (nedeli) for (const k of m.keys()) if (k in nedeli) m.set(k, nedeli[k]);
      r = [...m.entries()].map(([k, v]) => {
        const konec = new Date(Date.parse(`${k}T12:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10);
        return [k, v, konec >= segodnya, `неделя ${podpis(k)} — ${podpis(konec)}`];
      });
    } else {
      r = r.map(([d, v]) => [d, v, d === segodnya, `${DNI[new Date(`${d}T12:00:00`).getDay()]}, ${podpis(d)}`]);
    }
    return r;
  }

  function narisovat(el) {
    const tochki = JSON.parse(el.dataset.tochki || "[]");
    const cvet = el.dataset.cvet;
    const r = ryad(tochki, el.dataset.nedeli ? JSON.parse(el.dataset.nedeli) : null);
    const W = Math.max(320, el.clientWidth), H = 190, L = 44, R = 18, T = 26, B = 28;
    const n = r.length;
    const verh = Math.max(1, ...r.map((p) => p[1]));
    const krug = Math.pow(10, Math.floor(Math.log10(verh)));
    const potolok = Math.ceil(verh / krug) * krug;
    const x = (i) => L + (n > 1 ? (i * (W - L - R)) / (n - 1) : (W - L - R) / 2);
    const y = (v) => T + (1 - v / potolok) * (H - T - B);
    const idet = n > 1 && r[n - 1][2];
    const osn = idet ? r.slice(0, -1) : r;
    // гладкая линия (Catmull-Rom → кривые Безье)
    const put = (pts) => pts.map((p, i) => {
      if (!i) return `M${p[0]},${p[1]}`;
      const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p3 = pts[i + 1] || p;
      const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6];
      const c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
      return `C${c1[0]},${Math.min(c1[1], H - B)} ${c2[0]},${Math.min(c2[1], H - B)} ${p[0]},${p[1]}`;
    }).join(" ");
    const pts = osn.map((p, i) => [x(i), y(p[1])]);
    const setka = [0, 0.5, 1].map((f) => {
      const v = potolok * f, yy = y(v);
      return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="vsG__setka"/>`
        + `<text x="${L - 8}" y="${yy + 4}" text-anchor="end" class="vsG__os">${chislo(v)}</text>`;
    }).join("");
    const shagOsi = Math.max(1, Math.ceil(n / 9));
    const os = r.map((p, i) => (i % shagOsi && i !== n - 1) ? "" :
      `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="vsG__os${p[2] ? " is-idet" : ""}">${shag === "неделя" ? podpis(p[0]) : podpis(p[0])}${p[2] ? "*" : ""}</text>`).join("");
    const maxI = r.reduce((b, p, i) => (p[1] > r[b][1] ? i : b), 0);
    // Числа над каждой точкой, как в хитмапе (28.09); при густом ряде — через одну.
    const kazhdaya = n <= 32 ? 1 : 2;
    const metki = r.map((p, i) => (i === maxI || i === n - 1 || i % kazhdaya === 0)
      ? `<text x="${x(i)}" y="${y(p[1]) - 9}" text-anchor="middle" class="vsG__znach">${chislo(p[1])}</text>` : "").join("");
    const hvost = idet
      ? `<path d="M${x(n - 2)},${y(r[n - 2][1])} L${x(n - 1)},${y(r[n - 1][1])}" class="vsG__hvost" stroke="${cvet}"/>`
        + `<circle cx="${x(n - 1)}" cy="${y(r[n - 1][1])}" r="4.5" class="vsG__segodnya" stroke="${cvet}"/>` : "";
    el.innerHTML = `<p class="vsG__zag"><i style="background:${cvet}"></i>${el.dataset.podpis}`
      + `<span>${idet ? (shag === "неделя" ? "* неделя ещё идёт" : "* сегодня ещё идёт") : ""}</span>`
      + `<b>${el.dataset.nedeli ? "" : `всего ${chislo(r.reduce((a, p) => a + p[1], 0))} · `}максимум ${chislo(r[maxI][1])}</b></p>`
      + `<div class="vsG__holst"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${setka}`
      + (pts.length ? `<path d="${put(pts)} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z" fill="${cvet}" fill-opacity=".14"/>`
        + `<path d="${put(pts)}" fill="none" stroke="${cvet}" stroke-width="2.4" stroke-linecap="round"/>` : "")
      + hvost + pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${cvet}"/>`).join("")
      + metki + os + `<line class="vsG__vert" x1="0" x2="0" y1="${T - 8}" y2="${H - B}" stroke="${cvet}"/></svg>`
      + `<div class="vsG__podskazka" hidden></div></div>`;
    const svg = el.querySelector("svg"), pod = el.querySelector(".vsG__podskazka"), vert = el.querySelector(".vsG__vert");
    svg.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      let i = Math.round(((mx - L) / (W - L - R)) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      const p = r[i], pred = r[i - 1];
      const d = pred && pred[1] ? (p[1] - pred[1]) / pred[1] : null;
      vert.setAttribute("x1", x(i)); vert.setAttribute("x2", x(i)); vert.style.opacity = 1;
      pod.hidden = false;
      pod.innerHTML = `<b>${p[3]}${p[2] ? " · идёт" : ""}</b><strong>${chislo(p[1])}</strong>`
        + (d === null ? "" : `<span class="${d >= 0 ? "is-plus" : "is-minus"}">${d >= 0 ? "+" : "−"}${Math.round(Math.abs(d) * 100)}% к ${shag === "неделя" ? "прошлой неделе" : "прошлому дню"}</span>`);
      pod.style.left = `${Math.min(Math.max(x(i) - 80, 0), W - 170)}px`;
    });
    svg.addEventListener("pointerleave", () => { pod.hidden = true; vert.style.opacity = 0; });
  }

  const vse = () => blok.querySelectorAll(".vsGraf").forEach(narisovat);
  blok.addEventListener("click", (e) => {
    const k = e.target.closest("[data-shag], [data-okno]");
    if (!k) return;
    if (k.dataset.shag) shag = k.dataset.shag;
    if (k.dataset.okno) okno = +k.dataset.okno;
    blok.querySelectorAll("[data-shag]").forEach((b) => b.classList.toggle("is-on", b.dataset.shag === shag));
    blok.querySelectorAll("[data-okno]").forEach((b) => b.classList.toggle("is-on", +b.dataset.okno === okno));
    vse();
  });
  let t = 0;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(vse, 150); });
  vse();
})();
