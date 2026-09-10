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
    if (event.key === "Escape" && assistantModal && !assistantModal.hidden) closeAssistant();
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
      const pageText = document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 10000);
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
      assistantReply.textContent = `Не получилось: ${error.message || "неизвестная ошибка"}`;
      console.error("assistant request failed", error);
    } finally {
      assistantReply.classList.remove("is-thinking");
      submit.disabled = false;
      assistantInput.disabled = false;
      assistantInput.focus();
    }
  });

  /* Апдейты с утренних РНП.
   *
   * Раньше единственным следом встречи была расшифровка на пятьсот строк: что
   * решили по Данилову или по актированию, знали только те, кто был на созвоне.
   * Здесь выжимка по дням — свежая раскрыта, остальные под кликом, чтобы лента
   * не забивала главную. */
  const MESYACY = ["янв", "фев", "мар", "апр", "мая", "июн",
                   "июл", "авг", "сен", "окт", "ноя", "дек"];

  function newsItem(record, index) {
    const item = document.createElement("details");
    item.className = "homeNewsItem";
    if (index === 0) item.open = true;

    const day = new Date(record["дата"]);
    const tags = (record["теги"] || [])
      .map((tag) => `<span class="homeNewsItem__tag">${tag}</span>`).join("");

    // Цифры с доклада идут отдельным блоком: это единственная часть встречи,
    // где числа звучат дословно, и искать их вперемешку с обсуждением неудобно.
    const numbers = (record["цифры"] || []).map((line) => `<li>${line}</li>`).join("");
    const numbersBlock = numbers
      ? `<div class="homeNewsNums">
           <p class="homeNewsNums__label">Цифры с доклада</p>
           <ul>${numbers}</ul>
         </div>`
      : "";

    // В пунктах — кто говорил и, где есть, его слова. Пересказ своими словами
    // легко превращает «обсудили» в «договорились», а это разные вещи.
    const points = (record["пункты"] || []).map((point) => `
      <li class="homeNewsPoint">
        <span class="homeNewsPoint__who">${point["кто"] || ""}</span>
        ${point["цитата"] ? `<q class="homeNewsPoint__quote">${point["цитата"]}</q>` : ""}
        ${point["текст"] ? `<span class="homeNewsPoint__text">${point["текст"]}</span>` : ""}
      </li>`).join("");

    item.innerHTML = `
      <summary class="homeNewsItem__head">
        <span class="homeNewsItem__date">
          <b>${day.getDate()}</b><span>${MESYACY[day.getMonth()]}</span>
        </span>
        <span class="homeNewsItem__title">${record["заголовок"] || ""}
          ${tags ? `<span class="homeNewsItem__tags">${tags}</span>` : ""}
        </span>
        <span class="homeNewsItem__chevron" aria-hidden="true">▾</span>
      </summary>
      <div class="homeNewsItem__body">
        ${numbersBlock}
        <ul class="homeNewsItem__points">${points}</ul>
      </div>`;
    return item;
  }

  fetch("data/news.json", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const records = data && data["записи"];
      if (!records || !records.length) return;
      const list = document.querySelector("#homeNewsList");
      records.slice(0, 6).forEach((record, index) => list.append(newsItem(record, index)));
      const stamp = document.querySelector("#homeNewsStamp");
      if (stamp) stamp.textContent = `обновлено ${data["обновлено"] || ""}`;
      document.querySelector("#homeNews").hidden = false;
    })
    .catch(() => {});

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
