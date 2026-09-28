/* Рабочее место ДВК: вкладки «Пломбы» и «Согласование отгрузок» на одной
   странице и итоги сверху. Данные приносят plomby.js («dvk:plomby») и
   soglas.js («dvk:soglas»). Вкладка — в адресе (#plomby / #soglas). */
(function () {
  "use strict";
  const el = (id) => document.getElementById(id);
  let vybrana = (location.hash || "").replace("#", "");
  let bez = null;
  let zhdut = null;

  function pokazat(vkl) {
    vybrana = vkl;
    document.querySelectorAll(".dvkVkladka").forEach((b) => b.classList.toggle("is-on", b.dataset.vkl === vkl));
    document.querySelectorAll(".dvkPanel").forEach((p) => { p.hidden = p.dataset.panel !== vkl; });
    if (location.hash !== "#" + vkl) history.replaceState(null, "", "#" + vkl);
    if (vkl === "plomby") setTimeout(() => el("plSkan")?.focus(), 50);
  }

  // Пока пользователь сам не выбрал, открываем ту работу, которая горит.
  function poUmolchaniyu() {
    if (vybrana === "plomby" || vybrana === "soglas") return pokazat(vybrana);
    if (document.querySelector(".dvkVkladka.is-on")) return;
    if (bez > 0) return pokazat("plomby");
    if (bez === null || zhdut === null) return;
    pokazat(zhdut ? "soglas" : "plomby");
  }

  document.addEventListener("dvk:plomby", (e) => {
    bez = e.detail.без_пломбы;
    el("dvkBez").textContent = bez;
    el("dvkSPlomboy").textContent = e.detail.с_пломбой;
    el("dvkVklBez").textContent = bez ? bez : "";
    poUmolchaniyu();
  });
  document.addEventListener("dvk:soglas", (e) => {
    zhdut = e.detail.ждут;
    el("dvkZhdut").textContent = zhdut;
    el("dvkOk").textContent = e.detail.согласованы;
    el("dvkVklZhdut").textContent = zhdut ? zhdut : "";
    poUmolchaniyu();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vkl]");
    if (b) pokazat(b.dataset.vkl);
  });
  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "");
    if (h === "plomby" || h === "soglas") pokazat(h);
  });
})();
