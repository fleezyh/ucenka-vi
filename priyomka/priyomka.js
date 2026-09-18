/* Монитор приёмки и размещения ДМД.
 *
 * Задача со встречи 11.09.2026: показать, где на складе пробка, а не где
 * «операция завершена». Первая итерация — заполненность мест по секторам.
 *
 * Два правила из ТЗ, которые здесь главные:
 *   цвет агрегата = цвет худшего элемента, иначе проблема тонет в среднем;
 *   drill-down обязателен: сектор разворачивается до своих зон.
 */
(() => {
  "use strict";

  const DATA = "../data/priyomka.json";

  const CVETA = {
    "красный": { podpis: "мест нет", klass: "pr--krasnyy" },
    "жёлтый": { podpis: "на пределе", klass: "pr--zhyoltyy" },
    "зелёный": { podpis: "норма", klass: "pr--zelyonyy" },
    "недогруз": { podpis: "недозагружен", klass: "pr--nedogruz" },
    "нет данных": { podpis: "нет мест в системе", klass: "pr--net" },
    "нет мест": { podpis: "нет мест в системе", klass: "pr--net" },
  };

  const el = (id) => document.getElementById(id);
  const chislo = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const escape = (text) => String(text ?? "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  let dannye = null;
  let filtr = null;

  function plitka(zagolovok, znachenie, podpis, klass) {
    return `<article class="prPlitka ${klass || ""}">
      <p class="prPlitka__zag">${escape(zagolovok)}</p>
      <p class="prPlitka__znak">${escape(znachenie)}</p>
      <p class="prPlitka__pod">${escape(podpis)}</p>
    </article>`;
  }

  function narisovatPlitki() {
    const sektory = dannye.секторы || [];
    const schet = (cvet) => sektory.filter((s) => s.цвет === cvet).length;
    // Сортировка уже по занятости мест хранения, поэтому худший — первый
    // с посчитанным процентом. Служебные зоны в этот счёт не входят.
    const hudshiy = sektory.find((s) => s.процент_хранения !== null
                                     && s.процент_хранения !== undefined);
    const mestHr = sektory.reduce((sum, s) => sum + (s.мест_хранения || 0), 0);
    const zanyatoHr = sektory.reduce((sum, s) => sum + (s.занято_хранения || 0), 0);
    const procentHr = mestHr ? (100 * zanyatoHr / mestHr) : 0;

    el("prPlitki").innerHTML = [
      plitka("Мест нет", schet("красный"), `секторов из ${sektory.length}`, "pr--krasnyy"),
      plitka("На пределе", schet("жёлтый"), "секторов подходят к потолку", "pr--zhyoltyy"),
      plitka("Хуже всех", hudshiy ? hudshiy.сектор.replace(/^\d+\s*/, "") : "—",
             hudshiy ? `${hudshiy.процент_хранения}% мест хранения занято` : "", "pr--krasnyy"),
      plitka("Места хранения", `${procentHr.toFixed(1)}%`,
             `${chislo(zanyatoHr)} из ${chislo(mestHr)} · служебные не в счёт`),
    ].join("");
    el("prPlitki").hidden = false;
  }

  function narisovatFiltry() {
    const sektory = dannye.секторы || [];
    // «Нет данных» тоже нужен отдельной кнопкой: это три десятка зон, где
    // мест в системе нет вовсе, и в общем списке они только мешают.
    const poryadok = ["красный", "жёлтый", "зелёный", "недогруз", "нет данных"];
    const knopki = [`<button class="prFiltr${filtr === null ? " is-on" : ""}" type="button"
      data-cvet="">все · ${sektory.length}</button>`];
    poryadok.forEach((cvet) => {
      const skolko = sektory.filter((s) => s.цвет === cvet).length;
      if (!skolko) return;
      knopki.push(`<button class="prFiltr ${CVETA[cvet].klass}${filtr === cvet ? " is-on" : ""}"
        type="button" data-cvet="${cvet}">${CVETA[cvet].podpis} · ${skolko}</button>`);
    });
    el("prFilters").innerHTML = knopki.join("");
  }

  function stroka(sektor, nomer) {
    const cvet = CVETA[sektor.цвет] || CVETA["нет данных"];
    return `<div class="prRow ${cvet.klass}" data-nomer="${nomer}">
      <div class="prRow__cvet" title="${escape(cvet.podpis)}"></div>
      <div class="prRow__imya">
        <b>${escape(sektor.сектор)}</b>
        <i>${escape(sektor.блок)}</i>
      </div>
      <div class="prRow__chislo">
        <b>${sektor.процент_хранения == null ? "—" : sektor.процент_хранения + "%"}</b>
        <i>места хранения</i>
      </div>
      <div class="prRow__zona">${escape(sektor.худшая_зона || "—")}</div>
      <div class="prRow__chislo">
        <b>${chislo(sektor.занято_хранения)}</b>
        <i>из ${chislo(sektor.мест_хранения)} мест</i>
      </div>
      <div class="prRow__chislo">
        <b>${chislo(sektor.штук)}</b>
        <i>штук</i>
      </div>
      <div class="prRow__znak">▾</div>
    </div>`;
  }

  function zonyHtml(sektor) {
    const zony = (sektor.зоны || []).filter((z) => z.мест || z.штук);
    if (!zony.length) return `<div class="prZony"><p class="prHint">Зон с местами нет</p></div>`;
    const rows = zony.map((z) => {
      const cvet = CVETA[z.цвет] || CVETA["нет данных"];
      // У приёмки и разгрузки занятость не значит ничего: товар стоит на полу
      // и в системе не оприходован. Показываем, но цветом не пугаем.
      const vne = z.хранение === false;
      return `<tr class="${vne ? "prVne" : ""}">
        <td><span class="prTochka ${vne ? "pr--net" : cvet.klass}"></span>${escape(z.зона)}</td>
        <td class="prNum">${escape(z.назначение)}</td>
        <td class="prNum">${z.мест ? chislo(z.мест) : "—"}</td>
        <td class="prNum">${z.мест ? chislo(z.занято) : "—"}</td>
        <td class="prNum"><b>${z.мест ? z.процент + "%" : "—"}</b></td>
        <td class="prNum">${chislo(z.штук)}</td>
        <td class="prNum">${chislo(z.контейнеров)}</td>
      </tr>`;
    }).join("");
    return `<div class="prZony"><table>
      <thead><tr><th>Зона</th><th>Назначение</th><th>Мест</th><th>Занято</th>
        <th>Заполнено</th><th>Штук</th><th>Контейнеров</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function narisovatTablicu() {
    const sektory = (dannye.секторы || [])
      .filter((s) => !filtr || s.цвет === filtr);
    el("prTable").innerHTML = sektory.length
      ? sektory.map((s, i) => stroka(s, i)).join("")
      : `<p class="prHint">Таких секторов нет</p>`;
    el("prPanel").hidden = false;
  }

  function razvernut(row) {
    const otkryta = row.nextElementSibling
      && row.nextElementSibling.classList.contains("prZony");
    document.querySelectorAll(".prZony").forEach((z) => z.remove());
    document.querySelectorAll(".prRow.is-open").forEach((r) => r.classList.remove("is-open"));
    if (otkryta) return;
    const sektory = (dannye.секторы || []).filter((s) => !filtr || s.цвет === filtr);
    const sektor = sektory[Number(row.dataset.nomer)];
    if (!sektor) return;
    row.classList.add("is-open");
    row.insertAdjacentHTML("afterend", zonyHtml(sektor));
  }

  async function start() {
    let otvet;
    try {
      otvet = await fetch(DATA, { cache: "no-cache" });
      if (!otvet.ok) throw new Error(String(otvet.status));
      dannye = await otvet.json();
    } catch {
      el("message").textContent = "Монитор ещё не собран";
      return;
    }
    el("message").hidden = true;
    el("stamp").textContent = `${dannye.склад} · обновлено ${dannye.обновлено}`;

    narisovatPlitki();
    narisovatFiltry();
    narisovatTablicu();

    const p = dannye.пороги || {};
    el("prNote").textContent =
      `Заполненность считается по локациям, а не по объёму: корректных ВГХ нет, `
      + `и «в кубах» посчитать нечем. Пороги: до ${p.недогруз}% склад недозагружен, `
      + `${p.недогруз}–${p.норма}% норма, ${p.норма}–${p.тревога}% на пределе, `
      + `выше ${p.тревога}% мест нет. Зоны приёмки, разгрузки и поступления показаны серым: `
      + `там занятость ничего не значит — товар стоит в проездах и в системе не оприходован, `
      + `поэтому приёмка выглядит пустой даже когда она встала.`;

    el("prTable").addEventListener("click", (event) => {
      const row = event.target.closest(".prRow");
      if (row) razvernut(row);
    });
    el("prFilters").addEventListener("click", (event) => {
      const knopka = event.target.closest(".prFiltr");
      if (!knopka) return;
      filtr = knopka.dataset.cvet || null;
      narisovatFiltry();
      narisovatTablicu();
    });
  }

  start();
})();
