/* Паноптикум: департамент развития и его следы в складской системе.
 *
 * Данные готовит серверная задача task_people.py — она обходит все документные
 * таблицы WMS, где есть исполнитель, и складывает по человеку дни и виды
 * операций. Здесь только показ: дерево подразделений слева, карточка человека
 * справа.
 */
(() => {
  'use strict';

  const DATA = '../data/panopticum.json';
  const el = (id) => document.getElementById(id);
  const fmt = (value) => Math.round(value).toLocaleString('ru-RU');

  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  const SORTS = [
    { key: 'action', label: 'по действиям' },
    { key: 'days', label: 'по дням' },
    { key: 'name', label: 'по фамилии' },
  ];

  const state = { sort: 'action', search: '', picked: null, open: new Set() };
  let data = null;

  function escape(text) {
    return String(text ?? '').replace(/[&<>"]/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function dayLabel(iso) {
    const date = new Date(iso);
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }

  /** Человек проходит поиск, если слово встретилось в имени, роли или пути. */
  function hit(person) {
    if (!state.search) return true;
    const words = state.search.toLocaleLowerCase('ru-RU').split(/\s+/).filter(Boolean);
    const hay = [person.фио, person.должность, person.логин, person.город,
      ...(person.путь || [])].join(' ').toLocaleLowerCase('ru-RU');
    return words.every((word) => hay.includes(word));
  }

  function sorted(people) {
    const copy = [...people];
    if (state.sort === 'name') copy.sort((a, b) => (a.фио || '').localeCompare(b.фио || '', 'ru'));
    else if (state.sort === 'days') copy.sort((a, b) => b.дней - a.дней || b.всего - a.всего);
    else copy.sort((a, b) => b.всего - a.всего);
    return copy;
  }

  /* Дерево строим по пути из HR: первый уровень — ветка департамента, второй —
   * подразделение. Глубже не спускаемся: на экране это уже не читается, а
   * полный путь виден в карточке человека. */
  function grouped(people) {
    const tree = new Map();
    people.forEach((person) => {
      const branch = (person.путь && person.путь[0]) || 'Без подразделения';
      const unit = (person.путь && person.путь[1]) || '—';
      if (!tree.has(branch)) tree.set(branch, new Map());
      const units = tree.get(branch);
      if (!units.has(unit)) units.set(unit, []);
      units.get(unit).push(person);
    });
    return tree;
  }

  function sum(people, field) {
    return people.reduce((acc, person) => acc + (person[field] || 0), 0);
  }

  function renderStats() {
    const people = data.люди;
    const active = people.filter((person) => person.всего > 0);
    const total = sum(people, 'всего');
    el('pnStats').innerHTML = [
      ['людей в департаменте', fmt(people.length)],
      ['со следами в системе', fmt(active.length)],
      ['действий за период', fmt(total)],
      ['веток', String(grouped(people).size)],
    ].map(([label, value]) =>
      `<span class="pnStat"><b>${value}</b><small>${label}</small></span>`).join('');
  }

  function renderTree() {
    const box = el('pnTree');
    const people = data.люди.filter(hit);
    if (!people.length) {
      box.innerHTML = '<p class="pnEmpty">Никого не нашлось — попробуйте другое слово.</p>';
      return;
    }

    const tree = grouped(people);
    const branches = [...tree.entries()]
      .sort((a, b) => sum([...b[1].values()].flat(), 'всего') - sum([...a[1].values()].flat(), 'всего'));

    box.innerHTML = '';
    branches.forEach(([branch, units]) => {
      const staff = [...units.values()].flat();
      // При поиске ветки раскрыты: иначе человек вводит фамилию и видит
      // свёрнутые заголовки вместо ответа.
      const open = state.search ? true : state.open.has(branch);

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'pnBranch';
      head.setAttribute('aria-expanded', String(open));
      head.innerHTML = `<span class="pnBranch__arrow" aria-hidden="true">${open ? '▾' : '▸'}</span>`
        + `<span class="pnBranch__name">${escape(branch)}</span>`
        + `<span class="pnBranch__count">${staff.length} ${plural(staff.length, 'человек', 'человека', 'человек')}</span>`
        + `<span class="pnBranch__value">${fmt(sum(staff, 'всего'))}</span>`;
      head.addEventListener('click', () => {
        if (state.open.has(branch)) state.open.delete(branch); else state.open.add(branch);
        renderTree();
      });
      box.appendChild(head);
      if (!open) return;

      [...units.entries()]
        .sort((a, b) => sum(b[1], 'всего') - sum(a[1], 'всего'))
        .forEach(([unit, members]) => {
          const title = document.createElement('div');
          title.className = 'pnUnit';
          title.innerHTML = `<span>${escape(unit)}</span><span>${fmt(sum(members, 'всего'))}</span>`;
          box.appendChild(title);

          const peak = Math.max(...members.map((person) => person.всего), 1);
          sorted(members).forEach((person) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'pnPerson';
            row.setAttribute('aria-selected', String(state.picked === person.логин));
            const share = (person.всего / peak) * 100;
            row.innerHTML = `<span class="pnPerson__name">${escape(person.фио)}`
              + `<i>${escape(person.должность || '')}</i></span>`
              + `<span class="pnPerson__bar"><i style="--w:${share}%"></i></span>`
              + `<span class="pnPerson__value">${person.всего ? fmt(person.всего) : '—'}</span>`;
            row.addEventListener('click', () => {
              state.picked = person.логин;
              renderTree();
              renderCard(person);
            });
            box.appendChild(row);
          });
        });
    });
  }

  /** Полоски по дням: видно ритм — когда человек работал, когда его не было. */
  function calendar(person) {
    const days = Object.entries(person.по_дням || {});
    if (!days.length) return '<p class="pnEmpty">За период следов нет.</p>';
    const peak = Math.max(...days.map(([, value]) => value), 1);
    const bars = days.map(([day, value]) =>
      `<span class="pnDay" title="${dayLabel(day)} · ${fmt(value)}">`
      + `<i style="--h:${Math.max(4, (value / peak) * 100)}%"></i></span>`).join('');
    const first = days[0][0];
    const last = days[days.length - 1][0];
    return `<div class="pnDays">${bars}</div>`
      + `<div class="pnDays__legend"><span>${dayLabel(first)}</span>`
      + `<span>пик ${fmt(peak)} за день</span><span>${dayLabel(last)}</span></div>`;
  }

  function renderCard(person) {
    el('pnWho').textContent = person.фио || person.логин;
    el('pnWhere').textContent = [person.должность, ...(person.путь || [])]
      .filter(Boolean).join(' · ');

    const kinds = Object.entries(person.операции || {});
    const total = person.всего || 1;
    const rows = kinds.map(([name, value]) =>
      `<div class="pnKind"><span class="pnKind__name">${escape(name)}</span>`
      + `<span class="pnKind__bar"><i style="--w:${(value / total) * 100}%"></i></span>`
      + `<span class="pnKind__value">${fmt(value)}</span>`
      + `<span class="pnKind__share">${((value / total) * 100).toFixed(1).replace('.', ',')}%</span></div>`)
      .join('') || '<p class="pnEmpty">Операций не было.</p>';

    const perDay = person.дней ? Math.round(person.всего / person.дней) : 0;
    el('pnCard').innerHTML = `
      <div class="pnFacts">
        <div class="pnFact"><small>Действий</small><b>${fmt(person.всего)}</b></div>
        <div class="pnFact"><small>Дней с работой</small><b>${person.дней}</b></div>
        <div class="pnFact"><small>В среднем за день</small><b>${fmt(perDay)}</b></div>
        <div class="pnFact"><small>Логин</small><b class="pnFact__text">${escape(person.логин)}</b></div>
        <div class="pnFact"><small>Принят</small><b class="pnFact__text">${escape(person.принят || '—')}</b></div>
        <div class="pnFact"><small>Город</small><b class="pnFact__text">${escape(person.город || '—')}</b></div>
      </div>
      <h3 class="pnSub">Ритм по дням</h3>
      ${calendar(person)}
      <h3 class="pnSub">Чем занимался</h3>
      <div class="pnKinds">${rows}</div>`;
  }

  function segment() {
    const box = el('pnSort');
    box.innerHTML = '';
    SORTS.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.setAttribute('aria-pressed', String(item.key === state.sort));
      button.addEventListener('click', () => { state.sort = item.key; renderTree(); segment(); });
      box.appendChild(button);
    });
  }

  async function start() {
    try {
      data = await fetch(DATA, { cache: 'no-cache' }).then((answer) => answer.json());
    } catch (error) {
      el('pnTree').innerHTML = '<p class="pnEmpty">Не удалось загрузить данные.</p>';
      return;
    }

    // Самая крупная ветка раскрыта сразу — пустой экран объясняет меньше.
    const tree = grouped(data.люди);
    const biggest = [...tree.entries()]
      .sort((a, b) => sum([...b[1].values()].flat(), 'всего') - sum([...a[1].values()].flat(), 'всего'))[0];
    if (biggest) state.open.add(biggest[0]);

    renderStats();
    segment();
    renderTree();
    el('pnStamp').textContent = `Данные собраны ${data.обновлено}, период `
      + `${data.период.с} — ${data.период.по}. Источник — складская система.`;

    let timer = null;
    el('pnSearch').addEventListener('input', (event) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.search = event.target.value.trim(); renderTree(); }, 220);
    });
  }

  start();
})();
