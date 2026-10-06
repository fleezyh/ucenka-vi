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
const blockSvodka = document.getElementById("svodka");
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
    if (!el.classList.contains("zpDigit--roll")) {
      // Невидимая цифра в потоке задаёт окну ширину и настоящую базовую
      // линию: без неё окно с обрезкой садилось на строку нижним краем, и
      // копейки прыгали по высоте относительно запятой. Лента — поверх неё,
      // с лишним нулём в конце, чтобы 9 → 0 ехало вперёд, а не назад через
      // все цифры.
      el.className = "zpDigit zpDigit--roll";
      el.innerHTML = '<b aria-hidden="true">0</b><span class="zpDigit__strip">'
        + "01234567890".split("").map((d) => `<i>${d}</i>`).join("") + "</span>";
    }
    const strip = el.lastChild;
    const nado = Number(simvol);
    const bylo = strip.dataset.n === undefined ? null : Number(strip.dataset.n);
    if (bylo === nado) return;
    strip.dataset.n = String(nado);
    if (bylo === 9 && nado === 0) {
      strip.style.top = "-10em";
      strip.addEventListener("transitionend", () => {
        if (strip.dataset.n !== "0") return;
        strip.style.transition = "none";
        strip.style.top = "0";
        void strip.offsetHeight;
        strip.style.transition = "";
      }, { once: true });
      return;
    }
    strip.style.top = `${-nado}em`;
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
    // Считаем в копейках: округление дробной части отдельно давало «,100».
    const vsego = Math.round(summa() * 100);
    const celye = Math.floor(vsego / 100);
    const kop = vsego % 100;
    napisat(rubliEl, celye.toLocaleString("ru-RU").replace(/ /g, " "));
    napisat(kopeykiEl, "," + String(kop).padStart(2, "0"));
  }

  risovat();
  stateEl.innerHTML = '<i class="zpTick__dot"></i>Начисляется прямо сейчас';
  stateEl.className = "zpTick__state is-live";
  setInterval(risovat, 1000);
}

/* Выработка по дням (06.10, Степан, скрин Азизовой: «сделай людям человеческий… по дням, вчера была
 * столько, когда работала какие дни, когда простои… в формате главного лайн-чарта, а то 99 07»).
 *
 * График — общий ViGrafik сайта: точка — штуки за день, выходной — разрыв линии, пунктир — средняя
 * смена контура в тот же день. Над ним — те же плитки, что в профиле; под ним — выбранный день
 * целиком: с какого по какое время работал(а), где стоял(а) и где были паузы дольше порога.
 */
const VYR = new Map();   // id блока → { rab, dney, den }
const NED = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const vyrDm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const vyrNed = (d) => NED[new Date(`${d}T12:00:00Z`).getUTCDay()];
const vyrSht = (n) => Math.round(n || 0).toLocaleString("ru-RU");
const vyrEsc = (t) => String(t ?? "").replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]));
function vyrChM(m) {
  m = Math.round(m || 0);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}`;
}
const vyrMin = (hm) => { const [h, m] = String(hm || "0:0").split(":").map(Number); return h * 60 + m; };

/* Все календарные дни периода, по последний день, который уже есть в данных (обычно вчера).
   moy — штуки со столов контура, ops — все операции в WMS (06.10: «надо чтоб все»). */
function vyrDni(rab, dney) {
  const kont = rab["контур_по_дням"] || [];
  const moi = rab["по_дням"] || [];
  const ops = rab["операции_по_дням"] || [];
  const posl = [kont.length ? kont[kont.length - 1][0] : "", moi.length ? moi[moi.length - 1]["день"] : "",
    ops.length ? ops[ops.length - 1]["день"] : ""].sort().pop();
  if (!posl) return [];
  const poDnyu = Object.fromEntries(moi.map((z) => [z["день"], z]));
  const opsPoDnyu = Object.fromEntries(ops.map((z) => [z["день"], z]));
  const kontPoDnyu = Object.fromEntries(kont);
  const kontOps = Object.fromEntries(rab["операции_контура"] || []);
  const konec = new Date(`${posl}T12:00:00Z`).getTime();
  const out = [];
  for (let i = dney - 1; i >= 0; i -= 1) {
    const den = new Date(konec - i * 864e5).toISOString().slice(0, 10);
    out.push({ den, moy: poDnyu[den] || null, ops: opsPoDnyu[den] || null,
      kontur: kontPoDnyu[den] ?? null, kontOps: kontOps[den] ?? null });
  }
  return out;
}

// Что считаем: все операции в WMS или штуки со столов контура.
const vyrZnach = (z, chto) => (chto === "vse" ? (z.ops ? z.ops["операций"] : null) : (z.moy ? z.moy["штук"] : null));
const vyrKont = (z, chto) => (chto === "vse" ? z.kontOps : z.kontur);

function vyrKogda(den) {
  const segodnya = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const n = Math.round((new Date(`${segodnya}T12:00:00Z`) - new Date(`${den}T12:00:00Z`)) / 864e5);
  return n === 0 ? "сегодня" : n === 1 ? "вчера" : n === 2 ? "позавчера" : `${vyrNed(den)} ${vyrDm(den)}`;
}

function vyrPlitki(rab, dni, dney, chto) {
  const vse = chto === "vse";
  const rab_ = dni.filter((z) => vyrZnach(z, chto) != null);
  const posl = rab_[rab_.length - 1];
  const vsego = rab_.reduce((s, z) => s + vyrZnach(z, chto), 0);
  const naDen = rab_.length ? vsego / rab_.length : 0;
  const kontDni = rab_.map((z) => vyrKont(z, chto)).filter((v) => v);
  const kontSr = kontDni.length ? kontDni.reduce((s, v) => s + v, 0) / kontDni.length : 0;
  const k = kontSr ? Math.round(100 * naDen / kontSr - 100) : null;
  const sVremenem = dni.filter((z) => z.moy && z.moy["начало"]);
  const prostoy = sVremenem.reduce((s, z) => s + (z.moy["простой"] || 0), 0);
  const pauz = sVremenem.reduce((s, z) => s + (z.moy["паузы"] || []).length, 0);
  const plitka = (b, small) => `<div><b>${b}</b><small>${small}</small></div>`;
  const vremya = posl && posl.moy && posl.moy["начало"] ? ` · ${posl.moy["начало"]}–${posl.moy["конец"]}` : "";
  return `<div class="kabCifry zpWork__cifry">
    ${plitka(posl ? vyrSht(vyrZnach(posl, chto)) : "—",
      posl ? `${vse ? "операций " : "шт "}${vyrKogda(posl.den)}${vremya}` : `не было работы за ${dney} дней`)}
    ${plitka(vyrSht(vsego), `${vse ? "операций" : "штук"} за ${dney} дней · дней ${rab_.length}`)}
    ${plitka(rab_.length ? vyrSht(naDen) : "—", `${vse ? "в день" : "за смену"}${k === null ? "" : ` · ${k >= 0 ? "+" : ""}${k}% к контуру`}`)}
    ${plitka(sVremenem.length ? vyrChM(prostoy) : "—",
      sVremenem.length ? `простои · пауз дольше ${rab["простой_порог"] || 30} мин: ${pauz}` : "простои — только за 45 дней")}
    ${plitka(rab["место"] ? `${rab["место"]} из ${rab["из"]}` : "—", "место по штукам со столов")}
  </div>`;
}

/* День целиком: что сделано в WMS и откуда, сколько со столов, лента рабочего времени
   (работа — синим, паузы дольше порога — красным). */
function vyrDen(z, rab, blokShirina) {
  if (!z || (!z.moy && !z.ops)) return "";
  const m = z.moy || {};
  const o = z.ops;
  const zag = `<p class="zpDen__zag"><b>${vyrNed(z.den)} ${vyrDm(z.den)}</b>`
    + (o ? ` · ${vyrSht(o["операций"])} операций в WMS (${vyrSht(o["штук"])} шт)${z.kontOps ? ` · контур ${vyrSht(z.kontOps)} на человека` : ""}` : "")
    + (z.moy ? ` · со столов ${vyrSht(m["штук"])} шт${(m["столы"] || []).length ? ` (${vyrEsc(m["столы"].join(", "))})` : ""}` : "") + "</p>";
  const otkuda = o ? `<p class="zpDen__txt zpDen__ops">откуда: ${(o["зоны"] || []).map(([zona, n]) => `${vyrEsc(zona)} — ${vyrSht(n)}`).join(" · ")}`
    + `${Object.keys(o["типы"] || {}).length > 1 ? `<br>что: ${Object.entries(o["типы"]).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${vyrSht(n)}`).join(" · ")}` : ""}</p>` : "";
  if (!m["начало"]) {
    return `<div class="zpDen">${zag}${otkuda}${z.moy ? `<p class="zpDen__txt">время работы по часам есть только с ${rab["простои_с"] ? vyrDm(rab["простои_с"]) : "последних 45 дней"}</p>` : ""}</div>`;
  }
  const a = vyrMin(m["начало"]);
  const b = vyrMin(m["конец"]);
  const ot = Math.min(8 * 60, Math.floor(a / 60) * 60);
  const doo = Math.max(21 * 60, Math.ceil(b / 60) * 60);
  const pr = (x) => (100 * (x - ot) / (doo - ot)).toFixed(2);
  const pauzy = m["паузы"] || [];
  const chasy = [];
  const shagCh = (blokShirina || 900) < 560 ? 4 : 2;
  for (let h = ot / 60; h <= doo / 60; h += shagCh) chasy.push(`<span style="left:${pr(h * 60)}%">${String(h).padStart(2, "0")}:00</span>`);
  return `<div class="zpDen">${zag}${otkuda}
    <div class="zpDen__lenta">
      <i class="zpDen__rab" style="left:${pr(a)}%;width:${(pr(b) - pr(a)).toFixed(2)}%"></i>
      ${pauzy.map(([s, e, min]) => `<i class="zpDen__pauza" style="left:${pr(vyrMin(s))}%;width:${(pr(vyrMin(e)) - pr(vyrMin(s))).toFixed(2)}%" title="${s}–${e} · ${vyrChM(min)}"></i>`).join("")}
    </div>
    <div class="zpDen__os">${chasy.join("")}</div>
    <p class="zpDen__txt">с ${m["начало"]} до ${m["конец"]}${pauzy.length
      ? ` · простои ${vyrChM(m["простой"])}: ${pauzy.map(([s, e, min]) => `${s}–${e} (${vyrChM(min)})`).join(", ")}`
      : ` · пауз дольше ${rab["простой_порог"] || 30} мин не было`}</p>
  </div>`;
}

function grafikVyrabotki(rab) {
  if (!rab || !rab["на_смену"]) return "";
  const id = "w" + Math.random().toString(36).slice(2, 8);
  const estOps = (rab["операции_по_дням"] || []).length > 0;
  const posl = [...(rab["по_дням"] || []), ...(rab["операции_по_дням"] || [])].map((z) => z["день"]).sort().pop() || "";
  VYR.set(id, { rab, dney: 30, den: posl, chto: estOps ? "vse" : "stoly" });
  return `
    <div class="zpWork" data-work="${id}">
      <div class="zpWork__head">
        <div><p class="zpWork__cap">Выработка · ${vyrEsc(rab["контур"])}</p>
        <p class="zpWork__note" data-vyr-note></p></div>
        <div class="zpWork__tools">
          ${estOps ? `<button class="zpView is-on" type="button" data-chto="vse">Все операции</button>
          <button class="zpView" type="button" data-chto="stoly">Штуки со столов</button>` : ""}
          <button class="zpView is-on" type="button" data-dney="30">30 дней</button>
          <button class="zpView" type="button" data-dney="92">3 месяца</button>
          <a class="zpWork__link" href="/perf/">Весь контур →</a>
        </div>
      </div>
      <div data-vyr-telo></div>
    </div>`;
}

function vyrNarisovat(blok) {
  const st = VYR.get(blok.dataset.work);
  if (!st) return;
  const { rab, dney, chto } = st;
  const vse = chto === "vse";
  const dni = vyrDni(rab, dney);
  blok.querySelector("[data-vyr-note]").textContent = vse
    ? "Все проведённые операции в WMS за день. Разрыв — дни без работы, пунктир — обычный день человека в контуре (медиана). Клик по дню — откуда и как он прошёл."
    : "Штуки со столов контура за день. Разрыв — дни без выхода, пунктир — средняя смена контура. Клик по дню — как он прошёл.";
  const telo = blok.querySelector("[data-vyr-telo]");
  const est = (z) => z.moy || z.ops;
  telo.innerHTML = vyrPlitki(rab, dni, dney, chto) + '<div class="zpWork__plot"></div>'
    + vyrDen(dni.find((z) => z.den === st.den && est(z)) || [...dni].reverse().find(est), rab, blok.clientWidth);
  const plot = telo.querySelector(".zpWork__plot");
  if (!window.ViGrafik || !dni.length) {
    plot.innerHTML = '<p class="zpWork__note">за последние три месяца работы нет</p>';
    return;
  }
  // даты под осью — сколько влезает по ширине (на телефоне 30 дат сливались в кашу)
  const shag = Math.max(1, Math.ceil(dni.length * 46 / Math.max(260, plot.clientWidth || 900)));
  plot.append(window.ViGrafik.sozdat({
    tochki: dni.map((z, i) => ({
      znach: vyrZnach(z, chto),
      os: (dni.length - 1 - i) % shag ? "" : vyrDm(z.den),
      zag: `${vyrNed(z.den)} ${vyrDm(z.den)}`,
      vybrano: z.den === st.den,
      dop: vyrZnach(z, chto) == null ? ["работы не было"] : [
        vse ? (z.ops["зоны"] || []).slice(0, 3).map(([zona, n]) => `${zona} — ${vyrSht(n)}`).join("; ") : (z.moy["столы"] || []).join(", "),
        z.moy && z.moy["начало"] ? `с ${z.moy["начало"]} до ${z.moy["конец"]}` : "",
        z.moy && z.moy["паузы"] && z.moy["паузы"].length ? `простои ${vyrChM(z.moy["простой"])}` : "",
      ].filter(Boolean),
    })),
    format: (v) => vyrSht(v),
    formatTochno: (v) => `${vyrSht(v)} ${vse ? "операций" : "шт"}`,
    otNulya: true,
    trend: 0,
    prizrak: dni.map((z) => vyrKont(z, chto)),
    prizrakPodpis: vse ? "обычный день в контуре" : "средняя смена контура",
    vysota: 240,
    klik: (i) => { if (dni[i] && est(dni[i])) { st.den = dni[i].den; vyrNarisovat(blok); } },
  }));
}

document.addEventListener("click", (event) => {
  const button = event.target.closest(".zpWork__tools .zpView[data-dney], .zpWork__tools .zpView[data-chto]");
  if (!button) return;
  const blok = button.closest(".zpWork");
  const st = VYR.get(blok.dataset.work);
  if (!st) return;
  const klyuch = button.dataset.dney ? "dney" : "chto";
  if (klyuch === "dney") st.dney = Number(button.dataset.dney) || 30;
  else st.chto = button.dataset.chto;
  blok.querySelectorAll(`.zpWork__tools .zpView[data-${klyuch}]`).forEach((b) => b.classList.toggle("is-on", b === button));
  vyrNarisovat(blok);
});

/* Новый блок появляется после отрисовки карточки — подхватываем и рисуем. */
function podklyuchitGrafiki(koren) {
  (koren || document).querySelectorAll(".zpWork[data-work]").forEach((blok) => {
    if (blok.dataset.gotov) return;
    blok.dataset.gotov = "1";
    vyrNarisovat(blok);
  });
}

function karta(data, kto) {
  const ya = kto || data["я"];
  if (!ya) return;
  // Каждую открытую карточку сначала показываем со скрытыми суммами.
  // Выработка остаётся видимой: это не денежные данные.
  blockMe.classList.add("zpMe--concealed");
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
  // Пятидневке «20 из 23 по графику» рядом с «прошло 19 из 22» выглядело как
  // ошибка: 20 — это доля 19/22 от плановых дней из HR. Считается та же доля,
  // поэтому показываем прямо её: рабочие дни месяца минус оформленные отсутствия.
  const bylo = Math.max(0, proshlo - (Number(ya["пропущено_дней"]) || 0));
  const skolko = poSkud
    ? `${otrabotano} из ${ya["план_дней"]} смен по графику`
    : `${bylo} из ${norma} рабочих дней`;
  const avansKak = ya["аванс_точно"] ? "" : " примерно";
  const otsutstvie = ya["отсутствие"]
    ? `<p class="zpTick__away">По данным 1С у вас ${ya["отсутствие"]} —
        за эти дни оклад не начисляется, они оплачиваются отдельно.</p>` : "";

  // Пометка обязана быть конкретной. «Бета» сама по себе ничего не говорит:
  // человек должен понимать, из какого месяца взят его оклад и почему итог
  // может разойтись — иначе он придёт с этим к координатору, то есть ровно
  // туда, откуда мы его уводим.
  // С 16.09.2026 оклад берётся из штатного расписания, а форма подачи — только
  // для тех, кого там нет. Раньше плашка всем писала «из подачи за июль», и в
  // сентябре это выглядело как устаревшие данные.
  const okladIz = ya["источник_оклада"] === "ШР" ? "оклад по штатному расписанию"
    : data["оклады_из"] ? `оклад из подачи за ${mesyacRodit(data["оклады_из"])}` : "";
  const beta = `<div class="zpBeta">
      <b>Предварительный расчёт</b>
      <span>${okladIz ? okladIz[0].toUpperCase() + okladIz.slice(1) + ", " : ""}премия
        плановая. Итог считает 1С после подачи.</span>
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
      <p class="zpTick__value"><button class="zpTick__number zpSecret" type="button"
        aria-label="Показать суммы зарплаты" aria-pressed="false"><span class="zpSecret__text"><span class="zpRoll" id="tickRub"></span><small class="zpRoll" id="tickKop"></small><span class="zpTick__rub">₽</span></span></button></p>
      <button class="zpPrivacyToggle" type="button">Нажмите, чтобы показать суммы</button>
      <p class="zpTick__state" id="tickState"></p>
      ${otsutstvie}
      <div class="zpTick__bar"><span style="width:${(dolya * 100).toFixed(1)}%"></span></div>
      <p class="zpTick__hint">Прошло ${proshlo} из ${norma} рабочих дней ·
        ${poSkud ? `отработано ${skolko} · ` : ""}${istochnik}</p>
    </div>

    <div class="zpCheck">
      <div class="zpCheck__part">
        <p class="zpCheck__cap">Из чего сложилось</p>
        <div class="zpCheck__line">
          <span>Окладная часть<small>${skolko},
            оклад <span class="zpSecret zpSecret--inline">${rubli(ya["оклад_на_руки"])}</span></small></span>
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
          <span>НДФЛ<small>13% с <span class="zpSecret zpSecret--inline">${rubli(ya["начислено"])}</span>, уходит государству</small></span>
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
          <span>НДФЛ за месяц<small>13% с <span class="zpSecret zpSecret--inline">${rubli(ya["прогноз_месяца"] / 0.87)}</span>, уходит государству</small></span>
          <b class="zpCheck__minus">−${rubli(ya["прогноз_месяца"] / 0.87 - ya["прогноз_месяца"])}</b>
        </div>
        <div class="zpCheck__line zpCheck__line--itog">
          <span>За весь месяц, если доработаете<small>на руки, двумя выплатами</small></span>
          <b>${rubli(ya["прогноз_месяца"])}</b>
        </div>
      </div>
    </div>
    ${vyrabotka}`;
  blockMe.querySelectorAll(".zpCheck__line b, .zpSecret--inline").forEach((amount) => {
    amount.innerHTML = `<span class="zpSecret__text">${amount.innerHTML}</span>`;
  });
  blockMe.hidden = false;
  note.hidden = false;
  if (ya["тик"]) schetchik(ya["тик"], Number(data["посчитано_в"]) || 0);
  podklyuchitGrafiki(blockMe);
}

blockMe.addEventListener("click", (event) => {
  const main = event.target.closest(".zpTick__number");
  const toggle = event.target.closest(".zpPrivacyToggle");
  const hiddenLine = blockMe.classList.contains("zpMe--concealed")
    && event.target.closest(".zpCheck__line");
  if (!main && !toggle && !hiddenLine) return;
  const concealed = blockMe.classList.toggle("zpMe--concealed");
  const number = blockMe.querySelector(".zpTick__number");
  const hint = blockMe.querySelector(".zpPrivacyToggle");
  if (number) {
    number.setAttribute("aria-pressed", String(!concealed));
    number.setAttribute("aria-label", concealed ? "Показать суммы зарплаты" : "Скрыть суммы зарплаты");
  }
  if (hint) hint.textContent = concealed ? "Нажмите, чтобы показать суммы" : "Скрыть суммы";
});

/* Панель управления ФОТ.
 *
 * Смысл не в том, чтобы показать сумму, а в том, чтобы её можно было разобрать:
 * плитка → подразделение → человек → из чего сложилась его цифра. Поэтому
 * кликается всё, а не только последняя таблица. */
/* Остальные выплаты: квартальная и прочие премии, доплата за совмещение и
   обоснование. В строку таблицы их шесть не влезет, да и заполняют их редко —
   поэтому прячем за кнопкой и раскрываем по клику.
   Просьба Посновой 16.09.2026: «нужна разбивка, как в файле подачи ЗП», и
   отдельно комментарий — без обоснования премию в 1С не принимают. */
const VIDY_VYPLAT = [
  ["премия_квартал", "Квартальная"],
  ["премия_полугодие", "Полугодовая"],
  ["премия_год", "Годовая"],
  ["премия_разовая", "Разовая"],
  ["доплата_совмещение", "Доплата за совмещение"],
];

function eshchyoZnak(c) {
  const vyplaty = c["выплаты"] || {};
  const skolko = VIDY_VYPLAT.filter(([klyuch]) => Number(vyplaty[klyuch]) > 0).length
    + (c["премия_комментарий"] ? 1 : 0);
  return skolko ? String(skolko) : "+";
}

function eshchyoStroka(c) {
  const vyplaty = c["выплаты"] || {};
  const polya = VIDY_VYPLAT.map(([klyuch, imya]) => `
    <label class="zpMore__pole"><span>${imya}</span>
      <input type="number" min="0" step="1000" inputmode="numeric"
             data-vid="${klyuch}" value="${vyplaty[klyuch] || ""}" placeholder="0"></label>`).join("");
  return `<tr class="zpMoreRow"><td colspan="10">
    <div class="zpMore__polya">${polya}</div>
    <label class="zpMore__comm"><span>Обоснование премии</span>
      <input type="text" maxlength="300" data-vid="комментарий"
             value="${(c["премия_комментарий"] || "").replace(/"/g, "&quot;")}"
             placeholder="за что: проект, переработка, замещение"></label>
    <p class="stamp">Суммы уходят в форму подачи отдельными колонками, как в 1С,
      и попадают в итоговый ФОТ. Обоснование — в колонку «Комментарий для „Премии“»</p>
  </td></tr>`;
}

function stroki(lyudi, otkuda) {
  return lyudi.map((c) => `
    <tr data-nomer="${otkuda.indexOf(c)}">
      <td class="hit" title="Открыть карточку"><b>${c["фио"]}</b><div class="src">${c["должность"] || ""}${c["подразделение"] ? " · " + c["подразделение"] : ""}</div></td>
      <td class="num">${rubli(c["оклад"])}</td>
      <td class="num">${c["источник_факта"] === "СКУД" ? c["отработано"] : Math.round(c["отработано"])} / ${c["план_дней"]}<div class="src">${c["источник_факта"]}</div></td>
      <td class="num">${rubli(c["окладная_часть"])}</td>
      <td class="num"><input class="zpPrem" type="number" min="0" step="1000"
        inputmode="numeric" value="${c["премия_план"] || ""}" placeholder="0"
        aria-label="Премия за месяц, ${c["фио"]}"><div class="src">за месяц, гросс</div></td>
      <td class="num"><button class="zpMore" type="button"
        title="Квартальная, полугодовая, годовая, разовая, доплата за совмещение и комментарий"
        aria-label="Остальные выплаты, ${c["фио"]}">${eshchyoZnak(c)}</button></td>
      <td class="num"><b data-seychas>${rubli(c["начислено"])}</b></td>
      <td class="num" data-prognoz>${rubli(c["прогноз_гросс"] ?? c["прогноз_месяца"] / 0.87)}</td>
      <td class="num">${vyrabotkaYacheyka(c["выработка"])}</td>
      <td>${c["отсутствие"] || ""}${c["подсказка"]
        ? `<div class="src">${c["подсказка"]}</div>` : ""}</td>
    </tr>`).join("");
}

/* Выгрузка для подачи — сама форма 1С (xls, те же колонки и тот же порядок),
   на тех, кто сейчас виден в таблице: отдел, подающий, поиск. До 25.09.2026
   здесь был CSV со своими колонками, а настоящая форма бралась только верхней
   кнопкой и только целиком на весь контур. */
async function vygruzkaPodachi(spisok, podpis, knopka) {
  const bylo = knopka ? knopka.textContent : "";
  if (knopka) { knopka.disabled = true; knopka.textContent = "Собираю форму…"; }
  try {
    const otvet = await fetch("/__zp/forma/spisok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "фио": spisok.map((c) => c["фио"]), "подпись": podpis || "все" }),
    });
    if (!otvet.ok) throw new Error(`сервер ответил ${otvet.status}`);
    const blob = await otvet.blob();
    const ssylka = document.createElement("a");
    ssylka.href = URL.createObjectURL(blob);
    ssylka.download = "ВИ Ввод данных по ЗП — " + (podpis || "все").replace(/[^\wа-яА-ЯёЁ -]+/g, "-")
      + " " + new Date().toISOString().slice(0, 10) + ".xls";
    document.body.appendChild(ssylka);
    ssylka.click();
    ssylka.remove();
    setTimeout(() => URL.revokeObjectURL(ssylka.href), 1000);
  } catch (oshibka) {
    alert("Форма не собралась: " + (oshibka.message || oshibka));
  } finally {
    if (knopka) { knopka.disabled = false; knopka.textContent = bylo; }
  }
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


function tablica(data) {
  // ВИ Сервис в панель не берём вовсе: третий контур пока не наш.
  const lyudi = (data["люди"] || []).filter((c) => c["подаёт"] !== "ВИ Сервис");
  // «Оба контура» — только то, что подаём: ничьи туда не входят, иначе они
  // растворятся в итогах, а их как раз надо видеть отдельно.
  const nashi = lyudi.filter((c) => c["подаёт"] !== "не закреплён");
  const itogo = data["итого"] || {};
  const podrazdeleniya = data["подразделения"] || [];
  const nepodklyucheny = data["не_подключены"] || [];

  // Кто что подаёт в 1С. Контуров три: у Посновой её подразделения, у Широких
  // отдел фильтра брака, у Малашкиной управление направления и группа продаж
  // уценённого товара. «ВИ Сервис» считает зарплату сам, в панель не берём.
  const BAZY = [
    { klyuch: "Поснова", imya: "Поснова", bukva: "П", chto: "её выгрузка" },
    { klyuch: "Широких", imya: "Широких", bukva: "Ш", chto: "отдел фильтр брака" },
    { klyuch: "Малашкина", imya: "Малашкина", bukva: "М", chto: "управление и продажи" },
    { klyuch: "", imya: "Все контуры", bukva: "Σ", chto: "всё, что подаём" },
    { klyuch: "не закреплён", imya: "Ничьи", bukva: "!", chto: "никто не подаёт",
      trevoga: true },
  ];
  const vBaze = (b) => b ? lyudi.filter((c) => c["подаёт"] === b) : nashi;

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
      <td class="num">${rubli(p["фот"])}</td>
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
      ${BAZY.filter((b) => !b.trevoga || vBaze(b.klyuch).length).map((b, i) => `
        <button class="zpBaza${i ? "" : " is-on"}${b.trevoga ? " zpBaza--trevoga" : ""}"
                type="button" data-baza="${b.klyuch}">
          <span class="zpBaza__znak">${b.bukva}</span>
          <span class="zpBaza__copy">
            <strong>${b.imya}</strong>
            <span class="zpBaza__note">${b.chto}</span>
          </span>
          <span class="zpBaza__skolko">${vBaze(b.klyuch).length}</span>
        </button>`).join("")}
    </nav>

    <div class="card zpLimit" id="limit"></div>

    <!-- Подача в 1С. Два способа нарочно: какой приживётся, покажет практика.
         Первый честнее — 1С отдаёт форму со своими GUID, мы её заполняем и
         возвращаем. Второй быстрее — файл собирается у нас, но GUID берутся
         из того, что мы уже видели. -->
    <div class="card zpForma">
      <h2>Форма подачи в 1С</h2>
      <p class="zpForma__note">Заполняем оклад и отработанные дни прогнозом на полный месяц, ежемесячную премию, дни отпусков и больничных из 1С; статус строки — отсутствие на последний день месяца, как в самой 1С. Кнопка «Выгрузить для подачи» ниже собирает ту же форму на тех, кто виден в таблице.</p>
      <div class="zpForma__row">
        <label class="zpForma__drop">
          <input type="file" id="formaVhod" accept=".xls,.xlsx" hidden>
          <b>Заполнить выгрузку из 1С</b>
          <small>Нажмите «Заполнить» в 1С, скачайте файл и положите его сюда — вернём заполненным</small>
        </label>
        <a class="zpForma__save" id="formaSvoya" href="/__zp/forma" download>
          <b>Скачать нашу форму</b>
          <small>Собрана с нуля по нашим данным, с теми же колонками</small>
        </a>
      </div>
      <p class="zpForma__otvet" id="formaOtvet" hidden></p>
    </div>

    <div class="card zpOtdely" id="otdely"></div>

    <div class="card" style="padding:22px;margin-top:14px">
      <div class="cardHeading">
        <h2 id="ktoZagolovok">Люди</h2>
        <div class="zpFiltr">
          <input id="poisk" type="search" placeholder="Фамилия, должность, подразделение, контур"
                 autocomplete="off">
          <button class="zpView" type="button" id="sbros" hidden>Сбросить</button>
          <button class="zpView zpView--glavnaya" type="button" id="vygruzka"
                  title="Форма 1С «Ввод данных по ЗП» на тех, кто сейчас в таблице: отфильтруйте отдел или найдите людей — выгрузится ровно этот список">Выгрузить для подачи</button>
        </div>
      </div>
      <p class="stamp">Премию впишите в столбце «Премия» — она сразу попадёт
        в итог, в прогноз и в выгрузку. Рядом основание — выработка. Клик по фамилии — карточка человека</p>
      <div class="scroll"><table>
        <thead><tr>
          <th>Человек</th><th>Оклад, гросс</th><th>Дни</th><th>Окладная</th>
          <th>Премия</th><th>Ещё</th><th>На сегодня</th><th>Прогноз месяца</th>
          <th>Штук за смену</th><th>Отсутствие</th>
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
          <th>Подразделение</th><th>Человек</th><th>Оклады, гросс</th>
          <th>На сегодня</th><th>Подадим за месяц</th><th>ФОТ со взносами</th>
          <th>Отсутствуют</th><th>Факт из СКУД</th>
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

  /* Премии приходят с сервера уже внутри расчёта: их ставит подающий, а
     видят все, кто смотрит панель. Здесь только отправляем изменение. */
  function sohranitPremiyu(chelovek) {
    return fetch("/__zp/premiya", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "логин": chelovek["логин"],
        "премия": chelovek["премия_план"] || 0,
        "месяц": data["месяц"] || "",
        ...(chelovek["выплаты"] || {}),
        "комментарий": chelovek["премия_комментарий"] || "",
      }),
    }).then((r) => r.ok);
  }

  // Доля месяца, прошедшая на сегодня: месячная премия набегает вместе с ней.
  const dolya = (data["норма_дней"] || 0)
    ? (data["прошло_дней"] || 0) / data["норма_дней"] : 0;

  /* Премию вводят в гросс — в нём же и пересчитываем строку. Раньше здесь
     стоял множитель 0,87, потому что панель показывала «на руки». */
  function postavitPremiyu(c, mesyachnaya) {
    const bylo = c["премия_ожидаемая"] || 0;
    c["премия_план"] = Math.max(0, Math.round(Number(mesyachnaya) || 0));
    c["премия_ожидаемая"] = Math.round(c["премия_план"] * dolya);
    const delta = c["премия_ожидаемая"] - bylo;
    c["начислено"] = (c["начислено"] || 0) + delta;
    c["на_руки"] = (c["на_руки"] || 0) + delta * 0.87;
    const pribavka = c["премия_план"] - (c["премия_план_ishodno"] || 0);
    c["прогноз_гросс"] = (c["прогноз_гросс"] ?? (c["прогноз_месяца"] || 0) / 0.87)
      + pribavka - (c["_premiya_uchtena"] || 0);
    c["_premiya_uchtena"] = pribavka;
    // Полный ФОТ идёт следом: взносы 30,2% и резерв отпусков 2% от суммы.
    c["фот_прогноз_месяца"] = Math.round(c["прогноз_гросс"] * 1.302 / 0.98);
  }

  lyudi.forEach((c) => { c["премия_план_ishodno"] = c["премия_план"] || 0; });

  let baza = "Поснова";
  let vidno = [];
  let chto = "";

  const prognozS = (c) => c["прогноз_месяца"] || 0;

  /* Все суммы панели — в гросс, как их подают в 1С: «мы перешли полноценно
     на гросс, нет нам не нужен». Отдельной строкой идёт полный ФОТ — во что
     это обходится компании: гросс плюс взносы в фонды плюс резерв отпусков,
     ровно по методике ШР. Человеку на его странице по-прежнему показываем
     «на руки» — это разные вопросы и разные читатели. */
  function svodka(spisok) {
    const summa = (f) => spisok.reduce((s, c) => s + (Number(f(c)) || 0), 0);
    return {
      lyudey: spisok.length,
      fond: summa((c) => c["оклад"]),
      premii: summa((c) => c["премия_план"]),
      segodnya: summa((c) => c["начислено"]),
      prognoz: summa((c) => c["прогноз_гросс"] ?? (c["прогноз_месяца"] || 0) / 0.87),
      fot: summa((c) => c["фот_прогноз_месяца"]),
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
        <div><small>Оклады по ШР</small><b>${rubli(s.fond)}</b><i>гросс, при полной отработке</i></div>
        <div><small>Премии за месяц</small><b>${rubli(s.premii)}</b><i>${
          spisok.filter((c) => c["премия_план"]).length} из ${s.lyudey} человек</i></div>
        <div><small>Начислено на сегодня</small><b>${rubli(s.segodnya)}</b><i>гросс, ${
          data["прошло_дней"]} из ${data["норма_дней"]} дней</i></div>
        <div><small>Подадим за месяц</small><b>${rubli(s.prognoz)}</b><i>гросс — то, что уйдёт в 1С</i></div>
        <div class="zpLimit__fot"><small>ФОТ со взносами</small><b>${rubli(s.fot)}</b><i>во что обойдётся компании: +30,2% взносы, +2% резерв отпусков</i></div>
        <div><small>Против ШР</small><b class="${pereli ? "zpNad" : "zpPod"}">${
          (pereli ? "+" : "") + rubli(raznica)}</b><i>${pereli
            ? "премии и надбавки сверх окладов" : "недовыходы съели больше, чем добавили премии"}</i></div>
      </div>`;
  }

  /* Свод по любому срезу: сколько заложено окладами и что вышло сверх. */
  /* Всё в гросс: полосы сравнивают заложенные оклады с тем, что подадим.
     Рядом идёт цель из ШР — это уже полный ФОТ со взносами, и его сравнивают
     с нашим полным ФОТ, а не с окладами. Два разных вопроса: «не вылезли ли
     за оклады» и «укладываемся ли в бюджет направления». */
  const celiSHR = data["цели_шр"] || {};

  function svesti(spisok, klyuch) {
    const po = new Map();
    spisok.forEach((c) => {
      const imya = c[klyuch] || "—";
      const o = po.get(imya) || { imya, lyudey: 0, fond: 0, prognoz: 0, fot: 0,
                                  premii: 0, nadbavki: 0, otsutstvie: 0 };
      o.lyudey += 1;
      o.fond += c["оклад"] || 0;
      o.prognoz += c["прогноз_гросс"] ?? (prognozS(c) / 0.87);
      o.fot += c["фот_прогноз_месяца"] || 0;
      o.premii += c["премия_план"] || 0;
      o.nadbavki += c["надбавка"] || 0;
      if (c["отсутствие"]) o.otsutstvie += 1;
      po.set(imya, o);
    });
    return [...po.values()].map((o) => ({
      ...o,
      raznica: o.prognoz - o.fond,
      cel: (celiSHR[o.imya] || {}).фот || 0,
      celChelovek: (celiSHR[o.imya] || {}).человек || 0,
    })).sort((a, b) => b.prognoz - a.prognoz);
  }

  function polosa(o, maks, krupno) {
    const sverh = o.raznica > 0;
    return `
      <div class="zpOtdel__polosa${krupno ? " zpOtdel__polosa--krupno" : ""}">
        <div class="zpOtdel__shr" style="width:${(100 * o.fond / maks).toFixed(1)}%"></div>
        <div class="zpOtdel__fakt ${sverh ? "is-over" : ""}"
             style="width:${(100 * o.prognoz / maks).toFixed(1)}%"></div>
      </div>
      <div class="zpOtdel__cifry">
        <span>${rubli(o.fond)}<i>оклады, гросс</i></span>
        <span>${rubli(o.prognoz)}<i>подадим</i></span>
        <span class="${sverh ? "zpNad" : "zpPod"}"><b>${sverh ? "+" : ""}${rubli(o.raznica)}</b>
          <i>${prichina(o)}</i></span>
        ${o.cel ? `<span class="zpOtdel__cel">${rubli(o.fot)} / ${rubli(o.cel)}
          <i>ФОТ против цели ШР${o.fot > o.cel
            ? ", <b class=\"zpNad\">выше на " + rubli(o.fot - o.cel) + "</b>"
            : ", запас " + rubli(o.cel - o.fot)}</i></span>` : ""}
      </div>`;
  }

  /* Иерархия: сначала направления, внутри — их подразделения. Разворачивать
     всё сразу незачем: сверху нужен масштаб, детали открываются по клику. */
  let raskryto = "";

  function narisovatOtdely(spisok) {
    const napr = svesti(spisok, "направление");
    const vsego = svesti(spisok, "_")[0] || { fond: 0, prognoz: 0, premii: 0,
                                              nadbavki: 0, raznica: 0, lyudey: 0 };
    const maks = Math.max(...napr.map((o) => Math.max(o.fond, o.prognoz)), 1);

    otdely.innerHTML = `
      <div class="cardHeading">
        <h2>Сколько заложено и что выйдет</h2>
        <p class="stamp">Серая полоса — оклады по ШР, зелёная — прогноз месяца;
          красный хвост и есть перерасход. Клик по направлению разворачивает
          его подразделения, клик по подразделению — его людей</p>
      </div>

      <div class="zpOtdel zpOtdel--vsego">
        <div class="zpOtdel__imya"><b>Всего ${baza ? "· " + baza : "по обоим контурам"}</b>
          <span>${vsego.lyudey} чел. · ${napr.length} направлений</span></div>
        ${polosa(vsego, Math.max(vsego.fond, vsego.prognoz), true)}
      </div>

      <div class="zpOtdely__spisok">
        ${napr.map((o) => {
          const vnutri = svesti(spisok.filter((c) => (c["направление"] || "—") === o.imya),
                                "подразделение");
          const otkryt = raskryto === o.imya;
          const maksV = Math.max(...vnutri.map((v) => Math.max(v.fond, v.prognoz)), 1);
          return `
          <div class="zpOtdel zpOtdel--napr${otkryt ? " is-open" : ""}"
               data-napr="${o.imya.replace(/"/g, "&quot;")}">
            <div class="zpOtdel__imya"><b>${vnutri.length > 1
              ? (otkryt ? "▾ " : "▸ ") : ""}${o.imya}</b>
              <span>${o.lyudey} чел.${vnutri.length > 1 ? " · " + vnutri.length + " подразделений" : ""}${
                o.otsutstvie ? " · " + o.otsutstvie + " отсутствуют" : ""}</span></div>
            ${polosa(o, maks)}
          </div>
          ${otkryt ? `<div class="zpVnutri">${vnutri.map((v) => `
            <div class="zpOtdel zpOtdel--podr" data-otdel="${v.imya.replace(/"/g, "&quot;")}">
              <div class="zpOtdel__imya"><b>${v.imya}</b>
                <span>${v.lyudey} чел.${v.otsutstvie ? " · " + v.otsutstvie + " отсутствуют" : ""}</span></div>
              ${polosa(v, maksV)}
            </div>`).join("")}</div>` : ""}`;
        }).join("")}
      </div>`;
  }

  /* Отчего разница: премии и надбавки тянут вверх, недовыходы — вниз.
     Показываем ту причину, которая больше весит. */
  function prichina(o) {
    const chasti = [];
    if (o.premii) chasti.push("премии " + rubli(o.premii));
    if (o.nadbavki) chasti.push("надбавки " + rubli(o.nadbavki));
    const bez = o.raznica - o.premii - o.nadbavki;
    if (Math.abs(bez) > 1000) {
      chasti.push((bez > 0 ? "переработки " : "недовыходы ") + rubli(Math.abs(bez)));
    }
    return chasti.length ? chasti.join(" · ") : "ровно по окладам";
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
        <td></td>
        <td class="num"><b>${rubli(s.segodnya)}</b></td>
        <td class="num">${rubli(s.prognoz)}</td>
        <td colspan="2"></td>
      </tr>`;
    zagolovok.textContent = "Люди · " + spisok.length + (podpis ? " · " + podpis : "");
    sbros.hidden = spisok.length === vBaze(baza).length;
    narisovatLimit(spisok, podpis || (baza || "обоих контуров"));
    narisovatOtdely(vBaze(baza));
  }

  otdely.addEventListener("click", (event) => {
    // Направление разворачиваем, подразделение открываем списком людей.
    const napr = event.target.closest(".zpOtdel--napr");
    if (napr) {
      raskryto = raskryto === napr.dataset.napr ? "" : napr.dataset.napr;
      narisovatOtdely(vBaze(baza));
      return;
    }
    const podr = event.target.closest(".zpOtdel--podr");
    if (!podr) return;
    const imya = podr.dataset.otdel;
    poisk.value = "";
    pokazat(vBaze(baza).filter((c) => (c["подразделение"] || "—") === imya), imya);
    document.querySelector("#ktoZagolovok").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  blockTeam.querySelector("#bazy").addEventListener("click", (event) => {
    const knopka = event.target.closest(".zpBaza");
    if (!knopka) return;
    blockTeam.querySelectorAll(".zpBaza")
      .forEach((b) => b.classList.toggle("is-on", b === knopka));
    baza = knopka.dataset.baza;
    poisk.value = "";
    pokazat(vBaze(baza), "");
  });

  /* Загрузка выгрузки из 1С: отдаём файл на сервер, получаем заполненный
     обратно и показываем сводку сверки. Сводка важнее файла — по ней видно,
     где наш расчёт разошёлся с тем, что стоит в форме. */
  const formaVhod = blockTeam.querySelector("#formaVhod");
  const formaOtvet = blockTeam.querySelector("#formaOtvet");
  if (formaVhod) {
    formaVhod.addEventListener("change", async () => {
      const fayl = formaVhod.files && formaVhod.files[0];
      if (!fayl) return;
      formaOtvet.hidden = false;
      formaOtvet.textContent = "Заполняю…";
      const telo = new FormData();
      telo.append("fayl", fayl);
      try {
        const otvet = await fetch("/__zp/forma", { method: "POST", body: telo });
        if (!otvet.ok) throw new Error(await otvet.text());
        const svodka = JSON.parse(otvet.headers.get("X-Svodka") || "{}");
        const blob = await otvet.blob();
        const ssylka = document.createElement("a");
        ssylka.href = URL.createObjectURL(blob);
        ssylka.download = "Заполнено " + fayl.name;
        ssylka.click();
        URL.revokeObjectURL(ssylka.href);
        const razoshlis = (svodka["разошлись"] || []).length;
        formaOtvet.innerHTML = `Готово: заполнено ${svodka["заполнено"]} строк из ${svodka["строк"]}.`
          + (razoshlis ? ` <b>Разошлось с формой: ${razoshlis}</b> — `
              + (svodka["разошлись"] || []).slice(0, 3)
                  .map((r) => `${r["фио"]} ${rubli(r["в_форме"])} → ${rubli(r["у_нас"])}`).join("; ")
            : " Всё сошлось.")
          + (svodka["прогноз"] ? " Месяц ещё идёт — суммы проставлены прогнозом на полный месяц." : "");
      } catch (oshibka) {
        formaOtvet.textContent = "Не вышло: " + String(oshibka).slice(0, 200);
      }
      formaVhod.value = "";
    });
  }

  // Премия вводится прямо в строке: вбил — итог, прогноз и выгрузка сразу
  // пересчитались, ничего сохранять отдельно не надо.
  telo.addEventListener("input", (event) => {
    const pole = event.target.closest(".zpPrem");
    if (!pole) return;
    const stroka = pole.closest("tr");
    const chelovek = lyudi[Number(stroka.dataset.nomer)];
    if (!chelovek) return;
    postavitPremiyu(chelovek, pole.value.replace(/\s/g, ""));
    // Сохраняем не на каждый набранный символ, а когда человек остановился.
    clearTimeout(pole.pauza);
    pole.pauza = setTimeout(() => {
      pole.classList.remove("is-ok", "is-plohо");
      sohranitPremiyu(chelovek)
        .then((ladno) => pole.classList.add(ladno ? "is-ok" : "is-plohо"))
        .catch(() => pole.classList.add("is-plohо"));
    }, 700);
    stroka.querySelector("[data-seychas]").textContent = rubli(chelovek["на_руки"]);
    stroka.querySelector("[data-prognoz]").textContent = rubli(chelovek["прогноз_месяца"]);
    const s = svodka(vidno);
    podval.querySelector("td:nth-child(5) b").textContent = rubli(s.premii);
    podval.querySelector("td:nth-child(7) b").textContent = rubli(s.segodnya);
    podval.querySelector("td:nth-child(8)").textContent = rubli(s.prognoz);
    narisovatLimit(vidno, chto === baza ? baza : chto);
    narisovatOtdely(vBaze(baza));
  });

  /* Кнопка «Ещё»: раскрывает строку с остальными выплатами. Держим её
     рядом с человеком, а не отдельной формой — так видно, к кому это. */
  telo.addEventListener("click", (event) => {
    const knopka = event.target.closest(".zpMore");
    if (!knopka) return;
    const stroka = knopka.closest("tr");
    const chelovek = lyudi[Number(stroka.dataset.nomer)];
    if (!chelovek) return;
    const otkryta = stroka.nextElementSibling
      && stroka.nextElementSibling.classList.contains("zpMoreRow");
    telo.querySelectorAll(".zpMoreRow").forEach((r) => r.remove());
    if (otkryta) return;
    stroka.insertAdjacentHTML("afterend", eshchyoStroka(chelovek));
  });

  /* Ввод в раскрытой строке: держим значения на человеке и шлём тем же
     запросом, что и ежемесячную премию. */
  telo.addEventListener("input", (event) => {
    const pole = event.target.closest(".zpMoreRow [data-vid]");
    if (!pole) return;
    const stroka = pole.closest(".zpMoreRow").previousElementSibling;
    const chelovek = lyudi[Number(stroka.dataset.nomer)];
    if (!chelovek) return;
    if (pole.dataset.vid === "комментарий") {
      chelovek["премия_комментарий"] = pole.value;
    } else {
      chelovek["выплаты"] = chelovek["выплаты"] || {};
      chelovek["выплаты"][pole.dataset.vid] = Math.max(0, Number(pole.value) || 0);
    }
    clearTimeout(pole.pauza);
    pole.pauza = setTimeout(() => {
      pole.classList.remove("is-ok", "is-plohо");
      sohranitPremiyu(chelovek)
        .then((ladno) => pole.classList.add(ladno ? "is-ok" : "is-plohо"))
        .catch(() => pole.classList.add("is-plohо"));
      stroka.querySelector(".zpMore").textContent = eshchyoZnak(chelovek);
    }, 700);
  });

  blockTeam.querySelector("#vygruzka")
    .addEventListener("click", (event) => vygruzkaPodachi(vidno, chto, event.currentTarget));

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
    blockCheklist.hidden = true;
    views.querySelectorAll(".zpView").forEach((item) => item.classList.remove("is-on"));
    const svoya = views.querySelector('[data-view="me"]');
    if (svoya) svoya.classList.add("is-on");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* Чек-лист доработок зарплаты. Вопросы со встреч по ФОТ терялись в
   расшифровках — теперь они висят над панелью, общие на всех, кто её видит,
   и закрываются галочкой. Закрытые уходят вниз, но не пропадают. */
const blockCheklist = document.getElementById("cheklist");

function cheklist() {
  const zashchita = (tekst) => String(tekst ?? "").replace(/[&<>"]/g,
    (znak) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[znak]));
  let punkty = [];
  let pokazatZakrytye = false;

  const otpravit = async (telo) => {
    const otvet = await fetch("/__zp/cheklist", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(telo),
    });
    if (!otvet.ok) throw new Error((await otvet.json().catch(() => ({}))).error || "не сохранилось");
    punkty = await otvet.json();
    narisovat();
  };

  const punktHtml = (p) => `
    <li class="zpCheklist__punkt${p["сделано"] ? " is-done" : ""}">
      <label>
        <input type="checkbox" data-otmetit="${p.id}"${p["сделано"] ? " checked" : ""}>
        <span>${zashchita(p["текст"])}</span>
      </label>
      <small>${zashchita([p["откуда"], p["сделано"] ? `закрыл ${p["закрыл"]} ${p["закрыто"]}` : ""]
        .filter(Boolean).join(" · "))}</small>
      <button class="zpCheklist__ubrat" type="button" data-ubrat="${p.id}" title="Убрать пункт">×</button>
    </li>`;

  const narisovat = () => {
    const otkrytye = punkty.filter((p) => !p["сделано"]);
    const zakrytye = punkty.filter((p) => p["сделано"]);
    blockCheklist.innerHTML = `
      <div class="zpCheklist__shapka">
        <h2>Что закрыть по зарплате</h2>
        <span class="zpCheklist__schet">открыто ${otkrytye.length} из ${punkty.length}</span>
      </div>
      <ul class="zpCheklist__spisok">${otkrytye.map(punktHtml).join("")
        || '<li class="zpCheklist__pusto">Всё закрыто.</li>'}</ul>
      ${zakrytye.length ? `
        <button class="zpView" type="button" data-zakrytye>${pokazatZakrytye ? "Скрыть" : "Показать"} закрытые (${zakrytye.length})</button>
        ${pokazatZakrytye ? `<ul class="zpCheklist__spisok">${zakrytye.map(punktHtml).join("")}</ul>` : ""}` : ""}
      <form class="zpCheklist__novyy">
        <input name="tekst" type="text" maxlength="500" placeholder="Новый пункт" autocomplete="off">
        <button class="zpView zpView--glavnaya" type="submit">Добавить</button>
      </form>`;
  };

  blockCheklist.addEventListener("change", (event) => {
    const galka = event.target.closest("[data-otmetit]");
    if (!galka) return;
    otpravit({ "действие": "otmetit", id: Number(galka.dataset.otmetit) })
      .catch((error) => { galka.checked = !galka.checked; alert(error.message); });
  });
  blockCheklist.addEventListener("click", (event) => {
    if (event.target.closest("[data-zakrytye]")) {
      pokazatZakrytye = !pokazatZakrytye;
      narisovat();
      return;
    }
    const ubrat = event.target.closest("[data-ubrat]");
    if (!ubrat || !confirm("Убрать пункт из чек-листа?")) return;
    otpravit({ "действие": "ubrat", id: Number(ubrat.dataset.ubrat) })
      .catch((error) => alert(error.message));
  });
  blockCheklist.addEventListener("submit", (event) => {
    event.preventDefault();
    const tekst = event.target.elements.tekst.value.trim();
    if (!tekst) return;
    otpravit({ "действие": "dobavit", "текст": tekst })
      .catch((error) => alert(error.message));
  });

  return fetch("/__zp/cheklist", { credentials: "same-origin", cache: "no-store" })
    .then((otvet) => (otvet.ok ? otvet.json() : Promise.reject()))
    .then((dannye) => { punkty = dannye; narisovat(); return true; })
    .catch(() => false);
}

// 28.09 Степан: «зарплата внутри кабинета в том же виде, как была, а в ФОТе — ФОТ и
// панель подачи». Одна страница, два адреса: /zp/ — своя зарплата (вкладка кабинета),
// /zp/fot — ФОТ и панель подачи (управленческий контур, право salary_team).
const REZHIM_FOT = /^\/zp\/fot\/?$/.test(location.pathname);

async function start() {
  if (REZHIM_FOT) {
    const nad = document.querySelector(".hero .eyebrow");
    if (nad) nad.textContent = "Управленческий";
    document.title = "Уценка · ФОТ";
    const svoya = views.querySelector('[data-view="me"]');
    if (svoya) svoya.hidden = true;
    const panel = views.querySelector('[data-view="team"]');
    if (panel) panel.textContent = "Панель подачи";    // 05.10 Степан: «зарплата в админке мне неинтересна, всё что мне надо — в блоке ФОТ»:
    // проверка расчёта (сошлись ли оклады, кого нет, пересчитать) — отсюда, только админу.
    fetch("/__me", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).then((me) => {
      if (!me || me.role !== "admin" || me["примерка"]) return;
      const a = document.createElement("a");
      a.className = "zpView zpView--link";
      a.href = "/__admin/zarplata";
      a.textContent = "Проверка расчёта →";
      views.appendChild(a);
    }).catch(() => {});
  }
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

  if (REZHIM_FOT) {
    message.textContent = "Загружаю ФОТ…";
    message.className = "message";
  } else if (!moya["я"]) {
    message.textContent = moya["почему_пусто"] || "По вам расчёта пока нет.";
    message.className = moya["скрыто"] ? "message" : "message warn";
    // 06.10: показ зарплаты выключен — страница остаётся кабинетом: выработка, профиль, пароль
    if (moya["скрыто"]) {
      const h1 = document.querySelector(".hero h1");
      const lead = document.querySelector(".hero .lead");
      if (h1) h1.textContent = "Личный кабинет";
      if (lead) lead.hidden = true;
      document.title = "Уценка · Личный кабинет";
    }
    // 06.10: денег нет, а выработка есть — кабинет всё равно показывает личную производительность
    const rab = moya["выработка"];
    if (rab && (rab["по_неделям"] || []).length) {
      blockMe.classList.remove("zpMe--concealed");
      blockMe.innerHTML = grafikVyrabotki(rab);
      blockMe.hidden = false;
      podklyuchitGrafiki(blockMe);
    }
  } else {
    message.textContent = "";
    message.className = "message";
    karta(moya);
  }

  // В кабинете — только своя зарплата: ФОТ и панель подачи живут на /zp/fot.
  if (!REZHIM_FOT) return;

  // Свою строку видят не все: часть отделов ещё не подключена к расчёту, и
  // у самого руководства ФБ её нет. Показывать им пустой экран нельзя —
  // если доступ к списку есть, сразу открываем его.
  const svoeyNet = !moya["я"];

  // Вкладка «по отделу» появляется, только если ручка её отдаёт: право на
  // чужие деньги проверяется на сервере, а не прячется в интерфейсе.
  try {
    const all = await fetch("/__zp/all", { credentials: "same-origin" });
    if (!all.ok) {
      message.textContent = "ФОТ и панель подачи — только тем, кто подаёт зарплату.";
      message.className = "message warn";
      return;
    }
    const data = await all.json();
    if (!data["люди"] || !data["люди"].length) return;
    tablica(data);
    views.hidden = false;
    // Чек-лист — те же права, что у панели; не ответил — панель и без него.
    const estCheklist = await cheklist();

    // Сводка ФОТ — те же права, что у панели: ручка сама решает, что отдать.
    // Не ответила — вкладки просто не будет, панель от этого не зависит.
    let estSvodka = false;
    try {
      const fot = await fetch("/__fot", { credentials: "same-origin", cache: "no-store" });
      if (fot.ok && window.ZpSvodka) {
        window.ZpSvodka.podklyuchit(blockSvodka, await fot.json());
        views.querySelector('[data-view="svodka"]').hidden = false;
        estSvodka = true;
      }
    } catch (error) {
      // без сводки — только панель
    }

    const otkryt = (vid) => {
      document.body.classList.toggle("zp-summary-active", vid === "svodka");
      const zagolovok = document.querySelector(".hero h1");
      const opisanie = document.querySelector(".hero .lead");
      if (zagolovok) zagolovok.textContent = vid === "svodka" ? "Фонд оплаты труда" : vid === "team" && REZHIM_FOT ? "Панель подачи" : "Моя зарплата";
      if (opisanie) opisanie.textContent = vid === "svodka"
        ? "Прогноз расходов, лимит и отклонения по направлениям."
        : "Сколько заработано на сегодня и когда это придёт. Считается каждый день по вашему окладу и фактическим выходам — не нужно ждать конца месяца, чтобы понять, что получится.";
      views.querySelectorAll(".zpView")
        .forEach((item) => item.classList.toggle("is-on", item.dataset.view === vid));
      blockTeam.hidden = vid !== "team";
      blockCheklist.hidden = vid !== "team" || !estCheklist;
      blockSvodka.hidden = vid !== "svodka";
      blockMe.hidden = vid !== "me";
      // Своей записи нет — «Моя» показывает, почему пусто.
      if (vid === "me" && !blockMe.innerHTML) {
        blockMe.hidden = true;
        message.textContent = moya["почему_пусто"] || "По вам расчёта пока нет.";
      } else if (svoeyNet || REZHIM_FOT) {
        message.textContent = "";
        message.className = "message";
      }
      if (vid !== "me" || location.hash) history.replaceState(null, "", vid === "me" ? location.pathname : "#" + vid);
    };
    views.addEventListener("click", (event) => {
      const button = event.target.closest(".zpView[data-view]");
      if (button) otkryt(button.dataset.view);
    });

    // Ссылку на сводку можно переслать: /zp/#svodka открывает её сразу.
    // Без своей записи открываем сводку — это первый экран руководителя.
    const zhelaemyy = location.hash.slice(1);
    if (zhelaemyy === "team" || (zhelaemyy === "svodka" && estSvodka)) {
      otkryt(zhelaemyy);
    } else if (svoeyNet || REZHIM_FOT) {
      otkryt(estSvodka ? "svodka" : "team");
    }
  } catch (error) {
    // Нет права — вкладки просто не будет, это не ошибка страницы.
  }
}

start();
