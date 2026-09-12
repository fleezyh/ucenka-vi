// Моя зарплата. Страница ничего не считает сама — числа приходят готовыми из
// /__zp, потому что зарплата не должна лежать в каталоге сайта: там её видел
// бы любой, кто угадал адрес файла.
//
// Единственное, что считается здесь — секунды. Сервер отдаёт, сколько человек
// зарабатывает в секунду смены, а страница капает эту сумму в реальном времени.

const message = document.getElementById("message");
const stamp = document.getElementById("stamp");
const views = document.getElementById("views");
const blockMe = document.getElementById("me");
const blockTeam = document.getElementById("team");
const note = document.getElementById("note");

const MESYACY = ["января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"];
// «Заработано в сентября» — так не говорят, нужен предложный падеж.
const V_MESYACE = ["январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];

function rubli(value) {
  return Math.round(Number(value) || 0).toLocaleString("ru-RU") + " ₽";
}

function dney(n) {
  const number = Math.round(Number(n) || 0);
  const ost = number % 100;
  if (ost >= 11 && ost <= 14) return number + " дней";
  const last = number % 10;
  if (last === 1) return number + " день";
  if (last >= 2 && last <= 4) return number + " дня";
  return number + " дней";
}

// «2026-07» → «июль», чтобы в пометке было видно, из какого месяца оклад.
function mesyacRodit(month) {
  const parts = String(month || "").split("-");
  const index = Number(parts[1]) - 1;
  const NAZVANIE = ["январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  return NAZVANIE[index] ? NAZVANIE[index] + " " + parts[0] : month;
}

// Зарплату платят 14-го, аванс 29-го. Если день выпал на выходной — платят
// в предшествующую пятницу, так это и работает по факту выплат.
function vyplata(year, month, day) {
  const date = new Date(year, month, day);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return date.getDate() + " " + MESYACY[date.getMonth()];
}

/* Счётчик.
 *
 * Внутри смены сумма растёт от «базы» со скоростью «в_секунду». Вне смены
 * счётчик стоит: капающие деньги в законный выходной — это враньё, а не
 * красивая анимация. */
function schetchik(tik, schitano) {
  const rubliEl = document.getElementById("tickRub");
  const kopeykiEl = document.getElementById("tickKop");
  const stateEl = document.getElementById("tickState");
  if (!rubliEl) return;

  // Счётчик идёт от уже заработанного к прогнозу на конец месяца. В момент
  // расчёта он показывает ровно ту сумму, что стоит в разборе ниже, к концу
  // месяца доходит до прогноза, и при этом не замирает ни на секунду.
  function summa() {
    const fakt = Number(tik["факт"]) || 0;
    const vsego = Number(tik["за_месяц"]) || fakt;
    const proshlo = Math.max(0, Date.now() / 1000 - (schitano || Date.now() / 1000));
    return Math.min(vsego, fakt + proshlo * (Number(tik["в_секунду"]) || 0));
  }

  /* Цифры перекатываются, а не подменяются.
   *
   * Каждый разряд — колонка из десяти цифр, которая сдвигается вверх. Когда
   * копейки тикают раз в секунду, младший разряд крутится непрерывно, и
   * число выглядит живым, а не мигающим. */
  function lenta(el, simvol) {
    if (!/\d/.test(simvol)) {
      // Разделитель тысяч — неразрывный пробел: внутри inline-block он
      // схлопывается в ноль, поэтому ширину задаём классом, а не текстом.
      const probel = /\s/.test(simvol);
      el.className = "zpDigit zpDigit--fix" + (probel ? " zpDigit--space" : "");
      el.textContent = probel ? "" : simvol;
      return;
    }
    if (!el.firstChild || !el.classList.contains("zpDigit--roll")) {
      el.className = "zpDigit zpDigit--roll";
      el.innerHTML = '<span class="zpDigit__strip">'
        + "0123456789".split("").map((d) => `<i>${d}</i>`).join("") + "</span>";
    }
    const strip = el.firstChild;
    const nado = Number(simvol);
    if (strip.dataset.n === String(nado)) return;
    strip.dataset.n = String(nado);
    strip.style.transform = `translateY(${-nado * 10}%)`;
  }

  function napisat(el, text) {
    const simvoly = text.split("");
    while (el.children.length > simvoly.length) el.lastChild.remove();
    while (el.children.length < simvoly.length) {
      el.appendChild(document.createElement("span"));
    }
    simvoly.forEach((simvol, i) => lenta(el.children[i], simvol));
  }

  function risovat() {
    const value = summa();
    const celye = Math.floor(value);
    const kop = Math.round((value - celye) * 100);
    napisat(rubliEl, celye.toLocaleString("ru-RU").replace(/ /g, " "));
    napisat(kopeykiEl, "," + String(kop).padStart(2, "0"));
  }

  risovat();
  stateEl.innerHTML = '<i class="zpTick__dot"></i>Начисляется прямо сейчас';
  stateEl.className = "zpTick__state is-live";
  setInterval(risovat, 1000);
}

function karta(data, kto) {
  const ya = kto || data["я"];
  if (!ya) return;
  const norma = Number(data["норма_дней"]) || 0;
  const proshlo = Number(data["прошло_дней"]) || 0;
  const dolya = norma ? Math.min(1, proshlo / norma) : 0;

  const now = new Date();
  const avansKogda = vyplata(now.getFullYear(), now.getMonth(), 29);
  const zpKogda = vyplata(now.getFullYear(), now.getMonth() + 1, 14);

  const poSkud = ya["источник_факта"] === "СКУД";
  const istochnik = poSkud
    ? "по проходам через турникет"
    : "по графику: отсутствием считается только оформленный больничный или отпуск";
  // У пятидневки отработанное — расчётная доля месяца, и дробное число дней
  // в тексте читается как ошибка. Турникету верим до дня.
  const otrabotano = poSkud ? ya["отработано"] : Math.round(ya["отработано"]);
  const avansKak = ya["аванс_точно"] ? "" : " примерно";
  const otsutstvie = ya["отсутствие"]
    ? `<p class="zpTick__away">По данным 1С у вас ${ya["отсутствие"]} —
        за эти дни оклад не начисляется, они оплачиваются отдельно.</p>` : "";

  // Пометка обязана быть конкретной. «Бета» сама по себе ничего не говорит:
  // человек должен понимать, из какого месяца взят его оклад и почему итог
  // может разойтись — иначе он придёт с этим к координатору, то есть ровно
  // туда, откуда мы его уводим.
  const okladIz = data["оклады_из"]
    ? `оклад взят из подачи за ${mesyacRodit(data["оклады_из"])}` : "";
  const beta = `<div class="zpBeta">
      <b>Предварительный расчёт</b>
      <span>Это не расчётный лист: ${okladIz}${okladIz ? ", " : ""}премия
        здесь плановая. Итоговую сумму считает 1С после подачи.
        Если видите расхождение — напишите, разберёмся.</span>
    </div>`;

  // Своя карточка подписи не требует, чужая — обязана: иначе непонятно, чьи
  // это деньги на экране.
  const chey = kto && kto !== data["я"]
    ? `<p class="zpTick__who">${ya["фио"]}</p>` : "";

  blockMe.innerHTML = `
    ${beta}
    <div class="zpTick">
      ${chey}
      <p class="zpTick__label">Заработано в ${V_MESYACE[now.getMonth()]}, на руки</p>
      <p class="zpTick__value"><span class="zpRoll" id="tickRub"></span><small class="zpRoll" id="tickKop"></small><span class="zpTick__rub">₽</span></p>
      <p class="zpTick__state" id="tickState"></p>
      ${otsutstvie}
      <div class="zpTick__bar"><span style="width:${(dolya * 100).toFixed(1)}%"></span></div>
      <p class="zpTick__hint">Прошло ${dney(proshlo)} из ${dney(norma)} месяца ·
        отработано ${otrabotano} из ${ya["план_дней"]} по графику · ${istochnik}</p>
    </div>

    <div class="zpGrid">
      <div class="zpRow">
        <span>Оклад за месяц</span>
        <b>${rubli(ya["оклад_на_руки"])}</b>
      </div>
      <div class="zpRow">
        <span>Отработано ${otrabotano} из ${ya["план_дней"]}</span>
        <b>${rubli(ya["окладная_часть"] * 0.87)}</b>
      </div>
      <div class="zpRow zpRow--soft">
        <span>Премия, ожидаемая</span>
        <b>${rubli(ya["премия_ожидаемая"] * 0.87)}</b>
      </div>
      <div class="zpPay">
        <div class="zpPay__item">
          <p class="zpPay__when">Аванс · ${avansKogda}</p>
          <p class="zpPay__sum">${rubli(ya["аванс"])}</p>
        </div>
        <div class="zpPay__item">
          <p class="zpPay__when">Зарплата · ${zpKogda}</p>
          <p class="zpPay__sum">${rubli(ya["остаток"])}</p>
        </div>
      </div>
    </div>`;
  blockMe.hidden = false;
  note.hidden = false;
  if (ya["тик"]) schetchik(ya["тик"], Number(data["посчитано_в"]) || 0);
}

/* Панель управления ФОТ.
 *
 * Смысл не в том, чтобы показать сумму, а в том, чтобы её можно было разобрать:
 * плитка → подразделение → человек → из чего сложилась его цифра. Поэтому
 * кликается всё, а не только последняя таблица. */
function stroki(lyudi, otkuda) {
  return lyudi.map((c) => `
    <tr class="hit" data-nomer="${otkuda.indexOf(c)}" title="Открыть карточку">
      <td><b>${c["фио"]}</b><div class="src">${c["должность"] || ""}${c["подразделение"] ? " · " + c["подразделение"] : ""}</div></td>
      <td class="num">${rubli(c["оклад_на_руки"])}</td>
      <td class="num">${c["источник_факта"] === "СКУД" ? c["отработано"] : Math.round(c["отработано"])} / ${c["план_дней"]}<div class="src">${c["источник_факта"]}</div></td>
      <td class="num">${rubli(c["окладная_часть"] * 0.87)}</td>
      <td class="num">${rubli(c["премия_ожидаемая"] * 0.87)}</td>
      <td class="num"><b>${rubli(c["на_руки"])}</b></td>
      <td class="num">${rubli(c["аванс"])}</td>
      <td class="num">${rubli(c["прогноз_месяца"])}</td>
      <td>${c["отсутствие"] || ""}</td>
    </tr>`).join("");
}

function tablica(data) {
  const lyudi = data["люди"] || [];
  const itogo = data["итого"] || {};
  const podrazdeleniya = data["подразделения"] || [];
  const nepodklyucheny = data["не_подключены"] || [];

  const plitki = [
    ["Человек в расчёте", itogo["человек"] || 0, ""],
    ["Начислено на сегодня", rubli(itogo["на_руки"]), "на руки"],
    ["Прогноз за месяц", rubli(itogo["прогноз_месяца"]), "если все доработают"],
    ["Фонд окладов", rubli(itogo["фонд_окладов"]), "без премий"],
    ["В отпуске и на больничном", itogo["с_отсутствиями"] || 0, "по данным 1С"],
    ["Оклад из штатки", itogo["оклад_из_штатки"] || 0, "нет в формах подачи"],
    ["Разошлись с формой", itogo["расхождений"] || 0, "штатка против подачи"],
    ["Не подключены", itogo["не_подключено"] || 0, "оклада нет нигде"],
  ].map(([name, value, note]) => `
    <div class="zpPlitka">
      <small>${name}</small><b>${value}</b>${note ? `<i>${note}</i>` : ""}
    </div>`).join("");

  const sporne = lyudi.filter((c) => c["расхождение"]);
  const sporneRows = sporne.map((c) => `
    <tr>
      <td><b>${c["фио"]}</b><div class="src">${c["должность"] || ""}${c["подразделение"] ? " · " + c["подразделение"] : ""}</div></td>
      <td class="num">${rubli(c["оклад"])}</td>
      <td class="num">${rubli(c["оклад_по_штатке"] * 0.87)}</td>
      <td class="num">${rubli((c["оклад_по_штатке"] - c["оклад"] / 0.87) * 0.87)}</td>
    </tr>`).join("");

  const podr = podrazdeleniya.map((p, index) => `
    <tr class="hit" data-podr="${index}">
      <td><b>${p["подразделение"]}</b></td>
      <td class="num">${p["человек"]}</td>
      <td class="num">${rubli(p["фонд_окладов"])}</td>
      <td class="num"><b>${rubli(p["начислено"])}</b></td>
      <td class="num">${rubli(p["прогноз"])}</td>
      <td class="num">${p["в_отсутствии"] || "—"}</td>
      <td class="num">${p["по_скуд"]} / ${p["человек"]}</td>
    </tr>`).join("");

  const net = nepodklyucheny.map((c) => `
    <tr>
      <td><b>${c["фио"]}</b><div class="src">${c["должность"] || ""}</div></td>
      <td>${c["подразделение"]}</td>
      <td class="src">${c["принят"] || ""}</td>
    </tr>`).join("");

  blockTeam.innerHTML = `
    <div class="zpPlitki">${plitki}</div>

    <div class="card" style="padding:22px;margin-top:14px">
      <div class="cardHeading">
        <h2>По подразделениям</h2>
        <p class="stamp">Клик по строке — показать только этих людей</p>
      </div>
      <div class="scroll" style="max-height:340px"><table>
        <thead><tr>
          <th>Подразделение</th><th>Человек</th><th>Фонд окладов</th>
          <th>На сегодня</th><th>Прогноз месяца</th><th>Отсутствуют</th><th>Факт из СКУД</th>
        </tr></thead>
        <tbody>${podr}</tbody>
      </table></div>
    </div>

    <div class="card" style="padding:22px;margin-top:14px">
      <div class="cardHeading">
        <h2 id="ktoZagolovok">Люди · ${lyudi.length}</h2>
        <div class="zpFiltr">
          <input id="poisk" type="search" placeholder="Фамилия, должность, подразделение"
                 autocomplete="off">
          <button class="zpView" type="button" id="sbros" hidden>Показать всех</button>
        </div>
      </div>
      <div class="scroll"><table>
        <thead><tr>
          <th>Человек</th><th>Оклад</th><th>Отработано</th><th>Окладная</th>
          <th>Премия</th><th>На сегодня</th><th>Аванс</th><th>Прогноз</th><th>Отсутствие</th>
        </tr></thead>
        <tbody id="ktoTelo">${stroki(lyudi, lyudi)}</tbody>
      </table></div>
    </div>

    ${sporne.length ? `
    <div class="card" style="padding:22px;margin-top:14px">
      <div class="cardHeading">
        <h2>Оклад спорит со штаткой · ${sporne.length}</h2>
        <p class="stamp">Считаем по форме подачи — это то, что уходит в 1С.
          Штатка показана для сверки</p>
      </div>
      <div class="scroll" style="max-height:280px"><table>
        <thead><tr><th>Человек</th><th>По форме подачи</th><th>По штатке</th><th>Разница</th></tr></thead>
        <tbody>${sporneRows}</tbody>
      </table></div>
    </div>` : ""}

    ${nepodklyucheny.length ? `
    <div class="card" style="padding:22px;margin-top:14px">
      <div class="cardHeading">
        <h2>Не подключены к расчёту · ${nepodklyucheny.length}</h2>
        <p class="stamp">Числятся в департаменте, но не попали ни в одну форму подачи</p>
      </div>
      <div class="scroll" style="max-height:300px"><table>
        <thead><tr><th>Человек</th><th>Подразделение</th><th>Принят</th></tr></thead>
        <tbody>${net}</tbody>
      </table></div>
    </div>` : ""}`;

  const telo = blockTeam.querySelector("#ktoTelo");
  const zagolovok = blockTeam.querySelector("#ktoZagolovok");
  const poisk = blockTeam.querySelector("#poisk");
  const sbros = blockTeam.querySelector("#sbros");

  function pokazat(spisok, podpis) {
    telo.innerHTML = stroki(spisok, lyudi);
    zagolovok.textContent = "Люди · " + spisok.length + (podpis ? " · " + podpis : "");
    sbros.hidden = spisok.length === lyudi.length;
  }

  poisk.addEventListener("input", () => {
    const slovo = poisk.value.trim().toLowerCase();
    if (!slovo) return pokazat(lyudi, "");
    pokazat(lyudi.filter((c) => [c["фио"], c["должность"], c["подразделение"]]
      .join(" ").toLowerCase().includes(slovo)), "поиск «" + poisk.value.trim() + "»");
  });
  sbros.addEventListener("click", () => { poisk.value = ""; pokazat(lyudi, ""); });

  blockTeam.addEventListener("click", (event) => {
    // Строка подразделения — фильтр списка людей.
    const podrRow = event.target.closest("tr.hit[data-podr]");
    if (podrRow) {
      const name = podrazdeleniya[Number(podrRow.dataset.podr)]["подразделение"];
      pokazat(lyudi.filter((c) => (c["подразделение"] || "—") === name), name);
      telo.closest(".card").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Строка человека — его карточка со счётчиком и выплатами.
    const row = event.target.closest("tr.hit[data-nomer]");
    if (!row) return;
    const chelovek = lyudi[Number(row.dataset.nomer)];
    if (!chelovek) return;
    karta(data, chelovek);
    blockTeam.hidden = true;
    views.querySelectorAll(".zpView").forEach((item) => item.classList.remove("is-on"));
    const svoya = views.querySelector('[data-view="me"]');
    if (svoya) svoya.classList.add("is-on");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

async function start() {
  let moya;
  try {
    const response = await fetch("/__zp", { credentials: "same-origin" });
    if (response.status === 401) {
      message.textContent = "Нужно войти на сайт.";
      message.className = "message warn";
      return;
    }
    moya = await response.json();
  } catch (error) {
    message.textContent = "Не получилось загрузить расчёт: " + error.message;
    message.className = "message error";
    return;
  }

  stamp.textContent = moya["обновлено"] ? "Обновлено " + moya["обновлено"] : "";

  if (!moya["я"]) {
    message.textContent = moya["почему_пусто"] || "По вам расчёта пока нет.";
    message.className = "message warn";
  } else {
    message.textContent = "";
    message.className = "message";
    karta(moya);
  }

  // Свою строку видят не все: часть отделов ещё не подключена к расчёту, и
  // у самого руководства ФБ её нет. Показывать им пустой экран нельзя —
  // если доступ к списку есть, сразу открываем его.
  const svoeyNet = !moya["я"];

  // Вкладка «по отделу» появляется, только если ручка её отдаёт: право на
  // чужие деньги проверяется на сервере, а не прячется в интерфейсе.
  try {
    const all = await fetch("/__zp/all", { credentials: "same-origin" });
    if (!all.ok) return;
    const data = await all.json();
    if (!data["люди"] || !data["люди"].length) return;
    tablica(data);
    views.hidden = false;
    views.addEventListener("click", (event) => {
      const button = event.target.closest(".zpView");
      if (!button) return;
      views.querySelectorAll(".zpView").forEach((item) => item.classList.remove("is-on"));
      button.classList.add("is-on");
      const team = button.dataset.view === "team";
      blockTeam.hidden = !team;
      blockMe.hidden = team;
      // Своей записи нет — «Моя» возвращает к тому, что открывали последним.
      if (!team && !blockMe.innerHTML) {
        blockMe.hidden = true;
        message.textContent = moya["почему_пусто"] || "По вам расчёта пока нет.";
      }
    });
    if (svoeyNet) {
      message.textContent = (moya["почему_пусто"] || "По вам расчёта пока нет.")
        + " Ниже — расчёт по тем, кто подключён; строка открывает карточку.";
      blockTeam.hidden = false;
      views.querySelector('[data-view="me"]').classList.remove("is-on");
      views.querySelector('[data-view="team"]').classList.add("is-on");
    }
  } catch (error) {
    // Нет права — вкладки просто не будет, это не ошибка страницы.
  }
}

start();
