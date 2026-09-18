/* CRM продаж: простыня лотов и счетов, создание и правка лота.
 *
 * Данные приходят одним куском (около двух тысяч строк) и фильтруются на
 * странице: так фильтры срабатывают мгновенно и не дёргают сервер на каждый
 * чих. Когда лотов станет десятки тысяч — переедем на серверную выборку,
 * ручка уже умеет фильтры.
 */
(() => {
  "use strict";

  const DATA = "/__crm";

  // Воронка. Порядок важен: по нему строится и фильтр, и сортировка статусов.
  const VORONKA = [
    "1. Лот размещается", "2. Торги", "3. Согласование", "4. Выбран КА",
    "5. Подготовка счетов", "6. Счета выставлены", "7. Оплачен",
    "8. Отгружен физически", "9. Отгружен(системно)", "10.Отгружен ФИЗ и СИСТ",
    "Снят с торгов",
  ];

  // Поля, которые человек заполняет руками при заведении лота.
  const POLYA_FORMY = [
    { pole: "nomer", imya: "№ лота", nuzhno: true },
    { pole: "data_vystavleniya", imya: "Дата выставления", tip: "date" },
    { pole: "menedzher", imya: "Менеджер" },
    { pole: "ka", imya: "Контрагент" },
    { pole: "ploshchadka", imya: "Площадка", spisok: ["Bidzaar", "Почта", "Авито", "B2B-center"] },
    { pole: "status", imya: "Статус", spisok: VORONKA },
    { pole: "region", imya: "Регион" },
    { pole: "kategoriya", imya: "Категория" },
    { pole: "mesyac_otgruzki", imya: "Месяц отгрузки" },
    { pole: "nedelya_plan", imya: "Неделя отгрузки (план)" },
    { pole: "cena_otgruzki", imya: "Цена отгрузки с НДС", tip: "number" },
    { pole: "cena_sbs", imya: "Себестоимость с НДС", tip: "number" },
    { pole: "startovaya_cena", imya: "Стартовая цена", tip: "number" },
    { pole: "pallet", imya: "Паллет", tip: "number" },
    { pole: "tovarov", imya: "Товаров", tip: "number" },
    { pole: "rrc", imya: "РРЦ", tip: "number" },
    { pole: "zakupochnaya", imya: "Закупочная", tip: "number" },
    { pole: "data_oplaty", imya: "Дата оплаты", tip: "date" },
    { pole: "kommentariy", imya: "Комментарий", shirokoe: true },
  ];

  // Колонки простыни: что показываем в таблице лотов.
  const STOLBCY = [
    { pole: "nomer", imya: "Лот", shirina: 70 },
    { pole: "data_vystavleniya", imya: "Выставлен", tip: "data", shirina: 92 },
    { pole: "menedzher", imya: "Менеджер", shirina: 130 },
    { pole: "ka", imya: "Контрагент", shirina: 170 },
    { pole: "ploshchadka", imya: "Площадка", shirina: 90 },
    { pole: "status", imya: "Статус", tip: "status", shirina: 175 },
    { pole: "cena_otgruzki", imya: "Цена", tip: "dengi", shirina: 105 },
    { pole: "cena_sbs", imya: "Себестоимость", tip: "dengi", shirina: 115 },
    { pole: "okup", imya: "Окуп", tip: "dolya", shirina: 70 },
    { pole: "pallet", imya: "Паллет", tip: "chislo", shirina: 70 },
    { pole: "tovarov", imya: "Товаров", tip: "chislo", shirina: 72 },
    { pole: "kommentariy", imya: "Комментарий", shirina: 0 },
  ];

  const STOLBCY_SCHETOV = [
    { pole: "lot", imya: "Лот", shirina: 70 },
    { pole: "data_zaprosa", imya: "Запрос", tip: "data", shirina: 92 },
    { pole: "menedzher", imya: "Менеджер", shirina: 130 },
    { pole: "ka", imya: "Контрагент", shirina: 160 },
    { pole: "prioritet", imya: "Приоритет", shirina: 90 },
    { pole: "operator", imya: "Оператор", shirina: 130 },
    { pole: "status_operatora", imya: "Статус", tip: "status", shirina: 150 },
    { pole: "data_gotovnosti", imya: "Готов", tip: "data", shirina: 92 },
    { pole: "cena_otgruzki", imya: "Цена", tip: "dengi", shirina: 105 },
    { pole: "okup", imya: "Окуп", tip: "dolya", shirina: 70 },
  ];

  // Поля, которые правятся прямо в таблице. Остальные (окуп, например)
  // считаются и руками не трогаются.
  const PRAVIMYE = {
    nomer: {}, menedzher: {}, ka: {}, region: {}, kategoriya: {},
    mesyac_otgruzki: {}, nedelya_plan: {}, kommentariy: {},
    ploshchadka: { spisok: ["Bidzaar", "Почта", "Авито", "B2B-center"] },
    status: { spisok: null },                       // подставим воронку ниже
    data_vystavleniya: { tip: "date" }, data_oplaty: { tip: "date" },
    cena_otgruzki: { tip: "number" }, cena_sbs: { tip: "number" },
    startovaya_cena: { tip: "number" }, pallet: { tip: "number" },
    tovarov: { tip: "number" }, rrc: { tip: "number" }, zakupochnaya: { tip: "number" },
  };

  const el = (id) => document.getElementById(id);
  const escape = (t) => String(t ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chislo = (v) => v === null || v === undefined || v === ""
    ? "" : Math.round(Number(v) || 0).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
  const dolya = (v) => v === null || v === undefined || v === ""
    ? "" : (Number(v) * 100).toFixed(0) + "%";
  const data = (v) => !v ? "" : String(v).slice(0, 10).split("-").reverse().join(".");

  PRAVIMYE.status.spisok = VORONKA;

  let dannye = null;
  let vid = "loty";
  let filtry = {};
  let poisk = "";

  function stroki() {
    return (vid === "loty" ? dannye.лоты : dannye.счета) || [];
  }

  function stolbcy() {
    return vid === "loty" ? STOLBCY : STOLBCY_SCHETOV;
  }

  // Статус красим по месту в воронке: снятое серым, отгруженное зелёным,
  // всё, что посередине, — жёлтым. Это то, что требует внимания.
  function klassStatusa(status) {
    const s = String(status || "");
    if (!s) return "crm--net";
    if (s.startsWith("Снят")) return "crm--snyat";
    if (/^(8|9|10)\./.test(s) || s.startsWith("10")) return "crm--gotovo";
    if (s === "Счет выставлен") return "crm--gotovo";
    if (s === "Отмена") return "crm--snyat";
    return "crm--v-rabote";
  }

  function podhodit(z) {
    for (const [pole, znachenie] of Object.entries(filtry)) {
      if (!znachenie) continue;
      if (String(z[pole] || "") !== znachenie) return false;
    }
    if (poisk) {
      const seno = [z.nomer, z.lot, z.ka, z.kommentariy, z.menedzher, z.operator,
                    z.kategoriya, z.nomera_zakazov].join(" ").toLowerCase();
      if (!seno.includes(poisk)) return false;
    }
    return true;
  }

  // Период, за который есть лоты: по крайним непустым датам.
  function period(loty) {
    const daty = loty.map((z) => z.data_vystavleniya).filter(Boolean).sort();
    return daty.length ? `${data(daty[0])} — ${data(daty.at(-1))}` : "";
  }

  function narisovatPlitki() {
    const loty = dannye.лоты || [];
    const otgruzheno = loty.filter((z) => String(z.status || "").startsWith("10"));
    const snyato = loty.filter((z) => String(z.status || "").startsWith("Снят"));
    const v_rabote = loty.filter((z) => {
      const s = String(z.status || "");
      return s && !s.startsWith("10") && !s.startsWith("Снят");
    });
    const summa = otgruzheno.reduce((n, z) => n + (Number(z.cena_otgruzki) || 0), 0);
    const okupy = otgruzheno.map((z) => Number(z.okup) || 0).filter((x) => x > 0);
    const sredniy = okupy.length ? okupy.reduce((a, b) => a + b, 0) / okupy.length : 0;

    const plitka = (zag, znak, pod, klass) => `<article class="crmPlitka ${klass || ""}">
      <p class="crmPlitka__zag">${escape(zag)}</p>
      <p class="crmPlitka__znak">${escape(znak)}</p>
      <p class="crmPlitka__pod">${escape(pod)}</p></article>`;

    el("crmPlitki").innerHTML = [
      plitka("Всего лотов", chislo(loty.length), period(loty)),
      plitka("В работе", chislo(v_rabote.length), "не отгружены и не сняты", "crm--v-rabote"),
      plitka("Отгружено", chislo(otgruzheno.length), `на ${chislo(summa)} ₽`, "crm--gotovo"),
      plitka("Снято с торгов", chislo(snyato.length),
             `${Math.round(100 * snyato.length / (loty.length || 1))}% всех лотов`, "crm--snyat"),
      plitka("Средний окуп", dolya(sredniy), "по отгруженным"),
    ].join("");
    el("crmPlitki").hidden = false;
  }

  function narisovatFiltry() {
    const pole = vid === "loty" ? "status" : "status_operatora";
    const spisok = [...new Set(stroki().map((z) => z[pole]).filter(Boolean))];
    if (vid === "loty") {
      spisok.sort((a, b) => VORONKA.indexOf(a) - VORONKA.indexOf(b));
    }
    const knopka = (znachenie, podpis, skolko) =>
      `<button class="crmFiltr ${znachenie ? klassStatusa(znachenie) : ""}${
        (filtry[pole] || "") === znachenie ? " is-on" : ""}" type="button"
        data-pole="${pole}" data-znachenie="${escape(znachenie)}">${escape(podpis)}${
        skolko === undefined ? "" : ` · ${skolko}`}</button>`;

    const vsego = stroki().length;
    el("crmFiltry").innerHTML = knopka("", "все", vsego)
      + spisok.map((s) => knopka(s, s.replace(/^\d+\.\s*/, ""),
                                 stroki().filter((z) => z[pole] === s).length)).join("");
  }

  function narisovatTablicu() {
    const vidimye = stroki().filter(podhodit);
    const kol = stolbcy();
    const shapka = kol.map((s) =>
      `<th${s.shirina ? ` style="width:${s.shirina}px"` : ""}>${escape(s.imya)}</th>`).join("");
    const mozhno = vid === "loty";
    const telo = vidimye.slice(0, 600).map((z, nomer) => {
      const yachejki = kol.map((s) => {
        const v = z[s.pole];
        const pravimo = mozhno && PRAVIMYE[s.pole];
        const meta = pravimo ? ` data-pole="${s.pole}" class="crmPravka` : ' class="';
        const chislovoe = s.tip === "dengi" || s.tip === "chislo"
                       || s.tip === "dolya" || s.tip === "data";
        const klass = `${meta}${chislovoe ? " crmNum" : ""}"`;
        if (s.tip === "dengi" || s.tip === "chislo") return `<td${klass}>${chislo(v)}</td>`;
        if (s.tip === "dolya") return `<td${klass}>${dolya(v)}</td>`;
        if (s.tip === "data") return `<td${klass}>${data(v)}</td>`;
        if (s.tip === "status") {
          return `<td${klass}><span class="crmStatus ${klassStatusa(v)}">${
            escape(v || "—")}</span></td>`;
        }
        return `<td${klass}>${escape(v || "")}</td>`;
      }).join("");
      return `<tr data-nomer="${nomer}" data-id="${z.id || ""}">${yachejki}</tr>`;
    }).join("");

    el("crmSchyot").textContent = vidimye.length > 600
      ? `Показаны первые 600 из ${vidimye.length}`
      : `Строк: ${vidimye.length}`;
    el("crmTabl").innerHTML = `<table><thead><tr>${shapka}</tr></thead><tbody>${telo}</tbody></table>`;

    el("crmTabl").querySelectorAll("tbody tr").forEach((tr) => {
      tr.addEventListener("click", (event) => {
        const td = event.target.closest("td");
        const zapis = vidimye[Number(tr.dataset.nomer)];
        if (td && td.dataset.pole && mozhno) {
          nachatPravku(td, zapis);
        } else {
          otkrytKartochku(zapis);
        }
      });
    });
  }

  // Правка прямо в ячейке: Enter сохраняет, Escape отменяет, уход мышью
  // тоже сохраняет — так работают таблицы, к которым все привыкли.
  function nachatPravku(td, zapis) {
    if (td.querySelector("input, select")) return;
    const pole = td.dataset.pole;
    const opisanie = PRAVIMYE[pole] || {};
    const bylo = zapis[pole] == null ? "" : String(zapis[pole]);
    const shirina = td.offsetWidth;
    td.classList.add("is-pravka");

    const vvod = opisanie.spisok
      ? document.createElement("select")
      : document.createElement("input");
    if (opisanie.spisok) {
      vvod.innerHTML = '<option value=""></option>' + opisanie.spisok
        .map((s) => `<option${s === bylo ? " selected" : ""}>${escape(s)}</option>`).join("");
    } else {
      vvod.type = opisanie.tip || "text";
      vvod.value = opisanie.tip === "date" ? bylo.slice(0, 10) : bylo;
    }
    vvod.style.width = Math.max(90, shirina - 14) + "px";
    td.textContent = "";
    td.appendChild(vvod);
    vvod.focus();
    if (vvod.select) vvod.select();

    let zakryto = false;
    const zavershit = async (sohranyat) => {
      if (zakryto) return;
      zakryto = true;
      const stalo = vvod.value.trim();
      td.classList.remove("is-pravka");
      if (!sohranyat || stalo === bylo) {
        narisovatTablicu();
        return;
      }
      td.classList.add("is-sohranyaetsya");
      try {
        const otvet = await fetch("/__crm/lot", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: zapis.id,
            nomer: zapis.nomer,
            [pole]: stalo === "" ? null
                  : (opisanie.tip === "number" ? Number(stalo) : stalo),
          }),
        });
        const itog = await otvet.json();
        if (!otvet.ok) throw new Error(itog.ошибка || "не сохранилось");
        Object.assign(zapis, itog);
        narisovatPlitki();
        narisovatTablicu();
      } catch (e) {
        td.classList.remove("is-sohranyaetsya");
        td.classList.add("is-oshibka");
        td.textContent = String(e.message || e);
      }
    };

    vvod.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); zavershit(true); }
      if (event.key === "Escape") { event.preventDefault(); zavershit(false); }
    });
    vvod.addEventListener("blur", () => zavershit(true));
    vvod.addEventListener("click", (event) => event.stopPropagation());
  }

  function polyaKartochki(z) {
    const vse = vid === "loty"
      ? POLYA_FORMY.map((p) => [p.imya, z[p.pole]])
      : Object.entries(z).filter(([k]) => k !== "id");
    return vse.filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([imya, v]) => `<div class="crmStroka"><span>${escape(imya)}</span>
        <b>${escape(typeof v === "object" ? JSON.stringify(v) : v)}</b></div>`).join("");
  }

  function otkrytKartochku(z) {
    if (!z) return;
    const zag = vid === "loty" ? `Лот ${z.nomer || "—"}` : `Счёт по лоту ${z.lot || "—"}`;
    el("crmOknoDoc").innerHTML = `
      <div class="crmOkno__top">
        <span class="crmOkno__teg">${escape(vid === "loty" ? "Лот" : "Счёт")}</span>
        <div class="crmOkno__act">
          ${vid === "loty" ? '<button class="crmKn" type="button" data-pravit>Править</button>' : ""}
          <button class="crmKn" type="button" data-zakryt>Закрыть</button>
        </div>
      </div>
      <h2>${escape(zag)}</h2>
      <div class="crmKartochka">${polyaKartochki(z)}</div>`;
    el("crmOkno").hidden = false;
    const pravit = el("crmOknoDoc").querySelector("[data-pravit]");
    if (pravit) pravit.addEventListener("click", () => otkrytFormu(z));
  }

  function otkrytFormu(z) {
    const est = z || {};
    const polya = POLYA_FORMY.map((p) => {
      const znachenie = est[p.pole] == null ? "" : String(est[p.pole]).slice(0, p.tip === "date" ? 10 : 200);
      const vvod = p.spisok
        ? `<select name="${p.pole}"><option value=""></option>${p.spisok.map((s) =>
            `<option${s === znachenie ? " selected" : ""}>${escape(s)}</option>`).join("")}</select>`
        : `<input name="${p.pole}" type="${p.tip || "text"}" value="${escape(znachenie)}"
             ${p.nuzhno ? "required" : ""}>`;
      return `<label class="crmPole${p.shirokoe ? " crmPole--shirokoe" : ""}">
        <span>${escape(p.imya)}</span>${vvod}</label>`;
    }).join("");

    el("crmOknoDoc").innerHTML = `
      <div class="crmOkno__top">
        <span class="crmOkno__teg">${z ? "Правка лота" : "Новый лот"}</span>
        <div class="crmOkno__act"><button class="crmKn" type="button" data-zakryt>Закрыть</button></div>
      </div>
      <h2>${z ? `Лот ${escape(z.nomer || "")}` : "Новый лот"}</h2>
      <p class="crmPodskazka">Окуп считается сам: цена отгрузки делится на себестоимость.</p>
      <form class="crmForma" id="crmForma">${polya}
        <div class="crmForma__niz">
          <button class="crmKn crmKn--glav" type="submit">Сохранить</button>
          <span class="crmOtvet" id="crmOtvet"></span>
        </div>
      </form>`;
    el("crmOkno").hidden = false;

    el("crmForma").addEventListener("submit", async (event) => {
      event.preventDefault();
      const telo = z && z.id ? { id: z.id } : {};
      new FormData(event.target).forEach((v, k) => {
        const opisanie = POLYA_FORMY.find((p) => p.pole === k);
        telo[k] = v === "" ? null : (opisanie && opisanie.tip === "number" ? Number(v) : v);
      });
      el("crmOtvet").textContent = "Сохраняю…";
      try {
        const otvet = await fetch("/__crm/lot", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(telo),
        });
        const itog = await otvet.json();
        if (!otvet.ok) throw new Error(itog.ошибка || "не сохранилось");
        el("crmOtvet").textContent = "Сохранено";
        await zagruzit();
        setTimeout(() => { el("crmOkno").hidden = true; }, 600);
      } catch (e) {
        el("crmOtvet").textContent = String(e.message || e);
      }
    });
  }

  function narisovat() {
    narisovatPlitki();
    narisovatFiltry();
    narisovatTablicu();
    el("crmPanel").hidden = false;
    el("message").hidden = true;
  }

  async function zagruzit() {
    const otvet = await fetch(DATA, { cache: "no-store" });
    if (!otvet.ok) {
      el("message").textContent = otvet.status === 403
        ? "Нет доступа к разделу" : "Не удалось загрузить";
      return;
    }
    dannye = await otvet.json();
    el("stamp").textContent = "обновлено " + (dannye.сводка?.обновлено || "");
    narisovat();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".crmVid").forEach((kn) => {
      kn.addEventListener("click", () => {
        document.querySelectorAll(".crmVid").forEach((k) => k.classList.remove("is-on"));
        kn.classList.add("is-on");
        vid = kn.dataset.vid;
        filtry = {};
        narisovat();
      });
    });
    el("crmFiltry").addEventListener("click", (event) => {
      const kn = event.target.closest(".crmFiltr");
      if (!kn) return;
      filtry[kn.dataset.pole] = kn.dataset.znachenie || "";
      narisovatFiltry();
      narisovatTablicu();
    });
    el("crmPoisk").addEventListener("input", (event) => {
      poisk = event.target.value.trim().toLowerCase();
      narisovatTablicu();
    });
    el("crmNovyy").addEventListener("click", () => otkrytFormu(null));
    el("crmOkno").addEventListener("click", (event) => {
      if (event.target.id === "crmOknoFon" || event.target.hasAttribute("data-zakryt")) {
        el("crmOkno").hidden = true;
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") el("crmOkno").hidden = true;
    });
    zagruzit();
  });
})();
