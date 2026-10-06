/* Кабинет = страница зарплаты (05.10, Степан: «объединить профиль и зарплату логически, чтоб весь функционал
   человека в кабинете совпадал с кабинетом зарплаты именно в том же красивом виде; самое главное в кабинете —
   не то, что есть сейчас»). Сверху — деньги и выработка (zp.js), под ними — профиль, пароль и выход теми же
   карточками. Блок «Кабинет · Админка» — только админу, два блока на всю ширину; у остальных переключать нечего.
   Данные профиля — /__account/profil. */
(function () {
  "use strict";
  const hero = document.querySelector(".hero");
  if (!hero || /^\/zp\/fot\/?$/.test(location.pathname)) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chislo = (n) => Number(n || 0).toLocaleString("ru-RU");
  const stroka = (imya, znach, pod) => `<div class="zpCheck__line"><span>${esc(imya)}${pod ? `<small>${esc(pod)}</small>` : ""}</span><b class="kabTxt">${esc(znach ?? "—")}</b></div>`;
  const post = (url, telo) => fetch(url, { method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(telo) })
    .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d["ошибка"] || "не получилось"); return d; });

  // форма «пароль как в WMS» — и в предложении сверху, и в карточке пароля
  function formaVms(k, knopka) {
    const login = k["вмс_логин"];
    return `<form class="kabForma" data-forma="vms">
      <label>Логин WMS${login ? `<input name="l" value="${esc(login)}" readonly>` : '<input name="l" autocomplete="username" required placeholder="как входите в WMS">'}</label>
      <label>Пароль WMS<input name="p" type="password" autocomplete="current-password" required></label>
      <button type="submit">${knopka}</button><p class="kabMsg" role="status"></p></form>`;
  }

  function narisovat(k) {
    document.body.classList.add("kabinet");
    const eyebrow = hero.querySelector(".eyebrow");
    if (eyebrow) eyebrow.textContent = k["имя"];   // 06.10: «Личный кабинет · …» над «Личный кабинет» — повтор

    if (k["админ"] && !document.querySelector(".kabDva")) {
      hero.insertAdjacentHTML("afterend", '<nav class="kabDva" aria-label="Кабинет и админка">'
        + '<a class="kabDva__a is-on" href="/zp/">Кабинет</a><a class="kabDva__a" href="/__admin">Админка</a></nav>');
    }

    // предложение, как WMS просит сменить пароль: пока пароль сайта не общий с WMS
    if (!k["мессенджер"] && sessionStorage.getItem("kabYmPotom") !== "1") {
      document.getElementById("message").insertAdjacentHTML("beforebegin", `<section class="kabPredl" id="kabPredlYm">
        <p><b>Мессенджер</b> · привяжите рабочую почту — тогда пароль можно сбросить самому</p>
        <button type="button" class="kabPredl__da" data-k="kabYm">Привязать</button>
        <button type="button" class="kabPredl__net" data-potom="kabYmPotom">Не сейчас</button></section>`);
    }
    if (!k["пароль_из_вмс"] && sessionStorage.getItem("kabVmsPotom") !== "1") {
      const msg = document.getElementById("message");
      // тонкой полосой: главное в кабинете — деньги, форма сама в карточке «Пароль» ниже
      msg.insertAdjacentHTML("beforebegin", `<section class="kabPredl" id="kabPredl">
        <p><b>Смена пароля</b> · сделайте пароль сайта таким же, как в WMS — один на обе системы</p>
        <button type="button" class="kabPredl__da" id="kabKParolyu">Сменить</button>
        <button type="button" class="kabPredl__net" id="kabPotom">Не сейчас</button></section>`);
    }

    const a = k["активность"] || {};
    const ots = (k["отсутствия"] || []).map((x) => `${x["день"].slice(8, 10)}.${x["день"].slice(5, 7)} ${x["вид"]}`).join(", ");
    const vms = k["вмс"] || {};
    const skany = (k["сканы"] || []).map((p) => `<tr><td>${esc(p["когда"])}</td><td class="kabMono">${esc(p["штрих"])}</td>
      <td>${p["нашлось"] ? esc(p["название"]) : '<span class="kabNet">не нашёлся</span>'}</td>
      <td class="n">${p["цена"] ? chislo(Math.round(p["цена"])) + " ₽" : ""}</td></tr>`).join("");

    const sek = document.createElement("section");
    sek.className = "kabProfil kabPanel";   // 06.10 «прозрачное и нецельное»: весь профиль — одна непрозрачная панель
    sek.innerHTML = `
      <!-- 06.10 «так и не сделала компактным и красивым»: визитка вместо строк «подпись — значение» на всю ширину -->
      <div class="kabViz">
        <div class="kabViz__ava">${esc(String(k["имя"] || k["логин"] || "?").split(" ").slice(0, 2).map((s) => s[0] || "").join(""))}</div>
        <div class="kabViz__kto">
          <p class="kabViz__imya">${esc(k["имя"])}</p>
          <p class="kabViz__dol">${esc([k["должность"], k["подразделение"]].filter(Boolean).join(" · ") || "должность не найдена в 1С")}</p>
          <div class="kabViz__chipy">
            <span class="kabChip"><small>логин</small>${esc(k["логин"])}</span>
            ${k["принят"] ? `<span class="kabChip"><small>принят</small>${esc(k["принят"])}</span>` : ""}
            <span class="kabChip"><small>доступ</small>${esc(k["доступ"] || "—")}</span>
            <span class="kabChip${vms["подключено"] ? " is-ok" : ""}"><small>WMS</small>${esc(k["вмс_логин"] || "не привязана")}${vms["подключено"] ? " · в сети" : ""}</span>
          </div>
          ${ots ? `<p class="kabViz__ots">Отпуска и больничные: ${esc(ots)} — эти дни оплачиваются отдельно</p>` : ""}
        </div>
      </div>
      <div class="kabCifry">
        <div><b>${esc(String(k["последний_вход"] || "—").slice(0, 16))}</b><small>последний вход</small></div>
        <div><b>${chislo(a["дней_за_месяц"])}</b><small>дней за месяц · ${chislo(a["обращений"])} обращений</small></div>
        <div><b>${chislo(a["сканов"])}</b><small>сканов в пикалке</small></div>
        <div><b>${chislo(a["вопросов"])}</b><small>вопросов помощнику</small></div>
        <div><b>${chislo(a["действий"])}</b><small>действий всего</small></div>
      </div>

      <!-- 06.10 «нижний блок можно прикольнее»: три плитки — статус крупно, формы раскрываются по кнопке -->
      <div class="kabTri">
        <div class="kabPl${k["пароль_из_вмс"] ? " is-ok" : ""}" id="kabParol">
          <p class="kabPl__cap">Пароль</p>
          <p class="kabPl__zn">${k["пароль_из_вмс"] ? "Общий с WMS" : "Свой пароль сайта"}</p>
          <p class="kabPl__pod">${k["пароль_менялся"] ? "менялся " + esc(k["пароль_менялся"]) : "не менялся"}</p>
          <div class="kabPl__kn">
            <button type="button" class="kabKn kabKn--glav" data-otkryt="kabFvms">${k["пароль_из_вмс"] ? "Обновить из WMS" : "Сделать как в WMS"}</button>
            <button type="button" class="kabKn" data-otkryt="kabFsvoy">Свой пароль</button>
          </div>
          <div class="kabPl__forma" id="kabFvms" hidden>
            <p class="kabPod">${k["пароль_из_вмс"] ? "Сменили пароль в WMS — введите новый, сайт подтянет (или просто войдите в WMS через пикалку)."
              : "Один пароль на сайт и WMS: сайт проверит его входом в WMS."}</p>
            ${formaVms(k, k["пароль_из_вмс"] ? "Обновить" : "Сделать как в WMS")}
          </div>
          <div class="kabPl__forma" id="kabFsvoy" hidden>
            <form class="kabForma" data-forma="svoy">
              <label>Текущий пароль<input name="current" type="password" autocomplete="current-password" required></label>
              <label>Новый пароль<input name="next" type="password" minlength="10" autocomplete="new-password" required></label>
              <label>Новый ещё раз<input name="confirm" type="password" minlength="10" autocomplete="new-password" required></label>
              <button type="submit">Сохранить пароль</button><p class="kabMsg" role="status"></p></form>
          </div>
        </div>
        <div class="kabPl${k["мессенджер"] ? " is-ok" : " is-net"}" id="kabYm">
          <p class="kabPl__cap">Яндекс Мессенджер</p>
          <p class="kabPl__zn">${k["мессенджер"] ? "Привязан" : "Не привязан"}</p>
          <p class="kabPl__pod">${k["мессенджер"] ? esc(k["мессенджер"]) : "без него «Забыли пароль?» не пришлёт ссылку"}</p>
          ${k["мессенджер"] ? "" : `<div class="kabPl__kn"><button type="button" class="kabKn kabKn--glav" data-otkryt="kabFym">Привязать</button></div>
          <div class="kabPl__forma" id="kabFym" hidden>
            <form class="kabForma" data-forma="ymKod">
              <label>Рабочая почта<input name="pochta" autocomplete="email" autocapitalize="none" required placeholder="imya.familiya@vseinstrumenti.ru"></label>
              <button type="submit">Прислать код в Мессенджер</button><p class="kabMsg" role="status"></p></form>
            <form class="kabForma" data-forma="ymOk" hidden>
              <label>Код из Мессенджера<input name="kod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
              <button type="submit">Привязать</button><p class="kabMsg" role="status"></p></form>
          </div>`}
        </div>
        <div class="kabPl">
          <p class="kabPl__cap">Сессия</p>
          <p class="kabPl__zn">12 часов</p>
          <p class="kabPl__pod">продлевается сама, пока вы работаете</p>
          <div class="kabPl__kn"><a class="kabKn kabKn--vyhod" href="/__logout">Выйти из аккаунта</a></div>
        </div>
      </div>
      ${skany ? `<details class="kabSkany"><summary>Ваши сканы в пикалке · последние ${k["сканы"].length}</summary>
        <div class="kabScroll"><table><thead><tr><th>Когда</th><th>Штрихкод</th><th>Товар</th><th class="n">Цена</th></tr></thead>
        <tbody>${skany}</tbody></table></div></details>` : ""}`;
    (document.getElementById("note") || document.querySelector(".shell").lastElementChild).insertAdjacentElement("afterend", sek);
  }

  document.addEventListener("submit", async (e) => {
    const f = e.target.closest(".kabForma");
    if (!f) return;
    e.preventDefault();
    const msg = f.querySelector(".kabMsg"), b = f.querySelector("button");
    b.disabled = true;
    msg.className = "kabMsg";
    try {
      if (f.dataset.forma === "ymKod") {
        msg.textContent = "Отправляю код…";
        await post("/__account/ym-kod", { "почта": f.pochta.value });
        msg.textContent = "Код в Мессенджере — от бота «Направление по работе с браком».";
        const ok = document.querySelector('[data-forma="ymOk"]');
        if (ok) { ok.hidden = false; ok.kod.focus(); }
      } else if (f.dataset.forma === "ymOk") {
        await post("/__account/ym-podtverdit", { "код": f.kod.value });
        msg.textContent = "Привязано.";
        setTimeout(() => location.reload(), 800);
      } else if (f.dataset.forma === "vms") {
        msg.textContent = "Проверяю вход в WMS…";
        await post("/__account/vms-parol", { "логин": f.l.value, "пароль": f.p.value });
        msg.textContent = "Готово: пароль сайта = пароль WMS.";
        setTimeout(() => location.reload(), 900);
      } else {
        await post("/__account/parol", { current: f.current.value, next: f.next.value, confirm: f.confirm.value });
        msg.textContent = "Пароль изменён.";
        f.reset();
      }
    } catch (err) {
      msg.className = "kabMsg kabMsg--bad";
      msg.textContent = err.message;
    }
    b.disabled = false;
  });
  document.addEventListener("click", (e) => {
    const otk = e.target.closest("[data-otkryt]");
    if (otk) {   // кнопка плитки — раскрыть её форму, остальные формы этой плитки свернуть
      const pl = otk.closest(".kabPl");
      const nuzhna = document.getElementById(otk.dataset.otkryt);
      const bylaOtkryta = nuzhna && !nuzhna.hidden;
      pl?.querySelectorAll(".kabPl__forma").forEach((f) => { f.hidden = true; });
      if (nuzhna && !bylaOtkryta) {
        nuzhna.hidden = false;
        setTimeout(() => nuzhna.querySelector("input:not([readonly])")?.focus(), 50);
      }
      return;
    }
    const kuda = e.target.closest("[data-k]");
    if (kuda) {
      const karta = document.getElementById(kuda.dataset.k);
      karta?.querySelector(".kabPl__forma[hidden]")?.removeAttribute("hidden");
      karta?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => karta?.querySelector("input:not([readonly])")?.focus(), 450);
      return;
    }
    const potom = e.target.closest("[data-potom]");
    if (potom) {
      sessionStorage.setItem(potom.dataset.potom, "1");
      potom.closest(".kabPredl")?.remove();
      return;
    }
    if (e.target.closest("#kabKParolyu")) {
      const karta = document.getElementById("kabParol");
      document.getElementById("kabFvms")?.removeAttribute("hidden");
      karta?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => karta?.querySelector('[data-forma="vms"] input:not([readonly])')?.focus(), 450);
      return;
    }
    if (!e.target.closest("#kabPotom")) return;
    sessionStorage.setItem("kabVmsPotom", "1");
    fetch("/__account/vms-otlozhit", { method: "POST", credentials: "same-origin", body: "next=/zp/",
      headers: { "Content-Type": "application/x-www-form-urlencoded" } }).catch(() => {});
    document.getElementById("kabPredl")?.remove();
  });

  // «Кабинет · Админка» — сразу по /__me, не дожидаясь профиля: админка не должна пропадать, если профиль не ответил
  fetch("/__me", { credentials: "same-origin" }).then((o) => (o.ok ? o.json() : null)).then((u) => {
    if (u && u.role === "admin" && !u["примерка"] && !document.querySelector(".kabDva")) {
      hero.insertAdjacentHTML("afterend", '<nav class="kabDva" aria-label="Кабинет и админка">'
        + '<a class="kabDva__a is-on" href="/zp/">Кабинет</a><a class="kabDva__a" href="/__admin">Админка</a></nav>');
    }
  }).catch(() => {});
  fetch("/__account/profil", { credentials: "same-origin", cache: "no-store" })
    .then((o) => (o.ok ? o.json() : null)).then((k) => { if (k) narisovat(k); }).catch(() => {});
})();
