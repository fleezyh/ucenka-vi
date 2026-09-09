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

  const assistantForm = document.querySelector("#homeAssistantForm");
  const assistantInput = document.querySelector("#homeAssistantInput");
  const assistantReply = document.querySelector("#homeAssistantReply");
  const assistantModal = document.querySelector("#homeAssistantModal");
  const assistantOpen = document.querySelector("#homeAssistantOpen");
  const assistantDialog = assistantModal?.querySelector("[role=dialog]");
  let assistantReturnFocus = null;

  function openAssistant() {
    assistantReturnFocus = document.activeElement;
    assistantModal.hidden = false;
    document.body.classList.add("hasAssistantOpen");
    requestAnimationFrame(() => assistantInput?.focus());
  }

  function closeAssistant() {
    assistantModal.hidden = true;
    document.body.classList.remove("hasAssistantOpen");
    assistantReturnFocus?.focus?.();
  }

  assistantOpen?.addEventListener("click", openAssistant);
  assistantModal?.querySelectorAll("[data-assistant-close]").forEach((button) => {
    button.addEventListener("click", closeAssistant);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !assistantModal?.hidden) closeAssistant();
    if (event.key !== "Tab" || assistantModal?.hidden) return;
    const focusable = [...assistantDialog.querySelectorAll("button, textarea")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });

  document.querySelectorAll(".homeAssistant__examples button").forEach((button) => {
    button.addEventListener("click", () => {
      assistantInput.value = button.textContent;
      assistantInput.focus();
    });
  });

  assistantInput?.addEventListener("input", () => {
    assistantInput.style.height = "auto";
    assistantInput.style.height = `${Math.min(assistantInput.scrollHeight, 132)}px`;
  });

  assistantForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!assistantInput.value.trim()) {
      assistantInput.focus();
      return;
    }
    assistantReply.hidden = false;
    assistantReply.textContent = "Пока это макет: вопрос никуда не отправлен. Подключаем безопасный доступ к данным и аналитический API.";
  });

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
