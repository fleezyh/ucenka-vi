// 15.10 Степан: «надо сделать полноценную систему: есть у нас все в департаменте (в том числе ВИ Сервис),
// чтобы можно было в режиме редактирования всё что угодно — кто за кого подаёт, оклад и т. д. При этом
// основа данных о трудоустроенных людях — это база».
// Вкладка «Люди» в /zp/fot: база 1С (кто трудоустроен) + что насчитал расчёт + правки руками с причиной.
// Править — админ или личное право «правка справочника людей»; каждая правка с «почему», отменяется,
// история остаётся. После правки расчёт зарплаты пересчитывается сам (~минута).
(function () {
  const z = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rub = (x) => (x == null || x === "" ? "—" : Math.round(Number(x)).toLocaleString("ru-RU") + " ₽");
  const yur = (y) => /ВИ СЕРВИС/i.test(y) ? "ВИ Сервис" : /Ви\.Тех/i.test(y) ? "Ви.Тех" : /ВсеИнструменты/i.test(y) ? "ВИ.ру" : (y || "—");

  let D = null;
  let mesto = null;
  let pravim = false;
  let filtr = "vse";
  let poisk = "";
  let otkryt = "";          // ключ человека с раскрытой историей
  let redakt = null;        // {ключ, поле}
  const svernuty = new Set();

  const FILTRY = [
    ["vse", "Все", () => true],
    ["bedy", "Расхождения", (c) => c["расхождения"].length],
    ["raschet", "В расчёте", (c) => c["в_расчёте"]],
    ["ne_raschet", "Не в расчёте", (c) => !c["в_расчёте"]],
    ["vi", "ВИ.ру и Ви.Тех", (c) => !/ВИ СЕРВИС/i.test(c["юрлицо"])],
    ["vis", "ВИ Сервис", (c) => /ВИ СЕРВИС/i.test(c["юрлицо"])],
    ["pravki", "С правками", (c) => Object.keys(c["правки"]).length],
  ];

  function vidimye() {
    const f = (FILTRY.find((x) => x[0] === filtr) || FILTRY[0])[2];
    const q = poisk.trim().toLowerCase();
    return D["люди"].filter((c) => f(c) && (!q || [c["фио"], c["должность"], c["отдел"], c["отдел_1с"], c["логин"], c["подаёт"], c["блок"]]
      .join(" ").toLowerCase().includes(q)));
  }

  function yacheyka(c, pole, html) {
    const pr = c["правки"][pole];
    const fayl = c["правки_из_файла"][pole];
    const metka = pr ? `<i class="lyPr" title="${z(pr["почему"] + " — " + pr["кто"] + " " + pr["когда"])}">правка</i>`
      : fayl ? `<i class="lyPr lyPr--fayl" title="${z(fayl)}">правка 14.09</i>` : "";
    const red = pravim ? ` data-red="${z(pole)}" title="изменить"` : "";
    return `<td class="lyY${pravim ? " is-red" : ""}${pr ? " is-pr" : ""}"${red}>${html}${metka}</td>`;
  }

  function stroka(c) {
    const ist = c["история"].length;
    const otdel = c["отдел"] && c["отдел_1с"] && c["отдел"] !== c["отдел_1с"]
      ? `${z(c["отдел"])}<small>по 1С: ${z(c["отдел_1с"])}</small>` : z(c["отдел"] || c["отдел_1с"] || "—");
    const okl = c["оклад"] != null ? `${rub(c["оклад"])}<small>${z(c["источник_оклада"] || "")}</small>` : "—";
    const flagi = [...c["расхождения"].map((b) => `<span class="lyBeda">${z(b)}</span>`),
      ...(c["заметки"] || []).map((b) => `<span class="lyZam">${z(b)}</span>`),
      c["комментарий"] ? `<span class="lyKom">${z(c["комментарий"])}</span>` : ""].join("");
    let html = `<tr class="lyR${c["расхождения"].length ? " is-beda" : ""}${otkryt === c["ключ"] ? " is-open" : ""}" data-k="${z(c["ключ"])}">
      <td class="lyFio"><b>${z(c["фио"])}</b><small>${z(c["должность"])}${c["логин"] ? " · " + z(c["логин"]) : ""}${ist ? ` · правок ${ist}` : ""}</small></td>
      <td>${z(yur(c["юрлицо"]))}</td>
      ${yacheyka(c, "отдел", otdel)}
      ${yacheyka(c, "подаёт", z(c["подаёт"] || "—"))}
      ${yacheyka(c, "блок", z(c["блок"] || "—"))}
      ${yacheyka(c, "оклад", okl)}
      ${yacheyka(c, "в_расчёте", c["в_расчёте"] ? "да" : "нет")}
      <td class="lyFl">${flagi}${pravim ? `<button type="button" class="lyKomK" data-red="комментарий">✎ комментарий</button>` : ""}</td>
    </tr>`;
    if (redakt && redakt.k === c["ключ"]) html += redaktor(c);
    if (otkryt === c["ключ"]) html += istoriya(c);
    return html;
  }

  function redaktor(c) {
    const pole = redakt.pole;
    const opis = D["поля"][pole] || {};
    const tek = pole === "в_расчёте" ? (c["в_расчёте"] ? "да" : "нет") : (c[pole] ?? "");
    const var_ = pole === "в_расчёте" ? ["да", "нет"] : (D["варианты"][pole] || null);
    const vvod = var_
      ? `<select name="z">${var_.map((v) => `<option value="${z(v)}"${String(v) === String(tek) ? " selected" : ""}>${z(v || "— нет блока —")}</option>`).join("")}</select>`
      : `<input name="z" type="${opis["тип"] === "число" ? "number" : "text"}" value="${z(tek ?? "")}" ${opis["тип"] === "число" ? 'step="1" min="0"' : ""}>`;
    const pr = c["правки"][pole];
    return `<tr class="lyRed"><td colspan="8"><form class="lyRedF" data-k="${z(c["ключ"])}" data-pole="${z(pole)}">
      <b>${z(opis["название"] || pole)} · ${z(c["фио"])}</b>
      <label>значение ${vvod}</label>
      <label class="lyRedF__po">почему <input name="po" type="text" maxlength="300" placeholder="обязательно: откуда цифра или чьё решение" required></label>
      <button type="submit" class="zpView zpView--glavnaya">Сохранить</button>
      <button type="button" class="zpView" data-zakryt>Отмена</button>
      ${pr ? `<span class="lyRedF__tek">сейчас правка: ${z(pr["значение"])} — ${z(pr["почему"])} (${z(pr["кто"])}, ${z(pr["когда"])})
        <button type="button" class="lyOtm" data-otm="${pr["id"]}">отменить правку</button></span>` : ""}
      <p class="lyRedF__osh" hidden></p>
    </form></td></tr>`;
  }

  function istoriya(c) {
    const h = c["история"].slice().reverse();
    return `<tr class="lyIst"><td colspan="8">
      <div class="lyIst__shapka"><b>${z(c["фио"])}</b> · ${z(c["юрлицо"])} · ${z((c["путь"] || []).join(" › ") || c["отдел_1с"])}
        ${c["принят"] ? " · принят " + z(c["принят"]) : ""}${c["статус"] ? " · " + z(c["статус"]) : ""}</div>
      ${h.length ? `<ul>${h.map((p) => `<li class="${p["отменено"] ? "is-otm" : ""}">
        <span>${z(p["когда"])} · ${z(p["кто"])}</span>
        <b>${z((D["поля"][p["поле"]] || {})["название"] || p["поле"])}: ${z(p["было"] || "—")} → ${z(p["значение"] || "—")}</b>
        <i>${z(p["почему"])}</i>
        ${p["отменено"] ? `<em>отменил ${z(p["отменил"])} ${z(p["отменено"])}</em>` : pravim ? `<button type="button" class="lyOtm" data-otm="${p["id"]}">отменить</button>` : ""}
      </li>`).join("")}</ul>` : `<p class="lyPusto">правок не было</p>`}
    </td></tr>`;
  }

  function narisovat() {
    const vid = vidimye();
    const gr = new Map();
    vid.forEach((c) => {
      const k = c["направление"] || c["направление_1с"] || "—";
      if (!gr.has(k)) gr.set(k, []);
      gr.get(k).push(c);
    });
    const it = D["итого"];
    mesto.innerHTML = `
      <div class="lyShapka">
        <div><h2>Люди департамента</h2>
          <p>Основа — 1С ЗУП на ${z(D["база_на"])} (собрано ${z(D["база_собрана"])}), расчёт ${z(D["расчёт_на"])}.
          Должность, юрлицо и отдел по 1С правятся только в 1С; здесь — кто подаёт, блок, оклад, отдел на экране, в расчёте ли.</p></div>
        ${D["можно_править"] ? `<button type="button" class="zpView${pravim ? " zpView--glavnaya" : ""}" data-pravim>${pravim ? "✓ Режим правки включён" : "Режим правки"}</button>` : ""}
      </div>
      <div class="lyPlitki">
        <button type="button" data-f="vse" class="${filtr === "vse" ? "is-on" : ""}"><b>${it["всего"]}</b><span>всего</span></button>
        <button type="button" data-f="raschet" class="${filtr === "raschet" ? "is-on" : ""}"><b>${it["в_расчёте"]}</b><span>в расчёте ЗП</span></button>
        <button type="button" data-f="ne_raschet" class="${filtr === "ne_raschet" ? "is-on" : ""}"><b>${it["всего"] - it["в_расчёте"]}</b><span>не в расчёте</span></button>
        <button type="button" data-f="bedy" class="lyPlitki__beda${filtr === "bedy" ? " is-on" : ""}"><b>${it["расхождений"]}</b><span>расхождений</span></button>
      </div>
      <div class="lyPanel">
        <input type="search" id="lyPoisk" placeholder="ФИО, должность, отдел, логин, кто подаёт" value="${z(poisk)}">
        <div class="lyFiltry">${FILTRY.map(([k, t]) => `<button type="button" class="zpView${filtr === k ? " is-on" : ""}" data-f="${k}">${t}</button>`).join("")}</div>
        <span class="lySchet">показано ${vid.length}</span>
      </div>
      <div class="lyTabl"><table>
        <thead><tr><th>Человек</th><th>Юрлицо</th><th>Отдел</th><th>Подаёт</th><th>Блок</th><th>Оклад</th><th>В расчёте</th><th>Что не так</th></tr></thead>
        ${[...gr.entries()].map(([napr, lyudi]) => `<tbody>
          <tr class="lyNapr" data-napr="${z(napr)}"><td colspan="8">${svernuty.has(napr) ? "▸" : "▾"} ${z(napr)}
            <span>${lyudi.length} чел.${lyudi.filter((c) => c["расхождения"].length).length ? " · расхождений " + lyudi.filter((c) => c["расхождения"].length).length : ""}</span></td></tr>
          ${svernuty.has(napr) ? "" : lyudi.map(stroka).join("")}
        </tbody>`).join("")}
      </table></div>`;
  }

  async function zapros(put, telo) {
    const r = await fetch(put, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(telo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d["ошибка"] || "не сохранилось");
    D = d;
  }

  function podklyuchitSobytiya() {
    mesto.addEventListener("input", (e) => {
      if (e.target.id !== "lyPoisk") return;
      poisk = e.target.value;
      const poz = e.target.selectionStart;
      narisovat();
      const p = mesto.querySelector("#lyPoisk");
      p.focus();
      p.setSelectionRange(poz, poz);
    });
    mesto.addEventListener("click", async (e) => {
      const t = e.target;
      if (t.closest("[data-pravim]")) { pravim = !pravim; redakt = null; narisovat(); return; }
      const f = t.closest("[data-f]");
      if (f) { filtr = f.dataset.f; narisovat(); return; }
      const n = t.closest(".lyNapr");
      if (n) { const k = n.dataset.napr; svernuty.has(k) ? svernuty.delete(k) : svernuty.add(k); narisovat(); return; }
      if (t.closest("[data-zakryt]")) { redakt = null; narisovat(); return; }
      const otm = t.closest("[data-otm]");
      if (otm) {
        if (!confirm("Отменить эту правку? Вернётся значение из 1С, формы или ШР.")) return;
        try { await zapros("/__lyudi/otmenit", { id: Number(otm.dataset.otm) }); redakt = null; narisovat(); } catch (o) { alert(o.message); }
        return;
      }
      if (t.closest(".lyRed, .lyIst")) return;
      const red = t.closest("[data-red]");
      const r = t.closest(".lyR");
      if (red && r && pravim) { redakt = { k: r.dataset.k, pole: red.dataset.red }; narisovat();
        mesto.querySelector('.lyRedF [name="z"]')?.focus(); return; }
      if (r) { otkryt = otkryt === r.dataset.k ? "" : r.dataset.k; narisovat(); }
    });
    mesto.addEventListener("submit", async (e) => {
      const f = e.target.closest(".lyRedF");
      if (!f) return;
      e.preventDefault();
      const osh = f.querySelector(".lyRedF__osh");
      const kn = f.querySelector('[type="submit"]');
      kn.disabled = true;
      try {
        await zapros("/__lyudi/pravka", { "ключ": f.dataset.k, "поле": f.dataset.pole, "значение": f.elements.z.value, "почему": f.elements.po.value });
        redakt = null;
        otkryt = f.dataset.k;
        narisovat();
      } catch (o) {
        kn.disabled = false;
        osh.hidden = false;
        osh.textContent = o.message;
      }
    });
  }

  window.ZpLyudi = {
    async podklyuchit(blok) {
      const r = await fetch("/__lyudi", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return false;
      D = await r.json();
      mesto = blok;
      narisovat();
      podklyuchitSobytiya();
      return true;
    },
  };
})();
