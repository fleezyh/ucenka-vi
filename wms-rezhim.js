/* Режим WMS — тумблер в пикалке и под-режим «Пикалка | ТСД» (29.09.2026).

   Степан: «есть пикалка, и когда запускается режим вмс — значок как ультракод»;
   вечером уточнил: «это не другая страница, а режим — мощный; ТСД в основном
   для операторов, чтоб искать брак по складу, но весь остальной функционал
   пикалки там тоже должен быть». Поэтому:
   - тумблер WMS включает режим поверх обычной пикалки (вкладки и поиск на месте);
   - «Пикалка | ТСД» внутри режима переключается на месте, без перехода, и
     помнится (localStorage); ТСД добавляет панель «брак в ячейке» (tsd-rezhim.js);
   - /tsd/ ведёт сюда же, в под-режим ТСД (демо /tsd/?demo остаётся для показов).
   Действовать в вмс можно только после входа в WMS — это держит сервер. */
(function () {
  "use strict";

  const put = location.pathname;
  const naTsd = /^\/tsd(\/|$)/.test(put);
  if (naTsd && !/[?&]demo\b/.test(location.search)) {
    location.replace("/picker/wms?pod=tsd");
    return;
  }
  const naWms = /^\/picker\/wms\/?$/.test(put);
  if (document.getElementById("wmsRezhim")) return;
  const KLYUCH = "wms-pod";
  const izAdresa = new URLSearchParams(location.search).get("pod");
  let pod = izAdresa === "tsd" || izAdresa === "pikalka" ? izAdresa : (localStorage.getItem(KLYUCH) || "pikalka");

  const tumbler = `<a class="wmsTumbler${naWms ? " is-on" : ""}" href="${naWms ? "/picker/" : "/picker/wms"}"
      role="switch" aria-checked="${naWms}" title="${naWms ? "Выйти из режима WMS" : "Режим WMS: акты, перемещения, ТСД"}">
      <span class="wmsTumbler__dorozhka" aria-hidden="true"><i class="wmsTumbler__iskry"></i><i class="wmsTumbler__knob"></i></span>
      <span class="wmsTumbler__imya">WMS</span></a>`;
  const seg = () => naWms ? `<nav class="wmsSeg" aria-label="Режим WMS">
      <button type="button" class="wmsSeg__k${pod === "tsd" ? "" : " is-on"}" data-pod="pikalka">Пикалка</button>
      <button type="button" class="wmsSeg__k${pod === "tsd" ? " is-on" : ""}" data-pod="tsd">ТСД</button>
    </nav>` : "";

  function vybratPod(novyy) {
    pod = novyy;
    localStorage.setItem(KLYUCH, pod);
    document.querySelectorAll(".wmsSeg__k").forEach((b) => b.classList.toggle("is-on", b.dataset.pod === pod));
    document.dispatchEvent(new CustomEvent("wms:pod", { detail: pod }));
  }

  function vstavit() {
    if (document.getElementById("wmsRezhim")) return;
    const tabs = document.querySelector(".pickerTabs");
    const shapkaTsd = document.querySelector(".topbar");
    const html = `<div class="wmsRezhim${naWms ? " is-on" : ""}" id="wmsRezhim">${seg()}${tumbler}</div>`;
    if (tabs) tabs.insertAdjacentHTML("afterend", html);
    else if (shapkaTsd) shapkaTsd.insertAdjacentHTML("beforeend", html);
    document.querySelector(".wmsTumbler")?.addEventListener("click", (e) => {
      const a = e.currentTarget;
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      a.classList.toggle("is-on");
      a.classList.add("is-perehod");
      setTimeout(() => { location.href = a.getAttribute("href"); }, 260);
    });
    document.getElementById("wmsRezhim").addEventListener("click", (e) => {
      const b = e.target.closest("[data-pod]");
      if (b) vybratPod(b.dataset.pod);
    });
    // Под-режим сообщаем, когда остальные скрипты страницы уже подписались.
    if (naWms) setTimeout(() => vybratPod(pod), 0);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", vstavit);
  else vstavit();
})();
