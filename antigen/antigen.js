/* Новая антигенерация: один период на все контуры, карта «где случилось
   больше» и провал по разрезам.

   Страница статическая: с сервера приезжает таблица фактов со словарями
   (data/antigen/*.json), а все срезы, отклонения и выгрузка считаются здесь.
   Поэтому проваливаться можно в любую точку по любому измерению, а не только
   по заранее посчитанным разрезам, как было на старом дашборде.

   Период и шаг оси выбираются отдельно: период задаёт окно (всё время,
   полугодие, квартал, месяц), шаг — из чего оно собрано (недели, месяцы,
   кварталы). Сравнение с прошлым периодом считается само. */

(() => {
  'use strict';

  const DATA_DIR = '../data/antigen/';
  const SUPERSET = 'http://superset-dev.vseinstrumenti.ru';

  const CONTOURS = [
    {
      key: 'zabr', name: 'Официальный брак', note: 'акты приёмки — что признали браком', chart: 2656,
      measures: [
        // Розничную цену убрали со стратсовета 09.09.2026: коммитимся в
        // количестве актов и доле от стока, розница ни во что не считается и
        // только путала — оценка в себестоимости, а брак был в рознице.
        { key: 'sebes', label: '₽ себестоимость', kind: 'money' },
        { key: 'strok', label: 'строк', kind: 'int' },
        // Доли считаются по месяцам из control: числитель тот же — акты
        // приёмки, знаменатель берётся из масштаба компании. Своих строк у
        // них нет, поэтому карта и разбор остаются на основной мере.
        { key: 'pct_vyr', label: '% от выручки', kind: 'pct', control: true },
        { key: 'pct_sht', label: '% от штук', kind: 'pct', control: true },
        { key: 'pct_ost', label: '% от остатка', kind: 'pct', control: true },
        { key: 'cena', label: '₽/шт компании', kind: 'money', control: true },
      ],
      dims: [
        { key: 'vid', label: 'место обнаружения' },
        { key: 'poluchatel', label: 'точка' },
        { key: 'defekt', label: 'тип дефекта' },
        { key: 'gruppa', label: 'группа товара' },
        { key: 'tovar', label: 'номенклатура' },
        { key: 'napr', label: 'направление' },
        { key: 'mu', label: 'модель учёта' },
        { key: 'region', label: 'регион' },
      ],
    },
    {
      key: 'dmd', name: 'Движение брака ДМД', note: 'вход в брак-ячейки — товар и бренд', chart: 2669,
      measures: [
        { key: 'rub', label: '₽ закупка', kind: 'money' },
        { key: 'sht', label: 'штук', kind: 'int' },
      ],
      dims: [
        { key: 'tovar', label: 'номенклатура' },
        { key: 'brand', label: 'бренд' },
        { key: 'cat', label: 'категория' },
        { key: 'cell', label: 'ячейка' },
        { key: 'zona', label: 'зона' },
        { key: 'tip', label: 'тип потока' },
        { key: 'mu', label: 'модель учёта' },
      ],
    },
    {
      key: 'gen', name: 'Брак на операциях', note: 'универсальные задания', chart: 2654,
      measures: [
        { key: 'zad', label: 'заданий', kind: 'int' },
        { key: 'sht', label: 'штук', kind: 'int' },
        { key: 'rub', label: '₽ искомого', kind: 'money' },
      ],
      dims: [
        { key: 'tip', label: 'тип задания' },
        { key: 'ploshadka', label: 'площадка' },
        { key: 'zona', label: 'зона' },
        { key: 'reshenie', label: 'чем кончилось' },
        { key: 'ispolnitel', label: 'исполнитель' },
      ],
    },
    {
      key: 'akty', name: 'Ответственность', note: 'акты расхождений с причиной «брак»', chart: 2671,
      measures: [
        { key: 'seb', label: '₽ себестоимость', kind: 'money' },
        { key: 'akt', label: 'актов', kind: 'int' },
        { key: 'sht', label: 'штук', kind: 'int' },
      ],
      dims: [
        { key: 'vinovnik', label: 'виновник' },
        { key: 'chelovek', label: 'виновник, человек' },
        { key: 'zavel', label: 'кто завёл акт' },
        { key: 'ist', label: 'зона-источник' },
        { key: 'pol', label: 'зона-получатель' },
        { key: 'svyaz', label: 'связь с забраковкой' },
      ],
    },
    {
      // Пятый контур устроен иначе остальных: месяцы вместо недель, таблица
      // вместо графика. Общая механика к нему не применяется — см. render().
      key: 'client', name: 'Клиентский брак', note: 'что вернули покупатели — против продаж',
      table: true, measures: [], dims: [],
    },
  ];

  const PERIODS = [
    { key: 'all', label: 'всё время', months: 0 },
    { key: 'half', label: 'полугодие', months: 6, compare: 'полугодие к полугодию' },
    { key: 'quarter', label: 'квартал', months: 3, compare: 'квартал к кварталу' },
    { key: 'month', label: 'месяц', months: 1, compare: 'месяц к месяцу' },
  ];
  const STEPS = [
    { key: 'week', label: 'недели' },
    { key: 'month', label: 'месяцы' },
    { key: 'quarter', label: 'кварталы' },
  ];

  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
    'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const ROMAN = ['I', 'II', 'III', 'IV'];
  const PIE_COLORS = ['#4d8df7', '#27c46b', '#f5ad32', '#f05d72', '#a985ff', '#2fc2c9',
    '#e4794a', '#8fa0b8', '#c9d24a', '#6f7fd8'];
  const HEAT_ROWS = 12;

  const state = {
    contour: 'zabr',
    measure: 'sebes',
    period: 'quarter',
    step: 'week',
    point: null,       // ключ выбранной точки на оси
    filters: [],
    // Что выкинуто из общего числа: «если мы решим вот это — как будет
    // выглядеть остальное». Исключение сильнее фильтра и действует на всё
    // сразу: динамику, карту и разбор.
    exclude: [],
    search: '',        // слово из названия товара, артикула или бренда
    drillDim: null,
    heatDim: null,
    share: null,       // какая доля раскрыта в разбор
    // Клиентский брак живёт своей жизнью: окно месяцами, свой разрез и свои
    // фильтры. Держим отдельно, чтобы возврат к обычным контурам ничего здесь
    // не сбрасывал.
    client: {
      window: 12,      // месяцев назад
      kind: 'all',     // all | vozvrat | remont
      dim: 'kat2',
      sort: 'brak',
      desc: true,
      minSales: 50,
      search: '',
      path: [],        // провал: [{dim, value}]
    },
  };

  const cache = new Map();
  let index = null;
  // Мероприятия по сокращению брака: их вписывают руками в админке, а здесь
  // они становятся засечками на оси времени.
  let events = [];
  const el = (id) => document.getElementById(id);

  // ------------------------------------------------------------- формат

  const fmtInt = (value) => Math.round(value).toLocaleString('ru-RU');

  function fmtMoney(value) {
    const abs = Math.abs(value);
    if (abs >= 1e9) return (value / 1e9).toFixed(2).replace('.', ',') + ' млрд';
    if (abs >= 1e6) return (value / 1e6).toFixed(abs >= 1e7 ? 1 : 2).replace('.', ',') + ' млн';
    if (abs >= 1e3) return Math.round(value / 1e3).toLocaleString('ru-RU') + ' тыс';
    return fmtInt(value);
  }

  const measureOf = (contour) => contour.measures.find((m) => m.key === state.measure) || contour.measures[0];
  // Доли форматируются как проценты: без этого 0,53 % показывалось как «1».
  const fmt = (value, kind) => (kind === 'money' ? fmtMoney(value)
    : kind === 'pct' ? pctPlain(value) : fmtInt(value));
  const fmtSigned = (value, kind) =>
    (value > 0 ? '+' : value < 0 ? '−' : '') + fmt(Math.abs(value), kind);
  const pctPlain = (value) => Math.abs(value).toFixed(2).replace('.', ',') + '%';
  const pct = (value) => (value > 0 ? '+' : '−') + Math.abs(value).toFixed(1).replace('.', ',') + '%';
  function plural(count, one, few, many) {
    const n = Math.abs(count) % 100;
    if (n > 10 && n < 20) return many;
    const last = n % 10;
    return last === 1 ? one : last >= 2 && last <= 4 ? few : many;
  }
  const escape = (text) => String(text).replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const ROADMAP_STATUS = {done:'Сделано',active:'В работе',blocked:'Блокер',decision:'Требует решения',study:'Требует проработки',next:'Дальше',postponed:'Отложено',removed:'Снято'};
  let roadmapPayload = null;
  let roadmapFilter = '';

  function roadmapTable() {
    const box = el('agRoadmap');
    const payload = roadmapPayload || { periods: [], blocks: [], items: [] };
    const periods = payload.periods || [];
    const items = (payload.items || []).filter((item) => !roadmapFilter || item.status === roadmapFilter);
    const periodMap = new Map(periods.map((period) => [period.key, period]));
    const head = `<div class="agRoadHead" style="--road-periods:${periods.length}"><div class="agRoadIdentity">Задача · владелец · статус · срок</div>${periods.map((period) => `<div class="agRoadPeriod"><b>${escape(period.group)}</b><span>${escape(period.label)}</span></div>`).join('')}</div>`;
    const blocks = (payload.blocks || []).map((block) => {
      const rows = items.filter((item) => item.block === block.key);
      if (!rows.length) return '';
      return `<section class="agRoadBlock"><div class="agRoadBlockTitle">${escape(block.key)} · ${escape(block.name)} · ${rows.length}</div>${rows.map((item) => {
        const marks = new Map((item.timeline || []).map((mark) => [mark.period, mark.text]));
        const cells = periods.map((period) => `<div class="agRoadCell">${marks.has(period.key) ? `<div class="agRoadMark" title="${escape(marks.get(period.key))}">${escape(marks.get(period.key))}</div>` : ''}</div>`).join('');
        const detail = (item.fact || item.next) ? `<div class="agRoadDetail"><b>Сделано:</b> ${escape(item.fact || '—')} &nbsp;·&nbsp; <b>Дальше:</b> ${escape(item.next || '—')}</div>` : '';
        return `<div class="agRoadRow" data-status="${escape(item.status)}" style="--road-periods:${periods.length}"><div class="agRoadInfo"><span class="agRoadNo">${escape(item.number)}</span><div class="agRoadTask"><strong>${escape(item.title)}</strong><small>${escape(item.owner || 'Владелец не указан')}</small></div><div class="agRoadMeta"><span class="agRoadStatus ${escape(item.status)}">${escape(item.status_label || ROADMAP_STATUS[item.status] || item.status)}</span>${escape(item.due || 'без срока')}</div></div>${cells}</div>${detail}`;
      }).join('')}</section>`;
    }).join('');
    box.style.setProperty('--road-periods', periods.length);
    box.innerHTML = items.length ? head + blocks : '<div class="agEmpty">По выбранному статусу задач нет.</div>';
  }

  async function renderRoadmap() {
    const box = el('agRoadmap');
    const summary = el('agRoadmapSummary');
    if (!box || !summary) return;
    try {
      const payload = await fetch(`${DATA_DIR}roadmap.json`, { cache: 'no-cache' }).then((response) => {
        if (!response.ok) throw new Error('roadmap unavailable');
        return response.json();
      });
      roadmapPayload = payload;
      const items = payload.items || [];
      const counts = {};
      items.forEach((item) => { counts[item.status] = (counts[item.status] || 0) + 1; });
      summary.innerHTML = items.length ? `<button class="is-on" data-road-status="">Все <b>${items.length}</b></button>` + Object.entries(ROADMAP_STATUS).filter(([key]) => counts[key]).map(([key, label]) => `<button data-road-status="${key}">${escape(label)} <b>${counts[key]}</b></button>`).join('') : '';
      summary.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
        roadmapFilter = button.dataset.roadStatus || '';
        summary.querySelectorAll('button').forEach((other) => other.classList.toggle('is-on', other === button));
        roadmapTable();
      }));
      if (!items.length) {
        box.innerHTML = '<div class="agEmpty">Мероприятий пока нет. Добавьте первое через кнопку справа.</div>';
        return;
      }
      roadmapTable();
    } catch (error) {
      box.innerHTML = '<div class="agEmpty">Дорожная карта временно не загрузилась.</div>';
    }
  }

  function setupRoadmapToggle() {
    const section = el('roadmap');
    const link = el('roadmap-link');
    const close = el('roadmap-close');
    if (!section || !link) return;
    const setOpen = (open, scroll = true) => {
      section.hidden = !open;
      link.setAttribute('aria-expanded', String(open));
      link.toggleAttribute('aria-current', open);
      if (open) {
        history.replaceState(null, '', `${location.pathname}${location.search}#roadmap`);
        if (scroll) requestAnimationFrame(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      } else if (location.hash === '#roadmap') {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
      }
    };
    link.addEventListener('click', (event) => { event.preventDefault(); setOpen(section.hidden); });
    close?.addEventListener('click', () => setOpen(false, false));
    if (location.hash === '#roadmap') setOpen(true, false);
  }

  function weekTitle(week) {
    const start = new Date(week + 'T00:00:00');
    const end = new Date(start.getTime() + 6 * 86400000);
    const one = (date) => `${String(date.getDate()).padStart(2, '0')} ${MONTHS_SHORT[date.getMonth()]}`;
    return `${one(start)} — ${one(end)}`;
  }


  // -------------------------------------------------------------- данные

  async function loadContour(key) {
    if (cache.has(key)) return cache.get(key);
    const meta = index.contours[key];
    const payload = await fetch(DATA_DIR + meta.file, { cache: 'no-cache' }).then((r) => r.json());

    const dimAt = {};
    payload.dims.forEach((name, i) => { dimAt[name] = i; });
    const measureAt = {};
    payload.measures.forEach((name, i) => { measureAt[name] = payload.dims.length + i; });

    const byWeek = new Map();
    payload.rows.forEach((row) => {
      const week = payload.labels.week[row[dimAt.week]];
      let bucket = byWeek.get(week);
      if (!bucket) { bucket = []; byWeek.set(week, bucket); }
      bucket.push(row);
    });

    // Календарные месяцы контура. Там, где их в данных нет (старые контуры
    // выгружаются только по неделям), берём месяц понедельника — как было.
    const months = dimAt.month !== undefined
      ? [...new Set(payload.labels.month)].sort()
      : [...new Set(payload.weeks.map((week) => week.slice(0, 7)))].sort();
    const monthOfRow = dimAt.month !== undefined
      ? (row) => payload.labels.month[row[dimAt.month]]
      : (row) => payload.labels.week[row[dimAt.week]].slice(0, 7);

    // Карточка товара: артикул, бренд, группа, модель учёта. В таблице ищем по
    // названию, поэтому позицию в справочнике запоминаем сразу.
    const tovarAt = new Map();
    if (payload.tovarInfo) payload.labels.tovar.forEach((name, i) => tovarAt.set(name, i));

    const prepared = { ...payload, dimAt, measureAt, byWeek, tovarAt, months, monthOfRow };
    cache.set(key, prepared);
    return prepared;
  }

  const contourDef = () => CONTOURS.find((c) => c.key === state.contour);

  const periodDef = () => PERIODS.find((p) => p.key === state.period);

  /** Месяцы периода: окно календарных месяцев от конца истории контура. */
  function periodMonths(data, shift = 0) {
    const period = periodDef();
    if (!period.months) return shift ? [] : data.months;
    const end = data.months.length - period.months * shift;
    return data.months.slice(Math.max(end - period.months, 0), Math.max(end, 0));
  }

  /** Идёт ли ещё календарный месяц: последний месяц истории обычно не дожит. */
  function monthRunning(key) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return key >= currentMonth;
  }

  /** Точки оси: строки раскладываются по шагу внутри месяцев периода.
   *
   * Раньше месяц собирался из недель, чей понедельник в него попал, и «август»
   * получался длиной в тридцать пять дней — цифры не сходились с исходником.
   * Теперь месяц берётся из самой строки, а неделя на стыке месяцев лежит в
   * данных двумя строками, поэтому обе оси считаются точно.
   */
  function pointsOf(data, months) {
    const inside = new Set(months);
    const weekAt = data.dimAt.week;
    const groups = new Map();
    data.rows.forEach((row) => {
      const month = data.monthOfRow(row);
      if (!inside.has(month)) return;
      const key = state.step === 'week' ? data.labels.week[row[weekAt]]
        : state.step === 'month' ? month
          : `${month.slice(0, 4)}-Q${Math.floor((Number(month.slice(5)) - 1) / 3) + 1}`;
      let bucket = groups.get(key);
      if (!bucket) { bucket = { rows: [], months: new Set() }; groups.set(key, bucket); }
      bucket.rows.push(row);
      bucket.months.add(month);
    });

    const keys = [...groups.keys()].sort();
    return keys.map((key) => {
      const bucket = groups.get(key);
      if (state.step === 'week') {
        // Неделя на стыке месяцев показана не целиком, если вторая её половина
        // осталась за границей периода.
        const full = data.byWeek.get(key) || [];
        return {
          key,
          label: weekTitle(key).split(' — ')[0],
          title: weekTitle(key),
          rows: bucket.rows,
          partial: bucket.rows.length < full.length,
        };
      }
      const isMonth = state.step === 'month';
      return {
        key,
        label: isMonth
          ? `${MONTHS_SHORT[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`
          : `${ROMAN[Number(key.slice(6)) - 1]} кв ${key.slice(2, 4)}`,
        title: isMonth
          ? `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`
          : `${ROMAN[Number(key.slice(6)) - 1]} квартал ${key.slice(0, 4)}`,
        rows: bucket.rows,
        // Какие месяцы попали в точку — по ним засечки мероприятий находят
        // свой столбец на оси.
        months: [...bucket.months],
        // Текущий месяц или квартал ещё не дожит: без пометки он выглядит
        // обвалом, хотя это просто неполный период.
        partial: [...bucket.months].some(monthRunning),
      };
    });
  }

  /* Единственное место, где решается, попадает строка в счёт или нет.
   *
   * Через него проходят и динамика, и карта, и разбор — поэтому поиск по
   * товару и режим исключения достаточно добавить сюда, и подстроится сразу
   * весь экран, а не одна таблица.
   */
  function matches(data, row) {
    if (state.exclude.length && state.exclude.some(({ dim, label }) =>
      data.labels[dim] && data.labels[dim][row[data.dimAt[dim]]] === label)) return false;
    if (searchSet && data.dimAt.tovar !== undefined
      && !searchSet.has(row[data.dimAt.tovar])) return false;
    return state.filters.every(({ dim, label }) =>
      data.labels[dim] && data.labels[dim][row[data.dimAt[dim]]] === label);
  }

  /* Поиск по товару.
   *
   * Строк в контуре сотни тысяч, а названий товара — десятки, поэтому ищем
   * один раз по справочнику названий и запоминаем номера подошедших. Дальше
   * проверка каждой строки — это заглядывание в множество.
   */
  let searchSet = null;
  let searchKey = '';

  function buildSearchSet(data) {
    const words = state.search.trim().toLocaleLowerCase('ru-RU').split(/\s+/).filter(Boolean);
    const key = `${state.contour}|${words.join(' ')}`;
    if (key === searchKey) return;
    searchKey = key;
    if (!words.length || data.dimAt.tovar === undefined) { searchSet = null; return; }

    const names = data.labels.tovar || [];
    searchSet = new Set();
    names.forEach((name, at) => {
      let hay = name.toLocaleLowerCase('ru-RU');
      // Артикул и бренд человек тоже вводит как «ключевое слово».
      const card = data.tovarInfo && data.tovarAt ? data.tovarInfo[data.tovarAt.get(name)] : null;
      if (card) {
        const brand = data.tovarBooks && data.tovarBooks.brand ? data.tovarBooks.brand[card[1]] : '';
        hay += ` ${String(card[0] || '')} ${String(brand || '').toLocaleLowerCase('ru-RU')}`;
      }
      if (words.every((word) => hay.includes(word))) searchSet.add(at);
    });
  }

  function total(data, rows, measure) {
    const at = data.measureAt[measure];
    let sum = 0;
    rows.forEach((row) => { if (matches(data, row)) sum += row[at]; });
    return sum;
  }

  function breakdown(data, rows, dim, measure) {
    const at = data.measureAt[measure];
    const dimIdx = data.dimAt[dim];
    const names = data.labels[dim];
    const totals = new Map();
    rows.forEach((row) => {
      if (!matches(data, row)) return;
      const name = names[row[dimIdx]];
      totals.set(name, (totals.get(name) || 0) + row[at]);
    });
    return totals;
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  // ------------------------------------------------------------ управление

  function segment(box, items, current, onPick) {
    box.innerHTML = '';
    items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.setAttribute('aria-pressed', String(item.key === current));
      button.addEventListener('click', () => onPick(item.key));
      box.appendChild(button);
    });
  }

  /* Переключатель контуров.
   *
   * Кнопки собираются один раз, дальше меняется только положение линзы. Если
   * перерисовывать блок целиком на каждый render, линза каждый раз рождается
   * уже на новом месте — переход не успевает случиться, и вместо переезда
   * получается скачок.
   */
  function renderContours() {
    const box = el('agContours');
    const at = Math.max(0, CONTOURS.findIndex((c) => c.key === state.contour));

    if (!box.dataset.ready) {
      box.style.setProperty('--n', CONTOURS.length);
      const lens = document.createElement('span');
      lens.className = 'agContours__lens';
      lens.setAttribute('aria-hidden', 'true');
      box.appendChild(lens);
      CONTOURS.forEach((contour) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'agContour';
        button.dataset.key = contour.key;
        button.innerHTML = `<span class="agContour__name">${contour.name}</span>`
          + `<span class="agContour__note">${contour.note}</span>`
          // Номер чарта есть не у всех: клиентский брак считается запросом в
          // DWH, и в Superset его нет.
          + (contour.chart ? `<span class="agContour__id">#${contour.chart}</span>` : '');
        button.addEventListener('click', () => switchContour(contour.key, []));
        box.appendChild(button);
      });
      box.dataset.ready = '1';
    }

    box.querySelectorAll('.agContour').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.key === state.contour));
    });
    moveLens(box, at);
  }

  /** Линза встаёт ровно на выбранную кнопку — где бы та ни оказалась. */
  function moveLens(box, at) {
    const lens = box.querySelector('.agContours__lens');
    const button = box.querySelectorAll('.agContour')[at];
    if (!lens || !button) return;
    // Прямые свойства, а не переменные: инлайн-стиль бьёт любой каскад, и
    // линза не зависит от того, какой файл стилей браузер достал из кэша.
    lens.style.left = `${button.offsetLeft}px`;
    lens.style.top = `${button.offsetTop}px`;
    lens.style.width = `${button.offsetWidth}px`;
    lens.style.height = `${button.offsetHeight}px`;
    lens.classList.add('agContours__lens--ready');
  }

  /* Появление блоков после смены контура.
   *
   * Класс снимается и ставится заново через кадр — иначе браузер не считает
   * анимацию новой и не проигрывает её второй раз подряд.
   */
  let pendingEnter = false;

  function playEnter() {
    const boxes = [el('agGoals'), el('agSearch'), ...document.querySelectorAll('.agPanel')]
      .filter((box) => box && !box.hidden);
    boxes.forEach((box) => {
      box.classList.remove('is-entering');
      // Заставляем браузер пересчитать стиль прямо сейчас: без этого он не
      // считает анимацию новой и подряд второй раз её не проигрывает.
      void box.offsetWidth;
      box.classList.add('is-entering');
    });
  }

  function switchContour(key, filters) {
    if (key !== state.contour) pendingEnter = true;
    const contour = CONTOURS.find((c) => c.key === key);
    state.contour = key;
    // У клиентского брака ни мер, ни разрезов общей механики нет — он живёт
    // своим состоянием и рисуется отдельной панелью.
    if (contour.table) { render(); return; }
    state.measure = contour.measures[0].key;
    state.filters = filters || [];
    // Исключения и поиск заданы разрезами прежнего контура — в новом их нет.
    state.exclude = [];
    state.search = '';
    const field = el('agSearchInput');
    if (field) field.value = '';
    state.drillDim = contour.dims.find((d) => !state.filters.some((f) => f.dim === d.key)).key;
    state.heatDim = contour.dims[0].key;
    render();
  }


  // --------------------------------------------------------------- график

  function renderChart(data, contour, points, values) {
    const box = el('agChart');
    const measure = measureOf(contour);
    if (!points.length) { box.innerHTML = '<p class="agEmpty">В периоде нет данных.</p>'; return; }

    // Рисуем в реальных пикселях контейнера: если viewBox шире, чем блок на
    // экране, браузер ужимает всю картинку вместе со шрифтами — именно от этого
    // график выглядел то огромным, то раздавленным.
    const W = Math.max(560, Math.round(box.clientWidth || 1100));
    const H = Math.round(Math.min(420, Math.max(280, W * 0.24)));
    const pad = { top: 30, right: 22, bottom: 32, left: 78 };
    const raw = Math.max(...values, 1);
    const rough = raw / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * magnitude).find((k) => k >= rough) || magnitude * 10;
    const peak = Math.ceil(raw / step) * step;
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;
    const n = points.length;
    const x = (i) => pad.left + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const y = (v) => pad.top + innerH - (v / peak) * innerH;

    // Тренд считаем только по полным точкам: недобранный крайний месяц или
    // квартал иначе утаскивает линию.
    const solid = values.map((v, i) => [i, v]).filter(([i]) => !points[i].partial);
    const k = solid.length || 1;
    const sumX = solid.reduce((acc, [i]) => acc + i, 0);
    const sumY = solid.reduce((acc, [, v]) => acc + v, 0);
    const sumXY = solid.reduce((acc, [i, v]) => acc + i * v, 0);
    const sumXX = solid.reduce((acc, [i]) => acc + i * i, 0);
    const slope = k > 1 ? (k * sumXY - sumX * sumY) / (k * sumXX - sumX * sumX) : 0;
    const intercept = (sumY - slope * sumX) / k;

    const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)},${(pad.top + innerH).toFixed(1)} `
      + `L${x(0).toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;
    const trend = k > 1
      ? `<path class="agTrend" d="M${x(0).toFixed(1)},${y(Math.max(0, intercept)).toFixed(1)} `
        + `L${x(n - 1).toFixed(1)},${y(Math.max(0, intercept + slope * (n - 1))).toFixed(1)}"></path>`
      : '';

    const levels = [];
    for (let value = 0; value <= peak + 1; value += step) levels.push(value);
    const ticks = levels.map((value) =>
      `<line class="agGrid" x1="${pad.left}" y1="${y(value)}" x2="${W - pad.right}" y2="${y(value)}"></line>`
      + `<text class="agAxis" x="${pad.left - 8}" y="${y(value) + 3.5}" text-anchor="end">${fmt(value, measure.kind)}</text>`).join('');

    const every = n <= 20 ? 1 : n <= 34 ? 2 : 3;
    const labels = values.map((v, i) => {
      if (i % every !== 0 && points[i].key !== state.point) return '';
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      return `<text class="agPointLabel${points[i].partial ? ' agPointLabel--partial' : ''}"`
        + ` x="${x(i)}" y="${y(v) - 10}" text-anchor="${anchor}">${fmt(v, measure.kind)}`
        + `${points[i].partial ? '*' : ''}</text>`;
    }).join('');

    const axis = points.map((point, i) => (i % every === 0
      ? `<text class="agAxis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${point.label}</text>` : '')).join('');

    const dots = values.map((v, i) => {
      const on = points[i].key === state.point;
      return `<circle class="agHit" data-i="${i}" cx="${x(i)}" cy="${y(v)}" r="14">`
        + `<title>${escape(points[i].title)} · ${fmt(v, measure.kind)}</title></circle>`
        + `<circle class="agDot${on ? ' agDot--on' : ''}${points[i].partial ? ' agDot--partial' : ''}"`
        + ` data-i="${i}" cx="${x(i)}" cy="${y(v)}" r="${on ? 6 : 3.5}"></circle>`;
    }).join('');

    /* Мероприятия: вертикальная засечка в той точке, куда попадает дата.
       Смысл в том, чтобы на графике было видно не только «стало меньше», но и
       «после чего стало меньше» — иначе связь действий и результата держится
       только в голове у того, кто их проводил. */
    const marks = (events || []).map((event) => {
      const day = String(event.дата || '').slice(0, 10);
      const at = points.findIndex((point) => {
        if (state.step === 'week') {
          // Ключ недели — понедельник; мероприятие принадлежит ей, если
          // попадает в семь дней от него.
          const to = new Date(new Date(point.key).getTime() + 7 * 864e5)
            .toISOString().slice(0, 10);
          return day >= point.key && day < to;
        }
        return (point.months || []).includes(day.slice(0, 7));
      });
      if (at < 0) return '';
      const label = String(event.название || '').slice(0, 34);
      return `<line class="agEvent" x1="${x(at)}" y1="${pad.top - 8}" x2="${x(at)}" y2="${pad.top + innerH}"></line>`
        + `<circle class="agEventDot" cx="${x(at)}" cy="${pad.top - 8}" r="4">`
        + `<title>${escape(event.дата)} · ${escape(event.название)}`
        + `${event.что ? ' — ' + escape(event.что) : ''}</title></circle>`
        + `<text class="agEventLabel" x="${x(at) + 6}" y="${pad.top + 6}">${escape(label)}</text>`;
    }).join('');

    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Динамика периода">`
      + '<defs><linearGradient id="agFill" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="#4d8df7" stop-opacity=".26"></stop>'
      + '<stop offset="100%" stop-color="#4d8df7" stop-opacity="0"></stop></linearGradient></defs>'
      + ticks + `<path class="agArea" d="${area}"></path><path class="agLine" d="${line}"></path>`
      + trend + marks + dots + labels + axis + '</svg>';

    box.querySelectorAll('[data-i]').forEach((node) => {
      node.addEventListener('click', () => {
        const point = points[Number(node.dataset.i)];
        state.point = state.point === point.key ? null : point.key;
        render();
      });
    });

    const stepName = state.step === 'week' ? 'неделю' : state.step === 'month' ? 'месяц' : 'квартал';
    const direction = slope > 0 ? 'растёт' : slope < 0 ? 'снижается' : 'стоит';
    const partials = points.filter((point) => point.partial).length;
    el('agTimeHint').textContent = `тренд ${direction} на ${fmt(Math.abs(slope), measure.kind)} за ${stepName}`
      + ' · клик по точке выбирает её'
      + (partials ? ' · звёздочка — период собран не целиком' : '');
  }

  function renderFacts(data, contour, points, values) {
    const box = el('agFacts');
    box.innerHTML = '';
    const measure = measureOf(contour);
    if (!points.length) return;
    const current = points.find((p) => p.key === state.point) || points[points.length - 1];
    const position = points.indexOf(current);
    const value = values[position];
    const history = values.slice(Math.max(0, position - 4), position);
    const base = median(history);
    const delta = base ? value - base : 0;

    const period = periodDef();
    // Доли и цены не складываются: сумма процентов за квартал бессмысленна,
    // поэтому за период берём среднее, а не итог.
    const srednee = (ryad) => (ryad.length ? ryad.reduce((a, b) => a + b, 0) / ryad.length : 0);
    const now = measure.control ? srednee(values) : values.reduce((a, b) => a + b, 0);
    const beforeMonths = period.months ? periodMonths(data, 1) : [];
    const before = !beforeMonths.length ? 0
      : measure.control
        ? srednee(controlPoints(data, measure, beforeMonths).map((point) => point.value))
        : total(data, pointsOf(data, beforeMonths).flatMap((p) => p.rows), measure.key);
    // Незакрытый месяц в периоде делает сравнение неравным: без оговорки
    // «−40%» читается как обвал, хотя месяц просто ещё идёт.
    const unevenNote = before && points.some((p) => p.partial) ? ' · период ещё не закрыт' : '';
    const compareName = period.compare || 'вся история';

    const cards = [
      { label: current.title, value: fmt(value, measure.kind), note: measure.label },
      {
        label: 'к медиане предыдущих точек',
        value: base ? fmtSigned(delta, measure.kind) : '—',
        note: base ? `${pct((delta / base) * 100)} · медиана ${fmt(base, measure.kind)}` : 'мало истории',
        tone: delta > 0 ? 'up' : delta < 0 ? 'down' : '',
      },
      {
        label: compareName,
        value: before ? pct(((now - before) / before) * 100) : '—',
        note: before ? `${fmt(now, measure.kind)} против ${fmt(before, measure.kind)}${unevenNote}`
          : 'предыдущего периода нет в истории',
        tone: before && now > before ? 'up' : before && now < before ? 'down' : '',
      },
      {
        label: measure.control ? 'в среднем за период' : 'за период',
        value: fmt(now, measure.kind),
        note: `${points.length} ${plural(points.length, 'точка', 'точки', 'точек')}`
          + ` · пик ${fmt(Math.max(...values), measure.kind)}`,
      },
    ];

    // Доли к масштабу компании живут здесь же, среди прочих фактов: отдельной
    // полосой они наслаивались на цель и читались как ещё один блок, хотя это
    // такая же характеристика периода, как медиана или пик.
    shareCards().forEach((card) => cards.push(card));

    cards.forEach((card) => {
      const item = document.createElement(card.share ? 'button' : 'div');
      item.className = 'agFact' + (card.tone ? ` agFact--${card.tone}` : '')
        + (card.share ? ' agFact--share' : '') + (card.share === state.share ? ' is-open' : '');
      if (card.share) {
        item.type = 'button';
        item.dataset.share = card.share;
        item.addEventListener('click', () => {
          state.share = state.share === card.share ? null : card.share;
          render();
        });
      }
      item.innerHTML = `<span>${escape(card.label)}</span><strong>${card.value}</strong>`
        + `<small>${escape(card.note)}</small>`;
      box.appendChild(item);
    });

    const open = SHARES.find((card) => card.key === state.share);
    const months = ((index.control && index.control.months) || []).filter((row) => row.akty);
    if (open && months.length > 1) box.insertAdjacentHTML('beforeend', shareBreakdown(open, months));
  }

  // ------------------------------------------------------------- цели

  /** Сколько актов набежало в текущем месяце и сколько будет к его концу.
   *
   * Прогноз линейный: месяц идёт достаточно ровно, всплеск одной недели он
   * сгладит, но на вопрос «укладываемся или нет» отвечает. Покрытие считаем
   * дробным — по моменту сборки данных, а не по календарному числу: иначе
   * сегодняшний неполный день делится как полный и прогноз занижается на
   * десятую часть.
   */
  function runningMonth(data) {
    if (!data.months || data.dimAt.month === undefined) return null;
    const month = data.months[data.months.length - 1];
    const built = new Date(index.built);
    const stamp = `${built.getFullYear()}-${String(built.getMonth() + 1).padStart(2, '0')}`;
    if (month !== stamp) return null;

    const at = data.dimAt.month;
    const strok = data.measureAt.strok;
    let sum = 0;
    data.rows.forEach((row) => {
      if (data.labels.month[row[at]] === month) sum += row[strok];
    });

    const covered = built.getDate() - 1 + (built.getHours() * 60 + built.getMinutes()) / 1440;
    const daysInMonth = new Date(built.getFullYear(), built.getMonth() + 1, 0).getDate();
    return {
      month, fact: sum, daysInMonth, covered,
      day: `${String(built.getDate()).padStart(2, '0')} ${MONTHS_SHORT[built.getMonth()]}`,
      forecast: covered > 0.5 ? Math.round((sum / covered) * daysInMonth) : null,
    };
  }

  /* План на текущий месяц.
   *
   * В траектории план стоит с октября, а живём мы в сентябре — между последним
   * фактом и первым планом дыра. Тянем прямую: иначе на вопрос «где мы должны
   * быть сегодня» ответить нечем, а именно его и задают.
   */
  function planFor(month, trajectory) {
    const exact = trajectory.find((row) => row.month === month && row.point_b);
    if (exact) return { value: exact.point_b, exact: true };

    const before = [...trajectory].reverse().find((row) => row.month < month && row.fact);
    const after = trajectory.find((row) => row.month > month && row.point_b);
    if (!before || !after) return null;

    const months = (key) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5));
    const span = months(after.month) - months(before.month);
    const step = span ? (after.point_b - before.fact) / span : 0;
    return { value: Math.round(before.fact + step * (months(month) - months(before.month))),
             exact: false };
  }

  /* Светофор: идём ли мы к цели.
   *
   * Сравниваем не «сколько уже есть» с месячным планом — так до конца месяца
   * всё всегда зелёное, — а прогноз конца месяца с планом на этот месяц.
   * Пять процентов запаса: месяц идёт неровно, и дёргать людей из-за случайной
   * недели незачем.
   */
  function trafficLight(forecast, plan) {
    if (!forecast || !plan) return null;
    const over = (forecast - plan.value) / plan.value;
    if (over <= 0) return { key: 'ok', label: 'идём к цели' };
    if (over <= 0.05) return { key: 'warn', label: 'на грани' };
    return { key: 'bad', label: 'не укладываемся' };
  }

  function renderGoals(data) {
    const box = el('agGoals');
    if (state.contour !== 'zabr') { box.hidden = true; return; }
    const trajectory = index.control.trajectory || [];
    const fact = [...trajectory].reverse().find((row) => row.fact);
    const target = [...trajectory].reverse().find((row) => row.point_b);
    if (!fact || !target) { box.hidden = true; return; }

    const running = runningMonth(data);
    // Шкала: от последнего закрытого месяца до цели года. Заполнение — то, где
    // мы стоим по прогнозу текущего месяца, а не по позапрошлой цифре.
    const start = fact.fact;
    const span = Math.max(start - target.goal, 1);
    const at = running && running.forecast ? running.forecast : start;
    const done = Math.min(Math.max((start - at) / span, 0), 1);
    const gap = at - target.point_b;

    // Где мы должны быть сегодня и куда придём к концу месяца.
    const plan = running ? planFor(running.month, trajectory) : null;
    const light = running ? trafficLight(running.forecast, plan) : null;
    const dueToday = plan && running
      ? Math.round(plan.value * ((running.covered || 0) / running.daysInMonth))
      : null;

    const monthName = (key) => `${MONTHS_SHORT[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;
    box.hidden = false;
    box.className = 'agGoals' + (light ? ` agGoals--${light.key}` : '');
    box.innerHTML = '<span class="agGoals__label">зафиксировано</span>'
      + `<span class="agGoals__item"><b>${fmtInt(start)}</b>`
        + `<span>актов · ${monthName(fact.month)}</span></span>`
      + (running
        ? `<span class="agGoals__item agGoals__item--now"><b>${fmtInt(running.fact)}</b>`
          + `<span>уже в ${MONTHS_IN[Number(running.month.slice(5)) - 1]}`
          + ` · по ${running.day}</span></span>`
          + (running.forecast
            ? `<span class="agGoals__item agGoals__item--forecast"><b>${fmtInt(running.forecast)}</b>`
              + '<span>будет по этому темпу</span></span>'
            : '')
        : '')
      + `<span class="agGoals__track" style="--w:${(done * 100).toFixed(1)}%;--goal:100%">`
      + '<i></i><u></u></span>'
      + `<span class="agGoals__item"><b>${fmtInt(target.point_b)}</b><span>Точка Б · 31.12</span></span>`
      + `<span class="agGoals__item"><b>${fmtInt(target.goal)}</b><span>цель года</span></span>`
      + `<span class="agGoals__gap">до Точки Б <b>${fmtSigned(gap, 'int')}</b></span>`
      + (light
        ? `<span class="agGoals__light agGoals__light--${light.key}"><i></i>${light.label}`
          + (dueToday !== null
            ? `<em>по плану к ${running.day} — ${fmtInt(dueToday)}, сейчас ${fmtInt(running.fact)}`
              + `${plan.exact ? '' : ' · план на месяц выведен между августом и октябрём'}</em>`
            : '')
          + '</span>'
        : '');
  }

  /* Доли брака в масштабе компании.
   *
   * Просьба Жени: на борде не хватало долей от выручки и от хранимых штук.
   * Резон простой — компания растёт, и брак в штуках растёт вместе с ней, но
   * это ещё не значит, что стало хуже. Доля отвечает честно, а цена штуки
   * рядом показывает, дорожает товар или мельчает: работа считается в штуках,
   * а не в рублях, и от этого зависят трудозатраты.
   *
   * Числитель везде один и тот же — акты приёмки, как у точки А. Живут эти
   * метрики среди карточек периода, отдельного блока для них нет.
   */
  const CENA_SHTUKI = (row) => (row.prodano ? row.vyruchka / row.prodano : 0);

  const SHARES = [
    { key: 'pct_vyr', label: 'доля от выручки', kind: 'pct',
      verh: { key: 'rub', label: 'брак, ₽', kind: 'money' },
      niz: { key: 'vyruchka', label: 'выручка, ₽', kind: 'money' } },
    { key: 'pct_sht', label: 'доля от проданных штук', kind: 'pct',
      verh: { key: 'akty', label: 'актов', kind: 'int' },
      niz: { key: 'prodano', label: 'продано, шт', kind: 'int' } },
    { key: 'pct_ost', label: 'доля от хранимых штук', kind: 'pct',
      verh: { key: 'akty', label: 'актов', kind: 'int' },
      niz: { key: 'ostatok', label: 'остаток, шт', kind: 'int' } },
    { key: 'cena', label: 'цена штуки компании', kind: 'money', value: CENA_SHTUKI,
      verh: { key: 'vyruchka', label: 'выручка, ₽', kind: 'money' },
      niz: { key: 'prodano', label: 'продано, шт', kind: 'int' } },
  ];

  const monthName = (key) => MONTHS_SHORT[Number(key.slice(5)) - 1] + ' ' + key.slice(0, 4);
  const shareValue = (card, row) => (card.value ? card.value(row) : row[card.key]);

  /** Точки для мер-долей: месяцы периода со своим значением.
   *
   * Форма та же, что у обычных точек, поэтому график, засечки мероприятий и
   * карточки работают без оговорок. Строк внутри нет — по доле не
   * проваливаются, она характеристика месяца целиком.
   */
  function controlPoints(data, measure, months) {
    const card = SHARES.find((item) => item.key === measure.key);
    const inside = new Set(months || periodMonths(data));
    return ((index.control && index.control.months) || [])
      .filter((row) => row.akty && inside.has(row.month))
      .map((row) => ({
        key: row.month,
        label: MONTHS_SHORT[Number(row.month.slice(5)) - 1] + ' ' + row.month.slice(2, 4),
        title: MONTHS[Number(row.month.slice(5)) - 1] + ' ' + row.month.slice(0, 4),
        rows: [],
        months: [row.month],
        partial: monthRunning(row.month),
        value: shareValue(card, row),
      }));
  }

  /** Карточки долей для блока фактов: значение за последний закрытый месяц и ГкГ. */
  function shareCards() {
    const months = ((index.control && index.control.months) || []).filter((row) => row.akty);
    if (months.length < 2) return [];
    const last = months[months.length - 1];
    const yearAgo = months.find((row) => row.month === shiftYear(last.month));

    return SHARES.map((card) => {
      const now = shareValue(card, last);
      const was = yearAgo ? shareValue(card, yearAgo) : null;
      const delta = was ? ((now - was) / was) * 100 : null;
      // «Меньше» для доли и для цены штуки значит разное: доля вниз — хорошо,
      // цена вниз — тревожно, штук на тот же рубль становится больше.
      const good = card.kind === 'pct' ? delta < 0 : delta > 0;
      return {
        share: card.key,
        label: card.label,
        value: card.kind === 'pct' ? pctPlain(now) : fmtMoney(now),
        note: monthName(last.month) + (delta === null ? ' · года назад нет в данных'
          : ' · ' + pct(delta) + ' к ' + monthName(yearAgo.month)),
        tone: delta === null ? '' : (good ? 'down' : 'up'),
      };
    });
  }

  /** Разбор доли: числитель, знаменатель и она сама по месяцам плюс год назад. */
  function shareBreakdown(card, closed) {
    const rows = closed.slice(-13).reverse().map((row) => {
      const back = closed.find((item) => item.month === shiftYear(row.month));
      const now = shareValue(card, row);
      const was = back ? shareValue(card, back) : null;
      const delta = was ? ((now - was) / was) * 100 : null;
      const good = card.kind === 'pct' ? delta < 0 : delta > 0;
      return '<tr>'
        + `<td>${monthName(row.month)}</td>`
        + `<td>${fmt(row[card.verh.key], card.verh.kind)}</td>`
        + `<td>${fmt(row[card.niz.key], card.niz.kind)}</td>`
        + `<td><b>${card.kind === 'pct' ? pctPlain(now) : fmtMoney(now)}</b></td>`
        + `<td class="${delta === null ? '' : `agShare__delta--${good ? 'down' : 'up'}`}">`
          + `${delta === null ? '—' : pct(delta)}</td>`
        + '</tr>';
    }).join('');

    return '<div class="agShareOpen">'
      + `<p class="agShareOpen__head">${card.label} · из чего складывается`
        + '<span>год к году — тот же месяц прошлого года</span></p>'
      + '<table class="agShareOpen__table"><thead><tr>'
        + `<th>месяц</th><th>${card.verh.label}</th><th>${card.niz.label}</th>`
        + '<th>значение</th><th>ГкГ</th></tr></thead>'
      + `<tbody>${rows}</tbody></table></div>`;
  }

  function shiftYear(month) {
    return `${Number(month.slice(0, 4)) - 1}-${month.slice(5)}`;
  }


  // ---------------------------------------------------------------- карта

  function heatColor(share) {
    // Тёмно-синий → синий → янтарный → красный: спокойный низ, заметный верх.
    const stops = [[22, 50, 79], [77, 141, 247], [245, 173, 50], [240, 93, 114]];
    const scaled = Math.min(Math.max(share, 0), 1) * (stops.length - 1);
    const i = Math.min(Math.floor(scaled), stops.length - 2);
    const t = scaled - i;
    const mix = stops[i].map((from, c) => Math.round(from + (stops[i + 1][c] - from) * t));
    return `rgb(${mix.join(',')})`;
  }

  function renderHeat(data, contour, points) {
    const chips = el('agHeatDim');
    const used = new Set(state.filters.map((f) => f.dim));
    const open = contour.dims.filter((dim) => !used.has(dim.key));
    if (!open.some((dim) => dim.key === state.heatDim)) state.heatDim = open.length ? open[0].key : null;
    segment(chips, open, state.heatDim, (key) => { state.heatDim = key; render(); });

    const box = el('agHeat');
    box.innerHTML = '';
    if (!state.heatDim || !points.length) {
      box.innerHTML = '<p class="agEmpty">Разрезы кончились — карта строится по оставшимся.</p>';
      return;
    }

    const measure = measureOf(contour);
    const perPoint = points.map((point) => breakdown(data, point.rows, state.heatDim, measure.key));
    const totals = new Map();
    perPoint.forEach((map) => map.forEach((value, name) => totals.set(name, (totals.get(name) || 0) + value)));
    const names = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, HEAT_ROWS).map(([name]) => name);
    if (!names.length) { box.innerHTML = '<p class="agEmpty">В периоде нет данных.</p>'; return; }

    const peak = Math.max(...names.flatMap((name) => perPoint.map((map) => map.get(name) || 0)), 1);

    const grid = document.createElement('div');
    grid.className = 'agHeatGrid';
    grid.style.gridTemplateColumns = `minmax(140px, 230px) repeat(${points.length}, minmax(54px, 1fr))`;

    grid.appendChild(document.createElement('div'));
    points.forEach((point) => {
      const head = document.createElement('div');
      head.className = 'agHeatHead';
      head.textContent = point.label + (point.partial ? '*' : '');
      head.title = point.title;
      grid.appendChild(head);
    });

    names.forEach((name) => {
      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'agHeatName';
      label.textContent = name;
      label.title = `${name} — провалиться`;
      label.addEventListener('click', () => {
        state.filters = state.filters.concat({ dim: state.heatDim, label: name });
        render();
      });
      grid.appendChild(label);

      perPoint.forEach((map, i) => {
        const value = map.get(name) || 0;
        const cell = document.createElement('button');
        cell.type = 'button';
        if (!value) {
          cell.className = 'agHeatCell agHeatCell--empty';
          cell.textContent = '—';
          cell.disabled = true;
        } else {
          cell.className = 'agHeatCell';
          cell.style.background = heatColor(value / peak);
          cell.style.color = value / peak > 0.45 ? '#0a121b' : '#dbe6f5';
          cell.textContent = fmt(value, measure.kind);
          cell.title = `${name} · ${points[i].title} · ${fmt(value, measure.kind)}`;
          cell.addEventListener('click', () => {
            state.point = points[i].key;
            state.filters = state.filters.concat({ dim: state.heatDim, label: name });
            render();
          });
        }
        grid.appendChild(cell);
      });
    });

    box.appendChild(grid);
    const legend = document.createElement('div');
    legend.className = 'agHeatLegend';
    legend.innerHTML = `<span>меньше</span><i></i><span>больше · максимум ${fmt(peak, measure.kind)}</span>`;
    box.appendChild(legend);
  }

  // ----------------------------------------------------------------- провал

  /** Поле поиска: есть только там, где у контура вообще есть номенклатура. */
  function renderSearch(data) {
    const box = el('agSearch');
    if (!box) return;
    if (data.dimAt.tovar === undefined) { box.hidden = true; return; }
    box.hidden = false;
    const note = el('agSearchNote');
    if (!note) return;
    if (!state.search.trim()) {
      note.textContent = `в контуре ${fmtInt((data.labels.tovar || []).length)} позиций`;
      note.classList.remove('agSearch__note--empty');
      return;
    }
    const found = searchSet ? searchSet.size : 0;
    note.textContent = found
      ? `подошло ${fmtInt(found)} ${plural(found, 'позиция', 'позиции', 'позиций')} — весь экран считается по ним`
      : 'ничего не нашлось — экран пустой, снимите поиск';
    note.classList.toggle('agSearch__note--empty', !found);
  }

  function renderCrumbs(contour, points) {
    const box = el('agCrumbs');
    box.innerHTML = '';
    const current = state.point ? points.find((p) => p.key === state.point) : null;
    const root = document.createElement('span');
    root.className = 'agCrumb agCrumb--root';
    root.innerHTML = `<em>период</em><b>${escape(current ? current.title : periodDef().label)}</b>`;
    box.appendChild(root);

    state.filters.forEach((filter, position) => {
      const dim = contour.dims.find((d) => d.key === filter.dim);
      const crumb = document.createElement('button');
      crumb.type = 'button';
      crumb.className = 'agCrumb';
      crumb.innerHTML = `<em>${dim ? dim.label : filter.dim}</em><b>${escape(filter.label)}</b><em>✕</em>`;
      crumb.title = 'убрать этот фильтр';
      crumb.addEventListener('click', () => {
        state.filters = state.filters.slice(0, position);
        render();
      });
      box.appendChild(crumb);
    });

    // Исключения живут отдельной строкой: это не «куда мы провалились», а «что
    // мы мысленно вычли из общего числа».
    state.exclude.forEach((item, position) => {
      const dim = contour.dims.find((d) => d.key === item.dim);
      const crumb = document.createElement('button');
      crumb.type = 'button';
      crumb.className = 'agCrumb agCrumb--minus';
      crumb.innerHTML = `<em>без · ${dim ? dim.label : item.dim}</em>`
        + `<b>${escape(item.label)}</b><em>✕</em>`;
      crumb.title = 'вернуть в общий счёт';
      crumb.addEventListener('click', () => {
        state.exclude = state.exclude.filter((_, i) => i !== position);
        render();
      });
      box.appendChild(crumb);
    });

    if (state.search) {
      const crumb = document.createElement('button');
      crumb.type = 'button';
      crumb.className = 'agCrumb agCrumb--search';
      crumb.innerHTML = `<em>поиск</em><b>${escape(state.search)}</b><em>✕</em>`;
      crumb.title = 'снять поиск';
      crumb.addEventListener('click', () => {
        state.search = '';
        const field = el('agSearchInput');
        if (field) field.value = '';
        render();
      });
      box.appendChild(crumb);
    }

    if (state.filters.length || state.exclude.length || state.search || state.point) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'agCrumb agCrumb--reset';
      reset.textContent = 'сбросить всё';
      reset.addEventListener('click', () => {
        state.filters = [];
        state.exclude = [];
        state.search = '';
        state.point = null;
        const field = el('agSearchInput');
        if (field) field.value = '';
        render();
      });
      box.appendChild(reset);
    }
  }

  function donut(entries, measure, onPick) {
    const size = 240;
    const radius = 102;
    const inner = 62;
    const sum = entries.reduce((acc, item) => acc + item.value, 0) || 1;
    let angle = -Math.PI / 2;
    const arcs = entries.map((item, i) => {
      const sweep = (item.value / sum) * Math.PI * 2;
      const from = angle;
      const to = angle + sweep;
      angle = to;
      const point = (r, a) => `${(size / 2 + r * Math.cos(a)).toFixed(2)},${(size / 2 + r * Math.sin(a)).toFixed(2)}`;
      const large = sweep > Math.PI ? 1 : 0;
      return `<path class="agSlice" data-i="${i}" fill="${PIE_COLORS[i % PIE_COLORS.length]}"`
        + ` d="M${point(radius, from)} A${radius},${radius} 0 ${large} 1 ${point(radius, to)}`
        + ` L${point(inner, to)} A${inner},${inner} 0 ${large} 0 ${point(inner, from)} Z">`
        + `<title>${escape(item.name)} · ${fmt(item.value, measure.kind)} · ${
          ((item.value / sum) * 100).toFixed(1).replace('.', ',')}%</title></path>`;
    }).join('');

    const box = document.createElement('div');
    box.className = 'agPie';
    box.innerHTML = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Структура среза">${arcs}`
      + `<text class="agPie__center" x="${size / 2}" y="${size / 2 - 2}" font-size="18" font-weight="600">`
      + `${fmt(sum, measure.kind)}</text>`
      + `<text class="agPie__center" x="${size / 2}" y="${size / 2 + 16}"><tspan class="sub">${measure.label}</tspan></text></svg>`;
    box.querySelectorAll('.agSlice').forEach((node) => {
      node.addEventListener('click', () => onPick(entries[Number(node.dataset.i)]));
    });
    return box;
  }

  function renderTable(data, contour, points) {
    const src = data;
    const dims = el('agDims');
    dims.innerHTML = '';
    const used = new Set(state.filters.map((f) => f.dim));
    const open = contour.dims.filter((dim) => !used.has(dim.key));
    const measureNow = measureOf(contour);
    const currentPoint = state.point ? points.find((p) => p.key === state.point) : null;
    const scopeNow = currentPoint ? currentPoint.rows : points.flatMap((p) => p.rows);

    // Куда осмысленно проваливаться дальше. Раньше после провала брался просто
    // следующий разрез по списку — часто он оказывался ровным, и человек видел
    // десяток одинаковых строк вместо причины. Считаем, насколько разрез
    // расслаивает выбранный кусок: доля самого крупного значения.
    const ranked = open.map((dim) => {
      const map = breakdown(src, scopeNow, dim.key, measureNow.key);
      const values = [...map.values()].sort((a, b) => b - a);
      const sum = values.reduce((acc, v) => acc + v, 0) || 1;
      return { dim, size: map.size, share: values.length ? values[0] / sum : 0 };
    }).filter((item) => item.size > 1);
    // На два-три значения перекос почти всегда есть — так устроены служебные
    // поля вроде модели учёта. Подсказывать имеет смысл разрез, где выбор
    // действительно широкий, а перевес всё равно нашёлся.
    const best = ranked.filter((item) => item.size >= 4)
      .sort((a, b) => b.share - a.share)[0] || null;

    if (!open.some((dim) => dim.key === state.drillDim)) {
      state.drillDim = best ? best.dim.key : (open.length ? open[0].key : null);
    }

    open.forEach((dim) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'agDim';
      chip.textContent = dim.label;
      const rank = ranked.find((item) => item.dim.key === dim.key);
      if (rank) chip.title = `${rank.size} значений, крупнейшее — ${(rank.share * 100).toFixed(0)}%`;
      if (best && dim.key === best.dim.key && dim.key !== state.drillDim) {
        chip.classList.add('agDim--hint');
      }
      chip.setAttribute('aria-selected', String(dim.key === state.drillDim));
      chip.addEventListener('click', () => { state.drillDim = dim.key; render(); });
      dims.appendChild(chip);
    });

    if (best && best.dim.key !== state.drillDim && best.share >= 0.5) {
      const tip = document.createElement('span');
      tip.className = 'agDimHint';
      tip.textContent = `здесь заметнее: ${best.dim.label} — ${(best.share * 100).toFixed(0)}% в одном значении`;
      dims.appendChild(tip);
    }


    const box = el('agTable');
    box.innerHTML = '';

    if (!state.drillDim) {
      const note = document.createElement('div');
      note.className = 'agEmpty';
      note.textContent = 'Разрезы этого контура кончились — снимите какой-нибудь фильтр.';
      box.appendChild(note);
      return;
    }

    const measure = measureOf(contour);
    const current = state.point ? points.find((p) => p.key === state.point) : null;
    const scope = current ? current.rows : points.flatMap((p) => p.rows);
    const totals = breakdown(src, scope, state.drillDim, measure.key);

    const baseline = new Map();
    if (current) {
      const position = points.indexOf(current);
      const history = points.slice(Math.max(0, position - 4), position);
      const maps = history.map((point) => breakdown(src, point.rows, state.drillDim, measure.key));
      const names = new Set([...totals.keys()]);
      maps.forEach((map) => map.forEach((_, name) => names.add(name)));
      names.forEach((name) => baseline.set(name, median(maps.map((map) => map.get(name) || 0))));
    }

    const rows = [...totals.entries()]
      .map(([name, value]) => ({ name, value, base: baseline.get(name) }))
      .sort((a, b) => b.value - a.value);

    if (!rows.length) { box.innerHTML = '<p class="agEmpty">В этом срезе строк нет.</p>'; return; }

    const split = document.createElement('div');
    split.className = 'agSplit';

    const head = rows.slice(0, 9);
    const rest = rows.slice(9).reduce((acc, row) => acc + row.value, 0);
    split.appendChild(donut(rest > 0 ? head.concat({ name: 'прочее', value: rest }) : head, measure, (entry) => {
      if (entry.name === 'прочее') return;
      state.filters = state.filters.concat({ dim: state.drillDim, label: entry.name });
      render();
    }));

    const table = document.createElement('div');
    table.className = 'agTable';
    const label = contour.dims.find((d) => d.key === state.drillDim).label;
    const shortMeasure = measure.kind === 'money' ? 'сумма' : (measure.kind === 'int' ? 'кол-во' : measure.label);
    const header = document.createElement('div');
    header.className = 'agRow agRow--head';
    header.innerHTML = `<span></span><span class="agRow__name">${label} · ${rows.length}</span>`
      + '<span class="agRow__bar"></span>'
      + `<span class="agRow__val"><span class="agDesktopOnly">${measure.label}</span>`
      + `<span class="agMobileOnly">${shortMeasure}</span></span>`
      + `<span class="agRow__delta">${current ? 'к медиане' : 'доля'}</span>`
      + '<span></span>';
    table.appendChild(header);

    // Одни названия номенклатуры нечитаемы: половина начинается одинаково.
    // Поэтому под названием — артикул, бренд и группа из справочника товаров.
    const tovarMeta = (name) => {
      if (state.drillDim !== 'tovar' || !src.tovarInfo) return '';
      const at = src.tovarAt.get(name);
      if (at === undefined) return '';
      const card = src.tovarInfo[at];
      const parts = [card[0] && card[0] !== '(нет)' ? `арт. ${card[0]}` : '',
        src.tovarBooks.brand[card[1]]]
        .filter((part) => part && part !== '(нет)' && part !== '(не указано)');
      return parts.length ? `<i class="agRow__meta">${escape(parts.join(' · '))}</i>` : '';
    };

    const sum = rows.reduce((acc, row) => acc + row.value, 0) || 1;
    const peak = rows[0].value || 1;
    rows.slice(0, 40).forEach((row, i) => {
      const item = document.createElement('div');
      item.className = 'agRow';
      let right = `${((row.value / sum) * 100).toFixed(1).replace('.', ',')}%`;
      let tone = '';
      if (current && row.base !== undefined) {
        const delta = row.value - row.base;
        tone = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
        right = fmtSigned(delta, measure.kind);
      }
      const color = i < 9 ? PIE_COLORS[i % PIE_COLORS.length] : 'var(--line-strong)';
      item.innerHTML = `<span class="agRow__chip" style="background:${color}"></span>`
        + `<span class="agRow__name" title="${escape(row.name)}">${escape(row.name)}`
        + `${tovarMeta(row.name)}</span>`
        + `<span class="agRow__bar"><i style="--w:${(row.value / peak) * 100}%"></i></span>`
        + `<span class="agRow__val">${fmt(row.value, measure.kind)}</span>`
        + `<span class="agRow__delta ${tone}">${right}</span>`
        // Вычесть строку из общего числа: «допустим, это мы починили».
        + '<button type="button" class="agRow__minus" title="убрать из общего числа">−</button>';
      item.addEventListener('click', (event) => {
        if (event.target.closest('.agRow__minus')) {
          state.exclude = state.exclude.concat({ dim: state.drillDim, label: row.name });
          render();
          return;
        }
        state.filters = state.filters.concat({ dim: state.drillDim, label: row.name });
        render();
      });
      table.appendChild(item);
    });

    if (rows.length > 40) {
      const more = document.createElement('p');
      more.className = 'agEmpty';
      more.textContent = `Показаны 40 из ${rows.length} значений — остальные есть в выгрузке.`;
      table.appendChild(more);
    }

    split.appendChild(table);
    box.appendChild(split);
  }

  // -------------------------------------------------------------- выгрузка

  // Библиотека тянется только по нажатию: она весит почти мегабайт, и грузить
  // её всем ради кнопки, которой пользуются раз в неделю, незачем. Лежит там
  // же, откуда её берут «Продажи» и «Остатки паллет».
  const XLSX_URL = '../dashboard/vendor/xlsx.full.min.js';

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = XLSX_URL;
      tag.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('библиотека не загрузилась')));
      tag.onerror = () => reject(new Error('не удалось загрузить библиотеку'));
      document.head.appendChild(tag);
    });
  }

  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  function dimTitle(contour, dim) {
    if (dim === 'week') return 'Неделя';
    const found = contour.dims.find((d) => d.key === dim);
    return capitalize(found ? found.label : dim);
  }

  function measureTitle(contour, key) {
    const found = contour.measures.find((m) => m.key === key);
    return capitalize(found ? found.label : key);
  }

  async function exportXlsx(data, contour, points) {
    const button = el('agExport');
    const was = button.textContent;
    button.disabled = true;
    button.textContent = 'Собираю…';
    try {
      const XLSX = await loadXlsx();
      const src = data;
      const measure = measureOf(contour);
      const current = state.point ? points.find((p) => p.key === state.point) : null;
      const scope = current ? current.rows : points.flatMap((p) => p.rows);

      // Лист 1 — строки среза как есть, с человеческими заголовками и числами
      // числами, чтобы в Excel сразу считались суммы и сводные.
      const detail = [];
      scope.forEach((row) => {
        if (!matches(src, row)) return;
        const item = {};
        src.dims.forEach((dim) => { item[dimTitle(contour, dim)] = src.labels[dim][row[src.dimAt[dim]]]; });
        // Карточку товара разворачиваем в колонки: в выгрузке артикул нужнее
        // всего — по нему ищут в 1С и в закупке.
        if (src.tovarInfo) {
          const card = src.tovarInfo[row[src.dimAt.tovar]];
          item.Артикул = card[0];
          item.Бренд = src.tovarBooks.brand[card[1]];
        }
        src.measures.forEach((m) => { item[measureTitle(contour, m)] = row[src.measureAt[m]]; });
        detail.push(item);
      });

      // Лист 2 — свод по текущему разрезу: то же, что видно в таблице на экране.
      const summary = [];
      if (state.drillDim) {
        const totals = breakdown(src, current ? current.rows : points.flatMap((p) => p.rows),
          state.drillDim, measure.key);
        const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
        [...totals.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, value]) => {
          summary.push({
            [dimTitle(contour, state.drillDim)]: name,
            [measureTitle(contour, measure.key)]: value,
            'Доля, %': Math.round((value / sum) * 1000) / 10,
          });
        });
      }

      // Лист 3 — та самая карта: разрез в строках, точки периода в столбцах.
      const map = [];
      if (state.heatDim) {
        const perPoint = points.map((point) => breakdown(data, point.rows, state.heatDim, measure.key));
        const names = new Map();
        perPoint.forEach((m) => m.forEach((value, name) => names.set(name, (names.get(name) || 0) + value)));
        [...names.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, total_]) => {
          const line = { [dimTitle(contour, state.heatDim)]: name };
          points.forEach((point, i) => { line[point.title] = perPoint[i].get(name) || 0; });
          line['Итого'] = total_;
          map.push(line);
        });
      }

      const book = XLSX.utils.book_new();
      if (summary.length) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary), 'Свод');
      if (map.length) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(map), 'Карта');
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(detail), 'Строки');

      const parts = [contour.name, current ? current.title : periodDef().label]
        .concat(state.filters.map((f) => f.label))
        .map((piece) => String(piece).replace(/[\\/:*?"<>|\[\]]/g, '-').trim().slice(0, 40));
      XLSX.writeFile(book, `Антигенерация — ${parts.join(' — ')}.xlsx`);
    } catch (error) {
      button.textContent = 'Не собралось';
      setTimeout(() => { button.textContent = was; }, 2500);
      return;
    } finally {
      button.disabled = false;
      if (button.textContent === 'Собираю…') button.textContent = was;
    }
  }

  // ---------------------------------------------------------------- сборка

  /* ── Клиентский брак ───────────────────────────────────────────────────
   *
   * Отдельный контур с месячной осью: возврат приходит через недели после
   * продажи, и на недельном шаге доля скачет так, что решать по ней нечего.
   * Смотрят здесь не форму кривой, а строку — какой товар, категорию или
   * бренд пора снимать с витрины.
   */

  const CLIENT_WINDOWS = [
    { key: 3, label: '3 месяца' },
    { key: 6, label: 'полгода' },
    { key: 12, label: 'год' },
  ];

  const CLIENT_KINDS = [
    { key: 'all', label: 'всё', measure: 'brak' },
    { key: 'vozvrat', label: 'возврат товара', measure: 'vozvrat' },
    { key: 'remont', label: 'сервис и ремонт', measure: 'remont' },
  ];

  const CLIENT_DIMS = [
    { key: 'kat1', label: 'категория' },
    { key: 'kat2', label: 'подкатегория' },
    { key: 'kat3', label: 'группа' },
    { key: 'brand', label: 'бренд' },
    { key: 'supplier', label: 'поставщик' },
    { key: 'tovar', label: 'товар' },
  ];

  let clientData = null;

  async function loadClient() {
    if (clientData) return clientData;
    const meta = index.client;
    if (!meta) return null;
    const payload = await fetch(DATA_DIR + meta.file, { cache: 'no-cache' }).then((r) => r.json());
    const dimAt = {};
    payload.dims.forEach((name, i) => { dimAt[name] = i; });
    const measureAt = {};
    payload.measures.forEach((name, i) => { measureAt[name] = payload.dims.length + i; });
    clientData = { ...payload, dimAt, measureAt };
    return clientData;
  }

  /** Месяцы выбранного окна — от последнего, что есть в данных. */
  function clientMonths(data) {
    return data.months.slice(-state.client.window);
  }

  /** Строки окна с учётом провала и поиска. */
  function clientRows(data) {
    const months = new Set(clientMonths(data));
    const words = state.client.search.trim().toLowerCase();
    const path = state.client.path;
    return data.rows.filter((row) => {
      if (!months.has(data.labels.month[row[data.dimAt.month]])) return false;
      for (const step of path) {
        if (data.labels[step.dim][row[data.dimAt[step.dim]]] !== step.value) return false;
      }
      if (!words) return true;
      const haystack = `${data.labels.tovar[row[data.dimAt.tovar]]} `
        + `${data.labels.brand[row[data.dimAt.brand]]} `
        + `${data.labels.supplier[row[data.dimAt.supplier]]} `
        + `${data.labels.sku[row[data.dimAt.sku]]}`;
      return haystack.toLowerCase().includes(words);
    });
  }

  /** Свод по выбранному разрезу: возвраты, деньги и оба знаменателя. */
  function clientGroups(data, rows) {
    const dim = state.client.dim;
    const at = data.dimAt[dim];
    const groups = new Map();
    for (const row of rows) {
      const name = data.labels[dim][row[at]];
      let item = groups.get(name);
      if (!item) {
        item = { name, brak: 0, vozvrat: 0, remont: 0, rub: 0, sold: 0, soldRub: 0,
                 sku: new Set() };
        groups.set(name, item);
      }
      item.brak += row[data.measureAt.brak];
      item.vozvrat += row[data.measureAt.vozvrat];
      item.remont += row[data.measureAt.remont];
      item.rub += row[data.measureAt.brak_rub];
      item.sold += row[data.measureAt.prod];
      item.soldRub += row[data.measureAt.prod_rub];
      item.sku.add(row[data.dimAt.sku]);
    }

    // Знаменатель для категорий, брендов и поставщиков берём полный — продажи
    // всего разреза, а не только тех товаров, по которым был возврат. Иначе
    // доля завышается в разы: товар без единой претензии продавался, но в
    // расчёт бы не попал.
    const months = clientMonths(data);
    const full = data.sales && data.sales[dim];
    for (const item of groups.values()) {
      if (full && full[item.name]) {
        let sold = 0;
        let soldRub = 0;
        for (const month of months) {
          const cell = full[item.name][month];
          // Рубли в файле лежат тысячами — разворачиваем сразу, чтобы дальше
          // по коду везде были рубли и никто не делил разное на разное.
          if (cell) { sold += cell[0]; soldRub += cell[1] * 1000; }
        }
        item.soldFull = sold;
        item.soldFullRub = soldRub;
      } else {
        item.soldFull = item.sold;
        item.soldFullRub = item.soldRub;
      }
    }
    return [...groups.values()];
  }

  /** Продажи компании за окно — знаменатель «процента от всей компании». */
  function clientCompany(data) {
    let sht = 0;
    let rub = 0;
    for (const month of clientMonths(data)) {
      const cell = data.company && data.company[month];
      if (cell) { sht += cell[0]; rub += cell[1]; }
    }
    return { sht, rub };
  }

  const CLIENT_COLUMNS = [
    { key: 'name', label: 'значение', kind: 'text' },
    { key: 'brak', label: 'возвратов, шт', kind: 'int' },
    { key: 'rub', label: '₽ возвращённого', kind: 'money' },
    // Главная доля — денежная. В штуках категория «Электрика и свет» это
    // полтора миллиарда лампочек, и любая доля там обращается в ноль; в
    // деньгах разрыв между категориями видно сразу.
    { key: 'shareRub', label: 'доля от продаж, ₽', kind: 'pct3',
      hint: 'возвращено ₽ ÷ продано ₽ этого же разреза за окно' },
    { key: 'share', label: 'доля от продаж, шт', kind: 'pct3',
      hint: 'возвраты ÷ проданные штуки этого же разреза' },
    { key: 'soldFull', label: 'продано, шт', kind: 'int' },
    { key: 'skuCount', label: 'SKU', kind: 'int' },
  ];

  function clientValue(item, column, company) {
    switch (column.key) {
      case 'name': return item.name;
      case 'brak': return clientKindValue(item);
      case 'share': return item.soldFull ? (clientKindValue(item) / item.soldFull) * 100 : null;
      // Знаменатель уже в рублях: тысячи развернули при чтении файла.
      case 'shareRub': return item.soldFullRub
        ? (item.rub / item.soldFullRub) * 100 : null;
      case 'rub': return item.rub;
      case 'soldFull': return item.soldFull;
      case 'company': return company.sht ? (clientKindValue(item) / company.sht) * 100 : null;
      case 'skuCount': return item.sku.size;
      default: return null;
    }
  }

  function clientKindValue(item) {
    const kind = CLIENT_KINDS.find((k) => k.key === state.client.kind) || CLIENT_KINDS[0];
    return item[kind.measure === 'brak' ? 'brak' : kind.measure];
  }

  function renderClient(data) {
    const box = el('agClientTable');
    const rows = clientRows(data);
    const company = clientCompany(data);
    const groups = clientGroups(data, rows);
    const minSales = Number(state.client.minSales) || 0;

    // Порог отсекает шум: одна продажа и один возврат — это 100%, но решать
    // по такой строке нечего. Порог ноль возвращает всё, включая возвраты по
    // давним продажам, — их видно по пометке в первой колонке.
    const shown = groups.filter((item) => item.soldFull >= minSales
      && clientKindValue(item) > 0);
    const column = CLIENT_COLUMNS.find((c) => c.key === state.client.sort) || CLIENT_COLUMNS[1];
    shown.sort((a, b) => {
      const left = clientValue(a, column, company);
      const right = clientValue(b, column, company);
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left).localeCompare(String(right), 'ru') * (state.client.desc ? -1 : 1);
      }
      const l = left === null ? -1 : left;
      const r = right === null ? -1 : right;
      return (r - l) * (state.client.desc ? 1 : -1);
    });

    const limited = shown.slice(0, 200);
    const head = CLIENT_COLUMNS.map((c) => {
      const on = c.key === state.client.sort;
      const mark = on ? (state.client.desc ? ' ↓' : ' ↑') : '';
      return `<th data-sort="${c.key}" class="${on ? 'is-sorted' : ''}"`
        + `${c.hint ? ` title="${escape(c.hint)}"` : ''}>${escape(c.label)}${mark}</th>`;
    }).join('');

    const body = limited.map((item) => {
      const cells = CLIENT_COLUMNS.map((c) => {
        const value = clientValue(item, c, company);
        if (c.kind === 'text') {
          const suspicious = item.soldFull > 0 && clientKindValue(item) > item.soldFull;
          const note = suspicious
            ? '<span class="agFlag" title="возвратов больше, чем продано за окно: скорее всего вернули товар давних продаж">возвраты старых продаж</span>'
            : (item.soldFull === 0
              ? '<span class="agFlag" title="за окно продаж не было">продаж нет</span>' : '');
          return `<td class="agTable__name">${escape(String(value))}${note}</td>`;
        }
        if (value === null) return '<td class="agNum">—</td>';
        if (c.kind === 'money') return `<td class="agNum">${fmtMoney(value)}</td>`;
        if (c.kind === 'pct') return `<td class="agNum">${pctPlain(value)}</td>`;
        if (c.kind === 'pct3') {
          // Три знака: на доле в сотые процента разница между категориями уже
          // видна, а округление до сотых схлопывало половину таблицы в ноль.
          const cls = value >= 1 ? ' is-hot' : (value >= 0.3 ? ' is-warm' : '');
          return `<td class="agNum${cls}">${value.toFixed(3).replace('.', ',')}%</td>`;
        }
        return `<td class="agNum">${fmtInt(value)}</td>`;
      }).join('');
      return `<tr data-value="${escape(item.name)}">${cells}</tr>`;
    }).join('');

    box.innerHTML = limited.length
      ? `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
        + (shown.length > limited.length
          ? `<p class="agHint agTable__more">показаны первые ${limited.length} из ${fmtInt(shown.length)} — уточните поиск или порог</p>`
          : '')
      : '<div class="agEmpty">Ничего не нашлось — смягчите порог или поиск</div>';

    box.querySelectorAll('th[data-sort]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const key = cell.dataset.sort;
        if (state.client.sort === key) state.client.desc = !state.client.desc;
        else { state.client.sort = key; state.client.desc = true; }
        renderClient(data);
      });
    });

    // Клик по строке — провал внутрь: категория → её товары. Последний разрез
    // дальше не проваливается, там уже конкретный товар.
    box.querySelectorAll('tbody tr').forEach((row) => {
      if (state.client.dim === 'tovar') return;
      row.classList.add('is-clickable');
      row.addEventListener('click', () => clientDrill(data, row.dataset.value));
    });

    // Графики строятся из тех же групп, что и таблица: расходиться им нельзя.
    clientTrend(data);
    clientTop(data, shown, company);
    clientMap(data, shown);

    // Итоги окна: сколько всего вернули и какая это доля продаж компании.
    const totalBrak = shown.reduce((sum, item) => sum + clientKindValue(item), 0);
    const totalRub = shown.reduce((sum, item) => sum + item.rub, 0);
    el('agClientTotals').innerHTML = [
      ['возвратов за окно', fmtInt(totalBrak) + ' шт'],
      ['на сумму', fmtMoney(totalRub)],
      ['продано компанией', fmtInt(company.sht) + ' шт'],
      ['доля от продаж компании', company.sht ? (totalBrak / company.sht * 100).toFixed(3).replace('.', ',') + '%' : '—'],
      ['строк в разрезе', fmtInt(shown.length)],
    ].map(([label, value]) => `<div class="agFact"><small>${label}</small><b>${value}</b></div>`).join('');

    // Крошки провала.
    const root = state.client.path.length
      ? '<button type="button" class="agCrumb" data-at="-1">все товары</button>'
      : '<span class="agCrumb agCrumb--root"><em>все товары</em></span>';
    const crumbs = [root];
    state.client.path.forEach((step, i) => {
      const label = CLIENT_DIMS.find((d) => d.key === step.dim);
      const last = i === state.client.path.length - 1;
      crumbs.push(`<button type="button" class="agCrumb" data-at="${i}">`
        + `<em>${escape(label ? label.label : step.dim)}</em>`
        + `<b>${escape(step.value)}</b>${last ? '<span class="agCrumb__x">×</span>' : ''}</button>`);
    });
    const crumbBox = el('agClientCrumbs');
    crumbBox.innerHTML = crumbs.join('<span class="agCrumbs__sep">→</span>');
    crumbBox.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        const at = Number(button.dataset.at);
        const last = at === state.client.path.length - 1;
        // По последней крошке — шаг назад: иначе нажать на неё нечем, а
        // возвращаться к самому началу каждый раз неудобно.
        state.client.path = at < 0 ? [] : state.client.path.slice(0, last ? at : at + 1);
        if (!state.client.path.length) state.client.dim = 'kat2';
        else if (last) state.client.dim = state.client.path[state.client.path.length - 1].dim === 'kat1'
          ? 'kat2' : CLIENT_DIMS[CLIENT_DIMS.findIndex((d) => d.key === state.client.path[state.client.path.length - 1].dim) + 1].key;
        drawClient(data);
      });
    });
  }

  /** Помесячная динамика: столбцы возвратов и линия доли в деньгах.
   *
   * Одна таблица не отвечает на вопрос «стало хуже или всегда так было».
   * Столбцы дают объём, линия — долю: вместе видно, растёт ли проблема или
   * просто выросли продажи.
   */
  function clientTrend(data) {
    const box = el('agClientTrend');
    const months = clientMonths(data);
    const rows = clientRows(data);
    const byMonth = new Map(months.map((month) => [month, { brak: 0, rub: 0 }]));
    for (const row of rows) {
      const month = data.labels.month[row[data.dimAt.month]];
      const cell = byMonth.get(month);
      if (!cell) continue;
      cell.brak += row[data.measureAt[CLIENT_KINDS.find((k) => k.key === state.client.kind).measure]];
      cell.rub += row[data.measureAt.brak_rub];
    }

    // Знаменатель месяца — продажи того же среза, что показан в таблице: при
    // провале в категорию доля должна быть её, а не общей.
    const sold = clientSoldByMonth(data, months);
    const points = months.map((month) => ({
      month,
      brak: byMonth.get(month).brak,
      rub: byMonth.get(month).rub,
      sold: sold[month] || 0,
      share: sold[month] ? (byMonth.get(month).rub / sold[month]) * 100 : 0,
    }));
    if (!points.length) { box.innerHTML = '<p class="agEmpty">Нет данных</p>'; return; }

    const W = Math.max(340, Math.round(box.clientWidth || 560));
    const H = 300;
    const pad = { right: 18, left: 52 };
    const innerW = W - pad.left - pad.right;
    const barTop = 28;
    const barH = 82;
    const lineTop = 158;
    const lineH = 88;
    const peak = Math.max(...points.map((p) => p.brak), 1);
    const peakShare = Math.max(...points.map((p) => p.share), 0.1);
    const step = innerW / points.length;
    const barW = Math.max(6, step * 0.56);

    // Текущий месяц ещё идёт: без пометки его столбец читается как обвал.
    const now = new Date();
    const running = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const closed = points.filter((point) => point.month !== running);
    const latest = closed[closed.length - 1] || points[points.length - 1];
    const previous = closed.length > 1 ? closed[closed.length - 2] : null;
    const latestMonth = MONTHS_SHORT[Number(latest.month.slice(5, 7)) - 1];
    const deltaShare = previous ? latest.share - previous.share : null;
    const totalRub = points.reduce((sum, point) => sum + point.rub, 0);
    const totalSold = points.reduce((sum, point) => sum + point.sold, 0);
    const averageShare = totalSold ? totalRub / totalSold * 100 : 0;
    const deltaClass = deltaShare === null ? '' : (deltaShare > 0 ? 'up' : deltaShare < 0 ? 'down' : '');
    const summary = '<div class="agTrendSummary">'
      + `<div class="agTrendSummary__item"><small>последний закрытый · ${latestMonth}</small><b>${fmtInt(latest.brak)} шт</b></div>`
      + `<div class="agTrendSummary__item"><small>доля возврата</small><b>${latest.share.toFixed(2).replace('.', ',')}%</b>`
      + (deltaShare === null ? '' : `<em class="${deltaClass}">${deltaShare > 0 ? '+' : ''}${deltaShare.toFixed(2).replace('.', ',')} п.п. к прошлому месяцу</em>`)
      + '</div>'
      + `<div class="agTrendSummary__item"><small>средняя за окно</small><b>${averageShare.toFixed(2).replace('.', ',')}%</b></div>`
      + '</div>';
    const bars = points.map((point, i) => {
      const height = (point.brak / peak) * barH;
      const x = pad.left + step * i + (step - barW) / 2;
      const partial = point.month === running ? ' agCBar--partial' : '';
      return `<rect class="agCBar${partial}" x="${x.toFixed(1)}" y="${(barTop + barH - height).toFixed(1)}" `
        + `width="${barW.toFixed(1)}" height="${Math.max(1, height).toFixed(1)}" rx="3">`
        + `<title>${point.month}: ${fmtInt(point.brak)} возвратов, доля ${point.share.toFixed(2)}%`
        + `${partial ? ' — месяц ещё не закрыт' : ''}</title></rect>`;
    }).join('');

    const lineY = (share) => lineTop + lineH - (share / peakShare) * lineH;
    const line = points.map((point, i) =>
      `${i ? 'L' : 'M'}${(pad.left + step * i + step / 2).toFixed(1)},${lineY(point.share).toFixed(1)}`).join(' ');
    const dots = points.map((point, i) =>
      `<circle class="agCDot" cx="${(pad.left + step * i + step / 2).toFixed(1)}" `
      + `cy="${lineY(point.share).toFixed(1)}" r="3.2"></circle>`).join('');

    const axis = points.map((point, i) => {
      if (points.length > 8 && i % 2) return '';
      return `<text class="agAxis" x="${(pad.left + step * i + step / 2).toFixed(1)}" `
        + `y="${H - 8}" text-anchor="middle">${MONTHS_SHORT[Number(point.month.slice(5, 7)) - 1]}</text>`;
    }).join('');

    const averageY = lineY(Math.min(averageShare, peakShare));
    box.innerHTML = summary + `<svg class="agCSvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`
      + `<text class="agTrendLabel" x="${pad.left}" y="12">ВОЗВРАТЫ, ШТ</text>`
      + `<line class="agGrid" x1="${pad.left}" y1="${barTop + barH}" x2="${W - pad.right}" y2="${barTop + barH}"></line>`
      + bars
      + `<text class="agAxis" x="${pad.left - 8}" y="${barTop + 4}" text-anchor="end">${fmtInt(peak)}</text>`
      + `<text class="agAxis" x="${pad.left - 8}" y="${barTop + barH + 3}" text-anchor="end">0</text>`
      + `<text class="agTrendLabel" x="${pad.left}" y="${lineTop - 14}">ДОЛЯ ВОЗВРАТА ОТ ПРОДАЖ, %</text>`
      + `<line class="agGrid" x1="${pad.left}" y1="${lineTop + lineH}" x2="${W - pad.right}" y2="${lineTop + lineH}"></line>`
      + `<line class="agTrendAvg" x1="${pad.left}" y1="${averageY.toFixed(1)}" x2="${W - pad.right}" y2="${averageY.toFixed(1)}"></line>`
      + `<path class="agCLine" d="${line}"></path>${dots}`
      + `<text class="agAxis agAxis--share" x="${pad.left - 8}" y="${lineTop + 4}" text-anchor="end">${peakShare.toFixed(1)}%</text>`
      + `<text class="agAxis" x="${pad.left - 8}" y="${lineTop + lineH + 3}" text-anchor="end">0</text>`
      + `<text class="agAxis agAxis--share" x="${W - pad.right}" y="${averageY - 5}" text-anchor="end">среднее ${averageShare.toFixed(2)}%</text>`
      + axis
      + '</svg>'
      + (points.some((p) => p.month === running)
        ? '<p class="agClientLegend"><span class="agClientLegend__note">пунктирный столбец — месяц ещё не закрыт</span></p>' : '');
  }

  /** Продажи показанного среза по месяцам — знаменатель для линии доли. */
  function clientSoldByMonth(data, months) {
    const result = {};
    const path = state.client.path;
    const last = path[path.length - 1];
    const full = last && data.sales && data.sales[last.dim] && data.sales[last.dim][last.value];
    for (const month of months) {
      if (full) {
        result[month] = full[month] ? full[month][1] * 1000 : 0;
      } else if (!path.length) {
        // Без провала знаменатель — продажи всей компании.
        result[month] = data.company[month] ? data.company[month][1] : 0;
      } else {
        result[month] = 0;
      }
    }
    if (path.length && !full) {
      // Провал по разрезу, которого нет в справочнике продаж (товар): считаем
      // по самим строкам — других продаж у SKU и нет.
      for (const row of clientRows(data)) {
        const month = data.labels.month[row[data.dimAt.month]];
        result[month] = (result[month] || 0) + row[data.measureAt.prod_rub];
      }
    }
    return result;
  }

  /** Топ разреза полосами: объём возвратов и доля рядом. */
  function clientTop(data, groups, company) {
    const box = el('agClientTop');
    const dim = CLIENT_DIMS.find((d) => d.key === state.client.dim);
    const dimLabel = dim ? dim.label : 'разрезу';
    el('agClientTopTitle').innerHTML = `<strong>Декомпозиция по: ${escape(dimLabel)}</strong>`
      + '<span>Объём возвратов и доля возвращённых рублей от продаж каждой строки</span>';
    const top = [...groups]
      .sort((a, b) => clientKindValue(b) - clientKindValue(a))
      .slice(0, 10);
    if (!top.length) { box.innerHTML = '<p class="agEmpty">Нет данных</p>'; return; }

    const peak = Math.max(...top.map(clientKindValue), 1);
    const total = groups.reduce((sum, item) => sum + clientKindValue(item), 0) || 1;
    const top3Share = top.slice(0, 3).reduce((sum, item) => sum + clientKindValue(item), 0) / total * 100;
    const riskiest = [...groups]
      .filter((item) => item.soldFullRub > 0)
      .sort((a, b) => (b.rub / b.soldFullRub) - (a.rub / a.soldFullRub))[0];
    const riskShare = riskiest ? riskiest.rub / riskiest.soldFullRub * 100 : null;
    const insight = '<div class="agClientInsight">'
      + `<div class="agClientInsight__item"><small>топ‑3 дают</small><b>${top3Share.toFixed(0)}% возвратов</b></div>`
      + `<div class="agClientInsight__item"><small>больше всего возвратов</small><b>${escape(top[0].name)}</b></div>`
      + (riskiest ? `<div class="agClientInsight__item"><small>самая высокая доля</small><b>${escape(riskiest.name)} · ${riskShare.toFixed(2).replace('.', ',')}%</b></div>` : '')
      + '</div>';
    const rowHead = '<div class="agCRowHead"><span>строка</span><span class="agCRowHead__bar"></span><span>возвраты</span><span>доля ₽</span></div>';
    box.innerHTML = insight + rowHead + top.map((item) => {
      const value = clientKindValue(item);
      const share = item.soldFullRub ? (item.rub / item.soldFullRub) * 100 : null;
      const heat = share === null ? '' : (share >= 1 ? ' is-hot' : share >= 0.3 ? ' is-warm' : '');
      return `<button type="button" class="agCRow" data-value="${escape(item.name)}">`
        + `<span class="agCRow__name" title="${escape(item.name)}">${escape(item.name)}</span>`
        + `<span class="agCRow__bar"><i style="--w:${((value / peak) * 100).toFixed(1)}%"></i></span>`
        + `<span class="agCRow__value">${fmtInt(value)}</span>`
        + `<span class="agCRow__share${heat}">${share === null ? '—' : share.toFixed(2).replace('.', ',') + '%'}</span>`
        + '</button>';
    }).join('');

    box.querySelectorAll('.agCRow').forEach((row) => {
      row.addEventListener('click', () => clientDrill(data, row.dataset.value));
    });
  }

  /** Карта решения: продажи по горизонтали, доля возвратов по вертикали.
   *
   * Таблицу читают строками, а решение принимают по сочетанию: много продаём и
   * много возвращают — снимать; мало продаём и много возвращают — просто
   * почистить. На карте это видно одним взглядом, в таблице — нет.
   */
  function clientMap(data, groups) {
    const box = el('agClientMap');
    const items = groups
      .filter((item) => item.soldFullRub > 0 && clientKindValue(item) > 0)
      .map((item) => ({ ...item, share: (item.rub / item.soldFullRub) * 100 }))
      .filter((item) => item.share > 0);
    if (items.length < 2) { box.innerHTML = '<p class="agEmpty">Точек мало — смягчите порог</p>'; return; }

    const W = Math.max(560, Math.round(box.clientWidth || 1100));
    const H = 340;
    const pad = { top: 24, right: 26, bottom: 44, left: 64 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    // Продажи по оси X — в логарифме: между товаром на сто тысяч и категорией
    // на десять миллиардов линейная шкала не оставляет места ничему.
    const sales = items.map((item) => item.soldFullRub);
    const minX = Math.log10(Math.max(1000, Math.min(...sales)));
    const maxX = Math.log10(Math.max(...sales));
    const spanX = Math.max(0.5, maxX - minX);
    const shares = items.map((item) => item.share);
    const peakY = Math.max(...shares) * 1.08;
    const money = items.map((item) => item.rub);
    const maxMoney = Math.max(...money, 1);

    const x = (value) => pad.left + ((Math.log10(Math.max(1000, value)) - minX) / spanX) * innerW;
    const y = (value) => pad.top + innerH - (value / peakY) * innerH;
    const r = (value) => 4 + Math.sqrt(value / maxMoney) * 16;

    // Линия среднего по всему показанному: выше неё — те, кто хуже среднего.
    const totalRub = items.reduce((sum, item) => sum + item.rub, 0);
    const totalSold = items.reduce((sum, item) => sum + item.soldFullRub, 0);
    const average = totalSold ? (totalRub / totalSold) * 100 : 0;

    const dots = items.map((item) => {
      const heat = item.share >= average * 2 ? ' is-hot' : item.share >= average ? ' is-warm' : '';
      return `<circle class="agMapDot${heat}" cx="${x(item.soldFullRub).toFixed(1)}" `
        + `cy="${y(item.share).toFixed(1)}" r="${r(item.rub).toFixed(1)}" data-value="${escape(item.name)}">`
        + `<title>${escape(item.name)}\nдоля ${item.share.toFixed(2)}% · возвратов ${fmtInt(clientKindValue(item))} шт `
        + `на ${fmtMoney(item.rub)}\nпродажи ${fmtMoney(item.soldFullRub)}</title></circle>`;
    }).join('');

    // Подписываем только крупные и самые проблемные — иначе каша.
    const labelled = [...items]
      .sort((a, b) => (b.share * b.rub) - (a.share * a.rub))
      .slice(0, 7);
    const labels = labelled.map((item) => {
      const left = x(item.soldFullRub);
      const anchor = left > W - pad.right - 120 ? 'end' : 'start';
      const shift = anchor === 'end' ? -r(item.rub) - 5 : r(item.rub) + 5;
      return `<text class="agMapLabel" x="${(left + shift).toFixed(1)}" y="${(y(item.share) + 3.5).toFixed(1)}" `
        + `text-anchor="${anchor}">${escape(item.name.slice(0, 34))}</text>`;
    }).join('');

    const gridY = [0, peakY / 2, peakY].map((value) =>
      `<line class="agGrid" x1="${pad.left}" y1="${y(value).toFixed(1)}" x2="${W - pad.right}" y2="${y(value).toFixed(1)}"></line>`
      + `<text class="agAxis" x="${pad.left - 8}" y="${(y(value) + 3.5).toFixed(1)}" text-anchor="end">${value.toFixed(1)}%</text>`).join('');

    const ticksX = [minX, (minX + maxX) / 2, maxX].map((power) =>
      `<text class="agAxis" x="${(pad.left + ((power - minX) / spanX) * innerW).toFixed(1)}" `
      + `y="${H - 22}" text-anchor="middle">${fmtMoney(Math.pow(10, power))}</text>`).join('');

    box.innerHTML = `<svg class="agCSvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`
      + gridY
      + `<line class="agMapAvg" x1="${pad.left}" y1="${y(average).toFixed(1)}" x2="${W - pad.right}" y2="${y(average).toFixed(1)}"></line>`
      + `<text class="agMapAvgText" x="${W - pad.right}" y="${(y(average) - 6).toFixed(1)}" text-anchor="end">среднее ${average.toFixed(2)}%</text>`
      + dots + labels + ticksX
      + `<text class="agAxis agAxis--muted" x="${(pad.left + innerW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">продажи за окно, ₽ — шкала логарифмическая</text>`
      + '</svg>';

    box.querySelectorAll('.agMapDot').forEach((dot) => {
      dot.addEventListener('click', () => clientDrill(data, dot.dataset.value));
    });
  }

  /** Провал в значение разреза — общий для таблицы, полос и карты.
   *
   * Следующий разрез выбираем не по порядку, а первый, где строк больше
   * одной: внутри подкатегории группа сплошь и рядом одна, и экран с
   * единственной строкой — потерянный клик.
   */
  function clientDrill(data, value) {
    if (state.client.dim === 'tovar') return;
    const order = CLIENT_DIMS.map((d) => d.key);
    const from = order.indexOf(state.client.dim);
    state.client.path = [...state.client.path, { dim: state.client.dim, value }];

    let chosen = order[order.length - 1];
    for (const key of order.slice(from + 1)) {
      state.client.dim = key;
      const seen = new Set();
      for (const row of clientRows(data)) seen.add(row[data.dimAt[key]]);
      if (seen.size > 1) { chosen = key; break; }
    }
    state.client.dim = chosen;
    drawClient(data);
  }

  /** Перерисовать вкладку целиком: переключатели и таблицу. */
  function drawClient(data) {
    segment(el('agClientWindow'), CLIENT_WINDOWS, state.client.window, (key) => {
      state.client.window = key;
      drawClient(data);
    });
    segment(el('agClientKind'), CLIENT_KINDS, state.client.kind, (key) => {
      state.client.kind = key;
      drawClient(data);
    });
    // Разрезы рисуем теми же чипами, что в «Разборе»: segment() даёт голые
    // кнопки, и вкладка выглядела чужой на фоне остального раздела.
    const dims = el('agClientDims');
    dims.innerHTML = '';
    CLIENT_DIMS.forEach((dim) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'agDim';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(dim.key === state.client.dim));
      button.textContent = dim.label;
      button.addEventListener('click', () => {
        state.client.dim = dim.key;
        state.client.path = [];
        drawClient(data);
      });
      dims.appendChild(button);
    });
    renderClient(data);
  }

  function setupClient(data) {
    const min = el('agClientMin');
    const search = el('agClientSearch');
    if (!min.dataset.ready) {
      min.dataset.ready = '1';
      min.value = String(state.client.minSales);
      min.addEventListener('input', () => {
        state.client.minSales = Number(min.value) || 0;
        renderClient(data);
      });
      search.addEventListener('input', () => {
        state.client.search = search.value;
        renderClient(data);
      });
      el('agClientExport').addEventListener('click', () => exportClient(data));
    }
  }

  async function exportClient(data) {
    await loadXlsx();
    const company = clientCompany(data);
    const groups = clientGroups(data, clientRows(data));
    const header = ['Значение', 'Возвратов, шт', 'Возврат товара, шт', 'Сервис, шт',
                    '₽ возвращённого', 'Продано, шт', 'Доля от своих продаж, %',
                    '% от продаж компании', 'SKU'];
    const body = groups
      .sort((a, b) => clientKindValue(b) - clientKindValue(a))
      .map((item) => [
        item.name, clientKindValue(item), item.vozvrat, item.remont,
        Math.round(item.rub), item.soldFull,
        item.soldFull ? Number((clientKindValue(item) / item.soldFull * 100).toFixed(2)) : null,
        company.sht ? Number((clientKindValue(item) / company.sht * 100).toFixed(4)) : null,
        item.sku.size,
      ]);
    const sheet = window.XLSX.utils.aoa_to_sheet([header, ...body]);
    const book = window.XLSX.utils.book_new();
    const dim = CLIENT_DIMS.find((d) => d.key === state.client.dim);
    window.XLSX.utils.book_append_sheet(book, sheet, 'Клиентский брак');
    window.XLSX.writeFile(book, `Клиентский брак — ${dim ? dim.label : state.client.dim}.xlsx`);
  }

  /** Панели обычных контуров и панель клиентского брака не уживаются на
   *  экране вместе: у них разная ось и разный способ читать. */
  function showPanels(table) {
    document.querySelectorAll('.agPanel--time, .agPanel--heat, .agPanel--drill')
      .forEach((panel) => { panel.hidden = table; });
    el('agClient').hidden = !table;
    const search = el('agSearch');
    if (search) search.hidden = table || search.dataset.off === '1';
  }

  async function render() {
    const contour = contourDef();
    renderContours();

    if (contour.table) {
      showPanels(true);
      const data = await loadClient();
      if (!data) {
        el('agClientTable').innerHTML = '<div class="agEmpty">Данные ещё не собраны</div>';
        return;
      }
      setupClient(data);
      drawClient(data);
      el('agStamp').innerHTML = `данные: <b>WMS · DWH</b><br>собрано: <b>${index.built.slice(0, 16).replace('T', ' ')}</b>`
        + `<br>история: <b>${data.months.length} ${plural(data.months.length, 'месяц', 'месяца', 'месяцев')}</b>`;
      if (pendingEnter) { pendingEnter = false; playEnter(); }
      return;
    }
    showPanels(false);

    segment(el('agMeasure'), contour.measures, state.measure, (key) => {
      state.measure = key;
      // Знаменатель у долей месячный, по неделям его не разложить. Переводим
      // ось на месяцы сами, чтобы выбранный шаг не обещал того, чего нет.
      const picked = contour.measures.find((item) => item.key === key);
      if (picked && picked.control && state.step === 'week') {
        state.step = 'month';
        state.point = null;
      }
      render();
    });

    segment(el('agPeriod'), PERIODS, state.period, (key) => { state.period = key; state.point = null; render(); });
    const stepsAllowed = measureOf(contour).control ? STEPS.filter((item) => item.key !== 'week') : STEPS;
    segment(el('agStep'), stepsAllowed, state.step, (key) => { state.step = key; state.point = null; render(); });

    const data = await loadContour(state.contour);
    buildSearchSet(data);
    renderSearch(data);
    const points = pointsOf(data, periodMonths(data));
    if (state.point && !points.some((p) => p.key === state.point)) state.point = null;
    const measure = measureOf(contour);
    const values = points.map((point) => total(data, point.rows, measure.key));

    // У долей своя ось времени — месячная: знаменатель считается по месяцу и
    // на недели не делится. Карта и разбор при этом остаются на обычных
    // точках, иначе провалиться в срез было бы не во что.
    const shown = measure.control ? controlPoints(data, measure) : points;
    const shownValues = measure.control ? shown.map((point) => point.value) : values;

    el('agTimeTitle').textContent = contour.name;
    renderGoals(data);
    renderChart(data, contour, shown, shownValues);
    renderFacts(data, contour, shown, shownValues);
    renderHeat(data, contour, points);
    renderCrumbs(contour, points);
    renderTable(data, contour, points);

    el('agStamp').innerHTML = `данные: <b>WMS · DWH</b><br>собрано: <b>${index.built.slice(0, 16).replace('T', ' ')}</b>`
      + `<br>история: <b>${data.weeks.length} ${plural(data.weeks.length, 'неделя', 'недели', 'недель')}</b>`;
    el('agSuperset').href = `${SUPERSET}/explore/?slice_id=${contour.chart}`;
    el('agExport').onclick = () => exportXlsx(data, contour, points);

    if (pendingEnter) {
      pendingEnter = false;
      playEnter();
    }
  }

  /* Отметка о данных и «Старая версия» живут внизу страницы, а не в шапке.
   *
   * Это справочная мелочь: когда собраны данные и где лежит прежний дашборд.
   * Рядом с названием раздела она занимала половину ряда и тянула взгляд на
   * себя — при том, что смотрят туда раз в неделю.
   */
  function placeHeroSide() {
    const side = document.querySelector('.agHeroSide');
    const foot = document.querySelector('.agFoot');
    if (!side || !foot || side.parentElement === foot) return;
    foot.insertAdjacentElement('afterbegin', side);
  }

  function setupSearch() {
    const field = el('agSearchInput');
    if (!field) return;
    let timer = null;
    field.addEventListener('input', () => {
      clearTimeout(timer);
      // Пересчёт задевает весь экран, поэтому ждём, пока человек допечатает.
      timer = setTimeout(() => {
        state.search = field.value;
        state.point = null;
        render();
      }, 280);
    });
  }

  // Компактная витрина для помощника. В модель уходит не 20 МБ строк, а точные
  // агрегаты из уже загруженного браузером набора: месяцы, регионы, дефекты и
  // текущий выбранный контур. Поэтому вопросы по скрытым разрезам не зависят от
  // того, успела ли нужная строка попасть в видимый текст страницы.
  window.__sectionAssistantContext = async (question = '') => {
    if (!index) return '';
    const query = String(question).toLocaleLowerCase('ru-RU');
    const official = await loadContour('zabr');
    const dims = official.dimAt;
    const measures = official.measureAt;
    const label = (dim, row) => official.labels[dim][row[dims[dim]]];
    const totals = (rows) => ({
      строк: rows.reduce((sum, row) => sum + Number(row[measures.strok] || 0), 0),
      розница_руб: Math.round(rows.reduce((sum, row) => sum + Number(row[measures.rrc] || 0), 0)),
      себестоимость_руб: Math.round(rows.reduce((sum, row) => sum + Number(row[measures.sebes] || 0), 0)),
    });
    const top = (rows, dim, measure = 'strok', limit = 12) => {
      const map = new Map();
      rows.forEach((row) => {
        const name = label(dim, row) || 'BLANK';
        map.set(name, (map.get(name) || 0) + Number(row[measures[measure]] || 0));
      });
      return [...map].sort((a, b) => b[1] - a[1]).slice(0, limit)
        .map(([name, value]) => `${name}: ${Math.round(value)}`).join('; ');
    };
    const monthPatterns = [/январ/, /феврал/, /март/, /апрел/, /(^|\s)ма[йея]?(\s|$)/, /июн/, /июл/, /август/, /сентябр/, /октябр/, /ноябр/, /декабр/];
    const monthNo = monthPatterns.findIndex((pattern) => pattern.test(query));
    const explicitYear = query.match(/20\d{2}/)?.[0];
    const latestYear = official.months.at(-1)?.slice(0, 4) || String(new Date().getFullYear());
    const targetMonth = monthNo >= 0 ? `${explicitYear || latestYear}-${String(monthNo + 1).padStart(2, '0')}` : '';
    const targetRegion = (official.labels.region || []).find((name) => query.includes(String(name).toLocaleLowerCase('ru-RU'))) || '';
    const targetDefect = (official.labels.defekt || []).find((name) => query.includes(String(name).toLocaleLowerCase('ru-RU'))) || '';
    const filterRows = (month = '', region = '', defect = '') => official.rows.filter((row) =>
      (!month || label('month', row) === month) &&
      (!region || label('region', row) === region) &&
      (!defect || label('defekt', row) === defect));
    const all = official.rows;
    const scoped = filterRows(targetMonth, targetRegion, targetDefect);
    const scopeBase = filterRows(targetMonth, targetRegion, '');
    const companyBase = filterRows(targetMonth, '', '');
    const scopedTotals = totals(scoped);
    const baseTotals = totals(scopeBase);
    const companyTotals = totals(companyBase);
    const share = (value, base) => base ? Math.round(value / base * 10000) / 100 : null;

    const current = await loadContour(state.contour);
    const currentContour = contourDef();
    const currentMeasure = measureOf(currentContour);
    const currentPoints = pointsOf(current, periodMonths(current));
    const currentRows = currentPoints.flatMap((point) => point.rows).filter((row) => matches(current, row));
    const currentTop = currentContour.dims.slice(0, 5).map((dim) => {
      const at = current.dimAt[dim.key];
      const mat = current.measureAt[currentMeasure.key];
      const map = new Map();
      currentRows.forEach((row) => {
        const name = current.labels[dim.key][row[at]] || 'BLANK';
        map.set(name, (map.get(name) || 0) + Number(row[mat] || 0));
      });
      return `${dim.label}: ${[...map].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => `${name}=${Math.round(value)}`).join('; ')}`;
    });

    return [
      'Методика: официальный набор содержит только строки признанного брака. Долю брака от всех продаж или операций по региону без отдельного знаменателя считать нельзя. Ниже доли означают долю региона/дефекта внутри официального брака.',
      `Запрошенный срез: месяц=${targetMonth || 'не указан'}, регион=${targetRegion || 'не указан'}, дефект=${targetDefect || 'не указан'}.`,
      `Итог запрошенного среза: ${JSON.stringify(scopedTotals)}.`,
      `Доля среза в базе региона/месяца: строки=${share(scopedTotals.строк, baseTotals.строк)}%, розница=${share(scopedTotals.розница_руб, baseTotals.розница_руб)}%, себестоимость=${share(scopedTotals.себестоимость_руб, baseTotals.себестоимость_руб)}%.`,
      `Доля среза в общем официальном браке за тот же месяц: строки=${share(scopedTotals.строк, companyTotals.строк)}%, розница=${share(scopedTotals.розница_руб, companyTotals.розница_руб)}%, себестоимость=${share(scopedTotals.себестоимость_руб, companyTotals.себестоимость_руб)}%.`,
      `Официальный брак — по месяцам, строки: ${top(all, 'month', 'strok', 18)}.`,
      `Официальный брак — по регионам, строки: ${top(filterRows(targetMonth), 'region')}.`,
      `Официальный брак — по дефектам, строки: ${top(scopeBase, 'defekt')}.`,
      `Официальный брак — по дефектам, себестоимость: ${top(scopeBase, 'defekt', 'sebes')}.`,
      `Официальный брак — топ товаров среза, строки: ${top(scoped, 'tovar', 'strok', 10)}.`,
      `Текущий экран: контур=${currentContour.name}; показатель=${currentMeasure.label}; период=${periodDef().label}; фильтры=${state.filters.map((item) => item.label).join(', ') || 'нет'}.`,
      ...currentTop,
    ].join('\n');
  };

  async function start() {
    setupRoadmapToggle();
    setupSearch();
    placeHeroSide();
    renderRoadmap();
    try {
      index = await fetch(DATA_DIR + 'index.json', { cache: 'no-cache' }).then((r) => r.json());
    } catch (error) {
      el('agStamp').textContent = 'не удалось загрузить данные';
      return;
    }
    // Мероприятия живут отдельным файлом: их правят руками в админке, а данные
    // контуров пересобираются по расписанию — смешивать эти два ритма незачем.
    try {
      const answer = await fetch(DATA_DIR + 'events.json', { cache: 'no-cache' });
      if (answer.ok) events = (await answer.json()).мероприятия || [];
    } catch { events = []; }

    const contour = contourDef();
    state.drillDim = contour.dims[0].key;
    state.heatDim = contour.dims[0].key;
    await render();

    // График рисуется в пикселях контейнера, поэтому при смене ширины окна его
    // надо пересобрать — иначе он останется от прежнего размера.
    let timer = null;
    window.addEventListener('resize', () => {
      placeHeroSide();
      clearTimeout(timer);
      timer = setTimeout(render, 200);
    });
  }

  start();
})();
