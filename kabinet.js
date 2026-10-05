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
    if (eyebrow) eyebrow.textContent = "Личный кабинет · " + k["имя"];

    if (k["админ"] && !document.querySelector(".kabDva")) {
      hero.insertAdjacentHTML("afterend", '<nav class="kabDva" aria-label="Кабинет и админка">'
        + '<a class="kabDva__a is-on" href="/zp/">Кабинет</a><a class="kabDva__a" href="/__admin">Админка</a></nav>');
    }

    // предложение, как WMS просит сменить пароль: пока пароль сайта не общий с WMS
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
    sek.className = "kabProfil";
    sek.innerHTML = `
      <h2 class="kabZag">Профиль</h2>
      <div class="zpCheck">
        <div class="zpCheck__part">
          <p class="zpCheck__cap">Кто вы в системе</p>
          ${stroka("Логин", k["логин"], "выдаётся один раз и не меняется")}
          ${stroka("Должность", k["должность"], "из 1С")}
          ${stroka("Подразделение", k["подразделение"])}
          ${stroka("Принят", k["принят"])}
          ${stroka("Доступ на сайте", k["доступ"])}
          ${stroka("Учётка WMS", k["вмс_логин"] || "не привязана", vms["подключено"] ? "сейчас вошли в WMS как " + (vms["имя"] || "") : "входите в WMS через пикалку")}
          ${ots ? stroka("Отпуска и больничные", "", ots + " — за эти дни оклад не начисляется, они оплачиваются отдельно") : ""}
        </div>
        <div class="zpCheck__part">
          <p class="zpCheck__cap">На сайте</p>
          ${stroka("Последний вход", k["последний_вход"])}
          ${stroka("Дней за месяц", chislo(a["дней_за_месяц"]), chislo(a["обращений"]) + " обращений")}
          ${stroka("Сканов в пикалке", chislo(a["сканов"]))}
          ${stroka("Отметок по КГТ", chislo(a["кгт"]))}
          ${stroka("Вопросов помощнику", chislo(a["вопросов"]))}
          ${stroka("Действий всего", chislo(a["действий"]), "с переезда сайта на свой сервер")}
        </div>
      </div>
      ${skany ? `<details class="zpCheck__part kabSkany"><summary>Ваши сканы в пикалке · последние ${k["сканы"].length}</summary>
        <div class="kabScroll"><table><thead><tr><th>Когда</th><th>Штрихкод</th><th>Товар</th><th class="n">Цена</th></tr></thead>
        <tbody>${skany}</tbody></table></div></details>` : ""}
      <div class="zpCheck">
        <div class="zpCheck__part" id="kabParol">
          <p class="zpCheck__cap">Пароль</p>
          ${stroka(k["пароль_из_вмс"] ? "Общий с WMS" : "Свой пароль сайта", k["пароль_менялся"] || "не менялся", "когда менялся")}
          <p class="kabPod">${k["пароль_из_вмс"]
            ? "Сменили пароль в WMS — войдите в WMS через пикалку или введите новый здесь, сайт подтянет."
            : "Сделайте пароль как в WMS — один на обе системы."}</p>
          ${formaVms(k, k["пароль_из_вмс"] ? "Обновить из WMS" : "Сделать как в WMS")}
          <details class="kabSvoy"><summary>или задать свой пароль сайта</summary>
            <form class="kabForma" data-forma="svoy">
              <label>Текущий пароль<input name="current" type="password" autocomplete="current-password" required></label>
              <label>Новый пароль<input name="next" type="password" minlength="10" autocomplete="new-password" required></label>
              <label>Новый ещё раз<input name="confirm" type="password" minlength="10" autocomplete="new-password" required></label>
              <button type="submit">Сохранить пароль</button><p class="kabMsg" role="status"></p></form></details>
        </div>
        <div class="zpCheck__part">
          <p class="zpCheck__cap">Выход</p>
          <p class="kabPod">Сессия живёт двенадцать часов и продлевается сама, пока вы работаете.</p>
          <a class="kabVyhod" href="/__logout">Выйти из аккаунта</a>
        </div>
      </div>`;
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
      if (f.dataset.forma === "vms") {
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
    if (e.target.closest("#kabKParolyu")) {
      const karta = document.getElementById("kabParol");
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
