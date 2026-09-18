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
    "1. Лот размещается",
    "2. Лот разыгран - перег",
    "3. Заключение договора",
    "4. Подготовка заказов",
    "5. Подготовка счетов",
    "6. Счета выставлены",
    "7. Оплачен",
    "8. Отгружен физически",
    "9. Отгружен(системно)",
    "10.Отгружен ФИЗ и СИСТ",
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

  // Колонки простыни: те же и в том же порядке, что в листе «Предложения КА».
  const STOLBCY = [
    { gruppa: "Лот и идентификация", pole: "nomer", imya: "№ лота", shirina: 74 },
    { gruppa: "Лот и идентификация", pole: "data_vystavleniya", imya: "Дата выставления", tip: "data", shirina: 96 },
    { gruppa: "Лот и идентификация", pole: "mesyac_otgruzki", imya: "Месяц отгрузки", shirina: 100 },
    { gruppa: "Лот и идентификация", pole: "nedelya_plan", imya: "Неделя отгрузки план", shirina: 110 },
    { gruppa: "Лот и идентификация", pole: "menedzher", imya: "Менеджер", shirina: 130 },
    { gruppa: "Лот и идентификация", pole: "region", imya: "Регион", shirina: 80 },
    { gruppa: "Лот и идентификация", pole: "kategoriya", imya: "Категория", shirina: 120 },
    { gruppa: "Статус", pole: "status", imya: "Статус лота", tip: "status", shirina: 170 },
    { gruppa: "Решение", pole: "ka", imya: "КА", shirina: 165 },
    { gruppa: "Решение", pole: "ploshchadka", imya: "Площадка продажи", shirina: 96 },
    { gruppa: "Решение", pole: "cena_otgruzki", imya: "Цена отгрузки с НДС", tip: "dengi", shirina: 110 },
    { gruppa: "Решение", pole: "cena_sbs", imya: "Цена по СБС с НДС", tip: "dengi", shirina: 115 },
    { gruppa: "Решение", pole: "okup", imya: "Окуп", tip: "dolya", shirina: 66 },
    { gruppa: "Факт отгрузки", pole: "data_oplaty", imya: "Дата оплаты", tip: "data", shirina: 96 },
    { gruppa: "Факт отгрузки", pole: "otgruzka1", imya: "Отгрузка 1", tip: "otgruzka", nomer: 0, shirina: 110 },
    { gruppa: "Факт отгрузки", pole: "otgruzka1d", imya: "Дата отгрузки 1", tip: "otgruzkaData", nomer: 0, shirina: 96 },
    { gruppa: "Факт отгрузки", pole: "otgruzka2", imya: "Отгрузка 2", tip: "otgruzka", nomer: 1, shirina: 110 },
    { gruppa: "Факт отгрузки", pole: "otgruzka2d", imya: "Дата отгрузки 2", tip: "otgruzkaData", nomer: 1, shirina: 96 },
    { gruppa: "Факт отгрузки", pole: "otgruzka3", imya: "Отгрузка 3", tip: "otgruzka", nomer: 2, shirina: 110 },
    { gruppa: "Факт отгрузки", pole: "otgruzka3d", imya: "Дата отгрузки 3", tip: "otgruzkaData", nomer: 2, shirina: 96 },
    { gruppa: "Товарная часть", pole: "pallet", imya: "Кол-во паллет", tip: "chislo", shirina: 84 },
    { gruppa: "Товарная часть", pole: "pallet_ubrano", imya: "Убранные паллеты", tip: "chislo", shirina: 92 },
    { gruppa: "Товарная часть", pole: "tovarov", imya: "Количество товаров", tip: "chislo", shirina: 92 },
    { gruppa: "Товарная часть", pole: "rrc", imya: "РРЦ", tip: "dengi", shirina: 105 },
    { gruppa: "Товарная часть", pole: "zakupochnaya", imya: "Закупочная стоимость", tip: "dengi", shirina: 115 },
    { gruppa: "Товарная часть", pole: "startovaya_cena", imya: "Стартовая цена", tip: "dengi", shirina: 105 },
    { gruppa: "Товарная часть", pole: "startovyy_okup", imya: "Стартовый окуп", tip: "dolya", shirina: 80 },
    { gruppa: "Товарная часть", pole: "kommentariy", imya: "Комментарии, примечания", shirina: 230 },
    { gruppa: "Окончание лота", pole: "konec_bidzaar", imya: "Bidzaar", tip: "data", shirina: 96 },
    { gruppa: "Окончание лота", pole: "konec_b2b", imya: "B2B Center", tip: "data", shirina: 96 },
    { gruppa: "Окончание лота", pole: "dney_oplata_otgruzka", imya: "Дней оплата-отгрузка", tip: "chislo", shirina: 92 },
    { gruppa: "Окончание лота", pole: "nomera_zakazov", imya: "Номера заказов", shirina: 160 },
  ];

  const STOLBCY_SCHETOV = [
    { gruppa: "Менеджер / заявка", pole: "lot", imya: "№ лота", shirina: 74 },
    { gruppa: "Менеджер / заявка", pole: "menedzher", imya: "Менеджер", shirina: 130 },
    { gruppa: "Менеджер / заявка", pole: "ka", imya: "КА", shirina: 160 },
    { gruppa: "Менеджер / заявка", pole: "data_zaprosa", imya: "Дата запроса", tip: "data", shirina: 96 },
    { gruppa: "Менеджер / заявка", pole: "prioritet", imya: "Приоритет", shirina: 88 },
    { gruppa: "Менеджер / заявка", pole: "kommentariy_menedzhera", imya: "Комментарий", shirina: 180 },
    { gruppa: "Менеджер / заявка", pole: "status_lota", imya: "Статус лота", tip: "status", shirina: 165 },
    { gruppa: "Менеджер / заявка", pole: "inn", imya: "ИНН", shirina: 110 },
    { gruppa: "Менеджер / заявка", pole: "region", imya: "Регион", shirina: 80 },
    { gruppa: "Менеджер / заявка", pole: "kategoriya", imya: "Категория", shirina: 120 },
    { gruppa: "Менеджер / заявка", pole: "ploshchadka", imya: "Площадка", shirina: 94 },
    { gruppa: "Менеджер / заявка", pole: "cena_otgruzki", imya: "Цена отгрузки с НДС", tip: "dengi", shirina: 110 },
    { gruppa: "Менеджер / заявка", pole: "cena_sbs", imya: "СБС с НДС", tip: "dengi", shirina: 110 },
    { gruppa: "Менеджер / заявка", pole: "okup", imya: "Окуп", tip: "dolya", shirina: 66 },
    { gruppa: "Менеджер / заявка", pole: "pallet", imya: "Паллеты", tip: "chislo", shirina: 78 },
    { gruppa: "Менеджер / заявка", pole: "tovarov", imya: "Товаров", tip: "chislo", shirina: 78 },
    { gruppa: "Оператор / счёт", pole: "operator", imya: "Оператор", shirina: 130 },
    { gruppa: "Оператор / счёт", pole: "status_operatora", imya: "Статус оператора", tip: "status", shirina: 150 },
    { gruppa: "Оператор / счёт", pole: "data_gotovnosti", imya: "Дата готовности счёта", tip: "data", shirina: 96 },
    { gruppa: "Оператор / счёт", pole: "data_prinyatiya", imya: "Дата принятия в работу", tip: "data", shirina: 96 },
    { gruppa: "Оператор / счёт", pole: "nedelya", imya: "№ недели", shirina: 80 },
    { gruppa: "Оператор / счёт", pole: "ssylka_na_schet", imya: "Ссылка на счёт", shirina: 170 },
    { gruppa: "Оператор / счёт", pole: "kommentariy_operatora", imya: "Комментарий", shirina: 180 },
    { gruppa: "Оператор / счёт", pole: "proverka", imya: "Проверка", shirina: 100 },
    { gruppa: "Оператор / счёт", pole: "status", imya: "Статус", shirina: 110 },
    { gruppa: "Оператор / счёт", pole: "kolvo", imya: "Кол-во", tip: "chislo", shirina: 78 },
  ];

  // Поля, которые правятся прямо в таблице. Остальные (окуп, например)
  // считаются и руками не трогаются.
  const PRAVIMYE = {
    nomer: {},
    menedzher: { spisok: null, svoyo: true },   // список соберём из данных
    ka: { spisok: null, svoyo: true },
    region: { spisok: null, svoyo: true },
    kategoriya: { spisok: null, svoyo: true },
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

  // Собираем справочники из того, что уже есть: список предлагаем, но
  // не запрещаем вписать новое — новый менеджер или контрагент появится
  // раньше, чем кто-то полезет править код.
  function sobratSpravochniki(loty) {
    const statusy = [...new Set(loty.map((z) => z.status).filter(Boolean))];
    const lishnie = statusy.filter((s) => !VORONKA.includes(s));
    PRAVIMYE.status.spisok = VORONKA.concat(lishnie);
    [["menedzher", "menedzher"], ["ka", "ka"],
     ["region", "region"], ["kategoriya", "kategoriya"]].forEach(([pole]) => {
      PRAVIMYE[pole].spisok = [...new Set(loty.map((z) => z[pole]).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "ru"));
    });
  }

  // Что правили последним — для отмены по Ctrl+Z. Держим стопку: несколько
  // шагов назад отменяются подряд, как в таблице.
  const otmena = [];

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

  // План продаж на месяц: план, отгружено, в работе — и то же по людям.
  // План правится кликом по сумме: он живёт в базе, а не в голове.
  function narisovatPlan() {
    const uzel = el("crmVoronka");
    if (!uzel || !dannye.план) return;
    const p = dannye.план;
    const dolya = p.план ? Math.min(100, Math.round(100 * p.факт / p.план)) : 0;
    const dolya_raboty = p.план
      ? Math.min(100 - dolya, Math.round(100 * p.в_работе / p.план)) : 0;
    const ostalos = Math.max(0, (p.план || 0) - p.факт);

    const stroka = (x) => {
      const svoya = x.план ? Math.min(100, Math.round(100 * x.факт / x.план)) : 0;
      const rabota = x.план
        ? Math.min(100 - svoya, Math.round(100 * x.в_работе / x.план)) : 0;
      return `<div class="crmPlanStroka">
        <span class="crmPlanStroka__imya">${escape(x.менеджер)}</span>
        <span class="crmPlanStroka__polosa">
          <i class="crmPlanStroka__fakt" style="width:${svoya}%"></i>
          <i class="crmPlanStroka__rabota" style="width:${rabota}%"></i>
        </span>
        <span class="crmPlanStroka__chislo">${chislo(x.факт)}</span>
        <span class="crmPlanStroka__plan" data-menedzher="${escape(x.менеджер)}"
              title="Клик — поставить план">${x.план ? chislo(x.план) : "план?"}</span>
        <span class="crmPlanStroka__pod">${x.лотов} лотов${
          x.лотов_в_работе ? ` · ещё ${x.лотов_в_работе} в работе` : ""}</span>
      </div>`;
    };

    uzel.innerHTML = `
      <div class="crmPlanShapka">
        <div>
          <p class="crmPlanShapka__zag">План продаж</p>
          <select class="crmPlanMesyac" id="crmPlanMesyac">${
            (p.месяцы || []).map((m) =>
              `<option${m === p.месяц ? " selected" : ""}>${escape(m)}</option>`).join("")}</select>
        </div>
        <div class="crmPlanItog">
          <span class="crmPlanItog__fakt">${chislo(p.факт)} ₽</span>
          <span class="crmPlanItog__iz">из <b class="crmPlanStroka__plan" data-menedzher=""
            title="Клик — поставить план">${p.план ? chislo(p.план) : "плана нет"}</b></span>
          ${p.план ? `<span class="crmPlanItog__proc">${dolya}%</span>` : ""}
        </div>
      </div>
      <div class="crmPlanPolosa">
        <i class="crmPlanStroka__fakt" style="width:${dolya}%"></i>
        <i class="crmPlanStroka__rabota" style="width:${dolya_raboty}%"></i>
      </div>
      <p class="crmPlanPodval">${
        p.план
          ? `осталось ${chislo(ostalos)} ₽ · в работе ${chislo(p.в_работе)} ₽`
          : `отгружено ${chislo(p.факт)} ₽, в работе ${chislo(p.в_работе)} ₽ — поставьте план, чтобы видеть выполнение`}</p>
      <div class="crmPlanLyudi">${(p.по_людям || []).map(stroka).join("")}</div>`;

    const mesyac = el("crmPlanMesyac");
    if (mesyac) {
      mesyac.addEventListener("change", async () => {
        await obnovitPlan({ месяц: mesyac.value, менеджер: null, сумма: undefined });
      });
    }
    uzel.querySelectorAll("[data-menedzher]").forEach((uz) => {
      uz.addEventListener("click", async () => {
        const bylo = uz.textContent.replace(/[^\d]/g, "");
        const otvet = prompt(
          `План на ${p.месяц}${uz.dataset.menedzher ? ", " + uz.dataset.menedzher : " (общий)"}, ₽`,
          bylo || "");
        if (otvet === null) return;
        await obnovitPlan({
          месяц: p.месяц,
          менеджер: uz.dataset.menedzher && uz.dataset.menedzher !== "(без менеджера)"
            ? uz.dataset.menedzher : null,
          сумма: otvet.replace(/\s/g, "") === "" ? null : Number(otvet.replace(/[^\d.]/g, "")),
        });
      });
    });
  }

  async function obnovitPlan(telo) {
    // Смена месяца — тот же запрос без суммы: сервер вернёт план выбранного.
    const otvet = await fetch("/__crm/plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo.сумма === undefined
        ? { месяц: telo.месяц, менеджер: null, сумма: null, только_показать: true }
        : telo),
    });
    if (!otvet.ok) return;
    dannye.план = await otvet.json();
    narisovatPlan();
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
    const gruppy = [];
    kol.forEach((s) => {
      const posledn = gruppy[gruppy.length - 1];
      if (posledn && posledn.imya === (s.gruppa || "")) posledn.skolko += 1;
      else gruppy.push({ imya: s.gruppa || "", skolko: 1 });
    });
    const verh = gruppy.map((g) =>
      `<th class="crmGruppa" colspan="${g.skolko}">${escape(g.imya)}</th>`).join("");
    const niz = kol.map((s) =>
      `<th${s.shirina ? ` style="width:${s.shirina}px"` : ""}>${escape(s.imya)}</th>`).join("");
    const shapka = `<tr class="crmShapkaGruppy">${verh}</tr><tr>${niz}</tr>`;
    const mozhno = vid === "loty";
    const telo = vidimye.slice(0, 600).map((z, nomer) => {
      const yachejki = kol.map((s) => {
        let v = z[s.pole];
        if (s.tip === "otgruzka" || s.tip === "otgruzkaData") {
          const para = (z.otgruzki || [])[s.nomer] || {};
          v = s.tip === "otgruzka" ? para["что"] : para["когда"];
        }
        const pravimo = mozhno && PRAVIMYE[s.pole];
        const meta = pravimo ? ` data-pole="${s.pole}" class="crmPravka` : ' class="';
        const datovoe = s.tip === "data" || s.tip === "otgruzkaData";
        const chislovoe = s.tip === "dengi" || s.tip === "chislo"
                       || s.tip === "dolya" || datovoe;
        const klass = `${meta}${chislovoe ? " crmNum" : ""}${datovoe ? " crmData" : ""}"`;
        if (s.tip === "dengi" || s.tip === "chislo") return `<td${klass}>${chislo(v)}</td>`;
        if (s.tip === "dolya") return `<td${klass}>${dolya(v)}</td>`;
        if (s.tip === "data" || s.tip === "otgruzkaData") {
          return `<td${klass}>${data(v)}</td>`;
        }
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
    el("crmTabl").innerHTML = `<table><thead>${shapka}</thead><tbody>${telo}</tbody></table>`;

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

    const vvod = opisanie.spisok && !opisanie.svoyo
      ? document.createElement("select")
      : document.createElement("input");
    if (opisanie.spisok && opisanie.svoyo) {
      // Список подсказкой: значение выбирается из готовых, но можно вписать
      // новое — для нового менеджера или контрагента.
      const id = "crmSpisok_" + pole;
      let spisok = document.getElementById(id);
      if (!spisok) {
        spisok = document.createElement("datalist");
        spisok.id = id;
        document.body.appendChild(spisok);
      }
      spisok.innerHTML = (opisanie.spisok || [])
        .map((s) => `<option value="${escape(s)}"></option>`).join("");
      vvod.setAttribute("list", id);
      vvod.type = "text";
      vvod.value = bylo;
    } else if (opisanie.spisok) {
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
        otmena.push({ id: zapis.id, nomer: zapis.nomer, pole, bylo });
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

  // Возврат последней правки: шлём обратно то значение, что было.
  async function vernutNazad() {
    const shag = otmena.pop();
    if (!shag) {
      soobshchit("Отменять нечего");
      return;
    }
    soobshchit("Возвращаю…");
    try {
      const otvet = await fetch("/__crm/lot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shag.id, nomer: shag.nomer,
                               [shag.pole]: shag.bylo === "" ? null : shag.bylo }),
      });
      if (!otvet.ok) throw new Error("не вышло");
      const itog = await otvet.json();
      const zapis = (dannye.лоты || []).find((z) => z.id === shag.id);
      if (zapis) Object.assign(zapis, itog);
      narisovatPlitki();
      narisovatTablicu();
      soobshchit(`Отменено: ${shag.pole}`);
    } catch (e) {
      otmena.push(shag);
      soobshchit("Не удалось отменить");
    }
  }

  function soobshchit(text) {
    const uzel = el("crmSchyot");
    if (!uzel) return;
    const bylo = uzel.textContent;
    uzel.textContent = text;
    clearTimeout(soobshchit.taymer);
    soobshchit.taymer = setTimeout(() => { uzel.textContent = bylo; }, 2200);
  }

  function narisovat() {
    sobratSpravochniki(dannye.лоты || []);
    narisovatPlitki();
    narisovatPlan();
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
    const tumbler = el("crmVoronkaKn");
    if (tumbler) {
      tumbler.addEventListener("click", () => {
        const blok = el("crmVoronka");
        blok.hidden = !blok.hidden;
        tumbler.classList.toggle("is-on", !blok.hidden);
      });
    }
    el("crmNovyy").addEventListener("click", () => otkrytFormu(null));
    el("crmOkno").addEventListener("click", (event) => {
      if (event.target.id === "crmOknoFon" || event.target.hasAttribute("data-zakryt")) {
        el("crmOkno").hidden = true;
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") el("crmOkno").hidden = true;
      const ctrl = event.ctrlKey || event.metaKey;
      const v_pole = event.target && event.target.closest
        && event.target.closest("input, select, textarea");
      if (ctrl && event.code === "KeyZ" && !v_pole) {
        event.preventDefault();
        vernutNazad();
      }
    });
    zagruzit();
  });
})();
