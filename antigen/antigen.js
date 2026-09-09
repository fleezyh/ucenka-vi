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
        { key: 'rrc', label: '₽ розница', kind: 'money' },
        { key: 'sebes', label: '₽ себестоимость', kind: 'money' },
        { key: 'strok', label: 'строк', kind: 'int' },
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
    measure: 'rrc',
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
  };

  const cache = new Map();
  let index = null;
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
  const fmt = (value, kind) => (kind === 'money' ? fmtMoney(value) : fmtInt(value));
  const fmtSigned = (value, kind) =>
    (value > 0 ? '+' : value < 0 ? '−' : '') + fmt(Math.abs(value), kind);
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
          + `<span class="agContour__id">#${contour.chart}</span>`;
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

    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Динамика периода">`
      + '<defs><linearGradient id="agFill" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="#4d8df7" stop-opacity=".26"></stop>'
      + '<stop offset="100%" stop-color="#4d8df7" stop-opacity="0"></stop></linearGradient></defs>'
      + ticks + `<path class="agArea" d="${area}"></path><path class="agLine" d="${line}"></path>`
      + trend + dots + labels + axis + '</svg>';

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
    const now = values.reduce((a, b) => a + b, 0);
    const beforeMonths = period.months ? periodMonths(data, 1) : [];
    const before = beforeMonths.length
      ? total(data, pointsOf(data, beforeMonths).flatMap((p) => p.rows), measure.key) : 0;
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
        label: 'за период',
        value: fmt(now, measure.kind),
        note: `${points.length} ${plural(points.length, 'точка', 'точки', 'точек')}`
          + ` · пик ${fmt(Math.max(...values), measure.kind)}`,
      },
    ];

    cards.forEach((card) => {
      const item = document.createElement('div');
      item.className = 'agFact' + (card.tone ? ` agFact--${card.tone}` : '');
      item.innerHTML = `<span>${escape(card.label)}</span><strong>${card.value}</strong><small>${escape(card.note)}</small>`;
      box.appendChild(item);
    });
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
      month, fact: sum, daysInMonth,
      day: `${String(built.getDate()).padStart(2, '0')} ${MONTHS_SHORT[built.getMonth()]}`,
      forecast: covered > 0.5 ? Math.round((sum / covered) * daysInMonth) : null,
    };
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

    const monthName = (key) => `${MONTHS_SHORT[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;
    box.hidden = false;
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
      + `<span class="agGoals__gap">до Точки Б <b>${fmtSigned(gap, 'int')}</b></span>`;
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
    const header = document.createElement('div');
    header.className = 'agRow agRow--head';
    header.innerHTML = `<span></span><span class="agRow__name">${label} · ${rows.length}</span>`
      + '<span class="agRow__bar"></span>'
      + `<span class="agRow__val">${measure.label}</span>`
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

  async function render() {
    const contour = contourDef();
    renderContours();
    segment(el('agMeasure'), contour.measures, state.measure, (key) => { state.measure = key; render(); });

    segment(el('agPeriod'), PERIODS, state.period, (key) => { state.period = key; state.point = null; render(); });
    segment(el('agStep'), STEPS, state.step, (key) => { state.step = key; state.point = null; render(); });

    const data = await loadContour(state.contour);
    buildSearchSet(data);
    renderSearch(data);
    const points = pointsOf(data, periodMonths(data));
    if (state.point && !points.some((p) => p.key === state.point)) state.point = null;
    const measure = measureOf(contour);
    const values = points.map((point) => total(data, point.rows, measure.key));

    el('agTimeTitle').textContent = contour.name;
    renderGoals(data);
    renderChart(data, contour, points, values);
    renderFacts(data, contour, points, values);
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
