// Сводка ФОТ для руководителя: сколько выходит за месяц, какой лимит по ШР и
// где запас или перерасход. Минимум цифр — три главных и по строке на
// направление. Здесь же лимиты вписываются руками и грузится новое ШР.
//
// Данные — агрегаты из /__fot, без фамилий: пофамильно живёт рабочая панель.
// Исключение — предпросмотр загрузки ШР: он показывает, чей оклад поменяется,
// и открыт только тем, кто видит все контуры.

(() => {
  "use strict";

  const MESYAC_IM = ["январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

  const mln = (v) => ((Number(v) || 0) / 1e6).toLocaleString("ru-RU",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rub = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU") + " ₽";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);

  function slovo(n, formy) {
    const k = Math.abs(n) % 100;
    const e = k % 10;
    if (k > 10 && k < 20) return formy[2];
    if (e === 1) return formy[0];
    if (e >= 2 && e <= 4) return formy[1];
    return formy[2];
  }

  function mesyacImya(klyuch) {
    const [god, m] = String(klyuch || "").split("-");
    return MESYAC_IM[Number(m) - 1] ? `${MESYAC_IM[Number(m) - 1]} ${god}` : klyuch;
  }

  /* Полоса «сколько из лимита»: сплошным — начислено на сегодня, светлее —
     сколько добавится к концу месяца, чёрточка — лимит. Шкала у каждой
     полосы своя: сравнивают не направления между собой, а каждое со своим
     лимитом. */
  function polosa(seychas, prognoz, limit, krupno) {
    const maks = Math.max(prognoz, limit, 1) * 1.06;
    const pct = (v) => `${Math.min(100, (v / maks) * 100).toFixed(2)}%`;
    const nad = limit > 0 && prognoz > limit;
    return `
      <div class="zpDash__polosa${krupno ? " zpDash__polosa--krupno" : ""}${nad ? " is-over" : ""}">
        <i class="zpDash__prognoz" style="width:${pct(prognoz)}"></i>
        <i class="zpDash__seychas" style="width:${pct(seychas)}"></i>
        ${limit > 0 ? `<span class="zpDash__limit" style="left:${pct(limit)}"></span>` : ""}
      </div>`;
  }

  function stavki(s) {
    if (!s["цель_человек"]) return "";
    return ` · ${s["цель_человек"]} ${slovo(s["цель_человек"], ["ставка", "ставки", "ставок"])} по ШР`
      + (s["цель_вакансий"] ? `, ${s["цель_вакансий"]} ${slovo(s["цель_вакансий"],
        ["вакансия", "вакансии", "вакансий"])}` : "");
  }

  function narisovat(koren, data, sostoyanie = {}) {
    const i = data["итого"] || {};
    const spisok = (data["направления"] || []).filter((s) => s["человек"] || s["цель_фот"]);
    const mozhno = data["можно"] || {};
    const zapas = (i["цель_фот"] || 0) - (i["фот"] || 0);
    const nad = zapas < 0;
    const proshlo = data["норма_дней"] ? (data["прошло_дней"] || 0) / data["норма_дней"] : 0;
    const pravka = !!sostoyanie.pravka;

    koren.innerHTML = `
      <div class="card zpDash">
        <div class="zpDash__head">
          <div>
            <h2>ФОТ за ${esc(mesyacImya(data["месяц"]))}${data["контур"] ? ` · ${esc(data["контур"])}` : ""}</h2>
            <p class="stamp">полный: гросс + взносы 30,2% + резерв отпусков · прошло ${data["прошло_дней"] || 0}
              из ${data["норма_дней"] || 0} рабочих дней${data["обновлено"] ? ` · расчёт ${esc(data["обновлено"])}` : ""}</p>
          </div>
          <div class="zpDash__tools">
            ${mozhno["лимиты"] && !pravka ? "<button class=\"zpView\" type=\"button\" data-dash=\"pravka\">Вписать лимиты</button>" : ""}
            ${mozhno["шр"] && !pravka ? `<label class="zpView zpDash__fayl">Загрузить ШР
              <input type="file" accept=".xlsx,.xls,.csv" data-dash="shr" hidden></label>` : ""}
          </div>
        </div>

        <div class="zpDash__tri">
          <div class="zpDash__kpi">
            <small>выйдет за месяц</small>
            <b>${mln(i["фот"])} <em>млн</em></b>
            <i>${i["человек"] || 0} чел. · начислено на сегодня ${mln(i["начислено_фот"])} млн</i>
          </div>
          <div class="zpDash__kpi">
            <small>лимит${i["вручную"] ? "" : " по ШР"}</small>
            <b>${mln(i["цель_фот"])} <em>млн</em></b>
            <i>${i["цель_человек"] || 0} ${slovo(i["цель_человек"] || 0, ["ставка", "ставки", "ставок"])}${
              i["цель_вакансий"] ? ` · ${i["цель_вакансий"]} ${slovo(i["цель_вакансий"], ["вакансия", "вакансии", "вакансий"])}` : ""}${
              i["вручную"] ? ` · ${i["вручную"]} вписаны руками` : ""}</i>
          </div>
          <div class="zpDash__kpi ${nad ? "is-over" : "is-ok"}">
            <small>${nad ? "перерасход" : "запас"}</small>
            <b>${mln(Math.abs(zapas))} <em>млн</em></b>
            <i>${i["цель_фот"] ? `${(Math.abs(zapas) / i["цель_фот"] * 100).toFixed(1).replace(".", ",")}% лимита` : "лимита нет"}${
              i["цель_фонды"] ? ` · в лимите фонды без людей ${mln(i["цель_фонды"])} млн` : ""}</i>
          </div>
        </div>

        <div class="zpDash__shkala">
          ${polosa(i["начислено_фот"] || 0, i["фот"] || 0, i["цель_фот"] || 0, true)}
          <div class="zpDash__legenda">
            <span><i class="k k--seychas"></i>начислено на сегодня</span>
            <span><i class="k k--prognoz"></i>добавится до конца месяца</span>
            <span><i class="k k--limit"></i>лимит</span>
            <span class="zpDash__temp">прошло ${Math.round(proshlo * 100)}% месяца — начислено
              ${i["фот"] ? Math.round((i["начислено_фот"] || 0) / i["фот"] * 100) : 0}% прогноза</span>
          </div>
        </div>

        <div class="zpDash__napr">
          ${spisok.map((s, n) => {
            const raznica = (s["цель_фот"] || 0) - (s["фот"] || 0);
            const bezLimita = !s["цель_фот"];
            const fondy = s["цель_фонды_список"] || [];
            return `
            <div class="zpDash__row${!bezLimita && raznica < 0 ? " is-over" : ""}" data-nomer="${n}">
              <div class="zpDash__imya">
                <b>${esc(s["направление"])}</b>
                <span>${s["человек"] || 0} чел.${stavki(s)}</span>
              </div>
              ${polosa(s["начислено_фот"] || 0, s["фот"] || 0, s["цель_фот"] || 0)}
              ${pravka ? `
                <label class="zpDash__vvod">
                  <input type="text" inputmode="decimal" data-napr="${esc(s["направление"])}"
                         value="${s["цель_источник"] === "вручную" ? mln(s["цель_фот"]) : ""}"
                         placeholder="${s["цель_шр"] ? mln(s["цель_шр"]) : "нет в ШР"}">
                  <span>млн</span>
                </label>` : `
                <div class="zpDash__cifry">
                  <b>${mln(s["фот"])}</b><span> / ${bezLimita ? "—" : mln(s["цель_фот"])} млн</span>
                  <em class="${bezLimita ? "" : raznica < 0 ? "zpNad" : "zpPod"}">${bezLimita ? "нет в ШР"
                    : (raznica < 0 ? "сверх " : "запас ") + mln(Math.abs(raznica))}</em>
                  ${s["цель_источник"] === "вручную" ? `<small class="zpDash__ruchnoy"
                    title="${esc(`вписал ${s["цель_кто"]} ${s["цель_когда"]}; по ШР ${mln(s["цель_шр"])} млн`)}">вручную</small>` : ""}
                </div>`}
              ${fondy.length && !pravka ? `<p class="zpDash__fondy">в лимите фонды без людей:
                ${fondy.map((f) => `${esc(f["название"])} — ${mln(f["фот"])} млн`).join(" · ")}</p>` : ""}
            </div>`;
          }).join("")}
        </div>

        ${pravka ? `
          <div class="zpDash__pravka">
            <p class="zpShr__note">Лимит на ${esc(mesyacImya(data["месяц"]))}, полный ФОТ в миллионах.
              Пустое поле — лимит по ШР (он серым в поле).</p>
            <button class="zpView zpView--glavnaya" type="button" data-dash="sohranit">Сохранить</button>
            <button class="zpView" type="button" data-dash="otmena">Отмена</button>
            <span class="zpDash__otvet" data-dash="otvet"></span>
          </div>` : ""}

        <div class="zpShr" data-dash="shrOkno" ${sostoyanie.shr ? "" : "hidden"}>${sostoyanie.shr || ""}</div>
      </div>`;
  }

  /* ── загрузка ШР ─────────────────────────────────────────────────────── */

  function predprosmotr(otvet) {
    const napr = otvet["направления"] || [];
    const menyaetsya = (s) => s["было"]["фот"] !== s["стало"]["фот"] || s["оклады"].length
      || s["пришли"].length || s["ушли"].length;
    const stroka = (s) => {
      const b = s["было"];
      const n = s["стало"];
      const d = n["фот"] - b["фот"];
      const chto = [];
      if (s["оклады"].length) {
        chto.push(`оклад меняется у ${s["оклады"].length}: ` + s["оклады"].slice(0, 4)
          .map((o) => `${esc(o["фио"])} ${rub(o["было"])} → ${rub(o["стало"])}`).join("; ")
          + (s["оклады"].length > 4 ? " …" : ""));
      }
      if (s["пришли"].length) chto.push("новые: " + s["пришли"].map(esc).join(", "));
      if (s["ушли"].length) chto.push("уходят из ШР: " + s["ушли"].map(esc).join(", "));
      if (n["фонды"]) chto.push(`в том числе фонды без людей ${mln(n["фонды"])} млн`);
      return `
        <tr>
          <td><input type="checkbox" data-napr="${esc(s["направление"])}" ${menyaetsya(s) ? "checked" : ""}></td>
          <td><b>${esc(s["направление"])}</b>${s["источник_было"].length
            ? `<div class="src">сейчас из: ${s["источник_было"].map(esc).join(", ")}</div>` : "<div class=\"src\">сейчас в ШР нет</div>"}</td>
          <td class="num">${b["людей"] + b["вакансий"]} → <b>${n["людей"] + n["вакансий"]}</b>${
            n["вакансий"] ? `<div class="src">${n["вакансий"]} ${slovo(n["вакансий"], ["вакансия", "вакансии", "вакансий"])}</div>` : ""}</td>
          <td class="num">${mln(b["фот"])} → <b>${mln(n["фот"])}</b>
            <div class="src">${d ? (d > 0 ? "+" : "−") + mln(Math.abs(d)) + " млн" : "без изменений"}</div></td>
          <td class="zpShr__chto">${chto.join("<br>") || "<span class=\"src\">ничего</span>"}</td>
        </tr>`;
    };
    return `
      <div class="zpShr__head">
        <h3>Новое ШР: ${esc(otvet["файл"])}</h3>
        ${otvet["листы"].length > 1 ? `<label>лист
          <select data-dash="list">${otvet["листы"].map((l) => `<option value="${esc(l["лист"])}"${
            l["лист"] === otvet["лист"] ? " selected" : ""}>${esc(l["лист"])}${l["скрыт"] ? " (скрытый)" : ""}</option>`).join("")}
          </select></label>` : ""}
      </div>
      <p class="zpShr__note">Пока не нажмёте «Применить», ничего не меняется. Заменятся только отмеченные
        направления, остальные останутся как были, старое ШР сохранится копией. Из ШР берутся и
        оклады в расчёт зарплат — строки «оклад меняется» про это. Лимит — за ${esc(MESYAC_IM[otvet["месяц"] - 1] || "")}.</p>
      <div class="scroll"><table>
        <thead><tr><th></th><th>Направление</th><th>Ставок</th><th>Лимит, млн</th><th>Что меняется</th></tr></thead>
        <tbody>${napr.map(stroka).join("")}</tbody>
      </table></div>
      ${otvet["не_трогаем"].length ? `<p class="zpShr__note">Этих направлений в файле нет, их не трогаем: ${
        otvet["не_трогаем"].map(esc).join(", ")}</p>` : ""}
      ${otvet["пропущено"]["строк"] ? `<p class="zpShr__note">Пропущено ${otvet["пропущено"]["строк"]} строк с деньгами,
        но без сотрудника (${rub(otvet["пропущено"]["гросс"])} в месяц) — похоже на итоги.</p>` : ""}
      <div class="zpDash__pravka">
        <button class="zpView zpView--glavnaya" type="button" data-dash="primenit">Применить отмеченные</button>
        <button class="zpView" type="button" data-dash="shrOtmena">Отмена</button>
        <span class="zpDash__otvet" data-dash="shrOtvet"></span>
      </div>`;
  }

  /* ── сборка ──────────────────────────────────────────────────────────── */

  function podklyuchit(koren, data) {
    let sostoyanie = {};
    let fayl = null;
    let token = "";

    const perezagruzit = async (sohranit = {}) => {
      const otvet = await fetch("/__fot", { credentials: "same-origin", cache: "no-store" });
      if (otvet.ok) data = await otvet.json();
      sostoyanie = sohranit;
      narisovat(koren, data, sostoyanie);
    };

    const zagruzitShr = async (list) => {
      const okno = koren.querySelector("[data-dash=\"shrOkno\"]");
      okno.hidden = false;
      okno.innerHTML = "<p class=\"stamp\">Разбираю файл…</p>";
      const telo = new FormData();
      telo.append("fayl", fayl);
      if (list) telo.append("list", list);
      try {
        const otvet = await fetch("/__fot/shr", { method: "POST", body: telo, credentials: "same-origin" });
        const razbor = await otvet.json().catch(() => ({}));
        if (!otvet.ok) throw new Error(razbor.error || otvet.status);
        token = razbor["токен"];
        sostoyanie = { shr: predprosmotr(razbor) };
        narisovat(koren, data, sostoyanie);
        koren.querySelector("[data-dash=\"shrOkno\"]").scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (oshibka) {
        okno.innerHTML = `<p class="message error">Не разобрал файл: ${esc(String(oshibka.message || oshibka))}</p>`;
      }
    };

    koren.addEventListener("click", async (event) => {
      const knopka = event.target.closest("[data-dash]");
      if (!knopka || knopka.tagName === "INPUT" || knopka.tagName === "SELECT") return;
      const chto = knopka.dataset.dash;
      if (chto === "pravka") {
        sostoyanie = { ...sostoyanie, pravka: true };
        narisovat(koren, data, sostoyanie);
        koren.querySelector(".zpDash__vvod input")?.focus();
      } else if (chto === "otmena") {
        sostoyanie = { ...sostoyanie, pravka: false };
        narisovat(koren, data, sostoyanie);
      } else if (chto === "sohranit") {
        const otvetEl = koren.querySelector("[data-dash=\"otvet\"]");
        const napravleniya = new Map((data["направления"] || []).map((s) => [s["направление"], s]));
        const limity = [];
        for (const pole of koren.querySelectorAll(".zpDash__vvod input")) {
          const s = napravleniya.get(pole.dataset.napr);
          const tekst = pole.value.replace(/\s/g, "").replace(",", ".");
          const bylo = s && s["цель_источник"] === "вручную" ? s["цель_фот"] : 0;
          const stalo = tekst ? Math.round(Number(tekst) * 1e6) : 0;
          if (tekst && !(stalo > 0)) {
            otvetEl.textContent = `«${pole.value}» — не число`;
            pole.focus();
            return;
          }
          if (Math.abs(stalo - bylo) > 1) limity.push({ "направление": pole.dataset.napr, "фот": stalo || "" });
        }
        if (!limity.length) {
          sostoyanie = { ...sostoyanie, pravka: false };
          narisovat(koren, data, sostoyanie);
          return;
        }
        otvetEl.textContent = "Сохраняю…";
        const otvet = await fetch("/__fot/limity", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "месяц": data["месяц"], "лимиты": limity }),
        });
        if (!otvet.ok) {
          otvetEl.textContent = "Не сохранилось: " + ((await otvet.json().catch(() => ({}))).error || otvet.status);
          return;
        }
        await perezagruzit({});
      } else if (chto === "shrOtmena") {
        fayl = null;
        token = "";
        sostoyanie = {};
        narisovat(koren, data, sostoyanie);
      } else if (chto === "primenit") {
        const vybrano = [...koren.querySelectorAll(".zpShr input[type=checkbox]:checked")]
          .map((pole) => pole.dataset.napr);
        const otvetEl = koren.querySelector("[data-dash=\"shrOtvet\"]");
        if (!vybrano.length) {
          otvetEl.textContent = "Не отмечено ни одного направления";
          return;
        }
        otvetEl.textContent = "Применяю…";
        const otvet = await fetch("/__fot/shr/primenit", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "токен": token, "направления": vybrano }),
        });
        const itog = await otvet.json().catch(() => ({}));
        if (!otvet.ok) {
          otvetEl.textContent = "Не применилось: " + (itog.error || otvet.status);
          return;
        }
        fayl = null;
        token = "";
        await perezagruzit({ shr: `<p class="message ok">ШР обновлено: ${itog["направления"].map(esc).join(", ")}
          — ${itog["позиций"]} позиций. Лимиты уже новые; оклады в расчёте зарплат пересчитываются,
          это около минуты.</p>` });
      }
    });

    koren.addEventListener("change", (event) => {
      const pole = event.target;
      if (pole.dataset.dash === "shr" && pole.files && pole.files[0]) {
        fayl = pole.files[0];
        zagruzitShr(null);
      } else if (pole.dataset.dash === "list" && fayl) {
        zagruzitShr(pole.value);
      }
    });

    koren.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.closest(".zpDash__vvod")) {
        koren.querySelector("[data-dash=\"sohranit\"]")?.click();
      }
    });

    narisovat(koren, data, sostoyanie);
  }

  window.ZpSvodka = { podklyuchit };
})();
