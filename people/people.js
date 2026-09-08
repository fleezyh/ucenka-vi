/* Кто чем занят: люди направления и их следы в WMS.

   Черновик: лежит в E:\Work, в репозиторий сайта не входит.
   Данные готовит build_people.py — HR-список, учётки WMS и детализация действий
   по рельсам, месяцам и видам. Здесь только показ: месяц, фильтр по рельсу,
   разбивка по бригадам и расшифровка по каждому человеку. */

(() => {
  "use strict";

  const DATA_URL = "../data/people.json";
  const COLORS = {
    "Движения товара": "#4d8df7",
    "Акты приёмки (забраковка)": "#f05d72",
    "Акты расхождений": "#f5ad32",
    "Задания: исполнение": "#27c46b",
    "Задания: постановка": "#2fc2c9",
    "Внутренние поступления": "#a985ff",
    "Внутренние отгрузки": "#e4794a",
    "Инвентаризация (шапки)": "#8fa0b8",
  };
  const OTHER = "#6f7fd8";
  const KIND_COLORS = {
    "Движения: Перемещение": "#4d8df7",
    "Движения: Отбор": "#2fc2c9",
    "Движения: Размещение": "#a985ff",
    "Акты приёмки": "#f05d72",
    "Акты расхождений": "#f5ad32",
    "Задания": "#27c46b",
    "Внутренние поступления": "#e4794a",
  };
  const kindColor = (name) => KIND_COLORS[name] || OTHER;
  const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь",
                  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

  let payload = null;
  let month = null;       // выбранный месяц
  let rail = null;        // выбранный рельс или null — все
  let showEmpty = false;
  let opened = null;

  const el = (id) => document.getElementById(id);
  const count = (value) => Math.round(Number(value) || 0).toLocaleString("ru-RU");
  const color = (name) => COLORS[name] || OTHER;
  const monthLabel = (key) => `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;

  /** Текущий месяц ещё идёт: цифры в нём неполные, и это надо подписывать. */
  function isOpen(key) {
    const now = new Date();
    return key === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function plural(n, one, few, many) {
    const v = Math.abs(n) % 100;
    if (v > 10 && v < 20) return many;
    const last = v % 10;
    return last === 1 ? one : last >= 2 && last <= 4 ? few : many;
  }

  /** Рельсы человека за выбранный месяц с учётом фильтра. */
  function railsOf(person) {
    const slice = person.месяцы[month];
    if (!slice) return [];
    return rail ? slice.рельсы.filter((r) => r.рельс === rail) : slice.рельсы;
  }

  const actionsOf = (person) => railsOf(person).reduce((sum, r) => sum + r.действий, 0);

  function segment(box, items, current, onPick, dot) {
    box.innerHTML = "";
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(item.key === current));
      button.innerHTML = (dot && item.key ? `<i style="background:${color(item.key)}"></i>` : "")
        + item.label;
      button.addEventListener("click", () => onPick(item.key));
      box.appendChild(button);
    });
  }

  function renderControls() {
    segment(el("plMonths"),
            payload.месяцы.map((m) => ({ key: m, label: monthLabel(m) + (isOpen(m) ? " · идёт" : "") })),
            month, (key) => { month = key; render(); });
    segment(el("plRails"),
            [{ key: null, label: "все рельсы" }].concat(
              payload.рельсы.map((name) => ({ key: name, label: name }))),
            rail, (key) => { rail = rail === key ? null : key; render(); }, true);
  }

  function renderSummary() {
    const people = payload.группы.flatMap((g) => g.люди);
    const traced = people.filter((p) => actionsOf(p) > 0);
    const total = traced.reduce((sum, p) => sum + actionsOf(p), 0);
    el("plSummary").innerHTML =
      `<span><b>${people.length}</b> ${plural(people.length, "человек", "человека", "человек")} в направлении</span>`
      + `<span><b>${traced.length}</b> работали${rail ? " на этом рельсе" : " в WMS"}</span>`
      + `<span><b>${count(total)}</b> ${plural(total, "действие", "действия", "действий")}</span>`
      + `<span><b>${payload.группы.length}</b> ${plural(payload.группы.length, "группа", "группы", "групп")}</span>`
      + `<span>месяц: <b>${monthLabel(month)}${isOpen(month) ? " · идёт" : ""}</b></span>`;
  }

  /** Календарь месяца: сколько человек сделал в каждый день.
   *
   * Рисуем все дни месяца, а не только рабочие: пустые места между столбиками
   * и есть ответ на вопрос, когда человек выходил, а когда нет.
   */
  function daysChart(person) {
    const slice = person.месяцы[month];
    const days = (slice && slice.дни) || [];
    if (!days.length) return document.createTextNode("");

    const byDay = new Map(days.map((d) => [d.день, d]));
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5)) - 1;
    const total = new Date(year, monthNumber + 1, 0).getDate();
    const peak = Math.max(...days.map((d) => d.всего), 1);

    const box = document.createElement("div");
    box.className = "plDays";

    const head = document.createElement("div");
    head.className = "plDays__head";
    const hours = days.map((d) => d.часы).filter((h) => h && h[0] !== null);
    const from = hours.length ? Math.min(...hours.map((h) => h[0])) : null;
    const to = hours.length ? Math.max(...hours.map((h) => h[1])) : null;
    head.innerHTML = `<span>смен <b>${slice.смен}</b></span>`
      + `<span>в среднем <b>${count(slice.за_смену)}</b> за смену</span>`
      + `<span>пик <b>${count(peak)}</b></span>`
      + (from !== null ? `<span>часы <b>${from}:00 — ${to}:59</b></span>` : "");
    box.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "plDays__grid";
    for (let day = 1; day <= total; day += 1) {
      const key = `${month}-${String(day).padStart(2, "0")}`;
      const row = byDay.get(key);
      const weekday = new Date(year, monthNumber, day).getDay();
      const cell = document.createElement("div");
      cell.className = "plDay" + (row ? "" : " plDay--off")
        + (weekday === 0 || weekday === 6 ? " plDay--weekend" : "");
      const height = row ? Math.max(4, (row.всего / peak) * 100) : 0;
      const top = row && row.виды.length ? row.виды[0].вид : null;
      cell.innerHTML = `<i style="height:${height}%;background:${top ? kindColor(top) : "transparent"}"></i>`
        + `<span>${day}</span>`;
      if (row) {
        cell.title = `${day} число · ${count(row.всего)} действий`
          + (row.штук ? ` · ${count(row.штук)} шт` : "")
          + "\n" + row.виды.map((v) => `${v.вид}: ${count(v.действий)}`).join("\n");
      }
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    return box;
  }

  /** Раскрытие человека: дни месяца, затем рельсы и что именно внутри каждого. */
  function detail(person) {
    const box = document.createElement("div");
    box.className = "plDetail";
    box.appendChild(daysChart(person));
    const rails = railsOf(person);
    if (!rails.length) {
      box.innerHTML = `<div class="plDetail__rail"><span>следов за ${monthLabel(month)} нет</span></div>`;
    }
    rails.forEach((r) => {
      const block = document.createElement("div");
      block.className = "plDetail__rail";
      const kinds = r.виды.map((k) => `<div class="plKind">`
        + `<i style="background:${color(r.рельс)}"></i>`
        + `<span class="plKind__name" title="${k.вид}">${k.вид}</span>`
        + `<b>${count(k.действий)}</b>`
        + (k.штук ? `<em>${count(k.штук)} шт</em>` : "<em></em>") + "</div>").join("");
      block.innerHTML = `<div class="plDetail__head"><i style="background:${color(r.рельс)}"></i>`
        + `${r.рельс} · <b>${count(r.действий)}</b>`
        + (r.штук ? ` · ${count(r.штук)} шт` : "") + "</div>" + kinds;
      box.appendChild(block);
    });
    const foot = document.createElement("div");
    foot.className = "plDetail__foot";
    foot.innerHTML = `<span>логин</span> <b>${person.логин}</b>`
      + ` · <span>в компании с</span> <b>${person.принят || "—"}</b>`
      + ` · <span>месяцы со следами</span> <b>${Object.keys(person.месяцы).map(monthLabel).join(", ") || "нет"}</b>`;
    box.appendChild(foot);
    return box;
  }

  function renderGroup(group) {
    const shown = group.люди.filter((p) => showEmpty || actionsOf(p) > 0);
    if (!shown.length) return null;
    shown.sort((a, b) => actionsOf(b) - actionsOf(a));
    const peak = Math.max(...shown.map(actionsOf), 1);

    const wrap = document.createElement("section");
    wrap.className = "plGroup";
    const head = document.createElement("div");
    head.className = "plGroup__head";
    const withTrace = group.люди.filter((p) => actionsOf(p) > 0).length;
    head.innerHTML = `<span class="plGroup__name">${group.имя}</span>`
      + `<span class="plGroup__note">${group.пояснение} · ${group.полное}</span>`
      + `<span class="plGroup__count"><b>${withTrace}</b> из ${group.люди.length}</span>`;
    wrap.appendChild(head);

    shown.forEach((person) => {
      const rails = railsOf(person);
      const total = actionsOf(person);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "plRow" + (total ? "" : " plRow--empty");

      const bar = rails.map((r) => `<i style="width:${(r.действий / peak) * 100}%;`
        + `background:${color(r.рельс)}" title="${r.рельс}: ${count(r.действий)}"></i>`).join("");
      // Подпись под именем — чем человек занят в этом месяце на самом деле.
      const slice = person.месяцы[month];
      const top = rails[0];
      const what = top
        ? `${top.рельс.toLowerCase()}: ${top.виды[0] ? top.виды[0].вид : "—"}`
        : "нет действий";
      const shifts = slice && slice.смен
        ? ` · ${slice.смен} ${plural(slice.смен, "смена", "смены", "смен")}`
          + `, ${count(slice.за_смену)} за смену`
        : "";

      row.innerHTML = `<span class="plRow__who"><span class="plRow__name">${person.фио}</span>`
        + `<span class="plRow__post">${person.должность} · ${what}${shifts}</span></span>`
        + `<span class="plRow__bar">${bar}</span>`
        + `<span class="plRow__total">${total ? count(total) : "нет следов"}</span>`;

      row.addEventListener("click", () => {
        opened = opened === person.фио ? null : person.фио;
        render();
      });
      wrap.appendChild(row);
      if (opened === person.фио) wrap.appendChild(detail(person));
    });

    return wrap;
  }

  function render() {
    renderControls();
    renderSummary();
    el("plGroups").replaceChildren(...payload.группы.map(renderGroup).filter(Boolean));

    const hidden = payload.группы.flatMap((g) => g.люди).filter((p) => actionsOf(p) === 0).length;
    el("plEmpty").textContent = showEmpty
      ? `Скрыть без следов (${hidden})`
      : `Показать без следов (${hidden})`;
    el("stamp").textContent = `обновлено ${payload.обновлено} · месяцев в выгрузке: ${payload.месяцы.length}`;
    el("plSources").textContent = "Источники: HR-витрина rep_hr.v_actual_emp_list, справочник "
      + "wms.ref_user и семь рельсов WMS с расшифровкой из их справочников. "
      + "Пересобирается build_people.py.";
  }

  el("plEmpty").addEventListener("click", () => { showEmpty = !showEmpty; render(); });

  fetch(DATA_URL, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`сервер вернул ${response.status}`);
      return response.json();
    })
    .then((data) => {
      payload = data;
      // Открываем последний месяц, в котором вообще есть действия.
      month = payload.месяцы[payload.месяцы.length - 1];
      render();
    })
    .catch((error) => { el("stamp").textContent = `не удалось загрузить: ${error.message}`; });
})();
