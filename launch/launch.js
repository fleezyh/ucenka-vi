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

  /* Одна плитка карты держит всё, что нужно знать про зону: имя, id в WMS,
     сколько ячеек, чем питается и чего не хватает. Клик ничего не раскрывает
     — раскрывать нечего, он только подсвечивает узел и его строку в списке
     работ, чтобы не искать глазами. */
  function nodeTile(node) {
    const isPicked = picked === node.зона;
    const parts = [];

    parts.push(`<span class="tile__head">` +
      `<span class="tile__name">${escape(node.название)}</span>` +
      `<span class="tile__zone">id ${node.зона}</span>` +
    `</span>`);

    /* Главное число узла — остаток: сколько лежит в зоне прямо сейчас. Так же
       устроена карта в Superset, и это правильно: узел — место хранения, а не
       счётчик прихода. Пока склад не запущен, остатка нигде нет, и на первый
       план выходит готовность — сколько ячеек нарезано. */
    if (node.остаток > 0) {
      parts.push(`<span class="tile__value">${nice(node.остаток)}</span>` +
        `<span class="tile__unit">штук лежит · ${nice(node.ячеек)} ` +
        `${plural(node.ячеек, CELL_WORDS)}</span>`);
    } else if (node.статус !== "пусто") {
      parts.push(`<span class="tile__value">${nice(node.ячеек)}</span>` +
        `<span class="tile__unit">${plural(node.ячеек, CELL_WORDS)} · пусто</span>`);
    } else {
      parts.push(`<span class="tile__value tile__value--empty">нет</span>` +
        `<span class="tile__unit">ячеек не заведено</span>`);
    }

    if (node.штук_месяц) {
      parts.push(`<span class="tile__flow">прошло за 30 дней: ${nice(node.штук_месяц)}</span>`);
    }

    parts.push(`<span class="tile__full">${escape(node.полное)}</span>`);
    parts.push(`<span class="tile__hint">${escape(node.пояснение)}</span>`);

    if (node.надо) {
      const reference = node.надо.эталон
        ? ` · на ДМД ${nice(node.надо.эталон)}`
        : "";
      parts.push(`<span class="tile__need">Завести: ${escape(node.надо.что)}${reference}</span>`);
    } else if (node.статус === "готово" && node.эталон) {
      parts.push(`<span class="tile__ref">на ДМД ${nice(node.эталон)} ` +
        `${plural(node.эталон, CELL_WORDS)}</span>`);
    }

    if (node.первое) {
      parts.push(`<span class="tile__ref">первое движение ${niceDate(node.первое)}</span>`);
    }

    return (
      `<button class="tile is-${node.статус}${isPicked ? " is-picked" : ""}" type="button" ` +
        `data-zone="${node.зона}" aria-pressed="${isPicked}">${parts.join("")}</button>`
    );
  }

  /* Ряд контура. Узлы стоят по колонкам карты, а не подряд: если у контура
     нет узла в колонке — там остаётся пустое место со стрелкой, и видно, что
     этап пропущен, а не просто «короткий контур». */
  function contourRow(contour, columns) {
    const byColumn = new Map();
    contour.узлы.forEach((node) => {
      if (node.колонка === "приёмка") return;      // приёмка стоит отдельно, слева
      byColumn.set(node.колонка, node);
    });

    /* Стрелка между узлами несёт число: сколько прошло по этой связи за 30
       дней. Это второй слой карты — узлы говорят, где лежит, связи говорят,
       куда течёт. Связь ищем по паре зон, а не по позиции: если этап
       пропущен, стрелка всё равно свяжет соседей по факту. */
    let previous = entryZone;      // слева от первой колонки стоит приёмка
    const cells = columns.map((column) => {
      const node = byColumn.get(column.ключ);
      if (!node) return `<div class="slot is-blank"><span class="link" aria-hidden="true"></span></div>`;
      const flow = flowBetween(previous, node.зона);
      const label = flow ? `<span class="link__num">${nice(flow)}</span>` : "";
      previous = node.зона;
      return `<div class="slot"><span class="link">${label}</span>${nodeTile(node)}</div>`;
    }).join("");

    const done = contour.узлы.filter((node) => node.статус !== "пусто").length;
    return (
      `<div class="rowLabel">` +
        `<b>${escape(contour.название)}</b>` +
        `<span>${escape(contour.пояснение)}</span>` +
        `<em>${done} из ${contour.узлы.length}</em>` +
      `</div>` +
      cells
    );
  }

  function mapBlock(data) {
    // Приёмка общая для всех контуров: она одна, и от неё товар расходится.
    // Поэтому стоит слева отдельной колонкой во всю высоту карты.
    const priemka = (data.контуры || []).find((c) => c.ключ === "priemka");
    const flows = (data.контуры || []).filter((c) => c.ключ !== "priemka");
    const columns = (data.колонки || []).filter((c) => c.ключ !== "приёмка");

    const heads = `<div class="head head--label"></div>` +
      `<div class="head head--in">Приёмка</div>` +
      columns.map((column) => `<div class="head">${escape(column.название)}</div>`).join("");

    // Ряды начинаются от буфера приёмки: он и есть общий вход площадки.
    entryZone = priemka
      ? (priemka.узлы.find((node) => node.колонка === "приёмка") || {}).зона ?? null
      : null;

    const entry = priemka ? (
      `<div class="entry">` +
        priemka.узлы.map(nodeTile).join("") +
      `</div>`
    ) : `<div class="entry"></div>`;

    const rows = flows.map((contour) => contourRow(contour, columns)).join("");

    return (
      `<div class="mapGrid" style="--flows:${flows.length};--cols:${columns.length}">` +
        heads + entry + rows +
      `</div>`
    );
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
    todoBox.innerHTML = todoBlock(payload);
    todoBox.hidden = !todoBox.innerHTML;
  }

  // Клик по плитке или по строке работ подсвечивает пару «узел ↔ задача».
  function pick(zone) {
    picked = picked === zone ? null : zone;
    render();
  }

  mapBox.addEventListener("click", (event) => {
    const tile = event.target.closest(".tile");
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
