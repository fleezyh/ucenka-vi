// Сводка ФОТ для руководителя: сколько выходит за период,
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

  /* ── дуга ─────────────────────────────────────────────────────────────
     Доля лимита за период: дуга в 240°, шкала до 120 %, лимит — янтарная
     риска. Всё, что за лимитом, дорисовывается красным. */
  const IKONKI = {
    fot: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"6\" width=\"18\" height=\"13\" rx=\"3\"/><path d=\"M3 10h18M16 14.5h2\"/></svg>",
    limit: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 3.5V2M12 22v-1.5\"/></svg>",
    zapas: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z\"/><path d=\"M9 12l2 2 4-4\"/></svg>",
    nad: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 4l9 16H3z\"/><path d=\"M12 10v4M12 17.5v.01\"/></svg>",
  };

  function duga(dolya) {
    const R = 78;
    const cx = 100;
    const cy = 100;
    const START = 150;
    const SWEEP = 240;
    const MAKS = 1.2;
    const tochka = (ug) => [cx + R * Math.cos(ug * Math.PI / 180), cy + R * Math.sin(ug * Math.PI / 180)];
    const put = (ot, doo) => {
      if (doo - ot < 0.5) return "";
      const [x1, y1] = tochka(ot);
      const [x2, y2] = tochka(doo);
      return `M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${doo - ot > 180 ? 1 : 0} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
    };
    const ug = (d) => START + SWEEP * Math.min(d, MAKS) / MAKS;
    const limit = ug(1);
    const [lx1, ly1] = [cx + (R - 13) * Math.cos(limit * Math.PI / 180), cy + (R - 13) * Math.sin(limit * Math.PI / 180)];
    const [lx2, ly2] = [cx + (R + 13) * Math.cos(limit * Math.PI / 180), cy + (R + 13) * Math.sin(limit * Math.PI / 180)];
    return `
      <svg class="fsDuga" viewBox="0 0 200 172" aria-hidden="true">
        <defs><linearGradient id="fsDugaCvet" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="#4d8df7"/><stop offset="1" stop-color="#27c46b"/></linearGradient></defs>
        <path class="fsDuga__fon" d="${put(START, START + SWEEP)}"/>
        ${dolya > 0 ? `<path class="fsDuga__znach" pathLength="100" d="${put(START, ug(Math.min(dolya, 1)))}"/>` : ""}
        ${dolya > 1 ? `<path class="fsDuga__nad" pathLength="100" d="${put(limit, ug(dolya))}"/>` : ""}
        <line class="fsDuga__limit" x1="${lx1.toFixed(1)}" y1="${ly1.toFixed(1)}" x2="${lx2.toFixed(1)}" y2="${ly2.toFixed(1)}"/>
      </svg>`;
  }

  /* Полоса «ФОТ против лимита»: светлее — сколько выйдет, насыщенно —
     начислено на сегодня, янтарная черта — лимит, за ней — красное. */
  function polosa(fot, cel, nachisleno) {
    if (!cel) {
      return `<div class="fsPolosa is-bez"><i class="fsPolosa__fot" style="width:${fot ? 100 : 0}%"></i></div>`;
    }
    const shkala = Math.max(fot, cel) * 1.04;
    const pct = (v) => `${Math.min(100, v / shkala * 100).toFixed(2)}%`;
    return `
      <div class="fsPolosa${fot > cel ? " is-nad" : ""}" style="--limit:${pct(cel)}">
        <i class="fsPolosa__fot" style="width:${pct(fot)}"></i>
        ${nachisleno != null ? `<i class="fsPolosa__seychas" style="width:${pct(Math.min(nachisleno, fot))}"></i>` : ""}
        <span class="fsPolosa__limit" style="left:${pct(cel)}"></span>
      </div>`;
  }

  /* Линия факта и прогноза; пропуск месяца разрывает ряд, а не соединяет точки. */
  function godGrafik(god, period, tekushchiy) {
    const mesyacy = (god && god["месяцы"]) || [];
    if (!mesyacy.length) return "<div class=\"fsGod__pusto\">загружаю год…</div>";
    const chisla = mesyacy.flatMap((m) => [m["фот"], m["цель"]]).filter((v) => Number(v) > 0).map(Number);
    if (!chisla.length) return "<div class=\"fsGod__pusto\">За год данных пока нет</div>";
    const minimum = Math.max(0, Math.floor(Math.min(...chisla) / 5e6) * 5e6 - 5e6);
    const maksimum = Math.max(minimum + 5e6, Math.ceil(Math.max(...chisla) / 5e6) * 5e6);
    const x = (j) => 64 + j * 101;
    const y = (v) => 202 - (Number(v) - minimum) / (maksimum - minimum) * 158;
    const vybrano = new Set(periodMesyacy(period, god));
    const setka = [minimum, (minimum + maksimum) / 2, maksimum].map((v) => `
      <line class="fsLine__grid" x1="54" x2="1185" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
      <text class="fsLine__axis" x="3" y="${(y(v) + 4).toFixed(1)}">${mlnKor(v)}</text>`).join("");
    const liniya = (pole, klass) => mesyacy.slice(1).map((m, j) => {
      const prezhniy = mesyacy[j];
      if (m[pole] == null || prezhniy[pole] == null) return "";
      const vid = pole === "цель" ? klass :
        m["вид"] === "факт" && prezhniy["вид"] === "факт" ? "fakt" : "prognoz";
      return `<line class="fsLine__segment fsLine__segment--${vid}" x1="${x(j)}" y1="${y(prezhniy[pole]).toFixed(1)}" x2="${x(j + 1)}" y2="${y(m[pole]).toFixed(1)}"/>`;
    }).join("");
    const tochki = mesyacy.map((m, j) => {
      const nomer = Number(m["месяц"].slice(5, 7)) - 1;
      const vid = VID_KLASS[m["вид"]] || "net";
      const est = m["фот"] != null;
      const xx = x(j);
      const yy = est ? y(m["фот"]) : 145;
      const opisanie = `${nazvanie(m["месяц"])}: ${VID[m["вид"]]}${est ? " " + mln(m["фот"]) + " млн ₽" : ""}; лимит ${mln(m["цель"])} млн ₽`;
      return `
        <g class="fsLine__point fsLine__point--${vid}${vybrano.has(m["месяц"]) ? " is-vybran" : ""}${m["месяц"] === tekushchiy ? " is-seychas" : ""}">
          <title>${esc(opisanie)}</title>
          ${est ? `<circle class="fsLine__halo" cx="${xx}" cy="${yy.toFixed(1)}" r="14"/>
            <circle class="fsLine__dot" cx="${xx}" cy="${yy.toFixed(1)}" r="6"/>
            <text class="fsLine__value" x="${xx}" y="${(yy - 17).toFixed(1)}">${mlnKor(m["фот"])}</text>`
            : `<text class="fsLine__missing" x="${xx}" y="152">нет данных</text>`}
          <text class="fsLine__month" x="${xx}" y="240">${MES_KOR[nomer]}</text>
        </g>`;
    }).join("");
    const knopki = mesyacy.map((m, j) => {
      const opisanie = `${nazvanie(m["месяц"])}: ${VID[m["вид"]]}${m["фот"] != null ? " " + mln(m["фот"]) + " млн ₽" : ""}; лимит ${mln(m["цель"])} млн ₽`;
      const yy = m["фот"] != null ? y(m["фот"]) : 145;
      return `<button type="button" class="fsLine__hit" data-period="${m["месяц"]}" aria-label="${esc(opisanie)}" title="${esc(opisanie)}" style="left:${(x(j) / 1200 * 100).toFixed(2)}%;--y:${(yy / 258 * 100).toFixed(2)}%"></button>`;
    }).join("");
    return `<div class="fsLine" aria-label="ФОТ по месяцам, млн рублей"><div class="fsLine__canvas"><svg viewBox="0 0 1200 258" role="img" aria-label="Линия ФОТ и лимита по месяцам">${setka}${liniya("цель", "limit")}${liniya("фот", "fakt")}${tochki}</svg>${knopki}</div></div>`;
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
    const estLimit = sravn > 0;
    const dolya = sravn ? (i["фот"] || 0) / sravn : 0;
    const seychas = period === tekushchiy;
    const bez = i["без_данных"] || [];
    const bezTekst = bez.map((m) => MES_ROD[Number(m.slice(5, 7)) - 1]).join(", ");
    const vidy = [...new Set((data["месяцы"] || []).map((m) => m["вид"]))].filter((v) => v !== "нет данных");
    const estDannye = vidy.length > 0 && i["фот"] != null;
    const nad = estDannye && estLimit && zapas < 0;
    const god4 = tekushchiy.slice(0, 4);
    const zagolovok = nazvanie(period);

    koren.innerHTML = `
      <div class="fs">
        <header class="fs__head">
          <div>
            <p class="fs__tag">ФОТ · ${esc(data["контур"] || "департамент развития")}</p>
            <h2>${esc(zagolovok.charAt(0).toUpperCase() + zagolovok.slice(1))}</h2>
            <p class="fs__sub">полный ФОТ: гросс + взносы 30,2% + резерв отпусков${seychas
              ? ` · ${data["прошло_дней"] || 0} из ${data["норма_дней"] || 0} рабочих дней` : ""}${data["обновлено"]
              ? ` · расчёт ${esc(data["обновлено"])}` : ""}</p>
          </div>
        </header>

        ${mozhno["лимиты"] || mozhno["шр"] ? `
        <div class="fsActions">
          <div class="fsActions__text"><b>${pravka ? "Изменение лимитов" : "Управление ФОТ"}</b>
            <span>${pravka ? "Впишите суммы по направлениям ниже и сохраните изменения." : "Лимиты по направлениям и штатное расписание"}</span></div>
          <div class="fs__tools">
            ${mozhno["лимиты"] ? `<button class="zpView fsKnopka fsKnopka--primary" type="button" data-dash="${pravka ? "otmena" : "pravka"}">${pravka ? "Отменить правку" : "Вписать лимит"}</button>` : ""}
            ${mozhno["шр"] && !pravka ? `<button class="zpView fsKnopka" type="button" data-dash="shrOpen">Загрузить ШР</button><input type="file" accept=".xlsx,.xls,.csv" data-dash="shr" hidden>` : ""}
          </div>
        </div>` : ""}

        <section class="fsOverview${nad ? " is-nad" : ""}">
          <div class="fsOverview__main">
            <div class="fsOverview__top">
              <span class="fsOverview__eyebrow">${vidy.length === 1 && vidy[0] === "факт" ? "ФОТ за период" : "Прогноз полного ФОТ"}</span>
              <span class="fsOverview__period">${esc(zagolovok)} · ${vidy.map((v) => VID[v]).join(" + ") || "нет данных"}</span>
            </div>
            <div class="fsOverview__figure">${estDannye ? `<b data-schet="${i["фот"] || 0}">0</b><span>млн ₽</span>` : "<b>—</b>"}</div>
            <p class="fsOverview__caption">${!estDannye ? "За выбранный период расчёта пока нет" : seychas ? `Начислено на сегодня ${mln(i["начислено_фот"])} млн ₽ · ${i["человек"] || 0} человек` : `${i["человек"] || 0} человек в расчёте`}</p>
            <div class="fsOverview__comparison" aria-label="ФОТ относительно лимита">
              <div class="fsOverview__scale">
                <span>${seychas ? `Начислено ${mln(i["начислено_фот"])}` : "0"}</span>
                <span>${estLimit ? `Лимит ${mln(sravn)}` : "Лимит не задан"}</span>
              </div>
              ${estDannye ? polosa(i["фот"] || 0, sravn, seychas ? i["начислено_фот"] || 0 : null) : "<div class=\"fsOverview__empty\">Нет данных для сравнения с лимитом</div>"}
              <div class="fsOverview__key"><span><i class="k k--seychas"></i>${seychas ? "начислено" : "ФОТ периода"}</span>${seychas ? `<span><i class="k k--fot"></i>прогноз</span>` : ""}<span><i class="k k--limit"></i>лимит</span></div>
            </div>
          </div>
          <div class="fsOverview__aside">
            <span class="fsOverview__status">${!estDannye ? "Нет данных" : !estLimit ? "Лимит не задан" : nad ? "Выше лимита" : "В пределах лимита"}</span>
            <div class="fsOverview__ratio">${estDannye && estLimit ? `<b data-schet="${Math.round(dolya * 1000) / 10}" data-format="pct">0</b><span>% лимита</span>` : "<b>—</b>"}</div>
            <div class="fsOverview__delta"><span>${!estDannye || !estLimit ? "Отклонение" : nad ? "Перерасход" : "Запас"}</span><strong>${estDannye && estLimit ? `${mln(Math.abs(zapas))} млн ₽` : "—"}</strong></div>
            <div class="fsOverview__detail"><span>Лимит${i["вручную"] ? " · вручную" : " по ШР"}</span><strong>${estLimit ? `${mln(sravn)} млн ₽` : "—"}</strong></div>
            <div class="fsOverview__detail"><span>Ставок по ШР</span><strong>${i["цель_человек"] || 0}${i["цель_вакансий"] ? ` + ${i["цель_вакансий"]} вак.` : ""}</strong></div>
            ${bez.length ? `<p class="fsOverview__note">Без ${esc(bezTekst)}: факта пока нет. Сравнение с лимитом за доступный период.</p>` : ""}
            ${i["цель_фонды"] ? `<p class="fsOverview__note">Фонды без людей в лимите: ${mln(i["цель_фонды"])} млн ₽</p>` : ""}
          </div>
        </section>

        <section class="fsBlok">
          <div class="fsBlok__head">
            <h3>По месяцам</h3>
            <div class="fsSegment" role="group" aria-label="Период">
              ${[1, 2, 3, 4].map((q) => `<button type="button" class="${period === `${god4}-Q${q}` ? "is-on" : ""}"
                data-period="${god4}-Q${q}">${RIM[q - 1]} кв</button>`).join("")}
              <button type="button" class="${period === god4 ? "is-on" : ""}" data-period="${god4}">Год</button>
              <button type="button" class="${seychas ? "is-on" : ""}" data-period="${tekushchiy}">Сейчас</button>
            </div>
          </div>
          ${godGrafik(god, period, tekushchiy)}
          <div class="fsLegenda">
            <span><i class="k k--fakt"></i>факт бухгалтерии</span>
            <span><i class="k k--prognoz"></i>прогноз месяца</span>
            <span><i class="k k--shtat"></i>по нынешнему штату</span>
            <span><i class="k k--limit"></i>лимит ШР</span>
            <span><i class="k k--nad"></i>сверх лимита</span>
          </div>
        </section>

        <section class="fsBlok">
          <div class="fsBlok__head">
            <h3>По направлениям</h3>
            <span class="fs__sub">${pravka ? `лимит на ${esc(zagolovok)}, млн ₽` : "ФОТ / лимит, млн ₽"}</span>
          </div>
          ${spisok.map((n) => {
            const cel = n["цель_сравнимая"] ?? n["цель_фот"] ?? 0;
            const raznica = cel - (n["фот"] || 0);
            const bezLimita = !n["цель_фот"];
            const fondy = n["цель_фонды_список"] || [];
            const mes = n["месяцы"] || [];
            const netDannyh = mes.length > 0 && mes.every((t) => t["фот"] == null);
            return `
            <div class="fsRow${!bezLimita && !netDannyh && raznica < 0 ? " is-nad" : ""}">
              <div class="fsRow__imya">
                <b>${esc(n["направление"])}</b>
                <span>${n["человек"] || 0} чел.${n["цель_человек"] ? ` · ${n["цель_человек"]} ${slovo(n["цель_человек"],
                  ["ставка", "ставки", "ставок"])}` : ""}${n["цель_вакансий"] ? `, ${n["цель_вакансий"]} ${slovo(n["цель_вакансий"],
                  ["вакансия", "вакансии", "вакансий"])}` : ""}</span>
              </div>
              <div class="fsRow__polosa">
                ${polosa(n["фот"] || 0, cel, seychas ? n["начислено_фот"] || 0 : null)}
                ${mes.length > 1 ? `<div class="fsRow__mes">${mes.map((t) => `<i class="${t["фот"] == null ? "is-net"
                  : t["цель"] && t["фот"] > t["цель"] ? "is-nad" : t["цель"] ? "is-ok" : ""}" title="${esc(`${nazvanie(t["месяц"])}: ${
                  t["фот"] == null ? "нет данных" : mln(t["фот"])} / ${mln(t["цель"])} млн`)}"></i>`).join("")}</div>` : ""}
              </div>
              ${pravka ? `
                <label class="fsRow__vvod">
                  <input type="text" inputmode="decimal" data-napr="${esc(n["направление"])}"
                         value="${n["цель_источник"] === "вручную" ? mln(n["цель_фот"]) : ""}"
                         placeholder="${n["цель_шр"] ? mln(n["цель_шр"]) : "нет в ШР"}">
                </label>` : `
                <div class="fsRow__cifry">
                  <span><b>${netDannyh ? "—" : mln(n["фот"])}</b> / ${bezLimita ? "—" : mln(n["цель_фот"])}</span>
                  <em class="fsChip ${netDannyh || bezLimita ? "" : raznica < 0 ? "is-nad" : "is-ok"}">${netDannyh ? "нет данных"
                    : bezLimita ? "нет в ШР" : (raznica < 0 ? "сверх " : "запас ") + mln(Math.abs(raznica))}</em>
                  ${n["цель_источник"] === "вручную" ? `<small class="fsChip is-ruchnoy"
                    title="${esc(`вписал ${n["цель_кто"]} ${n["цель_когда"]}; по ШР ${mln(n["цель_шр"])} млн`)}">вручную</small>` : ""}
                </div>`}
              ${fondy.length && !pravka ? `<p class="fsRow__fondy">в лимите фонды без людей:
                ${fondy.map((f) => `${esc(f["название"])} — ${mln(f["фот"])} млн в месяц`).join(" · ")}</p>` : ""}
            </div>`;
          }).join("")}

          ${pravka ? `
            <div class="fs__pravka">
              <p>Лимит на ${esc(zagolovok)} — полный ФОТ в миллионах. ${period.length > 7
                ? "Разложится по месяцам пропорционально ШР. " : ""}Пустое поле — лимит по ШР (он серым).</p>
              <button class="zpView zpView--glavnaya fsKnopka" type="button" data-dash="sohranit">Сохранить</button>
              <button class="zpView fsKnopka" type="button" data-dash="otmena">Отмена</button>
              <span class="fs__otvet" data-dash="otvet"></span>
            </div>` : ""}
        </section>

        <footer class="fs__foot">
          ${vidy.includes("факт") ? "<p><b>Факт</b> — бухгалтерская выгрузка «Анализ ЗП», ФОТ итого: с отпускными, больничными и квартальными премиями, поэтому он выше прогноза, который знает только оклады и плановые премии.</p>" : ""}
          ${vidy.includes("по штату") ? "<p><b>По штату</b> — нынешние люди на полный месяц с плановой премией, без отпусков и замен.</p>" : ""}
          ${bez.length ? `<p><b>Нет данных</b> — ${bez.map((m) => nazvanie(m)).join(", ")}: выгрузки «Анализ ЗП» пока нет, в сумму и запас этот месяц не входит.</p>` : ""}
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
      <div class="fs__pravka">
        <button class="zpView zpView--glavnaya fsKnopka" type="button" data-dash="primenit">Применить отмеченные</button>
        <button class="zpView fsKnopka" type="button" data-dash="shrOtmena">Отмена</button>
        <span class="fs__otvet" data-dash="shrOtvet"></span>
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
      koren.querySelector(".fs")?.classList.add("is-gruzitsya");
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
        koren.querySelector(".fsRow__vvod input")?.focus();
      } else if (chto === "shrOpen") {
        koren.querySelector('[data-dash="shr"]')?.click();
      } else if (chto === "otmena") {
        s.pravka = false;
        narisovat(koren, s);
      } else if (chto === "sohranit") {
        const otvetEl = koren.querySelector("[data-dash=\"otvet\"]");
        const po = new Map((s.data["направления"] || []).map((n) => [n["направление"], n]));
        const limity = [];
        for (const pole of koren.querySelectorAll(".fsRow__vvod input")) {
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
      if (event.key === "Enter" && event.target.closest(".fsRow__vvod")) {
        koren.querySelector("[data-dash=\"sohranit\"]")?.click();
      }
    });

    narisovat(koren, s);
    obnovitGod().then(() => narisovat(koren, s));
  }

  window.ZpSvodka = { podklyuchit };
})();
