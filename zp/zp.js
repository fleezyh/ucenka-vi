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
function schetchik(tik) {
  const rubliEl = document.getElementById("tickRub");
  const kopeykiEl = document.getElementById("tickKop");
  const stateEl = document.getElementById("tickState");
  if (!rubliEl) return;

  const [nachalo, konec] = tik["окно"] || [9, 18];

  function summa() {
    let itogo = Number(tik["база"]) || 0;
    if (!tik["работает"]) return itogo;
    const now = new Date();
    const start = new Date(now); start.setHours(nachalo, 0, 0, 0);
    const stop = new Date(now); stop.setHours(konec, 0, 0, 0);
    const secunds = Math.max(0, (Math.min(now, stop) - start) / 1000);
    return itogo + secunds * (Number(tik["в_секунду"]) || 0);
  }

  function risovat() {
    const value = summa();
    const celye = Math.floor(value);
    const kop = Math.round((value - celye) * 100);
    rubliEl.textContent = celye.toLocaleString("ru-RU");
    kopeykiEl.textContent = "," + String(kop).padStart(2, "0") + " ₽";
  }

  risovat();
  if (!tik["работает"]) {
    stateEl.textContent = "Смена не идёт — начисление продолжится на следующей";
    stateEl.className = "zpTick__state";
    return;
  }
  const now = new Date();
  if (now.getHours() >= konec) {
    stateEl.textContent = "Смена закончилась, за сегодня всё начислено";
    stateEl.className = "zpTick__state";
    return;
  }
  if (now.getHours() < nachalo) {
    stateEl.textContent = "Смена ещё не началась — начисление с " + nachalo + ":00";
    stateEl.className = "zpTick__state";
    return;
  }
  stateEl.innerHTML = '<i class="zpTick__dot"></i>Идёт смена, деньги капают прямо сейчас';
  stateEl.className = "zpTick__state is-live";
  // Десять раз в секунду: копейки успевают меняться заметно, а процессор
  // телефона на это не жалуется.
  setInterval(risovat, 100);
}

function karta(data) {
  const ya = data["я"];
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

  blockMe.innerHTML = `
    ${beta}
    <div class="zpTick">
      <p class="zpTick__label">Заработано в ${V_MESYACE[now.getMonth()]}, на руки</p>
      <p class="zpTick__value"><span id="tickRub">0</span><small id="tickKop">,00 ₽</small></p>
      <p class="zpTick__state" id="tickState"></p>
      ${otsutstvie}
      <div class="zpTick__bar"><span style="width:${(dolya * 100).toFixed(1)}%"></span></div>
      <p class="zpTick__hint">Прошло ${dney(proshlo)} из ${dney(norma)} месяца ·
        отработано ${otrabotano} из ${ya["план_дней"]} по графику · ${istochnik}</p>
    </div>

    <div class="zpGrid">
      <div class="zpRow">
        <span>Оклад за полный месяц<small>${ya["должность"] || ""}${ya["подразделение"] ? " · " + ya["подразделение"] : ""}</small></span>
        <b>${rubli(ya["оклад_на_руки"])}</b>
      </div>
      <div class="zpRow">
        <span>Окладная часть за отработанное<small>${otrabotano} из ${ya["план_дней"]} дней</small></span>
        <b>${rubli(ya["окладная_часть"] * 0.87)}</b>
      </div>
      <div class="zpRow zpRow--soft">
        <span>Премия, ожидаемая<small>точную сумму ставит руководитель при подаче</small></span>
        <b>${rubli(ya["премия_ожидаемая"] * 0.87)}</b>
      </div>
      <div class="zpPay">
        <div class="zpPay__item">
          <p class="zpPay__when">Аванс · ${avansKogda}</p>
          <p class="zpPay__sum">${rubli(ya["аванс"])}</p>
          <p class="zpPay__note">Окладная часть за первую половину месяца${avansKak},
            премия в аванс не входит.</p>
        </div>
        <div class="zpPay__item">
          <p class="zpPay__when">Остаток · ${zpKogda}</p>
          <p class="zpPay__sum">${rubli(ya["остаток"])}</p>
          <p class="zpPay__note">Если доработаете месяц по графику: всего выйдет
            ${rubli(ya["прогноз_месяца"])}, из них аванс уже ушёл.</p>
        </div>
      </div>
    </div>`;
  blockMe.hidden = false;
  note.hidden = false;
  if (ya["тик"]) schetchik(ya["тик"]);
}

function tablica(data) {
  const lyudi = data["люди"] || [];
  const rows = lyudi.map((c) => `
    <tr>
      <td><b>${c["фио"]}</b><div class="src">${c["должность"] || ""}${c["подразделение"] ? " · " + c["подразделение"] : ""}</div></td>
      <td class="num">${rubli(c["оклад_на_руки"])}</td>
      <td class="num">${c["источник_факта"] === "СКУД" ? c["отработано"] : Math.round(c["отработано"])} / ${c["план_дней"]}<div class="src">${c["источник_факта"]}</div></td>
      <td class="num">${rubli(c["окладная_часть"] * 0.87)}</td>
      <td class="num">${rubli(c["премия_ожидаемая"] * 0.87)}</td>
      <td class="num"><b>${rubli(c["на_руки"])}</b></td>
      <td class="num">${rubli(c["аванс"])}</td>
      <td>${c["отсутствие"] || ""}</td>
    </tr>`).join("");

  const itogo = data["итого"] || {};
  blockTeam.innerHTML = `
    <div class="card" style="padding:22px">
      <div class="cardHeading">
        <h2>По отделу · ${itogo["человек"] || 0} человек</h2>
        <p class="stamp">${rubli(itogo["на_руки"])} на руки на сегодня ·
          факт из СКУД у ${itogo["по_скуд"] || 0}, по графику у ${itogo["по_графику"] || 0}
          ${itogo["с_отсутствиями"] ? " · с отпусками и больничными " + itogo["с_отсутствиями"] : ""}</p>
      </div>
      <div class="scroll"><table>
        <thead><tr>
          <th>Человек</th><th>Оклад</th><th>Отработано</th><th>Окладная</th>
          <th>Премия</th><th>На сегодня</th><th>Аванс</th><th>Отсутствие</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
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
      blockMe.hidden = team || !moya["я"];
    });
  } catch (error) {
    // Нет права — вкладки просто не будет, это не ошибка страницы.
  }
}

start();
