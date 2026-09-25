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


  /* ── демо: /tsd/?demo — показать, как это работает, ничего не отправляя ──
     Ячейки настоящие (снимок ДМД 25.09), заявки и уборка — условные. Любой
     скан принимается: по кругу подставляется одна из ячеек. */
  const DEMO = /[?&]demo/.test(location.search);
  const DEMO_YACHEYKI = [
    { id: 1278630, имя: "П(А)-08-13-01-01", зона: "(А) Ф(Коробка)", сектор: "001 Сектор А ДМД", sku: 2, штук: 19 },
    { id: 3487539, имя: "П(Б)-20-12-04-01", зона: "(Б) БКЛ Полки", сектор: "002 Сектор Б ДМД", sku: 2, штук: 11 },
    { id: 3540852, имя: "П(В)-25-32-03-03", зона: "(В) Ф Бобина Полки", сектор: "003 Сектор В ДМД", sku: 2, штук: 11 },
    { id: 1570899, имя: "Х(Г)-12-19-40-02", зона: "(Г) Верха 1-23 ряд", сектор: "004 Сектор Г ДМД", sku: 0, штук: 0 },
    { id: 2056495, имя: "(Д)М4-11-28-04-17", зона: "(Д) М4 1 и 4 ярус", сектор: "005 Сектор Д ДМД", sku: 1, штук: 10 },
    { id: 3852333, имя: "Х(Е)-25-10-40-03", зона: "(Е) Неликвид Верха", сектор: "006 Сектор Е ДМД", sku: 4, штук: 21 },
  ];
  const DEMO_PRICHINY = ["Мехповреждение", "Рваная упаковка", "Некомплект", "Пересорт", "Протечка / сыпучка", "Срок годности", "Другое"];
  const minutNazad = (m) => { const d = new Date(Date.now() - m * 60000); return d.toISOString().slice(0, 10) + " " + d.toTimeString().slice(0, 5); };
  const demoZayavki = [
    { id: 101, ячейка: "(Б)М3-03-16-01-03", сектор: "002 Сектор Б ДМД", sku: 31, штук: 5019, причина: "Рваная упаковка", комментарий: "пескобетон рассыпан по полу", кто: "Кулин Д.", когда: minutNazad(95), статус: "новая" },
    { id: 102, ячейка: "Х(Г)-12-19-40-02", сектор: "004 Сектор Г ДМД", sku: 0, штук: 0, причина: "Мехповреждение", комментарий: "гнутые профили, по системе ячейка пустая", кто: "Кулин Д.", когда: minutNazad(70), статус: "в работе", взял: "Смирнов В.", взял_когда: minutNazad(40) },
    { id: 103, ячейка: "П(А)-08-13-01-01", сектор: "001 Сектор А ДМД", sku: 2, штук: 19, причина: "Некомплект", комментарий: "", кто: "Прошин А.", когда: minutNazad(30), статус: "новая" },
  ];
  let demoUbrano = [
    { причина: "Рваная упаковка", штук: 6, часов: 1.4, пусто: false },
    { причина: "Рваная упаковка", штук: 3, часов: 2.1, пусто: true },
    { причина: "Мехповреждение", штук: 2, часов: 0.8, пусто: false },
    { причина: "Протечка / сыпучка", штук: 4, часов: 3.0, пусто: true },
    { причина: "Некомплект", штук: 1, часов: 1.2, пусто: false },
  ];
  let demoN = 0, demoId = 104;
  function demoSvodka() {
    const vse = demoZayavki.map((z) => ({ причина: z.причина, пусто: !z.штук })).concat(demoUbrano);
    const po = {};
    vse.forEach((z) => { po[z.причина] = (po[z.причина] || 0) + 1; });
    const sekt = {};
    demoZayavki.forEach((z) => { sekt[z.сектор] = sekt[z.сектор] || { сектор: z.сектор, открыто: 0, новых_сутки: 0, убрано_сутки: 0 }; sekt[z.сектор].открыто++; sekt[z.сектор].новых_сутки++; });
    return {
      заявки: demoZayavki, причины: DEMO_PRICHINY, по_секторам: Object.values(sekt),
      неделя: { заявок: vse.length, в_пустых_по_системе: vse.filter((z) => z.пусто).length,
        часов_до_уборки: Math.round(demoUbrano.reduce((n, z) => n + z.часов, 0) / demoUbrano.length * 10) / 10,
        убрано_штук: demoUbrano.reduce((n, z) => n + z.штук, 0), брака_нет: 1,
        по_причинам: Object.entries(po).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ причина: p, заявок: n })) },
    };
  }
  async function demoZapros(adres, telo) {
    await new Promise((r) => setTimeout(r, 250));
    if (adres.startsWith("/__tsd/yacheyka")) {
      const y = DEMO_YACHEYKI[demoN++ % DEMO_YACHEYKI.length];
      return { ...y, причины: DEMO_PRICHINY, снимок: "демо", заявки: demoZayavki.filter((z) => z.ячейка === y.имя) };
    }
    if (adres.startsWith("/__tsd/zayavki")) return demoSvodka();
    if (telo && telo.действие === "брак") {
      const y = DEMO_YACHEYKI.find((x) => String(x.id) === String(telo.код)) || DEMO_YACHEYKI[0];
      demoZayavki.push({ id: demoId, ячейка: y.имя, сектор: y.сектор, sku: y.sku, штук: y.штук, причина: telo.причина,
        комментарий: telo.комментарий, кто: "вы (демо)", когда: minutNazad(0), статус: "новая" });
      return { id: demoId++, ячейка: y };
    }
    if (telo && telo.id) {
      const i = demoZayavki.findIndex((z) => z.id === telo.id);
      if (i >= 0 && telo.действие === "взять") Object.assign(demoZayavki[i], { статус: "в работе", взял: "вы (демо)", взял_когда: minutNazad(0) });
      else if (i >= 0) {
        const [z] = demoZayavki.splice(i, 1);
        demoUbrano.push({ причина: z.причина, штук: telo.действие === "убрано" ? Number(telo.штук) || 0 : 0, часов: 0.5, пусто: !z.штук });
      }
      return demoSvodka();
    }
    return {};
  }

  let tekushaya = null;
  let prichina = "";
  let vkladka = "brak";

  function vFokus() {
    if (vkladka === "brak") setTimeout(() => el("tsdSkan").focus(), 50);
  }

  async function zapros(adres, telo) {
    if (DEMO) return demoZapros(adres, telo);
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
      const n = d.неделя || {};
      const pr = n.по_причинам || [];
      const maks = Math.max(1, ...pr.map((x) => x.заявок));
      el("tsdSvodka").innerHTML = `
        <div class="tsdItogi">
          <div class="tsdItog"><b>${n.заявок || 0}</b><span>брака отмечено за 7 дней</span></div>
          <div class="tsdItog tsdItog--krasn"><b>${n.в_пустых_по_системе || 0}</b><span>в ячейках, пустых по системе — WMS этот брак не видит</span></div>
          <div class="tsdItog"><b>${n.часов_до_уборки != null ? String(n.часов_до_уборки).replace(".", ",") + " ч" : "—"}</b><span>в среднем от отметки до уборки</span></div>
          <div class="tsdItog"><b>${n.убрано_штук || 0}</b><span>штук забрали в брак${n.брака_нет ? ` · ${n.брака_нет} раз брака не нашли` : ""}</span></div>
        </div>
        ${pr.length ? `<h3 class="tsdZag">Из-за чего брак</h3><div class="tsdPrichinyGraf">${pr.map((x) => `
          <div class="tsdGraf"><span>${esc(x.причина)}</span><i style="width:${Math.round(x.заявок / maks * 100)}%"></i><b>${x.заявок}</b></div>`).join("")}</div>` : ""}
        <h3 class="tsdZag">По секторам</h3>
        ${s.length ? `<table class="tsdTabl"><thead><tr><th>Сектор</th>
          <th class="num">Открыто</th><th class="num">Новых за сутки</th><th class="num">Убрано за сутки</th></tr></thead>
          <tbody>${s.map((x) => `<tr><td>${esc(sektor(x.сектор))}</td><td class="num">${x.открыто}</td>
            <td class="num">${x.новых_сутки}</td><td class="num">${x.убрано_сутки}</td></tr>`).join("")}</tbody></table>`
          : '<p class="tsdPusto">Заявок ещё не было.</p>'}`;
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

  if (DEMO) {
    document.querySelector(".tsdVkladki").insertAdjacentHTML("beforebegin",
      '<p class="tsdDemo">Демо: ячейки настоящие, заявки условные, ничего никуда не уходит. Сканируйте что угодно или нажмите Enter в поле.</p>');
    el("tsdSkan").value = "CEL 1278630";
  }
  obnovitSchetchik();
  setInterval(() => { if (vkladka === "uborka") narisovatUborku(); else obnovitSchetchik(); }, 60000);
})();
