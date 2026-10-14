/* Акт целиком — «провалиться в акт» (07.10 ночь, Степан: «понять что с ним детально и посмотреть фотки; снизу в акте —
   провалиться, и оно отдельно подгрузит фотки, а не в основную сессию»).
   · AktDetal.blok(akt) — блок внизу карточки акта: кнопка → отдельный запрос /__akt/detal (своя служебная сессия WMS
     на сервере, не личная сессия сотрудника) → фото, перекладки пикалкой, ошибки ДВК, комментарии прямо в карточке.
   · data-akt-detal="<номер>" на любом элементе — то же целиком в окне (все поля акта).
   · Фото — клик во весь экран, ← → листать, Esc закрыть. */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kesh = new Map();   // акт → { zhdu } | { d } | { oshibka }
  const kl = (akt) => String(akt).replace(/\D/g, "").replace(/^0+/, "");

  async function gruzit(akt) {
    const k = kl(akt);
    const b = kesh.get(k);
    if (b && (b.zhdu || b.d)) return b;
    kesh.set(k, { zhdu: true });
    obnovitBloki(k);
    try {
      const o = await fetch(`/__akt/detal?kod=${encodeURIComponent(k)}`, { cache: "no-store" });
      const j = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(j.ошибка || `сервер ответил ${o.status}`);
      kesh.set(k, { d: j });
    } catch (e) {
      kesh.set(k, { oshibka: e.message || String(e) });
    }
    obnovitBloki(k);
    if (okno && !okno.hidden && oknoAkt === k) risovatOkno();
    return kesh.get(k);
  }
  const kartinki = (d) => (d && d.фото ? d.фото.filter((f) => f.картинка) : []);
  const src = (d, f) => `/__akt/foto?akt=${encodeURIComponent(d.акт)}&id=${encodeURIComponent(f.id)}`;

  function galereya(d) {
    const ft = kartinki(d);
    if (!ft.length) return '<p class="aktDet__pusto">В WMS у акта нет фото.</p>';
    return `<div class="aktDet__galereya">${ft.map((f, i) => `<button type="button" class="aktDet__ft" data-akt-ft="${esc(d.акт)}:${i}" title="${esc(`${f.тип} · ${f.кто} · ${f.когда}`)}"><img loading="lazy" src="${src(d, f)}" alt=""></button>`).join("")}</div>
      <p class="aktDet__pod">фото ${ft.length} · загрузил(а): ${esc([...new Set(ft.map((f) => f.кто))].join(", "))} · ${esc(ft[0].когда)}</p>`;
  }
  function istoriya(d) {
    const vz = d.возвраты || [];
    return `${vz.length ? `<section><h4>Возврат на учёт (инвентаризация) · ${vz.length}</h4>${vz.map((v) => `<p class="aktDet__str${v.ошибка ? " is-osh" : ""}"><b>${esc(v.когда)} · ${esc(v.кто)} · ${v.отмена ? "отменён" : v.готово ? "заведена на учёт" : "не вышло"}${v.инвентаризация ? ` · инвентаризация №${esc(v.инвентаризация)}` : ""}</b><span>${esc(v.ячейка)}</span><span>${esc(String(v.почему).replace(/^ОТМЕНА:\s*/, ""))}</span>${v.ошибка ? `<span>${esc(v.ошибка)}</span>` : ""}</p>`).join("")}</section>` : ""}
      ${d.ошибки.length ? `<section><h4>Ошибки ДВК по акту · ${d.ошибки.length}</h4>${d.ошибки.map((o) => `<p class="aktDet__str is-osh"><b>${esc(o.когда)} · ${esc(o.вид)}</b> на ${esc(o.контейнер || "—")} · записал(а) ${esc(o.записал)} · ошибка от: ${esc(o.виновный || "не установлен")}${o.основание ? `<span>${esc(o.основание)}</span>` : ""}${o.комментарий ? `<span>${esc(o.комментарий)}</span>` : ""}</p>`).join("")}</section>` : ""}
      ${d.комментарии.length ? `<section><h4>Комментарии в WMS</h4>${d.комментарии.map((c) => `<p class="aktDet__str"><b>${esc(c.когда)} · ${esc(c.кто)}</b> ${esc(c.текст)}</p>`).join("")}</section>` : ""}
      ${(d.довоз || []).length ? `<section><h4>Довоз — отложенные и транзитные перекладки</h4>${d.довоз.map((v) => `<p class="aktDet__str${v.st === "err" ? " is-osh" : ""}"><b>${esc(v.когда)} · ${esc(v.кто)} → ${esc(v.куда || "—")} · ${{ ok: "доехала", wait: "в пути", err: "не доехала", skip: "пикнута заново" }[v.st] || ""}</b><span>${esc(v.t)}</span></p>`).join("")}</section>` : ""}
      <section><h4>Перекладки пикалкой · ${d.перекладки.length}</h4>
        ${d.перекладки.length ? d.перекладки.map((p) => `<p class="aktDet__str${p.ошибка ? " is-osh" : ""}"><b>${esc(p.когда)} · ${esc(p.кто)}</b>${p.стол ? ` · ${esc(p.стол)}` : ""}<span>${esc(p.откуда || "—")} → ${esc(p.куда || "—")}</span>${p.ошибка ? `<span>не прошло: ${esc(p.ошибка)}</span>` : ""}</p>`).join("")
          : '<p class="aktDet__pusto">Пикалкой акт не перекладывали.</p>'}
      </section>`;
  }

  /* ---- блок внизу карточки акта ---- */
  function vnutri(k) {
    const b = kesh.get(k);
    if (!b) return `<button type="button" class="aktProval__kn" data-akt-proval-gruz="${esc(k)}"><b>Провалиться в акт</b><span>фото, перекладки, ошибки, комментарии — подгрузится отдельно</span></button>`;
    if (b.zhdu) return '<p class="aktDet__pusto">Гружу акт из WMS отдельно — карточка и пикалка работают дальше…</p>';
    if (b.oshibka) return `<p class="aktPs__net"><b class="aktPs__oshibka">${esc(b.oshibka)}</b></p><button type="button" class="aktPs__kn" data-akt-proval-gruz="${esc(k)}" data-snova="1">ещё раз</button>`;
    return `<div class="aktProval__sh"><h4>Акт изнутри</h4><button type="button" class="aktPs__kn" data-akt-detal="${esc(k)}">все поля акта</button></div>
      ${galereya(b.d)}${istoriya(b.d)}`;
  }
  function blok(akt) {
    const k = kl(akt);
    return k ? `<div class="aktProval" data-akt-proval="${esc(k)}">${vnutri(k)}</div>` : "";
  }
  function obnovitBloki(k) {
    document.querySelectorAll(`[data-akt-proval="${k}"]`).forEach((el) => { el.innerHTML = vnutri(k); });
  }
  /* ---- окно «все поля» ----
     14.10 Степан: «меню очень мелкое и неграмотное — суть акта». Сверху — где штука сейчас и что делать, потом поля
     акта группами и человеческими словами, история (перекладки, возвраты на учёт), фото. */
  const GRUPPY = [
    ["Что с товаром", ["Вид обращения", "Требование клиента", "Заявленный дефект", "Качество", "Комплектность", "Внешний вид",
      "Вскрыт", "Упаковка есть", "Повреждён", "Заправлялся", "Серийный номер"]],
    ["Деньги и продажа", ["Цена", "Дата продажи", "Заказ, по которому продан", "Поставщик"]],
    ["Откуда и куда", ["Тип СЦ", "Сервисный центр", "Где принят", "Принят", "Куда", "Решение оценки", "Срок"]],
    ["Документ", ["Дата акта", "Статус", "Создал", "Изменил", "Изменён"]],
  ];
  const PODPIS = { "Вскрыт": "Вскрывали", "Упаковка есть": "Упаковка на месте", "Повреждён": "Мех. повреждения",
    "Заправлялся": "Топливо / заправка", "Где принят": "Склад приёмки", "Куда": "Куда едет по акту", "Тип СЦ": "Чей сервис",
    "Принят": "Дата приёмки", "Изменён": "Последнее изменение", "Цена": "Цена в акте, ₽" };
  const DA_NET = { "Да": "да", "Нет": "нет" };
  function polyaGruppami(d) {
    const vse = new Map(d.поля.map((p) => [p.имя, p.знач]));
    const byli = new Set();
    const gr = GRUPPY.map(([zag, imena]) => {
      const str = imena.filter((i) => vse.has(i)).map((i) => { byli.add(i); return [PODPIS[i] || i, DA_NET[vse.get(i)] || vse.get(i)]; });
      return str.length ? `<section class="aktDet__gr"><h4>${esc(zag)}</h4><dl class="aktDet__polya">${str.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>` : "";
    }).join("");
    const prochee = d.поля.filter((p) => !byli.has(p.имя));
    return gr + (prochee.length ? `<section class="aktDet__gr"><h4>Ещё</h4><dl class="aktDet__polya">${prochee.map((p) => `<dt>${esc(p.имя)}</dt><dd>${esc(p.знач)}</dd>`).join("")}</dl></section>` : "");
  }
  /* 14.10 Степан: «нужна карточная система — ты ставил так же всё мелко; в чём суть?». Как карточка пикалки: сверху
     суть акта (что случилось с товаром) крупно, дальше плитки «подпись — крупное значение», да/нет — одной плиткой. */
  function kartochki(d) {
    const v = new Map(d.поля.map((p) => [p.имя, p.знач]));
    const da = (k) => DA_NET[v.get(k)] || v.get(k);
    const sut = `<div class="aktDet__sut"><p class="aktDet__nad">Суть акта${v.get("Вид обращения") ? ` · ${esc(v.get("Вид обращения"))}` : ""}</p>
      <p class="aktDet__defekt">${esc(v.get("Заявленный дефект") || "дефект не указан")}</p>
      ${v.get("Требование клиента") ? `<p class="aktDet__treb">клиент хочет: ${esc(v.get("Требование клиента"))}</p>` : ""}</div>`;
    const plitka = (pod, zn, shir) => (zn ? `<div class="aktDet__pl${shir ? " is-shir" : ""}"><span>${esc(pod)}</span><b>${esc(zn)}</b></div>` : "");
    const flagi = [["Вскрывали", "Вскрыт"], ["Упаковка", "Упаковка есть"], ["Мех. повреждения", "Повреждён"], ["Топливо", "Заправлялся"]]
      .filter(([, k]) => v.has(k)).map(([pod, k]) => `<i class="${v.get(k) === "Да" ? "is-da" : ""}">${esc(pod)}: <b>${esc(da(k))}</b></i>`).join("");
    const cena = v.get("Цена") ? `${Number(v.get("Цена")).toLocaleString("ru-RU")} ₽` : "";
    const sozdal = v.get("Создал") ? `${v.get("Создал")}${v.get("Дата акта") ? ` · ${String(v.get("Дата акта")).slice(0, 16)}` : ""}` : "";
    const plitki = [
      plitka("Качество", v.get("Качество")), plitka("Комплектность", v.get("Комплектность")), plitka("Цена в акте", cena),
      plitka("Внешний вид", v.get("Внешний вид")), plitka("Серийный номер", v.get("Серийный номер")),
      plitka("Статус акта", v.get("Статус")), plitka("Сервисный центр", v.get("Сервисный центр")),
      plitka("Склад приёмки", v.get("Где принят")), plitka("Куда едет по акту", v.get("Куда")),
      plitka("Дата продажи", v.get("Дата продажи")), plitka("Поставщик", v.get("Поставщик"), true),
      plitka("Решение оценки", v.get("Решение оценки")), plitka("Акт создал", sozdal, true),
    ].join("");
    return `${sut}<div class="aktDet__plitki">${plitki}${flagi ? `<div class="aktDet__pl is-shir"><span>Состояние при приёмке</span><p class="aktDet__flagi">${flagi}</p></div>` : ""}</div>`;
  }
  /* 14.10 Степан: «мне должно в этом окне показать ВСЁ, не прокручивать; что уже видел в карточке — не ключевое,
     остальные детали крупно; я сразу хочу сфотать». Один экран: кнопка фото сверху, фото слева, справа плитки только
     того, чего нет в карточке акта, внизу история одной строкой на событие. */
  const FT_TIPY = [[2, "Фото товара"], [11, "Фото неисправности"], [10, "Шильдик"]];
  let ftTip = 2;
  let ftNovye = [];     // [{url, b64}] — снято, ещё не отправлено
  let ftIdet = "";
  let ftItog = null;    // {ok, tekst}
  function plitkiNeKarta(d) {
    const v = new Map(d.поля.map((p) => [p.имя, p.знач]));
    const dt = (x) => String(x || "").slice(0, 16);
    const pl = (pod, zn) => (zn ? `<div class="aktDet__pl"><span>${esc(pod)}</span><b>${esc(zn)}</b></div>` : "");
    return [
      pl("Статус акта", v.get("Статус")), pl("Требование клиента", v.get("Требование клиента")),
      pl("Внешний вид", v.get("Внешний вид")), pl("Решение оценки", v.get("Решение оценки")),
      pl("Склад приёмки", [v.get("Где принят"), dt(v.get("Принят"))].filter(Boolean).join(" · ")),
      pl("Куда едет по акту", v.get("Куда")), pl("Чей сервис", v.get("Тип СЦ")),
      pl("Поставщик", v.get("Поставщик")), pl("Заказ продажи", v.get("Заказ, по которому продан")), pl("Срок", v.get("Срок")),
      pl("Акт создал", [v.get("Создал"), dt(v.get("Дата акта"))].filter(Boolean).join(" · ")),
      pl("Последний изменил", [v.get("Изменил"), dt(v.get("Изменён"))].filter(Boolean).join(" · ")),
    ].join("");
  }
  function istoriyaKorotko(d) {
    const str = [];
    (d.возвраты || []).forEach((x) => str.push([x.когда, `${x.кто} · ${x.отмена ? "возврат на учёт отменён" : x.готово ? "заведена на учёт" : "возврат на учёт не вышел"}${x.инвентаризация ? ` · инв. №${x.инвентаризация}` : ""}`, x.ошибка]));
    (d.перекладки || []).forEach((x) => str.push([x.когда, `${x.кто} · ${x.откуда || "—"} → ${x.куда || "—"}`, x.ошибка]));
    (d.довоз || []).forEach((x) => str.push([x.когда, `${x.кто} · довоз на ${x.куда || "—"} · ${x.t || ""}`, x.st === "err"]));
    (d.ошибки || []).forEach((x) => str.push([x.когда, `ошибка ДВК: ${x.вид} · ${x.контейнер || ""} · от ${x.виновный || "не установлен"}`, true]));
    (d.комментарии || []).forEach((x) => str.push([x.когда, `${x.кто}: «${x.текст}»`, false]));
    if (!str.length) return '<p class="aktDet__pusto">С актом на сайте ничего не делали.</p>';
    return `<ul class="aktDet__lenta">${str.map(([k, t, osh]) => `<li class="${osh ? "is-osh" : ""}"><b>${esc(k)}</b> ${esc(t)}</li>`).join("")}</ul>`;
  }
  function blokFoto(d) {
    const est = kartinki(d);
    const novye = ftNovye.length ? `<div class="aktDet__novye">${ftNovye.map((f, i) => `<span><img src="${f.url}" alt=""><button type="button" data-ft-ubrat="${i}" title="убрать">×</button></span>`).join("")}</div>
      <button type="button" class="aktDet__ftOtp" data-ft-otpr="1"${ftIdet ? " disabled" : ""}>${ftIdet ? esc(ftIdet) : `Отправить в акт ${ftNovye.length} фото · ${esc(FT_TIPY.find((x) => x[0] === ftTip)[1].toLowerCase())}`}</button>` : "";
    return `<div class="aktDet__ftPult">
        <label class="aktDet__ftKn"><input type="file" accept="image/*" capture="environment" multiple data-ft-vybor="1" hidden>📷 Сфотать в акт</label>
        <div class="aktDet__ftTipy">${FT_TIPY.map(([id, im]) => `<button type="button" class="${id === ftTip ? "is-on" : ""}" data-ft-tip="${id}">${esc(im)}</button>`).join("")}</div>
      </div>
      ${novye}
      ${ftItog ? `<p class="aktDet__ftItog${ftItog.ok ? "" : " is-osh"}">${esc(ftItog.tekst)}</p>` : ""}
      <div class="aktDet__ftEst">${est.length ? galereya(d) : '<p class="aktDet__pusto">В акте фото нет — сфотайте.</p>'}</div>`;
  }
  async function szhat(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, ne) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ne; i.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const b64 = c.toDataURL("image/jpeg", 0.85);
      return { url: b64, b64 };
    } finally { URL.revokeObjectURL(url); }
  }
  async function otpravitFoto() {
    if (!ftNovye.length || ftIdet) return;
    ftIdet = "Отправляю в WMS…"; ftItog = null; risovatOkno();
    try {
      const o = await fetch("/__akt/foto_v_akt", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ акт: oknoAkt, тип: ftTip, фото: ftNovye.map((f) => f.b64) }) });
      const j = await o.json().catch(() => ({}));
      if (!o.ok) throw new Error(j.нужен_вход ? "войдите в WMS (кнопка вверху пикалки) — фото уходят от вашего имени" : (j.ошибка || `сервер ответил ${o.status}`));
      ftItog = { ok: true, tekst: `В акт добавлено ${j.добавлено} фото (${j.тип.toLowerCase()}). Было ${j.было}, стало ${j.стало}.` };
      ftNovye = [];
      kesh.delete(oknoAkt); ftIdet = ""; gruzit(oknoAkt);
    } catch (e) {
      ftItog = { ok: false, tekst: `Не отправилось: ${e.message || e}` };
    }
    ftIdet = ""; risovatOkno();
  }
  document.addEventListener("change", async (e) => {
    const inp = e.target.closest && e.target.closest("[data-ft-vybor]");
    if (!inp || !inp.files || !inp.files.length) return;
    ftItog = null;
    for (const f of [...inp.files].slice(0, 8 - ftNovye.length)) {
      try { ftNovye.push(await szhat(f)); } catch (er) { ftItog = { ok: false, tekst: "фото не открылось" }; }
    }
    risovatOkno();
  }, true);
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-ft-tip]");
    if (t) { e.stopPropagation(); ftTip = Number(t.dataset.ftTip); risovatOkno(); return; }
    const u = e.target.closest("[data-ft-ubrat]");
    if (u) { e.stopPropagation(); ftNovye.splice(Number(u.dataset.ftUbrat), 1); risovatOkno(); return; }
    if (e.target.closest("[data-ft-otpr]")) { e.stopPropagation(); otpravitFoto(); }
  }, true);
  function seychas(d) {
    const s = d.сейчас || {};
    if (s.ошибка) return `<div class="aktDet__seychas"><p class="aktDet__gde">Где штука сейчас — WMS не ответила</p><p class="aktDet__chto">${esc(s.ошибка)}</p></div>`;
    const g = (s.где || [])[0];
    const kat = s.категория ? `<p class="aktDet__kat">категория уценки: <b>${esc(s.категория)}</b></p>` : "";
    const vz = (d.возвраты || []).slice(-1)[0];
    let gde, chto, cvet = "";
    if (g) {
      gde = `Лежит: ${esc(g.ячейка)}${g.паллета ? ` · на паллете ${esc(g.паллета)}` : " · без паллеты"}`;
      const pod = `${g.база ? `склад ${esc(g.база)}` : ""}${g.качество ? ` · качество ${esc(g.качество).toLowerCase()}` : ""}${g.заказ ? ` · в заказе ${esc(g.заказ)}` : ""}`;
      gde += pod ? `<span>${pod}</span>` : "";
      if (/стол|завед|контроль уценки/i.test(`${g.ячейка} ${g.зона || ""}`) && !g.паллета) {
        chto = `Штука на столе, в паллету ещё не положена. Пикните акт в пикалке, потом паллету${s.категория ? ` «${esc(s.категория)}»` : ""} — переедет в неё.`;
        cvet = " is-zhdu";
      } else if (g.паллета) chto = "Разложена на паллету — делать ничего не нужно.";
      else chto = "Лежит в ячейке без паллеты.";
    } else if (s.транзит && (s.транзит.едет || s.транзит.причина)) {
      gde = "Едет через транзит — по WMS ещё в пути";
      chto = s.транзит.причина ? `Не доехала: ${esc(s.транзит.причина)}` : "Доедет сама, перекладывать не нужно.";
    } else {
      // почему не числится — из причины возврата: «по вмс штука ушла со склада: 28.08.2026 · Списание товаров №338567 · …»
      const pr = (d.возвраты || []).map((v) => String(v.почему).match(/(ушла со склада|списана)[^:]*:\s*(.*?№\s*\d+)/)).find(Boolean);
      gde = `По WMS на складе не числится${pr ? `<span>${esc(pr[1])}: ${esc(pr[2])}</span>` : ""}`;
      chto = vz && vz.отмена ? "Ошибочный возврат на учёт отменён — акт как был. Обработают по обычному процессу; если штука найдётся в руках — пикните акт в пикалке, потом паллету."
        : "Не принята, списана или ушла. Если штука у вас в руках — пикните акт в пикалке: она скажет, что делать, и ничего не запишет в WMS до пика паллеты. Если штуки нет — ничего не делайте.";
      cvet = " is-net";
    }
    return `<div class="aktDet__seychas${cvet}"><p class="aktDet__nad">Сейчас</p><p class="aktDet__gde">${gde}</p>${kat}<p class="aktDet__chto">${chto}</p></div>`;
  }
  let okno = null;
  let oknoAkt = "";
  function risovatOkno() {
    if (!okno) { okno = document.createElement("div"); okno.id = "aktDetal"; okno.className = "cModal aktDet"; document.body.appendChild(okno); }
    const b = kesh.get(oknoAkt) || {};
    const d = b.d;
    const telo = b.zhdu || !b.d ? `<p class="aktDet__pusto">${b.oshibka ? `Не открылось: ${esc(b.oshibka)}` : "Открываю акт в WMS…"}</p>`
      : `<div class="aktDet__ekran"><section class="aktDet__foto">${blokFoto(d)}</section>
          <section class="aktDet__info"><div class="aktDet__plitki">${plitkiNeKarta(d)}</div>
            <h3>История</h3>${istoriyaKorotko(d)}
            <details class="aktDet__vse"><summary>все поля акта как в WMS</summary>${polyaGruppami(d)}</details></section></div>`;
    okno.innerHTML = `<div class="cModal__fon" data-akt-det-zakr="1"></div>
      <section class="cModal__okno cModal__okno--shir aktDet__okno" role="dialog" aria-label="Акт целиком">
        <header class="cModal__sh aktDet__sh"><div><b>Акт ${esc(d ? d.акт : oknoAkt)}</b>${d ? `<p class="aktDet__tovar">${esc(d.товар)}</p><span>${esc(d.наклейка)} · живьём из WMS</span>` : ""}</div>
          <button type="button" class="cBtn cBtn--sm" data-akt-det-zakr="1">закрыть</button></header>
        <div class="aktDet__telo">${telo}</div></section>`;
    okno.hidden = false;
  }
  function otkryt(akt) { const k = kl(akt); if (k !== oknoAkt) { ftNovye = []; ftItog = null; } oknoAkt = k; risovatOkno(); gruzit(oknoAkt); }

  /* ---- фото во весь экран ---- */
  let ves = null;   // { k, i }
  function risovatVes() {
    let el = document.getElementById("aktDetVes");
    const d = ves && (kesh.get(ves.k) || {}).d;
    const ft = kartinki(d);
    if (!ves || !ft[ves.i]) { if (el) el.remove(); ves = null; return; }
    if (!el) { el = document.createElement("div"); el.id = "aktDetVes"; el.className = "aktDet__ves"; el.dataset.aktFtZakr = "1"; document.body.appendChild(el); }
    const f = ft[ves.i];
    el.innerHTML = `<img src="${src(d, f)}" alt="">
      <p>${ves.i + 1} из ${ft.length} · ${esc(f.тип)} · ${esc(f.кто)} · ${esc(f.когда)} · Esc — закрыть, ← → — листать</p>
      ${ft.length > 1 ? '<button type="button" class="aktDet__nazad" data-akt-ft-shag="-1">‹</button><button type="button" class="aktDet__vpered" data-akt-ft-shag="1">›</button>' : ""}`;
  }
  function shag(n) { const k = kartinki((kesh.get(ves.k) || {}).d).length; if (!k) return; ves.i = (ves.i + n + k) % k; risovatVes(); }

  document.addEventListener("click", (e) => {
    const sh = e.target.closest("[data-akt-ft-shag]");
    if (sh && ves) { e.preventDefault(); e.stopPropagation(); shag(Number(sh.dataset.aktFtShag)); return; }
    if (e.target.closest("[data-akt-ft-zakr]")) { e.stopPropagation(); ves = null; risovatVes(); return; }
    const ft = e.target.closest("[data-akt-ft]");
    if (ft) { e.preventDefault(); e.stopPropagation(); const [k, i] = ft.dataset.aktFt.split(":"); ves = { k, i: Number(i) }; risovatVes(); return; }
    const gr = e.target.closest("[data-akt-proval-gruz]");
    if (gr) { e.preventDefault(); e.stopPropagation(); if (gr.dataset.snova) kesh.delete(gr.dataset.aktProvalGruz); gruzit(gr.dataset.aktProvalGruz); return; }
    const otk = e.target.closest("[data-akt-detal]");
    if (otk) { e.preventDefault(); e.stopPropagation(); otkryt(otk.dataset.aktDetal); return; }
    if (okno && !okno.hidden && e.target.closest("[data-akt-det-zakr]")) { e.stopPropagation(); okno.hidden = true; }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (ves) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); ves = null; risovatVes(); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); shag(e.key === "ArrowLeft" ? -1 : 1); }
      return;
    }
    if (okno && !okno.hidden && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); okno.hidden = true; }
  }, true);

  window.AktDetal = { otkryt, blok, gruzit };
})();
