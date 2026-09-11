/* Лента новостей контура.
 *
 * На главной такая лента уже была — выжимки с утренних РНП. Здесь та же
 * логика, но вынесенная в отдельный компонент: любой раздел может повесить
 * себе секцию с data-src, и получит свою ленту. До этого единственным следом
 * встречи оставалась расшифровка на полторы тысячи строк, и что решили по
 * бэклогу или по переупаковке, знали только те, кто был на созвоне.
 *
 * Разметка нужна такая:
 *   <section class="feed" data-src="../data/news-antigen.json" hidden>
 *     <div class="feed__head">…<span data-feed-stamp></span></div>
 *     <div data-feed-list></div>
 *   </section>
 */
(() => {
  "use strict";

  const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн",
                  "июл", "авг", "сен", "окт", "ноя", "дек"];

  function item(record, index) {
    const box = document.createElement("details");
    box.className = "feedItem";
    if (index === 0) box.open = true;

    const day = new Date(record["дата"]);
    const tags = (record["теги"] || [])
      .map((tag) => `<span class="feedItem__tag">${tag}</span>`).join("");

    // Цифры с доклада идут отдельным блоком: это единственная часть встречи,
    // где числа звучат дословно, и искать их вперемешку с обсуждением неудобно.
    const numbers = (record["цифры"] || []).map((line) => `<li>${line}</li>`).join("");
    const numbersBlock = numbers
      ? `<div class="feedNums"><p class="feedNums__label">Цифры с доклада</p><ul>${numbers}</ul></div>`
      : "";

    // В пунктах — кто говорил и, где есть, его слова. Пересказ своими словами
    // легко превращает «обсудили» в «договорились», а это разные вещи.
    const points = (record["пункты"] || []).map((point) => `
      <li class="feedPoint">
        <span class="feedPoint__who">${point["кто"] || ""}</span>
        ${point["цитата"] ? `<q class="feedPoint__quote">${point["цитата"]}</q>` : ""}
        ${point["текст"] ? `<span class="feedPoint__text">${point["текст"]}</span>` : ""}
      </li>`).join("");

    box.innerHTML = `
      <summary class="feedItem__head">
        <span class="feedItem__date"><b>${day.getDate()}</b><span>${MONTHS[day.getMonth()]}</span></span>
        <span class="feedItem__title">${record["заголовок"] || ""}
          ${tags ? `<span class="feedItem__tags">${tags}</span>` : ""}</span>
        <span class="feedItem__chevron" aria-hidden="true">▾</span>
      </summary>
      <div class="feedItem__body">${numbersBlock}<ul class="feedItem__points">${points}</ul></div>`;
    return box;
  }

  /* Сводка поверх всех встреч. Лента отвечает на вопрос «что было в четверг»,
     сводка — на другой: куда всё это едет. Стоит над записями, свёрнутой её
     держать незачем — это самое короткое, что здесь есть. */
  function summary(data) {
    const s = data["сводка"];
    if (!s || !s["итог"]) return null;

    const box = document.createElement("section");
    box.className = "feedSummary";

    const block = (title, items, kind) => {
      if (!items || !items.length) return "";
      return `<div class="feedSummary__block feedSummary__block--${kind}">
        <p class="feedSummary__label">${title}</p>
        <ul>${items.map((line) => `<li>${line}</li>`).join("")}</ul>
      </div>`;
    };

    box.innerHTML = `
      <div class="feedSummary__head">
        <p class="feedSummary__kicker">Итог периода</p>
        <span class="feedSummary__meta">${s["период"] || ""} · ${s["встреч"] || 0} встреч</span>
      </div>
      <p class="feedSummary__text">${s["итог"]}</p>
      <div class="feedSummary__grid">
        ${block("Тянется", s["тянется"], "stuck")}
        ${block("Сделано", s["сделано"], "done")}
        ${block("Цифры", s["цифры"], "nums")}
      </div>`;
    return box;
  }

  document.querySelectorAll("[data-src]").forEach((section) => {
    const source = section.dataset.src;
    if (!source || !section.classList.contains("feed")) return;

    fetch(source, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const records = data && data["записи"];
        if (!records || !records.length) return;
        const list = section.querySelector("[data-feed-list]");
        const limit = Number(section.dataset.limit || 6);
        const svodka = summary(data);
        if (svodka) list.append(svodka);
        records.slice(0, limit).forEach((record, index) => list.append(item(record, index)));
        const stamp = section.querySelector("[data-feed-stamp]");
        if (stamp) {
          stamp.textContent = data["источник"] || `обновлено ${data["обновлено"] || ""}`;
        }
        section.hidden = false;
      })
      .catch(() => {});
  });
})();
