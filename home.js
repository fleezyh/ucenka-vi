(() => {
  "use strict";
  const tabs = [...document.querySelectorAll("[data-view]")];
  const panels = [...document.querySelectorAll("[data-panel]")];
  const switcher = document.querySelector(".homeSwitch");

  function show(view, remember = true) {
    const selected = view === "tools" ? "tools" : "analytics";
    switcher.dataset.active = selected;
    tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.view === selected)));
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== selected;
      if (!panel.hidden) {
        panel.classList.remove("is-entering");
        requestAnimationFrame(() => panel.classList.add("is-entering"));
      }
    });
    if (remember) localStorage.setItem("home-view", selected);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => show(tab.dataset.view));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const next = tab.dataset.view === "analytics" ? "tools" : "analytics";
      show(next);
      tabs.find((item) => item.dataset.view === next)?.focus();
    });
  });

  show(localStorage.getItem("home-view") || "analytics", false);

  fetch("data/analytics.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      const periods = data["запериод"] || {};
      document.querySelector("#homeViewsToday").textContent = (periods["сутки"]?.["просмотры"] ?? 0).toLocaleString("ru-RU");
    })
    .catch(() => document.querySelector(".homeViews")?.remove());
})();
