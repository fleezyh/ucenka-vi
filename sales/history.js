(() => {
  "use strict";
  const host = document.getElementById("stockHistory");
  if (!host) return;
  const fmt = (n) => Number(n || 0).toLocaleString("ru-RU");
  const short = (date) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;
  const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const el = (tag, className, value) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (value !== undefined) result.textContent = value;
    return result;
  };

  function spark(values, color, sourceDates, cutover) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 340 130");
    svg.setAttribute("class", "salesHistorySpark");
    svg.setAttribute("aria-hidden", "true");
    const max = Math.max(1, ...values.filter((v) => v !== null));
    const positions = values.map((value, i) => value === null ? null : {
      x: 12 + i * 105.3,
      y: 103 - Number(value) / max * 66,
      value,
    });
    let segment = [];
    const draw = () => {
      if (!segment.length) return;
      const first = segment[0], last = segment.at(-1);
      const area = document.createElementNS(svg.namespaceURI, "path");
      area.setAttribute("d", `M${first.x},103 ` + segment.map((p) => `L${p.x},${p.y}`).join(" ") + ` L${last.x},103 Z`);
      area.setAttribute("fill", color);
      area.setAttribute("fill-opacity", "0.15");
      const line = document.createElementNS(svg.namespaceURI, "polyline");
      line.setAttribute("points", segment.map((p) => `${p.x},${p.y}`).join(" "));
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("stroke-linejoin", "round");
      svg.append(area, line);
      segment = [];
    };
    positions.forEach((point) => { if (point) segment.push(point); else draw(); });
    draw();
    positions.forEach((point, i) => {
      if (!point) return;
      const marker = document.createElementNS(svg.namespaceURI, "circle");
      marker.setAttribute("cx", point.x);
      marker.setAttribute("cy", point.y);
      marker.setAttribute("r", "4.5");
      marker.setAttribute("fill", color);
      if (sourceDates[i] >= cutover) {
        marker.setAttribute("stroke", "#f3f6fa");
        marker.setAttribute("stroke-width", "1.5");
      }
      const label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", point.x);
      label.setAttribute("y", point.y - 10);
      label.setAttribute("text-anchor", i === 0 ? "start" : i === 3 ? "end" : "middle");
      label.setAttribute("fill", color);
      label.setAttribute("font-size", "12");
      label.setAttribute("font-weight", "600");
      label.textContent = fmt(point.value);
      svg.append(marker, label);
    });
    return svg;
  }

  fetch("../data/pallets-history.json", { cache: "no-cache" })
    .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
    .then((payload) => {
      const records = Array.isArray(payload.снимки) ? payload.снимки : [];
      const dates = [...new Set(records.map((r) => r.дата).filter(Boolean))].sort();
      if (!dates.length) throw new Error("нет снимков");
      const regions = [...new Set(records.map((r) => r.регион).filter(Boolean))].sort();
      const byDate = new Map(dates.map((d) => [d, new Map()]));
      for (const row of records) byDate.get(row.дата)?.set(row.регион, row);
      const cutover = payload.переход_на_наш_источник || "9999-12-31";
      let mode = "всего";
      let endIndex = dates.length - 1;
      const minIndex = Math.min(21, endIndex);
      const value = (date, region) => {
        const day = byDate.get(date);
        if (!day) return null;
        if (region) return Number(day.get(region)?.[mode] || 0);
        return [...day.values()].reduce((sum, row) => sum + Number(row[mode] || 0), 0);
      };

      const shell = el("div", "salesHistoryView");
      const toolbar = el("div", "salesHistoryToolbar");
      const tabs = el("div", "salesHistoryModes");
      tabs.setAttribute("role", "group");
      tabs.setAttribute("aria-label", "Вид остатков");
      const totalButton = el("button", "", "Всего паллет");
      const freeButton = el("button", "", "Свободные");
      totalButton.type = freeButton.type = "button";
      tabs.append(totalButton, freeButton);
      const nav = el("div", "salesHistoryNavigation");
      const prev = el("button", "salesHistoryArrow", "←");
      const next = el("button", "salesHistoryArrow", "→");
      prev.type = next.type = "button";
      prev.setAttribute("aria-label", "Предыдущее четырёхнедельное окно");
      next.setAttribute("aria-label", "Следующее четырёхнедельное окно");
      const slider = el("input", "salesHistorySlider");
      slider.type = "range";
      slider.min = String(minIndex);
      slider.max = String(endIndex);
      slider.step = "1";
      slider.setAttribute("aria-label", "Конечная дата четырёхнедельного окна");
      const range = el("span", "salesHistoryRange");
      nav.append(prev, slider, next, range);
      toolbar.append(tabs, nav);
      const summary = el("div", "salesHistorySummary");
      const grid = el("div", "salesHistoryGrid");
      const note = el("p", "salesHistoryNote");
      shell.append(toolbar, summary, grid, note);
      host.replaceChildren(shell);

      function render() {
        const end = dates[endIndex];
        const points = [-21, -14, -7, 0].map((offset) => shift(end, offset));
        slider.value = String(endIndex);
        prev.disabled = endIndex <= minIndex;
        next.disabled = endIndex >= dates.length - 1;
        range.textContent = `${short(points[0])} — ${short(end)}`;
        for (const [button, current] of [[totalButton, "всего"], [freeButton, "свободно"]]) {
          const selected = mode === current;
          button.classList.toggle("is-active", selected);
          button.setAttribute("aria-pressed", String(selected));
        }
        summary.replaceChildren();
        for (const date of points) {
          const amount = value(date, "");
          const card = el("div", `salesHistoryDay ${date >= cutover ? "is-new" : ""}`);
          const time = el("time", "", short(date));
          time.dateTime = date;
          card.append(time, el("strong", "", amount === null ? "—" : fmt(amount)));
          card.append(el("small", "", date >= cutover ? "наш снимок" : "таблица"));
          summary.append(card);
        }
        grid.replaceChildren();
        const ranked = regions.map((region) => ({
          region,
          latest: value(end, region) || 0,
          // Пустой регион — тот, где в окне нет ни одного ненулевого снимка.
          // Такие в сетку не кладём: раньше так висела карточка
          // «001 Хранение продаж уценки ДНЛ» с нулём на всё окно.
          est: points.some((date) => (value(date, region) || 0) > 0),
        })).filter((item) => item.est).sort((a, b) => b.latest - a.latest);
        for (const { region } of ranked) {
          const values = points.map((date) => value(date, region));
          const first = values[0], last = values.at(-1);
          const delta = first ? Math.round((last - first) / first * 100) : null;
          const color = delta > 0 ? "#f27486" : "#45cfaa";
          const card = el("article", "salesHistoryRegionCard");
          const head = el("div", "salesHistoryRegionHead");
          head.append(el("b", "", region), el("span", delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`));
          head.querySelector("span").className = delta > 0 ? "is-up" : "is-down";
          card.append(head, el("strong", "salesHistoryRegionValue", last === null ? "—" : fmt(last)));
          card.append(spark(values, color, points, cutover));
          const datesRow = el("div", "salesHistoryPointDates");
          for (const date of points) datesRow.append(el("span", "", short(date)));
          card.append(datesRow);
          card.setAttribute("aria-label", `${region}: ${points.map((d, i) => `${short(d)} — ${values[i] === null ? "нет снимка" : fmt(values[i])}`).join("; ")}`);
          grid.append(card);
        }
        note.textContent = `Четыре точки через 7 дней. До ${short(shift(cutover, -1))} — лист «Паллеты — история», с ${short(cutover)} — наши ежедневные снимки. На границе источников возможен разрыв в методике подсчёта.`;
      }
      totalButton.addEventListener("click", () => { mode = "всего"; render(); });
      freeButton.addEventListener("click", () => { mode = "свободно"; render(); });
      prev.addEventListener("click", () => { endIndex -= 1; render(); });
      next.addEventListener("click", () => { endIndex += 1; render(); });
      slider.addEventListener("input", () => { endIndex = Number(slider.value); render(); });
      render();
    })
    .catch(() => { host.textContent = "История пока недоступна; текущие остатки выше продолжают работать."; });
})();
