// Паноптикум два (тест): производительность по людям направления по работе с
// браком. 29.09.2026, Степан: «стиль не понравился — простыня по каждому
// сотруднику… предложи пару вариантов». Поэтому два вида на выбор:
//
//   Шкала     — у бригады своя дорожка, человек — точка по производительности
//               (размер — сколько смен), медиана бригады — риска. Клик по точке —
//               карточка справа с графиком по дням.
//   Календарь — люди по бригадам строками, дни столбцами, цвет клетки — как
//               смена соотносится с обычной сменой бригады.
//
// Мера на выбор, как и раньше:
//   По бригадам  — действий в WMS за смену к медиане своей бригады (100 %);
//   Нормо-смены  — разная работа приведена к одной мерке (1,0 — обычная смена).
//
// Данные — ../../data/panopticum-dva.json (сборка sobrat.py). Состав — ФОТ.

(() => {
  "use strict";

  const MES = { "2026-06": "июнь", "2026-07": "июль", "2026-08": "август", "2026-09": "сентябрь", "всего": "все 4 месяца" };
  const DNI = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
  const cel = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const odin = (v) => (Number(v) || 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  const dva = (v) => (Number(v) || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (v) => `${Math.round((Number(v) || 0) * 100)}%`;
  const dayLabel = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  const kratko = (fio) => { const [f, i, o] = String(fio).split(" "); return `${f} ${i ? i[0] + "." : ""}${o ? o[0] + "." : ""}`; };
  const inicialy = (fio) => String(fio).split(" ").slice(0, 2).map((w) => w[0] || "").join("");

  const s = { data: null, vid: "shkala", mera: "brig", mesyac: "всего", brig: "", otkryt: "" };
  // Меньше пяти смен — цифра случайная: три удачных дня дают 280 % медианы.
  const MALO_SMEN = 5;

  const svodka = (p) => (s.mesyac === "всего" ? p.всего : p.по_месяцам[s.mesyac]) || {};
  /** Значение человека в выбранной мере: доля к медиане бригады или нормо-смены. */
  const znach = (p) => { const sv = svodka(p); return s.mera === "brig" ? sv.к_бригаде : sv.индекс; };
  const podpisZnach = (v) => (s.mera === "brig" ? pct(v) : dva(v));
  const cvet = (v) => (v >= 1.15 ? "up" : v <= 0.85 ? "down" : "mid");
  const lyudi = () => s.data.люди.filter((p) => !s.brig || p.бригада === s.brig);
  const brigady = () => s.data.бригады.filter((b) => !s.brig || b.бригада === s.brig);

  /* ── Вид «Шкала» ─────────────────────────────────────────────────────── */

  function shkala() {
    const MAX = 3;                 // шкала 0 … 300 % (или 0 … 3 нормо-смены)
    const x = (v) => Math.min(v, MAX) / MAX * 100;
    const delenia = [0, 0.5, 1, 1.5, 2, 2.5, 3];
    const dorozhki = brigady().map((b) => {
      const chleny = s.data.люди.filter((p) => p.бригада === b.бригада);
      const est = chleny.filter((p) => svodka(p).смен && znach(p) != null);
      const bez = chleny.filter((p) => !svodka(p).смен);
      const v = b.по_месяцам[s.mesyac] || {};
      // Простой «рой»: точки с близким x раскладываем по ярусам, чтобы не слипались.
      const yarusy = [];
      const tochki = [...est].sort((a, c) => znach(a) - znach(c)).map((p) => {
        const px = x(znach(p));
        let yar = 0;
        while ((yarusy[yar] || []).some((q) => Math.abs(q - px) < 2.6)) yar++;
        (yarusy[yar] = yarusy[yar] || []).push(px);
        const sv = svodka(p);
        const r = Math.max(7, Math.min(17, Math.sqrt(sv.смен) * 2.3));
        const malo = sv.смен < MALO_SMEN;
        const sm = yar === 0 ? 0 : (yar % 2 ? -1 : 1) * Math.ceil(yar / 2) * 17;
        return `<button type="button" class="dvDot is-${cvet(znach(p))}${malo ? " is-malo" : ""}${s.otkryt === p.логин ? " is-on" : ""}"
          data-login="${esc(p.логин)}" style="left:${px.toFixed(2)}%;--sm:${sm}px;--r:${r.toFixed(1)}px"
          title="${esc(p.фио)} · ${podpisZnach(znach(p))} · ${sv.смен} смен${malo ? " (мало смен)" : ""}">
          <span>${esc(inicialy(p.фио))}</span></button>`;
      }).join("");
      const vysota = Math.max(64, 34 + Math.max(yarusy.length, 1) * 17);
      return `
        <div class="dvLane">
          <div class="dvLane__kto">
            <b>${esc(b.бригада.replace("Бригада ", ""))}</b>
            <span>${v.работали || 0} из ${b.людей} · ${cel(v.смен)} смен</span>
            <span>${s.mera === "brig" ? `медиана ${odin(v.на_смену)} за смену` : `медиана ${v.индекс == null ? "—" : dva(v.индекс)}`}</span>
            ${bez.length ? `<em title="${esc(bez.map((p) => kratko(p.фио)).join(", "))}">без смен: ${bez.length}</em>` : ""}
          </div>
          <div class="dvLane__pole" style="height:${vysota}px">
            ${delenia.map((d) => `<i class="dvGrid${d === 1 ? " is-med" : ""}" style="left:${x(d)}%"></i>`).join("")}
            ${tochki}
          </div>
        </div>`;
    }).join("");
    return `
      <div class="dvShkala">
        <div class="dvShkala__os"><span></span><div>${delenia.map((d) => `<em style="left:${x(d)}%">${s.mera === "brig" ? `${Math.round(d * 100)}%` : odin(d)}</em>`).join("")}</div></div>
        ${dorozhki}
        <p class="dvNote">${s.mera === "brig" ? "Риска — медиана своей бригады (100%)." : "Риска — обычная смена (1,00)."}
          Размер точки — сколько смен. Полупрозрачные — меньше ${MALO_SMEN} смен, цифра случайная. Правее 300% — у края.</p>
      </div>`;
  }

  /* ── Вид «Календарь» ────────────────────────────────────────────────── */

  function kalendar() {
    const vseDni = [...new Set(s.data.люди.flatMap((p) => p.дни.map((d) => d.день)))].sort()
      .filter((d) => s.mesyac === "всего" ? d >= "2026-09-01" : d.startsWith(s.mesyac));
    const pole = s.mera === "brig" ? "действий" : "индекс";
    const stroki = brigady().map((b) => {
      const chleny = s.data.люди.filter((p) => p.бригада === b.бригада);
      // Обычная смена бригады — медиана значения за смену у всех её людей.
      const vse = chleny.flatMap((p) => p.дни.filter((d) => d.смена).map((d) => d[pole])).sort((a, c) => a - c);
      const med = vse.length ? vse[Math.floor(vse.length / 2)] : 1;
      const lyudiB = chleny.filter((p) => p.дни.some((d) => vseDni.includes(d.день)))
        .sort((a, c) => (znach(c) || 0) - (znach(a) || 0));
      if (!lyudiB.length) return "";
      return `<div class="dvCal__brig">${esc(b.бригада.replace("Бригада ", ""))}<span>обычная смена — ${s.mera === "brig" ? `${cel(med)} действий` : dva(med)}</span></div>`
        + lyudiB.map((p) => {
          const po = new Map(p.дни.map((d) => [d.день, d]));
          return `<div class="dvCal__row${s.otkryt === p.логин ? " is-on" : ""}" data-login="${esc(p.логин)}">
            <span class="dvCal__kto">${esc(kratko(p.фио))}</span>
            ${vseDni.map((den) => {
              const d = po.get(den);
              if (!d) return `<i class="dvCell is-net"></i>`;
              const k = d[pole] / (med || 1);
              const sila = Math.min(1, Math.abs(k - 1) / 0.9);
              const kl = !d.смена ? "is-sled" : k >= 1 ? "is-up" : "is-down";
              return `<i class="dvCell ${kl}" style="--a:${(0.18 + sila * 0.82).toFixed(2)}"
                title="${esc(kratko(p.фио))} · ${DNI[new Date(`${den}T12:00:00`).getDay()]}, ${dayLabel(den)}: ${s.mera === "brig" ? `${cel(d.действий)} действий` : `${dva(d.индекс)} нормо-смены`} · ${pct(k)} обычной смены${d.смена ? "" : " · не смена"}"></i>`;
            }).join("")}
          </div>`;
        }).join("");
    }).join("");
    const shapka = vseDni.map((den) => {
      const dt = new Date(`${den}T12:00:00`);
      return `<em class="${[0, 6].includes(dt.getDay()) ? "is-vyh" : ""}">${den.slice(8, 10)}</em>`;
    }).join("");
    return `
      <div class="dvCal" style="--dney:${vseDni.length}">
        <div class="dvCal__head"><span class="dvCal__kto">${s.mesyac === "всего" ? "сентябрь" : MES[s.mesyac]}</span>${shapka}</div>
        ${stroki}
        <p class="dvNote"><i class="dvCell is-up" style="--a:.9"></i> выше обычной смены бригады ·
          <i class="dvCell is-down" style="--a:.9"></i> ниже · <i class="dvCell is-sled"></i> мелкие следы, не смена ·
          пусто — не работал. ${s.mesyac === "всего" ? "За все 4 месяца календарь не влезает — показан сентябрь, месяц выбирается сверху." : ""}</p>
      </div>`;
  }

  /* ── Карточка человека ──────────────────────────────────────────────── */

  function kartochka() {
    const p = s.data.люди.find((x) => x.логин === s.otkryt);
    if (!p) {
      return `<div class="dvCard dvCard--pusto"><b>Нажмите на человека</b>
        <span>Покажу, сколько он делает за смену, чем занимается и как шли дни.</span></div>`;
    }
    const sv = svodka(p);
    const v = znach(p);
    const vidy = Object.entries(sv.виды || {}).slice(0, 5);
    return `
      <div class="dvCard">
        <div class="dvCard__top">
          <span class="dvAva is-${v == null ? "mid" : cvet(v)}">${esc(inicialy(p.фио))}</span>
          <div><b>${esc(p.фио)}</b><span>${esc(p.должность || "")} · ${esc(p.бригада)} · ${esc(p.график || "")}</span></div>
          <button type="button" class="dvCard__x" data-zakryt aria-label="Закрыть">×</button>
        </div>
        <div class="dvCard__cifry">
          <div><b>${sv.смен || 0}</b><span>смен${sv.следов_дней ? ` · +${sv.следов_дней} со следами` : ""}</span></div>
          <div><b>${sv.смен ? odin(sv.на_смену) : "—"}</b><span>действий за смену</span></div>
          <div><b class="is-${v == null ? "mid" : cvet(v)}">${v == null ? "—" : podpisZnach(v)}</b><span>${s.mera === "brig" ? "медианы бригады" : "нормо-смен"}</span></div>
          <div><b>${sv.часов_в_wms ? `${odin(sv.часов_в_wms)} ч` : "—"}</b><span>в WMS за смену</span></div>
        </div>
        ${vidy.length ? `<div class="dvCard__vidy">${vidy.map(([vid, n]) => {
          const d = n / (sv.действий || 1);
          return `<div><span>${esc(vid.replace("Документы: ", "док.: "))}</span><i style="width:${Math.max(2, d * 100).toFixed(1)}%"></i><em>${pct(d)}</em></div>`;
        }).join("")}</div>` : ""}
        <div class="dvCard__graf" data-grafik></div>
      </div>`;
  }

  function grafikCheloveka(p) {
    // В узкой карточке больше месяца точек не читается — показываем последние 30 дней.
    const dni = p.дни.filter((d) => s.mesyac === "всего" || d.день.startsWith(s.mesyac)).slice(-30);
    if (!dni.length || !window.ViGrafik) return null;
    const brig = s.mera === "brig";
    return window.ViGrafik.sozdat({
      tochki: dni.map((d) => {
        const dt = new Date(`${d.день}T12:00:00`);
        return {
          znach: brig ? d.действий : d.индекс,
          os: dayLabel(d.день),
          zag: `${DNI[dt.getDay()]}, ${dayLabel(d.день)}${d.смена ? "" : " · не смена"}`,
          tusklo: !d.смена,
          krasnaya: !d.смена,
          dop: [
            brig ? `нормо-смен ${dva(d.индекс)}` : `${cel(d.действий)} действий`,
            d.часы && d.часы[0] != null ? `в WMS с ${d.часы[0]}:00 до ${d.часы[1]}:59` : "",
            ...Object.entries(d.виды || {}).map(([vid, n]) => `${esc(vid)} — ${cel(n)}`),
          ].filter(Boolean),
        };
      }),
      format: brig ? (v) => window.ViGrafik.shortNumber(v) : (v) => dva(v),
      formatTochno: brig ? cel : dva,
      edinica: brig ? "действий" : "нормо-смены",
      trend: 7,
      mediana: true,
      legendaLinii: brig ? "действий за день" : "нормо-смен за день",
      legendaKrasnaya: `меньше ${s.data.смена_от} действий — не смена`,
      vysota: 190,
    });
  }

  /* ── Сборка ─────────────────────────────────────────────────────────── */

  function narisovat() {
    document.querySelector(".vgTip")?.setAttribute("hidden", "");
    document.getElementById("dvLead").innerHTML = s.mera === "brig"
      ? `<b>По бригадам.</b> Действий в WMS за смену к медиане своей бригады: 100% — середина бригады. Сравнивать бригады между собой так нельзя — у них разная работа.`
      : `<b>Нормо-смены.</b> Действие отнесено к виду работы по маршруту «зона → зона», у вида своя норма за смену; <b>1,00 — обычная смена такой работы</b>, чем бы человек ни занимался. Сравнимы все со всеми.`;
    document.getElementById("dvBody").innerHTML = `
      <div class="dvLayout">
        <div class="dvMain">${s.vid === "shkala" ? shkala() : kalendar()}</div>
        <aside class="dvSide">${kartochka()}</aside>
      </div>
      ${s.mera === "vid" ? normyBlok() : ""}`;
    const mesto = document.querySelector("[data-grafik]");
    if (mesto) {
      const p = s.data.люди.find((x) => x.логин === s.otkryt);
      const g = p && grafikCheloveka(p);
      if (g) mesto.append(g);
    }
    const on = (sel, pole, znachenie) => document.querySelectorAll(sel).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[pole] === znachenie)));
    on("#dvVid button", "vid", s.vid);
    on("#dvMera button", "mera", s.mera);
    on("#dvMonths button", "m", s.mesyac);
    on("#dvBrig button", "b", s.brig);
  }

  function normyBlok() {
    return `<details class="dvNormy">
      <summary>Нормы видов работы — откуда берётся «1,00»</summary>
      <table><thead><tr><th>Вид работы</th><th>Норма, действий за смену</th><th>Полных смен в основе</th><th>Как посчитана</th></tr></thead>
      <tbody>${s.data.нормы.map((n) => `<tr><td>${esc(n.вид)}</td><td>${odin(n.норма)}</td><td>${n.чистых_дней}</td><td>${esc(n.как)}</td></tr>`).join("")}</tbody></table>
      <p>Взял на стол, обработал со стола и переложил на столе — одна «работа на столе». Один вид даёт за день не больше 1,5 нормо-смены.</p>
    </details>`;
  }

  function zapustit(data) {
    s.data = data;
    // Адрес держит вид, меру и человека — такой ссылкой можно поделиться:
    // #kalendar, #normo, #chel=Логин.
    const hash = decodeURIComponent(location.hash || "");
    if (hash.includes("kalendar")) s.vid = "kalendar";
    if (hash.includes("normo")) s.mera = "vid";
    const chel = hash.match(/chel=([\w.-]+)/);
    if (chel) s.otkryt = chel[1];
    document.getElementById("stamp").textContent =
      `собрано ${data.обновлено} · WMS с ${dayLabel(data.период.с)} по ${dayLabel(data.период.по)} · ${data.люди.length} человек`;
    document.getElementById("dvMonths").innerHTML = [...data.месяцы, "всего"]
      .map((m) => `<button type="button" data-m="${m}">${MES[m] || m}</button>`).join("");
    document.getElementById("dvBrig").innerHTML = `<button type="button" data-b="">все бригады</button>`
      + data.бригады.map((b) => `<button type="button" data-b="${esc(b.бригада)}">${esc(b.бригада.replace("Бригада ", ""))}</button>`).join("");
    document.getElementById("dvFoot").innerHTML = `
      <p>Следы — только WMS: перемещения по маршрутам и документы. Работа без сканов сюда не попадает, поэтому
        низкая цифра — повод посмотреть, а не вывод. Смена — день от ${data.смена_от} действий.</p>
      <p>Тестовая сборка: данные сняты один раз, не обновляются по расписанию.</p>`;

    const klik = (id, pole, kuda) => document.getElementById(id).addEventListener("click", (e) => {
      const b = e.target.closest(`[data-${pole}]`); if (!b) return;
      s[kuda] = b.dataset[pole]; narisovat();
    });
    klik("dvVid", "vid", "vid");
    klik("dvMera", "mera", "mera");
    klik("dvMonths", "m", "mesyac");
    klik("dvBrig", "b", "brig");
    document.getElementById("dvBody").addEventListener("click", (e) => {
      if (e.target.closest("[data-zakryt]")) { s.otkryt = ""; narisovat(); return; }
      const r = e.target.closest("[data-login]"); if (!r) return;
      s.otkryt = s.otkryt === r.dataset.login ? "" : r.dataset.login; narisovat();
    });
    narisovat();
  }

  fetch("../../data/panopticum-dva.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(zapustit)
    .catch((err) => { document.getElementById("stamp").textContent = `данные не загрузились: ${err.message}`; });
})();
