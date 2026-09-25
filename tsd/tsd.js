/* ТСД «брак в ячейке»: скан ячейки → причина → красная кнопка; уборка; сводка.
   Сканер ТСД печатает код как клавиатура и жмёт Enter — поле скана держим в
   фокусе, чтобы следующий пик шёл сразу, без касаний экрана. */
(function () {
  "use strict";

  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const vremya = (s) => {
    const m = String(s || "").match(/^\d{4}-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
    return m ? `${m[2]}.${m[1]} ${m[3]}` : String(s || "");
  };
  const sektor = (s) => String(s || "").replace(/^\d+\s*/, "").replace(/\s*ДМД$/, "") || "—";

  let tekushaya = null;
  let prichina = "";
  let vkladka = "brak";

  function vFokus() {
    if (vkladka === "brak") setTimeout(() => el("tsdSkan").focus(), 50);
  }

  async function zapros(adres, telo) {
    const otvet = await fetch(adres, telo ? {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(telo),
    } : { cache: "no-store" });
    const d = await otvet.json().catch(() => ({}));
    if (!otvet.ok) throw new Error(d.ошибка || (otvet.status === 403 ? "нет доступа к разделу ТСД" : `сервер ответил ${otvet.status}`));
    return d;
  }

  /* ── брак в ячейке ─────────────────────────────── */

  function narisovatYacheyku() {
    const y = tekushaya;
    const otkryty = y.заявки || [];
    el("tsdYacheyka").innerHTML = `
      <div class="tsdKarta">
        <h2>${esc(y.имя || "ячейка " + y.id)}</h2>
        <p class="tsdKarta__pod">${esc(sektor(y.сектор))}${y.зона ? " · " + esc(y.зона) : ""}</p>
        <p class="tsdKarta__sist">По системе: <b>${y.sku || 0} SKU · ${y.штук || 0} шт</b>${y.штук ? "" : " — пусто"}</p>
        ${otkryty.length ? `<p class="tsdPred">Уже есть заявка: ${otkryty.map((z) => `${esc(z.причина)} (${esc(z.статус)}, ${vremya(z.когда)})`).join("; ")}. Если брак другой — отправьте ещё.</p>` : ""}
      </div>
      <div class="tsdPrichiny">${(y.причины || []).map((p) => `<button class="tsdPrichina${p === prichina ? " is-on" : ""}" type="button" data-prichina="${esc(p)}">${esc(p)}</button>`).join("")}</div>
      <input class="tsdKomment" id="tsdKomment" placeholder="Комментарий, если нужно">
      <button class="tsdKrasnaya" type="button" id="tsdKrasnaya"${prichina ? "" : " disabled"}>БРАК В ЯЧЕЙКЕ</button>`;
  }

  async function skan(kod) {
    kod = String(kod || "").trim();
    if (!kod) return;
    prichina = "";
    el("tsdYacheyka").innerHTML = '<p class="tsdPusto">Ищу ячейку…</p>';
    try {
      tekushaya = await zapros(`/__tsd/yacheyka?код=${encodeURIComponent(kod)}`);
      narisovatYacheyku();
    } catch (e) {
      tekushaya = null;
      el("tsdYacheyka").innerHTML = `<p class="tsdOsh">${esc(e.message || e)}</p>`;
    }
    el("tsdSkan").value = "";
    vFokus();
  }

  async function otpravit() {
    if (!tekushaya || !prichina) return;
    const knopka = el("tsdKrasnaya");
    knopka.disabled = true;
    try {
      const d = await zapros("/__tsd", { действие: "брак", код: String(tekushaya.id), причина: prichina,
        комментарий: (el("tsdKomment") || {}).value || "" });
      el("tsdYacheyka").innerHTML = `<p class="tsdGotovo">Заявка №${d.id}: ${esc(tekushaya.имя)} — ${esc(prichina)}. Уйдёт на уборку. Сканируйте следующую ячейку.</p>`;
      if (navigator.vibrate) navigator.vibrate(120);
      tekushaya = null;
      prichina = "";
      obnovitSchetchik();
    } catch (e) {
      knopka.disabled = false;
      el("tsdYacheyka").insertAdjacentHTML("beforeend", `<p class="tsdOsh">Не отправилось: ${esc(e.message || e)}</p>`);
    }
    vFokus();
  }

  /* ── уборка ────────────────────────────────────── */

  async function narisovatUborku() {
    el("tsdUborka").innerHTML = '<p class="tsdPusto">Загружаю заявки…</p>';
    try {
      const d = await zapros("/__tsd/zayavki");
      const z = d.заявки || [];
      el("tsdOtkrytoN").textContent = z.length ? `· ${z.length}` : "";
      el("tsdUborka").innerHTML = z.length ? `<div class="tsdSpisok">${z.map((x) => `
        <article class="tsdZayavka${x.статус === "в работе" ? " is-vrabote" : ""}">
          <h3>${esc(x.ячейка || "ячейка " + x.ячейка_id)}</h3>
          <p>${esc(sektor(x.сектор))} · по системе ${x.sku || 0} SKU / ${x.штук || 0} шт</p>
          <span class="tsdPrichinaMetka">${esc(x.причина)}</span>
          ${x.комментарий ? `<p>«${esc(x.комментарий)}»</p>` : ""}
          <p>отметил ${esc(x.кто)} ${vremya(x.когда)}${x.статус === "в работе" ? ` · взял ${esc(x.взял)} ${vremya(x.взял_когда)}` : ""}</p>
          <div class="tsdKnopki">
            ${x.статус === "новая" ? `<button class="tsdKn" type="button" data-id="${x.id}" data-chto="взять">Взял</button>` : "<span></span>"}
            <button class="tsdKn tsdKn--ok" type="button" data-id="${x.id}" data-chto="убрано">Убрано</button>
            <button class="tsdKn" type="button" data-id="${x.id}" data-chto="пусто">Брака нет</button>
          </div>
        </article>`).join("")}</div>` : '<p class="tsdPusto">Заявок нет — всё убрано.</p>';
    } catch (e) {
      el("tsdUborka").innerHTML = `<p class="tsdOsh">${esc(e.message || e)}</p>`;
    }
  }

  async function uborkaDeystvie(id, chto) {
    let shtuk = null;
    if (chto === "убрано") {
      shtuk = prompt("Сколько штук забрали в брак?", "1");
      if (shtuk === null) return;
    }
    try {
      await zapros("/__tsd", { действие: chto, id: Number(id), штук: shtuk });
      narisovatUborku();
    } catch (e) {
      alert(e.message || e);
    }
  }

  async function obnovitSchetchik() {
    try {
      const d = await zapros("/__tsd/zayavki");
      const n = (d.заявки || []).length;
      el("tsdOtkrytoN").textContent = n ? `· ${n}` : "";
    } catch (e) { /* счётчик подождёт */ }
  }

  /* ── сводка ────────────────────────────────────── */

  async function narisovatSvodku() {
    el("tsdSvodka").innerHTML = '<p class="tsdPusto">Считаю…</p>';
    try {
      const d = await zapros("/__tsd/zayavki");
      const s = d.по_секторам || [];
      el("tsdSvodka").innerHTML = s.length ? `<table class="tsdTabl"><thead><tr><th>Сектор</th>
        <th class="num">Открыто</th><th class="num">Новых за сутки</th><th class="num">Убрано за сутки</th></tr></thead>
        <tbody>${s.map((x) => `<tr><td>${esc(sektor(x.сектор))}</td><td class="num">${x.открыто}</td>
          <td class="num">${x.новых_сутки}</td><td class="num">${x.убрано_сутки}</td></tr>`).join("")}</tbody></table>`
        : '<p class="tsdPusto">Заявок ещё не было.</p>';
    } catch (e) {
      el("tsdSvodka").innerHTML = `<p class="tsdOsh">${esc(e.message || e)}</p>`;
    }
  }

  /* ── события ───────────────────────────────────── */

  el("tsdSkanForma").addEventListener("submit", (event) => {
    event.preventDefault();
    skan(el("tsdSkan").value);
  });
  document.addEventListener("click", (event) => {
    const t = event.target;
    const vk = t.closest(".tsdVkladka");
    if (vk) {
      vkladka = vk.dataset.vkl;
      document.querySelectorAll(".tsdVkladka").forEach((b) => b.classList.toggle("is-on", b === vk));
      el("vklBrak").hidden = vkladka !== "brak";
      el("vklUborka").hidden = vkladka !== "uborka";
      el("vklSvodka").hidden = vkladka !== "svodka";
      if (vkladka === "uborka") narisovatUborku();
      if (vkladka === "svodka") narisovatSvodku();
      vFokus();
      return;
    }
    const pr = t.closest("[data-prichina]");
    if (pr) {
      prichina = pr.dataset.prichina;
      narisovatYacheyku();
      // На ТСД экран короткий: после выбора причины кнопка должна быть под пальцем.
      el("tsdKrasnaya").scrollIntoView({ block: "end", behavior: "smooth" });
      return;
    }
    if (t.closest("#tsdKrasnaya")) return otpravit();
    const kn = t.closest(".tsdKn[data-id]");
    if (kn) return uborkaDeystvie(kn.dataset.id, kn.dataset.chto);
  });
  // Касание пустого места не должно уводить фокус со сканера.
  document.addEventListener("click", (event) => {
    if (!event.target.closest("input, button, a")) vFokus();
  });

  obnovitSchetchik();
  setInterval(() => { if (vkladka === "uborka") narisovatUborku(); else obnovitSchetchik(); }, 60000);
})();
