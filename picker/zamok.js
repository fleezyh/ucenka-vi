/* WMS и ТСД — в пикалке, но под замком (27.09, Степан: «тсд и wms засунуть в пикалку,
   но под замочек, чтоб нормально выглядело, что никто пока не может зайти, кроме меня»).
   Сами страницы закрыты на сервере: /picker/wms — право «wms», /tsd — «tsd», у ролей
   их нет. Здесь только вход: всем видно, что они есть; открыт — только админу. */
(function () {
  "use strict";

  const tabs = document.querySelector(".pickerTabs");
  if (!tabs || document.getElementById("pickerZamki")) return;
  const naWms = /^\/picker\/wms\/?$/.test(location.pathname);
  const ZAMOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const punkt = (href, imya, on) => `<a class="pickerZamok${on ? " is-on" : ""}" href="${href}" data-zamok
      title="В разработке — пока открыто только для теста">${ZAMOK}<span>${imya}</span></a>`;
  tabs.insertAdjacentHTML("afterend", `<nav class="pickerZamki" id="pickerZamki" aria-label="В разработке">
      ${naWms ? '<a class="pickerZamok pickerZamok--nazad" href="/picker/">← Пикалка</a>' : ""}
      <span class="pickerZamki__metka">в разработке</span>
      ${punkt("/picker/wms", "WMS", naWms)}
      ${punkt("/tsd/", "ТСД", false)}
    </nav>`);

  fetch("/__me", { credentials: "same-origin" })
    .then((o) => (o.ok ? o.json() : null))
    .then((u) => {
      if (!u || u.role !== "admin") return;
      document.querySelectorAll("#pickerZamki [data-zamok]").forEach((a) => {
        a.classList.add("is-otkryt");
        a.title = "В разработке — открыто только вам";
      });
    })
    .catch(() => {});

  document.getElementById("pickerZamki").addEventListener("click", (e) => {
    const a = e.target.closest("[data-zamok]");
    if (!a || a.classList.contains("is-otkryt")) return;
    e.preventDefault();
    a.classList.remove("is-drozh");
    void a.offsetWidth;
    a.classList.add("is-drozh");
  });
})();
