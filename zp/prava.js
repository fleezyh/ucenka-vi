// 15.10 Степан: «главное не ошибиться — надо режим для Алины: видеть, у кого какие права, и протыкать
// для сверки». Вкладка «Права» в /zp/fot — только тем, кто видит всех (Поснова, админ).
// Показываем не настройки, а итог: кого человек реально увидит в панели — сервер считает тем же
// фильтром, что режет панель. Галка «сверено» привязана к состоянию и слетает сама, если у человека
// поменялись роль, блоки или состав.
(function () {
  const z = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const korotko = (fio) => {
    const [f, i, o] = String(fio || "").split(/\s+/);
    return f ? f + (i ? " " + i[0] + "." : "") + (o ? " " + o[0] + "." : "") : "";
  };

  function poOtdelam(spisok, klyuch) {
    const gr = new Map();
    spisok.forEach((c) => {
      const k = c[klyuch] || "—";
      if (!gr.has(k)) gr.set(k, []);
      gr.get(k).push(c);
    });
    return [...gr.entries()].sort((a, b) => b[1].length - a[1].length);
  }

  function knopka(klyuch, x) {
    const s = x["сверка"] || {};
    const k = `data-sverka="${z(klyuch)}" data-ot="${z(x["отпечаток"])}"`;
    if (s["статус"] === "да") return `<button type="button" class="zpPr__sv is-da" ${k} data-snyat="1" title="снять отметку">✓ сверено · ${z(s["кто"])} ${z(s["когда"])}</button>`;
    if (s["статус"] === "изменилось") return `<button type="button" class="zpPr__sv is-izm" ${k}>изменилось после сверки ${z(s["когда"])} — сверить заново</button>`;
    return `<button type="button" class="zpPr__sv" ${k}>Сверено</button>`;
  }

  function sostoyanie(x) {
    if ((x["проблемы"] || []).length) return "bad";
    const st = (x["сверка"] || {})["статус"];
    return st === "да" ? "ok" : st === "изменилось" ? "izm" : "net";
  }

  function chelovek(x) {
    const dela = [
      x["суть"],
      x["вносит"].length ? "вносит: " + x["вносит"].join(", ") : "",
      x["согласует"].length ? "согласует " + x["согласует"].length + ": " + x["согласует"].join(", ") : "",
      x["смотрит"].length ? "только смотрит: " + x["смотрит"].join(", ") : "",
    ].filter(Boolean);
    const vidit = x["видит"] || [];
    const spisok = x["видит_всех"]
      ? `<p class="zpPr__vse">видит всех — ${vidit.length} чел.</p>`
      : vidit.length
        ? `<details class="zpPr__kogo"><summary>видит ${vidit.length} чел.</summary>${poOtdelam(vidit, "отдел").map(([otd, lyudi]) =>
          `<div class="zpPr__otd"><i>${z(otd)}</i>${lyudi.map((c) => `<span>${z(korotko(c["фио"]))}</span>`).join("")}</div>`).join("")}</details>`
        : `<p class="zpPr__vse">в панели не видит никого</p>`;
    return `<article class="zpPr zpPr--${sostoyanie(x)}">
      <header><b>${z(x["фио"])}</b><span class="zpPr__rol">${z(x["роль_название"])}${x["личные_права"].length ? " + личные" : ""}</span></header>
      ${dela.length ? `<p class="zpPr__dela">${dela.map(z).join("<br>")}</p>` : ""}
      ${(x["проблемы"] || []).map((p) => `<p class="zpPr__beda">${z(p)}</p>`).join("")}
      ${spisok}
      <footer><small>${x["заходил"] ? "заходил " + z(x["заходил"]) : "на сайт не заходил"}</small>${knopka("человек:" + x["логин"], x)}</footer>
    </article>`;
  }

  function blok(b) {
    const roli = [
      "вносит: " + (b["вносят"].length ? b["вносят"].map(korotko).join(", ") : "никто"),
      b["согласует"].length ? "согласует: " + b["согласует"].map(korotko).join(", ") : "",
      b["смотрят"].length ? "смотрит: " + b["смотрят"].map(korotko).join(", ") : "",
    ].filter(Boolean);
    return `<article class="zpPr zpPr--${sostoyanie(b)}">
      <header><b>${z(b["блок"])}</b><span class="zpPr__rol">${b["люди"].length} чел.</span></header>
      <p class="zpPr__dela">${roli.map(z).join("<br>")}${b["отделы"].length ? `<br><span class="zpPr__tiho">отделы 1С: ${z(b["отделы"].join(", "))}${b["показывать_как"] ? " → на экране одним: " + z(b["показывать_как"]) : ""}</span>` : ""}</p>
      ${(b["проблемы"] || []).map((p) => `<p class="zpPr__beda">${z(p)}</p>`).join("")}
      <ul class="zpPr__lyudi">${b["люди"].map((c) => `<li><span>${z(c["фио"])}</span><small>${z(c["должность"])}${c["отдел_1с"] ? " · по 1С: " + z(c["отдел_1с"]) : ""}</small></li>`).join("")}</ul>
      ${b["заметка"] ? `<p class="zpPr__tiho">${z(b["заметка"])}</p>` : ""}
      <footer><small></small>${knopka("блок:" + b["блок"], b)}</footer>
    </article>`;
  }

  function narisovat(mesto, d) {
    const vse = [...d["люди"], ...d["блоки"]];
    const sver = vse.filter((x) => (x["сверка"] || {})["статус"] === "да").length;
    const bed = vse.filter((x) => (x["проблемы"] || []).length).length;
    mesto.innerHTML = `
      <div class="zpPrava__shapka">
        <h2>Кто видит зарплаты</h2>
        <span>сверено ${sver} из ${vse.length}${bed ? ` · <b class="zpPrava__bed">требуют внимания: ${bed}</b>` : ""}</span>
      </div>
      <p class="zpPrava__poyasn">Здесь не настройки, а итог: кого человек увидит в панели подачи. Проверьте и нажмите «Сверено».
        Если потом поменяются роль, блоки или состав, отметка слетит сама. Наверху — что требует внимания, ниже — несверенное.</p>
      <div class="zpPrava__setka">${d["люди"].map(chelovek).join("")}</div>
      <h2 class="zpPrava__h">Блоки — кто вносит и кто в них</h2>
      <div class="zpPrava__setka">${d["блоки"].map(blok).join("")}</div>
      <details class="zpPrava__bez"><summary>Без блока — вносит Алина: ${d["без_блока"].length} из ${d["всего_в_расчёте"]}</summary>
        ${poOtdelam(d["без_блока"], "отдел").map(([otd, lyudi]) => `<div class="zpPr__otd"><i>${z(otd)}</i>${lyudi.map((c) => `<span>${z(korotko(c["фио"]))}</span>`).join("")}</div>`).join("")}
      </details>`;
  }

  window.ZpPrava = {
    async podklyuchit(mesto) {
      const otvet = await fetch("/__zp/prava", { credentials: "same-origin", cache: "no-store" });
      if (!otvet.ok) return false;
      narisovat(mesto, await otvet.json());
      mesto.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-sverka]");
        if (!b) return;
        if (b.dataset.snyat && !confirm("Снять отметку «сверено»?")) return;
        b.disabled = true;
        try {
          const r = await fetch("/__zp/prava/sverka", {
            method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ "ключ": b.dataset.sverka, "отпечаток": b.dataset.ot, "снять": !!b.dataset.snyat }),
          });
          if (!r.ok) throw new Error("не сохранилось");
          const otkryty = [...mesto.querySelectorAll("details[open]")].map((d) => d.closest(".zpPr")?.querySelector("header b")?.textContent || "bez");
          narisovat(mesto, await r.json());
          mesto.querySelectorAll("details").forEach((d) => {
            const kto = d.closest(".zpPr")?.querySelector("header b")?.textContent || "bez";
            if (otkryty.includes(kto)) d.open = true;
          });
        } catch (oshibka) {
          b.disabled = false;
          alert(oshibka.message);
        }
      });
      return true;
    },
  };
})();
