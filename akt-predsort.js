/* Пикалка · актировка с предсорта (пока демо: /picker/?akt).
   Человек пикнул товар на столе предсорта и выбрал решение. Если по решению
   нужен акт, появляются дефекты и кнопка «Заактировать»: касание, и в вмс
   создаётся акт приёмки (внутренний брак). Остальное в акт подставляется само,
   так же, как оператор предсорта заполняет его руками: исходная и целевая
   ячейка = её стол, комплектность полная, внешний вид одинаковый.
   Разбор актов Перевезенцевой 09–25.09: 700 актов, ровно на утиль и контроль ОК;
   уценка, переупаковка и некомплекты уходят со стола без акта. */
(function () {
  "use strict";

  if (!/[?&]akt\b/.test(location.search)) return;
  const box = document.getElementById("aktPs");
  if (!box) return;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const RESHENIYA = [
    { k: "util", имя: "Утиль", акт: true },
    { k: "ok", имя: "Контроль ОК", акт: true },
    { k: "ucenka", имя: "Уценка", акт: false },
    { k: "pereup", имя: "Переупаковка", акт: false },
    { k: "nekompl", имя: "Некомплект", акт: false },
  ];
  // Как дефекты пишут руками сейчас (топ по её актам), только одним текстом.
  const DEFEKTY = ["переломан", "расколот", "погнут", "порвана упаковка", "надорван", "потёртости",
    "следы загрязнения, нетоварный вид", "не работает"];
  const STOL = "ФБ (ДМД) Уценка Стол 3 (ВЗ)";

  let tovar = null;
  let reshenie = "";
  let defekt = "";
  let nomer = 7713001;
  let zaSmenu = 0;
  // Тумблер в админке (25.09): под личной учёткой вмс актировку не включаем.
  let vAdminke = "выключена в админке";
  fetch("/__akt/sostoyanie", { cache: "no-store" }).then((o) => o.ok ? o.json() : {})
    .then((d) => { vAdminke = d.включена ? "включена в админке, кнопка к вмс ещё не подключена" : "выключена в админке"; risovat(); })
    .catch(() => {});
  const demoTekst = () => `Демо: актировка ${vAdminke}, в вмс ничего не уходит`;

  function risovat() {
    if (!tovar || tovar.mode !== "presort") { box.hidden = true; return; }
    const r = RESHENIYA.find((x) => x.k === reshenie);
    box.hidden = false;
    box.innerHTML = `
      <p class="aktPs__demo">${esc(demoTekst())}${zaSmenu ? ` · заактировано за смену: ${zaSmenu}` : ""}</p>
      <p class="aktPs__zag">Решение по товару</p>
      <div class="aktPs__ryad">${RESHENIYA.map((x) => `<button type="button" class="aktPs__kn${x.k === reshenie ? " is-on" : ""}" data-resh="${x.k}">${esc(x.имя)}</button>`).join("")}</div>
      ${!r ? "" : !r.акт ? `<p class="aktPs__net">По решению «${esc(r.имя)}» акт не нужен. Кладите на выход.</p>` : `
        <p class="aktPs__zag">Дефект</p>
        <div class="aktPs__ryad">${DEFEKTY.map((d) => `<button type="button" class="aktPs__kn aktPs__kn--def${d === defekt ? " is-on" : ""}" data-def="${esc(d)}">${esc(d)}</button>`).join("")}</div>
        <button type="button" class="aktPs__akt" id="aktPsGo"${defekt ? "" : " disabled"}>Заактировать</button>
        <p class="aktPs__chto">В акт: внутренний брак · качество брак · «мех. повреждения, ${esc(defekt || "…")}» · ${esc(STOL)} · комплектность полная</p>`}`;
  }

  document.addEventListener("picker:hit", (e) => { tovar = e.detail; reshenie = ""; defekt = ""; risovat(); });
  document.addEventListener("picker:miss", () => { tovar = null; risovat(); });

  box.addEventListener("click", async (e) => {
    const r = e.target.closest("[data-resh]");
    if (r) { reshenie = r.dataset.resh; defekt = ""; return risovat(); }
    const d = e.target.closest("[data-def]");
    if (d) { defekt = d.dataset.def; return risovat(); }
    if (e.target.closest("#aktPsGo")) {
      const kn = document.getElementById("aktPsGo");
      kn.disabled = true;
      kn.textContent = "Создаю акт…";
      await new Promise((ok) => setTimeout(ok, 400));
      zaSmenu += 1;
      const r2 = RESHENIYA.find((x) => x.k === reshenie);
      box.innerHTML = `<p class="aktPs__demo">${esc(demoTekst())} · заактировано за смену: ${zaSmenu}</p>
        <p class="aktPs__gotovo">Акт №${nomer++} создан<span>${esc(tovar.name || "")}</span>
        <span>${esc(r2.имя)} · мех. повреждения, ${esc(defekt)}</span></p>
        <p class="aktPs__net">Пикните следующий товар.</p>`;
      if (navigator.vibrate) navigator.vibrate(120);
      tovar = null;
      const vvod = document.querySelector("input[type=search], #barcode, input");
      if (vvod) vvod.focus();
    }
  });
})();
