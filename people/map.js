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
  let picked = null;      // выбранная зона
  let hovered = null;     // человек под курсором в списке
  let pinned = null;      // человек, выбранный кликом: на телефоне наведения нет
  let mergedMap = new Map();  // зона -> узел, под которым она показана

  const stageOf = (zone) => (STAGES.find((stage) => stage.test.test(zone)) || STAGES[3]).key;

  /** Один проход по всем следам: отдаёт маршруты «откуда → куда». */
  function walk(only, fn) {
    payload.группы.forEach((group) => {
      group.люди.forEach((person) => {
        Object.entries(person.месяцы).forEach(([key, data]) => {
          if (only && key !== only) return;
          data.рельсы.forEach((rail) => {
            rail.виды.forEach((item) => {
              const parts = String(item.вид).split(" · ");
              const route = parts.length > 1 ? parts[1] : "";
              if (!route.includes(" → ")) return;
              const [from, to] = route.split(" → ").map((value) => value.trim());
              fn(from, to, item, person);
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
    });

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

  /** Сколько действий у каждого города за выбранный месяц. */
  function cityTotals() {
    const totals = new Map();
    walk(month, (from, to, item) => {
      const key = cityOf.get(from) || cityOf.get(to);
      if (!key) return;
      totals.set(key, (totals.get(key) || 0) + item.действий);
    });
    return totals;
  }

  /** Считает потоки и людей по зонам выбранного города за выбранный месяц. */
  function collect() {
    const edges = new Map();
    const zones = new Map();
    const staff = new Map();   // зона -> Map(фио -> действий)

    walk(month, (from, to, item, person) => {
      if (cityOf.get(from) !== city && cityOf.get(to) !== city) return;
      const key = `${from}\u0000${to}`;
      const edge = edges.get(key) || { from, to, actions: 0, items: 0 };
      edge.actions += item.действий;
      edge.items += item.штук;
      edges.set(key, edge);
      [from, to].forEach((zone) => {
        if (cityOf.get(zone) !== city) return;
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

  function draw() {
    const { nodes, edges } = collect();
    const { placed, merged, lanes, W, H } = layout(nodes);
    mergedMap = merged;
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
      .flow { fill: none; opacity: .3; }
      .flow.on { opacity: .95; }
      .flow.off { opacity: .06; }
      .dot { cursor: pointer; }
      .dot.off { opacity: .18; }
    `;
    svg.appendChild(style);

    lanes.forEach((stage, index) => {
      add("text", { x: COL_W * index + COL_W / 2, y: 30, class: "lane", "text-anchor": "middle" })
        .textContent = stage.name.toUpperCase();
    });

    // Потоки рисуем первыми, чтобы кружки зон лежали поверх.
    const maxFlow = Math.max(...edges.map((edge) => edge.actions), 1);
    const flows = add("g", {});
    edges.forEach((edge) => {
      const a = at(edge.from);
      const b = at(edge.to);
      if (!a || !b || a === b || edge.actions < maxFlow * 0.012) return;
      const mid = (a.x + b.x) / 2;
      const path = add("path", {
        d: `M${a.x},${a.y} C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}`,
        stroke: STAGE_COLORS[a.stage],
        "stroke-width": Math.max(1.5, 18 * (edge.actions / maxFlow)),
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
      });
    });

    // Клик по пустому месту снимает выбор — иначе на телефоне из зоны не выйти.
    svg.addEventListener("click", () => {
      if (!picked && !pinned) return;
      picked = null;
      pinned = null;
      draw();
    });

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

  /** Панель справа: кто работает в выбранной зоне или общий расклад. */
  function renderSide(placed) {
    const box = el("plMapSide");
    if (!picked) {
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
      });
    });
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

  function segment(box, items, current, pick) {
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
      button.addEventListener("click", () => pick(item.key));
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
        picked = null;
        renderMonths();
        renderCities();
        draw();
      },
    );
  }

  function renderCities() {
    const box = el("plMapCities");
    if (!box) return;
    const totals = cityTotals();
    const items = CITY_ORDER.filter((key) => totals.get(key))
      .map((key) => ({
        key,
        label: (CITIES.find((item) => item.key === key) || {}).name || key,
        note: count(totals.get(key)),
      }));
    // Если в выбранном месяце города нет — уходим в самый крупный.
    if (!items.some((item) => item.key === city) && items.length) {
      city = [...totals.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    segment(box, items, city, (key) => {
      city = key;
      picked = null;
      renderCities();
      draw();
    });
  }

  fetch(DATA_URL, { cache: "no-cache" })
    .then((response) => response.json())
    .then((data) => {
      payload = data;
      month = data.месяцы[data.месяцы.length - 1] || "";
      classify();
      host.hidden = false;
      renderMonths();
      renderCities();
      draw();
    })
    .catch(() => { host.hidden = true; });
})();
