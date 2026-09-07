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
        { key: 'napr', label: 'направление' },
        { key: 'gruppa', label: 'группа товара' },
        { key: 'defekt', label: 'тип дефекта' },
        { key: 'mu', label: 'модель учёта' },
        { key: 'region', label: 'регион' },
      ],
      // Номенклатуры в витрине приёмки нет вовсе — она заканчивается на группе
      // товара. Товар живёт в контуре движения, поэтому из тупика предлагаем
      // перейти туда, сохранив период и совпадающие фильтры.
      productBridge: { contour: 'dmd', carry: { napr: 'cat', gruppa: 'cat' } },
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

  const monthOf = (week) => week.slice(0, 7);
  const quarterOf = (week) => `${week.slice(0, 4)}-Q${Math.floor(Number(week.slice(5, 7) - 1) / 3) + 1}`;
  const yearOf = (week) => week.slice(0, 4);

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

    const prepared = { ...payload, dimAt, measureAt, byWeek };
    cache.set(key, prepared);
    return prepared;
  }

  const contourDef = () => CONTOURS.find((c) => c.key === state.contour);

  const periodDef = () => PERIODS.find((p) => p.key === state.period);

  /** Недели периода: считаем от последней недели контура календарными месяцами. */
  function periodWeeks(data, shift = 0) {
    const period = periodDef();
    if (!period.months) return shift ? [] : data.weeks;
    const last = data.weeks[data.weeks.length - 1];
    const anchor = new Date(last + 'T00:00:00');
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1 - period.months * shift, 1);
    const from = new Date(anchor.getFullYear(), anchor.getMonth() + 1 - period.months * (shift + 1), 1);
    // Дату собираем по частям: toISOString переводит в UTC и в нашем поясе
    // сдвигает границу на день назад — последняя неделя периода пропадала.
    const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-`
      + `${String(date.getDate()).padStart(2, '0')}`;
    return data.weeks.filter((week) => week >= iso(from) && week < iso(to));
  }

  /** Сколько понедельников в календарном месяце или квартале ключа. */
  function mondaysIn(key) {
    const year = Number(key.slice(0, 4));
    const first = key.includes('Q') ? (Number(key.slice(6)) - 1) * 3 : Number(key.slice(5)) - 1;
    const months = key.includes('Q') ? 3 : 1;
    let count = 0;
    for (let m = first; m < first + months; m += 1) {
      const days = new Date(year, m + 1, 0).getDate();
      for (let day = 1; day <= days; day += 1) {
        if (new Date(year, m, day).getDay() === 1) count += 1;
      }
    }
    return count;
  }

  /** Точки оси по выбранному шагу. */
  function pointsOf(weeks) {
    if (state.step === 'week') {
      return weeks.map((week) => ({
        key: week,
        label: weekTitle(week).split(' — ')[0],
        title: weekTitle(week),
        weeks: [week],
        partial: false,
      }));
    }
    const groups = new Map();
    weeks.forEach((week) => {
      const key = state.step === 'month' ? monthOf(week) : quarterOf(week);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(week);
    });
    return [...groups.entries()].map(([key, list]) => ({
      key,
      label: state.step === 'month'
        ? `${MONTHS_SHORT[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}`
        : `${ROMAN[Number(key.slice(6)) - 1]} кв ${key.slice(2, 4)}`,
      title: state.step === 'month'
        ? `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`
        : `${ROMAN[Number(key.slice(6)) - 1]} квартал ${key.slice(0, 4)}`,
      weeks: list,
      // Крайние месяцы и кварталы истории собраны не целиком: без пометки они
      // выглядят как обвал, хотя это просто нехватка недель в выгрузке.
      partial: list.length < mondaysIn(key),
    }));
  }

  function matches(data, row) {
    return state.filters.every(({ dim, label }) =>
      data.labels[dim] && data.labels[dim][row[data.dimAt[dim]]] === label);
  }

  function total(data, weeks, measure) {
    const at = data.measureAt[measure];
    let sum = 0;
    weeks.forEach((week) => {
      (data.byWeek.get(week) || []).forEach((row) => { if (matches(data, row)) sum += row[at]; });
    });
    return sum;
  }

  function breakdown(data, weeks, dim, measure) {
    const at = data.measureAt[measure];
    const dimIdx = data.dimAt[dim];
    const names = data.labels[dim];
    const totals = new Map();
    weeks.forEach((week) => {
      (data.byWeek.get(week) || []).forEach((row) => {
        if (!matches(data, row)) return;
        const name = names[row[dimIdx]];
        totals.set(name, (totals.get(name) || 0) + row[at]);
      });
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

  function renderContours() {
    const box = el('agContours');
    box.innerHTML = '';
    CONTOURS.forEach((contour) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'agContour';
      button.setAttribute('aria-selected', String(contour.key === state.contour));
      button.innerHTML = `<span class="agContour__name">${contour.name}</span>`
        + `<span class="agContour__note">${contour.note}</span>`
        + `<span class="agContour__id">#${contour.chart}</span>`;
      button.addEventListener('click', () => switchContour(contour.key, []));
      box.appendChild(button);
    });
  }

  function switchContour(key, filters) {
    const contour = CONTOURS.find((c) => c.key === key);
    state.contour = key;
    state.measure = contour.measures[0].key;
    state.filters = filters || [];
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
    const beforeWeeks = period.months ? periodWeeks(data, 1) : [];
    const before = beforeWeeks.length ? total(data, beforeWeeks, measure.key) : 0;
    // Месяцы бывают из четырёх и пяти недель: без этой оговорки «+30%» читается
    // как рост брака, хотя это лишняя неделя в периоде.
    const nowWeeks = points.reduce((acc, point) => acc + point.weeks.length, 0);
    const unevenNote = before && nowWeeks !== beforeWeeks.length
      ? ` · ${nowWeeks} недель против ${beforeWeeks.length}` : '';
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

  function renderGoals() {
    const box = el('agGoals');
    if (state.contour !== 'zabr') { box.hidden = true; return; }
    const trajectory = index.control.trajectory || [];
    const fact = [...trajectory].reverse().find((row) => row.fact);
    const target = [...trajectory].reverse().find((row) => row.point_b);
    if (!fact || !target) { box.hidden = true; return; }

    const gap = fact.fact - target.point_b;
    const span = Math.max(fact.fact - target.goal, 1);
    box.hidden = false;
    box.innerHTML = '<span class="agGoals__label">зафиксировано</span>'
      + `<span class="agGoals__item"><b>${fmtInt(fact.fact)}</b><span>актов · ${
        MONTHS_SHORT[Number(fact.month.slice(5)) - 1]} ${fact.month.slice(0, 4)}</span></span>`
      + `<span class="agGoals__track" style="--w:${((fact.fact - target.point_b) / span) * 100}%;--goal:100%">`
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
    const perPoint = points.map((point) => breakdown(data, point.weeks, state.heatDim, measure.key));
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
    const dims = el('agDims');
    dims.innerHTML = '';
    const used = new Set(state.filters.map((f) => f.dim));
    const open = contour.dims.filter((dim) => !used.has(dim.key));
    if (!open.some((dim) => dim.key === state.drillDim)) state.drillDim = open.length ? open[0].key : null;

    open.forEach((dim) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'agDim';
      chip.textContent = dim.label;
      chip.setAttribute('aria-selected', String(dim.key === state.drillDim));
      chip.addEventListener('click', () => { state.drillDim = dim.key; render(); });
      dims.appendChild(chip);
    });

    const box = el('agTable');
    box.innerHTML = '';

    if (!state.drillDim) {
      const bridge = contour.productBridge;
      const note = document.createElement('div');
      note.className = 'agEmpty';
      note.innerHTML = 'Разрезы этого контура кончились. '
        + (bridge ? 'Номенклатуры в витрине приёмки нет — товар и бренд живут в контуре движения.' : '');
      box.appendChild(note);
      if (bridge) {
        const carry = state.filters
          .filter((f) => bridge.carry[f.dim])
          .map((f) => ({ dim: bridge.carry[f.dim], label: f.label }));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'agBtn';
        button.textContent = 'Посмотреть товары в движении брака';
        button.addEventListener('click', () => switchContour(bridge.contour, carry));
        box.appendChild(button);
      }
      return;
    }

    const measure = measureOf(contour);
    const current = state.point ? points.find((p) => p.key === state.point) : null;
    const scope = current ? current.weeks : points.flatMap((p) => p.weeks);
    const totals = breakdown(data, scope, state.drillDim, measure.key);

    const baseline = new Map();
    if (current) {
      const position = points.indexOf(current);
      const history = points.slice(Math.max(0, position - 4), position);
      const maps = history.map((point) => breakdown(data, point.weeks, state.drillDim, measure.key));
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
      + `<span class="agRow__delta">${current ? 'к медиане' : 'доля'}</span>`;
    table.appendChild(header);

    const sum = rows.reduce((acc, row) => acc + row.value, 0) || 1;
    const peak = rows[0].value || 1;
    rows.slice(0, 40).forEach((row, i) => {
      const item = document.createElement('button');
      item.type = 'button';
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
        + `<span class="agRow__name" title="${escape(row.name)}">${escape(row.name)}</span>`
        + `<span class="agRow__bar"><i style="--w:${(row.value / peak) * 100}%"></i></span>`
        + `<span class="agRow__val">${fmt(row.value, measure.kind)}</span>`
        + `<span class="agRow__delta ${tone}">${right}</span>`;
      item.addEventListener('click', () => {
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
      const measure = measureOf(contour);
      const current = state.point ? points.find((p) => p.key === state.point) : null;
      const scope = new Set(current ? current.weeks : points.flatMap((p) => p.weeks));

      // Лист 1 — строки среза как есть, с человеческими заголовками и числами
      // числами, чтобы в Excel сразу считались суммы и сводные.
      const detail = [];
      data.rows.forEach((row) => {
        const week = data.labels.week[row[data.dimAt.week]];
        if (!scope.has(week) || !matches(data, row)) return;
        const item = {};
        data.dims.forEach((dim) => { item[dimTitle(contour, dim)] = data.labels[dim][row[data.dimAt[dim]]]; });
        data.measures.forEach((m) => { item[measureTitle(contour, m)] = row[data.measureAt[m]]; });
        detail.push(item);
      });

      // Лист 2 — свод по текущему разрезу: то же, что видно в таблице на экране.
      const summary = [];
      if (state.drillDim) {
        const totals = breakdown(data, current ? current.weeks : points.flatMap((p) => p.weeks),
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
        const perPoint = points.map((point) => breakdown(data, point.weeks, state.heatDim, measure.key));
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
    const points = pointsOf(periodWeeks(data));
    if (state.point && !points.some((p) => p.key === state.point)) state.point = null;
    const measure = measureOf(contour);
    const values = points.map((point) => total(data, point.weeks, measure.key));

    el('agTimeTitle').textContent = contour.name;
    renderGoals();
    renderChart(data, contour, points, values);
    renderFacts(data, contour, points, values);
    renderHeat(data, contour, points);
    renderCrumbs(contour, points);
    renderTable(data, contour, points);

    el('agStamp').innerHTML = `данные: <b>WMS · DWH</b><br>собрано: <b>${index.built.slice(0, 16).replace('T', ' ')}</b>`
      + `<br>история: <b>${data.weeks.length} ${plural(data.weeks.length, 'неделя', 'недели', 'недель')}</b>`;
    el('agSuperset').href = `${SUPERSET}/explore/?slice_id=${contour.chart}`;
    el('agExport').onclick = () => exportXlsx(data, contour, points);
  }

  async function start() {
    setupRoadmapToggle();
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
      clearTimeout(timer);
      timer = setTimeout(render, 200);
    });
  }

  start();
})();
