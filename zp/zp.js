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

/* Выработка — графиком, а не столбцом чисел.
 *
 * Голые «276,2 штук за смену» и «1 из 51» ничего не говорят: человеку важно,
 * растёт он или падает и где он относительно контура. Линия по месяцам с
 * пунктиром среднего отвечает на оба вопроса сразу.
 */
/* Ширину SVG берём фактическую, а не растягиваем картинку под контейнер:
   с preserveAspectRatio="none" на широком экране буквы и кружки расползались
   вдвое по горизонтали. */
function liniyaVyrabotki(tochki, sredne, opts) {
  if (tochki.filter((t) => t.v !== null).length < 2) return "";
  const W = Math.max(520, Math.round((opts && opts.shirina) || 900));
  const H = 260;
  const padTop = 34;
  const padBottom = 30;
  const padLeft = 34;
  const padRight = 22;

  const est = tochki.filter((t) => t.v !== null);
  const svoi = tochki.some((t) => t.k);           // есть ли линия контура
  const cap = Math.max(...est.map((t) => t.v), sredne,
                       ...tochki.map((t) => t.k || 0)) * 1.2 || 1;
  const x = (i) => padLeft + (i / (tochki.length - 1)) * (W - padLeft - padRight);
  const y = (v) => padTop + (1 - v / cap) * (H - padTop - padBottom);

  /* Пропущенные недели рвут линию, а не склеиваются в прямую: человек в них
     не выходил, и рисовать там ход выработки — враньё. */
  function put(znachenie) {
    let d = "";
    let razryv = true;
    tochki.forEach((t, i) => {
      const v = znachenie(t);
      if (v === null || v === undefined) { razryv = true; return; }
      d += (razryv ? "M" : "L") + x(i).toFixed(1) + "," + y(v).toFixed(1) + " ";
      razryv = false;
    });
    return d.trim();
  }

  const moya = put((t) => t.v);
  const konturLine = svoi
    ? `<path d="${put((t) => t.k || null)}" class="zpLineKontur"/>` : "";
  // Числа над точками ставим всегда, когда они физически влезают: решает не
  // количество точек, а расстояние между ними в пикселях.
  const shagPx = (W - padLeft - padRight) / Math.max(1, tochki.length - 1);
  const gusto = shagPx < 34;
  const podpisi = gusto ? "" : tochki.map((t, i) => t.v === null ? "" :
    `<text x="${x(i).toFixed(1)}" y="${(y(t.v) - 11).toFixed(1)}"
      class="zpNum${shagPx < 56 ? " zpNum--melko" : ""}">${Math.round(t.v)}</text>`).join("");
  const shag = Math.max(1, Math.ceil(tochki.length / 10));
  const osi = tochki.map((t, i) => (i % shag && i !== tochki.length - 1) ? "" :
    `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="zpAx">${t.p}</text>`).join("");

  // Легенда в самом графике: подпись под заголовком читают не все.
  const legenda = `
    <g class="zpLeg" transform="translate(${padLeft},14)">
      <line x1="0" x2="16" y1="-4" y2="-4" class="zpLine"/>
      <text x="22" y="0">вы</text>
      ${svoi ? `<line x1="60" x2="76" y1="-4" y2="-4" class="zpLineKontur"/>
      <text x="82" y="0">контур в ту же неделю</text>` : ""}
      <line x1="${svoi ? 232 : 60}" x2="${svoi ? 248 : 76}" y1="-4" y2="-4" class="zpAvg"/>
      <text x="${svoi ? 254 : 82}" y="0">среднее по контуру</text>
    </g>`;

  return `
    <svg class="zpChart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
         preserveAspectRatio="xMidYMid meet">
      <line x1="${padLeft}" x2="${W - padRight}" y1="${y(sredne).toFixed(1)}"
            y2="${y(sredne).toFixed(1)}" class="zpAvg"/>
      <text x="${padLeft - 6}" y="${(y(sredne) + 4).toFixed(1)}" class="zpAvgNum"
        >${Math.round(sredne)}</text>
      ${est.length === tochki.length ? `<path d="${moya}
        L${x(tochki.length - 1).toFixed(1)},${H - padBottom}
        L${x(0).toFixed(1)},${H - padBottom} Z" class="zpArea"/>` : ""}
      ${konturLine}
      <path d="${moya}" class="zpLine"/>
      ${tochki.map((t, i) => t.v === null ? "" :
        `<circle cx="${x(i).toFixed(1)}" cy="${y(t.v).toFixed(1)}"
          r="${gusto ? 3 : 3.8}" class="zpDot"/>`).join("")}
      ${podpisi}${osi}${legenda}
      ${/* Прозрачные столбцы поверх: наведение где угодно по вертикали
            ловит ближайшую точку и показывает цифры за этот шаг. */ ""}
      <g class="zpHover">${tochki.map((t, i) => t.v === null ? "" : `
        <rect x="${(x(i) - shagPx / 2).toFixed(1)}" y="0" width="${shagPx.toFixed(1)}"
              height="${H - padBottom}" class="zpHit"
              data-x="${x(i).toFixed(1)}" data-y="${y(t.v).toFixed(1)}"
              data-v="${Math.round(t.v)}" data-k="${t.k ? Math.round(t.k) : ""}"
              data-p="${t.p}"/>`).join("")}</g>
    </svg>`;
}

/* Недели, в которые человек не выходил, всё равно должны быть на оси —
   иначе месячный простой выглядит как обычный шаг вправо. */
function polnyeNedeli(nedeli) {
  if (nedeli.length < 2) return nedeli;
  const nomer = (s) => {
    const m = String(s || "").match(/(\d{4})-W(\d{2})/);
    return m ? Number(m[1]) * 100 + Number(m[2]) : null;
  };
  const itog = [];
  for (let i = 0; i < nedeli.length; i += 1) {
    itog.push(nedeli[i]);
    const a = nomer(nedeli[i].n);
    const b = i + 1 < nedeli.length ? nomer(nedeli[i + 1].n) : null;
    if (a === null || b === null || b - a <= 1 || b - a > 12) continue;
    for (let k = a + 1; k < b; k += 1) {
      itog.push({ v: null, k: 0, p: "W" + String(k % 100).padStart(2, "0"), n: "" });
    }
  }
  return itog;
}

/* Подпись под заголовком: про светлую линию говорим только там, где она есть,
   то есть на неделях. */
function zametkaVyrabotki(sredne, estKontur) {
  // Что есть что — написано легендой на самом графике; здесь только суть.
  return estKontur
    ? "Штук за смену. Разрыв линии — недели, в которые человек не выходил"
    : "Штук за смену";
}

function grafikVyrabotki(rab) {
  if (!rab || !rab["на_смену"]) return "";
  const sredne = Number(rab["среднее_контура"]) || 0;
  const tren = rab["тренд"];

  const mesyacy = (rab["по_месяцам"] || []).filter((m) => m["на_смену"])
    .map((m) => ({ v: Number(m["на_смену"]) || 0, p: String(m["месяц"] || "").slice(5), k: 0 }));
  const nedeli = polnyeNedeli((rab["по_неделям"] || []).filter((w) => w["на_смену"])
    .map((w) => ({ v: Number(w["на_смену"]) || 0,
                   p: "W" + String(w["неделя"] || "").slice(-2),
                   n: w["неделя"] || "",
                   k: Number(w["контур"]) || 0 })));

  const k = sredne ? Math.round(100 * rab["на_смену"] / sredne - 100) : 0;

  const id = "w" + Math.random().toString(36).slice(2, 8);
  return `
    <div class="zpWork" data-work="${id}">
      <div class="zpWork__head">
        <div><p class="zpWork__cap">Выработка · ${rab["контур"]}</p>
        <p class="zpWork__note" data-note>${zametkaVyrabotki(sredne,
          nedeli.length > 1 && nedeli.some((n) => n.k))}</p></div>
        <div class="zpWork__tools">
          ${nedeli.length > 1 ? `<button class="zpView is-on" type="button" data-shag="недели">Недели</button>` : ""}
          ${mesyacy.length > 1 ? `<button class="zpView${nedeli.length > 1 ? "" : " is-on"}" type="button" data-shag="месяцы">Месяцы</button>` : ""}
          <a class="zpWork__link" href="/perf/">Весь контур →</a>
        </div>
      </div>
      <div class="zpWork__plot" data-nedeli='${JSON.stringify(nedeli)}'
           data-mesyacy='${JSON.stringify(mesyacy)}' data-sredne="${sredne}"
           data-shag="${nedeli.length > 1 ? "недели" : "месяцы"}">
        ${nedeli.length > 1 ? liniyaVyrabotki(nedeli, sredne) : liniyaVyrabotki(mesyacy, sredne)}
      </div>
      <div class="zpWork__itog">
        <span><b>${(rab["на_смену"] || 0).toLocaleString("ru-RU")}</b> штук за смену
          <i>${k >= 0 ? "+" : ""}${k}% к среднему по контуру</i></span>
        <span><b>${rab["место"] ? rab["место"] + " из " + rab["из"] : "—"}</b> место
          <i>среди тех, у кого хватает смен</i></span>
        <span><b>${tren === null || tren === undefined ? "—"
          : (tren > 0 ? "+" : "") + tren.toFixed(1) + "%"}</b> тренд
          <i>${(rab["смен"] || 0).toLocaleString("ru-RU")} смен, ${(rab["штук"] || 0).toLocaleString("ru-RU")} штук с ${String(rab["первая_смена"] || "").slice(0, 10)}</i></span>
      </div>
    </div>`;
}

/* Переключение шага прямо в блоке: данные уже в разметке, ходить за ними
   второй раз незачем. */
document.addEventListener("click", (event) => {
  const button = event.target.closest(".zpWork__tools .zpView");
  if (!button) return;
  const blok = button.closest(".zpWork");
  const plot = blok.querySelector(".zpWork__plot");
  blok.querySelectorAll(".zpWork__tools .zpView")
    .forEach((b) => b.classList.toggle("is-on", b === button));
  plot.dataset.shag = button.dataset.shag;
  pererisovat(plot);
});

/* Рисуем под фактическую ширину блока: так штрихи, кружки и подписи остаются
   такими, какими задуманы, на любом экране. */
function pererisovat(plot) {
  const nabor = plot.dataset.shag === "месяцы"
    ? JSON.parse(plot.dataset.mesyacy) : JSON.parse(plot.dataset.nedeli);
  const sredne = Number(plot.dataset.sredne) || 0;
  plot.innerHTML = liniyaVyrabotki(nabor, sredne,
    { shirina: plot.clientWidth || 900 });
  const note = plot.closest(".zpWork").querySelector("[data-note]");
  if (note) note.textContent = zametkaVyrabotki(sredne, nabor.some((t) => t.k));
}

/* Наведение на график: показываем неделю, свою выработку и контур за неё же.
   Ловим на всём блоке — точки мелкие, целиться в них мышью неудобно. */
document.addEventListener("mouseover", (event) => {
  const hit = event.target.closest(".zpHit");
  if (!hit) return;
  const plot = hit.closest(".zpWork__plot");
  const svg = hit.closest("svg");
  if (!plot || !svg) return;
  const mashtab = svg.getBoundingClientRect().width / (svg.viewBox.baseVal.width || 1);
  const kontur = hit.dataset.k
    ? `<i>контур ${Number(hit.dataset.k).toLocaleString("ru-RU")}</i>` : "";
  let vsplyvashka = plot.querySelector(".zpTip");
  if (!vsplyvashka) {
    vsplyvashka = document.createElement("div");
    vsplyvashka.className = "zpTip";
    plot.appendChild(vsplyvashka);
  }
  vsplyvashka.innerHTML = `<b>${Number(hit.dataset.v).toLocaleString("ru-RU")}</b>
    <span>${hit.dataset.p}</span>${kontur}`;
  vsplyvashka.style.left = (Number(hit.dataset.x) * mashtab) + "px";
  vsplyvashka.style.top = (Number(hit.dataset.y) * mashtab) + "px";
  vsplyvashka.dataset.on = "1";
});

document.addEventListener("mouseout", (event) => {
  const hit = event.target.closest(".zpHit");
  if (!hit) return;
  const tip = hit.closest(".zpWork__plot").querySelector(".zpTip");
  if (tip) delete tip.dataset.on;
});

const nablyudatel = typeof ResizeObserver === "function"
  ? new ResizeObserver((zapisi) => zapisi.forEach((z) => pererisovat(z.target)))
  : null;

/* Новый блок графика появляется после отрисовки карточки — подхватываем его
   и сразу пересчитываем под реальную ширину. */
function podklyuchitGrafiki(koren) {
  (koren || document).querySelectorAll(".zpWork__plot").forEach((plot) => {
    if (plot.dataset.gotov) return;
    plot.dataset.gotov = "1";
    pererisovat(plot);
    if (nablyudatel) nablyudatel.observe(plot);
  });
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

  const rab = kto ? null : data["выработка"];
  const vyrabotka = grafikVyrabotki(rab);

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

    <div class="zpCheck">
      <div class="zpCheck__part">
        <p class="zpCheck__cap">Из чего сложилось</p>
        <div class="zpCheck__line">
          <span>Окладная часть<small>${otrabotano} из ${ya["план_дней"]} по графику,
            оклад ${rubli(ya["оклад_на_руки"])}</small></span>
          <b>${rubli(ya["окладная_часть"] * 0.87)}</b>
        </div>
        <div class="zpCheck__line">
          <span>Премия<small>${ya["премия_ожидаемая"]
            ? "плановая, точную ставит руководитель"
            : "на этот месяц не заявлена"}</small></span>
          <b class="${ya["премия_ожидаемая"] ? "" : "zpCheck__net"}">${
            ya["премия_ожидаемая"] ? rubli(ya["премия_ожидаемая"] * 0.87) : "—"}</b>
        </div>
        ${ya["надбавка"] ? `
        <div class="zpCheck__line">
          <span>Надбавка<small>из формы подачи</small></span>
          <b>${rubli(ya["надбавка"] * 0.87)}</b>
        </div>` : ""}
        <div class="zpCheck__line">
          <span>НДФЛ<small>13% с ${rubli(ya["начислено"])}, уходит государству</small></span>
          <b class="zpCheck__minus">−${rubli(ya["начислено"] - ya["на_руки"])}</b>
        </div>
        <div class="zpCheck__line zpCheck__line--itog">
          <span>Заработано на сегодня<small>на руки</small></span>
          <b>${rubli(ya["на_руки"])}</b>
        </div>
      </div>

      <div class="zpCheck__part">
        <p class="zpCheck__cap">Когда придёт</p>
        <div class="zpCheck__line">
          <span>Аванс<small>${avansKogda}, за первую половину месяца</small></span>
          <b>${rubli(ya["аванс"])}</b>
        </div>
        <div class="zpCheck__line">
          <span>Зарплата<small>${zpKogda}, остальное за месяц</small></span>
          <b>${rubli(ya["остаток"])}</b>
        </div>
        <div class="zpCheck__line">
          <span>НДФЛ за месяц<small>13% с ${rubli(ya["прогноз_месяца"] / 0.87)}, уходит государству</small></span>
          <b class="zpCheck__minus">−${rubli(ya["прогноз_месяца"] / 0.87 - ya["прогноз_месяца"])}</b>
        </div>
        <div class="zpCheck__line zpCheck__line--itog">
          <span>За весь месяц, если доработаете<small>на руки, двумя выплатами</small></span>
          <b>${rubli(ya["прогноз_месяца"])}</b>
        </div>
      </div>
    </div>
    ${vyrabotka}`;
  blockMe.hidden = false;
  note.hidden = false;
  if (ya["тик"]) schetchik(ya["тик"], Number(data["посчитано_в"]) || 0);
  podklyuchitGrafiki(blockMe);
}

/* Панель управления ФОТ.
 *
 * Смысл не в том, чтобы показать сумму, а в том, чтобы её можно было разобрать:
 * плитка → подразделение → человек → из чего сложилась его цифра. Поэтому
 * кликается всё, а не только последняя таблица. */
function stroki(lyudi, otkuda) {
  return lyudi.map((c) => `
    <tr data-nomer="${otkuda.indexOf(c)}">
      <td class="hit" title="Открыть карточку"><b>${c["фио"]}</b><div class="src">${c["должность"] || ""}${c["подразделение"] ? " · " + c["подразделение"] : ""}</div></td>
      <td class="num">${rubli(c["оклад_на_руки"])}</td>
      <td class="num">${c["источник_факта"] === "СКУД" ? c["отработано"] : Math.round(c["отработано"])} / ${c["план_дней"]}<div class="src">${c["источник_факта"]}</div></td>
      <td class="num">${rubli(c["окладная_часть"] * 0.87)}</td>
      <td class="num"><input class="zpPrem" type="number" min="0" step="1000"
        inputmode="numeric" value="${c["премия_ожидаемая"] || ""}" placeholder="0"
        aria-label="Премия, ${c["фио"]}"><div class="src">до НДФЛ</div></td>
      <td class="num"><b>${rubli(c["на_руки"])}</b></td>
      <td class="num">${rubli(c["прогноз_месяца"])}</td>
      <td class="num">${vyrabotkaYacheyka(c["выработка"])}</td>
      <td class="num">${mestoYacheyka(c["выработка"])}</td>
      <td>${c["отсутствие"] || ""}</td>
    </tr>`).join("");
}

/* Выгрузка под форму подачи в 1С: колонки названы так же, как в ней, чтобы
   столбцы вставлялись как есть. Заполняем то, что знаем сами — дни по СКУД и
   отсутствия; премию и штрафы ставит руководитель. */
const STOLBCY_PODACHI = [
  ["Подаёт", (c) => c["подаёт"] || ""],
  ["Подразделение", (c) => c["подразделение"] || ""],
  ["Должность", (c) => c["должность"] || ""],
  ["ФИО", (c) => c["фио"] || ""],
  ["Статус", (c) => c["отсутствие"] || "Работа"],
  ["Оклад", (c) => c["оклад"] || ""],
  ["Надбавка", (c) => c["надбавка"] || 0],
  ["План дней", (c) => c["план_дней"] || 0],
  ["Отработано дней (факт)", (c) => c["отработано"] ?? ""],
  ["Отработано дней (раб.)", (c) => Math.round(c["отработано"] || 0)],
  ["Источник факта", (c) => c["источник_факта"] || ""],
  ["Последний выход", (c) => c["последний_выход"] || ""],
  ["Пропущено дней", (c) => c["пропущено_дней"] || 0],
  ["Штук за смену", (c) => (c["выработка"] || {})["на_смену"] ?? ""],
  ["Контур", (c) => (c["выработка"] || {})["контур"] || ""],
  ["Место в контуре", (c) => (c["выработка"] || {})["место"] ?? ""],
  ["Факт Ежемесячная премия", (c) => c["премия_ожидаемая"] || ""],
  ["Разовая премия", () => ""],
  ["Прочие штрафы", () => ""],
  ["Комментарий", () => ""],
];

function vygruzkaPodachi(spisok, podpis) {
  const ekran = (v) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return /[";\n]/.test(s) ? `"${s}"` : s;
  };
  const strok = [STOLBCY_PODACHI.map(([name]) => ekran(name)).join(";")]
    .concat(spisok.map((c) => STOLBCY_PODACHI.map(([, bri]) => ekran(bri(c))).join(";")));
  // BOM: без него Excel открывает кириллицу в CSV кракозябрами.
  const blob = new Blob(["﻿" + strok.join("\r\n")],
                        { type: "text/csv;charset=utf-8" });
  const ssylka = document.createElement("a");
  ssylka.href = URL.createObjectURL(blob);
  ssylka.download = "подача-зп-" + (podpis || "все").replace(/[^\wа-яА-ЯёЁ-]+/g, "-")
    + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(ssylka);
  ssylka.click();
  ssylka.remove();
  setTimeout(() => URL.revokeObjectURL(ssylka.href), 1000);
}

/* Выработка прямо в строке: руководителю нужен разрез по людям, а не поход
   в карточку каждого. Прочерк — человек не на пикающем контуре. */
function vyrabotkaYacheyka(rab) {
  if (!rab || !rab["на_смену"]) return "<span class=\"src\">—</span>";
  const k = rab["к_среднему"];
  const znak = k === null || k === undefined ? ""
    : `<div class="src ${k >= 0 ? "vyshe" : "nizhe"}">${k >= 0 ? "+" : ""}${k}% к контуру</div>`;
  return `<b>${rab["на_смену"].toLocaleString("ru-RU")}</b>${znak}`;
}

function mestoYacheyka(rab) {
  if (!rab || !rab["место"]) {
    return rab && rab["мало_смен"]
      ? "<span class=\"src\">мало смен</span>" : "<span class=\"src\">—</span>";
  }
  return `${rab["место"]} из ${rab["из"]}<div class="src">${rab["контур"]}</div>`;
}

function tablica(data) {
  const lyudi = data["люди"] || [];
  const itogo = data["итого"] || {};
  const podrazdeleniya = data["подразделения"] || [];
  const nepodklyucheny = data["не_подключены"] || [];

  // Базы подачи: у Посновой своя выгрузка, у Широких всё остальное по браку,
  // «ВИ Сервис» — третий контур, его пока не ведём.
  const BAZY = [
    { klyuch: "Поснова", imya: "Поснова", chto: "её выгрузка" },
    { klyuch: "Широких", imya: "Широких", chto: "остальные по браку" },
    { klyuch: "ВИ Сервис", imya: "ВИ Сервис", chto: "пока не подаём" },
    { klyuch: "", imya: "Все", chto: "департамент целиком" },
  ];
  const vBaze = (b) => b ? lyudi.filter((c) => c["подаёт"] === b) : lyudi;

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
    <nav class="zpBazy" id="bazy" aria-label="Чья база">
      ${BAZY.map((b, i) => `
        <button class="zpBaza${i ? "" : " is-on"}" type="button" data-baza="${b.klyuch}">
          <b>${b.imya}</b><span>${vBaze(b.klyuch).length} · ${b.chto}</span>
        </button>`).join("")}
    </nav>

    <div class="card zpLimit" id="limit"></div>

    <div class="card" style="padding:22px;margin-top:14px">
      <div class="cardHeading">
        <h2 id="ktoZagolovok">Люди</h2>
        <div class="zpFiltr">
          <input id="poisk" type="search" placeholder="Фамилия, должность, подразделение, контур"
                 autocomplete="off">
          <button class="zpView" type="button" id="sbros" hidden>Сбросить</button>
          <button class="zpView zpView--glavnaya" type="button" id="vygruzka"
                  title="CSV с колонками формы подачи: дни по СКУД, отсутствия, премии, выработка">Выгрузить для подачи</button>
        </div>
      </div>
      <p class="stamp">Премию впишите в столбце «Премия» — она сразу попадёт
        в итог, в прогноз и в выгрузку. Рядом основание: выработка и место
        в контуре. Клик по фамилии — карточка человека</p>
      <div class="scroll"><table>
        <thead><tr>
          <th>Человек</th><th>Оклад</th><th>Дни</th><th>Окладная</th>
          <th>Премия</th><th>На сегодня</th><th>Прогноз</th>
          <th>Штук за смену</th><th>Место</th><th>Отсутствие</th>
        </tr></thead>
        <tbody id="ktoTelo"></tbody>
        <tfoot id="ktoItog"></tfoot>
      </table></div>
    </div>

    <details class="card zpSvorka">
      <summary>Что просить уточнить · спорные оклады ${sporne.length}, без оклада ${nepodklyucheny.length}</summary>
      ${sporne.length ? `
      <h3>Оклад спорит со штаткой · ${sporne.length}</h3>
      <p class="stamp">Считаем по форме подачи — это то, что уходит в 1С. Штатка показана для сверки</p>
      <div class="scroll" style="max-height:260px"><table>
        <thead><tr><th>Человек</th><th>По форме подачи</th><th>По штатке</th><th>Разница</th></tr></thead>
        <tbody>${sporneRows}</tbody>
      </table></div>` : ""}
      ${nepodklyucheny.length ? `
      <h3>Оклада нет нигде · ${nepodklyucheny.length}</h3>
      <p class="stamp">Числятся в департаменте, но не попали ни в одну форму подачи</p>
      <div class="scroll" style="max-height:240px"><table>
        <thead><tr><th>Человек</th><th>Подразделение</th><th>Принят</th></tr></thead>
        <tbody>${net}</tbody>
      </table></div>` : ""}
      <h3>По подразделениям</h3>
      <div class="scroll" style="max-height:300px"><table>
        <thead><tr>
          <th>Подразделение</th><th>Человек</th><th>Фонд окладов</th>
          <th>На сегодня</th><th>Прогноз месяца</th><th>Отсутствуют</th><th>Факт из СКУД</th>
        </tr></thead>
        <tbody>${podr}</tbody>
      </table></div>
    </details>`;

  const telo = blockTeam.querySelector("#ktoTelo");
  const podval = blockTeam.querySelector("#ktoItog");
  const zagolovok = blockTeam.querySelector("#ktoZagolovok");
  const poisk = blockTeam.querySelector("#poisk");
  const sbros = blockTeam.querySelector("#sbros");
  const limit = blockTeam.querySelector("#limit");

  /* Введённые премии держим в браузере: подача идёт раз в месяц, а бегать
     за ними к серверу пока некуда. Ключ месяца — чтобы в новом месяце
     начинать с чистого листа, а не с прошлых сумм. */
  const KLYUCH = "zp-premii-" + (data["месяц"] || "");
  let premii = {};
  try { premii = JSON.parse(localStorage.getItem(KLYUCH) || "{}"); } catch (e) { premii = {}; }
  lyudi.forEach((c) => {
    const svoya = premii[c["логин"] || c["фио"]];
    if (svoya !== undefined) c["премия_ожидаемая"] = Number(svoya) || 0;
  });

  let baza = "Поснова";
  let vidno = [];
  let chto = "";

  // Прогноз считаем сами: премия могла поменяться прямо здесь, а сервер про
  // это ещё не знает.
  const prognozS = (c) => (c["прогноз_месяца"] || 0)
    - (c["премия_ожидаемая_ishodno"] ?? c["премия_база"] ?? 0) * 0.87
    + (c["премия_ожидаемая"] || 0) * 0.87;
  lyudi.forEach((c) => { c["премия_база"] = c["премия_база"] ?? (c["премия_ожидаемая"] || 0); });

  function svodka(spisok) {
    const summa = (f) => spisok.reduce((s, c) => s + (Number(f(c)) || 0), 0);
    return {
      lyudey: spisok.length,
      fond: summa((c) => c["оклад_на_руки"]),
      premii: summa((c) => (c["премия_ожидаемая"] || 0) * 0.87),
      segodnya: summa((c) => c["на_руки"]),
      prognoz: summa(prognozS),
    };
  }

  /* Перелимит: штатное расписание — это оклады. Всё, что сверх них (премии,
     надбавки), и есть превышение. Поэтому премии считаем только в прогнозе,
     а в план не кладём — иначе они входили бы в обе части и гасили сами себя. */
  function narisovatLimit(spisok, podpis) {
    const s = svodka(spisok);
    const raznica = s.prognoz - s.fond;
    const pereli = raznica > 0;
    limit.innerHTML = `
      <div class="zpLimit__head">
        <h2>Фонд ${podpis || "департамента"} · ${s.lyudey} чел.</h2>
        <span class="zpLimit__znak ${pereli ? "is-over" : "is-ok"}">${pereli
          ? "сверх окладов " + rubli(raznica) : "в пределах окладов, запас " + rubli(-raznica)}</span>
      </div>
      <div class="zpLimit__row">
        <div><small>Оклады по ШР</small><b>${rubli(s.fond)}</b><i>на руки, при полной отработке</i></div>
        <div><small>Премии проставлены</small><b>${rubli(s.premii)}</b><i>${
          spisok.filter((c) => c["премия_ожидаемая"]).length} из ${s.lyudey} человек</i></div>
        <div><small>Начислено на сегодня</small><b>${rubli(s.segodnya)}</b><i>${
          data["прошло_дней"]} из ${data["норма_дней"]} дней</i></div>
        <div><small>Выйдет за месяц</small><b>${rubli(s.prognoz)}</b><i>оклады по факту выходов плюс премии</i></div>
        <div><small>Против ШР</small><b class="${pereli ? "zpNad" : "zpPod"}">${
          (pereli ? "+" : "") + rubli(raznica)}</b><i>${pereli
            ? "премии и надбавки сверх окладов" : "недовыходы съели больше, чем добавили премии"}</i></div>
      </div>`;
  }

  function pokazat(spisok, podpis) {
    vidno = spisok;
    chto = podpis || baza || "все";
    telo.innerHTML = stroki(spisok, lyudi);
    const s = svodka(spisok);
    podval.innerHTML = `
      <tr>
        <td><b>Итого · ${s.lyudey}</b></td>
        <td class="num">${rubli(s.fond)}</td><td></td><td></td>
        <td class="num"><b>${rubli(s.premii)}</b></td>
        <td class="num"><b>${rubli(s.segodnya)}</b></td>
        <td class="num">${rubli(s.prognoz)}</td>
        <td colspan="3"></td>
      </tr>`;
    zagolovok.textContent = "Люди · " + spisok.length + (podpis ? " · " + podpis : "");
    sbros.hidden = spisok.length === vBaze(baza).length;
    narisovatLimit(spisok, podpis || (baza || "департамента"));
  }

  blockTeam.querySelector("#bazy").addEventListener("click", (event) => {
    const knopka = event.target.closest(".zpBaza");
    if (!knopka) return;
    blockTeam.querySelectorAll(".zpBaza")
      .forEach((b) => b.classList.toggle("is-on", b === knopka));
    baza = knopka.dataset.baza;
    poisk.value = "";
    pokazat(vBaze(baza), "");
  });

  // Премия вводится прямо в строке: вбил — итог, прогноз и выгрузка сразу
  // пересчитались, ничего сохранять отдельно не надо.
  telo.addEventListener("input", (event) => {
    const pole = event.target.closest(".zpPrem");
    if (!pole) return;
    const chelovek = lyudi[Number(pole.closest("tr").dataset.nomer)];
    if (!chelovek) return;
    chelovek["премия_ожидаемая"] = Math.max(0, Number(pole.value.replace(/\s/g, "")) || 0);
    premii[chelovek["логин"] || chelovek["фио"]] = chelovek["премия_ожидаемая"];
    try { localStorage.setItem(KLYUCH, JSON.stringify(premii)); } catch (e) { /* приват-режим */ }
    const s = svodka(vidno);
    podval.querySelector("td:nth-child(5) b").textContent = rubli(s.premii);
    podval.querySelector("td:nth-child(7)").textContent = rubli(s.prognoz);
    narisovatLimit(vidno, chto === baza ? baza : chto);
  });

  blockTeam.querySelector("#vygruzka")
    .addEventListener("click", () => vygruzkaPodachi(vidno, chto));

  poisk.addEventListener("input", () => {
    const slovo = poisk.value.trim().toLowerCase();
    const gde = vBaze(baza);
    if (!slovo) return pokazat(gde, "");
    pokazat(gde.filter((c) => [c["фио"], c["должность"], c["подразделение"],
      (c["выработка"] || {})["контур"] || ""]
      .join(" ").toLowerCase().includes(slovo)), "поиск «" + poisk.value.trim() + "»");
  });
  sbros.addEventListener("click", () => { poisk.value = ""; pokazat(vBaze(baza), ""); });

  pokazat(vBaze(baza), "");

  blockTeam.addEventListener("click", (event) => {
    // Строка подразделения — фильтр списка людей.
    const podrRow = event.target.closest("tr.hit[data-podr]");
    if (podrRow) {
      const name = podrazdeleniya[Number(podrRow.dataset.podr)]["подразделение"];
      pokazat(lyudi.filter((c) => (c["подразделение"] || "—") === name), name);
      telo.closest(".card").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Фамилия человека — его карточка со счётчиком и выплатами. Ловим именно
    // ячейку с именем: в строке есть поле премии, по нему кликают для ввода.
    const row = event.target.closest("td.hit")?.closest("tr[data-nomer]");
    if (!row) return;
    const chelovek = lyudi[Number(row.dataset.nomer)];
    if (!chelovek) return;
    karta(data, chelovek);
    // Догружаем его выработку: в общем списке её нет — она считается по
    // одному человеку. Экран получается ровно такой, какой видит он сам.
    if (chelovek["логин"]) {
      fetch("/__zp/chelovek?login=" + encodeURIComponent(chelovek["логин"]),
            { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((ego) => {
          if (!ego || !ego["выработка"]) return;
          const mesto = document.querySelector("#me .zpCheck");
          if (!mesto) return;
          mesto.insertAdjacentHTML("afterend", grafikVyrabotki(ego["выработка"]));
          podklyuchitGrafiki(blockMe);
        })
        .catch(() => { /* нет выработки — карточка и так полная */ });
    }
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
