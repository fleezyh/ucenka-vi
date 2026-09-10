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

    if (node.статус === "работает") {
      parts.push(`<span class="tile__value">${nice(node.штук_месяц)}</span>` +
        `<span class="tile__unit">штук за 30 дней</span>`);
    } else if (node.статус === "готово") {
      parts.push(`<span class="tile__value">${nice(node.ячеек)}</span>` +
        `<span class="tile__unit">${plural(node.ячеек, CELL_WORDS)} · товара нет</span>`);
    } else {
      parts.push(`<span class="tile__value tile__value--empty">нет</span>` +
        `<span class="tile__unit">ячеек не заведено</span>`);
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

    const cells = columns.map((column, index) => {
      const node = byColumn.get(column.ключ);
      const link = index ? `<span class="link" aria-hidden="true"></span>` : "";
      if (!node) return `<div class="slot is-blank">${link}</div>`;
      return `<div class="slot">${link}${nodeTile(node)}</div>`;
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
          `</ul>` +
          (inventory ? `<h3>Вне потока</h3><ul class="noteList noteList--plain">${inventory}</ul>` : "") +
        `</section>` +
      `</div>`
    );
  }

  function render() {
    if (!payload) return;
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
