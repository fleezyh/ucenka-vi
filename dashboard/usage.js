(() => {
  "use strict";

  // Посещаемость собирает tools/fetch_analytics.py и кладёт рядом готовым JSON:
  // ходить в Cloudflare прямо отсюда нельзя, API-токен был бы виден всем.
  const DATA_URL = "../data/analytics.json";

  const block = document.getElementById("site-usage");
  if (!block) return;

  const numberFormat = new Intl.NumberFormat("ru-RU");

  function drawSpark(days) {
    const spark = document.getElementById("usage-spark");
    if (!spark || !days.length) return;
    const recent = days.slice(-30);
    const peak = Math.max(...recent.map((day) => day.просмотры), 1);
    spark.replaceChildren();
    for (const day of recent) {
      const bar = document.createElement("i");
      bar.style.height = `${Math.round((day.просмотры / peak) * 18)}px`;
      bar.title = `${day.дата}: ${numberFormat.format(day.просмотры)}`;
      spark.appendChild(bar);
    }
  }

  fetch(DATA_URL, { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .then((stats) => {
      // Файла ещё нет или он не собрался — просто не показываем блок.
      if (!stats?.запериод) return;
      const period = stats.запериод;
      document.getElementById("usage-day").textContent = numberFormat.format(period.сутки.просмотры);
      document.getElementById("usage-week").textContent = numberFormat.format(period.неделя.просмотры);
      document.getElementById("usage-month").textContent = numberFormat.format(period.месяц.просмотры);
      document.getElementById("usage-stamp").textContent = `обновлено ${stats.обновлено}`;
      drawSpark(stats.поДням || []);
      block.hidden = false;
    })
    .catch(() => {});
})();
