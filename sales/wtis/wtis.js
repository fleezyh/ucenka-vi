/* WTIS — роботы продаж (27.09, Степан: «пример описания наших роботизированных
   действий… выставление счёта, ценообразование… чтоб я не путался; пока скрыто»).
   Состояние роботов — /__vtis/roboty; проба плана заказов и заказа по номеру —
   /__vtis/plan и /__vtis/zakaz. Во WTIS отсюда ничего не пишется. */
(function () {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SOST = {
    "работает": { k: "ok", t: "работает" },
    "тест": { k: "test", t: "тест" },
    "не запускали": { k: "test", t: "написано, не запускали" },
    "не работает": { k: "bad", t: "не работает" },
    "нет": { k: "net", t: "нет" },
  };
  const box = document.getElementById("roboty");
  const msg = document.getElementById("message");

  // «Mon 2026-09-28 07:05:00 MSK» → «28.09 07:05»
  const kogda = (s) => {
    const m = /(\d{4})-(\d\d)-(\d\d)[ T](\d\d:\d\d)/.exec(String(s || ""));
    return m ? `${m[3]}.${m[2]} ${m[4]}` : "";
  };
  const den = (s) => {
    const m = /(\d{4})-(\d\d)-(\d\d)/.exec(String(s || ""));
    return m ? `${m[3]}.${m[2]}` : String(s || "");
  };

  function sluchai(r) {
    if (!r.случаи || !r.случаи.length) return "";
    return `<p class="wtZag">Последние случаи</p><div class="wtSluchai">${r.случаи.map((x) => `
      <div class="wtSluchay"><span class="wtSluchay__k">${esc(kogda(x.когда))}</span>
        <span>${x.лот ? `лот <b>${esc(x.лот)}</b>` : ""}${x.покупатель ? ` · ${esc(x.покупатель)}` : ""}</span>
        <span class="wtSluchay__chto">${x.было ? `${esc(den(x.было))} → ` : ""}${esc(den(x.стало))}${x.кто && !/ВТИС/.test(x.кто) ? ` · ${esc(x.кто)}` : ""}</span>
      </div>`).join("")}</div>`;
  }

  function zhurnal(r) {
    if (!r.журнал || !r.журнал.length) return "";
    return `<details class="wtZhurnal"><summary>Журнал робота · последние ${r.журнал.length}</summary>
      <pre>${r.журнал.map(esc).join("\n")}</pre></details>`;
  }

  function proba(r) {
    if (r.проба === "zakaz") {
      return `<form class="wtProba" data-proba="zakaz" autocomplete="off">
        <input name="nomer" placeholder="номер заказа WTIS" inputmode="numeric">
        <button type="submit">Проверить оплату</button></form><div class="wtOtvet" data-otvet="zakaz"></div>`;
    }
    if (r.проба === "plan") {
      return `<form class="wtProba wtProba--plan" data-proba="plan" autocomplete="off">
        <input name="lot" placeholder="номер лота">
        <textarea name="pallety" rows="3" placeholder="или паллеты — по одной в строке: Уценка-0165326648, CON 0163233250…"></textarea>
        <button type="submit">Показать, что собрал бы робот</button></form><div class="wtOtvet" data-otvet="plan"></div>`;
    }
    return "";
  }

  // Одна строка на робота: было руками → стало само; подробности по клику (27.09,
  // «тут ещё и выгрузки… очень запутанно»).
  function stroka(r, i) {
    const s = SOST[r.состояние] || SOST["нет"];
    const t = r.таймер || {};
    const posl = (r.случаи && r.случаи[0]) ? `${kogda(r.случаи[0].когда)}${r.случаи[0].лот ? ` · лот ${r.случаи[0].лот}` : ""}` : "";
    const est = r.случаи && r.случаи.length || r.проба || r.журнал && r.журнал.length || r.примечание || r.подробно;
    return `<details class="wtRobot is-${s.k}"${est ? "" : " data-pusto"}>
      <summary>
        <span class="wtRobot__n">${i + 1}</span>
        <span class="wtRobot__imya">${esc(r.имя)}<span class="wtChip is-${s.k}">${s.t}</span></span>
        <span class="wtRobot__bylo"><small>было</small>${esc(r.было)}</span>
        <span class="wtRobot__stalo"><small>стало</small>${esc(r.стало)}</span>
        <span class="wtRobot__kogda">${esc(r.когда)}${posl ? `<br>последний раз ${esc(posl)}` : t.был ? `<br>был ${esc(kogda(t.был))}` : ""}</span>
      </summary>
      <div class="wtRobot__telo">
        ${r.подробно ? `<p class="wtRobot__chto">${esc(r.подробно)}</p>` : ""}
        ${r.примечание ? `<p class="wtRobot__prim">${esc(r.примечание)}</p>` : ""}
        ${t.будет ? `<p class="wtRobot__chto">следующий запуск ${esc(kogda(t.будет))}</p>` : ""}
        ${sluchai(r)}${proba(r)}${zhurnal(r)}
      </div>
    </details>`;
  }

  function risovat(d) {
    const roboty = d.роботы || [];
    const schet = {};
    roboty.forEach((r) => { const k = (SOST[r.состояние] || SOST["нет"]).t; schet[k] = (schet[k] || 0) + 1; });
    document.getElementById("svod").innerHTML = Object.values(SOST).filter((s) => schet[s.t])
      .map((s) => `<span class="wtChip is-${s.k}">${s.t} · ${schet[s.t]}</span>`).join("");
    box.innerHTML = `<div class="wtSpisok">${roboty.map(stroka).join("")}</div>`;
    msg.hidden = true;
    document.getElementById("stamp").textContent = "состояние на " + new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function otvetZakaz(d) {
    return `<div class="wtFakty">
      ${d.в_снимке ? `<span>${esc(d.покупатель)} · от ${esc(den(d.дата))}</span>
        <span>сумма <b>${Math.round(d.сумма).toLocaleString("ru-RU")} ₽</b> · оплачено ${Math.round(d.оплачено).toLocaleString("ru-RU")} ₽</span>
        <span class="${d.оплачен ? "is-ok" : "is-test"}">${d.оплачен ? `оплачен${d.стал_оплачен ? ` — робот увидел ${esc(kogda(d.стал_оплачен))}` : ""}` : "не оплачен"}</span>
        <span>снимок ${esc(kogda(d.снимок))}</span>` : "<span>в снимке уценки нет — не канал уценки или старше 120 дней</span>"}
      ${(d.лоты || []).map((l) => `<span>лот <b>${esc(l.лот)}</b> · ${esc(l.статус)}${l.оплата ? ` · оплата ${esc(den(l.оплата))}` : ""}</span>`).join("")}
    </div>`;
  }

  function otvetPlan(d) {
    const sh = d.шаблон;
    return `<div class="wtFakty">
        <span>паллет <b>${d.паллет}</b> · актов <b>${d.актов}</b> · заказов <b>${d.части.length}</b></span>
        ${d.покупатель ? `<span>покупатель ${esc(d.покупатель)}</span>` : ""}
        ${sh ? `<span>шаблон — его заказ <b>${esc(sh.номер)}</b></span>` : ""}
      </div>
      ${d.части.map((ch, i) => `<div class="wtChast">
        <b>${esc(ch.часть)}</b><span>${ch.акты.length} актов · ${ch.паллеты.length} паллет</span>
        <button type="button" class="wtKn" data-fayl="${i}">Excel для импорта</button>
        <small>${ch.паллеты.map(esc).join(", ")}</small></div>`).join("")}
      ${(d.проблемы || []).map((p) => `<p class="wtProblema">${esc(p)}</p>`).join("")}`;
  }

  let posledniyPlan = null;
  box.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-proba]");
    if (!f) return;
    e.preventDefault();
    const vid = f.dataset.proba;
    const ot = box.querySelector(`[data-otvet="${vid}"]`);
    const kn = f.querySelector("button");
    kn.disabled = true;
    ot.innerHTML = `<p class="wtRobot__prim">${vid === "plan" ? "Читаю акты с паллет живьём из WMS — по паре секунд на паллету…" : "Ищу…"}</p>`;
    try {
      const o = vid === "zakaz"
        ? await fetch(`/__vtis/zakaz?nomer=${encodeURIComponent(f.nomer.value.trim())}`, { cache: "no-store" })
        : await fetch("/__vtis/plan", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ лот: f.lot.value.trim(), паллеты: f.pallety.value }) });
      const d = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(d.ошибка || `сервер ответил ${o.status}`);
      if (vid === "plan") posledniyPlan = d;
      ot.innerHTML = vid === "zakaz" ? otvetZakaz(d) : otvetPlan(d);
    } catch (err) {
      ot.innerHTML = `<p class="wtProblema">${esc(err.message || err)}</p>`;
    } finally {
      kn.disabled = false;
    }
  });

  box.addEventListener("click", async (e) => {
    const k = e.target.closest("[data-fayl]");
    if (!k || !posledniyPlan) return;
    const ch = posledniyPlan.части[Number(k.dataset.fayl)];
    const o = await fetch("/__vtis/fayl", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ акты: ch.акты, имя: ch.часть }) });
    if (!o.ok) { k.textContent = "не вышло"; return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await o.blob());
    a.download = `${ch.часть}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  fetch("/__vtis/roboty", { cache: "no-store" })
    .then((o) => (o.ok ? o.json() : Promise.reject(new Error(`сервер ответил ${o.status}`))))
    .then(risovat)
    .catch((err) => { msg.textContent = "Не загрузилось: " + (err.message || err); msg.className = "message warn"; });
})();
