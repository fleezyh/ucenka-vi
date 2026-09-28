/* Рабочее место ДВК · пломбы. Список наших паллет — GET /__soglas/plomby,
   запись — POST /__soglas {действие: "пломба"}. Пломбу вписывают прямо в
   строке: скан паллеты находит строку и ставит курсор в её поле. Сервер сам
   не примет паллету не из наших остатков и пересоберёт остатки, чтобы
   паллета сразу стала продаваемой. */
(function () {
  "use strict";
  const el = (id) => document.getElementById(id);
  if (!el("plStroki")) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nomer = (s) => ((String(s || "").match(/(\d{7,11})/) || [])[1] || "").replace(/^0+/, "");
  const dataRu = (s) => {
    const m = String(s || "").match(/(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d:\d\d))?/);
    return m ? `${m[3]}.${m[2]}${m[4] ? " " + m[4] : ""}` : String(s || "");
  };

  let dannye = { паллеты: [] };
  let mozhno = false;
  let vydelena = "";

  function soobshchit(tekst, klass) {
    const p = el("plSoobshchenie");
    p.hidden = !tekst;
    p.className = "plSoobshchenie" + (klass ? " " + klass : "");
    p.innerHTML = tekst || "";
  }

  async function zagruzit() {
    const r = await fetch("/__soglas/plomby", { cache: "no-store" });
    if (r.status === 403) throw new Error("нет доступа к рабочему месту ДВК");
    if (!r.ok) throw new Error(`сервер ответил ${r.status}`);
    dannye = await r.json();
    mozhno = Boolean((dannye.можно || {}).двк);
    const vse = dannye.паллеты || [];
    document.dispatchEvent(new CustomEvent("dvk:plomby", { detail: {
      без_пломбы: dannye.без_пломбы, с_пломбой: vse.length - dannye.без_пломбы } }));
    risovat();
  }

  const STATUS = { "ждёт пломбу": "не продаётся, пока нет пломбы", "нельзя продавать": "нельзя продавать",
    "резерв": "резерв", "свободна": "" };

  function risovat() {
    const poisk = el("plPoisk").value.trim().toLowerCase();
    const tolkoBez = el("plTolkoBez").checked;
    const stroki = (dannye.паллеты || []).filter((p) => (!tolkoBez || (!p.пломба && p.в_книге !== "нельзя продавать") || p.паллета === vydelena)
      && (!poisk || `${p.паллета} ${p.номер} ${p.склад} ${p.ячейка}`.toLowerCase().includes(poisk)));
    el("plStroki").innerHTML = stroki.slice(0, 600).map((p) => {
      const pometka = STATUS[p.в_книге] ?? "";
      const pole = mozhno
        ? `<form class="plStrokaForma" data-pallet="${esc(p.паллета)}"><input name="пломба" placeholder="${p.пломба ? "заменить" : "номер пломбы"}"
             autocomplete="off"><button class="sgKn sgKn--glav" type="submit">✓</button></form>`
        : "";
      return `<tr data-pallet="${esc(p.паллета)}" class="${p.пломба ? "" : "is-bez"}${p.паллета === vydelena ? " is-vydelena" : ""}">
        <td><b>${esc(p.паллета)}</b>${pometka ? `<i class="plPometka">${esc(pometka)}${p.почему && p.в_книге === "нельзя продавать" ? ": " + esc(p.почему) : ""}</i>` : ""}</td>
        <td>${esc(p.склад)}</td><td class="plYach">${esc(p.ячейка)}</td>
        <td class="num">${p.sku ?? ""}</td><td class="num">${p.штук ?? ""}</td>
        <td class="plPlomba">${p.пломба ? `<span class="plEst">${esc(p.пломба)}</span>` : '<b class="plNet">нет</b>'}${pole}</td>
        <td class="plKto">${p.пломба ? `${esc(p.проверил || p.источник)}<br>${esc(dataRu(p.когда))}` : ""}</td></tr>`;
    }).join("") || `<tr><td colspan="7" class="sgPusto">${tolkoBez && !poisk ? "Все наши паллеты проверены ДВК." : "Ничего не нашлось"}</td></tr>`;
  }

  async function sohranit(pallet, plomba, forma) {
    const kn = forma && forma.querySelector("button");
    if (kn) kn.disabled = true;
    try {
      const r = await fetch("/__soglas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ действие: "пломба", паллета: pallet, пломба: plomba }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.ошибка || `сервер ответил ${r.status}`);
      vydelena = "";
      await zagruzit();
      soobshchit(`${esc(pallet)}: пломба ${esc(plomba)} сохранена, паллета проверена. Сканируйте следующую.`, "is-ok");
      el("plSkan").focus();
    } catch (e) {
      soobshchit(esc(e.message || String(e)), "is-oshibka");
      if (kn) kn.disabled = false;
    }
  }

  el("plSkanForma").addEventListener("submit", (e) => {
    e.preventDefault();
    const kod = el("plSkan").value.trim();
    el("plSkan").value = "";
    if (!kod) return;
    const n = nomer(kod);
    const p = (dannye.паллеты || []).find((x) => (n && x.номер === n) || x.паллета.toLowerCase() === kod.toLowerCase());
    if (!p) {
      soobshchit(`${esc(kod)}: этой паллеты нет в наших остатках — пломбу на неё не вносим. Проверьте номер или отдайте ответственному.`, "is-oshibka");
      return;
    }
    vydelena = p.паллета;
    el("plPoisk").value = "";
    risovat();
    soobshchit(p.пломба ? `${esc(p.паллета)} уже с пломбой ${esc(p.пломба)} — можно заменить.` : `${esc(p.паллета)}: ${esc(p.склад)}, ${esc(p.ячейка)}, ${p.sku ?? "?"} SKU, ${p.штук ?? "?"} шт. Впишите пломбу.`);
    const stroka = el("plStroki").querySelector(`tr[data-pallet="${CSS.escape(p.паллета)}"]`);
    if (stroka) {
      stroka.scrollIntoView({ block: "center" });
      stroka.querySelector("input")?.focus();
    }
  });
  el("plStroki").addEventListener("submit", (e) => {
    const f = e.target.closest(".plStrokaForma");
    if (!f) return;
    e.preventDefault();
    const plomba = f.querySelector("input").value.trim();
    if (plomba) sohranit(f.dataset.pallet, plomba, f);
  });
  el("plPoisk").addEventListener("input", risovat);
  el("plTolkoBez").addEventListener("change", risovat);

  zagruzit().catch((e) => soobshchit(esc(e.message || String(e)), "is-oshibka"));
  setInterval(() => {
    // Не перерисовываем, пока человек печатает пломбу в строке.
    if (!document.activeElement || !document.activeElement.closest(".plStrokaForma")) zagruzit().catch(() => {});
  }, 60000);
})();
