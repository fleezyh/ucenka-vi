/* Пикалка · актировка с предсорта (/picker/?akt).
   Человек пикнул товар на столе предсорта и выбрал решение. Если по решению
   нужен акт, появляются дефекты и кнопка «Заактировать»: касание, и в вмс
   создаётся акт приёмки (внутренний брак). Остальное в акт подставляется само,
   так же, как оператор предсорта заполняет его руками: исходная и целевая
   ячейка = её стол, комплектность полная, внешний вид одинаковый.
   Разбор актов Перевезенцевой 09–25.09: 700 актов, ровно на утиль и контроль ОК;
   уценка, переупаковка и некомплекты уходят со стола без акта.

   26.09: отдельная панель на всю ширину под карточкой — решения и дефекты
   ровными сетками, вход в вмс плашкой в шапке («перегруз кнопочек и нет
   симметрии»). */
(function () {
  "use strict";

  if (!/[?&]akt\b/.test(location.search)) return;
  const box = document.getElementById("aktPs");
  if (!box) return;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Решения — от стола (26.09): человек пикает наклейку своего стола (CEL…),
  // и пикалка показывает, что с этого стола реально делают: сервер собирает
  // это каждую ночь по перемещениям ВМС. Стол помним до конца дня.
  const KLYUCH_STOLA = "akt-stol";
  const segodnya = () => new Date().toISOString().slice(0, 10);
  let stol = null;
  try {
    const z = JSON.parse(localStorage.getItem(KLYUCH_STOLA) || "null");
    if (z && z.день === segodnya()) stol = z.стол;
  } catch (e) { /* нет — пикнут заново */ }
  let oshibkaStola = "";
  // Куда положили (26.09): после решения — пик паллеты «CON …», и по ней
  // создаётся перемещение «стол → ячейка решения → паллета» (с актом, если был).
  let zhdemPalletu = null;   // { ishod, akt }
  let perItog = null;        // { ok, tekst }
  let perIdet = false;
  // Крит / косм: на предсорте это решают и так, в акт пишем вместе с дефектом.
  const KRIT = [{ k: "крит", имя: "Критичный" }, { k: "косм", имя: "Косметический" }];
  let krit = "";
  // Как дефекты пишут руками сейчас (топ по её актам), только одним текстом.
  // На кнопке коротко, в акт — полностью.
  const DEFEKTY = [
    { k: "переломан", имя: "Переломан" }, { k: "расколот", имя: "Расколот" },
    { k: "погнут", имя: "Погнут" }, { k: "порвана упаковка", имя: "Порвана упаковка" },
    { k: "надорван", имя: "Надорван" }, { k: "потёртости", имя: "Потёртости" },
    { k: "следы загрязнения, нетоварный вид", имя: "Загрязнение" }, { k: "не работает", имя: "Не работает" },
  ];
  let tovar = null;
  let reshenie = "";
  let defekt = "";
  let nomer = 7713001;
  let zaSmenu = 0;
  let gotovo = null;          // только что созданный акт — показываем до следующего пика
  let boevoy = false;         // включена в админке: кнопка создаёт настоящий черновик
  // Личный вход в вмс (26.09): акты идут от имени того, кто вошёл. Пароль
  // уходит на сервер один раз, там не хранится — только сессия.
  let vms = { подключено: false };
  let obshchiyMozhno = false;
  let formaVhoda = false;
  let oshibkaVhoda = "";
  let oshibkaAkta = "";

  fetch("/__akt/sostoyanie", { cache: "no-store" }).then((o) => o.ok ? o.json() : {})
    .then((d) => {
      boevoy = Boolean(d.включена);
      obshchiyMozhno = Boolean(d.общий_можно);
      vms = d.вмс || { подключено: false };
      risovat();
    })
    .catch(() => {});

  // «Рысаков Степан Максимович» → «Рысаков С. М.»: в плашке нужна фамилия.
  const korotko = (fio) => {
    const s = String(fio || "").trim().split(/\s+/);
    return s.length >= 2 ? `${s[0]} ${s.slice(1, 3).map((w) => w[0] + ".").join(" ")}` : String(fio || "");
  };

  function plashkaVms() {
    if (!boevoy) return `<span class="aktPs__chip is-demo">демо</span>`;
    if (vms.подключено) {
      return `<span class="aktPs__chip is-ok" title="Акты уходят от имени: ${esc(vms.имя)}"><i></i>ВМС · ${esc(korotko(vms.имя))}
        <button type="button" class="aktPs__x" id="aktVmsVyyti" title="Выйти из ВМС" aria-label="Выйти из ВМС">×</button></span>`;
    }
    return `<button type="button" class="aktPs__chip is-net" id="aktVmsVoyti"
      title="${obshchiyMozhno ? "Пока акты под общим логином" : "Без входа акт не создать"}">ВМС · войти</button>`;
  }

  function formaVms() {
    if (!formaVhoda || vms.подключено) return "";
    return `<form class="aktPs__vhod" id="aktVmsForma" autocomplete="off">
      <input name="login" placeholder="Логин ВМС" autocapitalize="off" spellcheck="false" required>
      <input name="parol" type="password" placeholder="Пароль ВМС" required>
      <button class="aktPs__kn is-on" type="submit">Войти</button>
      <p class="aktPs__chto">${oshibkaVhoda ? `<b class="aktPs__oshibka">${esc(oshibkaVhoda)}</b> · ` : ""}пароль не сохраняется: сайт входит в ВМС один раз и держит сессию до конца смены</p>
    </form>`;
  }

  const RESHENIYA = () => (stol && stol.исходы) || [];

  function blokPalety() {
    if (perItog) {
      return `<div class="aktPs__gotovo${perItog.ok ? "" : " is-oshibka"}"><b>${esc(perItog.zag)}</b>
        <span>${esc(perItog.tekst)}</span></div>
        <p class="aktPs__chto">${perItog.ok ? "Пикните следующий товар." : "Пикните паллету ещё раз или переместите руками в ВМС."}</p>`;
    }
    if (!zhdemPalletu) return "";
    return `<div class="aktPs__palleta">
      <p class="aktPs__zag">Куда положили</p>
      <p class="aktPs__podskaz">${perIdet ? "Создаю перемещение…" : `Пикните наклейку паллеты в «${esc(zhdemPalletu.ishod.куда)}» (CON …)`}</p>
      <form class="aktPs__vhod aktPs__palForma" id="aktPalForma" autocomplete="off">
        <input name="kod" placeholder="или введите номер паллеты" inputmode="numeric">
        <button class="aktPs__kn is-on" type="submit"${perIdet ? " disabled" : ""}>Переместить</button>
      </form>
    </div>`;
  }

  function risovat() {
    if (!tovar) { box.hidden = true; return; }
    box.hidden = false;
    const r = RESHENIYA().find((x) => String(x.id) === String(reshenie));
    const shapka = `<header class="aktPs__shapka">
        <div><p class="aktPs__nad">${stol ? esc(stol.имя.replace(/^ФБ \(ДМД\) /, "")) : "Стол не выбран"}</p>
          <p class="aktPs__rezhim">${stol ? "сменить — пикните наклейку другого стола" : "пикните наклейку своего стола (CEL…)"}${
            boevoy ? "" : " · демо"}${zaSmenu ? ` · за смену ${zaSmenu}` : ""}</p></div>
        ${plashkaVms()}
      </header>${formaVms()}`;

    if (!stol) {
      box.innerHTML = `${shapka}<p class="aktPs__net">${oshibkaStola ? `<b class="aktPs__oshibka">${esc(oshibkaStola)}</b> · ` : ""}Решения зависят от стола: утиль, ДВК, категории уценки… Пикните штрихкод на своём столе, потом товар.</p>`;
      return;
    }

    if (gotovo) {
      box.innerHTML = `${shapka}
        <div class="aktPs__gotovo"><b>Акт №${esc(gotovo.nomer)}</b>
          <span>${esc(gotovo.tovar)}</span><span>${esc(gotovo.reshenie)} · мех. повреждения, ${esc(gotovo.defekt)}</span></div>
        ${blokPalety()}`;
      return;
    }

    const n = RESHENIYA().length;
    const kolonok = n <= 5 ? n : 4;
    const gotovKnopka = defekt && krit;
    box.innerHTML = `${shapka}
      <p class="aktPs__zag">Решение</p>
      <div class="aktPs__resheniya" style="grid-template-columns:repeat(${kolonok},minmax(0,1fr))">${RESHENIYA().map((x) => `<button type="button" class="aktPs__kn${String(x.id) === String(reshenie) ? " is-on" : ""}" data-resh="${x.id}" title="${esc(x.куда)}">${esc(x.имя)}</button>`).join("")}</div>
      ${!r ? "" : !r.акт ? `<p class="aktPs__net">«${esc(r.имя)}» — акт не нужен.</p>${blokPalety()}` : `
        <p class="aktPs__zag">Крит или косм</p>
        <div class="aktPs__krit">${KRIT.map((x) => `<button type="button" class="aktPs__kn${x.k === krit ? " is-on" : ""}" data-krit="${x.k}">${x.имя}</button>`).join("")}</div>
        <p class="aktPs__zag">Дефект</p>
        <div class="aktPs__defekty">${DEFEKTY.map((d) => `<button type="button" class="aktPs__kn aktPs__kn--def${d.k === defekt ? " is-on" : ""}" data-def="${esc(d.k)}">${esc(d.имя)}</button>`).join("")}</div>
        <button type="button" class="aktPs__akt" id="aktPsGo"${gotovKnopka ? "" : " disabled"}>${gotovKnopka ? "Заактировать" : !krit ? "Выберите крит или косм" : "Выберите дефект"}</button>
        <p class="aktPs__chto">Внутренний брак · качество брак · «мех. повреждения, ${esc(defekt || "…")}${krit ? ", " + krit : ""}» · ${esc(stol.имя)} → ${esc(r.куда)} · комплектность полная</p>
        ${oshibkaAkta ? `<p class="aktPs__net"><b class="aktPs__oshibka">Акт не создан:</b> ${esc(oshibkaAkta)}</p>` : ""}`}`;
  }

  function vFokus() {
    const vvod = document.getElementById("scan");
    if (vvod) vvod.focus();
  }

  document.addEventListener("picker:hit", (e) => {
    tovar = e.detail; reshenie = ""; defekt = ""; krit = ""; gotovo = null; oshibkaAkta = "";
    zhdemPalletu = null; perItog = null; risovat();
  });
  document.addEventListener("picker:palleta", (e) => {
    if (!zhdemPalletu) {
      const m = document.getElementById("message");
      if (m) { m.textContent = "Сначала товар и решение, потом паллета."; m.className = "message warn"; }
      return;
    }
    peremestit(e.detail.kod);
  });

  async function peremestit(kod) {
    if (perIdet || !zhdemPalletu) return;
    perIdet = true; risovat();
    const { ishod, akt } = zhdemPalletu;
    try {
      if (!boevoy) {
        await new Promise((ok) => setTimeout(ok, 400));
        perItog = { ok: true, zag: "Перемещение (демо)", tekst: `${stol.имя} → ${ishod.куда} · паллета ${kod}` };
      } else {
        const otvet = await fetch("/__akt/peremeshchenie", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ исход: ishod.id, товар: tovar.name, код: tovar.kod || "", паллета: kod, акт: akt || null }),
        });
        const d = await otvet.json().catch(() => ({}));
        if (d.нужен_вход) { vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в ВМС, потом пикните паллету ещё раз"; return; }
        if (!otvet.ok || !d.готово) throw new Error(d.ошибка || `сервер ответил ${otvet.status}`);
        perItog = { ok: true, zag: "Перемещение создано черновиком",
          tekst: `${ishod.куда} · ${d.паллета}${akt ? ` · с актом №${akt}` : ""}` };
      }
      zhdemPalletu = null;
      if (navigator.vibrate) navigator.vibrate(120);
    } catch (oshibka) {
      perItog = { ok: false, zag: "Перемещение не создано", tekst: oshibka.message || String(oshibka) };
      zhdemPalletu = null;
    } finally {
      perIdet = false; risovat(); vFokus();
    }
  }
  document.addEventListener("picker:stol", async (e) => {
    oshibkaStola = "";
    try {
      const otvet = await fetch(`/__akt/stol?kod=${encodeURIComponent(e.detail.kod)}`, { cache: "no-store" });
      const d = await otvet.json().catch(() => ({}));
      if (!otvet.ok) throw new Error(d.ошибка || "стол не найден");
      stol = d;
      localStorage.setItem(KLYUCH_STOLA, JSON.stringify({ день: segodnya(), стол: d }));
      reshenie = ""; defekt = ""; krit = ""; gotovo = null;
      const m = document.getElementById("message");
      if (m) { m.textContent = `Стол: ${d.имя}. Теперь пикайте товар.`; m.className = "message ok"; }
    } catch (oshibka) {
      oshibkaStola = oshibka.message || String(oshibka);
      const m = document.getElementById("message");
      if (m) { m.textContent = oshibkaStola; m.className = "message warn"; }
    }
    if (tovar) risovat();
  });
  document.addEventListener("picker:miss", () => { tovar = null; risovat(); });

  box.addEventListener("submit", async (e) => {
    if (e.target.id === "aktPalForma") {
      e.preventDefault();
      const kod = e.target.kod.value.trim();
      if (kod) peremestit(kod);
      return;
    }
    if (e.target.id !== "aktVmsForma") return;
    e.preventDefault();
    const f = e.target;
    const kn = f.querySelector("button");
    kn.disabled = true;
    kn.textContent = "Вхожу…";
    try {
      const otvet = await fetch("/__wms/voyti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ логин: f.login.value.trim(), пароль: f.parol.value }),
      });
      const d = await otvet.json().catch(() => ({}));
      if (!otvet.ok) throw new Error(d.ошибка || "не вошли");
      vms = d; formaVhoda = false; oshibkaVhoda = "";
    } catch (oshibka) {
      oshibkaVhoda = oshibka.message || String(oshibka);
    }
    risovat();
  });

  async function aktirovat() {
    const kn = document.getElementById("aktPsGo");
    kn.disabled = true;
    kn.textContent = "Создаю акт…";
    const r = RESHENIYA().find((x) => String(x.id) === String(reshenie));
    let nomerAkta = nomer++;
    oshibkaAkta = "";
    if (boevoy) {
      try {
        const otvet = await fetch("/__akt/sozdat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ товар: tovar.name, код: tovar.kod || "", дефект: `${defekt}, ${krit}`,
            решение: r.имя, исход: r.id }),
        });
        const d = await otvet.json().catch(() => ({}));
        if (d.нужен_вход || /сессия вмс закончилась/.test(d.ошибка || "")) {
          vms = { подключено: false }; formaVhoda = true; oshibkaVhoda = "войдите в ВМС, потом снова «Заактировать»";
          risovat(); return;
        }
        if (!otvet.ok || !d.акт) throw new Error(d.ошибка || `сервер ответил ${otvet.status}`);
        nomerAkta = d.акт;
      } catch (oshibka) {
        oshibkaAkta = `${oshibka.message || oshibka}. Заактируйте руками в ВМС.`;
        risovat();
        return;
      }
    } else {
      await new Promise((ok) => setTimeout(ok, 400));
    }
    zaSmenu += 1;
    gotovo = { nomer: nomerAkta, tovar: tovar.name || "", reshenie: `${r.имя} → ${r.куда}`, defekt: `${defekt}, ${krit}` };
    zhdemPalletu = { ishod: r, akt: nomerAkta };
    perItog = null;
    risovat();
    if (navigator.vibrate) navigator.vibrate(120);
    vFokus();
  }

  box.addEventListener("click", async (e) => {
    if (e.target.closest("#aktVmsVoyti")) {
      formaVhoda = !formaVhoda; oshibkaVhoda = ""; risovat();
      box.querySelector("#aktVmsForma input")?.focus();
      return;
    }
    if (e.target.closest("#aktVmsVyyti")) {
      await fetch("/__wms/vyyti", { method: "POST" }).catch(() => {});
      vms = { подключено: false }; risovat(); return;
    }
    const r = e.target.closest("[data-resh]");
    if (r) {
      reshenie = r.dataset.resh; defekt = ""; krit = ""; oshibkaAkta = ""; perItog = null;
      const ish = RESHENIYA().find((x) => String(x.id) === String(reshenie));
      zhdemPalletu = ish && !ish.акт ? { ishod: ish, akt: null } : null;
      return risovat();
    }
    const kr = e.target.closest("[data-krit]");
    if (kr) { krit = kr.dataset.krit; oshibkaAkta = ""; return risovat(); }
    const d = e.target.closest("[data-def]");
    if (d) { defekt = d.dataset.def; oshibkaAkta = ""; return risovat(); }
    if (e.target.closest("#aktPsGo")) aktirovat();
  });
})();
