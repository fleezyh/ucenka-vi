/* ТСД внутри пикалки (29.09.2026).

   Степан: «это не другая страница, а режим — мощный; ТСД в основном для
   операторов, чтоб искать брак по складу, но весь остальной функционал
   пикалки там тоже должен быть». Поэтому ТСД — не /tsd/, а под-режим WMS на
   той же странице: поле скана, вкладки, паллеты и акты остаются, а под полем
   появляется панель «Брак в ячейке · Уборка · Сводка». Пикнули ячейку —
   форма «брак в ячейке» (причина → красная кнопка), а ниже, как всегда, что в
   ячейке лежит. Данные — те же ручки /__tsd, что у отдельной страницы.

   Под-режим переключает wms-rezhim.js (событие «wms:pod»), ячейку сообщает
   akt-predsort.js (событие «wms:yacheyka»). */
(function () {
  "use strict";

  if (!/^\/picker\/wms\/?$/.test(location.pathname)) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const vremya = (s) => {
    const m = String(s || "").match(/^\d{4}-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
    return m ? `${m[2]}.${m[1]} ${m[3]}` : String(s || "");
  };
  const sektor = (s) => String(s || "").replace(/^\d+\s*/, "").replace(/\s*ДМД$/, "") || "—";

  let vkl = false;              // под-режим ТСД
  let vkladka = "brak";
  let yach = null;              // ячейка для «брак в ячейке»
  let prichina = "";
  let itog = "";                // «заявка №… отправлена» / ошибка
  let otkryto = 0;

  async function zapros(adres, telo) {
    const o = await fetch(adres, telo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(telo) }
      : { cache: "no-store" });
    const d = await o.json().catch(() => ({}));
    if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
    return d;
  }

  function host() {
    let h = document.getElementById("tsdPanel");
    if (!h) {
      const posle = document.getElementById("vmsPolosa") || document.querySelector(".searchCard .searchRow");
      if (!posle) return null;
      h = document.createElement("section");
      h.id = "tsdPanel";
      h.className = "tsdPanel";
      posle.insertAdjacentElement("afterend", h);
    }
    return h;
  }

  function risovat() {
    const h = host();
    if (!h) return;
    h.hidden = !vkl;
    if (!vkl) return;
    let telo = "";
    if (vkladka === "brak") telo = yach ? formaBraka() : `<p class="tsdPusto">Пикните ячейку (CEL …) — отметить в ней брак. Товары, паллеты и акты пикаются как обычно.</p>${itog}`;
    else telo = '<div id="tsdPanelTelo"><p class="tsdPusto">Загружаю…</p></div>';
    h.innerHTML = `<nav class="tsdVkladki tsdVkladki--panel">
        <button class="tsdVkladka${vkladka === "brak" ? " is-on" : ""}" type="button" data-tvkl="brak">Брак в ячейке</button>
        <button class="tsdVkladka${vkladka === "uborka" ? " is-on" : ""}" type="button" data-tvkl="uborka">Уборка${otkryto ? ` <b>· ${otkryto}</b>` : ""}</button>
        <button class="tsdVkladka${vkladka === "svodka" ? " is-on" : ""}" type="button" data-tvkl="svodka">Сводка</button>
      </nav>${telo}`;
    if (vkladka === "uborka") uborka();
    if (vkladka === "svodka") svodka();
  }

  function formaBraka() {
    const y = yach;
    if (y.oshibka) return `<p class="tsdOsh">${esc(y.oshibka)}</p>`;
    if (y.zhdu) return '<p class="tsdPusto">Ищу ячейку…</p>';
    const z = y.заявки || [];
    return `<div class="tsdKarta">
        <h2>${esc(y.имя || "ячейка " + y.id)}</h2>
        <p class="tsdKarta__pod">${esc(sektor(y.сектор))}${y.зона ? " · " + esc(y.зона) : ""}</p>
        <p class="tsdKarta__sist">По системе: <b>${y.sku || 0} SKU · ${y.штук || 0} шт</b>${y.штук ? "" : " — пусто"}</p>
        ${z.length ? `<p class="tsdPred">Уже есть заявка: ${z.map((x) => `${esc(x.причина)} (${esc(x.статус)}, ${vremya(x.когда)})`).join("; ")}. Если брак другой — отправьте ещё.</p>` : ""}
      </div>
      <div class="tsdPrichiny">${(y.причины || []).map((p) => `<button class="tsdPrichina${p === prichina ? " is-on" : ""}" type="button" data-tprichina="${esc(p)}">${esc(p)}</button>`).join("")}</div>
      <input class="tsdKomment" id="tsdPanelKomment" placeholder="Комментарий, если нужно">
      <button class="tsdKrasnaya" type="button" id="tsdPanelKrasnaya"${prichina ? "" : " disabled"}>БРАК В ЯЧЕЙКЕ</button>`;
  }

  async function otkrytYacheyku(kod) {
    if (!vkl) return;
    vkladka = "brak"; prichina = ""; itog = "";
    yach = { zhdu: true };
    risovat();
    try {
      yach = await zapros(`/__tsd/yacheyka?код=${encodeURIComponent(kod)}`);
    } catch (e) {
      yach = { oshibka: e.message || String(e) };
    }
    risovat();
  }

  async function otpravit() {
    if (!yach || !prichina) return;
    const kn = document.getElementById("tsdPanelKrasnaya");
    if (kn) kn.disabled = true;
    try {
      const d = await zapros("/__tsd", { действие: "брак", код: String(yach.id), причина: prichina,
        комментарий: (document.getElementById("tsdPanelKomment") || {}).value || "" });
      itog = `<p class="tsdGotovo">Заявка №${d.id}: ${esc(yach.имя)} — ${esc(prichina)}. Уйдёт на уборку. Пикайте следующую ячейку.</p>`;
      if (navigator.vibrate) navigator.vibrate(120);
      yach = null; prichina = "";
      schetchik();
    } catch (e) {
      if (kn) kn.disabled = false;
      itog = `<p class="tsdOsh">Не отправилось: ${esc(e.message || e)}</p>`;
    }
    risovat();
    document.getElementById("scan")?.focus();
  }

  async function uborka() {
    try {
      const d = await zapros("/__tsd/zayavki");
      const z = d.заявки || [];
      otkryto = z.length;
      const t = document.getElementById("tsdPanelTelo");
      if (!t || vkladka !== "uborka") return;
      t.innerHTML = z.length ? `<div class="tsdSpisok">${z.map((x) => `
        <article class="tsdZayavka${x.статус === "в работе" ? " is-vrabote" : ""}">
          <h3>${esc(x.ячейка || "ячейка " + x.ячейка_id)}</h3>
          <p>${esc(sektor(x.сектор))} · по системе ${x.sku || 0} SKU / ${x.штук || 0} шт</p>
          <span class="tsdPrichinaMetka">${esc(x.причина)}</span>
          ${x.комментарий ? `<p>«${esc(x.комментарий)}»</p>` : ""}
          <p>отметил ${esc(x.кто)} ${vremya(x.когда)}${x.статус === "в работе" ? ` · взял ${esc(x.взял)} ${vremya(x.взял_когда)}` : ""}</p>
          <div class="tsdKnopki">
            ${x.статус === "новая" ? `<button class="tsdKn" type="button" data-tid="${x.id}" data-tchto="взять">Взял</button>` : "<span></span>"}
            <button class="tsdKn tsdKn--ok" type="button" data-tid="${x.id}" data-tchto="убрано">Убрано</button>
            <button class="tsdKn" type="button" data-tid="${x.id}" data-tchto="пусто">Брака нет</button>
          </div>
        </article>`).join("")}</div>` : '<p class="tsdPusto">Заявок нет — всё убрано.</p>';
    } catch (e) {
      const t = document.getElementById("tsdPanelTelo");
      if (t) t.innerHTML = `<p class="tsdOsh">${esc(e.message || e)}</p>`;
    }
  }

  async function svodka() {
    try {
      const d = await zapros("/__tsd/zayavki");
      const t = document.getElementById("tsdPanelTelo");
      if (!t || vkladka !== "svodka") return;
      const s = d.по_секторам || [];
      const n = d.неделя || {};
      const pr = n.по_причинам || [];
      const maks = Math.max(1, ...pr.map((x) => x.заявок));
      t.innerHTML = `<div class="tsdItogi">
          <div class="tsdItog"><b>${n.заявок || 0}</b><span>брака отмечено за 7 дней</span></div>
          <div class="tsdItog tsdItog--krasn"><b>${n.в_пустых_по_системе || 0}</b><span>в ячейках, пустых по системе</span></div>
          <div class="tsdItog"><b>${n.часов_до_уборки != null ? String(n.часов_до_уборки).replace(".", ",") + " ч" : "—"}</b><span>от отметки до уборки</span></div>
          <div class="tsdItog"><b>${n.убрано_штук || 0}</b><span>штук забрали в брак</span></div>
        </div>
        ${pr.length ? `<h3 class="tsdZag">Из-за чего брак</h3><div class="tsdPrichinyGraf">${pr.map((x) => `
          <div class="tsdGraf"><span>${esc(x.причина)}</span><i style="width:${Math.round(x.заявок / maks * 100)}%"></i><b>${x.заявок}</b></div>`).join("")}</div>` : ""}
        ${s.length ? `<h3 class="tsdZag">По секторам</h3><table class="tsdTabl"><thead><tr><th>Сектор</th>
          <th class="num">Открыто</th><th class="num">Новых за сутки</th><th class="num">Убрано за сутки</th></tr></thead>
          <tbody>${s.map((x) => `<tr><td>${esc(sektor(x.сектор))}</td><td class="num">${x.открыто}</td>
            <td class="num">${x.новых_сутки}</td><td class="num">${x.убрано_сутки}</td></tr>`).join("")}</tbody></table>` : ""}`;
    } catch (e) {
      const t = document.getElementById("tsdPanelTelo");
      if (t) t.innerHTML = `<p class="tsdOsh">${esc(e.message || e)}</p>`;
    }
  }

  async function schetchik() {
    try { otkryto = ((await zapros("/__tsd/zayavki")).заявки || []).length; } catch (e) { /* подождёт */ }
    const b = document.querySelector('[data-tvkl="uborka"]');
    if (b) b.innerHTML = `Уборка${otkryto ? ` <b>· ${otkryto}</b>` : ""}`;
  }

  document.addEventListener("wms:pod", (e) => {
    vkl = e.detail === "tsd";
    document.body.classList.toggle("tsdPodRezhim", vkl);
    if (vkl) schetchik();
    risovat();
  });
  document.addEventListener("wms:yacheyka", (e) => otkrytYacheyku(e.detail.kod));
  document.addEventListener("click", async (e) => {
    const t = e.target;
    const vk = t.closest("[data-tvkl]");
    if (vk) { vkladka = vk.dataset.tvkl; risovat(); return; }
    const pr = t.closest("[data-tprichina]");
    if (pr) {
      prichina = pr.dataset.tprichina;
      risovat();
      document.getElementById("tsdPanelKrasnaya")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (t.closest("#tsdPanelKrasnaya")) { otpravit(); return; }
    const kn = t.closest("[data-tid]");
    if (kn) {
      let shtuk = null;
      if (kn.dataset.tchto === "убрано") {
        shtuk = prompt("Сколько штук забрали в брак?", "1");
        if (shtuk === null) return;
      }
      try { await zapros("/__tsd", { действие: kn.dataset.tchto, id: Number(kn.dataset.tid), штук: shtuk }); } catch (err) { alert(err.message || err); }
      risovat();
    }
  });
  setInterval(() => { if (vkl) { if (vkladka === "uborka") uborka(); else schetchik(); } }, 60000);
})();
