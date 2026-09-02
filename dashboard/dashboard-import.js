(function () {
  'use strict';

  const STORAGE_KEY = 'anti-dashboard-imports-v1';
  const LABELS = {
    dmd: 'Движение брака ДМД',
    gen: 'Универсальные задания',
    akty: 'Акты расхождений',
    zabr: 'Забраковка'
  };

  const openButton = document.getElementById('import-open');
  const panel = document.getElementById('import-panel');
  const chooseButton = document.getElementById('import-choose');
  const closeButton = document.getElementById('import-close');
  const resetButton = document.getElementById('import-reset');
  const fileInput = document.getElementById('import-files');
  const status = document.getElementById('import-status');

  if (!openButton || typeof DATA === 'undefined') return;

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = 'import-status' + (kind ? ' ' + kind : '');
  }

  function replaceObject(target, source) {
    Object.keys(target).forEach(key => delete target[key]);
    Object.assign(target, source);
  }

  function readSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function restoreSaved() {
    const saved = readSaved();
    try {
      Object.keys(LABELS).forEach(key => {
        if (saved[key]) replaceObject(DATA[key], saved[key].data || saved[key]);
      });
      return saved;
    } catch (_) {
      return {};
    }
  }

  function saveSection(key, data, fileName) {
    const saved = readSaved();
    saved[key] = { data, fileName, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }

  function refreshControls() {
    F.dmd = F.gen = F.akty = F.zabr = '_all';
    fillSelect('f-dmd', D.weeks, w => 'неделя с ' + wkLab(w), 'все ' + D.weeks.length + ' недель');
    fillSelect('f-gen', G.months, moLab, 'весь период');
    fillSelect('f-akty', A.months, moLab, 'все ' + A.months.length + ' месяцев');
    fillSelect('f-zabr', Z.months, moLab, 'все ' + Z.months.length + ' месяцев');
    renderAll();
  }

  function showSavedState(saved) {
    const sections = Object.keys(LABELS).filter(key => saved[key]);
    if (!sections.length) return;
    const dates = sections.map(key => new Date(saved[key].updatedAt || 0)).filter(d => !isNaN(d));
    const latest = dates.length ? new Date(Math.max(...dates)).toLocaleString('ru-RU') : '';
    setStatus('Локально обновлено: ' + sections.map(key => LABELS[key]).join(', ') + (latest ? ' · ' + latest : ''), 'ok');
    const stamp = document.querySelector('.stamp');
    if (stamp) stamp.innerHTML += '<br><b>локальное обновление</b>';
  }

  const initialSaved = restoreSaved();
  refreshControls();
  showSavedState(initialSaved);

  openButton.onclick = () => { panel.hidden = !panel.hidden; };
  closeButton.onclick = () => { panel.hidden = true; };
  chooseButton.onclick = () => fileInput.click();
  resetButton.onclick = () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };

  fileInput.onchange = async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    chooseButton.disabled = true;
    resetButton.disabled = true;
    const done = [];
    const failed = [];
    const skipped = [];
    const candidates = {};
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatus('Читаю ' + file.name + ' (' + (i + 1) + ' из ' + files.length + ')…');
        await new Promise(resolve => setTimeout(resolve, 20));
        try {
          const result = await importFile(file, progress => setStatus(file.name + ': ' + progress));
          const previous = candidates[result.type];
          if (!previous || result.rows > previous.rows) {
            if (previous) skipped.push(previous.file.name + ' (' + LABELS[result.type] + ': меньше строк)');
            candidates[result.type] = { ...result, file };
          } else {
            skipped.push(file.name + ' (' + LABELS[result.type] + ': меньше строк)');
          }
        } catch (error) {
          failed.push(file.name + ': ' + error.message);
        }
      }
      Object.keys(candidates).forEach(type => {
        const candidate = candidates[type];
        replaceObject(DATA[type], candidate.data);
        saveSection(type, candidate.data, candidate.file.name);
        done.push(LABELS[type] + ' — ' + candidate.rows.toLocaleString('ru-RU') + ' строк');
      });
      refreshControls();
      if (failed.length) {
        setStatus('Обновлено: ' + (done.join(', ') || 'ничего') + '. Ошибки: ' + failed.join('; ') + (skipped.length ? '. Пропущены копии: ' + skipped.join('; ') : ''), 'error');
      } else {
        setStatus('Готово. Обновлено без дублей: ' + done.join(', ') + (skipped.length ? '. Пропущены неполные копии: ' + skipped.join('; ') : '') + '. Данные сохранены в этом браузере.', 'ok');
      }
    } finally {
      chooseButton.disabled = false;
      resetButton.disabled = false;
      fileInput.value = '';
    }
  };

  async function importFile(file, onProgress) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) return importCsv(file, onProgress);
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return importWorkbook(file, onProgress);
    throw new Error('поддерживаются только CSV, XLSX и XLS');
  }

  function norm(value) {
    return String(value == null ? '' : value).replace(/^\ufeff/, '').trim();
  }

  function number(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    const parsed = Number(String(value == null ? '' : value).replace(/\s/g, '').replace(',', '.'));
    return isFinite(parsed) ? parsed : 0;
  }

  function detectType(headers) {
    const set = new Set(headers.map(norm));
    if (set.has('srez') && set.has('Дата_недели') && set.has('рубли')) return 'dmd';
    if (set.has('rrc_rub') && set.has('sebes_rub') && set.has('tip_defekta')) return 'zabr';
    if (set.has('Тип задания') && set.has('Стоимость искомого, руб')) return 'gen';
    if (set.has('Виновник') && set.has('Себестоимость, руб')) return 'akty';
    throw new Error('не узнал структуру колонок');
  }

  function makeAccessor(headers) {
    const positions = {};
    headers.forEach((header, index) => { positions[norm(header)] = index; });
    return (row, name) => row[positions[name]];
  }

  async function importCsv(file, onProgress) {
    const sample = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    let decoder = new TextDecoder('utf-8');
    const preview = decoder.decode(sample);
    if ((preview.match(/\ufffd/g) || []).length > 3) decoder = new TextDecoder('windows-1251');
    const delimiter = detectDelimiter(preview.split(/\r?\n/, 1)[0]);
    let headers = null, type = null, consume = null, rows = 0;
    await parseCsvStream(file, decoder, delimiter, row => {
      if (!headers) {
        headers = row.map(norm);
        type = detectType(headers);
        consume = createAggregator(type, headers);
        return;
      }
      if (!row.some(cell => norm(cell))) return;
      consume.add(row);
      rows++;
      if (rows % 10000 === 0) onProgress(rows.toLocaleString('ru-RU') + ' строк…');
    });
    if (!consume || !rows) throw new Error('файл пустой');
    return { type, data: consume.finish(), rows };
  }

  function detectDelimiter(line) {
    const counts = [',', ';', '\t'].map(char => [char, (line.split(char).length - 1)]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] ? counts[0][0] : ',';
  }

  async function parseCsvStream(file, decoder, delimiter, onRow) {
    const reader = file.stream().getReader();
    let row = [], field = '', quoted = false, pendingQuote = false, pendingCR = false;
    function pushRow() { row.push(field); field = ''; onRow(row); row = []; }
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const text = decoder.decode(part.value, { stream: true });
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (pendingCR) { pendingCR = false; if (ch === '\n') continue; }
        if (pendingQuote) {
          pendingQuote = false;
          if (ch === '"') { field += '"'; continue; }
          quoted = false;
        }
        if (quoted) {
          if (ch === '"') pendingQuote = true;
          else field += ch;
        } else if (ch === '"' && field === '') quoted = true;
        else if (ch === delimiter) { row.push(field); field = ''; }
        else if (ch === '\r') { pushRow(); pendingCR = true; }
        else if (ch === '\n') pushRow();
        else field += ch;
      }
    }
    field += decoder.decode();
    if (pendingQuote) quoted = false;
    if (field.length || row.length) pushRow();
  }

  async function importWorkbook(file, onProgress) {
    if (typeof XLSX === 'undefined') throw new Error('модуль Excel не загрузился');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    if (!workbook.SheetNames.length) throw new Error('в книге нет листов');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    if (rows.length < 2) throw new Error('лист пустой');
    const headers = rows[0].map(norm);
    const type = detectType(headers);
    const consume = createAggregator(type, headers);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].some(cell => norm(cell))) consume.add(rows[i]);
      if (i % 10000 === 0) {
        onProgress(i.toLocaleString('ru-RU') + ' строк…');
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    return { type, data: consume.finish(), rows: rows.length - 1 };
  }

  function addPair(map, key, v, s) {
    key = norm(key) || '(не указано)';
    const current = map.get(key) || { v: 0, s: 0 };
    current.v += v; current.s += s; map.set(key, current);
  }

  function addCube(cube, period, key, v, s) {
    if (!cube.has(period)) cube.set(period, new Map());
    addPair(cube.get(period), key, v, s);
  }

  function mergePairs(target, source) {
    source.forEach((value, key) => addPair(target, key, value.v, value.s));
  }

  function pairList(map, limit) {
    return Array.from((map || new Map()).entries())
      .map(([k, value]) => ({ k, v: Math.round(value.v), s: Math.round(value.s) }))
      .sort((a, b) => b.v - a.v || b.s - a.s)
      .slice(0, limit || 50);
  }

  function finishCube(cube, periods, limit) {
    const result = {}, all = new Map();
    periods.forEach(period => {
      const values = cube.get(period) || new Map();
      result[period] = pairList(values, limit);
      mergePairs(all, values);
    });
    result._all = pairList(all, limit);
    return result;
  }

  function createAggregator(type, headers) {
    const get = makeAccessor(headers);
    if (type === 'dmd') return createDmdAggregator(get);
    if (type === 'gen') return createGenAggregator(get);
    if (type === 'akty') return createAktyAggregator(get);
    return createZabrAggregator(get);
  }

  function createDmdAggregator(get) {
    const weeks = new Map(), snapshots = new Map();
    const dimensions = [['tip', 'Тип'], ['zona', 'Локация_целевая'], ['cat', 'Категория_CD'], ['mu', 'МУ'], ['tovar', 'Товар']];
    return {
      add(row) {
        const date = norm(get(row, 'Дата_недели')).slice(0, 10);
        if (!date) return;
        const rub = number(get(row, 'рубли')), sht = number(get(row, 'шт'));
        if (norm(get(row, 'srez')).startsWith('1.')) {
          if (!snapshots.has(date)) snapshots.set(date, { rub: 0, sht: 0, cell: new Map() });
          const snap = snapshots.get(date); snap.rub += rub; snap.sht += sht;
          addPair(snap.cell, get(row, 'Ячейка_целевая'), rub, sht);
          return;
        }
        if (!weeks.has(date)) {
          const item = { rub: 0, sht: 0 };
          dimensions.forEach(([name]) => { item[name] = new Map(); });
          weeks.set(date, item);
        }
        const item = weeks.get(date); item.rub += rub; item.sht += sht;
        dimensions.forEach(([name, column]) => addPair(item[name], get(row, column), rub, sht));
      },
      finish() {
        const selected = Array.from(weeks.keys()).sort().slice(-13);
        const months = Array.from(new Set(selected.map(date => date.slice(0, 7))));
        const kpi = {}, cubes = {};
        dimensions.forEach(([name]) => { cubes[name] = new Map(); });
        let allRub = 0, allSht = 0;
        selected.forEach(date => {
          const item = weeks.get(date), month = date.slice(0, 7);
          kpi[date] = { rub: Math.round(item.rub), sht: Math.round(item.sht) };
          allRub += item.rub; allSht += item.sht;
          dimensions.forEach(([name]) => {
            if (!cubes[name].has(month)) cubes[name].set(month, new Map());
            mergePairs(cubes[name].get(month), item[name]);
          });
        });
        kpi._all = { rub: Math.round(allRub), sht: Math.round(allSht) };
        const latest = Array.from(snapshots.keys()).sort().pop();
        const snap = latest ? snapshots.get(latest) : { rub: 0, sht: 0, cell: new Map() };
        return {
          weeks: selected,
          vhod_rub: selected.map(date => Math.round(weeks.get(date).rub)),
          vhod_sht: selected.map(date => Math.round(weeks.get(date).sht)),
          kpi,
          ostatok_rub: Math.round(snap.rub),
          ostatok_sht: Math.round(snap.sht),
          ostatok_date: latest || selected[selected.length - 1],
          tip: finishCube(cubes.tip, months),
          zona: finishCube(cubes.zona, months),
          cell_ost: pairList(snap.cell),
          cat: finishCube(cubes.cat, months),
          mu: finishCube(cubes.mu, months),
          tovar: finishCube(cubes.tovar, months)
        };
      }
    };
  }

  function createGenAggregator(get) {
    const totals = new Map(), cubes = {};
    const dimensions = [['process', 'Тип задания'], ['zona', 'Зона'], ['ploshadka', 'Площадка'], ['reshenie', 'Решение'], ['ispolnitel', 'Исполнитель']];
    dimensions.forEach(([name]) => { cubes[name] = new Map(); });
    const people = new Set();
    return {
      add(row) {
        const month = norm(get(row, 'month_key'));
        if (!month) return;
        const rub = number(get(row, 'Стоимость искомого, руб'));
        const sht = number(get(row, 'Штук')), zad = number(get(row, 'Заданий'));
        const total = totals.get(month) || { rub: 0, n: 0, z: 0 };
        total.rub += rub; total.n += sht; total.z += zad; totals.set(month, total);
        dimensions.forEach(([name, column]) => addCube(cubes[name], month, get(row, column), rub, sht));
        const person = norm(get(row, 'Исполнитель'));
        if (person && person !== '(нет)' && person !== '(нет исполнения)') people.add(person);
      },
      finish() {
        const months = Array.from(totals.keys()).sort().slice(-12), kpi = {};
        const all = { rub: 0, n: 0, z: 0 };
        months.forEach(month => {
          const value = totals.get(month);
          kpi[month] = { rub: Math.round(value.rub), n: Math.round(value.n), z: Math.round(value.z) };
          all.rub += value.rub; all.n += value.n; all.z += value.z;
        });
        kpi._all = { rub: Math.round(all.rub), n: Math.round(all.n), z: Math.round(all.z) };
        return {
          months,
          by_month: months.map(month => Math.round(totals.get(month).n)),
          zad_month: months.map(month => Math.round(totals.get(month).z)),
          rub_month: months.map(month => Math.round(totals.get(month).rub)),
          kpi,
          process: finishCube(cubes.process, months),
          zona: finishCube(cubes.zona, months),
          ploshadka: finishCube(cubes.ploshadka, months),
          reshenie: finishCube(cubes.reshenie, months),
          ispolnitel: finishCube(cubes.ispolnitel, months),
          n_isp: people.size
        };
      }
    };
  }

  function createAktyAggregator(get) {
    const totals = new Map(), cubes = {};
    const dimensions = [['vinovnyj', 'Виновник'], ['chelovek', 'Виновник, человек'], ['zavel', 'Завёл акт'], ['ish', 'Зона-источник'], ['cel', 'Зона-получатель']];
    dimensions.forEach(([name]) => { cubes[name] = new Map(); });
    cubes.route = new Map();
    return {
      add(row) {
        const month = norm(get(row, 'month_key'));
        if (!month) return;
        const rub = number(get(row, 'Себестоимость, руб')), sht = number(get(row, 'Штук'));
        const akt = number(get(row, 'Актов'));
        const linked = norm(get(row, 'Связь с забраковкой')) === 'связан с забраковкой' ? sht : 0;
        const total = totals.get(month) || { rub: 0, sht: 0, akt: 0, linked: 0 };
        total.rub += rub; total.sht += sht; total.akt += akt; total.linked += linked; totals.set(month, total);
        dimensions.forEach(([name, column]) => addCube(cubes[name], month, get(row, column), rub, sht));
        addCube(cubes.route, month, norm(get(row, 'Зона-источник')) + ' → ' + norm(get(row, 'Зона-получатель')), rub, sht);
      },
      finish() {
        const months = Array.from(totals.keys()).sort().slice(-13), kpi = {}, all = { rub: 0, sht: 0, akt: 0, linked: 0 };
        months.forEach(month => {
          const value = totals.get(month), svyaz = value.sht ? value.linked / value.sht * 100 : 0;
          kpi[month] = { rub: Math.round(value.rub), sht: Math.round(value.sht), akt: Math.round(value.akt), svyaz: Math.round(svyaz) };
          Object.keys(all).forEach(key => { all[key] += value[key]; });
        });
        kpi._all = { rub: Math.round(all.rub), sht: Math.round(all.sht), akt: Math.round(all.akt), svyaz: Math.round(all.sht ? all.linked / all.sht * 100 : 0) };
        return {
          months,
          sht: months.map(month => Math.round(totals.get(month).sht)),
          akt: months.map(month => Math.round(totals.get(month).akt)),
          rub: months.map(month => Math.round(totals.get(month).rub)),
          svyaz_pct: months.map(month => Math.round((totals.get(month).sht ? totals.get(month).linked / totals.get(month).sht * 100 : 0) * 10) / 10),
          kpi,
          vinovnyj: finishCube(cubes.vinovnyj, months),
          chelovek: finishCube(cubes.chelovek, months),
          zavel: finishCube(cubes.zavel, months),
          ish: finishCube(cubes.ish, months),
          cel: finishCube(cubes.cel, months),
          route: finishCube(cubes.route, months)
        };
      }
    };
  }

  function createZabrAggregator(get) {
    const totals = new Map(), weekTotals = new Map(), cubes = {};
    const dimensions = [['vid', 'vid_tochki'], ['defekt', 'tip_defekta'], ['cat', 'napravlenie'], ['gruppa', 'gruppa'], ['region', 'region'], ['pol', 'poluchatel'], ['mu', 'model_ucheta'], ['sektor', 'sektor_istochnik']];
    dimensions.forEach(([name]) => { cubes[name] = new Map(); });
    const heat = new Map();
    return {
      add(row) {
        const month = norm(get(row, 'month_key')), week = norm(get(row, 'week_start_date')).slice(0, 10);
        if (!month) return;
        const strok = number(get(row, 'strok')), rrc = number(get(row, 'rrc_rub')), seb = number(get(row, 'sebes_rub'));
        const total = totals.get(month) || { strok: 0, rrc: 0, seb: 0 };
        total.strok += strok; total.rrc += rrc; total.seb += seb; totals.set(month, total);
        if (week) {
          const wt = weekTotals.get(week) || { strok: 0, rrc: 0 };
          wt.strok += strok; wt.rrc += rrc; weekTotals.set(week, wt);
        }
        dimensions.forEach(([name, column]) => addCube(cubes[name], month, get(row, column), rrc, strok));
        addPair(heat, norm(get(row, 'vid_tochki')) + '\u0000' + norm(get(row, 'tip_defekta')), rrc, strok);
      },
      finish() {
        const months = Array.from(totals.keys()).sort().slice(-13), kpi = {}, all = { strok: 0, rrc: 0, seb: 0 };
        months.forEach(month => {
          const value = totals.get(month);
          kpi[month] = { rrc: Math.round(value.rrc), seb: Math.round(value.seb), n: Math.round(value.strok) };
          all.strok += value.strok; all.rrc += value.rrc; all.seb += value.seb;
        });
        kpi._all = { rrc: Math.round(all.rrc), seb: Math.round(all.seb), n: Math.round(all.strok) };
        const weeksByMonth = {}, weekRrc = {}, weekStrok = {};
        months.forEach(month => {
          weeksByMonth[month] = Array.from(weekTotals.keys()).filter(week => week.slice(0, 7) === month).sort();
          weeksByMonth[month].forEach(week => {
            weekRrc[week] = Math.round(weekTotals.get(week).rrc);
            weekStrok[week] = Math.round(weekTotals.get(week).strok);
          });
        });
        return {
          months,
          strok: months.map(month => Math.round(totals.get(month).strok)),
          rrc: months.map(month => Math.round(totals.get(month).rrc)),
          sebes: months.map(month => Math.round(totals.get(month).seb)),
          weeks_by_month: weeksByMonth,
          week_rrc: weekRrc,
          week_strok: weekStrok,
          kpi,
          vid: finishCube(cubes.vid, months),
          defekt: finishCube(cubes.defekt, months),
          cat: finishCube(cubes.cat, months),
          gruppa: finishCube(cubes.gruppa, months),
          region: finishCube(cubes.region, months),
          pol: finishCube(cubes.pol, months),
          mu: finishCube(cubes.mu, months),
          sektor: finishCube(cubes.sektor, months),
          heat: Array.from(heat.entries()).map(([key, value]) => {
            const parts = key.split('\u0000');
            return { x: parts[0], y: parts[1], v: Math.round(value.v), s: Math.round(value.s) };
          }).sort((a, b) => b.v - a.v)
        };
      }
    };
  }
})();
