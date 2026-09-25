/* Согласование отгрузок: две колонки заявок, окно лота с паллетами,
   галочки ДВК и СБ, форма «лот на согласование». */
(function () {
  "use strict";

  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chislo = (n) => (n === null || n === undefined || n === "") ? "—"
    : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  const data = (s) => {
    if (!s) return "—";
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
    return m ? `${m[3]}.${m[2]}${m[4] ? " " + m[4] : ""}` : String(s);
  };

  let mozhno = {};
  let tekushaya = null;
  const otkryty = new Set();
  const sostavy = new Map();

  async function zagruzit() {
    try {
      const otvet = await fetch("/__soglas", { cache: "no-store" });
      if (!otvet.ok) throw new Error(otvet.status === 403 ? "нет доступа к согласованию отгрузок" : `сервер ответил ${otvet.status}`);
      const d = await otvet.json();
      mozhno = d.можно || {};
      el("sgNovaya").hidden = !mozhno.запрос;
      narisovatSpisok(d);
      el("message").textContent = "";
      el("sgDoska").hidden = false;
      el("stamp").textContent = "обновлено " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      el("message").textContent = "Не загрузилось: " + (e.message || e);
    }
  }

  function karta(z) {
    const vsego = z.паллет || 0;
    const shag = (imya, sdelano, gotovo) => `<span class="sgShag ${gotovo ? "is-ok" : sdelano ? "is-chast" : ""}">${imya} ${sdelano}/${vsego}</span>`;
    const dvkReshil = (z.двк_ок || 0) + (z.двк_нет || 0);
    return `<button class="sgKarta" type="button" data-id="${z.id}">
      <span class="sgKarta__verh"><b>Лот ${esc(z.лот)}</b><span class="sgKarta__data">отгрузка ${data(z.дата_отгрузки)}</span></span>
      <span class="sgKarta__ka">${esc(z.ка || "контрагент не указан")}</span>
      <span class="sgKarta__pod">${esc([z.склад || z.регион, z.ка_статус].filter(Boolean).join(" · "))}</span>
      <span class="sgShagi">
        ${z.статус === "согласован"
          ? `<span class="sgShag is-ok">к отгрузке ${z.к_отгрузке}/${vsego}</span>${z.канал_когда ? `<span class="sgShag">в канале ${data(z.канал_когда)}</span>` : `<span class="sgShag">в канал не ушло</span>`}`
          : `${shag("ДВК", dvkReshil, dvkReshil === vsego && vsego)}${shag("СБ", z.сб_ок || 0, false)}`}
      </span>
      <span class="sgKarta__pod">отправил ${esc(z.создал || "—")} ${data(z.создан)}</span>
    </button>`;
  }

  function narisovatSpisok(d) {
    const zhdut = d.ждут || [], ok = d.согласованы || [];
    el("sgZhdutN").textContent = zhdut.length;
    el("sgOkN").textContent = ok.length;
    el("sgZhdut").innerHTML = zhdut.map(karta).join("") || '<p class="sgPusto">Все лоты согласованы.</p>';
    el("sgOk").innerHTML = ok.map(karta).join("") || '<p class="sgPusto">Пока ничего.</p>';
  }

  /* ── окно лота ─────────────────────────────────────────── */

  function okno(html) {
    el("sgOknoTelo").innerHTML = html;
    el("sgOkno").hidden = false;
  }
  function zakryt() {
    el("sgOkno").hidden = true;
    tekushaya = null;
    otkryty.clear();
  }

  async function otkrytZayavku(id) {
    okno('<p class="sgPusto">Загружаю лот…</p>');
    try {
      const otvet = await fetch(`/__soglas/zayavka?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!otvet.ok) throw new Error(`сервер ответил ${otvet.status}`);
      tekushaya = await otvet.json();
      mozhno = tekushaya.можно || mozhno;
      narisovatZayavku();
    } catch (e) {
      okno(`<p class="sgOshibka">Лот не открылся: ${esc(e.message || e)}</p><button class="sgKn" type="button" data-zakryt>Закрыть</button>`);
    }
  }

  function yacheykaSluzhby(p, sluzhba, zhdyot) {
    const ok = p[sluzhba], kto = p[sluzhba + "_кто"], kogda = p[sluzhba + "_когда"], pochemu = p[sluzhba + "_почему"];
    const pravo = sluzhba === "двк" ? mozhno.двк : mozhno.сб;
    // СБ не решает по паллетам, которые ДВК не согласовал: они из отгрузки выпали.
    const vypala = sluzhba === "сб" && p.двк === false;
    if (vypala) return '<span class="sgZhdyot">—</span>';
    if (zhdyot && pravo && (sluzhba === "двк" || p.двк === true)) {
      return `<input class="sgGalka" type="checkbox" data-sluzhba="${sluzhba}" data-pallet="${esc(p.паллета)}"${ok === true ? " checked" : ""}
        aria-label="${sluzhba.toUpperCase()}: согласовать ${esc(p.паллета)}">${ok === false ? `<span class="sgNet"> нет</span><span class="sgKto">${esc(pochemu || "")}</span>` : ""}${kto ? `<span class="sgKto">${esc(kto)} ${data(kogda)}</span>` : ""}`;
    }
    if (ok === true) return `<span class="sgOk">✓</span><span class="sgKto">${esc(kto)} ${data(kogda)}</span>`;
    if (ok === false) return `<span class="sgNet">✗</span><span class="sgKto">${esc(pochemu || "")} ${esc(kto)} ${data(kogda)}</span>`;
    return '<span class="sgZhdyot">ждёт</span>';
  }

  function sostavHtml(pallet) {
    const s = sostavy.get(pallet);
    if (!s) return '<p class="sgPusto">Смотрю, что в паллете…</p>';
    if (s.ошибка) return `<p class="sgOshibka">${esc(s.ошибка)}</p>`;
    const stroki = s.строки || [];
    if (!stroki.length) return '<p class="sgPusto">Остатка по актам на паллете нет.</p>';
    const kol = (r) => Number(r["Кол-во"]) || 0;
    return `<table><thead><tr><th>Товар</th><th>Акт</th><th>Дефект</th><th class="num">Кол-во</th>
      <th class="num">Продажная ВИ МСК</th><th class="num">Закупочная</th></tr></thead><tbody>
      ${stroki.map((r) => `<tr><td>${esc(r["Товар"])}</td><td>${esc(r["Акт"])}</td><td>${esc(r["Заявленный дефект"])}</td>
        <td class="num">${chislo(r["Кол-во"])}</td><td class="num">${chislo(r["Цена продажная ВИ МСК"])}</td>
        <td class="num">${chislo(r["Цена закупочная"])}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">${stroki.length} строк · состав на ${esc(s.на || "—")}</td>
        <td class="num">${chislo(stroki.reduce((n, r) => n + kol(r), 0))}</td><td></td><td></td></tr></tfoot></table>`;
  }

  function narisovatZayavku() {
    const d = tekushaya, z = d.заявка, lot = d.лот || {};
    const zhdyot = z.status === "ждёт";
    const p = d.паллеты || [];
    const bezPlomby = p.filter((x) => !x.пломба), neVOstatkah = p.filter((x) => !x.в_остатках), nelzya = p.filter((x) => x.нельзя);
    const dvkReshil = p.filter((x) => x.двк !== null).length;
    const sbReshil = p.filter((x) => x.двк === true && x.сб !== null).length;
    const dvkOk = p.filter((x) => x.двк === true).length;
    const kOtgruzke = p.filter((x) => x.двк === true && x.сб === true);
    const sebes = p.reduce((n, x) => n + (Number(x.себестоимость) || 0), 0);
    okno(`
      <div class="sgOkno__shapka">
        <div><h2>Лот ${esc(z.lot)} · ${esc(z.ka || "контрагент не указан")}</h2>
          <p class="sgPusto">${esc(z.ka_status || "")}${z.kommentariy ? " · " + esc(z.kommentariy) : ""}</p></div>
        <button class="sgZakryt" type="button" data-zakryt aria-label="Закрыть">✕</button>
      </div>
      <div class="sgFakty">
        <div class="sgFakt"><span>Дата отгрузки</span><b>${data(z.data_otgruzki)}</b></div>
        <div class="sgFakt"><span>Склад</span><b>${esc(z.sklad || z.region || "—")}</b></div>
        <div class="sgFakt"><span>Паллет в заявке</span><b>${p.length}</b></div>
        <div class="sgFakt"><span>Себестоимость паллет</span><b>${chislo(sebes)} ₽</b></div>
        <div class="sgFakt"><span>Цена отгрузки</span><b>${lot.цена ? chislo(lot.цена) + " ₽" : "—"}</b></div>
        <div class="sgFakt"><span>Окупаемость</span><b>${lot.окуп ? (Number(lot.окуп) <= 1.5 ? Number(lot.окуп) * 100 : Number(lot.окуп)).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + "%" : "—"}</b></div>
        <div class="sgFakt"><span>Заказы</span><b>${esc((z.zakazy || "—").replace(/\n/g, ", "))}</b></div>
        <div class="sgFakt"><span>Отправил</span><b>${esc(z.sozdal || "—")} ${data(z.sozdan)}</b></div>
      </div>
      <div class="sgSluzhby">
        <div class="sgSluzhba ${z.dvk_kogda ? "is-ok" : ""}">ДВК: ${z.dvk_kogda ? `прошёл, ок ${dvkOk} из ${p.length}` : `решено ${dvkReshil} из ${p.length}`}
          <small>${z.dvk_kto ? esc(z.dvk_kto) + " " + data(z.dvk_kogda) : "ждёт"}</small></div>
        <div class="sgSluzhba ${z.sb_kogda ? "is-ok" : ""}">СБ: ${z.sb_kogda ? "прошла" : `решено ${sbReshil} из ${dvkOk}`}
          <small>${z.sb_kto ? esc(z.sb_kto) + " " + data(z.sb_kogda) : "ждёт"}</small></div>
        <div class="sgSluzhba ${z.status === "согласован" ? "is-ok" : ""}">${z.status === "согласован"
          ? `к отгрузке ${kOtgruzke.length} из ${p.length}<small>${z.kanal_kogda ? "в канал склада " + data(z.kanal_kogda) : d.канал_настроен ? "в канал не ушло" : "канал склада не настроен"}</small>`
          : esc(z.status) + "<small>&nbsp;</small>"}</div>
      </div>
      ${bezPlomby.length ? `<p class="sgPreduprezhdenie">Без пломбы ${bezPlomby.length}: ${bezPlomby.map((x) => esc(x.паллета)).join(", ")}. Пломбы подтягиваются из книги ДВК каждые 10 минут${d.пломбы_на ? ", последний раз " + data(d.пломбы_на) : ""}.</p>` : ""}
      ${neVOstatkah.length ? `<p class="sgPreduprezhdenie">Нет в остатках продаж: ${neVOstatkah.map((x) => esc(x.паллета)).join(", ")} — проверьте номер.</p>` : ""}
      ${nelzya.length ? `<p class="sgPreduprezhdenie">Продавать нельзя: ${nelzya.map((x) => esc(x.паллета) + " (" + esc(x.нельзя) + ")").join(", ")}.</p>` : ""}
      ${zhdyot && (mozhno.двк || mozhno.сб) ? `<div class="sgDeystviya">
        ${mozhno.двк ? `<button class="sgKn" type="button" data-vse="двк">Отметить все (ДВК)</button>` : ""}
        ${mozhno.сб ? `<button class="sgKn" type="button" data-vse="сб">Отметить все (СБ)</button>` : ""}
        ${mozhno.двк ? `<button class="sgKn sgKn--glav" type="button" data-sohranit="двк">Сохранить решение ДВК</button>` : ""}
        ${mozhno.сб ? `<button class="sgKn sgKn--glav" type="button" data-sohranit="сб">Сохранить решение СБ</button>` : ""}
        <span class="sgPusto">Неотмеченная галочка при сохранении — «не согласовано», спросим причину.</span>
      </div>` : ""}
      <div class="sgTabl"><table>
        <thead><tr><th>Паллета</th><th>Склад · ячейка</th><th class="num">Штук</th><th class="num">Себес, ₽</th>
          <th>Пломба</th><th>ДВК</th><th>СБ</th></tr></thead>
        <tbody>${p.map((x) => `<tr>
          <td><button class="sgPallet" type="button" data-sostav="${esc(x.паллета)}">${otkryty.has(x.паллета) ? "▾" : "▸"} ${esc(x.паллета)}</button></td>
          <td>${esc(x.склад || "—")}<span class="sgKto">${esc(x.ячейка || "")}</span></td>
          <td class="num">${chislo(x.штук)}</td><td class="num">${chislo(x.себестоимость)}</td>
          <td>${x.пломба ? `<b>${esc(x.пломба)}</b><span class="sgKto">${esc(x.пломба_кто)} ${esc(x.пломба_когда)}</span>` : '<span class="sgBezPlomby">нет пломбы</span>'}</td>
          <td>${yacheykaSluzhby(x, "двк", zhdyot)}</td>
          <td>${yacheykaSluzhby(x, "сб", zhdyot)}</td>
        </tr>${otkryty.has(x.паллета) ? `<tr class="sgSostav"><td colspan="7">${sostavHtml(x.паллета)}</td></tr>` : ""}`).join("")}</tbody>
      </table></div>
      ${zhdyot && mozhno.запрос ? `<div class="sgDeystviya"><button class="sgKn sgKn--nelzya" type="button" data-otmenit>Отменить заявку</button></div>` : ""}
    `);
  }

  async function poslat(telo) {
    const otvet = await fetch("/__soglas", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(telo),
    });
    const d = await otvet.json().catch(() => ({}));
    if (!otvet.ok) throw new Error(d.ошибка || `сервер ответил ${otvet.status}`);
    return d;
  }

  async function sohranitResheniya(sluzhba) {
    const galki = [...el("sgOknoTelo").querySelectorAll(`.sgGalka[data-sluzhba="${sluzhba}"]`)];
    if (!galki.length) return;
    const net = galki.filter((g) => !g.checked);
    let pochemu = "";
    if (net.length) {
      pochemu = prompt(`Не согласовано ${net.length} паллет. Почему? (увидят продажи и склад)`) || "";
      if (!pochemu.trim()) return;
    }
    const resheniya = {};
    galki.forEach((g) => { resheniya[g.dataset.pallet] = g.checked ? true : { ок: false, почему: pochemu }; });
    try {
      tekushaya = { ...(await poslat({ действие: "отметить", id: tekushaya.заявка.id, служба: sluzhba, решения: resheniya })), можно: mozhno };
      narisovatZayavku();
      zagruzit();
    } catch (e) {
      alert("Не сохранилось: " + (e.message || e));
    }
  }

  async function otkrytSostav(pallet) {
    if (otkryty.has(pallet)) { otkryty.delete(pallet); narisovatZayavku(); return; }
    otkryty.add(pallet);
    narisovatZayavku();
    if (!sostavy.has(pallet)) {
      try {
        const otvet = await fetch(`/__soglas/sostav?паллета=${encodeURIComponent(pallet)}`, { cache: "no-store" });
        sostavy.set(pallet, otvet.ok ? await otvet.json() : { ошибка: `сервер ответил ${otvet.status}` });
      } catch (e) {
        sostavy.set(pallet, { ошибка: String(e.message || e) });
      }
      if (tekushaya) narisovatZayavku();
    }
  }

  /* ── новая заявка ──────────────────────────────────────── */

  function formaNovoy(lot) {
    const segodnya = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    okno(`
      <div class="sgOkno__shapka"><h2>Лот на согласование отгрузки</h2>
        <button class="sgZakryt" type="button" data-zakryt aria-label="Закрыть">✕</button></div>
      <p class="sgPusto">Лот должен быть оплачен. Вставьте паллеты, как вставляли в письмо: по одной в строке
        или через «;». Пломбы, состав и себестоимость подтянутся сами.</p>
      <form class="sgForma" id="sgForma">
        <div class="sgForma__dva">
          <label>Лот<input name="лот" required value="${esc(lot || "")}" placeholder="например, 1468"></label>
          <label>Дата отгрузки<input name="дата" type="date" required value="${segodnya}"></label>
        </div>
        <label>Паллеты<textarea name="паллеты" required placeholder="Мебель (Ко)-0151551180&#10;КГТ(Ко)-0148966205"></textarea></label>
        <label>Комментарий<input name="комментарий" placeholder="если нужно — например, «вывоз двумя машинами»"></label>
        <p class="sgOshibka" id="sgFormaOshibka"></p>
        <div class="sgDeystviya"><button class="sgKn sgKn--glav" type="submit">Отправить на согласование</button>
          <button class="sgKn sgKn--tiho" type="button" data-zakryt>Отмена</button></div>
      </form>`);
    el("sgForma").addEventListener("submit", async (event) => {
      event.preventDefault();
      const f = new FormData(event.currentTarget);
      const knopka = event.currentTarget.querySelector("[type=submit]");
      knopka.disabled = true;
      try {
        const itog = await poslat({ действие: "создать", лот: f.get("лот"), дата: f.get("дата"),
          паллеты: f.get("паллеты"), комментарий: f.get("комментарий") });
        tekushaya = { ...itog, можно: mozhno };
        narisovatZayavku();
        zagruzit();
        history.replaceState(null, "", location.pathname);
      } catch (e) {
        el("sgFormaOshibka").textContent = e.message || String(e);
        knopka.disabled = false;
      }
    });
  }

  /* ── события ───────────────────────────────────────────── */

  document.addEventListener("click", (event) => {
    const t = event.target;
    const karta = t.closest(".sgKarta");
    if (karta) return otkrytZayavku(karta.dataset.id);
    if (t.closest("[data-zakryt]") || t === el("sgOkno")) return zakryt();
    const sostav = t.closest("[data-sostav]");
    if (sostav) return otkrytSostav(sostav.dataset.sostav);
    const vse = t.closest("[data-vse]");
    if (vse) {
      el("sgOknoTelo").querySelectorAll(`.sgGalka[data-sluzhba="${vse.dataset.vse}"]`).forEach((g) => { g.checked = true; });
      return;
    }
    const sohr = t.closest("[data-sohranit]");
    if (sohr) return sohranitResheniya(sohr.dataset.sohranit);
    if (t.closest("[data-otmenit]") && tekushaya && confirm("Отменить заявку на согласование?")) {
      poslat({ действие: "отменить", id: tekushaya.заявка.id }).then(() => { zakryt(); zagruzit(); })
        .catch((e) => alert(e.message || e));
    }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !el("sgOkno").hidden) zakryt(); });
  el("sgNovaya").addEventListener("click", () => formaNovoy(""));

  zagruzit().then(() => {
    const lot = new URLSearchParams(location.search).get("lot");
    if (lot && mozhno.запрос) formaNovoy(lot);
  });
  setInterval(() => { if (el("sgOkno").hidden) zagruzit(); }, 60000);
})();
