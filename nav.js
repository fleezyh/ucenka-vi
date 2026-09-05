(() => {
  "use strict";
  const host = document.querySelector(".topbar, .site-nav");
  const nav = document.querySelector(".siteNav, .site-nav__actions");
  if (!host || !nav) return;

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
