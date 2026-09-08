/* Карта склада: куда течёт товар и кто его двигает.
 *
 * Из следов в WMS видно не только «кто сколько сделал», но и маршруты: каждое
 * перемещение записано как «зона-источник → зона-получатель». Если сложить их,
 * получается схема потока — вход, столы, контроль, хранение, отгрузка — а люди
 * ложатся на неё сами: у каждого видно, в каких зонах он работает.
 *
 * Складов семь, и они не связаны между собой: за месяц ни одного перемещения
 * между городами. Поэтому карта рисуется по одному городу — иначе почти три
 * сотни зон складываются в паутину, где ничего не прочитать, а в городе их
 * десяток-другой и всё помещается в человеческий размер.
 *
 * Модуль самостоятельный: читает тот же people.json и рисует свою секцию, в
 * людскую таблицу не лезет. */
(() => {
  "use strict";

  const DATA_URL = "../data/people.json";
  const SVG = "http://www.w3.org/2000/svg";
  const TOP_ZONES = 34;

  // Этапы: зона попадает в колонку по тому, что в её названии. Порядок колонок
  // и есть порядок работы — от входа к отгрузке.
  const STAGES = [
    { key: "in", name: "Вход", test: /вход|поступлен|приём|приемк/i },
    { key: "work", name: "Столы и обработка", test: /стол|обработк|переупак|разбор/i },
    { key: "check", name: "Контроль", test: /контрол|ок\b|провер|инвент/i },
    { key: "keep", name: "Хранение и буферы", test: /хранени|буфер|ячейк|некомплект|брак\b|зона брака/i },
    { key: "out", name: "Выход", test: /отгрузк|списан|утилиз|самовывоз|перемещение фб|магазин|рц\b/i },
  ];
  const STAGE_COLORS = { in: "#4d8df7", work: "#27c46b", check: "#f5ad32", keep: "#a985ff", out: "#f05d72" };

  /* Город зоны — по метке в названии. Порядок важен: «004 Отгрузка ДОМОДЕДОВО
     ЧШК» — это Чашниково, которое отгружает в Домодедово, поэтому ДМД проверяем
     последним, когда ни одна другая метка не подошла. */
  const CITIES = [
    { key: "ЧШК", name: "Чашниково", test: /ЧШК|ЧАШНИКОВО|Чашниково/i },
    { key: "СПБ", name: "Санкт-Петербург", test: /СПБ/i },
    { key: "ЕКБ", name: "Екатеринбург", test: /ЕКБ/i },
    { key: "КАЗ", name: "Казань", test: /КАЗ/i },
    { key: "НСК", name: "Новосибирск", test: /НСК|Петухова/i },
    { key: "РНД", name: "Ростов-на-Дону", test: /РНД/i },
    { key: "ДМД", name: "Домодедово", test: /ДМД|Домодедово|ДАНИЛОВО|Данилово/i },
  ];
  const CITY_ORDER = ["ДМД", "ЧШК", "СПБ", "КАЗ", "ЕКБ", "НСК", "РНД"];

  const el = (id) => document.getElementById(id);
  const count = (value) => Math.round(Number(value) || 0).toLocaleString("ru-RU");
  const host = el("plMap");
  if (!host) return;

  let payload = null;
  let month = "";
  let city = "ДМД";
  let team = "";          // отдел или смена; пусто — все
  let query = "";         // поиск человека по фамилии
  let picked = null;      // выбранная зона
  let hovered = null;     // человек под курсором в списке
  let pinned = null;      // человек, выбранный кликом: на телефоне наведения нет
  let mergedMap = new Map();  // зона -> узел, под которым она показана
  let lastPlaced = new Map(); // последняя раскладка: панель рисуется по ней

  const stageOf = (zone) => (STAGES.find((stage) => stage.test.test(zone)) || STAGES[3]).key;

  /** Один проход по следам: отдаёт маршруты «откуда → куда».
   *  `only` — месяц (пусто: все), отдел берётся из выбранного фильтра, но при
   *  разметке городов его надо отключать — там нужны все зоны сразу. */
  function walk(only, fn, allTeams = false) {
    payload.группы.forEach((group) => {
      if (!allTeams && team && group.имя !== team) return;
      group.люди.forEach((person) => {
        Object.entries(person.месяцы).forEach(([key, data]) => {
          if (only && key !== only) return;
          data.рельсы.forEach((rail) => {
            rail.виды.forEach((item) => {
              const parts = String(item.вид).split(" · ");
              const route = parts.length > 1 ? parts[1] : "";
              if (!route.includes(" → ")) return;
              const [from, to] = route.split(" → ").map((value) => value.trim());
              fn(from, to, item, person, group);
            });
          });
        });
      });
    });
  }

  /* Город зоны. Часть зон метки не носит — «Столы Предсорта», «001 Вход в ФБ»,
     буквенные ячейки, — но город у них всё равно один: тот, с чьими зонами они
     обмениваются товаром. Поэтому размеченные зоны раздают город соседям по
     самому толстому потоку, пока не разойдётся по всем. */
  const cityOf = new Map();

  function classify() {
    const flows = new Map();
    const zones = new Set();
    walk("", (from, to, item) => {
      zones.add(from);
      zones.add(to);
      if (from === to) return;
      const key = `${from}\u0000${to}`;
      const found = flows.get(key) || { from, to, actions: 0 };
      found.actions += item.действий;
      flows.set(key, found);
    }, true);

    zones.forEach((zone) => {
      const found = CITIES.find((item) => item.test.test(zone));
      if (found) cityOf.set(zone, found.key);
    });

    const pairs = [...flows.values()];

    for (let pass = 0; pass < 8; pass += 1) {
      let changed = false;
      zones.forEach((zone) => {
        if (cityOf.has(zone)) return;
        const votes = new Map();
        pairs.forEach((pair) => {
          const other = pair.from === zone ? pair.to : pair.to === zone ? pair.from : null;
          if (!other) return;
          const known = cityOf.get(other);
          if (known) votes.set(known, (votes.get(known) || 0) + pair.actions);
        });
        if (!votes.size) return;
        cityOf.set(zone, [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0]);
        changed = true;
      });
      if (!changed) break;
    }

    // Что так и не определилось — головной склад: там живут все безымянные зоны.
    zones.forEach((zone) => { if (!cityOf.has(zone)) cityOf.set(zone, "ДМД"); });
  }

  /** Куб «склад × отдел» за выбранный месяц: из него считаются обе линейки
   *  кнопок. Склады считаются с учётом выбранного отдела, отделы — с учётом
   *  выбранного склада, так что числа на кнопках всегда про то, что увидишь. */
  function cube() {
    const grid = new Map();
    walk(month, (from, to, item, person, group) => {
      const key = cityOf.get(from) || cityOf.get(to);
      if (!key) return;
      const id = `${key}|${group.имя}`;
      grid.set(id, (grid.get(id) || 0) + item.действий);
    }, true);
    return grid;
  }

  function totalsBy(grid, axis) {
    const totals = new Map();
    grid.forEach((actions, id) => {
      const [cityKey, teamKey] = id.split("|");
      if (axis === "city" && team && teamKey !== team) return;
      if (axis === "team" && city && cityKey !== city) return;
      const key = axis === "city" ? cityKey : teamKey;
      totals.set(key, (totals.get(key) || 0) + actions);
    });
    return totals;
  }

  /** Считает потоки и людей по зонам выбранного города за выбранный месяц. */
  function collect() {
    const edges = new Map();
    const zones = new Map();
    const staff = new Map();   // зона -> Map(фио -> действий)

    walk(month, (from, to, item, person) => {
      if (city && cityOf.get(from) !== city && cityOf.get(to) !== city) return;
      const key = `${from}\u0000${to}`;
      const edge = edges.get(key) || { from, to, actions: 0, items: 0 };
      edge.actions += item.действий;
      edge.items += item.штук;
      edges.set(key, edge);
      [from, to].forEach((zone) => {
        if (city && cityOf.get(zone) !== city) return;
        zones.set(zone, (zones.get(zone) || 0) + item.действий);
        if (!staff.has(zone)) staff.set(zone, new Map());
        const people = staff.get(zone);
        people.set(person.фио, (people.get(person.фио) || 0) + item.действий);
      });
    });

    const top = [...zones.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_ZONES);
    const keep = new Set(top.map(([zone]) => zone));
    const name = (zone) => (keep.has(zone) ? zone : "· прочие зоны");

    const merged = new Map();
    edges.forEach((edge) => {
      const from = name(edge.from);
      const to = name(edge.to);
      const key = `${from}\u0000${to}`;
      const found = merged.get(key) || { from, to, actions: 0, items: 0 };
      found.actions += edge.actions;
      found.items += edge.items;
      merged.set(key, found);
    });

    const nodes = new Map();
    zones.forEach((value, zone) => {
      const label = name(zone);
      const node = nodes.get(label) || { zone: label, actions: 0, staff: new Map() };
      node.actions += value;
      (staff.get(zone) || new Map()).forEach((actions, who) => {
        node.staff.set(who, (node.staff.get(who) || 0) + actions);
      });
      nodes.set(label, node);
    });

    return { nodes, edges: [...merged.values()].filter((edge) => edge.from !== edge.to) };
  }

  /* Раскладка: колонка — этап, внутри колонки зоны по объёму.
     Размеры считаются от содержимого, а не подгоняются под фиксированный холст:
     пустые этапы колонку не занимают, а высота растёт от числа зон. Так кружки
     и подписи остаются одного размера в любом городе — что в Домодедово с его
     восемью десятками зон, что в Ростове с десятком. */
  const PER_COLUMN = 9;
  const COL_W = 268;      // ширина колонки этапа
  const ROW_H = 152;      // шаг между зонами по вертикали
  const LABEL_H = 70;     // две строки названия и число под кружком
  const PAD_TOP = 74;     // место под подписи этапов
  const PAD_BOTTOM = 54;  // место под подпись и число нижней зоны

  function layout(nodes) {
    const columns = new Map(STAGES.map((stage) => [stage.key, []]));
    [...nodes.values()].forEach((node) => {
      const stage = node.zone === "· прочие зоны" ? "keep" : stageOf(node.zone);
      columns.get(stage).push(node);
    });

    const placed = new Map();
    const merged = new Map();   // зона -> под каким узлом она показана
    const lanes = STAGES.filter((stage) => columns.get(stage.key).length);
    const rows = [];

    lanes.forEach((stage) => {
      let list = columns.get(stage.key).sort((a, b) => b.actions - a.actions);
      if (list.length > PER_COLUMN) {
        const rest = list.slice(PER_COLUMN - 1);
        const bag = {
          zone: `· ещё ${rest.length} ${plural(rest.length, "зона", "зоны", "зон")}`,
          actions: rest.reduce((sum, node) => sum + node.actions, 0),
          staff: new Map(),
        };
        rest.forEach((node) => {
          merged.set(node.zone, bag.zone);
          node.staff.forEach((value, who) => bag.staff.set(who, (bag.staff.get(who) || 0) + value));
        });
        list = list.slice(0, PER_COLUMN - 1).concat(bag);
      }
      rows.push(list.length);
      columns.set(stage.key, list);
    });

    const W = COL_W * lanes.length;
    const H = PAD_TOP + PAD_BOTTOM + ROW_H * Math.max(...rows, 1);
    const max = Math.max(...[...nodes.values()].map((node) => node.actions), 1);

    lanes.forEach((stage, index) => {
      const list = columns.get(stage.key);
      const span = H - PAD_TOP - PAD_BOTTOM;
      const gap = span / list.length;
      // Под кружком живут две строки подписи и число — это LABEL_H пикселей.
      // Если колонка плотная, кружок ужимаем, иначе подпись ляжет на соседа.
      const limit = Math.max(11, (gap - LABEL_H) / 2);
      list.forEach((node, position) => {
        placed.set(node.zone, {
          ...node,
          x: COL_W * index + COL_W / 2,
          y: PAD_TOP + gap * (position + 0.5),
          r: Math.min(15 + 27 * Math.sqrt(node.actions / max), limit),
          stage: stage.key,
        });
      });
    });
    return { placed, merged, lanes, W, H };
  }

  function plural(count, one, few, many) {
    const n = Math.abs(count) % 100;
    if (n > 10 && n < 20) return many;
    const last = n % 10;
    return last === 1 ? one : last >= 2 && last <= 4 ? few : many;
  }

  /** Короткая подпись зоны: без ведущего номера и без имени выбранного города.
   *
   * Убираем только свой город: чужой в названии — это адрес, куда товар уходит
   * («СЦ - РНД Отправка некомплектов в ДМД»), и без него строка врёт. После
   * вычёркивания подчищаем осиротевший дефис от «СЦ - РНД». */
  const CITY_ALIAS = {
    ДМД: ["ДМД", "ДОМОДЕДОВО"],
    ЧШК: ["ЧШК", "ЧАШНИКОВО"],
    СПБ: ["СПБ"], ЕКБ: ["ЕКБ"], КАЗ: ["КАЗ"], НСК: ["НСК"], РНД: ["РНД"],
  };

  function shorten(zone) {
    const drop = CITY_ALIAS[city] || [];
    const short = zone.replace(/^\d+\s+/, "")
      .split(" ")
      .filter((word) => !drop.includes(word.replace(/[()]/g, "").toUpperCase()))
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*-\s*$/, "")
      .trim();
    return short || zone;
  }

  /** Подпись зоны в две строки: длинные названия целиком, без многоточия. */
  function wrap(text, limit) {
    const words = text.split(" ");
    const lines = [""];
    words.forEach((word) => {
      const line = lines[lines.length - 1];
      if (!line) lines[lines.length - 1] = word;
      else if (line.length + 1 + word.length <= limit) lines[lines.length - 1] = `${line} ${word}`;
      else lines.push(word);
    });
    if (lines.length > 2) {
      const tail = lines.slice(1).join(" ");
      return [lines[0], tail.length > limit ? `${tail.slice(0, limit - 1)}…` : tail];
    }
    return lines;
  }

  function draw(animate = false) {
    const { nodes, edges } = collect();
    const { placed, merged, lanes, W, H } = layout(nodes);
    mergedMap = merged;
    lastPlaced = placed;
    const at = (zone) => placed.get(merged.get(zone) || zone);
    const svg = el("plMapDraw");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    // Холст не растягиваем на всю ширину панели: у маленького города колонок
    // три, и раздутые до края кружки выглядят нелепо. И не даём сжиматься ниже
    // читаемого: на телефоне схема уезжает вбок в прокрутку, а не в кашу.
    svg.style.maxWidth = `${W}px`;
    svg.style.setProperty("--map-min", `${Math.min(W, lanes.length * 210)}px`);
    svg.replaceChildren();

    const add = (tag, attrs, parent) => {
      const node = document.createElementNS(SVG, tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
      (parent || svg).appendChild(node);
      return node;
    };

    const style = document.createElementNS(SVG, "style");
    style.textContent = `
      .lane { fill: #8f9cad; font: 600 15px "VI Sans", system-ui, sans-serif; letter-spacing: .1em; }
      .zn { font: 600 15px "VI Sans", system-ui, sans-serif; fill: #dfe7f2; }
      .zv { font: 600 14px "VI Sans", system-ui, sans-serif; fill: #8f9cad; }
      .flow { fill: none; opacity: .34; transition: opacity .25s ease; }
      .flow.on { opacity: 1; filter: drop-shadow(0 0 6px currentColor); }
      .flow.off { opacity: .05; }
      .dot { cursor: pointer; transition: opacity .25s ease; }
      .dot.off { opacity: .16; }
      .dot circle { transition: r .3s cubic-bezier(.2,.8,.3,1), fill-opacity .25s ease; }
      .dot:hover circle { fill-opacity: .62; }
      .halo { animation: pulse 2.4s ease-out infinite; transform-box: fill-box; transform-origin: center; }
      @keyframes pulse { 0% { opacity: .5; transform: scale(1); } 70%, 100% { opacity: 0; transform: scale(1.9); } }
      .draw .flow { animation: dash .9s ease-out both; }
      .draw .dot { animation: fade .5s ease-out both; }
      @keyframes dash { from { stroke-dasharray: 1; stroke-dashoffset: 1; } to { stroke-dasharray: 1; stroke-dashoffset: 0; } }
      @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) {
        .draw .flow, .draw .dot, .halo { animation: none; }
      }
    `;
    svg.appendChild(style);
    // Появление рисуем только при смене среза: при выборе зоны перерисовка
    // идёт постоянно, и мигать на каждый клик было бы издевательством.
    svg.classList.toggle("draw", Boolean(animate));

    const defs = add("defs", {});

    lanes.forEach((stage, index) => {
      add("text", { x: COL_W * index + COL_W / 2, y: 30, class: "lane", "text-anchor": "middle" })
        .textContent = stage.name.toUpperCase();
    });

    // Потоки рисуем первыми, чтобы кружки зон лежали поверх.
    const maxFlow = Math.max(...edges.map((edge) => edge.actions), 1);
    const flows = add("g", {});
    let flowId = 0;
    edges.forEach((edge) => {
      const a = at(edge.from);
      const b = at(edge.to);
      if (!a || !b || a === b || edge.actions < maxFlow * 0.012) return;
      const mid = (a.x + b.x) / 2;
      // Поток перетекает из цвета зоны-источника в цвет зоны-приёмника: по
      // одной линии видно, между какими этапами он идёт, даже когда их много.
      const id = `fl${flowId += 1}`;
      const gradient = add("linearGradient", {
        id, gradientUnits: "userSpaceOnUse", x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      }, defs);
      add("stop", { offset: "0%", "stop-color": STAGE_COLORS[a.stage] }, gradient);
      add("stop", { offset: "100%", "stop-color": STAGE_COLORS[b.stage] }, gradient);
      const path = add("path", {
        d: `M${a.x},${a.y} C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}`,
        stroke: `url(#${id})`,
        color: STAGE_COLORS[b.stage],
        "stroke-width": Math.max(1.5, 18 * (edge.actions / maxFlow)),
        "stroke-linecap": "round",
        "pathLength": 1,
        class: "flow",
      }, flows);
      path.dataset.from = a.zone;
      path.dataset.to = b.zone;
      const title = document.createElementNS(SVG, "title");
      title.textContent = `${edge.from} → ${edge.to}\n${count(edge.actions)} движений · ${count(edge.items)} штук`;
      path.appendChild(title);
    });

    placed.forEach((node) => {
      const group = add("g", { class: "dot" });
      group.dataset.zone = node.zone;
      if (node.zone === picked) {
        add("circle", { cx: node.x, cy: node.y, r: node.r + 6, fill: "none",
                        stroke: STAGE_COLORS[node.stage], "stroke-width": 2, class: "halo" }, group);
      }
      add("circle", { cx: node.x, cy: node.y, r: node.r, fill: STAGE_COLORS[node.stage],
                      "fill-opacity": node.zone === picked ? 0.9 : 0.34,
                      stroke: STAGE_COLORS[node.stage], "stroke-width": node.zone === picked ? 3 : 2 }, group);
      // Город из подписи убираем: он и так выбран сверху, а строка короче.
      // Отдельным словом — «(ДМД)», «СПБ», «Домодедово»; внутри «СЦ-ДМД» город
      // трогать нельзя, там он отличает сортцентр от фулфилмента.
      const short = shorten(node.zone);
      const lines = wrap(short, 20);
      lines.forEach((line, index) => {
        add("text", { x: node.x, y: node.y + node.r + 20 + index * 17, class: "zn", "text-anchor": "middle" }, group)
          .textContent = line;
      });
      add("text", { x: node.x, y: node.y + node.r + 20 + lines.length * 17, class: "zv", "text-anchor": "middle" }, group)
        .textContent = count(node.actions);
      const title = document.createElementNS(SVG, "title");
      title.textContent = `${node.zone}\n${count(node.actions)} действий · ${node.staff.size} человек`;
      group.appendChild(title);
      group.addEventListener("click", (event) => {
        event.stopPropagation();
        picked = picked === node.zone ? null : node.zone;
        pinned = null;
        draw();
        writeHash();
      });
    });

    // Клик по пустому месту снимает выбор — иначе на телефоне из зоны не выйти.
    svg.onclick = () => {
      if (!picked && !pinned) return;
      picked = null;
      pinned = null;
      draw();
      writeHash();
    };

    highlight();
    renderSide(placed);
  }

  /** Подсветка: выбранная зона и всё, что с ней связано; либо зоны человека.
   *  Человек может быть под курсором или закреплён кликом — на телефоне
   *  наведения нет, а посмотреть, где он ходит, хочется так же. */
  function highlight() {
    const svg = el("plMapDraw");
    const person = pinned || hovered;
    const zonesOfPerson = new Set();
    if (person) {
      person.zones.forEach((zone) => zonesOfPerson.add(mergedMap.get(zone) || zone));
    }
    svg.querySelectorAll(".flow").forEach((path) => {
      const { from, to } = path.dataset;
      let on = true;
      if (picked) on = from === picked || to === picked;
      if (person) on = zonesOfPerson.has(from) || zonesOfPerson.has(to);
      path.classList.toggle("on", Boolean((picked || person) && on));
      path.classList.toggle("off", Boolean((picked || person) && !on));
    });
    svg.querySelectorAll(".dot").forEach((dot) => {
      const zone = dot.dataset.zone;
      let on = true;
      if (picked) on = zone === picked || [...svg.querySelectorAll(".flow.on")]
        .some((path) => path.dataset.from === zone || path.dataset.to === zone);
      if (person) on = zonesOfPerson.has(zone);
      dot.classList.toggle("off", Boolean((picked || person) && !on));
    });
  }

  const renderSideFromMap = () => renderSide(lastPlaced);

  /** Панель справа: поиск человека, люди выбранной зоны или общий расклад. */
  function renderSide(placed) {
    const box = el("plMapSide");

    // Поиск идёт по всем людям направления, а не только по выбранному складу:
    // человека ищут по фамилии, а не по тому, где он сегодня работал.
    if (query.length >= 2) {
      const needle = query.toLowerCase();
      const found = [...personIndex.entries()]
        .filter(([who]) => who.toLowerCase().includes(needle))
        .map(([who, item]) => {
          const total = monthsOf(item.person).reduce((sum, [, data]) => sum + (data.всего || 0), 0);
          return { who, item, total };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);

      box.innerHTML = found.length
        ? found.map(({ who, item, total }) => `<button class="plMapRow plMapRow--person`
          + `${pinned && pinned.who === who ? " is-on" : ""}" data-who="${who}">`
          + `<span class="plMapName">${who}<em>${item.group.имя}</em></span>`
          + `<b>${total ? count(total) : "—"}</b></button>`).join("")
        : '<p class="plMapHint">Никого не нашлось.</p>';
      if (pinned) box.insertAdjacentHTML("beforeend", personCard(pinned.who));
      bindPeople(box, placed);
      return;
    }

    if (!picked) {
      if (pinned) {
        box.innerHTML = `<p class="plMapHint">Подсвечено, где ходит выбранный человек. `
          + `Клик по пустому месту схемы — снять.</p>${personCard(pinned.who)}`;
        return;
      }
      const all = [...placed.values()].sort((a, b) => b.actions - a.actions).slice(0, 8);
      box.innerHTML = '<p class="plMapHint">Клик по зоне — кто в ней работает. '
        + 'Клик по человеку — где он ходит.</p>'
        + all.map((node) => `<div class="plMapRow"><span class="plMapDot" style="background:${STAGE_COLORS[node.stage]}"></span>`
          + `<span class="plMapName">${node.zone}</span><b>${count(node.actions)}</b></div>`).join("");
      return;
    }
    const node = placed.get(picked);
    const people = [...node.staff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
    const total = [...node.staff.values()].reduce((sum, value) => sum + value, 0) || 1;
    box.innerHTML = `<p class="plMapPicked">${node.zone}<span>${count(node.actions)} действий · ${node.staff.size} человек</span></p>`
      + people.map(([who, actions]) => `<button class="plMapRow plMapRow--person`
        + `${pinned && pinned.who === who ? " is-on" : ""}" data-who="${who}">`
        + `<span class="plMapName">${who}</span><b>${count(actions)}</b>`
        + `<i style="--w:${(actions / total) * 100}%"></i></button>`).join("");

    if (pinned) box.insertAdjacentHTML("beforeend", personCard(pinned.who));
    bindPeople(box, placed);
  }

  function bindPeople(box, placed) {
    box.querySelectorAll(".plMapRow--person").forEach((row) => {
      const who = row.dataset.who;
      row.addEventListener("mouseenter", () => {
        if (pinned) return;
        hovered = { who, zones: zonesOf(who) };
        highlight();
      });
      row.addEventListener("mouseleave", () => {
        if (pinned) return;
        hovered = null;
        highlight();
      });
      row.addEventListener("click", () => {
        pinned = pinned && pinned.who === who ? null : { who, zones: zonesOf(who) };
        hovered = null;
        renderSide(placed);
        highlight();
        writeHash();
      });
    });
  }

  /* ---- Декомпозиция человека -------------------------------------------
     Клик по строке в панели раскрывает того же человека вглубь: когда он
     выходил и в какие часы, сколько делал в день, в каких зонах и каких
     городах оставил след, из чего сложились его действия. Всё это уже лежит
     в people.json — на странице этого просто не было видно. */

  const personIndex = new Map();

  function indexPeople() {
    payload.группы.forEach((group) => {
      group.люди.forEach((person) => personIndex.set(person.фио, { person, group }));
    });
  }

  /** Месяцы человека, попавшие в выбранный период. */
  const monthsOf = (person) => Object.entries(person.месяцы)
    .filter(([key]) => !month || key === month)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));

  function personStats(who) {
    const found = personIndex.get(who);
    if (!found) return null;
    const months = monthsOf(found.person);
    const days = [];
    const zones = new Map();
    const kinds = new Map();
    let actions = 0;
    let shifts = 0;
    let items = 0;

    months.forEach(([, data]) => {
      actions += data.всего || 0;
      shifts += data.смен || 0;
      (data.дни || []).forEach((day) => days.push(day));
      (data.рельсы || []).forEach((rail) => {
        items += rail.штук || 0;
        rail.виды.forEach((item) => {
          const label = `${rail.рельс} · ${String(item.вид).split(" · ")[0]}`;
          kinds.set(label, (kinds.get(label) || 0) + item.действий);
          const parts = String(item.вид).split(" · ");
          if (parts.length < 2 || !parts[1].includes(" → ")) return;
          parts[1].split(" → ").forEach((zone) => {
            const name = zone.trim();
            zones.set(name, (zones.get(name) || 0) + item.действий);
          });
        });
      });
    });

    days.sort((a, b) => (a.день < b.день ? -1 : 1));
    return { ...found, actions, shifts, items, days, zones, kinds };
  }

  /** Ритм смен: по дню — отрезок от первого до последнего часа работы.
   *  Ночные смены, переработки и провалы видно одним взглядом, а высота
   *  столбика снизу — сколько человек за этот день сделал. */
  function rhythm(days) {
    if (!days.length) return "";
    const W = 320;
    const H = 158;
    const top = 18;
    const hours = 88;      // поле часов
    const bars = 34;       // столбики объёма под ним
    const max = Math.max(...days.map((day) => day.всего), 1);
    const y = (hour) => top + hours * (1 - (hour - 5) / 19);   // шкала 5:00–24:00

    // Ось — календарь, а не только рабочие дни: иначе пропуски схлопываются и
    // график выходов выглядит сплошным.
    const found = new Map(days.map((day) => [day.день, day]));
    const first = new Date(`${days[0].день}T00:00:00`);
    const last = new Date(`${days[days.length - 1].день}T00:00:00`);
    const axis = [];
    for (let cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
      const key = cursor.toISOString().slice(0, 10);
      axis.push({ key, date: new Date(cursor), day: found.get(key) });
    }

    const step = W / axis.length;
    const width = Math.max(2.5, Math.min(9, step - 2.5));

    const weekend = axis.map((item, index) => (item.date.getDay() % 6 ? "" :
      `<rect x="${step * index}" y="${top - 8}" width="${step}" height="${H - top + 8}" fill="rgba(255,255,255,.03)"/>`)).join("");

    // Подписи часов держим над линией у самого края: столбики начинаются
    // правее, поэтому цифры ни на что не наезжают.
    const grid = [8, 14, 20].map((hour) => `<line x1="22" x2="${W}" y1="${y(hour)}" y2="${y(hour)}"`
      + ` stroke="rgba(255,255,255,.07)"/><text x="0" y="${y(hour) + 3}" class="plRh__h">${hour}:00</text>`).join("");

    const shift = axis.map((item, index) => {
      const day = item.day;
      const x = step * index + step / 2;
      // День без выхода — короткая риска у базовой линии: пустое место читается
      // хуже, чем явная отметка «в этот день его не было».
      if (!day || !day.часы) {
        return `<line x1="${x}" x2="${x}" y1="${top + hours}" y2="${top + hours + 4}"`
          + ` stroke="rgba(255,255,255,.16)" stroke-width="${Math.min(width, 5)}" stroke-linecap="round"/>`;
      }
      const [from, to] = day.часы;
      const a = y(Math.max(5, Math.min(24, from)));
      const b = y(Math.max(5, Math.min(24, to + 1)));
      const heat = 0.4 + 0.6 * (day.всего / max);
      return `<line x1="${x}" x2="${x}" y1="${Math.min(a, b)}" y2="${Math.max(a, b)}"`
        + ` stroke="#4d8df7" stroke-opacity="${heat.toFixed(2)}" stroke-width="${width}"`
        + ` stroke-linecap="round"><title>${day.день} · ${from}:00–${to + 1}:00 · ${count(day.всего)} действий</title></line>`;
    }).join("");

    const volume = axis.map((item, index) => {
      if (!item.day) return "";
      const x = step * index + step / 2;
      const height = Math.max(2, bars * (item.day.всего / max));
      return `<rect x="${x - width / 2}" y="${H - height}" width="${width}" height="${height}"`
        + ` rx="2" fill="#27c46b" fill-opacity=".8"><title>${item.day.день} · ${count(item.day.всего)}</title></rect>`;
    }).join("");

    const marks = axis.map((item, index) => (item.date.getDate() % 5 ? "" :
      `<text x="${step * index + step / 2}" y="${H - bars - 6}" class="plRh__d" text-anchor="middle">${item.date.getDate()}</text>`)).join("");

    return `<svg class="plRh" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`
      + `${weekend}${grid}${shift}${marks}${volume}</svg>`;
  }

  function bars(map, limit, color) {
    const list = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    const max = Math.max(...list.map(([, value]) => value), 1);
    return list.map(([name, value]) => `<div class="plBar">`
      + `<span class="plBar__name">${name}</span><b>${count(value)}</b>`
      + `<i style="--w:${(value / max) * 100}%;--c:${color}"></i></div>`).join("");
  }

  /** Месяц к месяцу: столбик — действия, точка — сколько за смену.
   *  Объём может вырасти просто потому, что человек выходил чаще, — поэтому
   *  рядом с ним всегда идёт выработка за смену. */
  function months(person) {
    const list = Object.entries(person.месяцы).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (list.length < 2) return "";
    const max = Math.max(...list.map(([, data]) => data.всего || 0), 1);
    const maxRate = Math.max(...list.map(([, data]) => data.за_смену || 0), 1);
    const W = 320;
    const H = 84;
    const step = W / list.length;

    const bars = list.map(([key, data], index) => {
      const height = Math.max(2, 52 * ((data.всего || 0) / max));
      const x = step * index + step / 2;
      const on = key === month;
      return `<rect x="${x - Math.min(26, step / 2 - 6)}" y="${62 - height}"`
        + ` width="${Math.min(52, step - 12)}" height="${height}" rx="3"`
        + ` fill="${on ? "#4d8df7" : "#4d8df7"}" fill-opacity="${on ? 0.95 : 0.3}">`
        + `<title>${key} · ${count(data.всего)} действий · ${count(data.смен)} смен</title></rect>`
        + `<text x="${x}" y="${H - 4}" class="plRh__d" text-anchor="middle">${key.slice(5)}</text>`;
    }).join("");

    const dots = list.map(([, data], index) => {
      const x = step * index + step / 2;
      const y = 62 - 52 * ((data.за_смену || 0) / maxRate);
      return `<circle cx="${x}" cy="${y}" r="3" fill="#f5ad32"/>`;
    }).join("");

    const line = list.map(([, data], index) => {
      const x = step * index + step / 2;
      const y = 62 - 52 * ((data.за_смену || 0) / maxRate);
      return `${index ? "L" : "M"}${x},${y}`;
    }).join(" ");

    return `<p class="plCard__cap">Месяц к месяцу · <span class="plKey plKey--b">объём</span>`
      + ` и <span class="plKey plKey--y">за смену</span></p>`
      + `<svg class="plRh plRh--m" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`
      + `${bars}<path d="${line}" fill="none" stroke="#f5ad32" stroke-opacity=".55" stroke-width="1.5"/>${dots}</svg>`;
  }

  function personCard(who) {
    const stats = personStats(who);
    if (!stats) return "";
    const perShift = stats.shifts ? Math.round(stats.actions / stats.shifts) : 0;
    const cities = new Map();
    stats.zones.forEach((value, zone) => {
      const key = cityOf.get(zone) || "?";
      cities.set(key, (cities.get(key) || 0) + value);
    });
    // Доля считается от суммы по зонам, а не от действий: у перемещения две
    // зоны, откуда и куда, и по действиям сумма вышла бы за сто процентов.
    const touched = [...cities.values()].reduce((sum, value) => sum + value, 0) || 1;
    const spread = [...cities.entries()].sort((a, b) => b[1] - a[1])
      .map(([key, value]) => `${key} ${Math.round((value / touched) * 100)}%`).join(" · ");

    return `<div class="plCard">
      <p class="plCard__who">${who}<span>${stats.person.должность} · ${stats.group.имя}`
      + `${stats.person.принят ? ` · с ${stats.person.принят}` : ""}</span></p>
      <div class="plCard__nums">
        <span><b>${count(stats.actions)}</b>действий</span>
        <span><b>${count(stats.shifts)}</b>смен</span>
        <span><b>${count(perShift)}</b>за смену</span>
        <span><b>${count(stats.items)}</b>штук</span>
      </div>
      <p class="plCard__cap">Когда выходил и сколько делал${spread ? ` · ${spread}` : ""}</p>
      ${rhythm(stats.days)}
      ${months(stats.person)}
      <p class="plCard__cap">Где работал</p>
      ${bars(stats.zones, 6, "#a985ff")}
      <p class="plCard__cap">Из чего сложились действия</p>
      ${bars(stats.kinds, 5, "#4d8df7")}
    </div>`;
  }

  /** В каких зонах человек оставил след за выбранный месяц. */
  function zonesOf(who) {
    const zones = new Set();
    walk(month, (from, to, item, person) => {
      if (person.фио !== who) return;
      zones.add(from);
      zones.add(to);
    });
    return zones;
  }

  function segment(box, items, current, onPick) {
    box.replaceChildren();
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plSeg__item" + (item.key === current ? " is-on" : "");
      button.setAttribute("aria-pressed", item.key === current ? "true" : "false");
      button.textContent = item.label;
      if (item.note) {
        const note = document.createElement("em");
        note.textContent = item.note;
        button.appendChild(note);
      }
      button.addEventListener("click", () => onPick(item.key));
      box.appendChild(button);
    });
  }

  function renderMonths() {
    segment(
      el("plMapMonths"),
      [{ key: "", label: "всё время" }, ...payload.месяцы.map((key) => ({ key, label: key }))],
      month,
      (key) => {
        month = key;
        pick(null);
      },
    );
  }

  /** Обе линейки и схема пересчитываются вместе: числа на кнопках должны
   *  показывать ровно тот срез, который откроется по клику. */
  function renderFilters() {
    const grid = cube();
    const cities = totalsBy(grid, "city");
    const teams = totalsBy(grid, "team");
    const total = [...cities.values()].reduce((sum, value) => sum + value, 0);

    const cityItems = [{ key: "", label: "все склады", note: count(total) }].concat(
      CITY_ORDER.filter((key) => cities.get(key)).map((key) => ({
        key,
        label: (CITIES.find((item) => item.key === key) || {}).name || key,
        note: count(cities.get(key)),
      })),
    );
    // Склада может не быть в выбранном месяце или у выбранного отдела.
    if (!cityItems.some((item) => item.key === city)) city = "";

    const teamItems = [{ key: "", label: "все отделы", note: count(total) }].concat(
      payload.группы.filter((group) => teams.get(group.имя)).map((group) => ({
        key: group.имя,
        label: group.имя,
        note: count(teams.get(group.имя)),
      })),
    );
    if (!teamItems.some((item) => item.key === team)) team = "";

    segment(el("plMapCities"), cityItems, city, (key) => { city = key; pick(null); });
    segment(el("plMapTeams"), teamItems, team, (key) => { team = key; pick(null); });
  }

  /** Смена среза: выбор зоны и человека сбрасываем — они были про прошлый. */
  function pick(zone) {
    picked = zone;
    pinned = null;
    hovered = null;
    renderMonths();
    renderFilters();
    draw(true);
    writeHash();
  }

  /* Срез живёт в адресе: так его можно кинуть ссылкой — «посмотри вот на эту
     зону в Казани за август» — и открыть ровно то же самое. */
  let hashLock = false;

  function writeHash() {
    if (hashLock) return;
    const parts = [];
    if (month) parts.push(`month=${month}`);
    if (city) parts.push(`city=${city}`);
    if (team) parts.push(`team=${team}`);
    if (picked) parts.push(`zone=${encodeURIComponent(picked)}`);
    if (pinned) parts.push(`who=${encodeURIComponent(pinned.who)}`);
    const hash = parts.length ? `#${parts.join("&")}` : "";
    if (hash !== location.hash) history.replaceState(null, "", `${location.pathname}${hash}`);
  }

  function readHash() {
    const raw = location.hash.replace(/^#/, "");
    if (!raw) return false;
    const params = new URLSearchParams(raw);
    if (params.has("month")) month = params.get("month");
    if (params.has("city")) city = params.get("city");
    if (params.has("team")) team = params.get("team");
    hashLock = true;
    pick(params.get("zone") || null);
    hashLock = false;
    const who = params.get("who");
    if (who && picked) {
      pinned = { who, zones: zonesOf(who) };
      renderSideFromMap();
      highlight();
    }
    writeHash();
    return true;
  }

  fetch(DATA_URL, { cache: "no-cache" })
    .then((response) => response.json())
    .then((data) => {
      payload = data;
      month = data.месяцы[data.месяцы.length - 1] || "";
      classify();
      indexPeople();
      const find = el("plMapFind");
      if (find) {
        find.addEventListener("input", () => {
          query = find.value.trim();
          renderSideFromMap();
          highlight();
        });
      }
      host.hidden = false;
      // Сначала адрес: pick() сам переписывает хэш, и вызванный до чтения он
      // затирал бы срез из ссылки.
      if (!readHash()) pick(null);
    })
    .catch(() => { host.hidden = true; });
})();
