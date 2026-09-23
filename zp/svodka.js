// Сводка ФОТ для руководителя — экран в духе HUD: сколько выходит за период,
// какой лимит по ШР, где запас и где перерасход. Период — месяц, квартал или
// год; полоса месяцев сверху одновременно и график года, и выбор месяца.
//
// Данные — агрегаты из /__fot?период=…, без фамилий: пофамильно живёт
// рабочая панель. Исключение — предпросмотр загрузки ШР: он показывает, чей
// оклад поменяется, и открыт только тем, кто видит все контуры.

(() => {
  "use strict";

  const MES_KOR = ["ЯНВ", "ФЕВ", "МАР", "АПР", "МАЙ", "ИЮН", "ИЮЛ", "АВГ", "СЕН", "ОКТ", "НОЯ", "ДЕК"];
  const MES_IM = ["январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  const MES_ROD = ["января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const RIM = ["I", "II", "III", "IV"];
  const VID = { "факт": "факт", "прогноз": "прогноз", "по штату": "по штату", "нет данных": "нет данных" };
  const VID_KLASS = { "факт": "fakt", "прогноз": "prognoz", "по штату": "shtat", "нет данных": "net" };

  const mln = (v) => ((Number(v) || 0) / 1e6).toLocaleString("ru-RU",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const mlnKor = (v) => ((Number(v) || 0) / 1e6).toLocaleString("ru-RU",
    { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const rub = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU") + " ₽";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);

  function slovo(n, formy) {
    const k = Math.abs(n) % 100;
    const e = k % 10;
    if (k > 10 && k < 20) return formy[2];
    if (e === 1) return formy[0];
    if (e >= 2 && e <= 4) return formy[1];
    return formy[2];
  }

  function nazvanie(period) {
    const s = String(period || "");
    const kv = s.match(/^(\d{4})-Q([1-4])$/);
    if (kv) return `${RIM[kv[2] - 1]} квартал ${kv[1]}`;
    if (/^\d{4}$/.test(s)) return `${s} · год`;
    const [god, m] = s.split("-");
    return MES_IM[Number(m) - 1] ? `${MES_IM[Number(m) - 1]} ${god}` : s;
  }

  const kvartalMesyaca = (m) => `${m.slice(0, 4)}-Q${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`;

  /* ── кольцо ───────────────────────────────────────────────────────────
     Доля лимита, съеденная за период: 54 риски по дуге в 270°, шкала до
     120 %, лимит — жёлтая риска. Всё, что за лимитом, горит красным. */
  function kolco(dolya) {
    const N = 54;
    const MAKS = 1.2;
    const cx = 110;
    const cy = 110;
    const gorit = Math.round(Math.min(dolya, MAKS) / MAKS * N);
    const granica = Math.round(1 / MAKS * N);
    const riski = [];
    for (let i = 0; i < N; i += 1) {
      const a = (135 + 270 * (i + 0.5) / N) * Math.PI / 180;
      const r1 = 76;
      const r2 = i === granica ? 104 : 96;
      const klass = i < gorit ? (i >= granica ? "is-nad" : "is-on") : "";
      riski.push(`<line class="cyKolco__r ${klass}" style="--i:${i}" x1="${(cx + r1 * Math.cos(a)).toFixed(1)}"
        y1="${(cy + r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r2 * Math.cos(a)).toFixed(1)}" y2="${(cy + r2 * Math.sin(a)).toFixed(1)}"/>`);
    }
    const a = (135 + 270 / MAKS) * Math.PI / 180;
    // Лимит — риска снаружи кольца, внутрь не заходит: там число.
    return `
      <svg class="cyKolco" viewBox="0 0 220 220" aria-hidden="true">
        <circle class="cyKolco__fon" cx="${cx}" cy="${cy}" r="66"/>
        ${riski.join("")}
        <line class="cyKolco__limit" x1="${(cx + 78 * Math.cos(a)).toFixed(1)}" y1="${(cy + 78 * Math.sin(a)).toFixed(1)}"
              x2="${(cx + 108 * Math.cos(a)).toFixed(1)}" y2="${(cy + 108 * Math.sin(a)).toFixed(1)}"/>
      </svg>`;
  }

  /* ── светодиодная полоса ──────────────────────────────────────────────
     Сегменты вместо сплошной заливки. Яркие — начислено (или факт), тусклые
     — сколько добавится, красные — всё, что за лимитом. */
  function led(fot, cel, nachisleno, n = 40) {
    if (!cel) {
      const gorit = fot ? n : 0;
      return `<div class="cyLed is-bez">${Array.from({ length: n }, (_, i) =>
        `<i class="${i < gorit ? "is-tusk" : ""}"></i>`).join("")}</div>`;
    }
    const shkala = Math.max(fot, cel) * 1.04;
    const gorit = Math.round(fot / shkala * n);
    const yarko = nachisleno == null ? gorit : Math.round(nachisleno / shkala * n);
    const limit = Math.round(cel / shkala * n);
    return `<div class="cyLed">${Array.from({ length: n }, (_, i) => {
      let k = "";
      if (i < gorit) k = i >= limit ? "is-nad" : i < yarko ? "is-on" : "is-tusk";
      return `<i class="${k}${i === limit ? " is-limit" : ""}" style="--i:${i}"></i>`;
    }).join("")}</div>`;
  }

  /* ── эквалайзер года ──────────────────────────────────────────────────
     Столбик на месяц: высота — ФОТ, жёлтая черта — лимит. Щелчок по
     столбику выбирает месяц. Факт — сплошной циан, прогноз — пурпур,
     будущее по штату — штриховка, месяц без данных — пустая рамка. */
  function ekvalayzer(god, period, tekushchiy) {
    const mesyacy = (god && god["месяцы"]) || [];
    if (!mesyacy.length) return "";
    const maks = Math.max(...mesyacy.map((m) => Math.max(m["фот"] || 0, m["цель"] || 0)), 1) * 1.12;
    const vybrano = new Set(god ? periodMesyacy(period, god) : []);
    return `<div class="cyEq">${mesyacy.map((m) => {
      const nomer = Number(m["месяц"].slice(5, 7)) - 1;
      const vid = VID_KLASS[m["вид"]] || "net";
      const nad = m["фот"] != null && m["цель"] && m["фот"] > m["цель"];
      return `
        <button type="button" class="cyEq__col cyEq__col--${vid}${vybrano.has(m["месяц"]) ? " is-vybran" : ""}${
          m["месяц"] === tekushchiy ? " is-seychas" : ""}${nad ? " is-nad" : ""}" data-period="${m["месяц"]}"
          title="${esc(`${nazvanie(m["месяц"])}: ${VID[m["вид"]]}${m["фот"] != null ? " " + mln(m["фот"]) + " млн" : ""}, лимит ${mln(m["цель"])} млн`)}">
          <b>${m["фот"] != null ? mlnKor(m["фот"]) : "—"}</b>
          <span class="cyEq__stakan">
            <i style="height:${((m["фот"] || 0) / maks * 100).toFixed(1)}%;--l:${nad ? (m["цель"] / m["фот"] * 100).toFixed(1) : 100}%"></i>
            ${m["цель"] ? `<s style="bottom:${(m["цель"] / maks * 100).toFixed(1)}%"></s>` : ""}
          </span>
          <em>${MES_KOR[nomer]}</em>
        </button>`;
    }).join("")}</div>`;
  }

  function periodMesyacy(period, god) {
    const vse = god["месяцы"].map((m) => m["месяц"]);
    const kv = String(period).match(/^(\d{4})-Q([1-4])$/);
    if (kv) return vse.filter((m) => Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1 === Number(kv[2]));
    if (/^\d{4}$/.test(period)) return vse;
    return [period];
  }

  /* ── экран ────────────────────────────────────────────────────────── */

  function narisovat(koren, s) {
    const { data, god, period, tekushchiy, pravka, shr } = s;
    const i = data["итого"] || {};
    const spisok = (data["направления"] || []).filter((n) => n["человек"] || n["цель_фот"] || n["фот"]);
    const mozhno = data["можно"] || {};
    const sravn = i["цель_сравнимая"] ?? i["цель_фот"] ?? 0;
    const zapas = sravn - (i["фот"] || 0);
    const nad = zapas < 0;
    const dolya = sravn ? (i["фот"] || 0) / sravn : 0;
    const seychas = period === tekushchiy;
    const bez = i["без_данных"] || [];
    const vidy = [...new Set((data["месяцы"] || []).map((m) => m["вид"]))];
    const god4 = tekushchiy.slice(0, 4);

    koren.innerHTML = `
      <div class="cy">
        <div class="cy__setka" aria-hidden="true"></div>
        <header class="cy__head">
          <div>
            <p class="cy__tag"><span>ФОТ</span> // ${esc(data["контур"] || "департамент развития")}</p>
            <h2 class="cy__h" data-text="${esc(nazvanie(period))}">${esc(nazvanie(period))}</h2>
            <p class="cy__sub">полный ФОТ: гросс + взносы 30,2% + резерв отпусков${seychas
              ? ` · день ${data["прошло_дней"] || 0} из ${data["норма_дней"] || 0}` : ""}${data["обновлено"]
              ? ` · расчёт ${esc(String(data["обновлено"]).slice(11, 16) || data["обновлено"])}` : ""}</p>
          </div>
          <div class="cy__tools">
            ${mozhno["лимиты"] && !pravka ? "<button class=\"cyBtn\" type=\"button\" data-dash=\"pravka\">Вписать лимит</button>" : ""}
            ${mozhno["шр"] && !pravka ? `<label class="cyBtn">Загрузить ШР
              <input type="file" accept=".xlsx,.xls,.csv" data-dash="shr" hidden></label>` : ""}
          </div>
        </header>

        <nav class="cy__period" aria-label="Период">
          <div class="cy__kv">
            ${[1, 2, 3, 4].map((q) => `<button type="button" class="cyChip${period === `${god4}-Q${q}` ? " is-on" : ""}${
              kvartalMesyaca(tekushchiy) === `${god4}-Q${q}` ? " is-seychas" : ""}" data-period="${god4}-Q${q}">${RIM[q - 1]} кв</button>`).join("")}
            <button type="button" class="cyChip${period === god4 ? " is-on" : ""}" data-period="${god4}">год</button>
            <button type="button" class="cyChip cyChip--seychas${seychas ? " is-on" : ""}" data-period="${tekushchiy}">сейчас</button>
          </div>
          ${ekvalayzer(god, period, tekushchiy)}
          <div class="cy__legenda">
            <span><i class="k k--fakt"></i>факт бухгалтерии</span>
            <span><i class="k k--prognoz"></i>прогноз месяца</span>
            <span><i class="k k--shtat"></i>по нынешнему штату</span>
            <span><i class="k k--limit"></i>лимит ШР</span>
          </div>
        </nav>

        <section class="cy__main">
          <div class="cy__kolco">
            ${kolco(dolya)}
            <div class="cy__kolco-centr">
              <b class="${nad ? "is-nad" : ""}"><span data-schet="${Math.round(dolya * 1000) / 10}" data-format="pct">0</span>%</b>
              <small>лимита</small>
            </div>
          </div>
          <div class="cy__kpis">
            <div class="cyKpi cyKpi--cyan">
              <small>${vidy.length === 1 && vidy[0] === "факт" ? "вышло" : "выйдет"}</small>
              <b><span data-schet="${i["фот"] || 0}">0</span><em>млн</em></b>
              <i>${i["человек"] || 0} чел.${seychas ? ` · начислено на сегодня ${mln(i["начислено_фот"])}` : ""}${
                vidy.length > 1 || vidy[0] !== "прогноз" ? ` · ${vidy.filter((v) => v !== "нет данных").map((v) => VID[v]).join(" + ")}` : ""}</i>
            </div>
            <div class="cyKpi cyKpi--yel">
              <small>лимит${i["вручную"] ? "" : " по ШР"}</small>
              <b><span data-schet="${bez.length ? sravn : i["цель_фот"] || 0}">0</span><em>млн</em></b>
              <i>${i["цель_человек"] || 0} ${slovo(i["цель_человек"] || 0, ["ставка", "ставки", "ставок"])}${
                i["цель_вакансий"] ? ` · ${i["цель_вакансий"]} ${slovo(i["цель_вакансий"], ["вакансия", "вакансии", "вакансий"])}` : ""}${
                i["вручную"] ? ` · ${i["вручную"]} вписаны руками` : ""}${
                bez.length ? ` · без ${bez.map((m) => MES_ROD[Number(m.slice(5, 7)) - 1]).join(", ")}; на весь период ${mln(i["цель_фот"])}` : ""}</i>
            </div>
            <div class="cyKpi ${nad ? "cyKpi--red" : "cyKpi--grn"}">
              <small>${nad ? "перерасход" : "запас"}</small>
              <b><span data-schet="${Math.abs(zapas)}">0</span><em>млн</em></b>
              <i>${sravn ? `${(Math.abs(zapas) / sravn * 100).toFixed(1).replace(".", ",")}% лимита` : "лимита нет"}${
                bez.length ? ` · без ${bez.map((m) => MES_ROD[Number(m.slice(5, 7)) - 1]).join(", ")} — нет факта` : ""}</i>
            </div>
          </div>
        </section>

        ${seychas ? `
        <section class="cy__den">
          <div class="cy__den-zag"><span>день ${data["прошло_дней"] || 0}/${data["норма_дней"] || 0}</span>
            <span>начислено ${mln(i["начислено_фот"])} · прогноз ${mln(i["фот"])} · лимит ${mln(i["цель_фот"])} млн</span></div>
          ${led(i["фот"] || 0, i["цель_фот"] || 0, i["начислено_фот"] || 0, 72)}
        </section>` : ""}

        <section class="cy__napr">
          <div class="cy__napr-zag"><span>направление</span><span>использование лимита</span><span>${
            pravka ? `лимит на ${esc(nazvanie(period))}, млн` : "ФОТ / лимит, млн"}</span></div>
          ${spisok.map((n) => {
            const cel = n["цель_сравнимая"] ?? n["цель_фот"] ?? 0;
            const raznica = cel - (n["фот"] || 0);
            const bezLimita = !n["цель_фот"];
            const fondy = n["цель_фонды_список"] || [];
            const mes = n["месяцы"] || [];
            const netDannyh = mes.length > 0 && mes.every((t) => t["фот"] == null);
            return `
            <div class="cyRow${!bezLimita && raznica < 0 ? " is-nad" : ""}">
              <div class="cyRow__imya">
                <b>${esc(n["направление"])}</b>
                <span>${n["человек"] || 0} чел.${n["цель_человек"] ? ` · ${n["цель_человек"]} ${slovo(n["цель_человек"],
                  ["ставка", "ставки", "ставок"])}` : ""}${n["цель_вакансий"] ? `, ${n["цель_вакансий"]} ${slovo(n["цель_вакансий"],
                  ["вакансия", "вакансии", "вакансий"])}` : ""}</span>
              </div>
              <div class="cyRow__polosa">
                ${led(n["фот"] || 0, cel, seychas ? n["начислено_фот"] || 0 : null)}
                ${mes.length > 1 ? `<div class="cyRow__mes">${mes.map((t) => `<i class="${t["фот"] == null ? "is-net"
                  : t["цель"] && t["фот"] > t["цель"] ? "is-nad" : t["цель"] ? "is-ok" : ""}" title="${esc(`${nazvanie(t["месяц"])}: ${
                  t["фот"] == null ? "нет данных" : mln(t["фот"])} / ${mln(t["цель"])} млн`)}"></i>`).join("")}</div>` : ""}
              </div>
              ${pravka ? `
                <label class="cyRow__vvod">
                  <input type="text" inputmode="decimal" data-napr="${esc(n["направление"])}"
                         value="${n["цель_источник"] === "вручную" ? mln(n["цель_фот"]) : ""}"
                         placeholder="${n["цель_шр"] ? mln(n["цель_шр"]) : "нет в ШР"}">
                </label>` : `
                <div class="cyRow__cifry">
                  <b>${netDannyh ? "—" : mln(n["фот"])}</b><span>/ ${bezLimita ? "—" : mln(n["цель_фот"])}</span>
                  <em class="${netDannyh || bezLimita ? "" : raznica < 0 ? "is-nad" : "is-ok"}">${netDannyh ? "нет данных"
                    : bezLimita ? "нет в ШР" : (raznica < 0 ? "▲ " : "▼ ") + mln(Math.abs(raznica))}</em>
                  ${n["цель_источник"] === "вручную" ? `<small class="cyRow__ruchnoy"
                    title="${esc(`вписал ${n["цель_кто"]} ${n["цель_когда"]}; по ШР ${mln(n["цель_шр"])} млн`)}">вручную</small>` : ""}
                </div>`}
              ${fondy.length && !pravka ? `<p class="cyRow__fondy">в лимите фонды без людей:
                ${fondy.map((f) => `${esc(f["название"])} — ${mln(f["фот"])} млн в месяц`).join(" · ")}</p>` : ""}
            </div>`;
          }).join("")}
        </section>

        ${pravka ? `
          <div class="cy__pravka">
            <p>Лимит на ${esc(nazvanie(period))} — полный ФОТ в миллионах. ${period.length > 7
              ? "Разложится по месяцам пропорционально ШР. " : ""}Пустое поле — лимит по ШР (он серым).</p>
            <button class="cyBtn cyBtn--glav" type="button" data-dash="sohranit">Сохранить</button>
            <button class="cyBtn" type="button" data-dash="otmena">Отмена</button>
            <span class="cy__otvet" data-dash="otvet"></span>
          </div>` : ""}

        <footer class="cy__foot">
          ${vidy.includes("факт") ? "<p><b>факт</b> — бухгалтерская выгрузка «Анализ ЗП», ФОТ итого: с отпускными, больничными и квартальными премиями. Поэтому он выше прогноза, который знает только оклады и плановые премии.</p>" : ""}
          ${vidy.includes("по штату") ? "<p><b>по штату</b> — нынешние люди на полный месяц с плановой премией, без отпусков и замен.</p>" : ""}
          ${bez.length ? `<p><b>нет данных</b> — ${bez.map((m) => nazvanie(m)).join(", ")}: выгрузки «Анализ ЗП» пока нет, в сумму и запас этот месяц не входит.</p>` : ""}
        </footer>

        <div class="zpShr" data-dash="shrOkno" ${shr ? "" : "hidden"}>${shr || ""}</div>
      </div>`;

    schet(koren, s.anim !== false);
    s.anim = false;
  }

  /* Числа набегают от нуля — полсекунды, чтобы глаз заметил смену периода. */
  function schet(koren, animirovat = true) {
    const polya = [...koren.querySelectorAll("[data-schet]")];
    const tiho = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const format = (el, v) => (el.dataset.format === "pct"
      ? v.toLocaleString("ru-RU", { maximumFractionDigits: 1 })
      : mln(v));
    if (tiho || !animirovat) { polya.forEach((el) => { el.textContent = format(el, Number(el.dataset.schet)); }); return; }
    const nachalo = performance.now();
    const shag = (t) => {
      const k = Math.min(1, (t - nachalo) / 650);
      const e = 1 - (1 - k) ** 3;
      polya.forEach((el) => { el.textContent = format(el, Number(el.dataset.schet) * e); });
      if (k < 1) requestAnimationFrame(shag);
    };
    requestAnimationFrame(shag);
  }

  /* ── загрузка ШР ─────────────────────────────────────────────────────── */

  function predprosmotr(otvet) {
    const napr = otvet["направления"] || [];
    const menyaetsya = (s) => s["было"]["фот"] !== s["стало"]["фот"] || s["оклады"].length
      || s["пришли"].length || s["ушли"].length;
    const stroka = (s) => {
      const b = s["было"];
      const n = s["стало"];
      const d = n["фот"] - b["фот"];
      const chto = [];
      if (s["оклады"].length) {
        chto.push(`оклад меняется у ${s["оклады"].length}: ` + s["оклады"].slice(0, 4)
          .map((o) => `${esc(o["фио"])} ${rub(o["было"])} → ${rub(o["стало"])}`).join("; ")
          + (s["оклады"].length > 4 ? " …" : ""));
      }
      if (s["пришли"].length) chto.push("новые: " + s["пришли"].map(esc).join(", "));
      if (s["ушли"].length) chto.push("уходят из ШР: " + s["ушли"].map(esc).join(", "));
      if (n["фонды"]) chto.push(`в том числе фонды без людей ${mln(n["фонды"])} млн`);
      return `
        <tr>
          <td><input type="checkbox" data-napr="${esc(s["направление"])}" ${menyaetsya(s) ? "checked" : ""}></td>
          <td><b>${esc(s["направление"])}</b>${s["источник_было"].length
            ? `<div class="src">сейчас из: ${s["источник_было"].map(esc).join(", ")}</div>` : "<div class=\"src\">сейчас в ШР нет</div>"}</td>
          <td class="num">${b["людей"] + b["вакансий"]} → <b>${n["людей"] + n["вакансий"]}</b>${
            n["вакансий"] ? `<div class="src">${n["вакансий"]} ${slovo(n["вакансий"], ["вакансия", "вакансии", "вакансий"])}</div>` : ""}</td>
          <td class="num">${mln(b["фот"])} → <b>${mln(n["фот"])}</b>
            <div class="src">${d ? (d > 0 ? "+" : "−") + mln(Math.abs(d)) + " млн" : "без изменений"}</div></td>
          <td class="zpShr__chto">${chto.join("<br>") || "<span class=\"src\">ничего</span>"}</td>
        </tr>`;
    };
    return `
      <div class="zpShr__head">
        <h3>Новое ШР: ${esc(otvet["файл"])}</h3>
        ${otvet["листы"].length > 1 ? `<label>лист
          <select data-dash="list">${otvet["листы"].map((l) => `<option value="${esc(l["лист"])}"${
            l["лист"] === otvet["лист"] ? " selected" : ""}>${esc(l["лист"])}${l["скрыт"] ? " (скрытый)" : ""}</option>`).join("")}
          </select></label>` : ""}
      </div>
      <p class="zpShr__note">Пока не нажмёте «Применить», ничего не меняется. Заменятся только отмеченные
        направления, остальные останутся как были, старое ШР сохранится копией. Из ШР берутся и
        оклады в расчёт зарплат — строки «оклад меняется» про это. Лимит — за ${esc(MES_IM[otvet["месяц"] - 1] || "")}.</p>
      <div class="scroll"><table>
        <thead><tr><th></th><th>Направление</th><th>Ставок</th><th>Лимит, млн</th><th>Что меняется</th></tr></thead>
        <tbody>${napr.map(stroka).join("")}</tbody>
      </table></div>
      ${otvet["не_трогаем"].length ? `<p class="zpShr__note">Этих направлений в файле нет, их не трогаем: ${
        otvet["не_трогаем"].map(esc).join(", ")}</p>` : ""}
      ${otvet["пропущено"]["строк"] ? `<p class="zpShr__note">Пропущено ${otvet["пропущено"]["строк"]} строк с деньгами,
        но без сотрудника (${rub(otvet["пропущено"]["гросс"])} в месяц) — похоже на итоги.</p>` : ""}
      <div class="cy__pravka">
        <button class="cyBtn cyBtn--glav" type="button" data-dash="primenit">Применить отмеченные</button>
        <button class="cyBtn" type="button" data-dash="shrOtmena">Отмена</button>
        <span class="cy__otvet" data-dash="shrOtvet"></span>
      </div>`;
  }

  /* ── сборка ──────────────────────────────────────────────────────────── */

  function podklyuchit(koren, data) {
    const tekushchiy = data["месяц"];
    const s = { data, god: null, period: data["период"] || tekushchiy, tekushchiy, pravka: false, shr: "" };
    let fayl = null;
    let token = "";

    const zabrat = async (period) => {
      const otvet = await fetch("/__fot?период=" + encodeURIComponent(period),
        { credentials: "same-origin", cache: "no-store" });
      if (!otvet.ok) throw new Error(otvet.status);
      return otvet.json();
    };
    const obnovitGod = async () => {
      try { s.god = await zabrat(tekushchiy.slice(0, 4)); } catch { s.god = null; }
    };
    const perejti = async (period) => {
      s.period = period;
      s.anim = true;
      s.pravka = false;
      koren.querySelector(".cy")?.classList.add("is-gruzitsya");
      try {
        s.data = await zabrat(period);
      } catch (oshibka) {
        s.data = { ...s.data };
      }
      narisovat(koren, s);
    };

    const zagruzitShr = async (list) => {
      const okno = koren.querySelector("[data-dash=\"shrOkno\"]");
      okno.hidden = false;
      okno.innerHTML = "<p class=\"zpShr__note\">Разбираю файл…</p>";
      const telo = new FormData();
      telo.append("fayl", fayl);
      if (list) telo.append("list", list);
      try {
        const otvet = await fetch("/__fot/shr", { method: "POST", body: telo, credentials: "same-origin" });
        const razbor = await otvet.json().catch(() => ({}));
        if (!otvet.ok) throw new Error(razbor.error || otvet.status);
        token = razbor["токен"];
        s.shr = predprosmotr(razbor);
        narisovat(koren, s);
        koren.querySelector("[data-dash=\"shrOkno\"]").scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (oshibka) {
        okno.innerHTML = `<p class="message error">Не разобрал файл: ${esc(String(oshibka.message || oshibka))}</p>`;
      }
    };

    koren.addEventListener("click", async (event) => {
      const period = event.target.closest("[data-period]");
      if (period) {
        perejti(period.dataset.period);
        return;
      }
      const knopka = event.target.closest("[data-dash]");
      if (!knopka || knopka.tagName === "INPUT" || knopka.tagName === "SELECT") return;
      const chto = knopka.dataset.dash;
      if (chto === "pravka") {
        s.pravka = true;
        narisovat(koren, s);
        koren.querySelector(".cyRow__vvod input")?.focus();
      } else if (chto === "otmena") {
        s.pravka = false;
        narisovat(koren, s);
      } else if (chto === "sohranit") {
        const otvetEl = koren.querySelector("[data-dash=\"otvet\"]");
        const po = new Map((s.data["направления"] || []).map((n) => [n["направление"], n]));
        const limity = [];
        for (const pole of koren.querySelectorAll(".cyRow__vvod input")) {
          const n = po.get(pole.dataset.napr);
          const tekst = pole.value.replace(/\s/g, "").replace(",", ".");
          const bylo = n && n["цель_источник"] === "вручную" ? n["цель_фот"] : 0;
          const stalo = tekst ? Math.round(Number(tekst) * 1e6) : 0;
          if (tekst && !(stalo > 0)) {
            otvetEl.textContent = `«${pole.value}» — не число`;
            pole.focus();
            return;
          }
          if (Math.abs(stalo - bylo) > 1) limity.push({ "направление": pole.dataset.napr, "фот": stalo || "" });
        }
        if (!limity.length) {
          s.pravka = false;
          narisovat(koren, s);
          return;
        }
        otvetEl.textContent = "Сохраняю…";
        const otvet = await fetch("/__fot/limity", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "период": s.period, "лимиты": limity }),
        });
        if (!otvet.ok) {
          otvetEl.textContent = "Не сохранилось: " + ((await otvet.json().catch(() => ({}))).error || otvet.status);
          return;
        }
        await obnovitGod();
        await perejti(s.period);
      } else if (chto === "shrOtmena") {
        fayl = null;
        token = "";
        s.shr = "";
        narisovat(koren, s);
      } else if (chto === "primenit") {
        const vybrano = [...koren.querySelectorAll(".zpShr input[type=checkbox]:checked")]
          .map((pole) => pole.dataset.napr);
        const otvetEl = koren.querySelector("[data-dash=\"shrOtvet\"]");
        if (!vybrano.length) {
          otvetEl.textContent = "Не отмечено ни одного направления";
          return;
        }
        otvetEl.textContent = "Применяю…";
        const otvet = await fetch("/__fot/shr/primenit", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "токен": token, "направления": vybrano }),
        });
        const itog = await otvet.json().catch(() => ({}));
        if (!otvet.ok) {
          otvetEl.textContent = "Не применилось: " + (itog.error || otvet.status);
          return;
        }
        fayl = null;
        token = "";
        s.shr = `<p class="message ok">ШР обновлено: ${itog["направления"].map(esc).join(", ")}
          — ${itog["позиций"]} позиций. Лимиты уже новые; оклады в расчёте зарплат пересчитываются,
          это около минуты.</p>`;
        await obnovitGod();
        await perejti(s.period);
      }
    });

    koren.addEventListener("change", (event) => {
      const pole = event.target;
      if (pole.dataset.dash === "shr" && pole.files && pole.files[0]) {
        fayl = pole.files[0];
        zagruzitShr(null);
      } else if (pole.dataset.dash === "list" && fayl) {
        zagruzitShr(pole.value);
      }
    });

    koren.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.closest(".cyRow__vvod")) {
        koren.querySelector("[data-dash=\"sohranit\"]")?.click();
      }
    });

    narisovat(koren, s);
    obnovitGod().then(() => narisovat(koren, s));
  }

  window.ZpSvodka = { podklyuchit };
})();
