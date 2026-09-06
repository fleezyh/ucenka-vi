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

  function loadUsage() {
    fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((stats) => {
      // Файла ещё нет или он не собрался — просто не показываем блок.
      if (!stats?.запериод) return;
      // Эти три итога Cloudflare считает отдельными запросами вплоть до текущей
      // минуты. Дневной массив разреженный и может ещё не содержать сегодняшний
      // UTC-день, поэтому пересчитывать итог из него нельзя.
      const period = stats.запериод;
      document.getElementById("usage-day").textContent = numberFormat.format(period.сутки.просмотры);
      document.getElementById("usage-week").textContent = numberFormat.format(period.неделя.просмотры);
      document.getElementById("usage-month").textContent = numberFormat.format(period.месяц.просмотры);
      document.getElementById("usage-stamp").textContent = `снимок ${stats.обновлено}`;
      drawSpark(stats.поДням || []);
      block.hidden = false;
    })
    .catch(() => {});
  }

  loadUsage();
  // Если фоновая задача опубликовала новый JSON, открытая вкладка подхватит его
  // без ручной перезагрузки страницы.
  setInterval(loadUsage, 60_000);
})();
