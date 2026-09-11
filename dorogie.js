(() => {
  "use strict";

  /* Отбор дорогого товара для Авито и маркетплейсов.
   *
   * Дорогая штука на площадке окупается на 70–90% от себестоимости, а внутри
   * паллеты уходит оптом за 12–14%. Но отбирать её было неоткуда: реестр
   * паллет отвечает «где паллета», а кладовщику нужен товар и его место.
   *
   * Список считает task_dorogie ночью: что сейчас лежит в периметре продаж
   * уценки дороже порога. Здесь только показ, фильтр и выгрузка. */
  const DATA_URL = "data/dorogie.json";
  const XLSX_URL = "dashboard/vendor/xlsx.full.min.js";

  const $ = (id) => document.getElementById(id);
  const box = $("dorogieCard");
  if (!box) return;

  const message = $("dorogieMessage");
  const body = $("dorogieBody");
  const totals = $("dorogieTotals");
  const stamp = $("dorogieStamp");
  const search = $("dorogieSearch");
  const exportButton = $("dorogieExport");

  const numberFormat = new Intl.NumberFormat("ru-RU");
  let payload = null;
  let shown = [];

  const money = (value) => `${numberFormat.format(Math.round(value || 0))} ₽`;

  function say(text, type = "") {
    message.textContent = text;
    message.className = `message${type ? ` ${type}` : ""}`;
    message.hidden = !text;
  }

  function rows() {
    const query = (search.value || "").trim().toLowerCase();
    const list = payload?.товары || [];
    if (!query) return list;
    return list.filter((item) =>
      `${item.название} ${item.категория} ${item.бренд} ${item.паллета} ${item.ячейка}`
        .toLowerCase().includes(query));
  }

  function draw() {
    shown = rows();
    body.innerHTML = shown.map((item) => `
      <tr>
        <td class="num">${money(item.цена)}</td>
        <td>${item.название || "—"}
          <small>${[item.бренд, item.категория].filter(Boolean).join(" · ")}</small></td>
        <td class="num">${item.штук}</td>
        <td>${item.паллета || "—"}<small>${item.ячейка || ""}</small></td>
        <td>${item.состояние || "—"}</td>
      </tr>`).join("");

    const sum = shown.reduce((all, item) => all + item.сумма, 0);
    const pieces = shown.reduce((all, item) => all + item.штук, 0);
    totals.innerHTML =
      `<span><b>${shown.length}</b> позиций</span>` +
      `<span><b>${pieces}</b> штук</span>` +
      `<span><b>${money(sum)}</b> себестоимости</span>`;
    say(shown.length ? "" : "Ничего не нашлось по этому запросу.");
    exportButton.hidden = !shown.length;
  }

  function load(script) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = script;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error("не загрузилась библиотека выгрузки"));
      document.head.append(tag);
    });
  }

  async function toExcel() {
    try {
      exportButton.disabled = true;
      if (!window.XLSX) await load(XLSX_URL);
      const sheet = window.XLSX.utils.json_to_sheet(shown.map((item) => ({
        "Цена за штуку": item.цена,
        "Наименование": item.название,
        "Бренд": item.бренд,
        "Категория": item.категория,
        "Штук": item.штук,
        "Сумма": item.сумма,
        "Паллета": item.паллета,
        "Ячейка": item.ячейка,
        "Зона": item.зона,
        "Состояние": item.состояние,
      })));
      const book = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(book, sheet, "Дорогой товар");
      window.XLSX.writeFile(book, `дорогой-товар-${payload.обновлено.slice(0, 10)}.xlsx`);
    } catch (error) {
      say(`Не получилось выгрузить: ${error.message || error}`, "error");
    } finally {
      exportButton.disabled = false;
    }
  }

  search.addEventListener("input", draw);
  exportButton.addEventListener("click", toExcel);

  fetch(DATA_URL, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((data) => {
      payload = data;
      stamp.textContent =
        `Порог отбора — ${money(data.порог)} за штуку. Обновлено ${data.обновлено}.`;
      draw();
    })
    .catch(() => say("Список пока не посчитался — данные приедут с утренней выгрузкой.", "error"));
})();
