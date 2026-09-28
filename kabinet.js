/* Вкладки кабинета на странице зарплаты (28.09): «Профиль · Зарплата · Админка» — те же,
   что сервер рисует в /__account (gate.kabinet_nav). Зарплата остаётся как была. */
(function () {
  "use strict";
  const hero = document.querySelector(".hero");
  if (!hero || document.querySelector(".kabVkladki")) return;
  const nav = document.createElement("nav");
  nav.className = "kabVkladki";
  nav.setAttribute("aria-label", "Кабинет");
  nav.innerHTML = '<a class="kabVkladki__a" href="/__account">Профиль</a>'
    + '<a class="kabVkladki__a is-on" href="/zp/">Зарплата</a>';
  hero.insertAdjacentElement("afterend", nav);
  fetch("/__me", { credentials: "same-origin" }).then((o) => (o.ok ? o.json() : null)).then((u) => {
    if (u && u.role === "admin") nav.insertAdjacentHTML("beforeend", '<a class="kabVkladki__a" href="/__admin">Админка</a>');
  }).catch(() => {});
})();
