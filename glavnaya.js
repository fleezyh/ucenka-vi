/* Главная (28.09): четыре контура, инструменты и новости — вариант D3 из /proto/privet/.
   Состав контуров — ровно вкладки самих разделов. Куда у человека нет прав — замок:
   ссылка видна, но не открывается (права решает сервер, здесь только вид). */
(function () {
  "use strict";

  // Новости — три самые свежие из всех лент, как вкладка «Все» на /novosti/ (06.10: брали только ленту уценки —
  // на главной висело 24.09, а в антигенерации было 29.09).
  const LENTY = [["uc", "data/news.json"], ["ag", "data/news-antigen.json"], ["sl", "data/news-sales.json"]];
  Promise.all(LENTY.map(([, src]) => fetch(src, { cache: "no-store" }).then((o) => (o.ok ? o.json() : null)).catch(() => null)))
    .then((dannye) => {
      const esc = (t) => String(t || "").replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]));
      const vse = [];
      dannye.forEach((d, i) => ((d && d.записи) || []).forEach((z, j) => vse.push({ ...z, id: `${LENTY[i][0]}-${z.дата}-${j}` })));
      vse.sort((a, b) => String(b.дата || "").localeCompare(String(a.дата || "")));
      const html = vse.slice(0, 3).map((z) => {
        const dt = String(z.дата || "");
        return `<a class="pvNovost" href="novosti/#/${esc(z.id)}"><small>${esc(dt.slice(8, 10))}.${esc(dt.slice(5, 7))}</small><span>${esc(z.заголовок)}</span></a>`;
      }).join("");
      document.querySelectorAll("[data-novosti]").forEach((x) => { x.innerHTML = html || '<p class="pvNovost">пока пусто</p>'; });
    });

  // Замки по правам.
  fetch("/__me", { credentials: "same-origin" }).then((o) => (o.ok ? o.json() : null)).then((u) => {
    const prava = (u && u["права"]) || [];
    const mozhno = (p) => !p || prava.includes("*") || prava.includes(p);
    document.querySelectorAll("[data-pravo]").forEach((el) => {
      if (mozhno(el.dataset.pravo)) return;
      el.classList.add("pvZakryto");
      el.title = el.dataset.pochemu || "Нет доступа — спросите администратора";
      el.addEventListener("click", (e) => e.preventDefault());
    });
    document.querySelectorAll(".pvG").forEach((g) => {
      const ssylki = g.querySelectorAll("[data-pravo]");
      if (ssylki.length && [...ssylki].every((a) => a.classList.contains("pvZakryto"))) g.classList.add("pvG--zakryt");
    });
  }).catch(() => {});

  // Плитка чуть наклоняется за мышью, под курсором — блик её цвета.
  document.querySelectorAll("[data-tilt]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--rx", `${((e.clientY - r.top) / r.height - .5) * -5}deg`);
      el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - .5) * 6}deg`);
      el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    });
    el.addEventListener("pointerleave", () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
  });

  // Помощник — то же окно, что было на старой главной (home.js), без изменений в логике.
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
    assistantModal.style.setProperty("--assistant-from-x", `${source.left + source.width / 2 - (target.left + target.width / 2)}px`);
    assistantModal.style.setProperty("--assistant-from-y", `${source.top + source.height / 2 - (target.top + target.height / 2)}px`);
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
    assistantCloseTimer = window.setTimeout(() => { assistantModal.classList.remove("is-opening"); assistantInput?.focus(); }, 520);
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
  assistantModal?.querySelectorAll("[data-assistant-close]").forEach((b) => b.addEventListener("click", closeAssistant));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && assistantModal && !assistantModal.hidden) closeAssistant();
  });
  assistantInput?.addEventListener("input", () => {
    assistantInput.style.height = "auto";
    assistantInput.style.height = `${Math.min(assistantInput.scrollHeight, 132)}px`;
  });
  assistantForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = assistantInput.value.trim();
    if (!question) { assistantInput.focus(); return; }
    const submit = assistantForm.querySelector("button[type=submit]");
    assistantReply.hidden = false;
    assistantReply.classList.add("is-thinking");
    assistantReply.textContent = "Думаю…";
    submit.disabled = true;
    assistantInput.disabled = true;
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question, section: "home",
          context: `Страница: ${document.title}\n\n${document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 10000)}`,
          conversation_id: assistantConversationId, history: assistantHistory.slice(-8),
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
    } finally {
      assistantReply.classList.remove("is-thinking");
      submit.disabled = false;
      assistantInput.disabled = false;
      assistantInput.focus();
    }
  });
})();
