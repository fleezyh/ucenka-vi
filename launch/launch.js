(() => {
  "use strict";

  // Данные считает task_danilovo.py: зоны ФБ Данилово, сколько ячеек нарезано
  // и что через них прошло. Здесь только отрисовка карты.
  const DATA_URL = "../data/danilovo.json";

  const $ = (id) => document.getElementById(id);
  const message = $("message");
  const mapBox = $("map");
  const readyBox = $("ready");
  const extraBox = $("extra");
  const stamp = $("stamp");

  let payload = null;
  let opened = null;   // zone_id раскрытого узла

  const PIECE_WORDS = ["штука", "штуки", "штук"];
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

  /* Что показывает плитка. Пока склад не запущен, главное число — не объём,
     а готовность: сколько ячеек нарезано. Как только по узлу пойдёт товар,
     на первый план выходят штуки, а ячейки уходят в подпись. Так карта
     переживает запуск без переделки. */
  function nodeFigure(node) {
    if (node.статус === "работает") {
      return {
        big: nice(node.штук_месяц),
        small: `${plural(node.штук_месяц, PIECE_WORDS)} за 30 дней`,
      };
    }
    if (node.статус === "готово") {
      return {
        big: nice(node.ячеек),
        small: plural(node.ячеек, CELL_WORDS),
      };
    }
    return { big: "—", small: "ячеек нет" };
  }

  function nodeTile(node) {
    const figure = nodeFigure(node);
    const isOpen = opened === node.зона;
    return (
      `<button class="mapNode is-${node.статус}${isOpen ? " is-open" : ""}" type="button" ` +
        `data-zone="${node.зона}" aria-expanded="${isOpen}">` +
        `<span class="mapNode__name">${escape(node.название)}</span>` +
        `<span class="mapNode__big">${figure.big}</span>` +
        `<span class="mapNode__small">${escape(figure.small)}</span>` +
      `</button>`
    );
  }

  /* Развёрнутая карточка узла. Живёт прямо в строке контура под плитками —
     как раскрытие ряда в хитмапе, чтобы не уводить внимание в сторону. */
  function nodeCard(node) {
    const rows = [
      ["Зона WMS", `${escape(node.полное)} · id ${node.зона}`],
      ["Ячеек нарезано", node.ячеек ? nice(node.ячеек) : "ни одной"],
      ["Чем питается", escape(node.пояснение)],
    ];
    if (node.штук_месяц) rows.push(["За 30 дней", `${nice(node.штук_месяц)} шт`]);
    if (node.штук_сутки) rows.push(["За сутки", `${nice(node.штук_сутки)} шт`]);
    if (node.первое) rows.push(["Первое движение", niceDate(node.первое)]);
    if (!node.ячеек) {
      rows.push(["Что мешает",
        "Зона создана, но ячеек в ней нет — перемещение в неё сканер не примет"]);
    }
    return (
      `<div class="mapCard">` +
        `<p class="mapCard__title">${escape(node.название)}</p>` +
        `<dl class="mapCard__list">` +
          rows.map(([term, value]) =>
            `<div><dt>${term}</dt><dd>${value}</dd></div>`).join("") +
        `</dl>` +
      `</div>`
    );
  }

  function contourRow(contour) {
    const tiles = contour.узлы.map((node, index) =>
      (index ? `<span class="mapArrow" aria-hidden="true">→</span>` : "") + nodeTile(node)
    ).join("");
    const open = contour.узлы.find((node) => node.зона === opened);
    const done = contour.узлы.filter((node) => node.статус !== "пусто").length;

    return (
      `<section class="mapRow">` +
        `<header class="mapRow__head">` +
          `<div>` +
            `<h2>${escape(contour.название)}</h2>` +
            `<p>${escape(contour.пояснение)}</p>` +
          `</div>` +
          `<span class="mapRow__score">${done} из ${contour.узлы.length}</span>` +
        `</header>` +
        `<div class="mapRow__flow">${tiles}</div>` +
        (open ? nodeCard(open) : "") +
      `</section>`
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

  function extraBlock(data) {
    const list = data.инвентаризация || [];
    if (!list.length) return "";
    return (
      `<h2 class="extraTitle">Вне потока</h2>` +
      `<p class="extraNote">Инвентаризационные зоны товар не обрабатывают, но без них ` +
        `склад не закроет месяц.</p>` +
      `<div class="extraGrid">` +
        list.map((zone) =>
          `<div class="extraCard is-${zone.статус}">` +
            `<strong>${escape(zone.название)}</strong>` +
            `<span>${zone.ячеек ? `${nice(zone.ячеек)} ${plural(zone.ячеек, CELL_WORDS)}` : "ячеек нет"}</span>` +
          `</div>`).join("") +
      `</div>`
    );
  }

  function render() {
    if (!payload) return;
    readyBox.innerHTML = readyBlock(payload);
    readyBox.hidden = false;
    mapBox.innerHTML = (payload.контуры || []).map(contourRow).join("");
    extraBox.innerHTML = extraBlock(payload);
    extraBox.hidden = !extraBox.innerHTML;
  }

  // Клик по любой плитке раскрывает узел, повторный — закрывает.
  mapBox.addEventListener("click", (event) => {
    const tile = event.target.closest(".mapNode");
    if (!tile) return;
    const zone = Number(tile.dataset.zone);
    opened = opened === zone ? null : zone;
    render();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && opened !== null) {
      opened = null;
      render();
    }
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
