/* CRM продаж — ТЕСТОВАЯ версия (/crm/test/): доска как рабочее место.
 *
 * Копия /crm/crm.js с новой доской, метками и следующим шагом на карточке.
 * Боевую не трогает; когда тест примут — заменит её.
 *
 * CRM продаж: простыня лотов и счетов, создание и правка лота.
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
    // Контрагент — из справочника, а не руками: в базе уже лежат «Железный
    // Аист» и «Желеный Аист» как два разных клиента. Список подсказкой, но
    // вписать своё можно: новый КА появляется раньше, чем доезжает в справочник.
    { pole: "ka", imya: "Контрагент", podskazka: "crmKaSpisok" },
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

  // База контрагентов: копия листа «!База КА» из книги отдела продаж.
  // Здесь её только читают — правят в книге, оттуда задача и забирает.
  const STOLBCY_KA = [
    { gruppa: "Контрагент", pole: "ka", imya: "КА", shirina: 190 },
    { gruppa: "Контрагент", pole: "yur_lico", imya: "Юр. лицо", shirina: 190 },
    { gruppa: "Контрагент", pole: "inn", imya: "ИНН", shirina: 120 },
    { gruppa: "Контрагент", pole: "region", imya: "Регион", shirina: 96 },
    { gruppa: "Работа", pole: "menedzher", imya: "Менеджер", shirina: 130 },
    { gruppa: "Работа", pole: "istochnik", imya: "Источник", shirina: 120 },
    { gruppa: "Работа", pole: "nachalo_raboty", imya: "Начало работы", tip: "data", shirina: 100 },
    { gruppa: "Работа", pole: "dogovor", imya: "Договор", tip: "da-net", shirina: 84 },
    { gruppa: "Работа", pole: "nomer_dogovora", imya: "№ договора", shirina: 120 },
    { gruppa: "Деньги", pole: "pallet", imya: "Паллет", tip: "chislo", shirina: 84 },
    { gruppa: "Деньги", pole: "summa_prodazh", imya: "Продажи", tip: "dengi", shirina: 110 },
    { gruppa: "Деньги", pole: "summa_sbs", imya: "По себестоимости", tip: "dengi", shirina: 120 },
    { gruppa: "Деньги", pole: "okup", imya: "Окуп", tip: "procent", shirina: 74 },
    { gruppa: "Отгрузки", pole: "pervaya_otgruzka", imya: "Первая", tip: "data", shirina: 96 },
    { gruppa: "Отгрузки", pole: "poslednyaya_otgruzka", imya: "Последняя", tip: "data", shirina: 96 },
    { gruppa: "Связь", pole: "kontakty", imya: "Контакты", shirina: 220 },
    { gruppa: "Связь", pole: "email", imya: "Email", shirina: 170 },
    { gruppa: "Связь", pole: "kategorii", imya: "Категории", shirina: 150 },
    { gruppa: "Связь", pole: "sklady", imya: "Склады", shirina: 120 },
    { gruppa: "Связь", pole: "primechaniya", imya: "Примечания", shirina: 260 },
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
  const sklonenie = (n, odin, dva, mnogo) => {
    const v = Math.abs(Math.round(n)) % 100;
    if (v > 10 && v < 20) return mnogo;
    const posledniy = v % 10;
    return posledniy === 1 ? odin : posledniy >= 2 && posledniy <= 4 ? dva : mnogo;
  };

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
  let vid = "doska";
  let filtry = {};
  let poisk = "";
  let ochered = "";
  // Таблица открывается на главных колонках: из тридцати двух две трети
  // заполнены у каждого пятого лота, и строку целиком было не прочитать.
  let vseKolonki = false;
  let sortirovka = { pole: null, vniz: true };

  function stroki() {
    if (vid === "scheta") return dannye.счета || [];
    if (vid === "ka") return dannye.ка || [];
    return dannye.лоты || [];
  }

  // Колонки, которые нужны всегда. Остальные открываются кнопкой «Все
  // колонки»: они нужны при разборе конкретного лота, а не при просмотре.
  const GLAVNYE = ["nomer", "data_vystavleniya", "menedzher", "ka", "status",
                   "ploshchadka", "cena_otgruzki", "cena_sbs", "okup", "pallet",
                   "nedelya_plan", "kommentariy"];
  const GLAVNYE_SCHETOV = ["lot", "menedzher", "ka", "data_zaprosa", "status_lota",
                           "operator", "status_operatora", "data_gotovnosti",
                           "cena_otgruzki", "okup", "kommentariy_operatora"];

  const GLAVNYE_KA = ["ka", "menedzher", "region", "dogovor", "pallet",
                      "summa_prodazh", "okup", "poslednyaya_otgruzka", "kontakty"];

  function stolbcy() {
    const vse = vid === "scheta" ? STOLBCY_SCHETOV
              : vid === "ka" ? STOLBCY_KA : STOLBCY;
    if (vseKolonki) return vse;
    const nuzhnye = vid === "scheta" ? GLAVNYE_SCHETOV
                  : vid === "ka" ? GLAVNYE_KA : GLAVNYE;
    return vse.filter((s) => nuzhnye.includes(s.pole));
  }

  /* Сортировка по клику на заголовок.
   *
   * Её не было вообще: найти самый старый лот или самый крупный можно было
   * только глазами по шестистам строкам. Числа и даты сравниваем как числа и
   * даты, остальное — по-русски.
   */
  function sravnit(a, b, opisanie) {
    const pole = opisanie.pole;
    const chislovoe = ["dengi", "chislo", "dolya", "procent"].includes(opisanie.tip);
    const datovoe = opisanie.tip === "data";
    const va = a[pole], vb = b[pole];
    const pusto = (v) => v === null || v === undefined || v === "";
    if (pusto(va) && pusto(vb)) return 0;
    if (pusto(va)) return 1;      // пустые всегда внизу
    if (pusto(vb)) return -1;
    if (chislovoe) return (Number(vb) || 0) - (Number(va) || 0);
    if (datovoe) return String(vb).localeCompare(String(va));
    return String(va).localeCompare(String(vb), "ru", { numeric: true });
  }

  function otsortirovat(spisok) {
    if (!sortirovka.pole) return spisok;
    const opisanie = (vid === "scheta" ? STOLBCY_SCHETOV
                      : vid === "ka" ? STOLBCY_KA : STOLBCY)
      .find((s) => s.pole === sortirovka.pole);
    if (!opisanie) return spisok;
    const znak = sortirovka.vniz ? 1 : -1;
    return [...spisok].sort((a, b) => znak * sravnit(a, b, opisanie));
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

  /* --- Доска воронки ------------------------------------------------------
   *
   * Простыня отвечает на вопрос «какие лоты вообще есть», а работа состоит из
   * другого: что в каком состоянии и что застряло. Живых лотов меньше сотни
   * из двух тысяч, поэтому главный экран — доска по статусам: карточку видно
   * целиком и её можно перетащить в следующий столбец.
   */
  const KONEC = "10.Отгружен ФИЗ и СИСТ";
  const SNYAT = "Снят с торгов";
  const RABOCHIE = VORONKA.filter((s) => s !== KONEC && s !== SNYAT);
  const SUTKI = 24 * 60 * 60 * 1000;

  function aktivnyy(z) {
    const s = String(z.status || "");
    return Boolean(s) && !s.startsWith("10") && !s.startsWith("Снят");
  }

  /* Сколько дней лот стоит в нынешнем статусе.
   *
   * Считаем от последней смены статуса — её пишет история правок. У лотов,
   * которых после импорта не трогали, истории нет: там берём дату
   * выставления. Это не точная дата входа в статус, но именно такие лоты и
   * нужно поднимать — их не двигали ни разу.
   */
  function dney(z) {
    const ot = z.status_s || z.data_vystavleniya;
    if (!ot) return null;
    const kogda = new Date(String(ot).slice(0, 10));
    if (Number.isNaN(kogda.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - kogda.getTime()) / SUTKI));
  }

  // Очереди — то, ради чего в CRM заходят утром. Каждая отвечает на вопрос
  // «за что браться», а не «что у нас есть».
  const OCHEREDI = [
    { klyuch: "bez", imya: "Без менеджера", chto: "лот в работе, отвечать некому",
      otbor: (z) => aktivnyy(z) && !String(z.menedzher || "").trim() },
    { klyuch: "visit", imya: "Висит больше 30 дней", chto: "статус не менялся месяц",
      otbor: (z) => aktivnyy(z) && (dney(z) || 0) > 30 },
    { klyuch: "oplachen", imya: "Оплачен, не отгружен", chto: "деньги взяли, товар не уехал",
      otbor: (z) => String(z.status || "").startsWith("7.") },
    { klyuch: "schet", imya: "Счёт выставлен и тишина", chto: "больше недели без оплаты",
      otbor: (z) => String(z.status || "").startsWith("6.") && (dney(z) || 0) > 7 },
    { klyuch: "polovina", imya: "Отгружен наполовину", chto: "физика и система разошлись",
      otbor: (z) => /^[89]\./.test(String(z.status || "")) },
    { klyuch: "bezdaty", imya: "Оплата пришла, даты нет", klass: "is-siniy",
      chto: "деньги в банке есть, в лоте дата оплаты пустая — поставьте дату",
      otbor: (z) => lotyBezDaty().has(String(z.nomer)) },
    { klyuch: "bezshaga", imya: "Нет следующего шага", klass: "is-seryy",
      chto: "лот в работе, а дела по нему нет — про него забудут",
      otbor: (z) => aktivnyy(z) && !lotySDelom().has(String(z.nomer || "")) },
  ];
  OCHEREDI[0].klass = "is-krasnyy";
  OCHEREDI[1].klass = "is-krasnyy";
  OCHEREDI[2].klass = "is-siniy";
  OCHEREDI[3].klass = "is-zhyoltyy";

  function podhodit(z) {
    // Очереди построены на полях лота, к счетам и базе КА неприменимы.
    if (ochered && vid !== "scheta" && vid !== "ka") {
      const opisanie = OCHEREDI.find((o) => o.klyuch === ochered);
      if (opisanie && !opisanie.otbor(z)) return false;
    }
    for (const [pole, znachenie] of Object.entries(filtry)) {
      if (!znachenie) continue;
      if (String(z[pole] || "") !== znachenie) return false;
    }
    if (poisk) {
      const seno = [z.nomer, z.lot, z.ka, z.kommentariy, z.menedzher, z.operator,
                    z.kategoriya, z.nomera_zakazov,
                    z.yur_lico, z.inn, z.region, z.kontakty, z.email,
                    z.primechaniya].join(" ").toLowerCase();
      if (!seno.includes(poisk)) return false;
    }
    return true;
  }

  // Период, за который есть лоты: по крайним непустым датам.
  function period(loty) {
    const daty = loty.map((z) => z.data_vystavleniya).filter(Boolean).sort();
    return daty.length ? `${data(daty[0])} — ${data(daty.at(-1))}` : "";
  }

  /* --- Тест: доска как рабочее место ----------------------------------------
     Со встречи 23.09: «сделать crm удобнее и конкретнее». Доска — главный
     экран, на карточке метки вместо цифр и следующее действие одной кнопкой,
     сверху — что сделать сегодня. Сверка и план по людям ушли из вкладок:
     полезное из сверки («оплата пришла, даты нет») стало очередью дел. */

  // Цвет этапа — от холодного к тёплому по ходу сделки, оплата зелёная.
  const CVET_ETAPA = {
    "1. Лот размещается": "#8093ad",
    "2. Лот разыгран - перег": "#4d8df7",
    "3. Заключение договора": "#5f7df5",
    "4. Подготовка заказов": "#7b6cf2",
    "5. Подготовка счетов": "#a58dff",
    "6. Счета выставлены": "#f5ad32",
    "7. Оплачен": "#27c46b",
    "8. Отгружен физически": "#22b3a3",
    "9. Отгружен(системно)": "#1f9fc9",
  };

  // Подпись кнопки «дальше» — глаголом покороче: полное имя этапа на
  // карточку не влезает («Лот разыгран - перег»).
  const KRATKO = {
    "2. Лот разыгран - перег": "разыгран",
    "3. Заключение договора": "договор",
    "4. Подготовка заказов": "заказы",
    "5. Подготовка счетов": "счета",
    "6. Счета выставлены": "счёт выставлен",
    "7. Оплачен": "оплачен",
    "8. Отгружен физически": "отгружен физ.",
    "9. Отгружен(системно)": "отгружен в системе",
    "10.Отгружен ФИЗ и СИСТ": "закрыть",
  };

  const mlnS = (v) => ((Number(v) || 0) / 1e6).toLocaleString("ru-RU",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " млн";
  const segodnyaIso = () => new Date().toISOString().slice(0, 10);
  const imyaEtapa = (s) => String(s || "").replace(/^\d+\.\s*/, "");

  /** Номера лотов, по которым деньги в банке есть, а даты оплаты в доске нет. */
  function lotyBezDaty() {
    return new Set(((sverka || {}).без_даты_оплаты || []).map((z) => String(z.лот)));
  }

  /** Лоты, у которых есть открытое дело. */
  function lotySDelom() {
    return new Set((((dannye.задачи || {}).задачи) || [])
      .filter((z) => !z.готово && z.лот).map((z) => String(z.лот)));
  }

  function delaLota(z) {
    return (((dannye.задачи || {}).задачи) || [])
      .filter((d) => !d.готово && String(d.лот || "") === String(z.nomer || ""));
  }

  /** Куда лот идёт дальше: соседний этап справа, после девятого — конец. */
  function sleduyushchiy(status) {
    const i = RABOCHIE.indexOf(status);
    if (i < 0) return null;
    return i === RABOCHIE.length - 1 ? KONEC : RABOCHIE[i + 1];
  }

  /** Метки карточки: то, из-за чего на лот надо посмотреть. Не больше двух: на карточке одна строка меток. */
  function metkiLota(z) {
    const metki = [];
    const d = dney(z) || 0;
    const st = String(z.status || "");
    const dela = delaLota(z);
    if (dela.some((x) => x.просрочена)) metki.push(["дело просрочено", "is-krasnyy"]);
    if (!String(z.menedzher || "").trim()) metki.push(["без менеджера", "is-krasnyy"]);
    if (st.startsWith("6.") && d > 7) metki.push([`ждём оплату ${d} дн`, "is-zhyoltyy"]);
    if (st.startsWith("7.")) metki.push(["отгрузить", "is-siniy"]);
    if (lotyBezDaty().has(String(z.nomer))) metki.push(["нет даты оплаты", "is-siniy"]);
    if (d > 30) metki.push([`стоит ${d} дн`, "is-krasnyy"]);
    else if (d > 14) metki.push([`стоит ${d} дн`, "is-zhyoltyy"]);
    if (!dela.length && aktivnyy(z)) metki.push(["нет шага", "is-seryy"]);
    if (!dengiLota(z).summa) metki.push(["нет цены", "is-seryy"]);
    return metki.slice(0, 2);
  }

  async function sohranitLot(z, polya, soobshchenie) {
    soobshchit(soobshchenie);
    const bylo = z.status;
    try {
      const otvet = await fetch("/__crm/lot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: z.id, nomer: z.nomer, ...polya }),
      });
      const itog = await otvet.json();
      if (!otvet.ok) throw new Error(itog.ошибка || "не сохранилось");
      Object.assign(z, itog);
      if (polya.status) {
        z.status_s = new Date().toISOString();
        otmena.push({ id: z.id, nomer: z.nomer, pole: "status", bylo });
      }
      narisovat();
    } catch (e) {
      soobshchit("Не сохранилось: " + (e.message || e));
    }
  }

  /** Следующий шаг одной кнопкой. Оплату отмечаем вместе с датой — иначе
      сверка потом снова найдёт «деньги есть, даты нет». */
  function dalshe(z) {
    const kuda = sleduyushchiy(z.status);
    if (!kuda) return;
    if (kuda === KONEC && !confirm(`Лот ${z.nomer} отгружен физически и в системе?`)) return;
    const polya = { status: kuda };
    if (kuda.startsWith("7.") && !z.data_oplaty) polya.data_oplaty = segodnyaIso();
    sohranitLot(z, polya, `Лот ${z.nomer}: ${imyaEtapa(kuda)}`);
  }

  function novoeDelo(z) {
    const tekst = prompt(`Что сделать по лоту ${z.nomer}?`, "");
    if (!tekst || !tekst.trim()) return;
    const moyo = (dannye.кто && dannye.кто.имя) || "";
    poslatZadachu({
      tekst: tekst.trim(), menedzher: z.menedzher || moyo,
      srok: segodnyaIso(), vremya: null, lot: z.nomer,
    });
  }

  /** Счета лота — прямо в карточке, отдельная вкладка им больше не нужна. */
  function blokSchetov(z) {
    const scheta = (dannye.счета || []).filter((s) => String(s.lot || "") === String(z.nomer || ""));
    if (!scheta.length) return "";
    return `<div class="ctScheta">
      <p class="crmZadZag">Счета · ${scheta.length}</p>
      ${scheta.map((s) => `<div class="ctSchet">
        <span class="crmStatus ${klassStatusa(s.status_operatora)}">${escape(s.status_operatora || "без статуса")}</span>
        <span>${escape(s.operator || "оператор не назначен")}</span>
        <span>${s.data_zaprosa ? "запрошен " + data(s.data_zaprosa) : ""}${
          s.data_gotovnosti ? " · готов " + data(s.data_gotovnosti) : ""}</span>
        ${s.ssylka_na_schet ? `<a href="${escape(s.ssylka_na_schet)}" target="_blank" rel="noopener">счёт ↗</a>` : ""}
      </div>`).join("")}
    </div>`;
  }

  /** Шапка CRM — выполнение плана за месяц, а не счётчики лотов.
   *
   * Правка от 21.09: «верхний блок виджетов бессмысленен, вместо него нужно
   * выполнение плана как в воронке». Считаем строго по месяцу плана, иначе
   * рядом оказывались годовые 99,8 млн и месячный план — сравнивать нечего.
   */
  function narisovatPlitki() {
    const p = dannye.план || {};
    const fakt = Number(p.факт) || 0;
    const rabota = Number(p.в_работе) || 0;
    const plan = Number(p.план) || 0;
    const procent = plan ? Math.round(100 * fakt / plan) : 0;
    const sRabotoy = plan ? Math.min(100 - Math.min(100, procent), Math.round(100 * rabota / plan)) : 0;
    el("crmPlitki").innerHTML = `
      <span class="ctPlan__zag">${escape(p.месяц || "")}</span>
      <b class="ctPlan__fakt">${mlnS(fakt)}</b>
      <button class="ctPlan__iz" type="button" id="ctPlanPravka" title="Клик — поставить план месяца">${
        plan ? "из " + mlnS(plan) : "план не задан"}</button>
      ${plan ? `<span class="ctPlan__polosa"><i style="width:${Math.min(100, procent)}%"></i><i class="is-rabota"
        style="width:${sRabotoy}%"></i></span>
      <b class="ctPlan__proc ${procent >= 100 ? "is-ok" : ""}">${procent}%</b>` : ""}
      <span class="ctPlan__pod">в работе ещё ${mlnS(rabota)}</span>`;
    el("crmPlitki").hidden = false;
    el("ctPlanPravka").addEventListener("click", async () => {
      const otvet = prompt(`План продаж на ${p.месяц}, ₽`, plan ? String(Math.round(plan)) : "");
      if (otvet === null) return;
      const summa = otvet.replace(/\s/g, "");
      await obnovitPlan({ месяц: p.месяц, менеджер: null,
                          сумма: summa === "" ? null : Number(summa.replace(/[^\d.]/g, "")) });
    });
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
    narisovatPlitki();
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
    const vidimye = otsortirovat(stroki().filter(podhodit));
    const kol = stolbcy();
    const gruppy = [];
    kol.forEach((s) => {
      const posledn = gruppy[gruppy.length - 1];
      if (posledn && posledn.imya === (s.gruppa || "")) posledn.skolko += 1;
      else gruppy.push({ imya: s.gruppa || "", skolko: 1 });
    });
    const verh = gruppy.map((g) =>
      `<th class="crmGruppa" colspan="${g.skolko}">${escape(g.imya)}</th>`).join("");
    const niz = kol.map((s, nomer) => {
      const idet = sortirovka.pole === s.pole;
      const strelka = idet ? (sortirovka.vniz ? " ↓" : " ↑") : "";
      return `<th class="crmSort${idet ? " is-on" : ""}${nomer === 0 ? " crmLipkiy" : ""}"
        data-sort="${s.pole}"${s.shirina ? ` style="width:${s.shirina}px"` : ""}
        title="Сортировать по «${escape(s.imya)}»">${escape(s.imya)}${strelka}</th>`;
    }).join("");
    const shapka = `<tr class="crmShapkaGruppy">${verh}</tr><tr>${niz}</tr>`;
    const mozhno = vid === "loty";
    const telo = vidimye.slice(0, 600).map((z, nomer) => {
      const yachejki = kol.map((s, kolNomer) => {
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
        // Первая колонка прилипает к левому краю: при листании вбок без неё
        // непонятно, к какому лоту относится строка.
        const klass = `${meta}${chislovoe ? " crmNum" : ""}${datovoe ? " crmData" : ""}`
                    + `${kolNomer === 0 ? " crmLipkiy" : ""}"`;
        if (s.tip === "dengi" || s.tip === "chislo") return `<td${klass}>${chislo(v)}</td>`;
        if (s.tip === "dolya") return `<td${klass}>${dolya(v)}</td>`;
        // В базе КА окуп лежит уже в процентах, а договор — булевым.
        if (s.tip === "procent") {
          // В базе КА окуп хранится сразу в процентах, а не долей.
          const pusto = v === null || v === undefined || v === "";
          const cvet = pusto ? "" : Number(v) >= 25 ? " crmOkup--horosho"
                     : Number(v) >= 12 ? " crmOkup--sredne" : " crmOkup--ploho";
          return `<td${klass}><span class="crmOkup${cvet}">${
            pusto ? "" : Number(v).toFixed(0) + "%"}</span></td>`;
        }
        if (s.tip === "da-net") {
          return `<td${klass}><span class="crmStatus ${v ? "crm--gotovo" : "crm--net"}">${
            v ? "да" : "нет"}</span></td>`;
        }
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

    const skolko = vidimye.length > 600
      ? `Показаны первые 600 из ${vidimye.length}`
      : `Строк: ${vidimye.length}`;
    const pro = sortirovka.pole
      ? `сортировка по «${(kol.find((s) => s.pole === sortirovka.pole) || {}).imya
         || sortirovka.pole}»`
      : "клик по заголовку сортирует";
    el("crmSchyot").textContent = `${skolko} · ${kol.length} колонок · ${pro}`;
    el("crmTabl").innerHTML = `<table><thead>${shapka}</thead><tbody>${telo}</tbody></table>`;

    el("crmTabl").querySelectorAll("th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const pole = th.dataset.sort;
        // Второй клик по той же колонке разворачивает порядок — так ведут
        // себя все таблицы, к которым люди привыкли.
        sortirovka = sortirovka.pole === pole
          ? { pole, vniz: !sortirovka.vniz } : { pole, vniz: true };
        narisovatTablicu();
      });
    });

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

  /* --- Полоса «что горит» -------------------------------------------------
   *
   * Первое, что должно бросаться в глаза: не «сколько у нас лотов», а за что
   * браться. Клик по очереди оставляет на доске и в таблице только её лоты.
   */
  function narisovatGorit() {
    const uzel = el("crmGorit");
    if (!uzel) return;
    const kto = filtry.menedzher || "";
    const dela = (((dannye.задачи || {}).задачи) || [])
      .filter((z) => !z.готово && (!kto || (z.менеджер || "") === kto));
    const sklad = filtry.region || "";
    const loty = (dannye.лоты || []).filter((z) => (!kto || (z.menedzher || "") === kto)
      && (!sklad || String(z.region || "") === sklad));
    const punkty = [
      { klyuch: "__prosr", imya: "дела просрочены", chislo: dela.filter((z) => z.просрочена).length, klass: "is-krasnyy" },
      { klyuch: "__segodnya", imya: "дела на сегодня", chislo: dela.filter((z) => z.на_сегодня && !z.просрочена).length, klass: "is-siniy" },
      ...OCHEREDI.map((o) => {
        const svoi = loty.filter(o.otbor);
        return { klyuch: o.klyuch, imya: o.imya.toLowerCase(), chto: o.chto, chislo: svoi.length,
                 summa: svoi.reduce((n, z) => n + dengiLota(z).summa, 0), klass: o.klass || "" };
      }),
    ].filter((x) => x.chislo);
    uzel.innerHTML = `<span class="ctDela__zag">Сегодня</span>` + (punkty.length ? punkty.map((x) => `
      <button class="ctDelo ${x.klass}${ochered === x.klyuch ? " is-on" : ""}" type="button"
              data-ochered="${x.klyuch}" title="${escape(x.chto || "")}">
        <b>${x.chislo}</b><span>${escape(x.imya)}</span>${x.summa ? `<i>${mlnS(x.summa)}</i>` : ""}
      </button>`).join("") : '<span class="ctDela__chisto">всё чисто — срочного нет</span>')
      + (ochered ? '<button class="ctDelo ctDelo--sbros" type="button" data-ochered="">× показать все</button>' : "");
  }

  /* --- Доска воронки ------------------------------------------------------
   *
   * Колонка — статус, карточка — лот. Карточку тащат мышью в соседнюю
   * колонку, и это единственный способ сменить статус, не открывая ничего:
   * раньше для этого надо было найти строку в простыне и попасть в ячейку.
   *
   * Внутри колонки сверху лежит самое залежавшееся: если лот месяц не
   * двигался, он должен попадаться на глаза первым.
   */
  function klassDney(chislo_dney, aktiven) {
    if (chislo_dney === null || !aktiven) return "";
    if (chislo_dney > 30) return " crmDni--ploho";
    if (chislo_dney > 14) return " crmDni--tak-sebe";
    return "";
  }

  /* Деньги лота: пока он не продан, цены отгрузки нет — у 24 из 28 лотов на
   * размещении её не заполняют, зато есть стартовая. Берём что есть и честно
   * помечаем, что это старт, иначе половина доски выглядит как «цены нет».
   */
  /* Паллеты лота прямо на карточке — просьба продаж 23.09: «добавить инфу по
     кол-ву паллет, чтобы не проваливаться в сам лот». Убранные из лота
     вычитаем: на карточке нужно, сколько поедет. */
  function palletLota(z) {
    const vsego = Number(z.pallet) || 0;
    const ubrano = Number(z.pallet_ubrano) || 0;
    return { skolko: Math.max(0, vsego - ubrano), ubrano };
  }
  const palletTekst = (n) => `${chislo(n)} ${sklonenie(n, "паллета", "паллеты", "паллет")}`;

  function dengiLota(z) {
    if (z.cena_otgruzki !== null && z.cena_otgruzki !== undefined && z.cena_otgruzki !== "") {
      return { summa: Number(z.cena_otgruzki), start: false };
    }
    if (z.startovaya_cena) return { summa: Number(z.startovaya_cena), start: true };
    return { summa: 0, start: false };
  }

  function okupLota(z) {
    // Ноль здесь означает «не считали»: окуп — отношение цены к себестоимости,
    // нулевым он не бывает. Показывать «0%» — врать.
    if (Number(z.okup) > 0) return { znachenie: Number(z.okup), start: false };
    if (Number(z.startovyy_okup) > 0) {
      return { znachenie: Number(z.startovyy_okup), start: true };
    }
    return { znachenie: null, start: false };
  }

  function klassOkupa(okup) {
    const v = Number(okup || 0) * 100;
    if (!v) return "";
    if (v >= 25) return " crmOkup--horosho";
    if (v >= 12) return " crmOkup--sredne";
    return " crmOkup--ploho";
  }

  /* Даты на карточке — просьба продаж 23.09: «у лотов в статусе счёт
     выставлен есть дата счёта, а у оплаченных не видно даты оплаты», и
     вопрос Никиты про недели отгрузки. Неделю ставят кликом в любой момент,
     хоть при заведении лота: в таблице продаж она заполнена у всех. */
  const korotko = (v) => data(v).slice(0, 5);

  function dataEtapa(z) {
    const st = String(z.status || "");
    if (/^[789]\./.test(st)) return z.data_oplaty ? "оплачен " + korotko(z.data_oplaty) : "дата оплаты?";
    if (st.startsWith("6.")) {
      const daty = (dannye.счета || []).filter((s) => String(s.lot || "") === String(z.nomer || ""))
        .map((s) => s.data_gotovnosti || s.data_prinyatiya || s.data_zaprosa).filter(Boolean).sort();
      const d = daty[daty.length - 1] || z.status_s;
      return d ? "счёт " + korotko(d) : "дата счёта?";
    }
    return z.data_vystavleniya ? "лот от " + korotko(z.data_vystavleniya) : "";
  }

  /** Следующая неделя в том же виде, что в таблице продаж: «29-05.10». */
  function sleduyushchayaNedelya() {
    const d = new Date();
    const pn = new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((8 - d.getDay()) % 7 || 7));
    const vs = new Date(pn.getFullYear(), pn.getMonth(), pn.getDate() + 6);
    const dd = (x) => String(x.getDate()).padStart(2, "0");
    return `${dd(pn)}-${dd(vs)}.${String(vs.getMonth() + 1).padStart(2, "0")}`;
  }

  async function postavitNedelyu(z) {
    const otvet = prompt(`Неделя отгрузки лота ${z.nomer}, например ${sleduyushchayaNedelya()}.
Пусто — убрать.`,
                         z.nedelya_plan || sleduyushchayaNedelya());
    if (otvet === null) return;
    const zapros = await fetch("/__crm/lot", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: z.id, nomer: z.nomer, nedelya_plan: otvet.trim() || null }),
    });
    const itog = await zapros.json().catch(() => ({}));
    if (!zapros.ok) { alert(itog.ошибка || "не сохранилось"); return; }
    Object.assign(z, itog);
    narisovat();
  }

  function strokaDat(z) {
    return `<p class="crmKarta__daty"><button class="crmKarta__nedelya${z.nedelya_plan ? "" : " is-net"}"
        type="button" data-nedelya title="Клик — поставить неделю отгрузки">${
        z.nedelya_plan ? "отгрузка " + escape(z.nedelya_plan) : "неделя отгрузки?"}</button>
      <span>${escape(dataEtapa(z))}</span></p>`;
  }

  /* Тело карточки — одним языком: номер и дни, контрагент одной строкой,
     дальше строки «подпись — значение», у всех карточек одни и те же и в
     одном порядке. Пустое — прочерком. Так нет дыр и нет «разных миров»:
     сумма, паллеты, неделя отгрузки и менеджер читаются одинаково.
     Длинные ФИО сокращаем до инициалов, полное имя — в подсказке. */
  function inicialy(fio) {
    const slova = String(fio || "").trim().split(/\s+/).filter(Boolean);
    const chelovek = (s) => s.length >= 2 && s.length <= 3 && s.every((w) => /^[А-ЯЁ][а-яё-]+$/.test(w));
    const sokr = (s) => s[0] + " " + s.slice(1).map((w) => w[0] + ".").join(" ");
    if (slova[0] === "ИП" && chelovek(slova.slice(1))) return "ИП " + sokr(slova.slice(1));
    if (chelovek(slova)) return sokr(slova);
    return slova.join(" ");
  }

  function etapIData(z) {
    const st = String(z.status || "");
    if (/^[789]\./.test(st)) return ["Оплачен", z.data_oplaty ? korotko(z.data_oplaty) : "—"];
    if (st.startsWith("6.")) {
      const daty = (dannye.счета || []).filter((s) => String(s.lot || "") === String(z.nomer || ""))
        .map((s) => s.data_gotovnosti || s.data_prinyatiya || s.data_zaprosa).filter(Boolean).sort();
      const d = daty[daty.length - 1] || z.status_s;
      return ["Счёт", d ? korotko(d) : "—"];
    }
    return ["Лот от", z.data_vystavleniya ? korotko(z.data_vystavleniya) : "—"];
  }

  function teloKarty(z) {
    const d = dney(z);
    const { summa, start } = dengiLota(z);
    const okup = okupLota(z);
    const pal = palletLota(z);
    const [etap, kogda] = etapIData(z);
    const menedzher = String(z.menedzher || "").trim();
    const stroka = (imya, znachenie, klass = "", title = "") =>
      `<div class="crmKv"><span>${imya}</span><b class="${klass}"${title ? ` title="${escape(title)}"` : ""}>${znachenie}</b></div>`;
    return `
      <div class="crmKarta__verh">
        <b class="crmKarta__nomer">Лот ${escape(z.nomer || "—")}</b>
        <span class="crmKarta__dni${klassDney(d, aktivnyy(z))}">${d === null ? "" : d + " дн"}</span>
      </div>
      <p class="crmKarta__ka" title="${escape(z.ka || "")}">${escape(inicialy(z.ka) || "контрагент не указан")}</p>
      <div class="crmKarta__kv">
        ${stroka(start ? "Старт" : "Сумма", summa ? chislo(summa) + " ₽" : "—")}
        ${stroka("Паллет", pal.skolko ? chislo(pal.skolko) : "—", "", pal.ubrano ? "убрано из лота " + pal.ubrano : "")}
        ${stroka("Окуп", okup.znachenie ? dolya(okup.znachenie) : "—", "crmOkup" + klassOkupa(okup.znachenie))}
        <div class="crmKv"><span>Отгрузка</span><button class="crmKv__nedelya${z.nedelya_plan ? "" : " is-net"}"
          type="button" data-nedelya title="Клик — поставить неделю отгрузки">${
          z.nedelya_plan ? escape(z.nedelya_plan) : "поставить"}</button></div>
        ${stroka(etap, kogda)}
        ${stroka("Склад", escape([z.region, z.ploshchadka].filter(Boolean).join(" · ") || "—"))}
        ${stroka("Менеджер", menedzher ? escape(inicialy(menedzher)) : "не назначен",
                 menedzher ? "" : "is-net", menedzher)}
      </div>`;
  }

  function kartaLota(z) {
    const karta = document.createElement("article");
    karta.className = "crmKarta ctKarta";
    karta.draggable = true;
    karta.dataset.id = z.id;
    const kuda = sleduyushchiy(z.status);
    const metki = metkiLota(z);
    karta.innerHTML = teloKarty(z) + `
      <div class="ctMetki">${metki.length ? metki.map(([t, k]) =>
        `<span class="ctMetka ${k}">${escape(t)}</span>`).join("") : '<span class="ctMetki__chisto">без замечаний</span>'}</div>
      <div class="ctKarta__niz">
        <button class="ctKarta__kn" type="button" data-delo title="Завести дело по лоту">+ дело</button>
        ${kuda ? `<button class="ctKarta__kn ctKarta__kn--dalshe" type="button" data-dalshe
          title="Перевести в «${escape(imyaEtapa(kuda))}»">→ ${escape(KRATKO[kuda] || imyaEtapa(kuda).toLowerCase())}</button>` : ""}
      </div>`;

    karta.querySelector("[data-nedelya]").addEventListener("click", (event) => {
      event.stopPropagation();
      postavitNedelyu(z);
    });
    karta.querySelector("[data-delo]").addEventListener("click", (event) => {
      event.stopPropagation();
      novoeDelo(z);
    });
    const knDalshe = karta.querySelector("[data-dalshe]");
    if (knDalshe) {
      knDalshe.addEventListener("click", (event) => {
        event.stopPropagation();
        dalshe(z);
      });
    }
    karta.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", String(z.id));
      event.dataTransfer.effectAllowed = "move";
      karta.classList.add("is-tashchat");
    });
    karta.addEventListener("dragend", () => karta.classList.remove("is-tashchat"));
    karta.addEventListener("click", () => otkrytKartochku(z));
    return karta;
  }

  function narisovatDosku() {
    const uzel = el("crmDoska");
    if (!uzel) return;
    const vidimye = (dannye.лоты || []).filter(podhodit);
    uzel.replaceChildren();

    RABOCHIE.forEach((status) => {
      const svoi = vidimye.filter((z) => z.status === status)
        .sort((a, b) => (dney(b) || 0) - (dney(a) || 0));
      const summa = svoi.reduce((n, z) => n + dengiLota(z).summa, 0);

      const stolbec = document.createElement("section");
      // Пустую колонку ужимаем, но оставляем: в неё перетаскивают карточку,
      // когда лот делает следующий шаг.
      stolbec.className = "crmStolbec" + (svoi.length ? "" : " crmStolbec--tonkiy");
      stolbec.dataset.status = status;
      stolbec.style.setProperty("--c", CVET_ETAPA[status] || "#8093ad");
      const shapka = document.createElement("header");
      shapka.className = "crmStolbec__shapka ctShapkaEtapa";
      shapka.innerHTML = `<p class="ctShapkaEtapa__imya">${escape(imyaEtapa(status))}
          <span>${svoi.length}</span></p>
        <p class="ctShapkaEtapa__summa">${summa ? chislo(summa) + " ₽" : "—"}</p>${(() => {
          const n = svoi.reduce((s, z) => s + palletLota(z).skolko, 0);
          return `<p class="ctShapkaEtapa__pallet">${n ? palletTekst(n) : "паллет нет"}</p>`;
        })()}`;
      stolbec.appendChild(shapka);

      const mesto = document.createElement("div");
      mesto.className = "crmStolbec__karty";
      svoi.slice(0, 40).forEach((z) => mesto.appendChild(kartaLota(z)));
      if (svoi.length > 40) {
        const eshche = document.createElement("p");
        eshche.className = "crmStolbec__eshche";
        eshche.textContent = `ещё ${svoi.length - 40}`;
        mesto.appendChild(eshche);
      }
      if (!svoi.length) {
        const pusto = document.createElement("p");
        pusto.className = "crmStolbec__pusto";
        pusto.textContent = "пусто";
        mesto.appendChild(pusto);
      }
      stolbec.appendChild(mesto);

      stolbec.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        stolbec.classList.add("is-cel");
      });
      stolbec.addEventListener("dragleave", () => stolbec.classList.remove("is-cel"));
      stolbec.addEventListener("drop", (event) => {
        event.preventDefault();
        stolbec.classList.remove("is-cel");
        const nomer = Number(event.dataTransfer.getData("text/plain"));
        const zapis = (dannye.лоты || []).find((z) => z.id === nomer);
        if (zapis && zapis.status !== status) smenitStatus(zapis, status);
      });
      uzel.appendChild(stolbec);
    });

    // Хвост воронки карточками не показываем: отгруженных 779, снятых 876 —
    // это архив, на доске он только мешает. Итог виден числом, а разбирать
    // его идут в таблицу.
    [[KONEC, "Отгружено"], [SNYAT, "Снято с торгов"]].forEach(([status, imya]) => {
      const svoi = (dannye.лоты || []).filter((z) => z.status === status);
      const summa = svoi.reduce((n, z) => n + dengiLota(z).summa, 0);
      const itog = document.createElement("section");
      itog.className = "crmStolbec crmStolbec--itog";
      itog.innerHTML = `<header class="crmStolbec__shapka">
          <p class="crmStolbec__imya">${escape(imya)}</p>
          <p class="crmStolbec__svod"><b>${svoi.length}</b>${
            summa ? " · " + chislo(summa) + " ₽" : ""}</p>
        </header>
        <button class="crmKn crmStolbec__kn" type="button">Открыть в таблице</button>`;
      itog.querySelector("button").addEventListener("click", () => {
        perekluchit("loty");
        ochered = "";
        filtry = { status };
        narisovat();
      });
      // Сюда тоже можно перетащить: раньше закрыть лот с доски было нельзя,
      // приходилось идти в таблицу. Через подтверждение — шаг необратимый
      // по смыслу, и «снят с торгов» тем более.
      itog.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        itog.classList.add("is-cel");
      });
      itog.addEventListener("dragleave", () => itog.classList.remove("is-cel"));
      itog.addEventListener("drop", (event) => {
        event.preventDefault();
        itog.classList.remove("is-cel");
        const nomer = Number(event.dataTransfer.getData("text/plain"));
        const zapis = (dannye.лоты || []).find((z) => z.id === nomer);
        if (!zapis || zapis.status === status) return;
        if (!confirm(`Лот ${zapis.nomer} → «${imya}»?`)) return;
        smenitStatus(zapis, status);
      });
      uzel.appendChild(itog);
    });
  }

  /* Перетащили карточку — сохраняем статус и запоминаем шаг для Ctrl+Z.
   *
   * Локально проставляем и время смены: сервер вернёт лот без него, а «дней
   * в статусе» должно обнулиться сразу, иначе карточка останется красной.
   */
  async function smenitStatus(zapis, status) {
    const bylo = zapis.status;
    soobshchit(`Лот ${zapis.nomer}: ${status}`);
    try {
      const otvet = await fetch("/__crm/lot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: zapis.id, nomer: zapis.nomer, status }),
      });
      const itog = await otvet.json();
      if (!otvet.ok) throw new Error(itog.ошибка || "не сохранилось");
      Object.assign(zapis, itog);
      zapis.status_s = new Date().toISOString();
      otmena.push({ id: zapis.id, nomer: zapis.nomer, pole: "status", bylo });
      narisovatPlitki();
      narisovatGorit();
      narisovatFiltry();
      narisovatDosku();
    } catch (e) {
      soobshchit("Не сохранилось: " + (e.message || e));
      narisovatDosku();
    }
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

  function pokazat(v, tip) {
    if (v === null || v === undefined || v === "") return "";
    if (tip === "dengi" || tip === "chislo") return chislo(v);
    if (tip === "dolya") return dolya(v);
    if (tip === "data" || tip === "otgruzkaData") return data(v);
    return String(v);
  }

  function polyaKartochki(z, tip) {
    // С доски вкладка «doska», а показать надо поля лота — поэтому набор
    // колонок берём по типу записи, а не по открытой вкладке.
    const nabor = tip === "schet" ? STOLBCY_SCHETOV
                : tip === "ka" ? STOLBCY_KA
                : tip === "lot" ? STOLBCY : null;
    const kol = nabor || stolbcy();
    const vse = kol
      .filter((s) => s.tip !== "otgruzka" && s.tip !== "otgruzkaData")
      .map((s) => [s.imya, pokazat(z[s.pole], s.tip)]);

    // Отгрузки показываем парами: что и когда, иначе три пустые строки.
    (z.otgruzki || []).forEach((para, i) => {
      if (para["что"] || para["когда"]) {
        vse.push([`Отгрузка ${i + 1}`,
                  [para["что"], data(para["когда"])].filter(Boolean).join(" · ")]);
      }
    });

    return vse.filter(([, v]) => v !== "" && v !== null && v !== undefined)
      .map(([imya, v]) => `<div class="crmStroka"><span>${escape(imya)}</span>
        <b>${escape(v)}</b></div>`).join("");
  }

  /** Справочник контрагентов по имени — связь лота с базой КА.
   *  Имена в лотах и в базе иногда расходятся («Железный Аист» против
   *  «Желеный Аист»), поэтому сверяем по нижнему регистру и без краёв. */
  const klyuchKa = (imya) => String(imya || "").trim().toLowerCase();

  function kontragentPoImeni(imya) {
    if (!imya) return null;
    const klyuch = klyuchKa(imya);
    return (dannye.ка || []).find((k) => klyuchKa(k.ka) === klyuch) || null;
  }

  /** Блок «что это за клиент» в карточке лота: договор, деньги, его лоты. */
  function blokKontragenta(z) {
    const imya = z.ka;
    if (!imya) {
      return `<div class="crmKa"><p class="crmKa__net">Контрагент не указан —
        откройте «Править» и выберите из справочника</p></div>`;
    }
    const k = kontragentPoImeni(imya);
    const ego = (dannye.лоты || []).filter((x) => klyuchKa(x.ka) === klyuchKa(imya));
    const otgruzheno = ego.filter((x) => String(x.status || "").startsWith("10"));
    const summa = otgruzheno.reduce((n, x) => n + (Number(x.cena_otgruzki) || 0), 0);
    const okupy = otgruzheno.map((x) => Number(x.okup) || 0).filter((v) => v > 0);
    const sredniy = okupy.length ? okupy.reduce((a, b) => a + b, 0) / okupy.length : 0;

    const svoystva = k ? [
      ["Договор", k.dogovor ? (k.nomer_dogovora || "есть") : "нет"],
      ["ИНН", k.inn],
      ["Регион", k.region],
      ["Контакты", k.kontakty],
      ["Почта", k.email],
      ["Продаж всего", k.summa_prodazh ? `${chislo(k.summa_prodazh)} ₽` : ""],
      // В базе КА окуп лежит в процентах (13,77), а в лотах — долей (0,1377).
      ["Окуп по базе", k.okup ? (Number(k.okup) > 1.5
        ? `${Math.round(Number(k.okup))}%` : dolya(k.okup)) : ""],
      ["Последняя отгрузка", k.poslednyaya_otgruzka ? data(k.poslednyaya_otgruzka) : ""],
    ].filter(([, v]) => v) : [];

    return `<div class="crmKa">
      <p class="crmKa__zag">${escape(imya)}${k ? "" :
        ' <span class="crmKa__chuzhoy">нет в справочнике</span>'}</p>
      <p class="crmKa__stroka">${ego.length} ${sklonenie(ego.length, "лот", "лота", "лотов")}
        · отгружено ${otgruzheno.length} на ${chislo(summa)} ₽
        ${sredniy ? `· средний окуп ${dolya(sredniy)}` : ""}</p>
      ${svoystva.length ? `<div class="crmKa__svoystva">${svoystva.map(([imya2, v]) =>
        `<span><i>${escape(imya2)}</i>${escape(v)}</span>`).join("")}</div>` : ""}
      ${ego.length > 1 ? `<div class="crmKa__loty">${ego.slice(0, 12).map((x) =>
        `<button class="crmKa__lot${String(x.nomer) === String(z.nomer) ? " is-etot" : ""}"
                 type="button" data-lot-ka="${escape(x.nomer || "")}">
           ${escape(x.nomer || "—")} · ${escape(String(x.status || "").slice(0, 22))}
         </button>`).join("")}</div>` : ""}
    </div>`;
  }

  /** Обратная сторона связи: в карточке контрагента — его лоты и открытые
   *  задачи. Без этого база КА остаётся справочником, а не историей клиента. */
  function blokLotovKontragenta(k) {
    const ego = (dannye.лоты || []).filter((x) => klyuchKa(x.ka) === klyuchKa(k.ka));
    if (!ego.length) {
      return `<div class="crmKa"><p class="crmKa__net">Лотов по этому контрагенту
        в CRM нет — либо он новый, либо в лотах имя написано иначе</p></div>`;
    }
    const otgruzheno = ego.filter((x) => String(x.status || "").startsWith("10"));
    const v_rabote = ego.filter((x) => {
      const s = String(x.status || "");
      return s && !s.startsWith("10") && !s.startsWith("Снят");
    });
    const summa = otgruzheno.reduce((n, x) => n + (Number(x.cena_otgruzki) || 0), 0);
    const zadachi = ((dannye.задачи || {}).задачи || [])
      .filter((t) => !t.готово && klyuchKa(t.ка) === klyuchKa(k.ka));

    return `<div class="crmKa">
      <p class="crmKa__stroka"><b>${ego.length}</b> ${sklonenie(ego.length, "лот", "лота", "лотов")}
        · отгружено ${otgruzheno.length} на ${chislo(summa)} ₽
        · в работе ${v_rabote.length}
        ${zadachi.length ? `· открытых задач ${zadachi.length}` : ""}</p>
      <div class="crmKa__loty">${ego.slice(0, 24).map((x) =>
        `<button class="crmKa__lot" type="button" data-lot-ka="${escape(x.nomer || "")}">
           ${escape(x.nomer || "—")} · ${escape(String(x.status || "").slice(0, 22))}
         </button>`).join("")}</div>
    </div>`;
  }

  /** Деньги лота с быстрой правкой цены.
   *
   * На встрече 21.09 просили ровно это: «себестоимость по лоту не меняется, а
   * цена меняется» — значит правка цены должна быть в один клик из карточки,
   * а не через форму на двадцать полей. Окуп пересчитывает сервер.
   */
  function blokDeneg(z) {
    const cena = Number(z.cena_otgruzki) || 0;
    const sbs = Number(z.cena_sbs) || 0;
    const start = Number(z.startovaya_cena) || 0;
    const okup = sbs ? cena / sbs : 0;
    const otStarta = start && cena ? Math.round(100 * (cena - start) / start) : null;

    return `<div class="crmDengi">
      <div class="crmDengi__ryad">
        <div class="crmDengi__pole">
          <i>Цена отгрузки</i>
          <input class="crmDengi__vvod" id="crmCena" type="number" step="0.01"
                 value="${cena || ""}" placeholder="не указана">
        </div>
        <div class="crmDengi__pole">
          <i>Себестоимость</i>
          <b>${sbs ? chislo(sbs) + " ₽" : "—"}</b>
        </div>
        <div class="crmDengi__pole">
          <i>Окуп</i>
          <b class="${okup >= 0.2 ? "is-horosho" : okup ? "is-malo" : ""}"
             id="crmOkupPokaz">${okup ? dolya(okup) : "—"}</b>
        </div>
        ${start ? `<div class="crmDengi__pole">
          <i>Стартовая</i>
          <b>${chislo(start)} ₽${otStarta === null ? "" :
            ` <span class="crmDengi__delta">${otStarta > 0 ? "+" : ""}${otStarta}%</span>`}</b>
        </div>` : ""}
        <button class="crmKn crmKn--glav crmDengi__kn" type="button" id="crmCenaSohranit">
          Сохранить цену
        </button>
      </div>
      <p class="crmDengi__pod" id="crmCenaOtvet">себестоимость не трогаем — правится только цена,
        окуп пересчитается сам</p>
    </div>`;
  }

  /** История правок лота: подтягиваем отдельной ручкой, когда карточка открыта. */
  async function narisovatIstoriyu(nomer) {
    const uzel = el("crmIstoriya");
    if (!uzel) return;
    try {
      const otvet = await fetch(`/__crm/istoriya?объект=lot&ключ=${encodeURIComponent(nomer)}`,
                                { cache: "no-store" });
      if (!otvet.ok) { uzel.innerHTML = ""; return; }
      const spisok = await otvet.json();
      if (!spisok.length) {
        uzel.innerHTML = '<p class="crmHint">Правок по лоту пока не было</p>';
        return;
      }
      uzel.innerHTML = `<p class="crmIstoriya__zag">Что меняли</p>
        <div class="crmIstoriya__spisok">${spisok.map((s) => `
          <div class="crmIstoriya__stroka${s.деньги ? " is-dengi" : ""}">
            <span class="crmIstoriya__pole">${escape(s.поле)}</span>
            <span class="crmIstoriya__znak">${escape(s.было || "пусто")} → <b>${escape(s.стало || "пусто")}</b></span>
            <span class="crmIstoriya__kto">${escape(s.кто || "")} · ${escape(s.когда || "")}</span>
          </div>`).join("")}</div>`;
    } catch (oshibka) {
      uzel.innerHTML = "";
    }
  }

  /* --- Общение с контрагентом ------------------------------------------------
     Главная дыра, названная на встрече 21.09: «чего здесь нет — это
     коммуникация с клиентом». Полноценной почтовой интеграции пока нет, но
     половину пользы даёт журнал касаний плюс кнопки связи: у Битрикса нельзя
     писать в телеграм из карточки в принципе, а у нас — одним кликом. */

  const VIDY_KASANIY = ["звонок", "письмо", "сообщение", "встреча", "заметка"];
  const ZNACHKI = { "звонок": "☎", "письмо": "✉", "сообщение": "💬",
                    "встреча": "👥", "заметка": "✎" };

  /** Письмо через веб-почту Яндекса: поля подставляются в форму, отправляет
   *  человек сам из своего ящика. Обходит закрытый на сервере SMTP и заодно
   *  оставляет письмо в «Отправленных», откуда мы его потом и читаем. */
  function pismoSsylka(adres, tema, tekst) {
    const chasti = [`to=${encodeURIComponent(adres || "")}`];
    if (tema) chasti.push(`subject=${encodeURIComponent(tema)}`);
    if (tekst) chasti.push(`body=${encodeURIComponent(tekst)}`);
    return `https://mail.yandex.ru/compose?${chasti.join("&")}`;
  }

  /** Ссылки связи из контактов: телефон, почта, телеграм, ватсап. */
  function knopkiSvyazi(k) {
    if (!k) return "";
    const telefon = String(k.kontakty || "").match(/[\d+][\d\s()-]{9,}/);
    const cifry = telefon ? telefon[0].replace(/\D/g, "") : "";
    const knopki = [];
    if (cifry) {
      knopki.push(`<a class="crmSvyaz" href="tel:+${escape(cifry)}">Позвонить</a>`);
      const wa = String(k.whatsapp || "").replace(/\D/g, "") || cifry;
      knopki.push(`<a class="crmSvyaz" href="https://wa.me/${escape(wa)}"
                      target="_blank" rel="noopener">WhatsApp</a>`);
    }
    if (k.email) {
      // Два способа написать: почтовый клиент на компьютере и веб-почта.
      // Веб-почта важнее: SMTP с сервера закрыт хостером, а так письмо уходит
      // из ящика самого менеджера и потом видно у нас же, в «Отправленных».
      knopki.push(`<a class="crmSvyaz" href="${pismoSsylka(k.email)}"
                      target="_blank" rel="noopener">Написать в Яндексе</a>`);
      knopki.push(`<a class="crmSvyaz" href="mailto:${escape(k.email)}">Почтовый клиент</a>`);
    }
    if (k.telegram) {
      const imya = String(k.telegram).replace(/^@|^https?:\/\/t\.me\//, "");
      knopki.push(`<a class="crmSvyaz" href="https://t.me/${escape(imya)}"
                      target="_blank" rel="noopener">Телеграм</a>`);
    }
    return knopki.join("");
  }

  async function poslatObshchenie(telo, ka, lot) {
    const otvet = await fetch("/__crm/obshchenie", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo),
    });
    if (!otvet.ok) {
      const oshibka = await otvet.json().catch(() => ({}));
      alert(oshibka.ошибка || "не записалось");
      return;
    }
    narisovatObshchenie(ka, lot);
  }

  async function narisovatObshchenie(ka, lot) {
    const uzel = el("crmObshchenie");
    if (!uzel) return;
    const k = kontragentPoImeni(ka);
    const temaPisma = lot ? `Лот ${lot}` : "";
    let zhurnal = [];
    try {
      const adres = `/__crm/obshchenie?${ka ? `ка=${encodeURIComponent(ka)}` : ""}${
        ka && lot ? "&" : ""}${lot ? `лот=${encodeURIComponent(lot)}` : ""}`;
      const otvet = await fetch(adres, { cache: "no-store" });
      if (otvet.ok) zhurnal = await otvet.json();
    } catch (oshibka) { zhurnal = []; }

    const poslednee = zhurnal[0];
    uzel.innerHTML = `
      <div class="crmObsh__verh">
        <p class="crmObsh__zag">Общение${poslednee
          ? ` · последнее ${escape(poslednee.когда)}` : " · ещё не было"}</p>
        <div class="crmObsh__svyaz">${
          (k && k.email && temaPisma
            ? `<a class="crmSvyaz" href="${pismoSsylka(k.email, temaPisma)}"
                  target="_blank" rel="noopener">Написать про лот ${escape(lot)}</a>` : "")
          + (knopkiSvyazi(k)
             || '<span class="crmHint">контактов нет — добавьте их в карточке контрагента</span>')}</div>
      </div>
      <form class="crmObsh__forma" id="crmObshForma">
        <select name="vid">${VIDY_KASANIY.map((v) =>
          `<option value="${v}">${v}</option>`).join("")}</select>
        <select name="napravlen">
          <option value="мы">мы им</option>
          <option value="они">они нам</option>
        </select>
        <input name="tekst" placeholder="О чём договорились" required>
        <button class="crmKn" type="submit">Записать</button>
      </form>
      <div class="crmObsh__spisok">${zhurnal.length ? zhurnal.map((s) => `
        <div class="crmObsh__stroka" data-id="${s.id}">
          <span class="crmObsh__znachok" title="${escape(s.вид)}">${ZNACHKI[s.вид] || "•"}</span>
          <div>
            <p class="crmObsh__tekst">${escape(s.текст)}</p>
            <p class="crmObsh__pod">${escape(s.когда)} · ${escape(s.кто || "")}
              · ${s.направление === "они" ? "они нам" : "мы им"}${
                s.лот && s.лот !== String(lot) ? ` · лот ${escape(s.лот)}` : ""}</p>
          </div>
          <button class="crmObsh__ubrat" type="button" title="Удалить">×</button>
        </div>`).join("") : '<p class="crmHint">Записей пока нет</p>'}</div>`;

    el("crmObshForma").addEventListener("submit", (event) => {
      event.preventDefault();
      const forma = new FormData(event.target);
      poslatObshchenie({
        вид: forma.get("vid"), направление: forma.get("napravlen"),
        текст: forma.get("tekst"), ка: ka || null, лот: lot || null,
      }, ka, lot);
    });
    uzel.querySelectorAll(".crmObsh__ubrat").forEach((kn) => {
      kn.addEventListener("click", () => {
        if (!confirm("Удалить запись?")) return;
        poslatObshchenie({ действие: "удалить",
                           id: Number(kn.closest(".crmObsh__stroka").dataset.id) }, ka, lot);
      });
    });
  }

  /** Контакты контрагента правятся прямо в карточке: телефон, почта, телеграм,
   *  ватсап, заметка. Иначе связаться не с кем — а именно связь и просили. */
  function narisovatKontakty(k) {
    const uzel = el("crmKontakty");
    if (!uzel) return;
    const polya = [
      { pole: "kontakty", imya: "Телефон и имя", mesto: "Иванов Иван, 7 900 000 00 00" },
      { pole: "email", imya: "Почта", mesto: "mail@example.ru" },
      { pole: "telegram", imya: "Телеграм", mesto: "@username" },
      { pole: "whatsapp", imya: "WhatsApp", mesto: "79000000000" },
      { pole: "zametka", imya: "Заметка", mesto: "как с ним работать", shirokoe: true },
    ];
    uzel.innerHTML = `
      <p class="crmObsh__zag">Контакты</p>
      <form class="crmKontakty__forma" id="crmKontaktyForma">
        ${polya.map((p) => `<label class="crmPole${p.shirokoe ? " crmPole--shirokoe" : ""}">
          <span>${escape(p.imya)}</span>
          <input name="${p.pole}" value="${escape(k[p.pole] || "")}"
                 placeholder="${escape(p.mesto)}">
        </label>`).join("")}
        <div class="crmKontakty__niz">
          <button class="crmKn" type="submit">Сохранить контакты</button>
          <span class="crmOtvet" id="crmKontaktyOtvet"></span>
        </div>
      </form>`;
    el("crmKontaktyForma").addEventListener("submit", async (event) => {
      event.preventDefault();
      const forma = new FormData(event.target);
      const otvet = el("crmKontaktyOtvet");
      otvet.textContent = "сохраняю…";
      const zapros = await fetch("/__crm/obshchenie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ действие: "контакты", ка: k.ka,
                               поля: Object.fromEntries(forma.entries()) }),
      });
      if (!zapros.ok) {
        const oshibka = await zapros.json().catch(() => ({}));
        otvet.textContent = oshibka.ошибка || "не сохранилось";
        return;
      }
      Object.assign(k, Object.fromEntries(forma.entries()));
      otvet.textContent = "сохранено";
      narisovatObshchenie(k.ka, null);
    });
  }

  /** Переписка из почтового ящика. Пока ящик не настроен, честно объясняем,
   *  что нужно, — пустой блок выглядел бы поломкой.
   *
   *  Адрес можно поменять руками: у контрагента часто несколько ящиков —
   *  менеджер, бухгалтерия, общий, — и переписка лежит не под тем, что
   *  записан в базе. Заодно так видно, как блок выглядит с живыми письмами. */
  async function narisovatPochtu(adres, svoy) {
    const uzel = el("crmPochta");
    if (!uzel) return;
    if (!adres) {
      uzel.innerHTML = `<p class="crmObsh__zag">Почта</p>
        <p class="crmHint">у контрагента не указан адрес — добавьте его в контактах
          или найдите переписку по любому адресу</p>
        <form class="crmPochta__poisk" id="crmPochtaPoisk">
          <input name="adres" placeholder="адрес для поиска">
          <button class="crmKn" type="submit">Показать</button>
        </form>`;
      const forma = el("crmPochtaPoisk");
      forma.addEventListener("submit", (event) => {
        event.preventDefault();
        narisovatPochtu(new FormData(event.target).get("adres").trim(), true);
      });
      return;
    }
    uzel.innerHTML = '<p class="crmObsh__zag">Почта</p><p class="crmHint">смотрю ящик…</p>';
    let dan = { включено: false, письма: [] };
    try {
      const otvet = await fetch(`/__crm/pochta?адрес=${encodeURIComponent(adres)}`,
                                { cache: "no-store" });
      if (otvet.ok) dan = await otvet.json();
    } catch (oshibka) { dan = { включено: false, письма: [] }; }

    if (!dan.включено) {
      uzel.innerHTML = `<p class="crmObsh__zag">Почта</p>
        <p class="crmHint">ящик не подключён. когда появится почтовый ящик отдела и
          пароль приложения, письма с адреса <b>${escape(adres)}</b> будут видны прямо здесь</p>
        <div class="crmObsh__svyaz">
          <a class="crmSvyaz" href="${pismoSsylka(adres)}"
             target="_blank" rel="noopener">Написать в Яндексе</a>
          <a class="crmSvyaz" href="mailto:${escape(adres)}">Почтовый клиент</a>
        </div>`;
      return;
    }
    if (dan.ошибка) {
      uzel.innerHTML = `<p class="crmObsh__zag">Почта</p>
        <p class="crmHint">ящик подключён, но ответа нет: ${escape(dan.ошибка)}</p>`;
      return;
    }
    const pisma = dan.письма || [];
    uzel.innerHTML = `<div class="crmObsh__verh">
        <p class="crmObsh__zag">Почта · ${pisma.length}</p>
        <form class="crmPochta__poisk" id="crmPochtaPoisk">
          <input name="adres" value="${escape(adres)}" placeholder="адрес для поиска">
          <button class="crmKn" type="submit">Показать</button>
        </form>
        <div class="crmObsh__svyaz">
          <a class="crmSvyaz" href="${pismoSsylka(adres)}"
             target="_blank" rel="noopener">Написать в Яндексе</a>
          <a class="crmSvyaz" href="mailto:${escape(adres)}">Почтовый клиент</a>
        </div>
      </div>
      ${pisma.length ? `<div class="crmObsh__spisok">${pisma.map((p) => `
        <div class="crmPismo${p.наше ? " is-nashe" : ""}">
          <p class="crmPismo__tema">${escape(p.тема)}</p>
          <p class="crmPismo__pod">${escape(p.когда)} · ${p.наше ? "мы им" : "они нам"}
            · ${escape(p.от)}</p>
          ${p.текст ? `<p class="crmPismo__tekst">${escape(p.текст.slice(0, 400))}</p>` : ""}
        </div>`).join("")}</div>`
        : '<p class="crmHint">писем с этим адресом в ящике нет — попробуйте другой'
          + ' адрес этого же клиента</p>'}`;

    const poisk = el("crmPochtaPoisk");
    if (poisk) {
      poisk.addEventListener("submit", (event) => {
        event.preventDefault();
        narisovatPochtu(new FormData(event.target).get("adres").trim(), true);
      });
    }
  }

  function otkrytKartochku(z) {
    if (!z) return;
    // Тип определяем по самой записи, а не по открытой вкладке: с доски
    // карточка лота открывалась как «Счёт по лоту —» и без кнопки «Править»,
    // потому что vid там «doska». Лот узнаём по номеру, счёт — по операторам.
    const tip = z.nomer !== undefined ? "lot"
              : z.operator !== undefined || z.status_operatora !== undefined ? "schet"
              : "ka";
    const zag = tip === "ka" ? String(z.ka || "Контрагент")
             : tip === "lot" ? `Лот ${z.nomer || "—"}`
             : `Счёт по лоту ${z.lot || "—"}`;
    el("crmOknoDoc").innerHTML = `
      <div class="crmOkno__top">
        <span class="crmOkno__teg">${escape(
          tip === "ka" ? "Контрагент" : tip === "lot" ? "Лот" : "Счёт")}</span>
        <div class="crmOkno__act">
          ${tip === "lot" ? '<button class="crmKn" type="button" data-pravit>Править</button>' : ""}
          <button class="crmKn" type="button" data-zakryt>Закрыть</button>
        </div>
      </div>
      <h2>${escape(zag)}</h2>
      ${tip === "ka" ? blokLotovKontragenta(z) : ""}
      ${tip === "lot" ? blokKontragenta(z) + blokDeneg(z) + blokSchetov(z) : ""}
      ${tip === "lot" ? '<div class="crmPallety" id="crmPallety"></div>' : ""}
      ${tip === "lot" || tip === "ka" ? '<div class="crmLenta" id="crmLenta"></div>' : ""}
      ${tip === "ka" || (tip === "lot" && z.ka)
        ? '<div class="crmObsh" id="crmObshchenie"></div>' : ""}
      ${tip === "ka" ? '<div class="crmPochta" id="crmPochta"></div>' : ""}
      ${tip === "ka" ? '<div class="crmKontakty" id="crmKontakty"></div>' : ""}
      <div class="crmKartochka">${polyaKartochki(z, tip)}</div>
      ${tip === "lot" ? '<div class="crmIstoriya" id="crmIstoriya"></div>' : ""}`;
    el("crmOkno").hidden = false;
    const pravit = el("crmOknoDoc").querySelector("[data-pravit]");
    if (pravit) pravit.addEventListener("click", () => otkrytFormu(z));

    const knopkaCeny = el("crmCenaSohranit");
    if (knopkaCeny) {
      const pole = el("crmCena");
      const otvet = el("crmCenaOtvet");
      // Окуп пересчитываем на глазах, пока печатают: так видно, куда идёт сделка.
      pole.addEventListener("input", () => {
        const sbs = Number(z.cena_sbs) || 0;
        const novaya = Number(pole.value) || 0;
        const pokaz = el("crmOkupPokaz");
        const okup = sbs ? novaya / sbs : 0;
        pokaz.textContent = okup ? dolya(okup) : "—";
        pokaz.className = okup >= 0.2 ? "is-horosho" : okup ? "is-malo" : "";
      });
      knopkaCeny.addEventListener("click", async () => {
        const novaya = pole.value === "" ? null : Number(pole.value);
        if (novaya !== null && !Number.isFinite(novaya)) {
          otvet.textContent = "цена должна быть числом";
          return;
        }
        knopkaCeny.disabled = true;
        otvet.textContent = "сохраняю…";
        const zapros = await fetch("/__crm/lot", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: z.id, cena_otgruzki: novaya }),
        });
        knopkaCeny.disabled = false;
        if (!zapros.ok) {
          const oshibka = await zapros.json().catch(() => ({}));
          otvet.textContent = oshibka.ошибка || "не сохранилось";
          return;
        }
        const svezhiy = await zapros.json();
        Object.assign(z, svezhiy);
        const mesto = (dannye.лоты || []).findIndex((x) => x.id === z.id);
        if (mesto >= 0) Object.assign(dannye.лоты[mesto], svezhiy);
        otvet.textContent = `сохранено · окуп ${dolya(svezhiy.okup) || "—"}`;
        narisovat();
        narisovatIstoriyu(z.nomer);
      });
    }
    if (el("crmIstoriya")) narisovatIstoriyu(z.nomer);
    if (el("crmObshchenie")) {
      narisovatObshchenie(tip === "ka" ? z.ka : z.ka, tip === "lot" ? z.nomer : null);
    }
    if (el("crmKontakty")) narisovatKontakty(z);
    if (el("crmPochta")) narisovatPochtu(z.email);
    if (el("crmPallety")) narisovatPallety(z.nomer);
    if (el("crmLenta")) narisovatLentu(tip === "ka" ? z.ka : z.ka, tip === "lot" ? z.nomer : null);
    // Соседние лоты того же контрагента открываются прямо из карточки.
    el("crmOknoDoc").querySelectorAll("[data-lot-ka]").forEach((kn) => {
      kn.addEventListener("click", () => {
        const drugoy = (dannye.лоты || []).find((x) =>
          String(x.nomer) === kn.dataset.lotKa);
        if (!drugoy) return;
        // Из карточки контрагента уходим в лоты: иначе карточка лота
        // отрисуется по правилам базы КА и покажет не то.
        if (vid === "ka") { perekluchit("loty"); narisovat(); }
        otkrytKartochku(drugoy);
      });
    });
  }

  /* Выпадающие списки формы лота — «в создании лота не все выпадающие
     списки» (23.09). Значения берём из уже заведённых лотов; свой вариант —
     пунктом «другое…», чтобы новый менеджер или склад не ждали правки кода. */
  const MESYACY_OTGRUZKI = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль",
    "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

  function nedeliVpered() {
    const itog = [];
    const d = new Date();
    const pn = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) - 14);
    for (let i = 0; i < 14; i += 1) {
      const a = new Date(pn.getFullYear(), pn.getMonth(), pn.getDate() + 7 * i);
      const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
      const dd = (x) => String(x.getDate()).padStart(2, "0");
      itog.push(`${dd(a)}-${dd(b)}.${String(b.getMonth() + 1).padStart(2, "0")}`);
    }
    return itog;
  }

  function spisokPolya(pole) {
    const iz = (klyuch) => [...new Set((dannye.лоты || []).map((z) => String(z[klyuch] || "").trim())
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    if (pole === "menedzher") return iz("menedzher");
    if (pole === "region") return iz("region");
    if (pole === "kategoriya") return iz("kategoriya");
    if (pole === "mesyac_otgruzki") return MESYACY_OTGRUZKI;
    if (pole === "nedelya_plan") return nedeliVpered();
    return null;
  }

  function otkrytFormu(z) {
    const est = z || {};
    // Новый лот сразу с сегодняшней датой и собой в менеджерах: это почти
    // всегда так, а пустые поля потом забывают.
    const poUmolchaniyu = z ? {} : {
      data_vystavleniya: new Date().toISOString().slice(0, 10),
      // Себя подставляем, только если ты и правда менеджер продаж.
      menedzher: (spisokPolya("menedzher") || []).includes((dannye.кто && dannye.кто.имя) || "")
        ? dannye.кто.имя : "",
      mesyac_otgruzki: MESYACY_OTGRUZKI[new Date().getMonth()],
    };
    const polya = POLYA_FORMY.map((p) => {
      const syroe = est[p.pole] ?? poUmolchaniyu[p.pole];
      const znachenie = syroe == null ? "" : String(syroe).slice(0, p.tip === "date" ? 10 : 200);
      const spisok = p.spisok || spisokPolya(p.pole);
      const varianty = spisok && znachenie && !spisok.includes(znachenie) ? [znachenie, ...spisok] : spisok;
      const vvod = varianty
        ? `<select name="${p.pole}"${p.nuzhno ? " required" : ""}><option value=""></option>${varianty.map((s) =>
            `<option${s === znachenie ? " selected" : ""}>${escape(s)}</option>`).join("")}${
            p.spisok ? "" : '<option value="__drugoe">другое…</option>'}</select>`
        : `<input name="${p.pole}" type="${p.tip || "text"}" value="${escape(znachenie)}"
             ${p.podskazka ? `list="${p.podskazka}"` : ""} ${p.nuzhno ? "required" : ""}>`;
      return `<label class="crmPole${p.shirokoe ? " crmPole--shirokoe" : ""}${p.podskazka ? " crmPole--spisok" : ""}">
        <span>${escape(p.imya)}</span>${vvod}</label>`;
    }).join("");

    el("crmOknoDoc").innerHTML = `
      <div class="crmOkno__top">
        <span class="crmOkno__teg">${z ? "Правка лота" : "Новый лот"}</span>
        <div class="crmOkno__act"><button class="crmKn" type="button" data-zakryt>Закрыть</button></div>
      </div>
      <h2>${z ? `Лот ${escape(z.nomer || "")}` : "Новый лот"}</h2>
      <p class="crmPodskazka">Окуп считается сам: цена отгрузки делится на себестоимость.</p>
      <datalist id="crmKaSpisok">${(dannye.ка || [])
        .map((k) => `<option value="${escape(k.ka || "")}">`).join("")}</datalist>
      <form class="crmForma" id="crmForma">${polya}
        <div class="crmForma__niz">
          <button class="crmKn crmKn--glav" type="submit">Сохранить</button>
          <span class="crmOtvet" id="crmOtvet"></span>
        </div>
      </form>`;
    el("crmOkno").hidden = false;

    el("crmForma").querySelectorAll("select").forEach((vybor) => {
      vybor.addEventListener("change", () => {
        if (vybor.value !== "__drugoe") return;
        const svoyo = (prompt("Своё значение") || "").trim();
        if (!svoyo) { vybor.value = ""; return; }
        const opt = document.createElement("option");
        opt.textContent = svoyo;
        vybor.insertBefore(opt, vybor.options[1]);
        vybor.value = svoyo;
      });
    });

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
      if (zapis && shag.pole === "status") zapis.status_s = new Date().toISOString();
      narisovatPlitki();
      narisovatGorit();
      if (vid === "doska") narisovatDosku(); else narisovatTablicu();
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

  /* Выбор менеджера. «Мои лоты» — первое, что спрашивают у любой CRM, а у нас
   * менеджер проставлен меньше чем у половины лотов, поэтому отдельным
   * пунктом даём и тех, у кого его нет.
   */
  function narisovatVybor() {
    const vybor = el("crmKto");
    if (!vybor) return;
    const spisok = [...new Set((dannye.лоты || []).map((z) => String(z.menedzher || "").trim())
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const teper = filtry.menedzher || "";
    vybor.innerHTML = '<option value="">Все менеджеры</option>'
      + spisok.map((imya) => `<option${imya === teper ? " selected" : ""}>${
        escape(imya)}</option>`).join("");

    // Склад — это «Регион» лота (ДМД, СПБ, НСК…). Попросили продажи 23.09:
    // «можно сделать фильтр по складу? не нашёл». Сверху — где больше живых лотов.
    const sklad = el("crmSklad");
    if (sklad) {
      const zhivye = new Map();
      (dannye.лоты || []).forEach((z) => {
        const r = String(z.region || "").trim();
        if (!r) return;
        zhivye.set(r, (zhivye.get(r) || 0) + (aktivnyy(z) ? 1 : 0));
      });
      const sklady = [...zhivye.keys()].sort((a, b) =>
        (zhivye.get(b) - zhivye.get(a)) || a.localeCompare(b, "ru"));
      const vybran = filtry.region || "";
      sklad.innerHTML = '<option value="">Все склады</option>'
        + sklady.map((r) => `<option value="${escape(r)}"${r === vybran ? " selected" : ""}>${
          escape(r)}${zhivye.get(r) ? ` · ${zhivye.get(r)} в работе` : ""}</option>`).join("");
    }
  }

  /* --- Задачи менеджеров ----------------------------------------------------
     Просьба со встречи-штурма 21.09: менеджер открывает CRM и видит, что ему
     делать сегодня. Чужие задачи видны всем — человек уходит на больничный, и
     его дела надо подхватить. */

  async function poslatZadachu(telo) {
    const otvet = await fetch("/__crm/zadacha", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo),
    });
    if (!otvet.ok) {
      const oshibka = await otvet.json().catch(() => ({}));
      alert(oshibka.ошибка || "не получилось сохранить задачу");
      return;
    }
    dannye.задачи = await otvet.json();
    narisovat();
    narisovatKolokolchik();
  }

  /* Разбивка по срокам, а не плоский список: так это устроено у всех, кто
     живёт в CRM каждый день. В Битрикс24 есть отдельный режим «Дела» с
     колонками «просрочены / сегодня / завтра / без дел», у Zoho просроченное
     всегда наверху. Логика одна: сначала долги, потом сегодняшнее, остальное
     ниже — и в каждой строке видно, к какому лоту это относится. */
  const GRUPPY_ZADACH = [
    { key: "prosrocheno", imya: "Просрочено", klass: "is-prosrochena" },
    { key: "segodnya", imya: "Сегодня", klass: "is-segodnya" },
    { key: "zavtra", imya: "Завтра", klass: "" },
    { key: "pozzhe", imya: "Дальше", klass: "" },
    { key: "bez_sroka", imya: "Без срока", klass: "" },
  ];

  function gruppaZadachi(z) {
    if (z.просрочена) return "prosrocheno";
    if (z.на_сегодня) return "segodnya";
    if (!z.срок) return "bez_sroka";
    const zavtra = new Date();
    zavtra.setDate(zavtra.getDate() + 1);
    return z.срок.slice(0, 10) === zavtra.toISOString().slice(0, 10) ? "zavtra" : "pozzhe";
  }

  function strokaZadachi(z) {
    const klass = z.готово ? " is-gotovo" : z.просрочена ? " is-prosrochena"
                : z.на_сегодня ? " is-segodnya" : "";
    const vremya = z.время ? ` в ${z.время}` : "";
    const srok = z.срок
      ? (z.просрочена ? `просрочено с ${data(z.срок)}${vremya}`
         : z.на_сегодня ? `сегодня${vremya}` : data(z.срок) + vremya)
      : "без срока";
    // Лот в строке обязателен: задача без объекта в CRM ничего не значит.
    const lot = z.лот
      ? `<button class="crmZad__lot" type="button" data-lot="${escape(z.лот)}">лот ${escape(z.лот)}</button>`
      : "";
    return `<div class="crmZad${klass}" data-id="${z.id}">
      <button class="crmZad__gal" type="button" data-gotovo="${z.готово ? "1" : "0"}"
              title="${z.готово ? "Вернуть в работу" : "Сделано"}">${z.готово ? "✓" : ""}</button>
      <div class="crmZad__telo">
        <p class="crmZad__tekst">${escape(z.текст)}</p>
        <p class="crmZad__pod"><span class="crmZad__srok">${srok}</span>
          · ${escape(z.менеджер || "без исполнителя")}${z.ка ? " · " + escape(z.ка) : ""}</p>
      </div>
      ${lot}
      ${z.готово ? "" : `<button class="crmZad__perenos" type="button" title="Перенести на завтра">→</button>`}
      <button class="crmZad__ubrat" type="button" title="Удалить">×</button>
    </div>`;
  }

  function narisovatZadachi() {
    const uzel = el("crmZadachi");
    const dan = dannye.задачи || { задачи: [], по_людям: [] };
    const spisok = dan.задачи || [];
    const moyo = (dannye.кто && dannye.кто.имя) || "";
    const ktoFiltr = filtry.menedzher || "";
    const vidimye = ktoFiltr
      ? spisok.filter((z) => (z.менеджер || "") === ktoFiltr) : spisok;

    const menedzhery = [...new Set((dannye.лоты || []).map((z) => z.menedzher)
      .concat(spisok.map((z) => z.менеджер)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ru"));

    const otkrytye = vidimye.filter((z) => !z.готово);
    const sdelannye = vidimye.filter((z) => z.готово);

    // Лоты без единой открытой задачи. У Pipedrive это главный сигнал: сделка
    // без следующего шага опаснее просроченной, потому что про неё просто
    // забыли. Берём активные лоты месяца, чтобы список не разрастался.
    const sZadachey = new Set(spisok.filter((z) => !z.готово && z.лот).map((z) => String(z.лот)));
    const mesyac = (dannye.план || {}).месяц || "";
    const bezZadach = (dannye.лоты || []).filter((z) => {
      const st = String(z.status || "");
      if (!st || st.startsWith("10") || st.startsWith("Снят")) return false;
      if (mesyac && (z.mesyac_otgruzki || "") !== mesyac) return false;
      if (ktoFiltr && (z.menedzher || "") !== ktoFiltr) return false;
      return !sZadachey.has(String(z.nomer || ""));
    });

    const gruppy = GRUPPY_ZADACH.map((g) => ({
      ...g, zadachi: otkrytye.filter((z) => gruppaZadachi(z) === g.key),
    })).filter((g) => g.zadachi.length);

    uzel.innerHTML = `
      <form class="crmZadNovaya" id="crmZadNovaya">
        <input name="tekst" placeholder="Что сделать" required>
        <select name="menedzher">
          <option value="">на кого?</option>
          ${menedzhery.map((m) => `<option${m === moyo ? " selected" : ""}>${escape(m)}</option>`).join("")}
        </select>
        <input name="srok" type="date" title="Когда сделать" id="crmZadSrok">
        <input name="vremya" type="time" title="Во сколько" id="crmZadVremya">
        <input name="lot" placeholder="лот" list="crmLotySpisok" id="crmZadLot">
        <button class="crmKn crmKn--glav" type="submit">Добавить</button>
      </form>
      <datalist id="crmLotySpisok">${(dannye.лоты || []).slice(0, 400)
        .map((z) => `<option value="${escape(z.nomer || "")}">`).join("")}</datalist>

      <div class="crmZadSvod">
        <button class="crmZadKto${ktoFiltr ? "" : " is-on"}" type="button" data-kto="">
          <b>Все</b><span>${dan.открытых} открыто${dan.просрочено ? ` · ${dan.просрочено} просрочено` : ""}</span>
        </button>
        ${(dan.по_людям || []).map((x) => `
        <button class="crmZadKto${ktoFiltr === x.менеджер ? " is-on" : ""}" type="button"
                data-kto="${escape(x.менеджер)}">
          <b>${escape(x.менеджер)}</b>
          <span>${x.всего} ${sklonenie(x.всего, "задача", "задачи", "задач")}${
            x.просрочено ? ` · ${x.просрочено} просрочено` : ""}${
            x.на_сегодня ? ` · ${x.на_сегодня} сегодня` : ""}</span>
        </button>`).join("")}
      </div>

      ${gruppy.length ? gruppy.map((g) => `
        <p class="crmZadZag ${g.klass}">${g.imya} · ${g.zadachi.length}</p>
        <div class="crmZadSpisok">${g.zadachi.map(strokaZadachi).join("")}</div>`).join("")
        : '<p class="crmHint">Открытых задач нет</p>'}

      ${bezZadach.length ? `
        <p class="crmZadZag is-vnimanie">Лоты без следующего шага · ${bezZadach.length}</p>
        <p class="crmHint">лот в работе, а задачи по нему нет — про такие забывают чаще, чем про просроченные</p>
        <div class="crmZadBez">${bezZadach.slice(0, 40).map((z) => `
          <button class="crmZadBez__lot" type="button" data-lot="${escape(z.nomer || "")}"
                  data-kto="${escape(z.menedzher || "")}">
            <b>Лот ${escape(z.nomer || "—")}</b>
            <span>${escape(z.status || "")} · ${escape(z.menedzher || "без менеджера")}</span>
            <span>${chislo(dengiLota(z).summa)} ₽</span>
          </button>`).join("")}</div>` : ""}

      ${sdelannye.length ? `<p class="crmZadZag">Сделано за неделю · ${sdelannye.length}</p>
        <div class="crmZadSpisok">${sdelannye.map(strokaZadachi).join("")}</div>` : ""}

      ${cheklistyHtml()}`;

    el("crmZadNovaya").addEventListener("submit", (event) => {
      event.preventDefault();
      const forma = new FormData(event.target);
      poslatZadachu({
        tekst: forma.get("tekst"), menedzher: forma.get("menedzher"),
        srok: forma.get("srok") || null, vremya: forma.get("vremya") || null,
        lot: forma.get("lot") || null,
      });
    });
    uzel.querySelectorAll(".crmZadKto").forEach((kn) => {
      kn.addEventListener("click", () => {
        filtry.menedzher = kn.dataset.kto || "";
        narisovatZadachi();
      });
    });
    uzel.querySelectorAll(".crmZad__gal").forEach((kn) => {
      kn.addEventListener("click", () => poslatZadachu({
        действие: "закрыть", id: Number(kn.closest(".crmZad").dataset.id),
        готово: kn.dataset.gotovo !== "1",
      }));
    });
    // Перенос на завтра одной кнопкой — без него просрочка копится и список
    // перестают открывать.
    uzel.querySelectorAll(".crmZad__perenos").forEach((kn) => {
      kn.addEventListener("click", () => {
        const zavtra = new Date();
        zavtra.setDate(zavtra.getDate() + 1);
        poslatZadachu({ id: Number(kn.closest(".crmZad").dataset.id),
                        srok: zavtra.toISOString().slice(0, 10) });
      });
    });
    uzel.querySelectorAll(".crmZad__ubrat").forEach((kn) => {
      kn.addEventListener("click", () => {
        if (!confirm("Удалить задачу?")) return;
        poslatZadachu({ действие: "удалить", id: Number(kn.closest(".crmZad").dataset.id) });
      });
    });
    uzel.querySelectorAll("[data-lot]").forEach((kn) => {
      kn.addEventListener("click", () => {
        const lot = (dannye.лоты || []).find((z) => String(z.nomer) === kn.dataset.lot);
        if (kn.classList.contains("crmZadBez__lot")) {
          // Клик по лоту без задачи — подставляем его в форму, чтобы поставить шаг.
          el("crmZadLot").value = kn.dataset.lot;
          const kto = el("crmZadNovaya").querySelector("[name=menedzher]");
          if (kn.dataset.kto) kto.value = kn.dataset.kto;
          el("crmZadNovaya").querySelector("[name=tekst]").focus();
          window.scrollTo({ top: el("crmZadachi").offsetTop - 80, behavior: "smooth" });
          return;
        }
        if (lot) pokazat(lot);
      });
    });

    podklyuchitCheklisty(uzel);

    el("crmSchyot").textContent =
      `${dan.открытых} ${sklonenie(dan.открытых, "открытая задача", "открытых задачи", "открытых задач")}`
      + (dan.просрочено ? ` · просрочено ${dan.просрочено}` : "")
      + (dan.на_сегодня ? ` · на сегодня ${dan.на_сегодня}` : "")
      + (bezZadach.length ? ` · лотов без следующего шага ${bezZadach.length}` : "")
      + " · задачи видны всем: если человек на больничном, дело подхватывают";
  }

  /** Вкладка «Почта»: последние письма своего ящика и поиск по адресу.
   *
   *  Нужна как видимое место: без неё подключение ящика выглядело бы
   *  настройкой, от которой ничего не происходит. Отсюда же ссылка на
   *  подключение, если ящик ещё не привязан. */
  function pismoHtml(p) {
    return `<div class="crmPismo${p.наше ? " is-nashe" : ""}">
      <p class="crmPismo__tema">${escape(p.тема)}</p>
      <p class="crmPismo__pod">${escape(p.когда)} · ${p.наше ? "мы им" : "они нам"}
        · ${escape(p.наше ? p.кому : p.от)}</p>
      ${p.текст ? `<p class="crmPismo__tekst">${escape(p.текст.slice(0, 300))}</p>` : ""}
    </div>`;
  }

  async function narisovatPochtuVid() {
    const uzel = el("crmPochtaVid");
    if (!uzel) return;
    uzel.innerHTML = '<p class="crmHint">смотрю ящик…</p>';
    let dan = { включено: false, письма: [] };
    try {
      const otvet = await fetch("/__crm/pochta", { cache: "no-store" });
      if (otvet.ok) dan = await otvet.json();
    } catch (oshibka) { dan = { включено: false, письма: [] }; }

    if (!dan.включено) {
      uzel.innerHTML = `<div class="crmPochta">
        <p class="crmObsh__zag">Почта не подключена</p>
        <p class="crmHint">подключите свой рабочий ящик — и переписка с контрагентом
          будет видна прямо в его карточке, без перехода в почту. ящик у каждого
          свой: коллеги видят свою переписку, а не вашу.</p>
        <div class="crmObsh__svyaz"><a class="crmSvyaz" href="/__pochta">Подключить ящик</a></div>
      </div>`;
      return;
    }

    const pisma = dan.письма || [];
    // Кто чаще пишет — сразу видно, с кем идёт работа.
    const poAdresam = new Map();
    pisma.forEach((p) => {
      const adres = (String(p.наше ? p.кому : p.от).match(/[\w.+-]+@[\w.-]+/) || [""])[0];
      if (adres) poAdresam.set(adres, (poAdresam.get(adres) || 0) + 1);
    });

    uzel.innerHTML = `
      <form class="crmPochta__poisk crmPochta__poisk--vid" id="crmPochtaVidPoisk">
        <input name="adres" placeholder="найти переписку по адресу">
        <button class="crmKn" type="submit">Показать</button>
        <a class="crmSvyaz" href="/__pochta">Настройки ящика</a>
      </form>
      <div class="crmZadSvod">${[...poAdresam.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([adres, skolko]) => `<button class="crmZadKto" type="button"
           data-adres="${escape(adres)}"><b>${escape(adres)}</b>
           <span>${skolko} ${sklonenie(skolko, "письмо", "письма", "писем")}</span></button>`).join("")}
      </div>
      <div class="crmObsh__spisok crmPochta__spisok">${pisma.map(pismoHtml).join("")}</div>`;

    const pokazat = async (adres) => {
      const spisok = uzel.querySelector(".crmPochta__spisok");
      spisok.innerHTML = '<p class="crmHint">ищу…</p>';
      const otvet = await fetch(`/__crm/pochta?адрес=${encodeURIComponent(adres)}`,
                                { cache: "no-store" });
      const nashlos = otvet.ok ? await otvet.json() : { письма: [] };
      spisok.innerHTML = (nashlos.письма || []).length
        ? nashlos.письма.map(pismoHtml).join("")
        : '<p class="crmHint">писем с этим адресом не нашлось</p>';
    };

    el("crmPochtaVidPoisk").addEventListener("submit", (event) => {
      event.preventDefault();
      const adres = new FormData(event.target).get("adres").trim();
      if (adres) pokazat(adres);
    });
    uzel.querySelectorAll("[data-adres]").forEach((kn) => {
      kn.addEventListener("click", () => {
        uzel.querySelector("[name=adres]").value = kn.dataset.adres;
        pokazat(kn.dataset.adres);
      });
    });

  }





  /* --- Паллеты лота -----------------------------------------------------------
     «Вся база паллет, доступных для выбора, будет сразу тут» — встреча 21.09.
     Список берём из того же реестра, что и раздел «Паллеты»: только доступные
     к продаже, и без тех, что уже разобраны по другим лотам. */

  async function poslatPallety(telo, lot) {
    const otvet = await fetch("/__crm/pallety", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo),
    });
    if (!otvet.ok) {
      const oshibka = await otvet.json().catch(() => ({}));
      alert(oshibka.ошибка || "не получилось");
      return null;
    }
    return otvet.json();
  }

  /* Паллеты лота. Свободные показываем сразу списком, без поиска: «паллеты
     должны хаваться ещё и списком сразу» (23.09). Сверху — склад лота,
     фильтр по номеру сужает на лету, отмеченные добавляются одной кнопкой. */
  async function narisovatPallety(lot) {
    const uzel = el("crmPallety");
    if (!uzel || !lot) return;
    uzel.innerHTML = '<p class="crmObsh__zag">Паллеты лота</p><p class="crmHint">смотрю…</p>';
    const [sostav, nashlos] = await Promise.all([
      poslatPallety({ действие: "состав", лот: lot }, lot),
      poslatPallety({ действие: "свободные", поиск: "" }, lot),
    ]);
    if (!sostav) { uzel.innerHTML = ""; return; }

    const zapis = (dannye.лоты || []).find((x) => String(x.nomer) === String(lot)) || {};
    const skladLota = String(zapis.region || "").trim();
    const svoySklad = (p) => skladLota && String(p.регион || "").toUpperCase().includes(skladLota.toUpperCase());
    const svobodnye = ((nashlos && nashlos.свободные) || [])
      .sort((a, b) => (svoySklad(b) - svoySklad(a)) || ((b.себестоимость || 0) - (a.себестоимость || 0)));

    const spisok = sostav.паллеты || [];
    const stroka = (p, vybor) => `
      <${vybor ? "label" : "div"} class="crmPalletR${vybor ? " crmPalletR--vybor" : ""}" data-pallet="${escape(p.паллета)}">
        ${vybor ? `<input type="checkbox" value="${escape(p.паллета)}" data-sebes="${Number(p.себестоимость) || 0}">` : "<span></span>"}
        <span class="crmPalletR__imya" title="${escape(p.паллета)}">${escape(p.паллета)}</span>
        <span>${escape(p.регион || "—")}</span>
        <span class="crmNum">${chislo(p.sku)} SKU</span>
        <span class="crmNum">${chislo(p.штук)} шт</span>
        <span class="crmNum">${chislo(p.себестоимость)} ₽</span>
        ${vybor ? "<span></span>" : '<button class="crmZad__ubrat" type="button" title="Убрать из лота">×</button>'}
      </${vybor ? "label" : "div"}>`;

    uzel.innerHTML = `
      <div class="crmPallety__shapka">
        <p class="crmObsh__zag">Паллеты лота · ${spisok.length}</p>
        <p class="crmObsh__zag">${chislo(sostav.штук)} шт · ${chislo(sostav.себестоимость)} ₽</p>
      </div>
      ${spisok.length ? `<div class="crmPallety__tabl">${spisok.map((p) => stroka(p, false)).join("")}</div>`
        : '<p class="crmHint">в лоте пока нет паллет — отметьте ниже</p>'}
      <div class="crmPallety__shapka crmPallety__shapka--vybor">
        <p class="crmObsh__zag">Свободные · <span id="crmPalletySchet">${svobodnye.length}</span></p>
        <div class="crmPallety__filtry">
          ${skladLota ? `<label class="crmPallety__svoy"><input type="checkbox" id="crmPalletySvoy"${svobodnye.some(svoySklad) ? " checked" : ""}>
            только ${escape(skladLota)}</label>` : ""}
          <input class="crmPallety__filtr" id="crmPalletyFiltr" placeholder="номер или склад">
        </div>
      </div>
      <div class="crmPallety__tabl crmPallety__tabl--vybor" id="crmPalletyVybor"></div>
      <div class="crmPallety__niz">
        <button class="crmKn crmKn--glav" type="button" id="crmPalletyDobavit" disabled>Отметьте паллеты</button>
      </div>`;

    uzel.querySelectorAll(".crmZad__ubrat").forEach((kn) => {
      kn.addEventListener("click", async () => {
        const imya = kn.closest("[data-pallet]").dataset.pallet;
        if (!confirm(`Убрать ${imya} из лота?`)) return;
        await poslatPallety({ действие: "убрать", лот: lot, паллета: imya }, lot);
        narisovatPallety(lot);
      });
    });

    const vybor = el("crmPalletyVybor");
    const knopka = el("crmPalletyDobavit");
    const otmecheno = new Set();
    const pokazat = () => {
      const slovo = el("crmPalletyFiltr").value.trim().toLowerCase();
      const tolkoSvoy = el("crmPalletySvoy") ? el("crmPalletySvoy").checked : false;
      const vidno = svobodnye.filter((p) => (!tolkoSvoy || svoySklad(p))
        && (!slovo || `${p.паллета} ${p.регион}`.toLowerCase().includes(slovo)));
      el("crmPalletySchet").textContent = vidno.length;
      vybor.innerHTML = vidno.length ? vidno.slice(0, 200).map((p) => stroka(p, true)).join("")
        : '<p class="crmHint">свободных паллет не нашлось</p>';
      vybor.querySelectorAll("input[type=checkbox]").forEach((x) => { x.checked = otmecheno.has(x.value); });
    };
    const obnovitKnopku = () => {
      const sebes = svobodnye.filter((p) => otmecheno.has(p.паллета))
        .reduce((s, p) => s + (Number(p.себестоимость) || 0), 0);
      knopka.disabled = !otmecheno.size;
      knopka.textContent = otmecheno.size
        ? `Добавить ${otmecheno.size} ${sklonenie(otmecheno.size, "паллету", "паллеты", "паллет")} · ${chislo(sebes)} ₽`
        : "Отметьте паллеты";
    };
    vybor.addEventListener("change", (event) => {
      const x = event.target;
      if (x.type !== "checkbox") return;
      if (x.checked) otmecheno.add(x.value); else otmecheno.delete(x.value);
      obnovitKnopku();
    });
    el("crmPalletyFiltr").addEventListener("input", pokazat);
    el("crmPalletySvoy")?.addEventListener("change", pokazat);
    knopka.addEventListener("click", async () => {
      if (!otmecheno.size) return;
      knopka.disabled = true;
      await poslatPallety({ действие: "собрать", лот: lot, паллеты: [...otmecheno] }, lot);
      narisovatPallety(lot);
    });
    pokazat();
  }

  /* --- Лента по клиенту -------------------------------------------------------
     Письма, звонки, задачи и смены статуса лежали в четырёх разных блоках, и
     ответ на вопрос «что вообще происходит с этим клиентом» приходилось
     собирать глазами. Лента складывает всё в одну хронологию — по ней сразу
     видно, где сделка встала: «выставили счёт 12 дней назад, и тишина». */

  const ZNACHKI_LENTY = {
    "письмо": "✉", "звонок": "☎", "сообщение": "💬", "встреча": "👥",
    "заметка": "✎", "задача": "✓", "правка": "±",
  };

  function sobratLentu({ zhurnal = [], pisma = [], zadachi = [], istoriya = [] }) {
    const sobytiya = [];

    zhurnal.forEach((s) => sobytiya.push({
      kogda: s.когда, vid: s.вид, kto: s.кто,
      tekst: s.текст,
      pod: `${s.направление === "они" ? "они нам" : "мы им"}${s.лот ? ` · лот ${s.лот}` : ""}`,
    }));

    pisma.forEach((p) => sobytiya.push({
      kogda: p.когда, vid: "письмо", kto: p.наше ? "мы" : "они",
      tekst: p.тема,
      pod: `${p.наше ? "мы им" : "они нам"} · ${p.наше ? p.кому : p.от}`,
    }));

    zadachi.forEach((z) => sobytiya.push({
      kogda: z.готово && z.готово_когда ? z.готово_когда : z.создана,
      vid: "задача", kto: z.менеджер || z.создал,
      tekst: (z.готово ? "сделано: " : "задача: ") + z.текст,
      pod: z.лот ? `лот ${z.лот}` : "",
      tusklo: z.готово,
    }));

    istoriya.forEach((i) => sobytiya.push({
      kogda: i.когда, vid: "правка", kto: i.кто,
      tekst: `${i.поле}: ${i.было || "пусто"} → ${i.стало || "пусто"}`,
      pod: "", tusklo: true,
    }));

    return sobytiya
      .filter((s) => s.kogda)
      .sort((a, b) => String(b.kogda).localeCompare(String(a.kogda)));
  }

  /** Сколько дней прошло — по этому числу и видно застрявшие сделки. */
  function davnost(kogda) {
    const bylo = new Date(String(kogda).replace(" ", "T"));
    if (Number.isNaN(bylo.getTime())) return "";
    const dney = Math.floor((Date.now() - bylo.getTime()) / 86400000);
    if (dney <= 0) return "сегодня";
    if (dney === 1) return "вчера";
    return `${dney} ${sklonenie(dney, "день", "дня", "дней")} назад`;
  }

  async function narisovatLentu(ka, lot) {
    const uzel = el("crmLenta");
    if (!uzel) return;
    uzel.innerHTML = '<p class="crmObsh__zag">Лента</p><p class="crmHint">собираю…</p>';

    const adres = `?${ka ? `ка=${encodeURIComponent(ka)}` : ""}${ka && lot ? "&" : ""}${
      lot ? `лот=${encodeURIComponent(lot)}` : ""}`;
    const [zhurnal, pochta, istoriya] = await Promise.all([
      fetch(`/__crm/obshchenie${adres}`, { cache: "no-store" })
        .then((o) => (o.ok ? o.json() : [])).catch(() => []),
      kontragentPoImeni(ka) && kontragentPoImeni(ka).email
        ? fetch(`/__crm/pochta?адрес=${encodeURIComponent(kontragentPoImeni(ka).email)}`,
                { cache: "no-store" })
            .then((o) => (o.ok ? o.json() : { письма: [] })).catch(() => ({ письма: [] }))
        : Promise.resolve({ письма: [] }),
      lot
        ? fetch(`/__crm/istoriya?объект=lot&ключ=${encodeURIComponent(lot)}`,
                { cache: "no-store" })
            .then((o) => (o.ok ? o.json() : [])).catch(() => [])
        : Promise.resolve([]),
    ]);

    const zadachi = (((dannye.задачи || {}).задачи) || []).filter((z) =>
      (lot && String(z.лот || "") === String(lot))
      || (ka && klyuchKa(z.ка) === klyuchKa(ka)));

    const lenta = sobratLentu({
      zhurnal, pisma: pochta.письма || [], zadachi, istoriya,
    });

    if (!lenta.length) {
      uzel.innerHTML = '<p class="crmObsh__zag">Лента</p>'
        + '<p class="crmHint">событий пока нет — запишите звонок или поставьте задачу</p>';
      return;
    }

    uzel.innerHTML = `<p class="crmObsh__zag">Лента · ${lenta.length}
        <span class="crmHint">последнее ${escape(davnost(lenta[0].kogda))}</span></p>
      <div class="crmLenta__spisok">${lenta.slice(0, 40).map((s) => `
        <div class="crmLenta__stroka${s.tusklo ? " is-tusklo" : ""}">
          <span class="crmLenta__znachok">${ZNACHKI_LENTY[s.vid] || "•"}</span>
          <div>
            <p class="crmLenta__tekst">${escape(s.tekst)}</p>
            <p class="crmLenta__pod">${escape(s.kogda)} · ${escape(davnost(s.kogda))}
              ${s.kto ? "· " + escape(s.kto) : ""}${s.pod ? " · " + escape(s.pod) : ""}</p>
          </div>
        </div>`).join("")}</div>`;
  }


  /* --- Сверка с банком --------------------------------------------------------
     Разбор 21.09 показал: «деньги поступили» расходятся с банком не из-за
     вранья, а из-за пустых дат оплаты, возвратов и заказов мимо доски.
     Разовая сверка бесполезна — через неделю всё повторится, поэтому она
     считается каждый день и живёт здесь. */

  let sverka = null;

  async function narisovatSverku() {
    const uzel = el("crmSverka");
    if (!uzel) return;
    if (!sverka) {
      uzel.innerHTML = '<p class="crmHint">смотрю сверку…</p>';
      try {
        const otvet = await fetch("/data/sverka-deneg.json", { cache: "no-cache" });
        sverka = otvet.ok ? await otvet.json() : { месяцы: [] };
      } catch (oshibka) { sverka = { месяцы: [] }; }
    }
    if (!sverka.месяцы || !sverka.месяцы.length) {
      uzel.innerHTML = '<p class="crmHint">сверка ещё не считалась</p>';
      return;
    }

    const mesyacy = sverka.месяцы.slice(-9);
    uzel.innerHTML = `
      <div class="crmSverka__plitki">
        <article class="crmItog">
          <p class="crmItog__zag">Оплачено, а даты нет</p>
          <b class="crmItog__znak">${chislo(sverka.без_даты_оплаты_всего)}</b>
          <p class="crmItog__pod">лотов на ${chislo(sverka.без_даты_оплаты_сумма)} ₽
            — деньги в банке есть, в доске поле пустое</p>
        </article>
        <article class="crmItog">
          <p class="crmItog__zag">Заказы мимо доски</p>
          <b class="crmItog__znak">${chislo(sverka.мимо_доски_всего)}</b>
          <p class="crmItog__pod">на ${chislo(sverka.мимо_доски_сумма)} ₽
            — оплачены, но лота с таким заказом нет</p>
        </article>
        <article class="crmItog">
          <p class="crmItog__zag">Лоты с возвратом</p>
          <b class="crmItog__znak">${chislo(sverka.с_возвратом_всего)}</b>
          <p class="crmItog__pod">${sverka.с_возвратом_всего
            ? `вернулось товара на ${chislo(sverka.с_возвратом_сумма)} ₽`
            : "по лотам доски возвратов нет — они идут отдельными документами"}</p>
        </article>
      </div>

      <p class="crmZadZag">Месяц к месяцу: банк против доски</p>
      <div class="crmTabl crmSverka__tabl"><table>
        <thead><tr><th>Месяц</th><th class="crmNum">Банк</th>
          <th class="crmNum">Доска</th><th class="crmNum">Расхождение</th>
          <th class="crmNum">Возврат товара</th></tr></thead>
        <tbody>${mesyacy.map((m) => {
          const ploho = m.процент !== null && Math.abs(m.процент) > 10;
          return `<tr>
            <td>${escape(m.месяц)}</td>
            <td class="crmNum">${chislo(m.банк)}</td>
            <td class="crmNum">${chislo(m.доска)}</td>
            <td class="crmNum ${ploho ? "prKrit" : ""}">${chislo(m.расхождение)}
              ${m.процент === null ? "" : `<span class="crmHint">${m.процент}%</span>`}</td>
            <td class="crmNum">${m.возврат_товара ? chislo(m.возврат_товара) : "—"}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>

      <p class="crmZadZag">Проставить дату оплаты · ${sverka.без_даты_оплаты_всего}</p>
      <p class="crmHint">деньги по этим лотам в банке есть — осталось записать дату.
        клик по строке открывает лот</p>
      <div class="crmZadSpisok">${(sverka.без_даты_оплаты || []).slice(0, 40).map((z) => `
        <div class="crmZad" data-lot-sverka="${escape(String(z.лот))}">
          <span class="crmZad__gal" style="border:0">₽</span>
          <div class="crmZad__telo">
            <p class="crmZad__tekst">Лот ${escape(String(z.лот))} · ${escape(z.ка || "без контрагента")}</p>
            <p class="crmZad__pod">в банке ${chislo(z.деньги)} ₽ · оплачен ${escape(z.оплачен || "—")}
              · в доске ${chislo(z.цена)} ₽ · ${escape(z.менеджер || "без менеджера")}</p>
          </div>
        </div>`).join("")}</div>

      ${(sverka.мимо_доски || []).length ? `
        <p class="crmZadZag is-vnimanie">Заказы мимо доски · ${sverka.мимо_доски_всего}</p>
        <p class="crmHint">деньги пришли, но лота с таким номером заказа в CRM нет —
          либо заказ не записан в лот, либо это возврат или чужой документ</p>
        <div class="crmZadSpisok">${sverka.мимо_доски.slice(0, 20).map((z) => `
          <div class="crmZad">
            <span class="crmZad__gal" style="border:0">?</span>
            <div class="crmZad__telo">
              <p class="crmZad__tekst">Заказ ${escape(z.заказ)}</p>
              <p class="crmZad__pod">${chislo(z.деньги)} ₽ · оплачен ${escape(z.оплачен || "—")}
                ${z.возврат ? `· возврат товара ${chislo(z.возврат)} ₽` : ""}</p>
            </div>
          </div>`).join("")}</div>` : ""}`;

    uzel.querySelectorAll("[data-lot-sverka]").forEach((stroka) => {
      stroka.addEventListener("click", () => {
        const lot = (dannye.лоты || []).find((x) =>
          String(x.nomer) === stroka.dataset.lotSverka);
        if (lot) otkrytKartochku(lot);
      });
    });

    el("crmSchyot").textContent = `сверка от ${sverka.обновлено}`
      + ` · банк против доски по дате оплаты`;
  }

  /* --- Чек-листы этапов -------------------------------------------------------
     «При заключении договора есть список задач того, что надо сделать, чтобы
     перейти на следующий этап» — встреча 21.09. Лот переехал в статус, дела
     завелись сами. Правят чек-листы сами продажи: это их процесс. */

  let cheklistyRaskryty = false;

  async function poslatShablon(telo) {
    const otvet = await fetch("/__crm/shablon", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo),
    });
    if (!otvet.ok) {
      const oshibka = await otvet.json().catch(() => ({}));
      alert(oshibka.ошибка || "не сохранилось");
      return;
    }
    dannye.шаблоны = await otvet.json();
    narisovatZadachi();
  }

  function cheklistyHtml() {
    const shablony = dannye.шаблоны || [];
    if (!cheklistyRaskryty) {
      return `<p class="crmZadZag">
        <button class="crmCheklistKn" type="button" id="crmCheklistOtkryt">
          Что появляется на каждом этапе · ${shablony.length}
        </button></p>`;
    }
    const poEtapam = new Map();
    shablony.forEach((sh) => {
      if (!poEtapam.has(sh.статус)) poEtapam.set(sh.статус, []);
      poEtapam.get(sh.статус).push(sh);
    });

    return `<p class="crmZadZag">
      <button class="crmCheklistKn" type="button" id="crmCheklistOtkryt">
        Свернуть чек-листы этапов
      </button></p>
    <p class="crmHint">лот переезжает в статус — эти дела появляются сами, на менеджера
      лота. галочка слева выключает пункт, крестик удаляет. повторно при возврате
      на этап задача не заводится</p>
    <div class="crmCheklisty">
      ${[...poEtapam.entries()].map(([status, spisok]) => `
        <div class="crmCheklist">
          <p class="crmCheklist__zag">${escape(status)}</p>
          ${spisok.map((sh) => `
            <div class="crmCheklist__stroka${sh.включён ? "" : " is-vykl"}" data-id="${sh.id}">
              <button class="crmZad__gal" type="button" data-vkl="${sh.включён ? "1" : "0"}"
                      title="${sh.включён ? "Выключить" : "Включить"}">${sh.включён ? "✓" : ""}</button>
              <span class="crmCheklist__tekst">${escape(sh.текст)}</span>
              <span class="crmCheklist__srok">+${sh.дней} дн</span>
              <button class="crmZad__ubrat" type="button" title="Удалить">×</button>
            </div>`).join("")}
        </div>`).join("")}
    </div>
    <form class="crmZadNovaya" id="crmCheklistNovyy">
      <select name="status">${VORONKA.map((v) =>
        `<option value="${escape(v)}">${escape(v)}</option>`).join("")}</select>
      <input name="tekst" placeholder="Что сделать на этом этапе" required>
      <input name="dney" type="number" min="0" max="30" value="1" title="Через сколько дней срок">
      <button class="crmKn" type="submit">Добавить в чек-лист</button>
    </form>`;
  }

  function podklyuchitCheklisty(uzel) {
    const knopka = el("crmCheklistOtkryt");
    if (knopka) {
      knopka.addEventListener("click", () => {
        cheklistyRaskryty = !cheklistyRaskryty;
        narisovatZadachi();
      });
    }
    if (!cheklistyRaskryty) return;

    uzel.querySelectorAll(".crmCheklist__stroka .crmZad__gal").forEach((kn) => {
      kn.addEventListener("click", () => poslatShablon({
        id: Number(kn.closest(".crmCheklist__stroka").dataset.id),
        включён: kn.dataset.vkl !== "1",
      }));
    });
    uzel.querySelectorAll(".crmCheklist__stroka .crmZad__ubrat").forEach((kn) => {
      kn.addEventListener("click", () => {
        if (!confirm("Убрать пункт из чек-листа?")) return;
        poslatShablon({ действие: "удалить",
                        id: Number(kn.closest(".crmCheklist__stroka").dataset.id) });
      });
    });
    const forma = el("crmCheklistNovyy");
    if (forma) {
      forma.addEventListener("submit", (event) => {
        event.preventDefault();
        const dan = new FormData(event.target);
        poslatShablon({ статус: dan.get("status"), текст: dan.get("tekst"),
                        дней: Number(dan.get("dney")) || 1 });
      });
    }
  }

  /* --- Напоминания ------------------------------------------------------------
     «Он знает, что там 16 часов завтра позвонить» — со встречи 21.09. Список
     задач сам по себе не напоминает: в него надо зайти. Поэтому колокольчик в
     шапке с числом наступивших задач и всплывашка браузера — она приходит,
     даже когда вкладка в фоне.

     Проверяем раз в минуту и по одной задаче напоминаем один раз: повторные
     всплывашки раздражают сильнее, чем помогают. */

  const NAPOMNILI = new Set();
  let razreshenieSprosheno = false;

  function moiZadachi() {
    const moyo = (dannye.кто && dannye.кто.имя) || "";
    return (((dannye.задачи || {}).задачи) || [])
      .filter((z) => !z.готово && (!moyo || (z.менеджер || "") === moyo));
  }

  /** Наступило ли время: срок сегодня и время уже прошло или вот-вот. */
  function poraLi(z) {
    if (z.пора) return true;
    if (!z.на_сегодня || !z.время) return false;
    const [chas, minuta] = String(z.время).split(":").map(Number);
    const teper = new Date();
    const kogda = new Date();
    kogda.setHours(chas, minuta, 0, 0);
    return kogda.getTime() - teper.getTime() <= 30 * 60 * 1000;
  }

  function vsplyvashka(z) {
    if (NAPOMNILI.has(z.id)) return;
    NAPOMNILI.add(z.id);
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      const okno = new Notification("CRM: пора", {
        body: z.текст + (z.лот ? `\nлот ${z.лот}` : "")
              + (z.время ? ` · ${z.время}` : ""),
        tag: "crm-zadacha-" + z.id,
      });
      okno.onclick = () => { window.focus(); perekluchit("zadachi"); narisovat(); };
    } else if (Notification.permission === "default" && !razreshenieSprosheno) {
      // Спрашиваем разрешение один раз и только когда напоминать уже есть о чём.
      razreshenieSprosheno = true;
      Notification.requestPermission();
    }
  }

  function narisovatKolokolchik() {
    const uzel = el("crmKolokol");
    if (!uzel) return;
    const moi = moiZadachi();
    const nastupili = moi.filter(poraLi);
    const prosrocheno = moi.filter((z) => z.просрочена).length;
    const skolko = nastupili.length + prosrocheno;

    uzel.hidden = false;
    uzel.className = "crmKolokol" + (skolko ? " is-est" : "");
    uzel.innerHTML = skolko
      ? `🔔 <b>${skolko}</b> <span>${prosrocheno ? `просрочено ${prosrocheno}` : ""}${
          prosrocheno && nastupili.length ? " · " : ""}${
          nastupili.length ? `пора ${nastupili.length}` : ""}</span>`
      : "🔔 <span>напоминаний нет</span>";

    nastupili.forEach(vsplyvashka);
  }

  /** Раз в минуту проверяем время, раз в пять — перечитываем задачи с сервера:
      их мог завести кто-то другой, пока вкладка открыта. */
  function zapustitNapominaniya() {
    narisovatKolokolchik();
    setInterval(narisovatKolokolchik, 60 * 1000);
    setInterval(async () => {
      try {
        const otvet = await fetch("/__crm/zadacha", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ действие: "список" }),
        });
        if (otvet.ok) {
          dannye.задачи = await otvet.json();
          narisovatKolokolchik();
          if (vid === "zadachi") narisovatZadachi();
        }
      } catch (oshibka) { /* сеть моргнула — попробуем через пять минут */ }
    }, 5 * 60 * 1000);
  }

  /** Переключает вид: доска, таблица лотов, счета. */
  function perekluchit(novyy) {
    vid = novyy;
    document.querySelectorAll(".crmVid[data-vid]").forEach((kn) =>
      kn.classList.toggle("is-on", kn.dataset.vid === novyy));
  }

  function narisovat() {
    sobratSpravochniki(dannye.лоты || []);
    narisovatPlitki();
    narisovatPlan();
    narisovatGorit();
    narisovatVybor();

    const doska = vid === "doska";
    const baza = vid === "ka";
    const zadachi = vid === "zadachi";
    const pochta = vid === "pochta";
    const sverkaVid = vid === "sverka";
    el("crmDoska").hidden = !doska || zadachi || pochta || sverkaVid;
    el("crmTabl").hidden = doska || zadachi || pochta || sverkaVid;
    el("crmZadachi").hidden = !zadachi;
    // Почта живёт в боковой панели «Связь», вкладки у неё больше нет.
    el("crmSverka").hidden = !sverkaVid;
    // На доске фильтр по статусу не нужен — она и есть разрез по статусам.
    // В базе КА статусов нет вовсе, а очереди, выбор менеджера и «новый лот»
    // к ней не относятся: там свой разрез — деньги и договоры.
    el("crmFiltry").hidden = doska || baza || zadachi || pochta || sverkaVid;
    el("crmGorit").hidden = baza || pochta || sverkaVid;
    el("crmKto").hidden = baza || zadachi || pochta || sverkaVid;
    if (el("crmSklad")) el("crmSklad").hidden = el("crmKto").hidden;
    el("crmNovyy").hidden = baza || zadachi || pochta || sverkaVid;
    el("crmNabor").hidden = doska || zadachi || pochta || sverkaVid;
    el("crmNabor").textContent = vseKolonki ? "Главные колонки" : "Все колонки";

    if (sverkaVid) {
      narisovatSverku();
    } else if (pochta) {
      narisovatPochtuVid();
    } else if (zadachi) {
      narisovatZadachi();
    } else if (baza) {
      narisovatTablicu();
      const spisok = (dannye.ка || []).filter(podhodit);
      const dengiVsego = spisok.reduce((n, z) => n + (Number(z.summa_prodazh) || 0), 0);
      const sDogovorom = spisok.filter((z) => z.dogovor).length;
      el("crmSchyot").textContent =
        `${spisok.length} контрагентов · с договором ${sDogovorom}`
        + ` · продаж на ${chislo(dengiVsego)} ₽`
        + " · список копируется из книги отдела продаж";
    } else if (doska) {
      narisovatDosku();
      const vidimye = (dannye.лоты || []).filter(podhodit).filter(aktivnyy);
      const summa = vidimye.reduce((n, z) => n + dengiLota(z).summa, 0);
      el("crmSchyot").textContent = `В работе ${vidimye.length} лотов на ${chislo(summa)} ₽`
        + " (цена отгрузки, а где её нет — стартовая)"
        + " · карточку тащат мышью в соседний столбец";
    } else {
      narisovatFiltry();
      narisovatTablicu();
      // Подсказка про правку: пунктир под ячейкой замечают не все.
      if (vid === "loty") {
        el("crmSchyot").textContent += " · ячейки с пунктиром правятся кликом,"
          + " статус и площадка выбираются из списка";
      }
    }
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
    try {
      const s = await fetch("/data/sverka-deneg.json", { cache: "no-cache" });
      sverka = s.ok ? await s.json() : null;
    } catch (oshibka) { sverka = null; }
    el("stamp").textContent = "обновлено " + (dannye.сводка?.обновлено || "");
    narisovat();
    zapustitNapominaniya();
  }

  /** Светлая тема. Выбор держим в браузере: он личный, на сервер ходить незачем. */
  function nastroitTemu() {
    const knopka = el("crmTema");
    if (!knopka) return;
    const primenit = (svetlo) => {
      document.body.classList.toggle("is-svetlo", svetlo);
      knopka.textContent = svetlo ? "Тёмная тема" : "Светлая тема";
    };
    primenit(localStorage.getItem("crmTema") === "svetlo");
    knopka.addEventListener("click", () => {
      const svetlo = !document.body.classList.contains("is-svetlo");
      localStorage.setItem("crmTema", svetlo ? "svetlo" : "temno");
      primenit(svetlo);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    nastroitTemu();
    el("crmKolokol").addEventListener("click", () => {
      perekluchit("zadachi");
      filtry = {};
      narisovat();
    });
    document.querySelectorAll(".crmVid[data-vid]").forEach((kn) => {
      kn.addEventListener("click", () => {
        perekluchit(kn.dataset.vid);
        filtry = {};
        sortirovka = { pole: null, vniz: true };
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
    el("crmGorit").addEventListener("click", (event) => {
      const kn = event.target.closest(".ctDelo");
      if (!kn) return;
      // Повторный клик по той же очереди снимает её: иначе непонятно, как
      // вернуться ко всем лотам.
      const vybor = kn.dataset.ochered || "";
      if (vybor === "__prosr" || vybor === "__segodnya") {
        ochered = "";
        perekluchit("zadachi");
        narisovat();
        return;
      }
      ochered = ochered === vybor ? "" : vybor;
      // Лоты «оплата пришла, даты нет» почти все уже отгружены — на доске их
      // нет, дату ставят в таблице.
      if (ochered === "bezdaty") perekluchit("loty");
      else if (ochered && vid !== "doska" && vid !== "loty") perekluchit("doska");
      narisovat();
    });
    el("crmNabor").addEventListener("click", () => {
      vseKolonki = !vseKolonki;
      narisovat();
    });
    el("crmKto").addEventListener("change", (event) => {
      filtry.menedzher = event.target.value;
      narisovat();
    });
    el("crmSklad")?.addEventListener("change", (event) => {
      filtry.region = event.target.value;
      narisovat();
    });
    el("crmPoisk").addEventListener("input", (event) => {
      poisk = event.target.value.trim().toLowerCase();
      if (vid === "doska") narisovatDosku();
      else narisovatTablicu();
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

    // Боковая панель «Связь»: почту грузим, когда её впервые открыли.
    let pochtaZagruzhena = false;
    const svyaz = el("ctSvyaz");
    el("ctSvyazKn").addEventListener("click", () => {
      svyaz.hidden = !svyaz.hidden;
      el("ctSvyazKn").classList.toggle("is-on", !svyaz.hidden);
      if (!svyaz.hidden && !pochtaZagruzhena) {
        pochtaZagruzhena = true;
        narisovatPochtuVid();
      }
    });
    el("ctSvyazZakryt").addEventListener("click", () => {
      svyaz.hidden = true;
      el("ctSvyazKn").classList.remove("is-on");
    });
    svyaz.querySelectorAll("[data-svyaz]").forEach((kn) => {
      kn.addEventListener("click", () => {
        svyaz.querySelectorAll("[data-svyaz]").forEach((x) => x.classList.toggle("is-on", x === kn));
        el("crmPochtaVid").hidden = kn.dataset.svyaz !== "pochta";
        el("ctMessendzher").hidden = kn.dataset.svyaz !== "messendzher";
      });
    });
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
