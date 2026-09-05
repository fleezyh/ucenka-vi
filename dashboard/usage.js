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
      // Sparse API results omit empty days. Never call the last non-empty day "today".
      if (Array.isArray(stats.поДням)) {
        const today = new Date().toISOString().slice(0, 10);
        const end = Date.parse(today + "T00:00:00Z");
        for (const [key, days] of [["сутки", 1], ["неделя", 7], ["месяц", 30]]) {
          const start = end - (days - 1) * 86400000;
          period[key] = {просмотры: stats.поДням.reduce((sum, day) => {
            const date = Date.parse(day.дата + "T00:00:00Z");
            return sum + (date >= start && date <= end ? Number(day.просмотры) || 0 : 0);
          }, 0)};
        }
      }
      document.getElementById("usage-day").textContent = numberFormat.format(period.сутки.просмотры);
      document.getElementById("usage-week").textContent = numberFormat.format(period.неделя.просмотры);
      document.getElementById("usage-month").textContent = numberFormat.format(period.месяц.просмотры);
      document.getElementById("usage-stamp").textContent = `обновлено ${stats.обновлено} · дни UTC, сегодня неполный`;
      drawSpark(stats.поДням || []);
      block.hidden = false;
    })
    .catch(() => {});
})();
