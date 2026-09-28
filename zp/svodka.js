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

  /* Плавная линия, которая не уходит за точки (монотонный сплайн) — как в
     хитмапе: обычная кривая Безье рисовала бы провал там, где его нет. */
  function gladko(pts) {
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
      const q = a * a + b * b;
      if (q > 9) { const k = 3 / Math.sqrt(q); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const h = (pts[i + 1][0] - pts[i][0]) / 3;
      d += ` C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
    }
    return d;
  }

  /* ФОТ по месяцам — как большой график хитмапа: плавная линия с заливкой,
     подписи над точками, лимит пунктиром. Факт — сплошной, прогноз и «по штату» —
     пунктиром; месяц без данных рвёт линию. Клик по месяцу выбирает его. */
  function godGrafik(mesyacy, period, tekushchiy) {
    if (!mesyacy || !mesyacy.length) return "<div class=\"fsGod__pusto\">загружаю год…</div>";
    const chisla = mesyacy.flatMap((m) => [m["фот"], m["цель"]]).filter((v) => Number(v) > 0).map(Number);
    if (!chisla.length) return "<div class=\"fsGod__pusto\">За год данных пока нет</div>";
    let niz = Math.min(...chisla);
    let verh = Math.max(...chisla);
    const zapas = (verh - niz) * 0.18 || verh * 0.1 || 1;
    niz = Math.max(0, niz - zapas);
    verh += zapas;
    // Ровные деления шкалы: шаг 1, 2 или 5 × 10^k, края — по делениям.
    const grubyy = (verh - niz) / 3;
    const poryadok = 10 ** Math.floor(Math.log10(grubyy));
    const shagD = [1, 2, 5, 10].map((k) => k * poryadok).find((v) => v >= grubyy);
    niz = Math.floor(niz / shagD) * shagD;
    verh = Math.ceil(verh / shagD) * shagD;
    const W = 1000;
    const H = 260;
    const n = mesyacy.length;
    const x = (j) => 30 + (j / Math.max(n - 1, 1)) * (W - 60);
    const y = (v) => 34 + (1 - (Number(v) - niz) / (verh - niz)) * (H - 58);
    const pct = (v, vsego) => `${(v / vsego * 100).toFixed(3)}%`;
    const delenia = [];
    for (let v = niz; v <= verh + shagD / 2; v += shagD) delenia.push(v);
    const vybrano = new Set(periodMesyacy(period, { "месяцы": mesyacy }));

    // Куски без пропусков: факт отдельно, прогноз продолжает его пунктиром.
    const kuski = [];
    let tek = [];
    mesyacy.forEach((m, j) => {
      if (m["фот"] == null) { if (tek.length) kuski.push(tek); tek = []; return; }
      tek.push(j);
    });
    if (tek.length) kuski.push(tek);
    let lini = "";
    for (const kusok of kuski) {
      const pts = kusok.map((j) => [x(j), y(mesyacy[j]["фот"])]);
      const osn = (H - 24).toFixed(1);
      lini += `<path class="fsG__area" d="${gladko(pts)} L${pts[pts.length - 1][0].toFixed(1)},${osn} L${pts[0][0].toFixed(1)},${osn} Z"/>`;
      const fakt = kusok.filter((j) => mesyacy[j]["вид"] === "факт");
      const dalshe = kusok.filter((j) => mesyacy[j]["вид"] !== "факт");
      if (fakt.length) lini += `<path class="fsG__line" d="${gladko(fakt.map((j) => [x(j), y(mesyacy[j]["фот"])]))}"/>`;
      if (dalshe.length) {
        const s = fakt.length && dalshe[0] === fakt[fakt.length - 1] + 1 ? [fakt[fakt.length - 1], ...dalshe] : dalshe;
        lini += `<path class="fsG__line fsG__line--prognoz" d="${gladko(s.map((j) => [x(j), y(mesyacy[j]["фот"])]))}"/>`;
      }
    }
    const limitTochki = mesyacy.map((m, j) => (Number(m["цель"]) > 0 ? [x(j), y(m["цель"])] : null)).filter(Boolean);
    const limit = limitTochki.length > 1 ? `<path class="fsG__limit" d="${gladko(limitTochki)}"/>` : "";
    const polosy = mesyacy.map((m, j) => (vybrano.has(m["месяц"])
      ? `<rect class="fsG__band" x="${(x(j) - (W - 60) / (n - 1) / 2).toFixed(1)}" y="0" width="${((W - 60) / (n - 1)).toFixed(1)}" height="${H}"/>` : "")).join("");
    const setka = delenia.map((v) => `<line class="fsG__grid" x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join("");

    const tochki = mesyacy.map((m, j) => {
      const nomer = Number(m["месяц"].slice(5, 7)) - 1;
      const est = m["фот"] != null;
      const nad = est && Number(m["цель"]) > 0 && m["фот"] > m["цель"];
      const opisanie = `${nazvanie(m["месяц"])}: ${VID[m["вид"]]}${est ? " " + mln(m["фот"]) + " млн ₽" : ""}; лимит ${mln(m["цель"])} млн ₽`;
      const left = pct(x(j), W);
      const top = pct(est ? y(m["фот"]) : H - 60, H);
      return (est ? `<i class="fsG__dot fsG__dot--${VID_KLASS[m["вид"]] || "net"}${nad ? " is-nad" : ""}${m["месяц"] === tekushchiy ? " is-seychas" : ""}" style="left:${left};top:${top}"></i>
          <b class="fsG__pin${nad ? " is-nad" : ""}${vybrano.has(m["месяц"]) ? " is-vybran" : ""}" style="left:${left};top:${top}">${mlnKor(m["фот"])}</b>`
          : `<em class="fsG__net" style="left:${left};top:${top}">нет данных</em>`)
        + `<button type="button" class="fsG__hit" data-period="${m["месяц"]}" title="${esc(opisanie)}" aria-label="${esc(opisanie)}" style="left:${left}"></button>`
        + `<span class="fsG__mes${vybrano.has(m["месяц"]) ? " is-vybran" : ""}${m["месяц"] === tekushchiy ? " is-seychas" : ""}" style="left:${left}">${MES_KOR[nomer]}</span>`;
    }).join("");
    const shkala = delenia.map((v) => `<span style="top:${pct(y(v), H)}">${mlnKor(v)}</span>`).join("");
    return `
      <div class="fsG">
        <div class="fsG__shkala">${shkala}</div>
        <div class="fsG__holst">
          <svg class="fsG__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="fsGZaliv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#a4e7cb" stop-opacity="0.34"/><stop offset="100%" stop-color="#a4e7cb" stop-opacity="0.02"/></linearGradient></defs>
            ${polosy}${setka}${limit}${lini}
          </svg>
          <div class="fsG__sloy">${tochki}</div>
        </div>
      </div>`;
  }

  function periodMesyacy(period, god) {
    const vse = god["месяцы"].map((m) => m["месяц"]);
    const kv = String(period).match(/^(\d{4})-Q([1-4])$/);
    if (kv) return vse.filter((m) => Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1 === Number(kv[2]));
    if (/^\d{4}$/.test(period)) return vse;
    return [period];
  }

  /* Разрез выбранного направления по отделам. Отделы есть только у текущего
     месяца: факт бухгалтерии приходит по направлениям целиком. */
  function razrezOtdelov(n, seychas) {
    const otdely = [...(n["отделы"] || [])].sort((p, q) => (q["фот"] || 0) - (p["фот"] || 0));
    if (!seychas || !otdely.length) {
      return `<p class="fsRow__fondy">По отделам — только текущий месяц: факт бухгалтерии за прошлые месяцы приходит по направлению целиком. Нажмите «Сейчас».</p>`;
    }
    // В 1С люди разложены по бригадам и сменам, а лимит ШР — по крупным
    // отделам с другими названиями. Где имя совпало — сравниваем с лимитом,
    // остальным показываем долю в ФОТ направления; лимиты ШР — строкой ниже.
    const limity = new Map((n["цель_отделы"] || []).map((o) => [o["отдел"], o]));
    const vsego = otdely.reduce((sum, o) => sum + (o["фот"] || 0), 0) || 1;
    const maks = Math.max(...otdely.map((o) => o["фот"] || 0), 1);
    const stroki = otdely.map((o) => {
      const l = limity.get(o["отдел"]);
      const cel = l ? l["фот"] || 0 : 0;
      const raznica = cel - (o["фот"] || 0);
      return `
        <div class="fsRow${cel && raznica < 0 ? " is-nad" : ""}">
          <div class="fsRow__imya"><b>${esc(o["отдел"])}</b>
            <span>${o["человек"] || 0} чел.${l && l["человек"] ? ` · ${l["человек"]} ${slovo(l["человек"], ["ставка", "ставки", "ставок"])}` : ""}${o["отсутствуют"] ? ` · отсутствуют ${o["отсутствуют"]}` : ""}</span></div>
          <div class="fsRow__polosa">${cel ? polosa(o["фот"] || 0, cel, null)
            : `<div class="fsPolosa is-bez"><i class="fsPolosa__fot" style="width:${((o["фот"] || 0) / maks * 100).toFixed(1)}%"></i></div>`}</div>
          <div class="fsRow__cifry">
            <span><b>${mln(o["фот"])}</b>${cel ? ` / ${mln(cel)}` : ""}</span>
            <em class="fsChip ${cel ? (raznica < 0 ? "is-nad" : "is-ok") : ""}">${cel ? (raznica < 0 ? "сверх " : "запас ") + mln(Math.abs(raznica))
              : `${Math.round((o["фот"] || 0) / vsego * 100)}% направления`}</em>
          </div>
        </div>`;
    }).join("");
    const bezPary = [...limity.values()].filter((l) => !otdely.some((o) => o["отдел"] === l["отдел"]));
    return stroki + (bezPary.length ? `<p class="fsRow__fondy">Лимит по ШР задан крупнее, чем бригады в 1С: ${
      bezPary.map((l) => `${esc(l["отдел"])} — ${mln(l["фот"])} млн, ${l["человек"] || 0} ${slovo(l["человек"] || 0, ["ставка", "ставки", "ставок"])}`).join(" · ")
    }. Всего по направлению — ${mln(n["цель_фот"])} млн.</p>` : "");
  }

  /* ── экран ────────────────────────────────────────────────────────── */

  function narisovat(koren, s) {
    const { data, god, period, tekushchiy, pravka, shr } = s;
    // Выбранное направление (28.09.2026, Степан: «не могу выбрать отдел, чтоб
    // смотреть только его разрез»): вся страница — карточка, график, разрез —
    // считается по нему; «Все» возвращает свод.
    const vse = (data["направления"] || []).filter((n) => n["человек"] || n["цель_фот"] || n["фот"]);
    const sel = s.napr ? (data["направления"] || []).find((n) => n["направление"] === s.napr) || null : null;
    const i = sel ? {
      ...sel,
      "цель_сравнимая": sel["цель_сравнимая"] ?? sel["цель_фот"],
      "вручную": sel["цель_источник"] === "вручную" ? 1 : 0,
      "без_данных": (sel["месяцы"] || []).filter((t) => t["фот"] == null).map((t) => t["месяц"]),
    } : (data["итого"] || {});
    const spisok = vse;
    const godMes = !god ? [] : s.napr
      ? ((god["направления"] || []).find((n) => n["направление"] === s.napr)?.["месяцы"] || [])
      : (god["месяцы"] || []);
    const imenaNapr = [...new Set(((god && god["направления"]) || data["направления"] || [])
      .filter((n) => n["человек"] || n["фот"] || n["цель_фот"]).map((n) => n["направление"]))];
    const mozhno = data["можно"] || {};
    const sravn = i["цель_сравнимая"] ?? i["цель_фот"] ?? 0;
    const zapas = sravn - (i["фот"] || 0);
    const estLimit = sravn > 0;
    const dolya = sravn ? (i["фот"] || 0) / sravn : 0;
    const seychas = period === tekushchiy;
    const bez = i["без_данных"] || [];
    const bezTekst = bez.map((m) => MES_ROD[Number(m.slice(5, 7)) - 1]).join(", ");
    const vidy = [...new Set(((sel ? sel["месяцы"] : null) || data["месяцы"] || []).map((m) => m["вид"]))].filter((v) => v !== "нет данных");
    const estDannye = vidy.length > 0 && i["фот"] != null;
    const nad = estDannye && estLimit && zapas < 0;
    const god4 = tekushchiy.slice(0, 4);
    const zagolovok = nazvanie(period);

    koren.innerHTML = `
      <div class="fs">
        <!-- Заголовок страницы уже «Фонд оплаты труда», а время — строкой
             «Обновлено» над ней: второй заголовок и второе время были дублем.
             Период виден в карточке прогноза ниже. -->
        <header class="fs__head">
          <p class="fs__sub">${esc(data["контур"] || "Департамент развития")} · полный ФОТ: гросс + взносы 30,2% + резерв отпусков${seychas
              ? ` · ${data["прошло_дней"] || 0} из ${data["норма_дней"] || 0} рабочих дней` : ""}</p>
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

        <nav class="fsNapr" aria-label="Направление">
          <button type="button" class="${s.napr ? "" : "is-on"}" data-napr-vybor="">Все направления</button>
          ${imenaNapr.map((imya) => `<button type="button" class="${s.napr === imya ? "is-on" : ""}" data-napr-vybor="${esc(imya)}">${esc(imya)}</button>`).join("")}
        </nav>

        <section class="fsOverview${nad ? " is-nad" : ""}">
          <div class="fsOverview__main">
            <div class="fsOverview__top">
              <span class="fsOverview__eyebrow">${vidy.length === 1 && vidy[0] === "факт" ? "ФОТ за период" : "Прогноз полного ФОТ"}${sel ? ` · ${esc(sel["направление"])}` : ""}</span>
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
            ${seychas && i["отпускные"] ? `<div class="fsOverview__detail" title="Отпускные ложатся в месяц начисления целиком, переходящие тоже. Средний заработок — оценка по окладу и плановым премиям."><span>Отпускные в прогнозе · ${i["в_отпуске"] || 0} чел.</span><strong>${mln(i["отпускные"])} млн ₽</strong></div>` : ""}
            ${seychas && i["больничные"] ? `<div class="fsOverview__detail" title="Первые три дня каждого больничного платит компания, остальное — соцфонд. Оценка по окладу и плановым премиям."><span>Больничные за счёт компании</span><strong>${mln(i["больничные"])} млн ₽</strong></div>` : ""}
            ${seychas && i["добор_по_факту"] ? `<div class="fsOverview__detail" title="Модель знает оклады, плановые премии, взносы и отпускные — ${mln(i["фот_модель"])} млн ₽. Сверху — доплаты сверх поданного (переработки, праздничные) у каждого человека: его среднее за май–июль по «Анализу ЗП», со взносами. У новичков без истории — ноль."><span>Доплаты сверх поданного — по людям</span><strong>${i["добор_по_факту"] > 0 ? "+" : "−"}${mln(Math.abs(i["добор_по_факту"]))} млн ₽</strong></div>` : ""}
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
          ${godGrafik(godMes, period, tekushchiy)}
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
            <h3>${sel ? `По отделам · ${esc(sel["направление"])}` : "По направлениям"}</h3>
            <span class="fs__sub">${pravka ? `лимит на ${esc(zagolovok)}, млн ₽` : "ФОТ / лимит, млн ₽"}</span>
          </div>
          ${sel && !pravka ? razrezOtdelov(sel, seychas) : spisok.map((n) => {
            const cel = n["цель_сравнимая"] ?? n["цель_фот"] ?? 0;
            const raznica = cel - (n["фот"] || 0);
            const bezLimita = !n["цель_фот"];
            const fondy = n["цель_фонды_список"] || [];
            const mes = n["месяцы"] || [];
            const netDannyh = mes.length > 0 && mes.every((t) => t["фот"] == null);
            return `
            <div class="fsRow${!bezLimita && !netDannyh && raznica < 0 ? " is-nad" : ""}${pravka ? "" : " is-klik"}"${pravka ? "" : ` data-napr-vybor="${esc(n["направление"])}" title="Показать только это направление"`}>
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
          ${vidy.includes("факт") ? "<p><b>Факт</b> — бухгалтерская выгрузка «Анализ ЗП», ФОТ итого: с отпускными, больничными и квартальными премиями, поэтому к прогнозу по людям добавлены их собственные доплаты сверх поданного за последние закрытые месяцы. Факт прошлых месяцев бывает выше и из-за ушедших: расчёт при увольнении ложится в факт, а в прогноз по нынешнему штату — нет.</p>" : ""}
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
      const napr = event.target.closest("[data-napr-vybor]");
      if (napr && !event.target.closest("input, label")) {
        s.napr = napr.dataset.naprVybor || null;
        s.anim = true;
        narisovat(koren, s);
        return;
      }
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
