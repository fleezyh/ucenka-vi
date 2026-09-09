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
      const box = document.createElement("span");
      box.className = "navAccount";
      const short = String(user.name || user.login).split(" ").slice(0, 2).join(" ");
      box.innerHTML = `<span class="navAccount__who" title="${user.login}">${short}</span>`
        + '<a class="navAccount__link" href="/__account">Кабинет</a>'
        + '<a class="navAccount__link" href="/__logout">Выйти</a>';
      nav.appendChild(box);
    })
    .catch(() => {});
})();
