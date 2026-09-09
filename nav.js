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
    })
    .catch(() => {});
})();
