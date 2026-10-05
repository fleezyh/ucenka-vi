/* Экономика позиций (05.10.2026).
 *
 * Степан: «как будто можно эту тему сделать изменяемой и сразу по любой позиции… если это технически
 * возможно абсолютно по всем позициям сделать огромную мощную тему — то гоу». Образец — книга
 * «экономика_пескобетон_профиль» (24.09) для ассортиментного комитета: сколько остаётся со штуки после
 * склада и брака. Здесь — по каждой позиции, что лежала на Домодедово за год (или была в актах брака).
 *
 * Данные — /data/antigen/ekonomika/: index.json.gz (словари, ставки, сводка по рубрикам, топ-300 худших) и
 * r{N}.json.gz по рубрике (сырые факты: штуки, выручка, себес, строки заказов, акты, средний остаток,
 * объём штуки). Считает браузер: ставки правятся на странице и запоминаются на этом компьютере.
 */
(function () {
  "use strict";

  const DATA = "../../data/antigen/ekonomika/";   // под правом «antigen»: себес и маржа всей номенклатуры
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chislo = (n, z = 0) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("ru-RU", { minimumFractionDigits: z, maximumFractionDigits: z }));
  const rub = (n, z = 1) => (n == null || !isFinite(n) ? "—" : `${n > 0 ? "" : n < 0 ? "−" : ""}${chislo(Math.abs(n), z)}`);
  const mln = (n) => (n == null || !isFinite(n) ? "—" : `${n < 0 ? "−" : ""}${chislo(Math.abs(n) / 1e6, Math.abs(n) >= 1e8 ? 0 : 1)} млн`);

  let idx = null;                 // общий файл
  const rubriki = new Map();      // r1 → колонки
  let stavki = null;              // текущие ставки
  const sost = { r1: "", r2: "", tip: "", q: "", sort: "seli", minus: false, pokazano: 100 };

  // ------------------------------------------------------------ загрузка

  async function gz(put) {
    const o = await fetch(DATA + put, { cache: "default" });
    if (!o.ok) throw new Error(o.status === 403 ? "нет доступа к разделу" : `сервер ответил ${o.status}`);
    const bufer = await o.arrayBuffer();
    const b = new Uint8Array(bufer);
    if (b[0] === 0x1f && b[1] === 0x8b) {
      const s = new Blob([bufer]).stream().pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(s).text());
    }
    return JSON.parse(new TextDecoder().decode(b));   // сервер уже разжал по дороге
  }

  async function rubrika(r1) {
    if (!rubriki.has(r1)) {
      const f = idx.рубрики.find((x) => x.r1 === r1);
      $("ekStatus").textContent = `Загружаю «${f.имя}» — ${chislo(f.строк)} позиций, ${chislo(f.кб)} КБ…`;
      const d = await gz(f.файл);
      d.kol.r1 = d.kol.id.map(() => r1);
      rubriki.set(r1, d.kol);
    }
    return rubriki.get(r1);
  }

  // ------------------------------------------------------------ ставки

  const KL = "ekonomika-stavki-v1";
  function stavkiPoUmolch() {
    const m = idx.meta;
    return {
      аренда: m.ставки.аренда, коммуналка: m.ставки.коммуналка, эксплуатация: m.ставки.эксплуатация,
      объём: m.средний_объём_остатка_ДМД_м3, дней: m.ставки.дней,
      обработка: m.ставки.обработка, обработка_с_арендой: m.ставки.обработка_с_арендой, с_арендой_фб: false,
      тарифы: { ...m.тарифы }, место: {}, на_операцию: { ...(m.штук_на_операцию || {}) }, по_штукам: [...(m.по_штукам || [])],
    };
  }
  function zagruzitStavki() {
    stavki = stavkiPoUmolch();
    try {
      const s = JSON.parse(localStorage.getItem(KL) || "null");
      if (s) stavki = { ...stavki, ...s, тарифы: { ...stavki.тарифы, ...(s.тарифы || {}) }, место: { ...(s.место || {}) },
        на_операцию: { ...stavki.на_операцию, ...(s.на_операцию || {}) }, по_штукам: s.по_штукам || stavki.по_штукам };
    } catch (e) { /* по умолчанию */ }
  }
  const sohranitStavki = () => { try { localStorage.setItem(KL, JSON.stringify(stavki)); } catch (e) { /* не страшно */ } };
  const stavkaM3 = () => 1e6 * (stavki.аренда + stavki.коммуналка + stavki.эксплуатация) / (stavki.объём * stavki.дней);
  const obrabotka = () => (stavki.с_арендой_фб ? stavki.обработка_с_арендой : stavki.обработка);

  // ------------------------------------------------------------ расчёт одной позиции

  function raschet(k, i) {
    const tip = idx.slov.tip[k.tip[i]];
    const sht = k.sht[i], vyr = k.vyr[i], seb = k.seb[i], ak = k.akty[i];
    const marzha = vyr - seb;
    // операций: мелочь — строки заказов (берут пачками); крупное — не меньше штук ÷ штук на операцию
    const ops = stavki.по_штукам.includes(tip) && stavki.на_операцию[tip] ? Math.max(k.str[i], sht / stavki.на_операцию[tip]) : k.str[i];
    const rabota = (stavki.тарифы[tip] || 0) * ops;
    const mesto = stavki.место[tip] || 1;
    const hran = stavkaM3() * k.l[i] / 1000 * mesto * k.ost[i] * 365;       // ₽ за м³·сутки × объём × средний остаток × год
    const brakSeb = sht ? ak * seb / sht : 0;
    const obr = ak * obrabotka();
    const itog = marzha - rabota - hran - brakSeb - obr;
    return { tip, sht, vyr, seb, ak, marzha, rabota, hran, brakSeb, obr, itog, ops,
      na: (v) => (sht > 0 ? v / sht : null),
      dney: sht > 0 ? k.ost[i] / sht * 365 : null,
      brakDolya: sht > 0 ? ak / sht * 100 : null };
  }

  // ------------------------------------------------------------ выборка

  function stroki() {
    const out = [];
    const q = sost.q.trim().toLowerCase();
    const art = /^\d{5,}$/.test(q) ? Number(q) : null;
    const slova = q.split(/\s+/).filter(Boolean);   // «пескобетон dauer» — каждое слово где угодно в названии
    const istochniki = sost.r1 !== "" ? [rubriki.get(Number(sost.r1))].filter(Boolean)
      : q ? [...rubriki.values()] : [idx.топKol];
    for (const k of istochniki) {
      for (let i = 0; i < k.id.length; i++) {
        if (sost.r2 !== "" && k.r2[i] !== Number(sost.r2)) continue;
        if (sost.tip !== "" && k.tip[i] !== Number(sost.tip)) continue;
        if (q) {
          if (art != null) { if (k.art[i] !== art) continue; }
          else { const im = k.imya[i].toLowerCase(); if (!slova.every((s) => im.includes(s))) continue; }
        }
        const r = raschet(k, i);
        if (sost.minus && r.itog >= 0) continue;
        // маржа есть, а склад и брак её съели; при поиске показываем найденное целиком — ищут конкретный товар
        if (sost.sort === "seli" && !q && !(r.marzha > 0 && r.itog < 0)) continue;
        out.push({ k, i, r });
      }
    }
    const kl = {
      seli: (x) => x.r.itog,
      god: (x) => x.r.itog,
      sht: (x) => (x.r.sht ? x.r.itog / x.r.sht : x.r.itog),
      brak: (x) => -(x.r.brakDolya ?? -1),
      hran: (x) => -x.r.hran,
      vyr: (x) => -x.r.vyr,
    }[sost.sort];
    out.sort((a, b) => kl(a) - kl(b));
    return out;
  }

  // ------------------------------------------------------------ отрисовка

  function plitki(sp) {
    const s = { vyr: 0, marzha: 0, rabota: 0, hran: 0, brak: 0, itog: 0, minus: 0 };
    sp.forEach(({ r }) => { s.vyr += r.vyr; s.marzha += r.marzha; s.rabota += r.rabota; s.hran += r.hran; s.brak += r.brakSeb + r.obr; s.itog += r.itog; s.minus += r.itog < 0 ? 1 : 0; });
    const p = (imya, v, mod = "") => `<div class="ekPl${mod}"><span>${imya}</span><b>${v}</b></div>`;
    $("ekPlitki").innerHTML = [
      p("позиций", `${chislo(sp.length)}${s.minus ? ` <small>в минусе ${chislo(s.minus)}</small>` : ""}`),
      p("выручка за год", mln(s.vyr)), p("маржа", mln(s.marzha)), p("склад: работа", mln(-s.rabota), " is-minus"),
      p("склад: хранение", mln(-s.hran), " is-minus"), p("брак: себес и обработка", mln(-s.brak), " is-minus"),
      p("остаётся за год", mln(s.itog), s.itog < 0 ? " is-itog is-minus" : " is-itog"),
    ].join("");
  }

  function svodRubrik() {
    if (sost.r1 !== "" || sost.q) { $("ekSvod").innerHTML = ""; return; }
    const sp = [...idx.рубрики].filter((x) => x.свод).sort((a, b) => a.свод.итог / Math.max(a.свод.выручка, 1) - b.свод.итог / Math.max(b.свод.выручка, 1));
    $("ekSvod").innerHTML = `<h2>По рубрикам <small>ставки по умолчанию · щёлкните рубрику, чтобы считать по своим ставкам</small></h2>
      <div class="ekSvod__tab"><table><thead><tr><th>Рубрика</th><th>позиций</th><th>выручка</th><th>маржа</th><th>склад</th><th>хранение</th><th>брак</th><th>остаётся</th><th>в минусе</th></tr></thead>
      <tbody>${sp.map((x) => { const s = x.свод; return `<tr data-r1="${x.r1}"><td>${esc(x.имя)}</td><td>${chislo(x.строк)}</td><td>${mln(s.выручка)}</td><td>${mln(s.маржа)}</td>
        <td>${mln(-s.работа)}</td><td>${mln(-s.хранение)}</td><td>${mln(-(s.брак_себес + s.обработка))}</td>
        <td class="${s.итог < 0 ? "is-minus" : ""}"><b>${mln(s.итог)}</b> <small>${chislo(s.итог / Math.max(s.выручка, 1) * 100, 1)}%</small></td><td>${chislo(s.в_минусе)}</td></tr>`; }).join("")}</tbody></table></div>`;
  }

  function tablica(sp) {
    const vid = sp.slice(0, sost.pokazano);
    const zag = sost.r1 === "" && !sost.q
      ? `Маржа есть, а склад и брак её съели <small>топ-300 по всем рубрикам по ставкам по умолчанию, пересчитаны по вашим; выберите рубрику — будут все позиции</small>`
      : sost.sort === "seli" && !sost.q ? "Маржа есть, а склад и брак её съели" : "Позиции";
    $("ekTablica").innerHTML = `<h2>${zag}</h2><div class="ekTab"><table><thead><tr>
      <th>Товар</th><th>продано</th><th>цена</th><th>маржа</th><th>склад</th><th>хранение</th><th>брак</th><th>со штуки</th><th>за год</th><th>брак, %</th></tr>
      <tr class="ekTab__pod"><th></th><th>шт/год</th><th colspan="6">₽ на одну проданную штуку</th><th>₽</th><th></th></tr></thead>
      <tbody>${vid.map(({ k, i, r }) => `<tr data-k="${sost.r1 === "" && !sost.q && k === idx.топKol ? "top" : k.r1[i]}" data-i="${i}">
        <td class="ekTab__tov"><b>${esc(k.imya[i])}</b><small>${k.art[i] || ""} · ${esc(idx.slov.r1[k.r1[i]] || "")}${idx.slov.r2[k.r2[i]] ? " · " + esc(idx.slov.r2[k.r2[i]]) : ""} · ${esc(r.tip)}</small></td>
        <td>${chislo(r.sht)}</td><td>${rub(r.na(r.vyr))}</td><td>${rub(r.na(r.marzha))}</td>
        <td class="is-m">${rub(r.na(-r.rabota))}</td><td class="is-m">${rub(r.na(-r.hran))}</td><td class="is-m">${rub(r.na(-(r.brakSeb + r.obr)))}</td>
        <td class="${r.itog < 0 ? "is-minus" : "is-plus"}"><b>${r.sht ? rub(r.itog / r.sht) : "—"}</b></td>
        <td class="${r.itog < 0 ? "is-minus" : "is-plus"}">${mln(r.itog)}</td><td>${r.brakDolya != null ? chislo(r.brakDolya, 1) : (r.ak ? "∞" : "—")}</td></tr>`).join("")}</tbody></table></div>
      ${sp.length > vid.length ? `<button type="button" class="ekBtn ekEshche" data-eshche>Показать ещё 100 из ${chislo(sp.length - vid.length)}</button>` : ""}`;
  }

  function risovat() {
    const sp = stroki();
    plitki(sp);
    svodRubrik();
    tablica(sp);
    const m = idx.meta;
    $("ekStatus").textContent = `${m.период} · ${chislo(m.строк)} позиций с продажами от ${m.порог_продаж} шт или актами брака · `
      + `хранение ${chislo(stavkaM3(), 1)} ₽ за м³ в сутки · обработка брака ${chislo(obrabotka())} ₽ за штуку`;
  }

  // ------------------------------------------------------------ карточка позиции

  function karta(k, i) {
    const r = raschet(k, i);
    const na = (v) => (r.sht ? v / r.sht : 0);
    const shagi = [
      ["Цена продажи", na(r.vyr), "plus"], ["− себестоимость", -na(r.seb), "minus"], ["Маржа", na(r.marzha), "itog"],
      ["− склад: работа со штукой", -na(r.rabota), "minus"], ["− склад: хранение", -na(r.hran), "minus"],
      ["− себес, потерянный на браке", -na(r.brakSeb), "minus"], ["− наша обработка брака", -na(r.obr), "minus"],
      ["Остаётся со штуки", na(r.itog), "itog"],
    ];
    const maks = Math.max(...shagi.map((s) => Math.abs(s[1])), 1);
    const imyaR1 = idx.slov.r1[k.r1[i]] || "";
    $("ekKarta").innerHTML = `<button type="button" class="ekKarta__x" data-zakryt aria-label="Закрыть">×</button>
      <p class="ekKicker">${esc(imyaR1)}${idx.slov.r2[k.r2[i]] ? " · " + esc(idx.slov.r2[k.r2[i]]) : ""}${idx.slov.r3[k.r3[i]] ? " · " + esc(idx.slov.r3[k.r3[i]]) : ""}</p>
      <h2>${esc(k.imya[i])}</h2>
      <p class="ekKarta__pod">код ${k.art[i] || "—"} · модель учёта ${esc(idx.slov.model[k.model[i]])} (${esc(r.tip)}) · продано ${chislo(r.sht)} шт за год ·
        ${chislo(k.str[i])} строк заказов · актов брака ${chislo(r.ak)}${r.brakDolya != null ? ` (${chislo(r.brakDolya, 1)}%)` : ""}</p>
      <div class="ekItog ${r.itog < 0 ? "is-minus" : "is-plus"}"><span>остаётся со штуки</span><b>${r.sht ? rub(r.itog / r.sht) + " ₽" : "—"}</b>
        <span>за год</span><b>${mln(r.itog)} ₽</b></div>
      <div class="ekVodopad">${shagi.map(([imya, v, vid]) => `<div class="ekVodopad__s is-${vid}"><span>${imya}</span>
        <i style="--w:${Math.abs(v) / maks * 100}%"></i><b>${rub(v)}</b></div>`).join("")}</div>
      <dl class="ekKarta__fakty">
        <dt>Средний остаток на ДМД</dt><dd>${chislo(k.ost[i], 0)} шт · ${r.dney != null ? chislo(r.dney) + " дней продаж" : "не продаётся"}</dd>
        <dt>Объём штуки</dt><dd>${chislo(k.l[i], 2)} л${k.dl[i] ? ` · длина ${chislo(k.dl[i])} мм` : ""}${k.oc[i] ? " · габаритов нет в ВМС — медиана модели" : ""}</dd>
        <dt>Хранение за год</dt><dd>${mln(-r.hran)} ₽ — ${chislo(stavkaM3(), 1)} ₽ за м³ в сутки${(stavki.место[r.tip] || 1) !== 1 ? ` × место ${stavki.место[r.tip]}` : ""}</dd>
        <dt>Склад: работа</dt><dd>${chislo(stavki.тарифы[r.tip] || 0, 1)} ₽ на операцию × ${chislo(r.ops)} операций${r.ops > k.str[i] ? ` (${chislo(r.sht)} шт ÷ ${chislo(stavki.на_операцию[r.tip], 2)} шт на операцию)` : " (строки заказов)"} = ${mln(-r.rabota)} ₽</dd>
        <dt>Брак за год</dt><dd>себес ${mln(-r.brakSeb)} ₽ + обработка ${chislo(r.ak)} × ${chislo(obrabotka())} ₽ = ${mln(-r.obr)} ₽</dd>
      </dl>`;
    $("ekOkno").hidden = false;
    document.body.classList.add("ekZamok");
  }

  // ------------------------------------------------------------ ставки

  function risovatStavki() {
    const t = stavki.тарифы;
    const tipy = idx.slov.tip.filter(Boolean);
    $("ekStavki").innerHTML = `
      <div class="ekSt__gr"><h3>Хранение — расходы ДМД в месяц</h3>
        <label>Аренда, млн ₽<input type="number" step="0.1" data-st="аренда" value="${stavki.аренда}"></label>
        <label>Коммуналка, млн ₽<input type="number" step="0.1" data-st="коммуналка" value="${stavki.коммуналка}"></label>
        <label>Эксплуатация, млн ₽<input type="number" step="0.1" data-st="эксплуатация" value="${stavki.эксплуатация}"></label>
        <label>Средний объём товара на ДМД, м³<input type="number" step="100" data-st="объём" value="${stavki.объём}"></label>
        <p class="ekSt__itog">= ${chislo(stavkaM3(), 1)} ₽ за м³ в сутки, делим по объёму штуки</p></div>
      <div class="ekSt__gr"><h3>Брак — наша обработка</h3>
        <label>ФОТ и аутсорс ФБ, ₽ за штуку<input type="number" step="1" data-st="обработка" value="${stavki.обработка}"></label>
        <label>С арендой площадей ФБ, ₽<input type="number" step="1" data-st="обработка_с_арендой" value="${stavki.обработка_с_арендой}"></label>
        <label class="ekFlag"><input type="checkbox" data-st="с_арендой_фб"${stavki.с_арендой_фб ? " checked" : ""}> считать с арендой ФБ</label></div>
      <div class="ekSt__gr ekSt__gr--shir"><h3>Склад — сдельщина ДМД на операцию (мар–авг 2026) и место в ячейке</h3>
        <div class="ekSt__tarify">${tipy.map((tp) => `<label><b>${esc(tp)}</b>
          <span>₽ <input type="number" step="0.1" data-tarif="${esc(tp)}" value="${t[tp] ?? 0}"></span>
          <span>место × <input type="number" step="0.1" min="0.1" data-mesto="${esc(tp)}" value="${stavki.место[tp] || 1}"></span>
          ${stavki.по_штукам.includes(tp) ? `<span>шт/опер <input type="number" step="0.1" min="0.1" data-naop="${esc(tp)}" value="${stavki.на_операцию[tp] || 1}"></span>` : ""}</label>`).join("")}</div>
        <p class="ekSt__itog">«место ×» — сколько объёма штука занимает сверх своего: длинномер лежит в длинной ячейке, рулон — с пустотами.
          Операций: мелочь — строки заказов (её берут пачками); крупное (${esc(stavki.по_штукам.join(", "))}) — не меньше штук ÷ «шт/опер» (по сдельщине отбора).</p></div>
      <div class="ekSt__kn"><button type="button" class="ekBtn" data-sbros>Вернуть ставки по умолчанию</button></div>`;
  }

  function kakSchitali() {
    const m = idx.meta;
    $("ekKak").innerHTML = `<h2>Как считали</h2><ul>
      <li>Период ${esc(m.период)}. Позиции — всё, что лежало на Домодедово хоть на одном снимке за год, или было в актах брака; на странице — с продажами от ${m.порог_продаж} шт за год или с актами (${chislo(m.строк)} из ${chislo(m.позиций)}).</li>
      <li>Продажи — витрина продаж (проведённые продажи и возвраты-продажи), без канала уценки; цена и себестоимость без НДС. Сверено с книгой 24.09 до штуки (профиль 6 мм — 38 290 шт).</li>
      <li>Склад, работа — сдельщина ДМД за март–август 2026 на одну операцию (приёмка, размещение, отбор, консолидация, комплектация) по типу модели учёта × операции. Операций: у мелочи — строки заказов (её берут пачками), у крупного — не меньше штук ÷ штук на операцию отбора по сдельщине (КГ 1,6). Тип по модели учёта ВМС: Ф(ДЛ…) → ДЛ, Ф(КГ…), сыпучка, тяжёлые → КГ, лоточное хранение и «Диски» → МОС, расходка → РМ, остальное → ОС.</li>
      <li>Хранение — расходы ДМД в месяц (аренда, коммуналка, эксплуатация) / средний объём товара на складе ${chislo(m.средний_объём_остатка_ДМД_м3)} м³ / дни. Объём штуки — габариты базовой единицы в ВМС; без габаритов (${chislo(m.без_габаритов)} позиций) — медиана модели. Средний остаток ДМД — по 1-м числам 12 месяцев.</li>
      <li>Брак — акты внутреннего брака (проведённые) за год: потерянный себес и наша обработка (ФОТ и аутсорс фильтра брака на штуку входа; с арендой площадей ФБ — дороже).</li>
      <li>Не вошло: вывоз и утилизация отходов подрядчиком, логистика до клиента, продажа уценённого (выручка уценки по этим позициям мала).</li></ul>`;
  }

  // ------------------------------------------------------------ события

  async function vybratRubriku(v) {
    sost.r1 = v; sost.r2 = ""; sost.pokazano = 100;
    const r2Box = $("ekR2Box");
    if (v === "") { r2Box.hidden = true; risovat(); return; }
    const k = await rubrika(Number(v));
    const shet = new Map();
    k.r2.forEach((x) => shet.set(x, (shet.get(x) || 0) + 1));
    $("ekR2").innerHTML = `<option value="">Все категории · ${chislo(k.id.length)}</option>` + [...shet.entries()]
      .sort((a, b) => b[1] - a[1]).map(([x, n]) => `<option value="${x}">${esc(idx.slov.r2[x] || "без категории")} · ${chislo(n)}</option>`).join("");
    r2Box.hidden = false;
    risovat();
  }

  let taymer = 0;
  async function poisk(q) {
    sost.q = q; sost.pokazano = 100;
    if (q && sost.r1 === "") {   // поиск везде — догружаем все рубрики
      for (const f of idx.рубрики) await rubrika(f.r1);
    }
    risovat();
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "ekR1") { vybratRubriku(t.value).catch(oshibka); return; }
    if (t.id === "ekR2") { sost.r2 = t.value; sost.pokazano = 100; risovat(); return; }
    if (t.id === "ekTip") { sost.tip = t.value; sost.pokazano = 100; risovat(); return; }
    if (t.id === "ekSort") { sost.sort = t.value; risovat(); return; }
    if (t.id === "ekMinus") { sost.minus = t.checked; sost.pokazano = 100; risovat(); return; }
    if (t.dataset.st) {
      stavki[t.dataset.st] = t.type === "checkbox" ? t.checked : Number(t.value) || 0;
      sohranitStavki(); risovatStavki(); risovat(); return;
    }
    if (t.dataset.tarif) { stavki.тарифы[t.dataset.tarif] = Number(t.value) || 0; sohranitStavki(); risovat(); return; }
    if (t.dataset.mesto) { stavki.место[t.dataset.mesto] = Number(t.value) || 1; sohranitStavki(); risovat(); return; }
    if (t.dataset.naop) { stavki.на_операцию[t.dataset.naop] = Number(t.value) || 1; sohranitStavki(); risovat(); }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id !== "ekPoisk") return;
    clearTimeout(taymer);
    const q = e.target.value;
    taymer = setTimeout(() => poisk(q).catch(oshibka), 250);
  });
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("#ekStavkiKn")) {
      const otkr = $("ekStavki").hidden;
      $("ekStavki").hidden = !otkr;
      $("ekStavkiKn").setAttribute("aria-expanded", String(otkr));
      return;
    }
    if (t.closest("[data-sbros]")) { stavki = stavkiPoUmolch(); sohranitStavki(); risovatStavki(); risovat(); return; }
    if (t.closest("[data-eshche]")) { sost.pokazano += 100; risovat(); return; }
    const rr = t.closest("tr[data-r1]");
    if (rr) { $("ekR1").value = rr.dataset.r1; vybratRubriku(rr.dataset.r1).catch(oshibka); return; }
    const tr = t.closest("tr[data-i]");
    if (tr) {
      const k = tr.dataset.k === "top" ? idx.топKol : rubriki.get(Number(tr.dataset.k));
      if (k) karta(k, Number(tr.dataset.i));
      return;
    }
    if (t.closest("[data-zakryt]")) { $("ekOkno").hidden = true; document.body.classList.remove("ekZamok"); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("ekOkno").hidden) { $("ekOkno").hidden = true; document.body.classList.remove("ekZamok"); } });

  function oshibka(e) { $("ekStatus").textContent = "Не загрузилось: " + (e.message || e); }

  // ------------------------------------------------------------ старт

  (async function start() {
    try {
      idx = await gz("index.json.gz");
      // топ-300 — в колонки, как рубрика: тот же расчёт
      const kol = {};
      Object.keys(idx.топ[0] || {}).forEach((p) => { kol[p] = idx.топ.map((x) => x[p]); });
      idx.топKol = kol;
      zagruzitStavki();
      $("ekR1").innerHTML += [...idx.рубрики].sort((a, b) => b.строк - a.строк)
        .map((f) => `<option value="${f.r1}">${esc(f.имя)} · ${chislo(f.строк)}</option>`).join("");
      $("ekTip").innerHTML += idx.slov.tip.map((t, n) => (t ? `<option value="${n}">${esc(t)}</option>` : "")).join("");
      risovatStavki();
      kakSchitali();
      risovat();
    } catch (e) { oshibka(e); }
  })();
})();
