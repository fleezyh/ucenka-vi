(() => {
  "use strict";

  // Данные считает task_danilovo.py: зоны ФБ Данилово, сколько ячеек нарезано,
  // что через них прошло и чего не хватает до запуска. Здесь только карта.
  const DATA_URL = "../data/danilovo.json";

  const $ = (id) => document.getElementById(id);
  const message = $("message");
  const mapBox = $("map");
  const readyBox = $("ready");
  const todoBox = $("todo");
  const stamp = $("stamp");

  let payload = null;
  let picked = null;   // zone_id выделенного узла
  let links = new Map();   // «зона→зона» → сколько прошло за 30 дней
  let entryZone = null;    // буфер приёмки: от него начинается каждый ряд

  /** Сколько прошло по связи за 30 дней. Ноль и отсутствие связи — одно и то
      же: рисовать на стрелке ноль незачем, линия и так пустая. */
  function flowBetween(from, to) {
    if (from === null || to === null) return 0;
    return links.get(`${from}→${to}`) || 0;
  }

  const CELL_WORDS = ["ячейка", "ячейки", "ячеек"];
  const NODE_WORDS = ["узел", "узла", "узлов"];

  function plural(count, words) {
    const n = Math.abs(count) % 100;
    if (n > 10 && n < 20) return words[2];
    const last = n % 10;
    return last === 1 ? words[0] : last >= 2 && last <= 4 ? words[1] : words[2];
  }

  const nice = (value) => Math.round(value || 0).toLocaleString("ru-RU");

  function niceDate(iso) {
    if (!iso) return "";
    const [year, month, day] = iso.split("-");
    return `${day}.${month}.${year}`;
  }

  const escape = (text) => String(text ?? "").replace(/[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  /* ── Карта потока (29.09.2026) ───────────────────────────────────────────
     Оммаж карте движения из Superset: буфер приёмки слева, от него
     вертикальный хребет раздаёт товар по четырём контурам, вдоль контура —
     цепочка узлов. Стиль — наш новый: тёмные карточки, свечение контура.
     Стрелки живые: по связи, где за 30 дней шёл товар, бегут огоньки — чем
     больше прошло, тем их больше и тем быстрее. Пустая связь — тусклый
     пунктир. Обход схемы (товар мимо столов) — красной дугой поверх ряда. */

  const CVET = { priemka: "#5ec8f2", presort: "#f5ad32", repack: "#ff8a4c", ucenka: "#8f7cff", util: "#27c46b" };
  const ISTOCHNIKI = [85536, 85537, 85524];
  const KOREN = 85529;
  const tiho = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function nodeCard(node, cvet) {
    const isPicked = picked === node.зона;
    const glavnoe = node.остаток > 0
      ? `<b class="fx__num">${nice(node.остаток)}</b><span class="fx__sub">штук лежит · ${nice(node.ячеек)} ${plural(node.ячеек, CELL_WORDS)}</span>`
      : node.статус !== "пусто"
        ? `<b class="fx__num">${nice(node.ячеек)}</b><span class="fx__sub">${plural(node.ячеек, CELL_WORDS)} · пусто</span>`
        : `<b class="fx__num fx__num--net">нет ячеек</b><span class="fx__sub">${node.надо ? `на ДМД ${nice(node.надо.эталон)}` : "работать негде"}</span>`;
    const potok = node.штук_месяц
      ? `<span class="fx__flow">+${nice(node.штук_месяц)} за 30 дн.${node.штук_сутки ? ` · <em>+${nice(node.штук_сутки)} за сутки</em>` : ""}</span>` : "";
    return `
      <button class="fx is-${node.статус}${isPicked ? " is-picked" : ""}" type="button" data-zone="${node.зона}"
              style="--c:${cvet}" aria-pressed="${isPicked}" title="${escape(node.полное)} · id ${node.зона}&#10;${escape(node.пояснение)}">
        <span class="fx__glow" aria-hidden="true"></span>
        <span class="fx__name"><i class="fx__dot"></i>${escape(node.название)}</span>
        ${glavnoe}${potok}
      </button>`;
  }

  function mapBlock(data) {
    const kontury = data.контуры || [];
    const vse = new Map(kontury.flatMap((c) => c.узлы.map((n) => [n.зона, { ...n, _c: CVET[c.ключ] || "#8f9cad" }])));
    const kolonki = ["вход", "столы", "контроль", "хранение", "отгрузка"];
    const nazv = { вход: "Буферы входа", столы: "Столы", контроль: "Контроль и выход", хранение: "Хранение", отгрузка: "Отгрузка" };
    const ryady = kontury.filter((c) => c.ключ !== "priemka");

    const istochniki = ISTOCHNIKI.map((z) => vse.get(z)).filter(Boolean)
      .map((n) => nodeCard(n, n.зона === 85524 ? "#ff6fae" : n._c)).join("");
    const koren = vse.get(KOREN);

    const stroki = ryady.map((c, r) => {
      const po = new Map(c.узлы.map((n) => [n.колонка, n]));
      const gotovo = c.узлы.filter((n) => n.статус !== "пусто").length;
      return `
        <div class="fxRow" style="grid-row:${r + 2}">
          <b style="color:${CVET[c.ключ]}">${escape(c.название)}</b><span>${escape(c.пояснение)}</span><em>${gotovo} из ${c.узлы.length} узлов</em>
        </div>` + kolonki.map((k, i) => {
        const n = po.get(k);
        return `<div class="fxCell" style="grid-row:${r + 2};grid-column:${i + 4}">${n ? nodeCard(n, CVET[c.ключ]) : ""}</div>`;
      }).join("");
    }).join("");

    return `
      <div class="fxMap" style="--rows:${ryady.length}">
        <div class="fxHead" style="grid-column:1">Контур</div>
        <div class="fxHead" style="grid-column:2">Откуда</div>
        <div class="fxHead" style="grid-column:3">Приёмка</div>
        ${kolonki.map((k, i) => `<div class="fxHead" style="grid-column:${i + 4}">${nazv[k]}</div>`).join("")}
        <div class="fxSrc" style="grid-row:2 / span ${ryady.length}">${istochniki}</div>
        <div class="fxRoot" style="grid-row:2 / span ${ryady.length}">${koren ? nodeCard(koren, CVET.priemka) : ""}</div>
        ${stroki}
        <svg class="fxLinks" aria-hidden="true"></svg>
        <div class="fxBadges"></div>
      </div>`;
  }

  /* Стрелки рисуем после раскладки: берём прямоугольники карточек и ведём
     кривые между ними. На ресайз — перерисовка. */
  function drawLinks() {
    const map = mapBox.querySelector(".fxMap");
    if (!map || !payload) return;
    const svg = map.querySelector(".fxLinks");
    const badges = map.querySelector(".fxBadges");
    const box = map.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    svg.setAttribute("width", box.width);
    svg.setAttribute("height", box.height);
    const rect = (z) => {
      const el = map.querySelector(`.fx[data-zone="${z}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top,
               cy: (r.top + r.bottom) / 2 - box.top, cx: (r.left + r.right) / 2 - box.left };
    };
    const cvetUzla = new Map([...map.querySelectorAll(".fx")].map((el) => [Number(el.dataset.zone), el.style.getPropertyValue("--c")]));
    const defs = `<defs><marker id="fxArr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>`;
    let paths = "";
    let metki = "";
    let n = 0;
    const koren = rect(KOREN);
    const spineX = koren ? koren.r + 26 : 0;
    let obhodov = 0;

    for (const link of payload.связи || []) {
      if (link.вид === "перекрёстно") continue;
      const flow = link.штук_месяц || 0;
      const vid = link.вид;
      if ((vid === "обход" || vid === "возврат") && !flow) continue;
      const a = rect(link.от);
      const b = rect(link.до);
      if (!a || !b) continue;
      let d;
      let mx;
      let my;
      if (vid === "ветка" && koren) {
        // От буфера приёмки — по хребту вниз/вверх и вправо в ряд.
        const y0 = koren.cy;
        const r = 10;
        const dir = b.cy > y0 ? 1 : -1;
        d = Math.abs(b.cy - y0) < 4
          ? `M${a.r},${y0} L${b.l - 3},${b.cy}`
          : `M${a.r},${y0} L${spineX - r},${y0} Q${spineX},${y0} ${spineX},${y0 + dir * r} L${spineX},${b.cy - dir * r} Q${spineX},${b.cy} ${spineX + r},${b.cy} L${b.l - 3},${b.cy}`;
        mx = (spineX + b.l) / 2; my = b.cy;
      } else if (vid === "обход") {
        // По просвету над рядом цели: со входа вправо над узлами и вниз в
        // хранение или отгрузку. Второй обход идёт чуть выше, чтобы метки не слипались.
        const yg = b.t - 15 - obhodov * 13;
        obhodov += 1;
        d = `M${a.r},${a.cy} C${a.r + 40},${a.cy} ${a.r + 30},${yg} ${a.r + 70},${yg} L${b.cx - 36},${yg} Q${b.cx},${yg} ${b.cx},${b.t - 3}`;
        mx = b.cx - 150 - (obhodov - 1) * 40; my = yg;
      } else if (vid === "возврат") {
        const bot = Math.max(a.b, b.b) + 34;
        d = `M${a.cx},${a.b} C${a.cx},${bot} ${b.cx},${bot} ${b.cx},${b.b + 3}`;
        mx = (a.cx + b.cx) / 2; my = bot - 8;
      } else if (Math.abs(a.cy - b.cy) < 4) {
        d = `M${a.r},${a.cy} L${b.l - 3},${b.cy}`;
        mx = (a.r + b.l) / 2; my = a.cy;
      } else {
        const x1 = a.r;
        const x2 = b.l - 3;
        const k = (x2 - x1) * 0.55;
        d = `M${x1},${a.cy} C${x1 + k},${a.cy} ${x2 - k},${b.cy} ${x2},${b.cy}`;
        mx = (x1 + x2) / 2; my = (a.cy + b.cy) / 2;
      }
      const id = `fxL${n++}`;
      const cvet = vid === "обход" ? "#f05d72" : vid === "возврат" ? "#f5ad32" : (cvetUzla.get(link.до) || "#5ec8f2");
      const zhivoy = flow > 0;
      // Чем больше прошло, тем быстрее бегут огоньки: 1 шт — 6 с на путь, 5 000 — ~1,5 с.
      const skorost = zhivoy ? Math.max(1.2, 6 - Math.log10(flow + 1) * 1.2) : 0;
      paths += `<path id="${id}" class="fxLink${zhivoy ? " is-live" : ""} fxLink--${vid}" d="${d}" style="--c:${cvet};--sp:${skorost.toFixed(2)}s" marker-end="url(#fxArr)"/>`;
      if (zhivoy && !tiho) {
        const iskr = Math.min(6, 1 + Math.round(Math.log10(flow + 1) * 1.2));
        for (let i = 0; i < iskr; i++) {
          paths += `<circle class="fxSpark" r="${vid === "обход" ? 3.8 : 3.2}" style="--c:${cvet}">`
            + `<animateMotion dur="${skorost.toFixed(2)}s" begin="${(-skorost * i / iskr).toFixed(2)}s" repeatCount="indefinite"><mpath href="#${id}"/></animateMotion></circle>`;
        }
      }
      if (zhivoy || vid !== "ветка") {
        metki += `<span class="fxBadge${zhivoy ? " is-live" : ""}${vid === "обход" ? " is-obhod" : ""}" style="left:${mx.toFixed(0)}px;top:${my.toFixed(0)}px;--c:${cvet}"
          title="${escape(link.от_имя)} → ${escape(link.до_имя)}: ${nice(flow)} шт за 30 дней, ${nice(link.штук_сутки)} за сутки">`
          + `${vid === "обход" ? "в обход столов · " : vid === "возврат" ? "обратно · " : ""}${nice(flow)}`
          + `${link.штук_сутки ? `<em>+${nice(link.штук_сутки)}</em>` : ""}</span>`;
      }
    }
    svg.innerHTML = defs + paths;
    badges.innerHTML = metki;
  }

  function readyBlock(data) {
    const ready = data.готовность || {};
    const started = ready.первое_движение
      ? `первое движение ${niceDate(ready.первое_движение)}`
      : "движений ещё не было";
    return (
      `<div class="readyBar">` +
        `<div class="readyBar__line">` +
          `<span class="readyBar__fill" style="width:${ready.процент || 0}%"></span>` +
        `</div>` +
        `<div class="readyBar__facts">` +
          `<span><strong>${ready.процент || 0}%</strong> узлов готово</span>` +
          `<span><strong>${ready.готово_узлов || 0}</strong> из ${ready.узлов || 0} ` +
            `${plural(ready.узлов || 0, NODE_WORDS)}</span>` +
          `<span><strong>${nice(ready.ячеек)}</strong> ${plural(ready.ячеек, CELL_WORDS)} нарезано</span>` +
          `<span>${started}</span>` +
        `</div>` +
      `</div>`
    );
  }

  /* Список работ и замечаний — то, ради чего карта и нужна: не «посмотреть»,
     а «пойти и завести». Порядок тот же, что на карте, слева направо. */
  function todoBlock(data) {
    const list = data.создать || [];
    const notes = data.заметки || [];
    if (!list.length && !notes.length) return "";

    const rows = list.map((item) => {
      const isPicked = picked === item.зона;
      return (
        `<li class="todoRow${isPicked ? " is-picked" : ""}" data-zone="${item.зона}">` +
          `<span class="todoRow__where">${escape(item.контур)} · ${escape(item.узел)}</span>` +
          `<span class="todoRow__what">${escape(item.что)}</span>` +
          `<span class="todoRow__ref">${item.эталон ? `на ДМД ${nice(item.эталон)}` : ""}</span>` +
          `<span class="todoRow__zone">${escape(item.полное)}</span>` +
        `</li>`
      );
    }).join("");

    const inventory = (data.инвентаризация || []).map((zone) =>
      `<li>${escape(zone.название)} — ${zone.ячеек
        ? `${nice(zone.ячеек)} ${plural(zone.ячеек, CELL_WORDS)}`
        : "ячеек нет"}</li>`).join("");

    return (
      `<div class="todoWrap">` +
        `<section class="todoBox">` +
          `<h2>Что завести в WMS</h2>` +
          `<p class="todoBox__note">Пустых узлов — ${list.length}. Столбец справа — сколько таких ` +
            `ячеек работает на ДМД: это ориентир по размеру, а не норма.</p>` +
          `<ol class="todoList">${rows}</ol>` +
        `</section>` +
        `<section class="todoBox todoBox--notes">` +
          `<h2>На заметку</h2>` +
          `<ul class="noteList">` +
            notes.map((note) => `<li>${escape(note)}</li>`).join("") +
            strayNotes(data) +
          `</ul>` +
          crossBlock(data) +
          (inventory ? `<h3>Вне потока</h3><ul class="noteList noteList--plain">${inventory}</ul>` : "") +
        `</section>` +
      `</div>`
    );
  }

  /* Переходы между контурами. Стрелкой через всю карту их не нарисовать —
     они идут наискось, — но именно ради них заводили буфер на каждый
     источник: попадание в такой буфер значит, что на прошлом шаге ошиблись.
     Поэтому список, а не картинка. */
  function crossBlock(data) {
    const cross = (data.связи || []).filter((link) => link.вид === "перекрёстно");
    if (!cross.length) return "";
    const rows = cross.map((link) =>
      `<li><span>${escape(link.от_имя)} → ${escape(link.до_имя)}</span>` +
      `<b>${link.штук_месяц ? nice(link.штук_месяц) : "—"}</b></li>`).join("");
    return `<h3>Переходы между контурами</h3>` +
      `<ul class="crossList">${rows}</ul>`;
  }

  /* Движения, которых в схеме нет. Пока такое одно — тестовая штука, приехавшая
     24.08 из разноски товара. Дальше здесь будут вылезать живые нарушения
     маршрута, и это самое ценное, что карта умеет показывать. */
  function strayNotes(data) {
    return (data.лишние || []).map((link) =>
      `<li>Движение мимо схемы: ${escape(link.от_имя)} → ${escape(link.до_имя)}, ` +
      `${nice(link.штук_месяц)} шт за 30 дней` +
      (link.снаружи ? " (источник вне карты ФБ)" : "") + `.</li>`).join("");
  }

  function render() {
    if (!payload) return;
    links = new Map((payload.связи || []).map((link) =>
      [`${link.от}→${link.до}`, link.штук_месяц]));
    readyBox.innerHTML = readyBlock(payload);
    readyBox.hidden = false;
    mapBox.innerHTML = mapBlock(payload);
    requestAnimationFrame(drawLinks);
    todoBox.innerHTML = todoBlock(payload);
    todoBox.hidden = !todoBox.innerHTML;
  }

  // Клик по плитке или по строке работ подсвечивает пару «узел ↔ задача».
  function pick(zone) {
    picked = picked === zone ? null : zone;
    render();
  }

  if (window.ResizeObserver) new ResizeObserver(() => drawLinks()).observe(mapBox);

  mapBox.addEventListener("click", (event) => {
    const tile = event.target.closest(".fx");
    if (tile) pick(Number(tile.dataset.zone));
  });

  todoBox.addEventListener("click", (event) => {
    const row = event.target.closest(".todoRow");
    if (row) pick(Number(row.dataset.zone));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && picked !== null) pick(picked);
  });

  fetch(DATA_URL, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject(response.status))
    .then((data) => {
      payload = data;
      message.hidden = true;
      stamp.textContent = data.обновлено ? `обновлено ${data.обновлено}` : "";
      render();
    })
    .catch(() => {
      message.textContent = "Карта пока не посчиталась — данные приедут с утренней выгрузкой.";
      message.classList.add("is-warn");
    });
})();
