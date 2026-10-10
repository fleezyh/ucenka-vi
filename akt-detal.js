/* Акт целиком — «провалиться в акт» (07.10 ночь, Степан: «понять что с ним детально и посмотреть фотки; снизу в акте —
   провалиться, и оно отдельно подгрузит фотки, а не в основную сессию»).
   · AktDetal.blok(akt) — блок внизу карточки акта: кнопка → отдельный запрос /__akt/detal (своя служебная сессия WMS
     на сервере, не личная сессия сотрудника) → фото, перекладки пикалкой, ошибки ДВК, комментарии прямо в карточке.
   · data-akt-detal="<номер>" на любом элементе — то же целиком в окне (все поля акта).
   · Фото — клик во весь экран, ← → листать, Esc закрыть. */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kesh = new Map();   // акт → { zhdu } | { d } | { oshibka }
  const kl = (akt) => String(akt).replace(/\D/g, "").replace(/^0+/, "");

  async function gruzit(akt) {
    const k = kl(akt);
    const b = kesh.get(k);
    if (b && (b.zhdu || b.d)) return b;
    kesh.set(k, { zhdu: true });
    obnovitBloki(k);
    try {
      const o = await fetch(`/__akt/detal?kod=${encodeURIComponent(k)}`, { cache: "no-store" });
      const j = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(j.ошибка || `сервер ответил ${o.status}`);
      kesh.set(k, { d: j });
    } catch (e) {
      kesh.set(k, { oshibka: e.message || String(e) });
    }
    obnovitBloki(k);
    if (okno && !okno.hidden && oknoAkt === k) risovatOkno();
    return kesh.get(k);
  }
  const kartinki = (d) => (d && d.фото ? d.фото.filter((f) => f.картинка) : []);
  const src = (d, f) => `/__akt/foto?akt=${encodeURIComponent(d.акт)}&id=${encodeURIComponent(f.id)}`;

  function galereya(d) {
    const ft = kartinki(d);
    if (!ft.length) return '<p class="aktDet__pusto">В WMS у акта нет фото.</p>';
    return `<div class="aktDet__galereya">${ft.map((f, i) => `<button type="button" class="aktDet__ft" data-akt-ft="${esc(d.акт)}:${i}" title="${esc(`${f.тип} · ${f.кто} · ${f.когда}`)}"><img loading="lazy" src="${src(d, f)}" alt=""></button>`).join("")}</div>
      <p class="aktDet__pod">фото ${ft.length} · загрузил(а): ${esc([...new Set(ft.map((f) => f.кто))].join(", "))} · ${esc(ft[0].когда)}</p>`;
  }
  function istoriya(d) {
    return `${d.ошибки.length ? `<section><h4>Ошибки ДВК по акту · ${d.ошибки.length}</h4>${d.ошибки.map((o) => `<p class="aktDet__str is-osh"><b>${esc(o.когда)} · ${esc(o.вид)}</b> на ${esc(o.контейнер || "—")} · записал(а) ${esc(o.записал)}${o.виновный ? ` · виновный: ${esc(o.виновный)}` : ""}${o.основание ? `<span>${esc(o.основание)}</span>` : ""}${o.комментарий ? `<span>${esc(o.комментарий)}</span>` : ""}</p>`).join("")}</section>` : ""}
      ${d.комментарии.length ? `<section><h4>Комментарии в WMS</h4>${d.комментарии.map((c) => `<p class="aktDet__str"><b>${esc(c.когда)} · ${esc(c.кто)}</b> ${esc(c.текст)}</p>`).join("")}</section>` : ""}
      ${(d.довоз || []).length ? `<section><h4>Довоз — отложенные и транзитные перекладки</h4>${d.довоз.map((v) => `<p class="aktDet__str${v.st === "err" ? " is-osh" : ""}"><b>${esc(v.когда)} · ${esc(v.кто)} → ${esc(v.куда || "—")} · ${{ ok: "доехала", wait: "в пути", err: "не доехала", skip: "пикнута заново" }[v.st] || ""}</b><span>${esc(v.t)}</span></p>`).join("")}</section>` : ""}
      <section><h4>Перекладки пикалкой · ${d.перекладки.length}</h4>
        ${d.перекладки.length ? d.перекладки.map((p) => `<p class="aktDet__str${p.ошибка ? " is-osh" : ""}"><b>${esc(p.когда)} · ${esc(p.кто)}</b>${p.стол ? ` · ${esc(p.стол)}` : ""}<span>${esc(p.откуда || "—")} → ${esc(p.куда || "—")}</span>${p.ошибка ? `<span>не прошло: ${esc(p.ошибка)}</span>` : ""}</p>`).join("")
          : '<p class="aktDet__pusto">Пикалкой акт не перекладывали.</p>'}
      </section>`;
  }

  /* ---- блок внизу карточки акта ---- */
  function vnutri(k) {
    const b = kesh.get(k);
    if (!b) return `<button type="button" class="aktProval__kn" data-akt-proval-gruz="${esc(k)}"><b>Провалиться в акт</b><span>фото, перекладки, ошибки, комментарии — подгрузится отдельно</span></button>`;
    if (b.zhdu) return '<p class="aktDet__pusto">Гружу акт из WMS отдельно — карточка и пикалка работают дальше…</p>';
    if (b.oshibka) return `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(b.oshibka)}</b></p><button type="button" class="aktPs__kn" data-akt-proval-gruz="${esc(k)}" data-snova="1">ещё раз</button>`;
    return `<div class="aktProval__sh"><h4>Акт изнутри</h4><button type="button" class="aktPs__kn" data-akt-detal="${esc(k)}">все поля акта</button></div>
      ${galereya(b.d)}${istoriya(b.d)}`;
  }
  function blok(akt) {
    const k = kl(akt);
    return k ? `<div class="aktProval" data-akt-proval="${esc(k)}">${vnutri(k)}</div>` : "";
  }
  function obnovitBloki(k) {
    document.querySelectorAll(`[data-akt-proval="${k}"]`).forEach((el) => { el.innerHTML = vnutri(k); });
  }
  /* ---- окно «все поля» ---- */
  let okno = null;
  let oknoAkt = "";
  function risovatOkno() {
    if (!okno) { okno = document.createElement("div"); okno.id = "aktDetal"; okno.className = "cModal aktDet"; document.body.appendChild(okno); }
    const b = kesh.get(oknoAkt) || {};
    const d = b.d;
    const telo = b.zhdu || !b.d ? `<p class="aktDet__pusto">${b.oshibka ? `Не открылось: ${esc(b.oshibka)}` : "Открываю акт в WMS…"}</p>`
      : `<div class="aktDet__kol"><section><h4>Акт</h4><dl class="aktDet__polya">${d.поля.map((p) => `<dt>${esc(p.имя)}</dt><dd>${esc(p.знач)}</dd>`).join("")}</dl></section>
          <section><h4>Фото · ${kartinki(d).length}</h4>${galereya(d)}</section></div>${istoriya(d)}`;
    okno.innerHTML = `<div class="cModal__fon" data-akt-det-zakr="1"></div>
      <section class="cModal__okno cModal__okno--shir aktDet__okno" role="dialog" aria-label="Акт целиком">
        <header class="cModal__sh"><div><b>${d ? `Акт ${esc(d.акт)} · ${esc(d.товар)}` : `Акт ${esc(oknoAkt)}`}</b><span>${d ? `живьём из WMS · ${esc(d.наклейка)}` : ""}</span></div>
          <button type="button" class="cBtn cBtn--sm" data-akt-det-zakr="1">закрыть</button></header>
        <div class="aktDet__telo">${telo}</div></section>`;
    okno.hidden = false;
  }
  function otkryt(akt) { oknoAkt = kl(akt); risovatOkno(); gruzit(oknoAkt); }

  /* ---- фото во весь экран ---- */
  let ves = null;   // { k, i }
  function risovatVes() {
    let el = document.getElementById("aktDetVes");
    const d = ves && (kesh.get(ves.k) || {}).d;
    const ft = kartinki(d);
    if (!ves || !ft[ves.i]) { if (el) el.remove(); ves = null; return; }
    if (!el) { el = document.createElement("div"); el.id = "aktDetVes"; el.className = "aktDet__ves"; el.dataset.aktFtZakr = "1"; document.body.appendChild(el); }
    const f = ft[ves.i];
    el.innerHTML = `<img src="${src(d, f)}" alt="">
      <p>${ves.i + 1} из ${ft.length} · ${esc(f.тип)} · ${esc(f.кто)} · ${esc(f.когда)} · Esc — закрыть, ← → — листать</p>
      ${ft.length > 1 ? '<button type="button" class="aktDet__nazad" data-akt-ft-shag="-1">‹</button><button type="button" class="aktDet__vpered" data-akt-ft-shag="1">›</button>' : ""}`;
  }
  function shag(n) { const k = kartinki((kesh.get(ves.k) || {}).d).length; if (!k) return; ves.i = (ves.i + n + k) % k; risovatVes(); }

  document.addEventListener("click", (e) => {
    const sh = e.target.closest("[data-akt-ft-shag]");
    if (sh && ves) { e.preventDefault(); e.stopPropagation(); shag(Number(sh.dataset.aktFtShag)); return; }
    if (e.target.closest("[data-akt-ft-zakr]")) { e.stopPropagation(); ves = null; risovatVes(); return; }
    const ft = e.target.closest("[data-akt-ft]");
    if (ft) { e.preventDefault(); e.stopPropagation(); const [k, i] = ft.dataset.aktFt.split(":"); ves = { k, i: Number(i) }; risovatVes(); return; }
    const gr = e.target.closest("[data-akt-proval-gruz]");
    if (gr) { e.preventDefault(); e.stopPropagation(); if (gr.dataset.snova) kesh.delete(gr.dataset.aktProvalGruz); gruzit(gr.dataset.aktProvalGruz); return; }
    const otk = e.target.closest("[data-akt-detal]");
    if (otk) { e.preventDefault(); e.stopPropagation(); otkryt(otk.dataset.aktDetal); return; }
    if (okno && !okno.hidden && e.target.closest("[data-akt-det-zakr]")) { e.stopPropagation(); okno.hidden = true; }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (ves) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); ves = null; risovatVes(); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); shag(e.key === "ArrowLeft" ? -1 : 1); }
      return;
    }
    if (okno && !okno.hidden && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); okno.hidden = true; }
  }, true);

  window.AktDetal = { otkryt, blok, gruzit };
})();
