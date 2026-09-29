/* Режим WMS — тумблер в пикалке и переключатель «Пикалка | ТСД» внутри (29.09.2026).

   Степан: «есть пикалка, и когда запускается режим вмс — значок как ультракод,
   и внутри этой вкладки переключение на тсд, а не отдельными вкладками
   спрятанными». Раньше WMS и ТСД висели замочками «в разработке» (27.09);
   29.09 открыты всем, у кого есть пикалка, — действовать можно только после
   входа в WMS (это держит сервер).

   Одна точка вставки на всех трёх страницах: после вкладок пикалки (в режиме
   WMS они спрятаны — остаётся только эта строка) или под шапкой ТСД. */
(function () {
  "use strict";

  const put = location.pathname;
  const naTsd = /^\/tsd(\/|$)/.test(put);
  const naWms = /^\/picker\/wms\/?$/.test(put) || naTsd;
  if (document.getElementById("wmsRezhim")) return;

  const tumbler = `<a class="wmsTumbler${naWms ? " is-on" : ""}" href="${naWms ? "/picker/" : "/picker/wms"}"
      role="switch" aria-checked="${naWms}" title="${naWms ? "Выйти из режима WMS" : "Режим WMS: акты, перемещения, ТСД"}">
      <span class="wmsTumbler__dorozhka" aria-hidden="true"><i class="wmsTumbler__iskry"></i><i class="wmsTumbler__knob"></i></span>
      <span class="wmsTumbler__imya">WMS</span></a>`;
  const seg = naWms ? `<nav class="wmsSeg" aria-label="Режим WMS">
      <a class="wmsSeg__k${naTsd ? "" : " is-on"}" href="/picker/wms"${naTsd ? "" : ' aria-current="page"'}>Пикалка</a>
      <a class="wmsSeg__k${naTsd ? " is-on" : ""}" href="/tsd/"${naTsd ? ' aria-current="page"' : ""}>ТСД</a>
    </nav>` : "";
  const html = `<div class="wmsRezhim${naWms ? " is-on" : ""}" id="wmsRezhim">${seg}${tumbler}</div>`;

  function vstavit() {
    if (document.getElementById("wmsRezhim")) return;
    const tabs = document.querySelector(".pickerTabs");
    const shapkaTsd = document.querySelector(".topbar");
    if (tabs) tabs.insertAdjacentHTML("afterend", html);
    else if (shapkaTsd) shapkaTsd.insertAdjacentHTML("beforeend", html);
    // Включение — вспышка тумблера перед переходом, чтобы было видно, что режим сменился.
    document.querySelector(".wmsTumbler")?.addEventListener("click", (e) => {
      const a = e.currentTarget;
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      a.classList.toggle("is-on");
      a.classList.add("is-perehod");
      setTimeout(() => { location.href = a.getAttribute("href"); }, 260);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", vstavit);
  else vstavit();
})();
