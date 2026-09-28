/* Пломбы ДВК. Список — GET /__soglas/plomby, запись — POST /__soglas
   {действие: "пломба"}. Сервер сам не примет паллету не из наших остатков. */
(function () {
  "use strict";
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nomer = (s) => ((String(s || "").match(/(\d{7,11})/) || [])[1] || "").replace(/^0+/, "");
  const dataRu = (s) => {
    const m = String(s || "").match(/(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d:\d\d))?/);
    return m ? `${m[3]}.${m[2]}${m[4] ? " " + m[4] : ""}` : String(s || "");
  };

  let dannye = { паллеты: [] };
  let mozhno = false;

  async function zagruzit() {
    const r = await fetch("/__soglas/plomby", { cache: "no-store" });
    if (r.status === 403) throw new Error("нет доступа к разделу согласования отгрузок");
    if (!r.ok) throw new Error(`сервер ответил ${r.status}`);
    dannye = await r.json();
    mozhno = Boolean((dannye.можно || {}).двк);
    el("stamp").textContent = `остатки на ${dataRu(dannye.остатки_на)}`;
    el("message").hidden = true;
    risovatSpisok();
  }

  function risovatSpisok() {
    const poisk = el("plPoisk").value.trim().toLowerCase();
    const tolkoBez = el("plTolkoBez").checked;
    const vse = dannye.паллеты || [];
    const stroki = vse.filter((p) => (!tolkoBez || !p.пломба)
      && (!poisk || p.паллета.toLowerCase().includes(poisk) || p.номер.includes(poisk)
        || String(p.склад).toLowerCase().includes(poisk)));
    el("plItog").textContent = `· ${vse.length}, без пломбы ${dannye.без_пломбы}`;
    el("plStroki").innerHTML = stroki.slice(0, 500).map((p) => `
      <tr data-pallet="${esc(p.паллета)}">
        <td>${esc(p.паллета)}${p.в_книге === "нельзя продавать" ? ' <i class="plNelzya">нельзя продавать</i>' : ""}</td>
        <td>${esc(p.склад)}</td><td>${esc(p.ячейка)}</td>
        <td class="num">${p.sku ?? ""}</td><td class="num">${p.штук ?? ""}</td>
        <td>${p.пломба ? esc(p.пломба) : '<b class="plNet">нет</b>'}</td>
        <td>${p.пломба ? `${esc(p.проверил || p.источник)} · ${esc(dataRu(p.когда))}` : ""}</td></tr>`).join("")
      || '<tr><td colspan="7" class="sgPusto">Ничего не нашлось</td></tr>';
  }

  function pokazat(p) {
    if (!p) {
      el("plKarta").innerHTML = '<p class="sgPreduprezhdenie">Этой паллеты нет в наших остатках, пломбу на неё не вносим. Проверьте номер или отдайте ответственному.</p>';
      return;
    }
    const nelzya = p.в_книге === "нельзя продавать"
      ? ` · <b class="plNet">нельзя продавать${p.почему ? ": " + esc(p.почему) : ""}</b>` : "";
    el("plKarta").innerHTML = `
      <div class="plKarta">
        <h2>${esc(p.паллета)}</h2>
        <p class="sgKarta__pod">${esc(p.склад)} · ${esc(p.ячейка)} · ${p.sku ?? "?"} SKU · ${p.штук ?? "?"} шт${nelzya}</p>
        <p>${p.пломба ? `Пломба <b>${esc(p.пломба)}</b>: ${esc(p.проверил || p.источник)}, ${esc(dataRu(p.когда))}`
          : '<b class="plNet">Пломбы нет</b>'}</p>
        ${mozhno ? `<form class="plForma" id="plForma">
          <label class="plPole"><span>${p.пломба ? "Заменить пломбу" : "Номер пломбы"}</span>
            <input name="пломба" required placeholder="номер пломбы"></label>
          <button class="sgKn sgKn--glav" type="submit">Сохранить</button>
          ${p.пломба && p.источник === "ДВК в системе" ? '<button class="sgKn sgKn--nelzya" type="button" id="plSnyat">Снять пломбу</button>' : ""}
          <span id="plOtvet"></span></form>` : '<p class="sgPusto">Вносить пломбы может только ДВК.</p>'}
      </div>`;
    const f = el("plForma");
    if (f) {
      f.querySelector("input").focus();
      f.addEventListener("submit", (e) => { e.preventDefault(); sohranit(p, new FormData(f).get("пломба")); });
      const snyat = el("plSnyat");
      if (snyat) snyat.addEventListener("click", () => { if (confirm("Снять пломбу с паллеты?")) sohranit(p, ""); });
    }
  }

  async function sohranit(p, plomba) {
    const otvet = el("plOtvet");
    if (otvet) otvet.textContent = "сохраняю…";
    try {
      const r = await fetch("/__soglas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ действие: "пломба", паллета: p.паллета, пломба: plomba }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.ошибка || `сервер ответил ${r.status}`);
      await zagruzit();
      el("plKarta").innerHTML = `<p class="plGotovo">${esc(p.паллета)}: ${plomba ? "пломба " + esc(plomba) + " сохранена" : "пломба снята"}. Сканируйте следующую паллету.</p>`;
      el("plSkan").focus();
    } catch (e) {
      if (otvet) otvet.textContent = e.message || String(e);
    }
  }

  el("plSkanForma").addEventListener("submit", (e) => {
    e.preventDefault();
    const kod = el("plSkan").value.trim();
    if (!kod) return;
    const n = nomer(kod);
    pokazat((dannye.паллеты || []).find((p) => (n && p.номер === n) || p.паллета.toLowerCase() === kod.toLowerCase()));
    el("plSkan").value = "";
  });
  el("plPoisk").addEventListener("input", risovatSpisok);
  el("plTolkoBez").addEventListener("change", risovatSpisok);
  el("plStroki").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-pallet]");
    if (!tr) return;
    pokazat((dannye.паллеты || []).find((p) => p.паллета === tr.dataset.pallet));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  zagruzit().catch((e) => { el("message").textContent = e.message || String(e); });
})();
