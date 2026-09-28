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

  async function zagruzit() {
    const [a, b] = await Promise.all([
      fetch("/__soglas/plomby", { cache: "no-store" }),
      fetch("/__soglas", { cache: "no-store" }),
    ]);
    if (a.status === 403 || b.status === 403) throw new Error("нет доступа к рабочему месту ДВК");
    if (a.ok) pl = await a.json();
    if (b.ok) sg = await b.json();
    mozhno = { ...(sg.можно || {}), двк: Boolean((pl.можно || {}).двк || (sg.можно || {}).двк) };
    if (!root.dataset.vybrano) razdel = (pl.без_пломбы || !(sg.ждут || []).length) ? "plomby" : "soglas";
    // Ждать нечего — сразу показываем согласованные, а не пустую колонку.
    if (!root.dataset.fsoglas) filtrSoglas = (sg.ждут || []).length ? "ждут" : "согласованы";
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
    // Полоса паллет: закрашенные — проверены, пустые красные — ждут пломбу.
    const kvadratov = Math.min(36, vse.length);
    const krasnyh = vse.length ? Math.max(bez ? 1 : 0, Math.round(kvadratov * bez / vse.length)) : 0;
    const kv = Array.from({ length: kvadratov }, (_, i) => `<i class="${i < krasnyh ? "is-bez" : ""}" style="--d:${(i * 0.05).toFixed(2)}s"></i>`).join("");
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
      <p class="crmSchyot">${stroki.length} паллет${tolkoBez ? " без пломбы" : ""} · остатки на ${esc(data(pl.остатки_на))}
        ${mozhno.двк ? "" : " · вносить пломбы может только ДВК"}</p>
      <div class="crmTabl dvkTabl"><table>
        <thead><tr><th>Паллета</th><th>Склад</th><th>Ячейка</th><th class="crmNum">SKU</th><th class="crmNum">Шт</th>
          <th>Пломба</th><th>Кто · когда</th></tr></thead>
        <tbody>${stroki.slice(0, 800).map((p) => `
          <tr data-pallet="${esc(p.паллета)}" class="${bezPlombyNado(p) ? "is-bez" : ""}${p.паллета === vydelena ? " is-vydelena" : ""}">
            <td><b>${esc(p.паллета)}</b>${STATUS[p.в_книге] ? `<span class="dvkPometka${p.в_книге === "резерв" ? " is-tiho" : ""}">${esc(STATUS[p.в_книге])}</span>` : ""}</td>
            <td>${esc(p.склад)}</td><td class="dvkTiho">${esc(p.ячейка)}</td>
            <td class="crmNum">${chislo(p.sku)}</td><td class="crmNum">${chislo(p.штук)}</td>
            <td class="dvkPlomba">${p.пломба ? `<b>${esc(p.пломба)}</b>` : '<span class="dvkNet">нет</span>'}
              ${mozhno.двк && p.в_книге !== "нельзя продавать" ? `<form class="dvkVvod" data-vvod="${esc(p.паллета)}">
                <input name="plomba" autocomplete="off" placeholder="${p.пломба ? "заменить" : "пломба"}"><button class="crmKn crmKn--glav" type="submit">✓</button></form>` : ""}</td>
            <td class="dvkTiho">${p.пломба ? `${esc(p.проверил || p.источник)} · ${esc(data(p.когда))}` : ""}</td>
          </tr>`).join("") || `<tr><td colspan="7" class="dvkPusto">${tolkoBez && !slovo ? "Все наши паллеты проверены ДВК." : "Ничего не нашлось."}</td></tr>`}</tbody>
      </table></div>`;
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
    const tr = root.querySelector(`tr[data-pallet="${CSS.escape(p.паллета)}"]`);
    if (tr) { tr.scrollIntoView({ block: "center" }); tr.querySelector("input")?.focus(); }
  }

  /* ── согласование отгрузок ────────────────────────────── */

  function polosa(imya, sdelano, vsego, klass) {
    const d = vsego ? Math.round(sdelano / vsego * 100) : 0;
    return `<span class="dvkPolosa ${klass || ""}"><span class="dvkPolosa__imya">${imya}</span>
      <span class="dvkPolosa__lin"><i style="width:${d}%"></i></span><b>${sdelano}/${vsego}</b></span>`;
  }

  function kartaLota(z) {
    const vsego = z.паллет || 0;
    const dvk = (z.двк_ок || 0) + (z.двк_нет || 0);
    const gotov = z.статус === "согласован";
    const etap = gotov ? ["согласован", "is-zel"] : dvk < vsego ? ["ждёт ДВК", "is-krasn"] : ["ждёт СБ", "is-zhelt"];
    return `<button class="dvkLot" type="button" data-zayavka="${z.id}">
      <span class="dvkLot__verh"><b>Лот ${esc(z.лот)}</b><span class="dvkChip ${etap[1]}">${etap[0]}</span></span>
      <span class="dvkLot__ka">${esc(z.ка || "контрагент не указан")}</span>
      <span class="dvkTiho">${esc([z.склад || z.регион, z.ка_статус].filter(Boolean).join(" · "))}</span>
      ${gotov ? polosa("к отгрузке", z.к_отгрузке || 0, vsego, "is-zel")
        : polosa("ДВК", dvk, vsego, dvk === vsego && vsego ? "is-zel" : "") + polosa("СБ", z.сб_ок || 0, z.двк_ок || 0, "")}
      <span class="dvkLot__niz"><span>отгрузка <b>${esc(data(z.дата_отгрузки))}</b></span>
        <span>${gotov ? (z.канал_когда ? "в канале " + esc(data(z.канал_когда)) : "в канал не ушло") : "отправил " + esc(z.создал || "—") + " " + esc(data(z.создан))}</span></span>
    </button>`;
  }

  function razdelSoglas() {
    const zhdut = sg.ждут || [], ok = sg.согласованы || [];
    const spisok = filtrSoglas === "согласованы" ? ok : zhdut;
    return `
      <div class="dvkVerh">
        <nav class="crmFiltry dvkSeg">
          <button class="crmFiltr${filtrSoglas === "ждут" ? " is-on" : ""}" type="button" data-fsoglas="ждут">ждут · ${zhdut.length}</button>
          <button class="crmFiltr${filtrSoglas === "согласованы" ? " is-on" : ""}" type="button" data-fsoglas="согласованы">согласованы · ${ok.length}</button>
        </nav>
        <span class="crmSchyot">лот на согласование отправляют из карточки оплаченного лота в CRM</span>
      </div>
      <div class="dvkLoty">${spisok.map(kartaLota).join("")
        || `<p class="dvkPusto">${filtrSoglas === "ждут" ? "Все лоты согласованы — ждать нечего." : "Согласованных лотов пока нет."}</p>`}</div>`;
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
    if (okno) okno.hidden = true;
    zayavka = null;
    otkryty.clear();
  }

  async function otkrytZayavku(id) {
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

  function yacheyka(p, sl, zhdyot) {
    const ok = p[sl], kto = p[sl + "_кто"], kogda = p[sl + "_когда"], pochemu = p[sl + "_почему"];
    const pravo = sl === "двк" ? mozhno.двк : mozhno.сб;
    if (sl === "сб" && p.двк === false) return '<span class="dvkTiho">—</span>';
    if (zhdyot && pravo && (sl === "двк" || p.двк === true)) {
      return `<label class="dvkGal"><input type="checkbox" data-gal="${sl}" data-pallet="${esc(p.паллета)}"${ok === true ? " checked" : ""}${sl === "двк" && !p.пломба ? " disabled" : ""}>
        ${sl === "двк" && !p.пломба ? '<span class="dvkNet">нет пломбы</span>' : ok === false ? `<span class="dvkNet">нет · ${esc(pochemu || "")}</span>` : ""}</label>`;
    }
    if (ok === true) return `<span class="dvkOk">✓</span> <span class="dvkTiho">${esc(kto)} ${esc(data(kogda))}</span>`;
    if (ok === false) return `<span class="dvkNet">✗ ${esc(pochemu || "")}</span> <span class="dvkTiho">${esc(kto)}</span>`;
    return '<span class="dvkTiho">ждёт</span>';
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

  function risovatZayavku() {
    const d = zayavka, z = d.заявка, lot = d.лот || {};
    const zhdyot = z.status === "ждёт";
    const p = d.паллеты || [];
    const dvkReshil = p.filter((x) => x.двк !== null).length;
    const dvkOk = p.filter((x) => x.двк === true).length;
    const sbReshil = p.filter((x) => x.двк === true && x.сб !== null).length;
    const kOtgr = p.filter((x) => x.двк === true && x.сб === true).length;
    const bez = p.filter((x) => !x.пломба);
    const sebes = p.reduce((n, x) => n + (Number(x.себестоимость) || 0), 0);
    const okup = lot.окуп ? (Number(lot.окуп) <= 1.5 ? Number(lot.окуп) * 100 : Number(lot.окуп)) : 0;
    oknoOtkryt(`
      <div class="crmOkno__top">
        <span class="crmOkno__teg">Согласование отгрузки</span>
        <div class="crmOkno__act"><button class="crmKn" type="button" data-dvk-zakryt>Закрыть</button></div>
      </div>
      <h2>Лот ${esc(z.lot)} · ${esc(z.ka || "контрагент не указан")}</h2>
      <p class="dvkStroka">${esc(z.ka_status || "")}${z.kommentariy ? " · " + esc(z.kommentariy) : ""}</p>
      <div class="dvkFakty">
        <span><i>Отгрузка</i><b>${esc(data(z.data_otgruzki))}</b></span>
        <span><i>Склад</i><b>${esc(z.sklad || z.region || "—")}</b></span>
        <span><i>Паллет</i><b>${p.length}</b></span>
        <span><i>Себестоимость</i><b>${chislo(sebes)} ₽</b></span>
        <span><i>Цена отгрузки</i><b>${lot.цена ? chislo(lot.цена) + " ₽" : "—"}</b></span>
        <span><i>Окуп</i><b>${okup ? okup.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%" : "—"}</b></span>
      </div>
      <div class="dvkShagi">
        ${polosa("ДВК", dvkReshil, p.length, z.dvk_kogda ? "is-zel" : "")}
        ${polosa("СБ", sbReshil, dvkOk, z.sb_kogda ? "is-zel" : "")}
        ${z.status === "согласован" ? polosa("к отгрузке", kOtgr, p.length, "is-zel") : ""}
      </div>
      <p class="dvkStroka">ДВК: ${z.dvk_kto ? esc(z.dvk_kto) + " " + esc(data(z.dvk_kogda)) : "ждёт"} · СБ: ${z.sb_kto ? esc(z.sb_kto) + " " + esc(data(z.sb_kogda)) : "ждёт"}
        ${z.status === "согласован" ? " · " + (z.kanal_kogda ? "в канал склада " + esc(data(z.kanal_kogda)) : d.канал_настроен ? "в канал не ушло" : "канал склада не настроен") : ""}
        · отправил ${esc(z.sozdal || "—")} ${esc(data(z.sozdan))}</p>
      ${zhdyot && bez.length ? `<p class="dvkSoob is-oshibka">Без пломбы ${bez.length}: ${bez.map((x) => esc(x.паллета)).join(", ")} — ДВК их не согласует, пока не внесёт пломбу во вкладке «Пломбы».</p>` : ""}
      ${zhdyot && (mozhno.двк || mozhno.сб) ? `<div class="dvkDeystviya">
        ${mozhno.двк ? '<button class="crmKn" type="button" data-vse="двк">Отметить все · ДВК</button><button class="crmKn crmKn--glav" type="button" data-sohr="двк">Сохранить решение ДВК</button>' : ""}
        ${mozhno.сб ? '<button class="crmKn" type="button" data-vse="сб">Отметить все · СБ</button><button class="crmKn crmKn--glav" type="button" data-sohr="сб">Сохранить решение СБ</button>' : ""}
        <span class="dvkTiho">неотмеченная — «не согласовано», спросим причину</span></div>` : ""}
      <div class="crmTabl dvkTabl dvkTabl--okno"><table>
        <thead><tr><th>Паллета</th><th>Склад · ячейка</th><th class="crmNum">Шт</th><th class="crmNum">Себес, ₽</th>
          <th>Пломба</th><th>ДВК</th><th>СБ</th></tr></thead>
        <tbody>${p.map((x) => `<tr data-sostav="${esc(x.паллета)}">
          <td><b>${otkryty.has(x.паллета) ? "▾" : "▸"} ${esc(x.паллета)}</b>${x.нельзя ? `<span class="dvkPometka">${esc(x.нельзя)}</span>` : ""}${!x.в_остатках ? '<span class="dvkPometka">нет в остатках</span>' : ""}</td>
          <td>${esc(x.склад || "—")} <span class="dvkTiho">${esc(x.ячейка || "")}</span></td>
          <td class="crmNum">${chislo(x.штук)}</td><td class="crmNum">${chislo(x.себестоимость)}</td>
          <td>${x.пломба ? `<b>${esc(x.пломба)}</b>` : '<span class="dvkNet">нет</span>'}</td>
          <td data-stop>${yacheyka(x, "двк", zhdyot)}</td><td data-stop>${yacheyka(x, "сб", zhdyot)}</td>
        </tr>${otkryty.has(x.паллета) ? `<tr class="crmReestr__sostav"><td colspan="7">${sostavHtml(x.паллета)}</td></tr>` : ""}`).join("")}</tbody>
      </table></div>
      ${zhdyot && mozhno.запрос ? '<div class="dvkDeystviya"><button class="crmKn crmKn--udalit" type="button" data-otmenit>Отменить заявку</button></div>' : ""}`);
  }

  async function sohranitResheniya(sl) {
    const galki = [...okno.querySelectorAll(`input[data-gal="${sl}"]:not([disabled])`)];
    if (!galki.length) return;
    const net = galki.filter((g) => !g.checked);
    let pochemu = "";
    if (net.length) {
      pochemu = prompt(`Не согласовано ${net.length} паллет. Почему? (увидят продажи и склад)`) || "";
      if (!pochemu.trim()) return;
    }
    const resheniya = {};
    galki.forEach((g) => { resheniya[g.dataset.pallet] = g.checked ? true : { ок: false, почему: pochemu }; });
    try {
      zayavka = { ...(await poslat({ действие: "отметить", id: zayavka.заявка.id, служба: sl, решения: resheniya })), можно: mozhno };
      risovatZayavku();
      await zagruzit();
      risovat();
    } catch (e) {
      alert("Не сохранилось: " + (e.message || e));
    }
  }

  async function klikOkna(e) {
    const t = e.target;
    if (t.closest("[data-dvk-zakryt]")) return oknoZakryt();
    const vse = t.closest("[data-vse]");
    if (vse) { okno.querySelectorAll(`input[data-gal="${vse.dataset.vse}"]:not([disabled])`).forEach((g) => { g.checked = true; }); return; }
    const sohr = t.closest("[data-sohr]");
    if (sohr) return sohranitResheniya(sohr.dataset.sohr);
    if (t.closest("[data-otmenit]") && zayavka && confirm("Отменить заявку на согласование?")) {
      try { await poslat({ действие: "отменить", id: zayavka.заявка.id }); oknoZakryt(); await zagruzit(); risovat(); }
      catch (err) { alert(err.message || err); }
      return;
    }
    if (t.closest("[data-stop]")) return;
    const s = t.closest("tr[data-sostav]");
    if (s) {
      const pal = s.dataset.sostav;
      if (otkryty.has(pal)) otkryty.delete(pal); else otkryty.add(pal);
      risovatZayavku();
      if (otkryty.has(pal) && !sostavy.has(pal)) {
        try {
          const r = await fetch(`/__soglas/sostav?паллета=${encodeURIComponent(pal)}`, { cache: "no-store" });
          sostavy.set(pal, r.ok ? await r.json() : { ошибка: `сервер ответил ${r.status}` });
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
  }

  function podklyuchit() {
    root.addEventListener("click", (e) => {
      const r = e.target.closest("[data-razdel]");
      if (r) { razdel = r.dataset.razdel; root.dataset.vybrano = "1"; soobshchenie = null; risovat(); return; }
      const f = e.target.closest("[data-fsoglas]");
      if (f) { filtrSoglas = f.dataset.fsoglas; root.dataset.fsoglas = "1"; risovat(); return; }
      const l = e.target.closest("[data-zayavka]");
      if (l) otkrytZayavku(l.dataset.zayavka);
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
