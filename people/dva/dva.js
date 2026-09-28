// Паноптикум два (тест, 29.09.2026): производительность по людям направления
// по работе с браком в двух вариантах.
//
// 1 · По бригадам — действий в WMS за смену, и доля к медиане своей бригады:
//     сравниваем ФБ1 с ФБ1, переупаковку с переупаковкой.
// 2 · По действиям — нормо-смены. Действие отнесено к виду работы по маршруту
//     «зона → зона»; норма вида — медиана полных смен, где этим занимались
//     ≥70 % времени. День = Σ действий вида / норма вида; 1,0 — обычная смена.
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

  const s = { data: null, variant: "brig", mesyac: "всего", brig: "", otkryt: "" };
  // Меньше пяти смен — цифра случайная: три удачных дня дают 280 % медианы.
  const MALO_SMEN = 5;

  function svodka(p) {
    return (s.mesyac === "всего" ? p.всего : p.по_месяцам[s.mesyac]) || {};
  }

  /* Полоса «к медиане бригады» / «индекс»: 100 % (1,0) — риска посередине шкалы 0…2. */
  function polosa(dolya) {
    const w = Math.max(0, Math.min(2, dolya || 0)) / 2 * 100;
    const kl = dolya >= 1.15 ? "is-up" : dolya <= 0.85 ? "is-down" : "is-mid";
    return `<div class="dvBar ${kl}"><i style="width:${w.toFixed(1)}%"></i><s></s></div>`;
  }

  function vidyChips(vidy, vsego) {
    return Object.entries(vidy || {}).slice(0, 3).map(([v, n]) =>
      `<span class="dvChip" title="${esc(v)}: ${cel(n)} действий">${esc(v.replace("Документы: ", "док.: "))} ${pct(n / (vsego || 1))}</span>`).join("");
  }

  function grafikCheloveka(p) {
    const dni = p.дни.filter((d) => s.mesyac === "всего" || d.день.startsWith(s.mesyac));
    if (!dni.length) return "<p class=\"dvNote\">в этот период следов в WMS нет</p>";
    const pokazatel = s.variant === "brig" ? "действий" : "индекс";
    const el = window.ViGrafik.sozdat({
      tochki: dni.map((d) => {
        const dt = new Date(`${d.день}T12:00:00`);
        return {
          znach: d[pokazatel],
          os: dayLabel(d.день),
          zag: `${DNI[dt.getDay()]}, ${dayLabel(d.день)}${d.смена ? "" : " · не смена (мало действий)"}`,
          tusklo: !d.смена,
          krasnaya: !d.смена,
          dop: [
            s.variant === "brig" ? `нормо-смен ${dva(d.индекс)}` : `${cel(d.действий)} действий`,
            d.часы && d.часы[0] != null ? `в WMS с ${d.часы[0]}:00 до ${d.часы[1]}:59` : "",
            ...Object.entries(d.виды || {}).map(([v, n]) => `${esc(v)} — ${cel(n)}`),
          ].filter(Boolean),
        };
      }),
      format: s.variant === "brig" ? (v) => window.ViGrafik.shortNumber(v) : (v) => dva(v),
      formatTochno: s.variant === "brig" ? cel : dva,
      edinica: s.variant === "brig" ? "действий" : "нормо-смены",
      trend: 7,
      mediana: true,
      legendaLinii: s.variant === "brig" ? "действий за день" : "нормо-смен за день",
      legendaKrasnaya: `день меньше ${s.data.смена_от} действий — не смена`,
      vysota: 220,
    });
    const box = document.createElement("div");
    box.append(el);
    return box;
  }

  function strokaCheloveka(p, rang) {
    const sv = svodka(p);
    const net = !sv.смен;
    const malo = !net && sv.смен < MALO_SMEN;
    const dolya = s.variant === "brig" ? sv.к_бригаде : sv.индекс;
    const glavnoe = s.variant === "brig"
      ? `<b>${net ? "—" : odin(sv.на_смену)}</b><small>действий за смену</small>`
      : `<b>${net ? "—" : dva(sv.индекс)}</b><small>нормо-смен за смену</small>`;
    return `
      <div class="dvRow${net ? " is-net" : ""}${malo ? " is-malo" : ""}${s.otkryt === p.логин ? " is-open" : ""}" data-login="${esc(p.логин)}">
        <span class="dvRow__n">${net ? "" : rang}</span>
        <div class="dvRow__kto"><b>${esc(p.фио)}</b><span>${esc(p.должность || "")}${s.variant === "vid" ? " · " + esc(p.бригада) : ""} · ${esc(p.график || "")}</span></div>
        <div class="dvRow__smen"><b>${sv.смен || 0}</b><small>${malo ? "<em class=\"dvMalo\">мало смен</em> " : ""}смен${sv.следов_дней ? ` · +${sv.следов_дней} дн. со следами` : ""}</small></div>
        <div class="dvRow__glav">${glavnoe}</div>
        <div class="dvRow__bar">${net ? "<em>нет смен в WMS</em>" : polosa(dolya)}
          <small>${net ? "" : s.variant === "brig" ? `${pct(dolya)} медианы бригады` : `${pct(dolya)} обычной смены`}</small></div>
        <div class="dvRow__vidy">${net ? "" : vidyChips(sv.виды, sv.действий)}</div>
        <div class="dvRow__chasy">${sv.часов_в_wms ? `<b>${odin(sv.часов_в_wms)} ч</b><small>в WMS за смену</small>` : ""}</div>
      </div>
      ${s.otkryt === p.логин ? `<div class="dvOpen" data-grafik="${esc(p.логин)}"></div>` : ""}`;
  }

  function sortirovka(spisok) {
    const k = (p) => {
      const sv = svodka(p);
      if (!sv.смен) return -1e6;
      const v = s.variant === "brig" ? sv.к_бригаде || 0 : sv.индекс || 0;
      return sv.смен < MALO_SMEN ? v - 1e3 : v;
    };
    return [...spisok].sort((a, b) => k(b) - k(a));
  }

  function narisovat() {
    const d = s.data;
    const lyudi = d.люди.filter((p) => !s.brig || p.бригада === s.brig);
    const body = document.getElementById("dvBody");
    document.querySelector(".vgTip")?.setAttribute("hidden", "");

    document.getElementById("dvLead").innerHTML = s.variant === "brig"
      ? `<b>Вариант 1.</b> Сколько действий в WMS человек делает за смену, и как это соотносится с медианой его бригады
         (100% — середина бригады). Смена — день от ${d.смена_от} действий. Сравнивать ФБ1 с переупаковкой так нельзя: там разная работа — для этого вариант 2.`
      : `<b>Вариант 2.</b> Каждое действие отнесено к виду работы по маршруту «зона → зона». Норма вида — медиана полных смен
         (от 6 часов в WMS), где этим занимались ≥70% времени. День = сумма «сделано / норма» по видам; <b>1,00 — обычная смена такой работы</b>,
         чем бы человек ни занимался. Можно сравнивать всех со всеми.`;

    if (s.variant === "brig") {
      const brigady = d.бригады.filter((b) => !s.brig || b.бригада === s.brig);
      body.innerHTML = brigady.map((b) => {
        const v = b.по_месяцам[s.mesyac] || {};
        const chleny = sortirovka(d.люди.filter((p) => p.бригада === b.бригада));
        let rang = 0;
        return `
          <section class="dvBrig">
            <header class="dvBrig__head">
              <h2>${esc(b.бригада)}</h2>
              <div class="dvBrig__cifry">
                <span><b>${v.работали || 0}</b> из ${b.людей} работали</span>
                <span><b>${cel(v.смен)}</b> смен</span>
                <span><b>${odin(v.на_смену)}</b> действий за смену</span>
                <span><b>${v.индекс == null ? "—" : dva(v.индекс)}</b> нормо-смен (медиана)</span>
              </div>
            </header>
            ${chleny.map((p) => strokaCheloveka(p, svodka(p).смен >= MALO_SMEN ? ++rang : 0)).join("")}
          </section>`;
      }).join("");
    } else {
      let rang = 0;
      body.innerHTML = `
        <section class="dvBrig">
          <header class="dvBrig__head"><h2>Все ${s.brig ? esc(s.brig) : "бригады"} · по нормо-сменам</h2>
            <div class="dvBrig__cifry"><span>1,00 — обычная смена · зелёное выше 1,15 · красное ниже 0,85</span></div></header>
          ${sortirovka(lyudi).map((p) => strokaCheloveka(p, svodka(p).смен >= MALO_SMEN ? ++rang : 0)).join("")}
        </section>
        <details class="dvNormy">
          <summary>Нормы видов работы — откуда берётся «1,00»</summary>
          <table><thead><tr><th>Вид работы</th><th>Норма, действий за смену</th><th>Полных смен в основе</th><th>Как посчитана</th></tr></thead>
          <tbody>${d.нормы.map((n) => `<tr><td>${esc(n.вид)}</td><td>${odin(n.норма)}</td><td>${n.чистых_дней}</td><td>${esc(n.как)}</td></tr>`).join("")}</tbody></table>
          <p>Взял на стол, обработал со стола и переложил на столе — одна «работа на столе»: по отдельности норма «взял» выходит
            заниженной и день задваивается. Один вид даёт за день не больше 1,5 нормо-смены: у редких документов норма в единицы.</p>
        </details>`;
    }

    const mesto = body.querySelector("[data-grafik]");
    if (mesto) {
      const p = d.люди.find((x) => x.логин === mesto.dataset.grafik);
      const g = grafikCheloveka(p);
      if (typeof g === "string") mesto.innerHTML = g; else mesto.append(g);
    }

    document.querySelectorAll("#dvVariant button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.variant === s.variant)));
    document.querySelectorAll("#dvMonths button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === s.mesyac)));
    document.querySelectorAll("#dvBrig button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.b === s.brig)));
  }

  function zapustit(data) {
    s.data = data;
    document.getElementById("stamp").textContent =
      `собрано ${data.обновлено} · WMS с ${dayLabel(data.период.с)} по ${dayLabel(data.период.по)} · ${data.люди.length} человек`;
    document.getElementById("dvMonths").innerHTML = [...data.месяцы, "всего"]
      .map((m) => `<button type="button" data-m="${m}">${MES[m] || m}</button>`).join("");
    document.getElementById("dvBrig").innerHTML = `<button type="button" data-b="">все бригады</button>`
      + data.бригады.map((b) => `<button type="button" data-b="${esc(b.бригада)}">${esc(b.бригада.replace("Бригада ", ""))}</button>`).join("");
    const bez = data.люди.filter((p) => !p.всего.смен).map((p) => kratko(p.фио));
    document.getElementById("dvFoot").innerHTML = `
      <p>Следы — только WMS: перемещения по маршрутам и документы. Работа без сканов (разбор, упаковка руками, помощь соседу) сюда не
        попадает, поэтому низкая цифра — повод посмотреть, а не вывод.</p>
      ${bez.length ? `<p>Нет ни одной смены в WMS за 4 месяца: ${bez.map(esc).join(", ")}.</p>` : ""}
      <p>Тестовая сборка: данные сняты один раз, не обновляются по расписанию.</p>`;

    document.getElementById("dvVariant").addEventListener("click", (e) => {
      const b = e.target.closest("[data-variant]"); if (!b) return;
      s.variant = b.dataset.variant; s.otkryt = ""; narisovat();
    });
    document.getElementById("dvMonths").addEventListener("click", (e) => {
      const b = e.target.closest("[data-m]"); if (!b) return; s.mesyac = b.dataset.m; narisovat();
    });
    document.getElementById("dvBrig").addEventListener("click", (e) => {
      const b = e.target.closest("[data-b]"); if (!b) return; s.brig = b.dataset.b; s.otkryt = ""; narisovat();
    });
    document.getElementById("dvBody").addEventListener("click", (e) => {
      const r = e.target.closest(".dvRow[data-login]"); if (!r) return;
      s.otkryt = s.otkryt === r.dataset.login ? "" : r.dataset.login; narisovat();
    });
    narisovat();
  }

  fetch("../../data/panopticum-dva.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(zapustit)
    .catch((err) => { document.getElementById("stamp").textContent = `данные не загрузились: ${err.message}`; });
})();
