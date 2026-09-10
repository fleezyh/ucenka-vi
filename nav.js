(() => {
  "use strict";
  const host = document.querySelector(".topbar, .site-nav");
  const nav = document.querySelector(".siteNav, .site-nav__actions");
  if (!host || !nav) return;
  if (nav.dataset.static === "true") return;

  document.body.classList.add("nav-enhanced");
  const button = document.createElement("button");
  button.className = "navMenuButton";
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "site-sections");
  button.innerHTML = '<span aria-hidden="true"><i></i><i></i></span>Разделы';
  nav.id ||= "site-sections";
  host.insertBefore(button, nav);

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
  }

  button.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      button.focus();
    }
  });
  matchMedia("(min-width: 641px)").addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });

  /* Затемнение под шапкой — только когда под неё заехало содержимое.
   * Наверху страницы она должна быть частью фона раздела, а не полосой. */
  const bar = document.querySelector(".shell > .topbar");
  if (bar) {
    const sync = () => bar.classList.toggle("is-stuck", window.scrollY > 8);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
  }
})();

/* Блок входа в шапке.
 *
 * Сайт закрыт логином, но пока он был открыт, ничего про пользователя на
 * странице не было: ни кто ты, ни как сменить пароль, ни как выйти. Страница
 * смены пароля есть, но найти её можно было только по прямому адресу.
 *
 * Гейт отвечает на /__me именем и ролью; если ответа нет — блок просто не
 * появляется, и на локальной копии сайта ничего не меняется.
 */
(() => {
  "use strict";
  const nav = document.querySelector(".siteNav, .site-nav__actions");
  if (!nav) return;

  fetch("/__me", { credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : null))
    .then((user) => {
      if (!user || !user.login) return;
      // Ровно такая же группа, как «Уценка» и «Инструменты»: имя человека тут
      // ничего не решает — он и так знает, кто он, — а блок из-за него выпадал
      // из общего ряда. Админка живёт в кабинете, отдельной кнопки не нужно.
      const box = document.createElement("span");
      box.className = "navGroup navGroup--account";
      box.title = String(user.name || user.login);
      box.innerHTML = '<a class="navLink" href="/__account">Кабинет</a>'
        + '<a class="navLink" href="/__logout">Выйти</a>';
      nav.appendChild(box);
      hideClosed(user["права"]);
      if (user["примерка"]) showPreview(user);
    })
    .catch(() => {});

  /* Разделы, которые роли закрыты, убираем из шапки.
   *
   * Гейт всё равно не пустит — он отдаст 403, — но тыкать в ссылку, которая
   * отвечает отказом, человек не должен: это выглядит как поломка сайта.
   * Ключи здесь те же, что в таблице разделов на сервере. */
  const SECTION_BY_HREF = [
    ["/picker", "picker"],
    ["/antigen", "antigen"],
    ["/heatmap", "heatmap"],
    ["/sales", "sales"],
    ["/perf", "perf"],
    ["/funnel", "funnel"],
    ["/dashboard", "dashboard"],
    ["/panopticum", "panopticum"],
    ["/people", "people"],
  ];

  function hideClosed(rights) {
    if (!Array.isArray(rights) || rights.includes("*")) return;
    document.querySelectorAll(".siteNav a, .site-nav__actions a").forEach((link) => {
      const path = new URL(link.getAttribute("href"), location.origin).pathname;
      const found = SECTION_BY_HREF.find(([prefix]) => path.startsWith(prefix));
      if (found && !rights.includes(found[1])) link.remove();
    });
    // Опустевшая группа оставляет в плашке пустую перегородку.
    document.querySelectorAll(".navGroup").forEach((group) => {
      if (!group.querySelector("a")) group.remove();
    });
  }

  /* Примерка роли.
   *
   * Понять, что видит человек из операций, раньше можно было только заведя
   * себе вторую учётку. Теперь админ переключает роль и ходит по сайту как
   * он — а чтобы не забыть, что вид не настоящий, сверху висит полоса.
   */
  function showPreview(user) {
    const bar = document.createElement("div");
    bar.className = "viewAs";
    const back = encodeURIComponent(location.pathname + location.search);
    const options = (user["роли"] || [])
      .map((role) => `<a class="viewAs__role${role["ключ"] === user.role ? " is-on" : ""}"`
        + ` href="/__view?role=${role["ключ"]}&back=${back}">${role["название"]}</a>`).join("");
    bar.innerHTML = `<span class="viewAs__label">Смотрите как <b>${user["роль"]}</b></span>`
      + `<span class="viewAs__roles">${options}</span>`
      + `<a class="viewAs__exit" href="/__view?role=&back=${back}">Вернуться к своей роли</a>`;
    document.body.prepend(bar);
  }
})();
