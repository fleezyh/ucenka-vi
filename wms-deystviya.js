/* «Сделать в WMS» — общий блок для пикалки (/picker/wms) и ТСД (/tsd/), 28.09.
   Степан: «почему одно там, одно там» — поэтому одно окно на оба места.
   Сейчас: универсальное задание по ячейке или паллете (сервер — /__wms/uz,
   модуль wms_dokumenty.py). Дальше сюда же — акты расхождения.

   Использование: WmsDeystviya.uz(host, { yacheyka | palleta, tovar_guid?, otkuda: "тсд"|"пикалка", podpis })
                  WmsDeystviya.zhurnal(host) — что создано с сайта. */
(function () {
  "use strict";
  if (window.WmsDeystviya) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const TIPY = [[2, "Проблема отбора"], [8, "Проблема размещения"], [1, "Поиск товара"], [14, "Проблема комплектации"]];
  const PRICHINY = [[2, "Брак"], [3, "Некомплект"], [6, "Пересорт"], [1, "Потеря"], [4, "ШК товара"], [5, "ШК ячейки"]];
  const PRIORITETY = [[2, "Обычный"], [3, "Высокий"], [4, "Срочный"]];

  if (!document.getElementById("wmsDStil")) {
    const st = document.createElement("style");
    st.id = "wmsDStil";
    st.textContent = `
.wmsD{margin:14px 0;padding:16px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(10,13,19,.7);display:flex;flex-direction:column;gap:10px;font-size:14px}
.wmsD h3{margin:0;font-size:16px;font-weight:600}
.wmsD__pod{margin:0;color:#8f9cad;font-size:13px}
.wmsD__zag{margin:4px 0 0;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#8f9cad}
.wmsD__ryad{display:flex;flex-wrap:wrap;gap:6px}
.wmsD__kn{min-height:40px;padding:0 14px;border:1px solid #35465c;border-radius:10px;background:transparent;color:#f2f6fb;font:600 14px inherit;cursor:pointer}
.wmsD__kn.is-on{background:#27c46b;border-color:#27c46b;color:#06130b}
.wmsD__kn--glav{background:#158044;border-color:#158044}
.wmsD__kn:disabled{opacity:.5;cursor:wait}
.wmsD select,.wmsD input{min-height:40px;padding:0 12px;border:1px solid #35465c;border-radius:10px;background:rgba(0,0,0,.25);color:#f2f6fb;font:500 14px inherit}
.wmsD__spisok{margin:0;padding-left:18px;color:#c9d2de;font-size:13px}
.wmsD__ok{color:#8fe0b1;font-weight:600}.wmsD__osh{color:#ff9c9c;font-weight:600}
.wmsD__gotovo{padding:12px;border-radius:12px;background:rgba(39,196,107,.14);border:1px solid rgba(39,196,107,.4)}
.wmsD__gotovo a{color:#8fe0b1}
.wmsD__tovar{text-align:left;justify-content:flex-start;display:flex;gap:8px;align-items:center;width:100%}
.wmsD__tovar small{margin-left:auto;color:#8f9cad}
body.is-svetlo .wmsD{background:#fff;border-color:#d3dae5}body.is-svetlo .wmsD__kn,body.is-svetlo .wmsD select,body.is-svetlo .wmsD input{color:#10203a;border-color:#b6c1d1;background:#fff}
body.is-svetlo .wmsD__spisok{color:#26303d}`;
    document.head.appendChild(st);
  }

  async function post(adres, telo) {
    const o = await fetch(adres, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(telo) });
    const d = await o.json().catch(() => ({}));
    if (!o.ok) { const e = new Error(d.ошибка || `сервер ответил ${o.status}`); e.nuzhenVhod = d.нужен_вход; throw e; }
    return d;
  }
  const knopki = (spisok, vybrano, dataKey) => spisok.map(([id, imya]) =>
    `<button type="button" class="wmsD__kn${id === vybrano ? " is-on" : ""}" data-${dataKey}="${id}">${esc(imya)}</button>`).join("");

  function uz(host, opc) {
    const sost = { tip: 2, prichina: 2, prioritet: 2, potok: null, tovar_guid: opc.tovar_guid || "", komm: "",
                   pred: null, idet: false, oshibka: "", gotovo: null };
    const telo = (sohranit) => ({ откуда: opc.otkuda || "сайт", ячейка: opc.yacheyka || "", паллета: opc.palleta || "",
      товар_guid: sost.tovar_guid, тип: sost.tip, причина: sost.prichina, приоритет: sost.prioritet,
      поток: sost.potok || "", комментарий: sost.komm, сохранить: sohranit });

    async function proverit() {
      sost.idet = "Проверяю в WMS — что уйдёт в задание…"; sost.oshibka = ""; risovat();
      try {
        sost.pred = await post("/__wms/uz", telo(false));
        if (sost.pred.поток && !sost.potok) sost.potok = sost.pred.поток.id;
      } catch (e) { sost.oshibka = e.message; sost.pred = null; }
      sost.idet = false; risovat();
    }
    async function sozdat() {
      sost.idet = "Создаю задание в WMS…"; risovat();
      try {
        sost.gotovo = await post("/__wms/uz", telo(true));
        if (navigator.vibrate) navigator.vibrate(150);
      } catch (e) { sost.oshibka = e.nuzhenVhod ? "Войдите в WMS (кнопка «Войти в WMS»), потом «Создать» ещё раз" : e.message; }
      sost.idet = false; risovat();
    }
    async function otmenit() {
      sost.idet = "Отменяю…"; risovat();
      try { await post("/__wms/otmenit", { что: "универсальное задание", номер: sost.gotovo.задание }); sost.gotovo.отменён = true; }
      catch (e) { sost.oshibka = e.message; }
      sost.idet = false; risovat();
    }

    function risovat() {
      const p = sost.pred;
      let niz = "";
      if (sost.gotovo) {
        const g = sost.gotovo;
        niz = `<div class="wmsD__gotovo"><b>${g.отменён ? "Задание отменено (помечено на удаление)" : `Задание №${esc(g.задание)} создано черновиком`}</b>
          <p class="wmsD__pod">${esc(g.тип)} · ${esc(g.причина)} · ${esc(g.по_чему)} · ${g.строк} стр. · поток «${esc((g.поток || {}).имя || "")}»</p>
          <div class="wmsD__ryad">${g.вмс && !g.отменён ? `<a class="wmsD__kn" href="${esc(g.вмс)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none">Открыть в WMS</a>` : ""}
            ${!g.отменён ? '<button type="button" class="wmsD__kn" data-d="otmena">Отменить</button>' : ""}</div></div>`;
      } else if (p && p.нужен_товар) {
        niz = `<p class="wmsD__pod">В ячейке ${p.строк} строк — выберите товар, с которым проблема:</p>
          ${p.товары.map((t) => `<button type="button" class="wmsD__kn wmsD__tovar" data-guid="${esc(t.guid)}">${esc(t.товар)}<small>${t.штук} шт</small></button>`).join("")}`;
      } else if (p) {
        niz = `<p class="wmsD__pod">${esc(p.по_чему)} · ${esc(p.склад)} · ${p.строк} стр., ${p.штук} шт</p>
          <ul class="wmsD__spisok">${(p.товары || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          <p class="wmsD__zag">Рабочий поток — кому уйдёт</p>
          <select data-d="potok"><option value="">— выберите —</option>${(p.потоки || []).map((x) =>
            `<option value="${x.id}"${String(x.id) === String(sost.potok) ? " selected" : ""}>${esc(x.имя)}</option>`).join("")}</select>
          ${p.нужен_поток ? '<p class="wmsD__osh">Сектор не определился — выберите поток вручную</p>' : ""}
          ${p.ошибки_вмс ? `<p class="wmsD__osh">WMS не примет: ${esc(Object.values(p.ошибки_вмс).flat().join("; "))}</p>`
            : p.можно ? '<p class="wmsD__ok">WMS примет задание</p>' : ""}
          <button type="button" class="wmsD__kn wmsD__kn--glav" data-d="sozdat"${p.можно && !sost.idet ? "" : " disabled"}>Создать задание</button>`;
      }
      host.innerHTML = `<div class="wmsD">
        <h3>Универсальное задание в WMS</h3>
        <p class="wmsD__pod">${esc(opc.podpis || opc.yacheyka || opc.palleta || "")} — склад сам отдаст задание исполнителю.</p>
        <p class="wmsD__zag">Тип</p><div class="wmsD__ryad">${knopki(TIPY, sost.tip, "tip")}</div>
        <p class="wmsD__zag">Причина</p><div class="wmsD__ryad">${knopki(PRICHINY, sost.prichina, "prichina")}</div>
        <p class="wmsD__zag">Приоритет</p><div class="wmsD__ryad">${knopki(PRIORITETY, sost.prioritet, "prioritet")}</div>
        <input data-d="komm" placeholder="Комментарий для исполнителя" value="${esc(sost.komm)}">
        ${sost.idet ? `<p class="wmsD__pod">${esc(sost.idet)}</p>` : ""}
        ${sost.oshibka ? `<p class="wmsD__osh">${esc(sost.oshibka)}</p>` : ""}
        ${niz}</div>`;
    }

    host.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || sost.idet) return;
      if (b.dataset.tip) { sost.tip = +b.dataset.tip; sost.potok = null; proverit(); }
      else if (b.dataset.prichina) { sost.prichina = +b.dataset.prichina; proverit(); }
      else if (b.dataset.prioritet) { sost.prioritet = +b.dataset.prioritet; risovat(); }
      else if (b.dataset.guid) { sost.tovar_guid = b.dataset.guid; proverit(); }
      else if (b.dataset.d === "sozdat") sozdat();
      else if (b.dataset.d === "otmena") otmenit();
    };
    host.onchange = (e) => {
      if (e.target.dataset.d === "potok") { sost.potok = +e.target.value || null; proverit(); }
      if (e.target.dataset.d === "komm") sost.komm = e.target.value;
    };
    risovat();
    proverit();
  }

  async function zhurnal(host) {
    host.innerHTML = '<p class="wmsD__pod">Загружаю…</p>';
    try {
      const d = await (await fetch("/__wms/zhurnal", { cache: "no-store" })).json();
      const r = d.документы || [];
      host.innerHTML = `<div class="wmsD"><h3>Создано с сайта в WMS</h3>${r.length ? `<ul class="wmsD__spisok">${r.map((x) =>
        `<li>${esc(x.когда.slice(8, 10))}.${esc(x.когда.slice(5, 7))} ${esc(x.когда.slice(11, 16))} · ${esc(x.что)} ${x.номер ? `№${esc(x.номер)}` : ""} · ${esc(x.по_чему)} · ${esc(x.статус)}${x.ошибка ? ` — ${esc(x.ошибка)}` : ""} · ${esc(x.кто)}</li>`).join("")}</ul>`
        : '<p class="wmsD__pod">Пока ничего.</p>'}</div>`;
    } catch (e) { host.innerHTML = `<p class="wmsD__osh">${esc(e.message)}</p>`; }
  }

  window.WmsDeystviya = { uz, zhurnal };
})();
