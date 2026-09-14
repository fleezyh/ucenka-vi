(() => {
  "use strict";

  /* Аналитика ФОТ для руководителя. Данные — агрегаты из /__fot: направления,
     отделы, месяцы. Пофамильных зарплат здесь нет, они в панели. */
  const $ = (id) => document.getElementById(id);
  const message = $("message");

  const rubli = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU") + " ₽";
  const mln = (v) => (Number(v) || 0) / 1e6;
  const mlnTxt = (v) => mln(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " млн";

  const MESYACY = ["янв", "фев", "мар", "апр", "май", "июн",
                   "июл", "авг", "сен", "окт", "ноя", "дек"];

  function podpisMesyaca(iso) {
    const [god, mesyac] = String(iso || "").split("-");
    return `${MESYACY[Number(mesyac) - 1] || iso} ${String(god).slice(2)}`;
  }

  function say(text, klass = "") {
    message.textContent = text;
    message.className = `message${klass ? " " + klass : ""}`;
    message.style.display = text ? "block" : "none";
  }

  let raskryto = "";

  /* ── Итоги ─────────────────────────────────────────────────────────── */
  function itogi(data) {
    const i = data["итого"];
    const zapas = i["цель_фот"] - i["фот"];
    const vyshe = zapas < 0;
    $("itogo").innerHTML = [
      { b: mlnTxt(i["фот"]), s: "полный ФОТ месяца", i: "прогноз со взносами и резервом" },
      { b: mlnTxt(i["цель_фот"]), s: "цель по ШР", i: `на ${i["цель_человек"]} позиций` },
      { b: (vyshe ? "+" : "−") + mlnTxt(Math.abs(zapas)), s: vyshe ? "сверх цели" : "запас до цели",
        klass: vyshe ? "is-over" : "is-ok", i: vyshe ? "перерасход" : "укладываемся" },
      { b: `${i["человек"]} / ${i["цель_человек"]}`, s: "людей против ставок",
        i: i["человек"] < i["цель_человек"] ? `недобор ${i["цель_человек"] - i["человек"]}` : "полный штат" },
      { b: mlnTxt(i["гросс"]), s: "подадим в 1С", i: "гросс, без взносов" },
    ].map((k) => `<article class="fotCard ${k.klass || ""}">
        <b>${k.b}</b><span>${k.s}</span><i>${k.i}</i></article>`).join("");
    $("itogo").hidden = false;
  }

  /* ── Динамика по месяцам ───────────────────────────────────────────── */
  function dinamika(data) {
    const ryad = data["по_месяцам"];
    if (!ryad || !(ryad["точки"] || []).length) { $("dinamika").hidden = true; return; }
    const tochki = ryad["точки"];
    const max = Math.max(...tochki.map((t) => Math.max(t["фот"] || 0, t["цель"] || 0)), 1);

    const holst = document.createElement("div");
    holst.className = "fotBars";
    tochki.forEach((t) => {
      const vysota = Math.max(4, Math.round((t["фот"] / max) * 150));
      const celVysota = t["цель"] ? Math.round((t["цель"] / max) * 150) : 0;
      const stolb = document.createElement("div");
      stolb.className = "fotBar" + (t["вид"] === "прогноз" ? " fotBar--prognoz" : "");
      stolb.innerHTML =
        `<b>${mlnTxt(t["фот"])}</b>`
        + `<div class="fotBar__stakan">`
        + (celVysota ? `<i class="fotBar__cel" style="height:${celVysota}px" title="цель ${rubli(t["цель"])}"></i>` : "")
        + `<i class="fotBar__telo" style="height:${vysota}px"></i></div>`
        + `<em>${podpisMesyaca(t["месяц"])}<small>${t["человек"]} чел.</small></em>`;
      stolb.title = `${podpisMesyaca(t["месяц"])}: ${rubli(t["фот"])}, ${t["человек"]} человек`
        + (t["вид"] === "прогноз" ? " — прогноз" : "");
      holst.appendChild(stolb);
    });
    $("dinamikaHolst").innerHTML = "";
    $("dinamikaHolst").appendChild(holst);
    $("dinamikaNote").textContent =
      `${ryad["направление"]}. Факт из бухгалтерской выгрузки «Анализ ЗП», последний столбик — прогноз текущего месяца, пунктиром цель по ШР.`;
    $("dinamika").hidden = false;
  }

  /* ── Направления и отделы ──────────────────────────────────────────── */
  function polosa(fot, cel, max) {
    const vyshe = cel && fot > cel;
    return `<div class="fotPolosa">
        <i class="fotPolosa__cel" style="width:${((cel || 0) / max * 100).toFixed(1)}%"></i>
        <i class="fotPolosa__fakt ${vyshe ? "is-over" : ""}" style="width:${(fot / max * 100).toFixed(1)}%"></i>
      </div>`;
  }

  function napravleniya(data) {
    const spisok = data["направления"] || [];
    const max = Math.max(...spisok.map((s) => Math.max(s["фот"], s["цель_фот"])), 1);

    $("naprSpisok").innerHTML = spisok.map((s) => {
      const otklonenie = s["фот"] - s["цель_фот"];
      const otkryt = raskryto === s["направление"];
      const maksOtdel = Math.max(...s["отделы"].map((o) => o["фот"]), 1);
      const celiOtdelov = new Map((s["цель_отделы"] || []).map((o) => [o["отдел"], o]));
      return `
        <div class="fotRow${otkryt ? " is-open" : ""}" data-napr="${s["направление"].replace(/"/g, "&quot;")}">
          <div class="fotRow__imya">
            <b>${s["отделы"].length > 1 ? (otkryt ? "▾ " : "▸ ") : ""}${s["направление"]}</b>
            <span>${s["человек"]} чел.${s["цель_человек"] && s["цель_человек"] !== s["человек"]
              ? ` · по ШР ${s["цель_человек"]}` : ""}${s["отсутствуют"]
              ? ` · ${s["отсутствуют"]} в отсутствии` : ""}</span>
          </div>
          ${polosa(s["фот"], s["цель_фот"], max)}
          <div class="fotRow__cifry">
            <span>${mlnTxt(s["цель_фот"])}<i>цель ШР</i></span>
            <span><b>${mlnTxt(s["фот"])}</b><i>прогноз</i></span>
            <span class="${otklonenie > 0 ? "fotNad" : "fotPod"}">
              ${otklonenie > 0 ? "+" : "−"}${mlnTxt(Math.abs(otklonenie))}<i>${
                otklonenie > 0 ? "сверх цели" : "запас"}</i></span>
          </div>
        </div>
        ${otkryt ? `<div class="fotOtdely">${s["отделы"].map((o) => {
          const cel = celiOtdelov.get(o["отдел"]);
          return `<div class="fotOtdel">
              <div class="fotOtdel__imya">${o["отдел"]}<span>${o["человек"]} чел.</span></div>
              ${polosa(o["фот"], cel ? cel["фот"] : 0, maksOtdel)}
              <div class="fotOtdel__cifry">${mlnTxt(o["фот"])}${cel
                ? ` <i>из ${mlnTxt(cel["фот"])} по ШР</i>` : " <i>в ШР не нашёлся</i>"}</div>
            </div>`;
        }).join("")}</div>` : ""}`;
    }).join("");

    $("naprSpisok").querySelectorAll(".fotRow").forEach((row) => {
      row.addEventListener("click", () => {
        raskryto = raskryto === row.dataset.napr ? "" : row.dataset.napr;
        napravleniya(data);
      });
    });
    $("napravleniya").hidden = false;
  }

  /* ── Структура ─────────────────────────────────────────────────────── */
  function struktura(data) {
    const i = data["итого"];
    const chasti = [
      { imya: "Оклады", summa: i["оклады"], cvet: "var(--blue)" },
      { imya: "Премии", summa: i["премии"], cvet: "#7ee2a8" },
      { imya: "Взносы в фонды", summa: i["взносы"], cvet: "#f5ad32" },
      { imya: "Резерв отпусков", summa: i["резерв"], cvet: "#c38cf0" },
    ];
    const vsego = chasti.reduce((s, c) => s + c.summa, 0) || 1;
    $("strukturaHolst").innerHTML = `
      <div class="fotStack">${chasti.map((c) => `
        <i style="width:${(c.summa / vsego * 100).toFixed(1)}%;background:${c.cvet}"
           title="${c.imya}: ${rubli(c.summa)}"></i>`).join("")}</div>
      <div class="fotLegenda">${chasti.map((c) => `
        <span><i style="background:${c.cvet}"></i>${c.imya}
          <b>${mlnTxt(c.summa)}</b>
          <em>${Math.round(c.summa / vsego * 100)}%</em></span>`).join("")}</div>`;
    $("struktura").hidden = false;
  }

  fetch("/__fot", { cache: "no-store" })
    .then((r) => {
      if (r.status === 403) throw new Error("нет доступа");
      return r.ok ? r.json() : Promise.reject(new Error(String(r.status)));
    })
    .then((data) => {
      say("");
      $("stamp").textContent = `${data["месяц"]} · ${data["прошло_дней"]} из ${data["норма_дней"]} дней`
        + (data["контур"] ? ` · контур ${data["контур"]}` : "");
      itogi(data);
      dinamika(data);
      napravleniya(data);
      struktura(data);
    })
    .catch((oshibka) => say(String(oshibka).includes("доступа")
      ? "Раздел открыт тем, кто подаёт зарплату. Если он нужен вам — напишите Степану."
      : "Не получилось загрузить. Обновите страницу через минуту.", "error"));
})();
