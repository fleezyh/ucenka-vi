/* Рабочее место ДВК — вкладка CRM «ДВК» и та же картинка на /soglas/ для
   самих ДВК и СБ (раздела CRM у них нет). Встреча 28.09.2026:
     • пломба — факт проверки паллеты ДВК; без неё паллету не продают,
       не берут в лот и не согласуют;
     • согласование отгрузки — отдельный шаг: оплаченный лот, галочки ДВК и СБ
       по паллетам, согласованное бот пишет в канал склада.
   Две работы в одном месте, без перехода на отдельную страницу.

   Использование: window.Dvk.mount(uzel) — рисует всё внутри uzel. */
(function () {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chislo = (n) => (n === null || n === undefined || n === "") ? "—"
    : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  const data = (s) => {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
    return m ? `${m[3]}.${m[2]}${m[4] ? " " + m[4] : ""}` : String(s || "—");
  };
  const nomer = (s) => ((String(s || "").match(/(\d{7,11})/) || [])[1] || "").replace(/^0+/, "");
  const bezPlombyNado = (p) => !p.пломба && p.в_книге !== "нельзя продавать";

  let root = null;
  let razdel = "plomby";          // plomby | soglas
  let filtrSoglas = "ждут";       // ждут | согласованы
  let pl = { паллеты: [], без_пломбы: 0 };
  let sg = { ждут: [], согласованы: [] };
  let mozhno = {};
  let poisk = "";
  let tolkoBez = true;
  let vydelena = "";
  let soobshchenie = null;         // [текст, класс]
  let zayavka = null;              // открытое согласование
  const otkryty = new Set();
  const sostavy = new Map();
  let okno = null;

  /* ── данные ───────────────────────────────────────────── */

  const DEMO = /[?&]dvkdemo\b/.test(location.search);

  function demoZayavka() {
    const nashi = (pl.паллеты || []).filter((p) => p.в_книге !== "нельзя продавать");
    const pal = nashi.filter((p) => p.пломба).slice(0, 6).map((p) => ({
      паллета: p.паллета, склад: p.склад, ячейка: p.ячейка, штук: p.штук, себестоимость: 0,
      в_остатках: true, нельзя: "", пломба: p.пломба || "", пломба_кто: p.проверил || "", пломба_когда: p.когда || "",
      двк: null, двк_кто: "", двк_когда: "", двк_почему: "",
      сб: null, сб_кто: "", сб_когда: "", сб_почему: "",
    }));
    return {
      заявка: { id: "demo", lot: "1666(демо)", ka: "ООО «Пример»", ka_status: "действующий договор № ВИ-0000-Пн-26",
        status: "ждёт", data_otgruzki: "2026-09-30", sklad: pal[0]?.склад || "ДМД", zakazy: "", kommentariy: "демо: ничего не сохраняется",
        sozdal: "Оператор продаж", sozdan: "2026-09-28 09:40" },
      лот: { цена: 480000, окуп: 0.21 }, паллеты: pal, канал_настроен: true,
    };
  }

  async function zagruzit() {
    const [a, b] = await Promise.all([
      fetch("/__soglas/plomby", { cache: "no-store" }),
      fetch("/__soglas", { cache: "no-store" }),
    ]);
    if (a.status === 403 || b.status === 403) throw new Error("нет доступа к рабочему месту ДВК");
    if (a.ok) pl = await a.json();
    if (b.ok) sg = await b.json();
    mozhno = { ...(sg.можно || {}), двк: Boolean((pl.можно || {}).двк || (sg.можно || {}).двк) };
    if (DEMO) {
      mozhno = { ...mozhno, двк: true, сб: true, запрос: true, отгрузка: true, контроль: true };
      const d = demoZayavka();
      sg = { ...sg, ждут: [{ id: "demo", лот: d.заявка.lot, ка: d.заявка.ka, ка_статус: d.заявка.ka_status, склад: d.заявка.sklad,
        статус: "ждёт", паллет: d.паллеты.length, двк_ок: 0, двк_нет: 0, сб_ок: 0, дата_отгрузки: d.заявка.data_otgruzki,
        создал: d.заявка.sozdal, создан: d.заявка.sozdan }, ...(sg.ждут || [])] };
    }
    if (!root.dataset.vybrano) razdel = (pl.без_пломбы || !(sg.ждут || []).length) ? "plomby" : "soglas";
    // Ждать нечего — сразу показываем согласованные, а не пустую колонку.
    if (!root.dataset.fsoglas) filtrSoglas = (sg.ждут || []).length ? "ждут" : (sg.согласованы || []).length ? "к отгрузке" : "ждут";
  }

  async function poslat(telo) {
    const r = await fetch("/__soglas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(telo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.ошибка || `сервер ответил ${r.status}`);
    return d;
  }

  /* ── две карточки-работы сверху, как на главной ───────── */

  function kartaPlomby() {
    const vse = (pl.паллеты || []).filter((p) => p.в_книге !== "нельзя продавать");
    const bez = pl.без_пломбы || 0;
    const s = vse.length - bez;
    // Один квадрат — одна паллета без пломбы: видно, сколько работы осталось.
    const POKAZ = 40;
    const kv = bez
      ? Array.from({ length: Math.min(bez, POKAZ) }, (_, i) => `<i style="--d:${(i * 0.06).toFixed(2)}s"></i>`).join("")
        + (bez > POKAZ ? `<em>+${bez - POKAZ}</em>` : "")
      : '<em class="is-zel">✓ все паллеты с пломбой</em>';
    return `<button class="dvkG${razdel === "plomby" ? " is-on" : ""}" type="button" data-razdel="plomby" style="--c:#f05d72">
      <span class="dvkS dvkS--pallety">${kv}</span>
      <span class="dvkG__n">01</span>
      <span class="dvkG__imya">Пломбы</span>
      <span class="dvkG__pro">паллета без пломбы не проверена ДВК — её не продают</span>
      <span class="dvkG__cifry"><b class="${bez ? "is-krasn" : "is-zel"}">${bez}</b><small>ждут пломбу</small>
        <b>${s}</b><small>проверено</small></span>
    </button>`;
  }

  function kartaSoglas() {
    const zhdut = sg.ждут || [], ok = sg.согласованы || [];
    const polosy = (zhdut.length ? zhdut : ok).slice(0, 8).map((z, i) => {
      const vsego = z.паллет || 1;
      const dvk = ((z.двк_ок || 0) + (z.двк_нет || 0)) / vsego;
      const gotov = z.статус === "согласован";
      return `<i style="--h:${Math.round((gotov ? 1 : Math.max(dvk, .08)) * 100)}%;--d:${(i * .15).toFixed(2)}s" class="${gotov ? "is-ok" : ""}"></i>`;
    }).join("") || '<em>лотов на согласовании нет</em>';
    return `<button class="dvkG${razdel === "soglas" ? " is-on" : ""}" type="button" data-razdel="soglas" style="--c:#f5ad32">
      <span class="dvkS dvkS--loty">${polosy}</span>
      <span class="dvkG__n">02</span>
      <span class="dvkG__imya">Согласование отгрузок</span>
      <span class="dvkG__pro">оплаченный лот → галочки ДВК и СБ → канал склада</span>
      <span class="dvkG__cifry"><b class="${zhdut.length ? "is-zhelt" : ""}">${zhdut.length}</b><small>ждут согласования</small>
        <b class="is-zel">${ok.length}</b><small>к отгрузке</small></span>
    </button>`;
  }

  /* ── пломбы ───────────────────────────────────────────── */

  const STATUS = { "ждёт пломбу": "не продаётся без пломбы", "нельзя продавать": "нельзя продавать", "резерв": "резерв" };

  function razdelPlomby() {
    const slovo = poisk.trim().toLowerCase();
    const stroki = (pl.паллеты || []).filter((p) => (!tolkoBez || bezPlombyNado(p) || p.паллета === vydelena)
      && (!slovo || `${p.паллета} ${p.номер} ${p.склад} ${p.ячейка}`.toLowerCase().includes(slovo)));
    return `
      <div class="dvkVerh">
        <form class="dvkSkan" data-skan autocomplete="off">
          <input class="crmPoisk dvkSkan__pole" name="kod" placeholder="Отсканируйте паллету — строка найдётся, впишите пломбу и Enter" autofocus>
        </form>
        <input class="crmPoisk" data-poisk placeholder="поиск: номер, склад, ячейка" value="${esc(poisk)}">
        <label class="dvkGalka"><input type="checkbox" data-tolko${tolkoBez ? " checked" : ""}> только без пломбы</label>
      </div>
      ${soobshchenie ? `<p class="dvkSoob ${soobshchenie[1] || ""}">${soobshchenie[0]}</p>` : ""}
      <p class="dvkSchyot">${stroki.length} ${stroki.length === 1 ? "паллета" : "паллет"}${tolkoBez ? " без пломбы" : ""} · остатки на ${esc(data(pl.остатки_на))}${mozhno.двк ? "" : " · вносить пломбы может только ДВК"}</p>
      <div class="dvkSpisok">
        <div class="dvkRyad dvkRyad--shapka"><span>Паллета</span><span>Состав</span><span>Пломба</span><span>Проверил</span></div>
        ${stroki.slice(0, 800).map((p) => `
        <div class="dvkRyad${bezPlombyNado(p) ? " is-bez" : ""}${p.паллета === vydelena ? " is-vydelena" : ""}" data-pallet="${esc(p.паллета)}">
          <span class="dvkRyad__imya"><b>${esc(p.паллета)}</b>
            <small>${esc(p.склад)}${p.ячейка ? " · " + esc(p.ячейка) : ""}</small>
            ${STATUS[p.в_книге] ? `<em class="dvkTeg${p.в_книге === "резерв" ? " is-tiho" : ""}">${esc(STATUS[p.в_книге])}</em>` : ""}</span>
          <span class="dvkRyad__sostav"><b>${chislo(p.штук)}</b> шт<small>${chislo(p.sku)} SKU</small></span>
          <span class="dvkRyad__plomba">${mozhno.двк && p.в_книге !== "нельзя продавать"
            ? `<form class="dvkVvod${p.пломба ? " is-est" : ""}" data-vvod="${esc(p.паллета)}">
                <input name="plomba" autocomplete="off" placeholder="${p.пломба ? esc(p.пломба) : "номер пломбы"}">
                <button type="submit" title="Сохранить">✓</button></form>`
            : p.пломба ? `<b class="dvkPlombaEst">${esc(p.пломба)}</b>` : '<span class="dvkNet">нет пломбы</span>'}</span>
          <span class="dvkRyad__kto">${p.пломба ? `${esc(p.проверил || p.источник)}<small>${esc(data(p.когда))}</small>` : ""}</span>
        </div>`).join("") || `<p class="dvkPusto">${tolkoBez && !slovo ? "Все наши паллеты проверены ДВК." : "Ничего не нашлось."}</p>`}
      </div>`;
  }

  async function sohranitPlombu(pallet, plomba, forma) {
    const kn = forma && forma.querySelector("button");
    if (kn) kn.disabled = true;
    try {
      await poslat({ действие: "пломба", паллета: pallet, пломба: plomba });
      vydelena = "";
      soobshchenie = [`${esc(pallet)}: пломба ${esc(plomba)} сохранена — паллета проверена и снова продаётся. Сканируйте следующую.`, "is-ok"];
      await zagruzit();
      risovat();
      root.querySelector(".dvkSkan__pole")?.focus();
    } catch (e) {
      soobshchenie = [esc(e.message || String(e)), "is-oshibka"];
      risovat();
    }
  }

  function skan(kod) {
    kod = String(kod || "").trim();
    if (!kod) return;
    const n = nomer(kod);
    const p = (pl.паллеты || []).find((x) => (n && x.номер === n) || x.паллета.toLowerCase() === kod.toLowerCase());
    if (!p) {
      soobshchenie = [`${esc(kod)}: этой паллеты нет в наших остатках — пломбу на неё не вносим. Проверьте номер или отдайте ответственному.`, "is-oshibka"];
      vydelena = "";
      risovat();
      root.querySelector(".dvkSkan__pole")?.focus();
      return;
    }
    vydelena = p.паллета;
    poisk = "";
    soobshchenie = [p.пломба ? `${esc(p.паллета)} уже с пломбой ${esc(p.пломба)} — можно заменить.`
      : `${esc(p.паллета)}: ${esc(p.склад)}, ${esc(p.ячейка)}, ${chislo(p.sku)} SKU, ${chislo(p.штук)} шт. Впишите пломбу.`, ""];
    risovat();
    const tr = root.querySelector(`.dvkRyad[data-pallet="${CSS.escape(p.паллета)}"]`);
    if (tr) { tr.scrollIntoView({ block: "center" }); tr.querySelector("input")?.focus(); }
  }

  /* ── согласование отгрузок ────────────────────────────── */

  function polosa(imya, sdelano, vsego, klass) {
    const d = vsego ? Math.round(sdelano / vsego * 100) : 0;
    return `<span class="dvkPolosa ${klass || ""}"><span class="dvkPolosa__imya">${imya}</span>
      <span class="dvkPolosa__lin"><i style="width:${d}%"></i></span><b>${sdelano}/${vsego}</b></span>`;
  }

  /* Согласование — решение по лоту целиком (28.09: «они весь лот согласовывают,
     а не паллеты отдельные»). Паллеты и их состав внутри — чтобы было видно,
     что именно отгружаем. */

  // Этапы лота: ДВК → СБ → отгрузка → контроль (как в письмах «Отгрузка …»).
  const ETAPY = [["двк", "ДВК"], ["сб", "СБ"], ["отгрузка", "Отгрузка"], ["контроль", "Контроль"]];

  function etapySpiska(z) {
    const vsego = z.паллет || 0;
    const st = z.статус;
    const dvkNet = st === "отклонён" && (z.двк_нет || 0);
    const dvk = dvkNet ? "нет" : vsego && (z.двк_ок || 0) === vsego ? "ок" : "ждёт";
    const sb = ["согласован", "отгружен", "закрыт"].includes(st) ? "ок" : st === "отклонён" && !dvkNet ? "нет" : "ждёт";
    const otgr = ["отгружен", "закрыт"].includes(st) ? "ок" : st === "согласован" && (z.уехало || 0) ? "часть" : "ждёт";
    const kontrol = st === "закрыт" ? "ок" : "ждёт";
    return { двк: dvk, сб: sb, отгрузка: otgr, контроль: kontrol };
  }

  function tekushiy(e) {
    return ETAPY.map(([k]) => k).find((k) => e[k] !== "ок") || "";
  }

  function tochki(e, sejchas) {
    return `<span class="dvkPut">${ETAPY.map(([k, imya]) => {
      const sost = e[k];
      const kl = sost === "ок" ? "is-ok" : sost === "нет" ? "is-net" : sost === "часть" ? "is-chast" : k === sejchas ? "is-sejchas" : "";
      return `<span class="dvkPut__t ${kl}"><i></i><b>${imya}</b></span>`;
    }).join("")}</span>`;
  }

  const CHIP = { ждёт: ["на согласовании", "is-zhelt"], согласован: ["к отгрузке", "is-zel"], отгружен: ["отгружен", "is-sin"],
    закрыт: ["закрыт", ""], отклонён: ["отклонён", "is-krasn"], отменён: ["отменён", ""] };

  function kartaLota(z) {
    const e = etapySpiska(z);
    const chip = CHIP[z.статус] || [z.статус, ""];
    const uehalo = z.статус === "согласован" && (z.уехало || 0) ? ` · уехало ${z.уехало} из ${z.к_отгрузке}` : "";
    return `<button class="dvkLot" type="button" data-zayavka="${z.id}">
      <span class="dvkLot__verh"><b>Лот ${esc(z.лот)}</b><span class="dvkChip ${chip[1]}">${chip[0]}</span></span>
      <span class="dvkLot__ka">${esc(z.ка || "контрагент не указан")}</span>
      <span class="dvkTiho">${esc([z.склад || z.регион, z.ворота ? "ворота " + z.ворота : "", z.ка_статус].filter(Boolean).join(" · "))}</span>
      ${tochki(e, z.статус === "отклонён" ? "" : tekushiy(e))}
      <span class="dvkLot__niz"><span><b>${z.паллет || 0}</b> паллет · отгрузка <b>${esc(data(z.дата_отгрузки))}</b>${uehalo}</span>
        <span>${esc(z.создал || "—")}</span></span>
    </button>`;
  }

  function razdelSoglas() {
    const spiski = { ждут: sg.ждут || [], "к отгрузке": sg.согласованы || [], отгружены: sg.отгружены || [],
      закрыты: sg.закрыты || [], отклонены: sg.отклонены || [] };
    if (!spiski[filtrSoglas]) filtrSoglas = "ждут";
    const spisok = spiski[filtrSoglas];
    const PUSTO = { ждут: "Ждать нечего — все лоты решены.", "к отгрузке": "Согласованных к отгрузке нет.",
      отгружены: "Отгруженных, ждущих контроля, нет.", закрыты: "Закрытых пока нет.", отклонены: "Отклонённых нет." };
    return `
      <div class="dvkVerh">
        <nav class="crmFiltry dvkSeg">${Object.keys(spiski).map((k) =>
          `<button class="crmFiltr${filtrSoglas === k ? " is-on" : ""}" type="button" data-fsoglas="${k}">${k} · ${spiski[k].length}</button>`).join("")}</nav>
        <span class="crmSchyot">лот на согласование отправляют из карточки оплаченного лота в CRM</span>
      </div>
      <div class="dvkLoty">${spisok.map(kartaLota).join("") || `<p class="dvkPusto">${PUSTO[filtrSoglas]}</p>`}</div>`;
  }

  /* окно согласования — в стиле окна лота CRM */
  function oknoOtkryt(html) {
    if (!okno) {
      okno = document.createElement("div");
      okno.className = "crmOkno dvkOkno";
      okno.innerHTML = '<div class="crmOkno__fon" data-dvk-zakryt></div><article class="crmOkno__doc dvkOkno__doc" role="dialog" aria-modal="true"></article>';
      document.body.appendChild(okno);
      okno.addEventListener("click", klikOkna);
    }
    okno.querySelector("article").innerHTML = html;
    okno.hidden = false;
  }
  function oknoZakryt() {
    vyborOtgruzki = false;
    if (okno) okno.hidden = true;
    zayavka = null;
    otkryty.clear();
  }

  async function otkrytZayavku(id) {
    if (String(id) === "demo") { zayavka = demoZayavka(); risovatZayavku(); return; }
    oknoOtkryt('<p class="dvkPusto">Загружаю лот…</p>');
    try {
      const r = await fetch(`/__soglas/zayavka?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`сервер ответил ${r.status}`);
      zayavka = await r.json();
      mozhno = { ...mozhno, ...(zayavka.можно || {}) };
      risovatZayavku();
    } catch (e) {
      oknoOtkryt(`<p class="dvkSoob is-oshibka">Лот не открылся: ${esc(e.message || e)}</p><button class="crmKn" type="button" data-dvk-zakryt>Закрыть</button>`);
    }
  }

  function sostavHtml(pallet) {
    const s = sostavy.get(pallet);
    if (!s) return '<p class="dvkPusto">Смотрю, что в паллете…</p>';
    if (s.ошибка) return `<p class="dvkSoob is-oshibka">${esc(s.ошибка)}</p>`;
    const st = s.строки || [];
    if (!st.length) return '<p class="dvkPusto">Остатка по актам на паллете нет.</p>';
    return `<table class="crmReestr__vnutri"><thead><tr><th>Товар</th><th>Акт</th><th>Дефект</th><th class="crmNum">Кол-во</th>
      <th class="crmNum">Продажная ВИ МСК</th><th class="crmNum">Закупочная</th></tr></thead><tbody>
      ${st.map((r) => `<tr><td>${esc(r["Товар"])}</td><td>${esc(r["Акт"])}</td><td>${esc(r["Заявленный дефект"])}</td>
        <td class="crmNum">${chislo(r["Кол-во"])}</td><td class="crmNum">${chislo(r["Цена продажная ВИ МСК"])}</td>
        <td class="crmNum">${chislo(r["Цена закупочная"])}</td></tr>`).join("")}</tbody></table>`;
  }

  // Решение службы по лоту из паллет заявки: все да — согласовал, есть нет — отклонил.
  function reshenieSluzhby(p, sl) {
    const svoi = sl === "сб" ? p.filter((x) => x.двк === true) : p;
    const net = svoi.find((x) => x[sl] === false);
    if (net) return { sost: "нет", kto: net[sl + "_кто"], kogda: net[sl + "_когда"], pochemu: net[sl + "_почему"] };
    if (svoi.length && svoi.every((x) => x[sl] === true)) return { sost: "ок", kto: svoi[0][sl + "_кто"], kogda: svoi[0][sl + "_когда"] };
    return { sost: "ждёт" };
  }

  function etapyOkna(d) {
    const z = d.заявка, p = d.паллеты || [];
    const dvk = reshenieSluzhby(p, "двк"), sb = reshenieSluzhby(p, "сб");
    const kOtgr = p.filter((x) => x.двк === true && x.сб === true);
    const uehali = kOtgr.filter((x) => x.уехал);
    const otgr = ["отгружен", "закрыт"].includes(z.status)
      ? { sost: "ок", kto: z.otgruzil, kogda: z.otgruzhen, pod: `уехало ${uehali.length}` }
      : uehali.length ? { sost: "часть", pod: `уехало ${uehali.length} из ${kOtgr.length}` } : { sost: "ждёт" };
    const kontrol = z.status === "закрыт" ? { sost: "ок", kto: z.kontrol_kto, kogda: z.kontrol_kogda, pod: z.kontrol_tekst } : { sost: "ждёт" };
    return { двк: dvk, сб: sb, отгрузка: otgr, контроль: kontrol, kOtgr, uehali };
  }

  function putOkna(e, z) {
    const sejchas = z.status === "отклонён" || z.status === "отменён" ? "" : ETAPY.map(([k]) => k).find((k) => e[k].sost !== "ок") || "";
    return `<div class="dvkPutOkno">${ETAPY.map(([k, imya], i) => {
      const r = e[k];
      const kl = r.sost === "ок" ? "is-ok" : r.sost === "нет" ? "is-net" : r.sost === "часть" ? "is-chast" : k === sejchas ? "is-sejchas" : "";
      const tekst = r.sost === "ок" ? `${esc(r.kto || "")} · ${esc(data(r.kogda))}`
        : r.sost === "нет" ? `отклонил ${esc(r.kto || "")}` : r.sost === "часть" ? "частично" : k === sejchas ? "сейчас" : "ждёт";
      return `<div class="dvkPutOkno__shag ${kl}"><span class="dvkPutOkno__krug">${r.sost === "ок" ? "✓" : r.sost === "нет" ? "✗" : i + 1}</span>
        <b>${imya}</b><small>${tekst}</small>${r.pod ? `<small class="dvkPutOkno__pod">${esc(r.pod)}</small>` : ""}</div>`;
    }).join('<span class="dvkPutOkno__lin"></span>')}</div>`;
  }

  // Одна панель «что сделать сейчас» — только для текущего шага и только тем, кому можно.
  function panelDeystviya(d, e) {
    const z = d.заявка, p = d.паллеты || [];
    const bez = p.filter((x) => !x.пломба);
    if (z.status === "отклонён") {
      const r = e.двк.sost === "нет" ? e.двк : e.сб;
      return `<div class="dvkPanelD is-net"><b>Лот отклонён</b><p>${esc(r.pochemu || "")}</p><small>Продажи могут исправить и отправить лот заново из карточки в CRM.</small></div>`;
    }
    if (z.status === "ждёт" && e.двк.sost === "ждёт") {
      return `<div class="dvkPanelD"><b>Сейчас: решение ДВК</b>
        <p>ДВК проверяет паллеты и пломбы и согласует лот целиком.</p>
        ${bez.length ? `<p class="dvkNet">Без пломбы ${bez.length}: ${bez.map((x) => esc(x.паллета)).join(", ")} — сначала пломба во вкладке «Пломбы».</p>` : ""}
        ${mozhno.двк ? `<div class="dvkPanelD__kn"><button class="crmKn crmKn--glav" type="button" data-reshit="двк" data-ok="1"${bez.length ? " disabled" : ""}>Согласовать лот</button>
          <button class="crmKn crmKn--udalit" type="button" data-reshit="двк" data-ok="0">Отклонить…</button></div>` : '<small>Решает ДВК склада.</small>'}</div>`;
    }
    if (z.status === "ждёт") {
      return `<div class="dvkPanelD"><b>Сейчас: решение СБ</b><p>ДВК лот согласовал. СБ подтверждает отгрузку и ставит охрану на контроль.</p>
        ${mozhno.сб ? `<div class="dvkPanelD__kn"><button class="crmKn crmKn--glav" type="button" data-reshit="сб" data-ok="1">Согласовать · охрана на контроль</button>
          <button class="crmKn crmKn--udalit" type="button" data-reshit="сб" data-ok="0">Отклонить…</button></div>` : '<small>Решает СБ.</small>'}</div>`;
    }
    if (z.status === "согласован") {
      const ostalis = e.kOtgr.filter((x) => !x.уехал);
      return `<div class="dvkPanelD"><b>Сейчас: отгрузка</b>
        <p>Отметьте, что уехало и совпали ли пломбы. Машина забрала не всё — отметьте только уехавшие, остальные ждут следующей.</p>
        ${mozhno.отгрузка ? `<div class="dvkPanelD__kn">
          <button class="crmKn crmKn--glav" type="button" data-otgruzka="vse">Уехало всё (${ostalis.length}), пломбы совпали</button>
          <button class="crmKn" type="button" data-otgruzka="chast">Уехала часть…</button>
          <button class="crmKn" type="button" data-otgruzka="plomby">Пломбы не совпали…</button>
          <button class="crmKn" type="button" data-ne-pribylo>Не прибыло ТС…</button></div>` : '<small>Отмечает охрана склада.</small>'}
        ${vyborOtgruzki ? `<p class="dvkTiho">Отметьте галочками уехавшие паллеты в таблице ниже и нажмите «Сохранить отгрузку».</p>
          <div class="dvkPanelD__kn"><button class="crmKn crmKn--glav" type="button" data-otgruzka-sohr>Сохранить отгрузку</button>
          <button class="crmKn" type="button" data-otgruzka-otmena>Отмена</button></div>` : ""}</div>`;
    }
    if (z.status === "отгружен") {
      return `<div class="dvkPanelD"><b>Сейчас: контроль</b><p>Все паллеты уехали. Удалённый контроль проверяет и закрывает лот.</p>
        ${mozhno.контроль ? `<div class="dvkPanelD__kn"><button class="crmKn crmKn--glav" type="button" data-kontrol="ok">Контроль проведён, всё штатно</button>
          <button class="crmKn" type="button" data-kontrol="zamechanie">Есть замечание…</button></div>` : '<small>Закрывает удалённый контроль.</small>'}</div>`;
    }
    if (z.status === "закрыт") return `<div class="dvkPanelD is-ok"><b>Лот закрыт</b><p>${esc(z.kontrol_tekst || "всё штатно")} · ${esc(z.kontrol_kto || "")} ${esc(data(z.kontrol_kogda))}</p></div>`;
    return "";
  }

  let vyborOtgruzki = false;

  function risovatZayavku() {
    const d = zayavka, z = d.заявка, lot = d.лот || {};
    const p = d.паллеты || [];
    const e = etapyOkna(d);
    const sebes = p.reduce((n, x) => n + (Number(x.себестоимость) || 0), 0);
    const shtuk = p.reduce((n, x) => n + (Number(x.штук) || 0), 0);
    const okup = lot.окуп ? (Number(lot.окуп) <= 1.5 ? Number(lot.окуп) * 100 : Number(lot.окуп)) : 0;
    const chip = CHIP[z.status] || [z.status, ""];
    const posleSoglasiya = ["согласован", "отгружен", "закрыт"].includes(z.status);
    oknoOtkryt(`
      <div class="crmOkno__top">
        <span class="crmOkno__teg">Согласование отгрузки</span>
        <div class="crmOkno__act">${z.status === "ждёт" && mozhno.запрос ? '<button class="crmKn crmKn--udalit" type="button" data-otmenit>Отменить заявку</button>' : ""}
          <button class="crmKn" type="button" data-dvk-zakryt>Закрыть</button></div>
      </div>
      <h2>Лот ${esc(z.lot)} · ${esc(z.ka || "контрагент не указан")} <span class="dvkChip ${chip[1]}">${chip[0]}</span></h2>
      <p class="dvkStroka">${esc(z.ka_status || "")}${z.kommentariy ? " · " + esc(z.kommentariy) : ""} · отправил ${esc(z.sozdal || "—")} ${esc(data(z.sozdan))}</p>
      <div class="dvkFakty">
        <span><i>Отгрузка</i><b>${esc(data(z.data_otgruzki))}</b></span>
        <span><i>Склад · ворота</i><b>${esc(z.sklad || z.region || "—")}${z.vorota ? " · " + esc(z.vorota) : ""}</b></span>
        <span><i>Паллет · штук</i><b>${p.length} · ${chislo(shtuk)}</b></span>
        <span><i>Себестоимость</i><b>${sebes ? chislo(sebes) + " ₽" : "—"}</b></span>
        <span><i>Цена отгрузки</i><b>${lot.цена ? chislo(lot.цена) + " ₽" : "—"}</b></span>
        <span><i>Окуп</i><b>${okup ? okup.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%" : "—"}</b></span>
      </div>
      ${putOkna(e, z)}
      ${panelDeystviya(d, e)}
      ${(d.события || []).length ? `<div class="dvkSobytiya">${d.события.map((x) => `<span><b>${esc(data(x.когда))}</b> ${esc(x.текст)} <i>${esc(x.кто)}</i></span>`).join("")}</div>` : ""}
      <p class="dvkZag">Что в лоте · клик по паллете — её состав</p>
      <div class="crmTabl dvkTabl dvkTabl--okno"><table>
        <thead><tr>${vyborOtgruzki ? "<th></th>" : ""}<th>Паллета</th><th>Склад · ячейка</th><th class="crmNum">Шт</th><th class="crmNum">Себес, ₽</th><th>Пломба</th>${posleSoglasiya ? "<th>Отгрузка</th>" : ""}</tr></thead>
        <tbody>${p.map((x) => {
          const kOtgr = x.двк === true && x.сб === true;
          return `<tr data-sostav="${esc(x.паллета)}" class="${x.пломба ? "" : "is-bez"}">
          ${vyborOtgruzki ? `<td data-stop>${kOtgr && !x.уехал ? `<input type="checkbox" class="dvkUehal" value="${esc(x.паллета)}">` : ""}</td>` : ""}
          <td><b>${otkryty.has(x.паллета) ? "▾" : "▸"} ${esc(x.паллета)}</b>${x.нельзя ? `<span class="dvkPometka">${esc(x.нельзя)}</span>` : ""}${!x.в_остатках && !x.уехал ? '<span class="dvkPometka">нет в остатках</span>' : ""}</td>
          <td>${esc(x.склад || "—")} <span class="dvkTiho">${esc(x.ячейка || "")}</span></td>
          <td class="crmNum">${chislo(x.штук)}</td><td class="crmNum">${x.себестоимость ? chislo(x.себестоимость) : "—"}</td>
          <td>${x.пломба ? `<b class="dvkPlombaEst">${esc(x.пломба)}</b>` : '<span class="dvkNet">нет пломбы</span>'}</td>
          ${posleSoglasiya ? `<td>${!kOtgr ? '<span class="dvkTiho">не к отгрузке</span>' : x.уехал ? `<span class="dvkOk">уехала</span> <span class="dvkTiho">${esc(data(x.уехал_когда))}${x.пломба_совпала === false ? " · пломба НЕ совпала" : ""}</span>` : '<span class="dvkTiho">ждёт машину</span>'}</td>` : ""}
        </tr>${otkryty.has(x.паллета) ? `<tr class="crmReestr__sostav"><td colspan="${6 + (vyborOtgruzki ? 1 : 0)}">${sostavHtml(x.паллета)}</td></tr>` : ""}`;
        }).join("")}</tbody>
      </table></div>`);
  }

  async function deystvie(telo) {
    if (String(zayavka.заявка.id) === "demo") return demoDeystvie(telo);
    try {
      zayavka = { ...(await poslat({ ...telo, id: zayavka.заявка.id })), можно: mozhno };
      vyborOtgruzki = false;
      risovatZayavku();
      await zagruzit();
      risovat();
    } catch (e) {
      alert("Не сохранилось: " + (e.message || e));
    }
  }

  // Демо без сервера: проигрываем этапы на месте.
  function demoDeystvie(telo) {
    const z = zayavka.заявка, p = zayavka.паллеты;
    const kto = "вы (демо)", seychas = "2026-09-28 17:30";
    if (telo.действие === "решение_лота") {
      p.forEach((x) => {
        if (telo.служба === "сб" && x.двк !== true) return;
        x[telo.служба] = telo.ок; x[telo.служба + "_кто"] = kto; x[telo.служба + "_когда"] = seychas; x[telo.служба + "_почему"] = telo.почему || "";
      });
      if (!telo.ок) z.status = "отклонён";
      else if (telo.служба === "сб") { z.status = "согласован"; z.kanal_kogda = seychas; }
    } else if (telo.действие === "отгрузка") {
      p.filter((x) => telo.паллеты.includes(x.паллета)).forEach((x) => { x.уехал = true; x.уехал_когда = seychas; x.пломба_совпала = telo.пломбы_совпали; });
      zayavka.события = [...(zayavka.события || []), { когда: seychas, текст: `уехало ${telo.паллеты.length}`, кто: kto }];
      if (p.filter((x) => x.двк && x.сб).every((x) => x.уехал)) { z.status = "отгружен"; z.otgruzil = kto; z.otgruzhen = seychas; }
    } else if (telo.действие === "не_прибыло") {
      z.data_otgruzki = telo.дата;
      zayavka.события = [...(zayavka.события || []), { когда: seychas, текст: `не прибыло ТС, новая дата ${data(telo.дата)}`, кто: kto }];
    } else if (telo.действие === "контроль") {
      z.status = "закрыт"; z.kontrol_kto = kto; z.kontrol_kogda = seychas; z.kontrol_tekst = telo.комментарий || "всё штатно";
    }
    vyborOtgruzki = false;
    risovatZayavku();
  }

  function reshit(sl, ok) {
    let pochemu = "";
    if (!ok) {
      pochemu = (prompt(`${sl.toUpperCase()}: почему лот не согласован? Увидят продажи и склад.`) || "").trim();
      if (!pochemu) return;
    } else if (!confirm(`${sl.toUpperCase()}: согласовать лот ${zayavka.заявка.lot} целиком (${(zayavka.паллеты || []).length} паллет)?`)) {
      return;
    }
    return deystvie({ действие: "решение_лота", служба: sl, ок: ok, почему: pochemu });
  }

  async function klikOkna(e) {
    const t = e.target;
    if (t.closest("[data-dvk-zakryt]")) return oknoZakryt();
    const r = t.closest("[data-reshit]");
    if (r && !r.disabled) return reshit(r.dataset.reshit, r.dataset.ok === "1");
    const og = t.closest("[data-otgruzka]");
    if (og) {
      const vse = (zayavka.паллеты || []).filter((x) => x.двк === true && x.сб === true && !x.уехал).map((x) => x.паллета);
      if (og.dataset.otgruzka === "vse") {
        if (confirm(`Уехали все ${vse.length} паллет, пломбы совпали?`)) deystvie({ действие: "отгрузка", паллеты: vse, пломбы_совпали: true });
      } else if (og.dataset.otgruzka === "plomby") {
        const chto = (prompt("Какие пломбы не совпали и что с ними? Отгрузку отметим с замечанием.") || "").trim();
        if (chto) deystvie({ действие: "отгрузка", паллеты: vse, пломбы_совпали: false, комментарий: chto });
      } else { vyborOtgruzki = true; risovatZayavku(); }
      return;
    }
    if (t.closest("[data-otgruzka-otmena]")) { vyborOtgruzki = false; return risovatZayavku(); }
    if (t.closest("[data-otgruzka-sohr]")) {
      const vybrany = [...okno.querySelectorAll(".dvkUehal:checked")].map((x) => x.value);
      if (!vybrany.length) return alert("Отметьте уехавшие паллеты");
      return deystvie({ действие: "отгрузка", паллеты: vybrany, пломбы_совпали: true });
    }
    if (t.closest("[data-ne-pribylo]")) {
      const nd = (prompt("Не прибыло ТС. Новая дата отгрузки (ДД.ММ.ГГГГ):") || "").trim();
      const m = nd.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (!nd) return;
      if (!m) return alert("Дата в виде ДД.ММ.ГГГГ");
      return deystvie({ действие: "не_прибыло", дата: `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` });
    }
    const ko = t.closest("[data-kontrol]");
    if (ko) {
      if (ko.dataset.kontrol === "ok") return deystvie({ действие: "контроль", комментарий: "контроль отгрузки проведён, всё штатно" });
      const zam = (prompt("Замечание контроля:") || "").trim();
      if (zam) deystvie({ действие: "контроль", комментарий: zam });
      return;
    }
    if (t.closest("[data-stop]")) return;
    if (t.closest("[data-otmenit]") && zayavka && confirm("Отменить заявку на согласование?")) {
      try { await poslat({ действие: "отменить", id: zayavka.заявка.id }); oknoZakryt(); await zagruzit(); risovat(); }
      catch (err) { alert(err.message || err); }
      return;
    }
    const s = t.closest("tr[data-sostav]");
    if (s) {
      const pal = s.dataset.sostav;
      if (otkryty.has(pal)) otkryty.delete(pal); else otkryty.add(pal);
      risovatZayavku();
      if (otkryty.has(pal) && !sostavy.has(pal)) {
        if (String(zayavka.заявка.id) === "demo") sostavy.set(pal, { строки: [] });
        try {
          const r2 = await fetch(`/__soglas/sostav?паллета=${encodeURIComponent(pal)}`, { cache: "no-store" });
          sostavy.set(pal, r2.ok ? await r2.json() : { ошибка: `сервер ответил ${r2.status}` });
        } catch (err) { sostavy.set(pal, { ошибка: String(err.message || err) }); }
        if (zayavka) risovatZayavku();
      }
    }
  }

  /* ── общий рисунок ────────────────────────────────────── */

  function risovat() {
    if (!root) return;
    const fokus = document.activeElement && root.contains(document.activeElement) && document.activeElement.matches("[data-poisk]");
    root.innerHTML = `
      <div class="dvkRaboty">${kartaPlomby()}${kartaSoglas()}</div>
      <section class="dvkRazdel">${razdel === "plomby" ? razdelPlomby() : razdelSoglas()}</section>`;
    if (fokus) { const p = root.querySelector("[data-poisk]"); p.focus(); p.setSelectionRange(p.value.length, p.value.length); }
    // Лот открываем прямым обработчиком на карточке: 28.09 клик по лоту в CRM
    // до общего обработчика не доходил — карточка «пропадала», окно не открывалось.
    root.querySelectorAll("[data-zayavka]").forEach((kn) => {
      kn.addEventListener("click", (e) => {
        e.stopPropagation();
        otkrytZayavku(kn.dataset.zayavka).catch((oshibka) => {
          // Чтобы «лот пропал» не повторилось молча: ошибку видно и она уходит в след.
          alert("Лот не открылся: " + (oshibka.message || oshibka));
          try { navigator.sendBeacon("/__sled", new Blob([JSON.stringify({ действие: "ошибка ДВК: " + String(oshibka.message || oshibka).slice(0, 120) })], { type: "application/json" })); } catch (x) { /* не важно */ }
        });
      });
    });
  }

  function podklyuchit() {
    root.addEventListener("click", (e) => {
      const r = e.target.closest("[data-razdel]");
      if (r) { razdel = r.dataset.razdel; root.dataset.vybrano = "1"; soobshchenie = null; risovat(); return; }
      const f = e.target.closest("[data-fsoglas]");
      if (f) { filtrSoglas = f.dataset.fsoglas; root.dataset.fsoglas = "1"; risovat(); return; }

    });
    root.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.matches("[data-skan]")) return skan(f.elements.kod.value);
      if (f.matches("[data-vvod]")) {
        const v = f.elements.plomba.value.trim();
        if (v) sohranitPlombu(f.dataset.vvod, v, f);
      }
    });
    root.addEventListener("input", (e) => {
      if (e.target.matches("[data-poisk]")) { poisk = e.target.value; risovat(); }
    });
    root.addEventListener("change", (e) => {
      if (e.target.matches("[data-tolko]")) { tolkoBez = e.target.checked; risovat(); }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && okno && !okno.hidden) oknoZakryt(); });
  }

  async function mount(uzel, nastroyki = {}) {
    const pervyy = root !== uzel;
    root = uzel;
    if (pervyy) {
      podklyuchit();
      // Обновляем раз в минуту, но не под рукой: пока вводят пломбу или открыто окно — ждём.
      setInterval(async () => {
        if (!root.isConnected || root.closest("[hidden]")) return;
        if ((okno && !okno.hidden) || (document.activeElement && root.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.value)) return;
        try { await zagruzit(); risovat(); } catch (e) { /* следующая попытка через минуту */ }
      }, 60000);
    }
    root.innerHTML = '<p class="crmHint">Загружаю рабочее место ДВК…</p>';
    try {
      await zagruzit();
      if (nastroyki.razdel) { razdel = nastroyki.razdel; root.dataset.vybrano = "1"; }
      risovat();
      if (nastroyki.zayavka) otkrytZayavku(nastroyki.zayavka);
    } catch (e) {
      root.innerHTML = `<p class="dvkSoob is-oshibka">${esc(e.message || String(e))}</p>`;
    }
  }

  window.Dvk = { mount };
})();
