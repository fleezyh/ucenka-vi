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
  let assistantCloseTimer = 0;
  const assistantConversationId = sessionStorage.getItem("home-assistant-id") ||
    (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  sessionStorage.setItem("home-assistant-id", assistantConversationId);
  let assistantHistory = [];
  try { assistantHistory = JSON.parse(sessionStorage.getItem("home-assistant-history") || "[]"); } catch {}

  function setAssistantOrigin() {
    const source = assistantOpen?.getBoundingClientRect();
    const target = assistantDialog?.getBoundingClientRect();
    if (!source || !target) return;
    const sourceX = source.left + source.width / 2;
    const sourceY = source.top + source.height / 2;
    const targetX = target.left + target.width / 2;
    const targetY = target.top + target.height / 2;
    assistantModal.style.setProperty("--assistant-from-x", `${sourceX - targetX}px`);
    assistantModal.style.setProperty("--assistant-from-y", `${sourceY - targetY}px`);
  }

  function openAssistant() {
    clearTimeout(assistantCloseTimer);
    assistantReturnFocus = document.activeElement;
    assistantModal.hidden = false;
    assistantModal.classList.remove("is-closing");
    setAssistantOrigin();
    assistantModal.classList.remove("is-opening");
    void assistantModal.offsetWidth;
    assistantModal.classList.add("is-opening");
    document.body.classList.add("hasAssistantOpen");
    assistantCloseTimer = window.setTimeout(() => {
      assistantModal.classList.remove("is-opening");
      assistantInput?.focus();
    }, 520);
  }

  function closeAssistant() {
    if (assistantModal.hidden || assistantModal.classList.contains("is-closing")) return;
    clearTimeout(assistantCloseTimer);
    assistantModal.classList.remove("is-opening");
    assistantModal.classList.add("is-closing");
    assistantCloseTimer = window.setTimeout(() => {
      assistantModal.hidden = true;
      assistantModal.classList.remove("is-closing");
      document.body.classList.remove("hasAssistantOpen");
      assistantReturnFocus?.focus?.();
    }, 240);
  }

  assistantOpen?.addEventListener("click", openAssistant);
  if (assistantOpen && matchMedia("(hover:hover) and (pointer:fine)").matches) {
    assistantOpen.addEventListener("pointermove", (event) => {
      const rect = assistantOpen.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const nx = x / rect.width - .5;
      const ny = y / rect.height - .5;
      assistantOpen.style.setProperty("--mx", `${x}px`);
      assistantOpen.style.setProperty("--my", `${y}px`);
      assistantOpen.style.setProperty("--rx", `${-ny * 4}deg`);
      assistantOpen.style.setProperty("--ry", `${nx * 5}deg`);
    });
    assistantOpen.addEventListener("pointerleave", () => {
      assistantOpen.style.setProperty("--mx", "50%");
      assistantOpen.style.setProperty("--my", "50%");
      assistantOpen.style.setProperty("--rx", "0deg");
      assistantOpen.style.setProperty("--ry", "0deg");
    });
  }
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

  assistantForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = assistantInput.value.trim();
    if (!question) {
      assistantInput.focus();
      return;
    }
    const submit = assistantForm.querySelector("button[type=submit]");
    assistantReply.hidden = false;
    assistantReply.classList.add("is-thinking");
    assistantReply.textContent = "Думаю…";
    submit.disabled = true;
    assistantInput.disabled = true;
    try {
      const previous = assistantHistory.slice(-8);
      const pageText = document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 20000);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          section: "home",
          context: `Страница: ${document.title}\n\n${pageText}`,
          conversation_id: assistantConversationId,
          history: previous,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
      assistantReply.textContent = data.answer;
      assistantHistory.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
      assistantHistory = assistantHistory.slice(-20);
      sessionStorage.setItem("home-assistant-history", JSON.stringify(assistantHistory));
    } catch (error) {
      assistantReply.textContent = "Не удалось получить ответ. Попробуйте ещё раз через минуту.";
      console.error("assistant request failed", error);
    } finally {
      assistantReply.classList.remove("is-thinking");
      submit.disabled = false;
      assistantInput.disabled = false;
      assistantInput.focus();
    }
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
