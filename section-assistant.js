(() => {
  "use strict";

  const path = location.pathname.toLowerCase();
  const sections = {
    antigen: { title: "Антигенерация", prompts: ["Что сильнее всего влияет на брак?", "Что изменилось за выбранный период?", "Где самое большое отклонение?"] },
    heatmap: { title: "Хитмап", prompts: ["Какие показатели отстают?", "Где лучший результат?", "Что изменилось за период?"] },
    sales: { title: "Продажи", prompts: ["Где больше всего свободных паллет?", "Как выглядит воронка отгрузок?", "Какой регион требует внимания?"] },
    perf: { title: "Производительность", prompts: ["Кто показывает лучший результат?", "Где есть отклонение от цели?", "Сравни контуры между собой"] },
  };
  const key = Object.keys(sections).find((name) => path.includes(`/${name}/`));
  if (!key || document.querySelector(".sectionAssistantRoot")) return;

  const config = sections[key];
  const storageKey = `section-assistant:${key}`;
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}"); } catch { saved = {}; }
  const conversationId = saved.id || (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let messages = Array.isArray(saved.messages) ? saved.messages.slice(-20) : [];

  const root = document.createElement("div");
  root.className = "sectionAssistantRoot";
  root.innerHTML = `
    <button class="sectionAssistantTrigger" type="button" aria-haspopup="dialog" aria-controls="sectionAssistantModal">
      <span class="sectionAssistantTrigger__star">✦</span>
      <span><strong>Спросить по разделу</strong><small>${config.title} · текущие данные</small></span>
      <i>↑</i>
    </button>
    <div class="sectionAssistantModal" id="sectionAssistantModal" hidden>
      <button class="sectionAssistantBackdrop" type="button" aria-label="Закрыть"></button>
      <section class="sectionAssistant" role="dialog" aria-modal="true" aria-labelledby="sectionAssistantTitle">
        <header><span class="sectionAssistant__star">✦</span><div><h2 id="sectionAssistantTitle">Спросить по разделу</h2><p>${config.title} · вижу данные на открытом экране</p></div><span class="sectionAssistant__badge">тест</span><button class="sectionAssistantClose" type="button" aria-label="Закрыть">×</button></header>
        <div class="sectionAssistantMessages" aria-live="polite"></div>
        <div class="sectionAssistantPrompts"></div>
        <form><textarea rows="1" maxlength="800" placeholder="Напишите вопрос по текущим данным…"></textarea><button type="submit">Спросить <b>↑</b></button></form>
        <small class="sectionAssistantDisclaimer">Пока помощник анализирует только готовые данные этой страницы, без запросов в DWH.</small>
      </section>
    </div>`;
  document.body.append(root);

  const trigger = root.querySelector(".sectionAssistantTrigger");
  const modal = root.querySelector(".sectionAssistantModal");
  const dialog = root.querySelector(".sectionAssistant");
  const list = root.querySelector(".sectionAssistantMessages");
  const prompts = root.querySelector(".sectionAssistantPrompts");
  const form = root.querySelector("form");
  const input = root.querySelector("textarea");
  const submit = form.querySelector("button");

  const save = () => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ id: conversationId, messages: messages.slice(-20) })); } catch {}
  };
  const render = () => {
    list.replaceChildren();
    if (!messages.length) {
      const welcome = document.createElement("div");
      welcome.className = "sectionAssistantWelcome";
      welcome.innerHTML = "<strong>Что хотите понять?</strong><span>Спросите о цифрах, отклонениях или текущем разрезе.</span>";
      list.append(welcome);
    }
    messages.forEach((message) => {
      const item = document.createElement("p");
      item.className = `sectionAssistantMessage is-${message.role}`;
      item.textContent = message.content;
      list.append(item);
    });
    list.scrollTop = list.scrollHeight;
  };
  config.prompts.forEach((text) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => { input.value = text; input.focus(); });
    prompts.append(button);
  });
  render();

  function pageContext() {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll(".sectionAssistantRoot, script, style, noscript").forEach((node) => node.remove());
    const text = (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    return `Страница: ${document.title}\nАдрес: ${location.pathname}${location.hash}\n\n${text}`.slice(0, 12000);
  }
  function open() {
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-open"));
    document.body.classList.add("sectionAssistantOpen");
    setTimeout(() => input.focus(), 220);
  }
  function close() {
    modal.classList.remove("is-open");
    document.body.classList.remove("sectionAssistantOpen");
    setTimeout(() => { modal.hidden = true; trigger.focus(); }, 180);
  }
  trigger.addEventListener("click", open);
  root.querySelector(".sectionAssistantBackdrop").addEventListener("click", close);
  root.querySelector(".sectionAssistantClose").addEventListener("click", close);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.hidden) close(); });
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 130)}px`; });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || submit.disabled) return;
    const history = messages.slice(-8);
    messages.push({ role: "user", content: question });
    input.value = "";
    input.style.height = "auto";
    const thinking = { role: "assistant", content: "Думаю…", temporary: true };
    messages.push(thinking);
    render();
    submit.disabled = input.disabled = true;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, section: key, context: pageContext(), conversation_id: conversationId, history }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
      thinking.content = data.answer || "Ответ пуст.";
      delete thinking.temporary;
    } catch (error) {
      thinking.content = `Не получилось: ${error.message || "неизвестная ошибка"}`;
      console.error("section assistant failed", error);
    } finally {
      submit.disabled = input.disabled = false;
      save();
      render();
      input.focus();
    }
  });
})();
