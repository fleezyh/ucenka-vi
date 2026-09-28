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
      mozhno = { ...mozhno, двк: true, сб: true, запрос: true };
      const d = demoZayavka();
      sg = { ...sg, ждут: [{ id: "demo", лот: d.заявка.lot, ка: d.заявка.ka, ка_статус: d.заявка.ka_status, склад: d.заявка.sklad,
        статус: "ждёт", паллет: d.паллеты.length, двк_ок: 0, двк_нет: 0, сб_ок: 0, дата_отгрузки: d.заявка.data_otgruzki,
        создал: d.заявка.sozdal, создан: d.заявка.sozdan }, ...(sg.ждут || [])] };
    }
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

  // Этап лота в списке: ДВК → СБ → в канал склада.
  function etapy(z) {
    const vsego = z.паллет || 0;
    const dvk = z.статус === "отклонён" && (z.двк_нет || 0) ? "нет" : vsego && (z.двк_ок || 0) === vsego ? "ок" : "ждёт";
    const sb = z.статус === "согласован" ? "ок" : z.статус === "отклонён" && dvk !== "нет" ? "нет" : "ждёт";
    return { dvk, sb };
  }

  function shag(imya, sost, pod) {
    const k = sost === "ок" ? "is-zel" : sost === "нет" ? "is-krasn" : "";
    const znak = sost === "ок" ? "✓" : sost === "нет" ? "✗" : "…";
    return `<span class="dvkShag ${k}"><i>${znak}</i><b>${imya}</b>${pod ? `<small>${pod}</small>` : ""}</span>`;
  }

  function kartaLota(z) {
    const e = etapy(z);
    const chip = z.статус === "согласован" ? ["согласован", "is-zel"] : z.статус === "отклонён" ? ["отклонён", "is-krasn"]
      : e.dvk === "ждёт" ? ["ждёт ДВК", "is-zhelt"] : ["ждёт СБ", "is-zhelt"];
    return `<button class="dvkLot" type="button" data-zayavka="${z.id}">
      <span class="dvkLot__verh"><b>Лот ${esc(z.лот)}</b><span class="dvkChip ${chip[1]}">${chip[0]}</span></span>
      <span class="dvkLot__ka">${esc(z.ка || "контрагент не указан")}</span>
      <span class="dvkTiho">${esc([z.склад || z.регион, z.ка_статус].filter(Boolean).join(" · "))}</span>
      <span class="dvkShagi dvkShagi--ryad">${shag("ДВК", e.dvk)}<em>→</em>${shag("СБ", e.sb)}<em>→</em>${shag("склад", z.канал_когда ? "ок" : "ждёт")}</span>
      <span class="dvkLot__niz"><span><b>${z.паллет || 0}</b> паллет · отгрузка <b>${esc(data(z.дата_отгрузки))}</b></span>
        <span>${z.статус === "согласован" ? (z.канал_когда ? "в канале " + esc(data(z.канал_когда)) : "в канал не ушло") : "отправил " + esc(z.создал || "—") + " " + esc(data(z.создан))}</span></span>
    </button>`;
  }

  function razdelSoglas() {
    const spiski = { ждут: sg.ждут || [], согласованы: sg.согласованы || [], отклонены: sg.отклонены || [] };
    const spisok = spiski[filtrSoglas] || [];
    const PUSTO = { ждут: "Ждать нечего — все лоты решены.", согласованы: "Согласованных лотов пока нет.", отклонены: "Отклонённых нет." };
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

  function blokSluzhby(sl, imya, r, zhdyot, mozhnoReshat, pochemuNelzya) {
    const sost = r.sost === "ок" ? `<b class="dvkOk">согласовал</b> ${esc(r.kto || "")} <span class="dvkTiho">${esc(data(r.kogda))}</span>`
      : r.sost === "нет" ? `<b class="dvkNet">отклонил</b> ${esc(r.kto || "")} <span class="dvkTiho">${esc(data(r.kogda))}</span><small>${esc(r.pochemu || "")}</small>`
      : '<span class="dvkTiho">ждёт решения</span>';
    const kn = zhdyot && r.sost === "ждёт" && mozhnoReshat
      ? `<div class="dvkSluzhba__kn">
          <button class="crmKn crmKn--glav" type="button" data-reshit="${sl}" data-ok="1"${pochemuNelzya ? " disabled" : ""}>Согласовать лот</button>
          <button class="crmKn crmKn--udalit" type="button" data-reshit="${sl}" data-ok="0">Отклонить…</button>
          ${pochemuNelzya ? `<small class="dvkNet">${esc(pochemuNelzya)}</small>` : ""}</div>` : "";
    return `<div class="dvkSluzhba is-${r.sost === "ок" ? "ok" : r.sost === "нет" ? "net" : "zhdet"}">
      <span class="dvkSluzhba__imya">${imya}</span><div class="dvkSluzhba__sost">${sost}</div>${kn}</div>`;
  }

  function risovatZayavku() {
    const d = zayavka, z = d.заявка, lot = d.лот || {};
    const zhdyot = z.status === "ждёт";
    const p = d.паллеты || [];
    const bez = p.filter((x) => !x.пломба);
    const dvk = reshenieSluzhby(p, "двк"), sb = reshenieSluzhby(p, "сб");
    const sebes = p.reduce((n, x) => n + (Number(x.себестоимость) || 0), 0);
    const shtuk = p.reduce((n, x) => n + (Number(x.штук) || 0), 0);
    const okup = lot.окуп ? (Number(lot.окуп) <= 1.5 ? Number(lot.окуп) * 100 : Number(lot.окуп)) : 0;
    const status = z.status === "согласован" ? ["согласован к отгрузке", "is-zel"] : z.status === "отклонён" ? ["отклонён", "is-krasn"]
      : z.status === "отменён" ? ["отменён", ""] : dvk.sost === "ждёт" ? ["ждёт ДВК", "is-zhelt"] : ["ждёт СБ", "is-zhelt"];
    oknoOtkryt(`
      <div class="crmOkno__top">
        <span class="crmOkno__teg">Согласование отгрузки</span>
        <div class="crmOkno__act">${zhdyot && mozhno.запрос ? '<button class="crmKn crmKn--udalit" type="button" data-otmenit>Отменить заявку</button>' : ""}
          <button class="crmKn" type="button" data-dvk-zakryt>Закрыть</button></div>
      </div>
      <h2>Лот ${esc(z.lot)} · ${esc(z.ka || "контрагент не указан")} <span class="dvkChip ${status[1]}">${status[0]}</span></h2>
      <p class="dvkStroka">${esc(z.ka_status || "")}${z.kommentariy ? " · " + esc(z.kommentariy) : ""} · отправил ${esc(z.sozdal || "—")} ${esc(data(z.sozdan))}</p>
      <div class="dvkFakty">
        <span><i>Отгрузка</i><b>${esc(data(z.data_otgruzki))}</b></span>
        <span><i>Склад</i><b>${esc(z.sklad || z.region || "—")}</b></span>
        <span><i>Паллет · штук</i><b>${p.length} · ${chislo(shtuk)}</b></span>
        <span><i>Себестоимость</i><b>${sebes ? chislo(sebes) + " ₽" : "—"}</b></span>
        <span><i>Цена отгрузки</i><b>${lot.цена ? chislo(lot.цена) + " ₽" : "—"}</b></span>
        <span><i>Окуп</i><b>${okup ? okup.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%" : "—"}</b></span>
      </div>
      <div class="dvkSluzhby">
        ${blokSluzhby("двк", "ДВК", dvk, zhdyot, mozhno.двк, bez.length ? `без пломбы ${bez.length} — сначала пломба` : "")}
        ${blokSluzhby("сб", "СБ", sb, zhdyot, mozhno.сб, dvk.sost !== "ок" ? "сначала решение ДВК" : "")}
        <div class="dvkSluzhba is-${z.kanal_kogda ? "ok" : "zhdet"}"><span class="dvkSluzhba__imya">Склад</span>
          <div class="dvkSluzhba__sost">${z.kanal_kogda ? `<b class="dvkOk">в канале склада</b> <span class="dvkTiho">${esc(data(z.kanal_kogda))}</span>`
            : z.status === "согласован" ? (d.канал_настроен ? '<span class="dvkNet">в канал не ушло</span>' : '<span class="dvkTiho">канал не настроен</span>')
            : '<span class="dvkTiho">уйдёт в канал, когда согласуют ДВК и СБ</span>'}</div></div>
      </div>
      ${zhdyot && bez.length ? `<p class="dvkSoob is-oshibka">Без пломбы ${bez.length}: ${bez.map((x) => esc(x.паллета)).join(", ")} — лот не согласовать, пока ДВК не внесёт пломбу во вкладке «Пломбы».</p>` : ""}
      <p class="dvkZag">Что в лоте · клик по паллете — её состав</p>
      <div class="crmTabl dvkTabl dvkTabl--okno"><table>
        <thead><tr><th>Паллета</th><th>Склад · ячейка</th><th class="crmNum">Шт</th><th class="crmNum">Себес, ₽</th><th>Пломба</th></tr></thead>
        <tbody>${p.map((x) => `<tr data-sostav="${esc(x.паллета)}" class="${x.пломба ? "" : "is-bez"}">
          <td><b>${otkryty.has(x.паллета) ? "▾" : "▸"} ${esc(x.паллета)}</b>${x.нельзя ? `<span class="dvkPometka">${esc(x.нельзя)}</span>` : ""}${!x.в_остатках ? '<span class="dvkPometka">нет в остатках</span>' : ""}</td>
          <td>${esc(x.склад || "—")} <span class="dvkTiho">${esc(x.ячейка || "")}</span></td>
          <td class="crmNum">${chislo(x.штук)}</td><td class="crmNum">${x.себестоимость ? chislo(x.себестоимость) : "—"}</td>
          <td>${x.пломба ? `<b class="dvkPlombaEst">${esc(x.пломба)}</b>` : '<span class="dvkNet">нет пломбы</span>'}</td>
        </tr>${otkryty.has(x.паллета) ? `<tr class="crmReestr__sostav"><td colspan="5">${sostavHtml(x.паллета)}</td></tr>` : ""}`).join("")}</tbody>
      </table></div>`);
  }

  async function reshit(sl, ok) {
    let pochemu = "";
    if (!ok) {
      pochemu = (prompt(`${sl.toUpperCase()}: почему лот не согласован? Увидят продажи и склад.`) || "").trim();
      if (!pochemu) return;
    } else if (!confirm(`${sl.toUpperCase()}: согласовать лот ${zayavka.заявка.lot} целиком (${(zayavka.паллеты || []).length} паллет)?`)) {
      return;
    }
    if (String(zayavka.заявка.id) === "demo") {
      (zayavka.паллеты || []).forEach((x) => {
        if (sl === "сб" && x.двк !== true) return;
        x[sl] = ok; x[sl + "_кто"] = "вы (демо)"; x[sl + "_когда"] = "2026-09-28 17:30"; x[sl + "_почему"] = pochemu;
      });
      if (!ok) zayavka.заявка.status = "отклонён";
      else if (sl === "сб") zayavka.заявка.status = "согласован";
      return risovatZayavku();
    }
    try {
      zayavka = { ...(await poslat({ действие: "решение_лота", id: zayavka.заявка.id, служба: sl, ок: ok, почему: pochemu })), можно: mozhno };
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
    const r = t.closest("[data-reshit]");
    if (r && !r.disabled) return reshit(r.dataset.reshit, r.dataset.ok === "1");
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
