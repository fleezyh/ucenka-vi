/* Светлая тема на всём сайте (24.09: «везде светлую тему добавить»).
 *
 * Раньше она была только в продажах и CRM, и у каждой свой ключ и своя
 * кнопка: включил в продажах — в CRM снова тёмная. Теперь ключ один, «tema»,
 * а старые ключи пишем тоже, чтобы их собственные кнопки не спорили с общей.
 * Сама тема — класс body.is-svetlo: переменные переопределяет style.css,
 * остальное — site-header.css.
 */
(() => {
  "use strict";
  const sohr = () => {
    const t = localStorage.getItem("tema");
    if (t) return t === "svet";
    return localStorage.getItem("vt-tema") === "svet" || localStorage.getItem("crmTema") === "svetlo";
  };
  /* Осветлитель. Разделы писались под тёмный фон, и цвета в них часто зашиты
   * прямо в стилях, а не на переменных, — переписывать десяток таблиц стилей
   * ради второй темы долго и хрупко. Поэтому в светлой теме смотрим, что
   * браузер реально нарисовал: тёмные подложки становятся белыми, светлый
   * текст на них — тёмным. Метим классами sv-*, в тёмной теме они ничего не
   * делают. Цветные плашки и кнопки не трогаем: там светлый текст на своём
   * цвете и так читается. */
  const rgb = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const yarkost = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  // Сколько в цвете цвета: разброс каналов в долях шкалы. Относительная
  // насыщенность не годится — у тёмно-синего #0e1726 она 0,63, и такая
  // подложка сходила за «цветную плашку».
  const nasyshchennost = (c) => (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
  const PROPUSK = ".topbar, .temaKn, svg image, canvas, video, img";
  function osvetlit(korni = [document.body]) {
    if (!document.body.classList.contains("is-svetlo")) return;
    // Смотрим только то, что появилось или поменялось, а не всю страницу:
    // проход идёт до отрисовки, и он должен быть коротким.
    const vse = [];
    for (const k of korni) {
      if (!(k instanceof Element) || !k.isConnected) continue;
      vse.push(k, ...k.querySelectorAll("*"));
    }
    for (const uz of vse) {
      if (uz.closest(PROPUSK) || uz.dataset.sv) continue;
      const st = getComputedStyle(uz);
      let fon = rgb(st.backgroundColor);
      // Подложка из одного градиента (стекло помощника, «гостевой режим» в
      // кабинете): цвет фона прозрачный, тёмное — в картинке. Судим по
      // первому цвету градиента.
      if ((!fon || fon.a <= 0.25) && /(linear|radial)-gradient/.test(st.backgroundImage)) {
        const pervyy = rgb(st.backgroundImage);
        if (pervyy && pervyy.a > 0.25 && yarkost(pervyy) < 0.3 && nasyshchennost(pervyy) < 0.25) {
          uz.classList.add("sv-grad");
          fon = pervyy;
        }
      }
      // Тёмная подложка: почти без цвета и тёмная. Насыщенные (красная
      // плашка «горит», зелёная кнопка) оставляем как есть.
      if (fon && fon.a > 0.25 && yarkost(fon) < 0.3 && nasyshchennost(fon) < 0.25) {
        uz.classList.add(uz.parentElement && uz.parentElement.closest(".sv-bg") ? "sv-bg2" : "sv-bg");
      }
      // Тёмные подсветки-градиенты на белом выглядят грязью — снимаем. Но не
      // conic: им рисуют круговые диаграммы (остатки паллет).
      if (st.backgroundImage && /(linear|radial)-gradient/.test(st.backgroundImage)
          && !/conic-gradient/.test(st.backgroundImage) && fon && fon.a > 0.25 && yarkost(fon) < 0.3) {
        uz.classList.add("sv-grad");
      }
      uz.dataset.sv = "1";
    }
    // Текст — вторым проходом: подложки уже помечены, видно, на чём он лежит.
    for (const uz of vse) {
      if (uz.closest(PROPUSK) || uz.dataset.svt) continue;
      uz.dataset.svt = "1";
      const st = getComputedStyle(uz);
      const svg = uz instanceof SVGElement;
      const cvet = rgb(svg ? st.fill : st.color);
      if (!cvet || cvet.a < 0.2) continue;
      if (svg && !/^(text|tspan)$/i.test(uz.tagName)) continue;
      // На чём лежит: первая непрозрачная подложка выше.
      let pod = uz, fonPod = null;
      while (pod && pod !== document.body) {
        const f = rgb(getComputedStyle(pod).backgroundColor);
        if (f && f.a > 0.25) { fonPod = f; break; }
        pod = pod.parentElement;
      }
      const naTyomnom = !fonPod || pod.classList.contains("sv-bg") || pod.classList.contains("sv-bg2")
        || (yarkost(fonPod) < 0.3 && nasyshchennost(fonPod) < 0.25);
      const y = yarkost(cvet), n = nasyshchennost(cvet);
      if (!naTyomnom) {
        // На светлом тоже бывает нечитаемое: пастельные зелёный и красный,
        // рассчитанные на тёмный фон, и белый текст на побелевшей кнопке.
        if (y > 0.6 && n >= 0.2) uz.classList.add(svg ? "sv-fill3" : "sv-deep");
        else if (y > 0.9 && yarkost(fonPod) > 0.85) uz.classList.add(svg ? "sv-fill" : "sv-tx");
        continue;
      }
      if (y > 0.72 && n < 0.2) uz.classList.add(svg ? "sv-fill" : "sv-tx");
      else if (y > 0.42 && n < 0.2) uz.classList.add(svg ? "sv-fill2" : "sv-mut");
      else if (y > 0.55 && n >= 0.2) uz.classList.add(svg ? "sv-fill3" : "sv-deep");
    }
  }
  /* Перекраска — до того, как браузер нарисует новое. Колбэк наблюдателя
   * выполняется раньше отрисовки, поэтому блоки, которые скрипт раздела
   * дорисовал после загрузки, сразу появляются светлыми. Раньше проход шёл
   * через 120 мс, и карточки успевали мелькнуть тёмными и «перетечь» в белые:
   * у многих стоит плавная смена фона. На время прохода переходы выключены. */
  const proyti = (korni) => {
    const html = document.documentElement;
    html.classList.add("sv-bez-anim");
    osvetlit(korni);
    nablyudatel.takeRecords();
    requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove("sv-bez-anim")));
  };
  const pozzhe = () => proyti([document.body]);
  const nablyudatel = new MutationObserver((spisok) => {
    // Свою кнопку темы есть ещё у продаж и CRM. Щёлкнули её — запоминаем
    // выбор в общем ключе и перерисовываем общую кнопку, иначе на следующей
    // странице тема вернулась бы назад.
    if (spisok.some((m) => m.target === document.body)) {
      const svet = document.body.classList.contains("is-svetlo");
      if ((localStorage.getItem("tema") === "svet") !== svet) {
        localStorage.setItem("tema", svet ? "svet" : "temn");
        localStorage.setItem("vt-tema", svet ? "svet" : "temno");
        localStorage.setItem("crmTema", svet ? "svetlo" : "temno");
      }
      document.documentElement.classList.toggle("is-svetlo", svet);
      document.querySelectorAll(".temaKn").forEach((kn) => kn.setAttribute("aria-pressed", String(svet)));
      if (svet) { proyti([document.body]); return; }
    }
    if (!document.body.classList.contains("is-svetlo")) return;
    const korni = [];
    for (const m of spisok) {
      if (m.type === "childList") {
        m.addedNodes.forEach((uz) => { if (uz instanceof Element) korni.push(uz); });
        // Сменился текст — пересмотреть родителя: у текста мог смениться цвет.
        if (m.target instanceof Element && !m.addedNodes.length) continue;
      } else if (m.target instanceof Element && m.target !== document.documentElement
                 && m.target !== document.body && !m.target.closest(".topbar")) {
        // <html> и <body> меняем мы сами (служебные классы темы) — это не повод
        // перекрашивать всю страницу, иначе проход гонял бы себя по кругу.
        // Класс сменил сам раздел (вкладка, активная кнопка) — узел и его
        // потомков смотрим заново.
        const t = m.target;
        [t, ...t.querySelectorAll("*")].forEach((u) => { delete u.dataset.sv; delete u.dataset.svt; });
        korni.push(t);
      }
    }
    if (korni.length) proyti(korni);
  });
  nablyudatel.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  const primenit = (svet) => {
    document.body.classList.toggle("is-svetlo", svet);
    document.documentElement.classList.toggle("is-svetlo", svet);
    document.querySelectorAll(".temaKn").forEach((kn) => {
      kn.setAttribute("aria-pressed", String(svet));
      kn.title = svet ? "Тёмная тема" : "Светлая тема";
    });
    if (svet) pozzhe();
  };
  primenit(sohr());
  // tema.js прячет страницу в светлой теме до первого прохода — показываем.
  if (document.body.classList.contains("is-svetlo")) proyti([document.body]);
  document.documentElement.classList.remove("sv-zhdyom");

  const topbar = document.querySelector(".topbar");
  // Переключатель темы — только в кабинете (27.09: «смену темы только внутри оставь»).
  // Сама выбранная тема по-прежнему применяется на всех страницах.
  if (topbar && !topbar.querySelector(".temaKn") && location.pathname.startsWith("/__account")) {
    const kn = document.createElement("button");
    kn.type = "button";
    kn.className = "temaKn";
    kn.setAttribute("aria-label", "Светлая или тёмная тема");
    kn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="temaKn__sun" cx="12" cy="12" r="4.2"/>'
      + '<path class="temaKn__luchi" d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>'
      + '<path class="temaKn__luna" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
    kn.addEventListener("click", () => {
      const svet = !document.body.classList.contains("is-svetlo");
      localStorage.setItem("tema", svet ? "svet" : "temn");
      localStorage.setItem("vt-tema", svet ? "svet" : "temno");
      localStorage.setItem("crmTema", svet ? "svetlo" : "temno");
      primenit(svet);
      // Разделам, которые рисуют графики в JS, — повод перерисоваться.
      document.dispatchEvent(new CustomEvent("tema", { detail: { svet } }));
    });
    topbar.appendChild(kn);
    primenit(document.body.classList.contains("is-svetlo"));
  }
})();

(() => {
  "use strict";
  const host = document.querySelector(".topbar, .site-nav");
  const nav = document.querySelector(".siteNav, .site-nav__actions");
  if (!host || !nav) return;
  if (nav.dataset.static === "true") return;

  document.body.classList.add("nav-enhanced");
  const button = document.createElement("button");
  button.className = "navMenuButton";
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "site-sections");
  button.innerHTML = '<span aria-hidden="true"><i></i><i></i></span>Разделы';
  nav.id ||= "site-sections";
  host.insertBefore(button, nav);

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
  }

  button.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      button.focus();
    }
  });
  matchMedia("(min-width: 641px)").addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });

  /* Шапка при прокрутке.
   *
   * Подложка появляется, только когда под шапку заехало содержимое, а сама
   * шапка уезжает вверх, пока читают вниз, и возвращается от движения вверх.
   * Раньше она висела всё время тёмной перекладиной поперёк экрана — это и
   * была та самая «чёрная полоса». */
  const bar = document.querySelector(".shell > .topbar");
  if (bar) {
    let bylo = window.scrollY;
    const sync = () => {
      const teper = window.scrollY;
      bar.classList.toggle("is-stuck", teper > 8);
      // Прячем только при заметном движении вниз и не у самого верха:
      // иначе шапка дёргается от каждого касания тачпада.
      if (teper > 140 && teper - bylo > 6) bar.classList.add("is-hidden");
      if (teper < bylo - 6 || teper <= 140) bar.classList.remove("is-hidden");
      bylo = teper;
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
  }
})();

/* Блок входа в шапке.
 *
 * Сайт закрыт логином, но пока он был открыт, ничего про пользователя на
 * странице не было: ни кто ты, ни как сменить пароль, ни как выйти. Страница
 * смены пароля есть, но найти её можно было только по прямому адресу.
 *
 * Гейт отвечает на /__me именем и ролью; если ответа нет — блок просто не
 * появляется, и на локальной копии сайта ничего не меняется.
 */
(() => {
  "use strict";
  const nav = document.querySelector(".siteNav, .site-nav__actions");
  if (!nav) return;

  /* Шапка по контурам (28.09, Степан: «блок верхней менюшки старый остался»).
   * Вместо «Антигенерация · Хитмап · Продажи · Производительность» — четыре контура,
   * у каждого при наведении его страницы. Состав — ровно вкладки самих разделов,
   * как на главной. Куда нет прав — пункта нет; контур без пунктов пропадает. */
  const KONTURY = [
    { imya: "Управленческий", razdel: ["/heatmap", "/zp/fot"],
      pod: [["Хитмап", "/heatmap/", "heatmap"], ["ФОТ", "/zp/fot", "salary_team"]] },
    { imya: "Операционный", razdel: ["/perf", "/people", "/launch", "/priyomka"],
      pod: [["Производительность", "/perf/", "perf"], ["Паноптикум", "/people/", "people"],
            ["Данилово", "/launch/", "perf"], ["Приёмка ДМД", "/priyomka/", ""]] },
    { imya: "Проектный", razdel: ["/antigen"],
      pod: [["Брак", "/antigen/", "antigen"], ["Отправка ОЛ с регионов", "/antigen/mashiny/", "mashiny"], ["Экономика позиций", "/antigen/ekonomika/", "antigen"]] },
    { imya: "Коммерческий", razdel: ["/sales", "/crm", "/soglas"],
      pod: [["Остатки и отгрузки", "/sales/", "sales"], ["Аналитика отгрузок", "/sales/analitika/", "sales"],
            ["CRM продаж", "/crm/", "crm"]] },
  ];
  (function perestroitShapku() {
    const gruppa = [...nav.querySelectorAll(".navGroup")]
      .find((g) => g.querySelector('a[href*="antigen"], a[href*="heatmap"], a[href*="perf"]'));
    if (!gruppa) return;
    const put = location.pathname;
    gruppa.innerHTML = KONTURY.map((k) => {
      const tut = k.razdel.some((r) => put.startsWith(r));
      return `<span class="navKonturWrap"><a class="navLink navKontur" href="${k.pod[0][1]}"${tut ? ' aria-current="page"' : ""}>${k.imya}</a>`
        + `<span class="navPod">${k.pod.map(([n, h, p]) =>
          `<a href="${h}" data-pravo="${p}"${put === h.split("#")[0] ? ' class="is-on"' : ""}>${n}</a>`).join("")}</span></span>`;
    }).join("");
    if (!document.getElementById("navKonturyStil")) {
      const st = document.createElement("style");
      st.id = "navKonturyStil";
      st.textContent = ".navKonturWrap{position:relative;display:inline-flex}"
        + ".navPod{position:absolute;top:calc(100% + 10px);left:-6px;z-index:80;min-width:220px;display:none;flex-direction:column;gap:2px;padding:6px;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(12,13,19,.97);box-shadow:0 18px 44px rgba(0,0,0,.45)}"
        + ".navPod::before{content:'';position:absolute;left:0;right:0;top:-12px;height:12px}"
        + ".navKonturWrap:hover .navPod,.navKonturWrap:focus-within .navPod{display:flex}"
        + ".navPod a{padding:10px 13px;border-radius:10px;color:#c9d2de;font-size:14px;font-weight:600;white-space:nowrap;text-decoration:none}"
        + ".navPod a:hover,.navPod a.is-on{background:rgba(255,255,255,.08);color:#fff}"
        + "body.is-svetlo .navPod{background:#fff;border-color:#d3dae5;box-shadow:0 18px 44px rgba(20,30,50,.18)}"
        + "body.is-svetlo .navPod a{color:#26303d}body.is-svetlo .navPod a:hover,body.is-svetlo .navPod a.is-on{background:#eef2f7;color:#0b0d12}";
      document.head.appendChild(st);
    }
  })();
  function filtrKontury(prava) {
    const vse = !Array.isArray(prava) || prava.includes("*");
    nav.querySelectorAll(".navKonturWrap").forEach((w) => {
      w.querySelectorAll(".navPod a").forEach((a) => {
        const p = a.dataset.pravo;
        if (!vse && p && !prava.includes(p)) a.remove();
      });
      const ost = w.querySelectorAll(".navPod a");
      if (!ost.length) { w.remove(); return; }
      w.querySelector(".navKontur").setAttribute("href", ost[0].getAttribute("href"));
    });
  }

  fetch("/__me", { credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : null))
    .then((user) => {
      if (!user || !user.login) return;
      // Ровно такая же группа, как «Уценка» и «Инструменты»: имя человека тут
      // ничего не решает — он и так знает, кто он, — а блок из-за него выпадал
      // из общего ряда. Админка живёт в кабинете, отдельной кнопки не нужно.
      const box = document.createElement("span");
      box.className = "navGroup navGroup--account";
      box.title = String(user.name || user.login);
      // Зарплата — часть кабинета, а не отдельный раздел сайта: это личные
      // деньги человека, а не общая витрина.
      const prava = user["права"] || [];
      const mozhet = (pravo) => prava.includes("*") || prava.includes(pravo);
      const zp = mozhet("salary")
        ? '<a class="navLink" href="/zp/">Зарплата</a>' : "";
      // Панель ФОТ уже находится внутри «Зарплаты». Отдельную ссылку в шапке
      // не показываем, но серверные права salary_team не меняем.
      // 27.09 Степан: «зарплату засунуть в кабинет — чтоб осталось только кабинет и выйти».
      // Вход в зарплату — карточка «Заработано в этом месяце → Открыть» в кабинете.
      void zp;
      box.innerHTML = '<a class="navLink" href="/__account">Кабинет</a>'
        + '<a class="navLink" href="/__logout">Выйти</a>';
      nav.appendChild(box);
      // Панель отладки запросов — только админу и только ему грузится:
      // остальным она не нужна, а показывать всем устройство расчётов незачем.
      // Идёт первой: ниже — работа с шапкой, и её ошибка на какой-нибудь
      // странице утащила бы панель за собой, а общий catch промолчал бы.
      // 27.09 Степан: «sql страницы убирай везде пока» — панель выключена, файл на месте.
      if (false && user.role === "admin") {
        const skript = document.createElement("script");
        skript.src = "/debug-sql.js?v=20260919-6";
        skript.defer = true;
        document.head.appendChild(skript);
      }
      filtrKontury(user["права"]);
      hideClosed(user["права"]);
      if (user["примерка"]) showPreview(user);
    })
    .catch(() => {});

  /* Разделы, которые роли закрыты, убираем из шапки.
   *
   * Гейт всё равно не пустит — он отдаст 403, — но тыкать в ссылку, которая
   * отвечает отказом, человек не должен: это выглядит как поломка сайта.
   * Ключи здесь те же, что в таблице разделов на сервере. */
  const SECTION_BY_HREF = [
    ["/picker", "picker"],
    ["/antigen", "antigen"],
    ["/heatmap", "heatmap"],
    ["/sales", "sales"],
    ["/perf", "perf"],
    ["/funnel", "funnel"],
    ["/dashboard", "dashboard"],
    ["/panopticum", "panopticum"],
    ["/people", "people"],
  ];

  function hideClosed(rights) {
    if (!Array.isArray(rights) || rights.includes("*")) return;
    document.querySelectorAll(".siteNav a, .site-nav__actions a").forEach((link) => {
      if (link.closest(".navKonturWrap")) return;   // контуры фильтрует filtrKontury
      const path = new URL(link.getAttribute("href"), location.origin).pathname;
      const found = SECTION_BY_HREF.find(([prefix]) => path.startsWith(prefix));
      if (found && !rights.includes(found[1])) link.remove();
    });
    // Опустевшая группа оставляет в плашке пустую перегородку.
    document.querySelectorAll(".navGroup").forEach((group) => {
      if (!group.querySelector("a")) group.remove();
    });
  }

  /* Примерка роли.
   *
   * Понять, что видит человек из операций, раньше можно было только заведя
   * себе вторую учётку. Теперь админ переключает роль и ходит по сайту как
   * он — а чтобы не забыть, что вид не настоящий, сверху висит полоса.
   */
  function showPreview(user) {
    const bar = document.createElement("div");
    bar.className = "viewAs";
    const back = encodeURIComponent(location.pathname + location.search);
    const options = (user["роли"] || [])
      .map((role) => `<a class="viewAs__role${role["ключ"] === user.role ? " is-on" : ""}"`
        + ` href="/__view?role=${role["ключ"]}&back=${back}">${role["название"]}</a>`).join("");
    // 06.10: «глазами человека» — сайт целиком как у него (его разделы, кабинет, зарплата), только смотреть
    bar.innerHTML = user["глазами"]
      ? `<span class="viewAs__label">Смотрите глазами <b>${user["глазами"]}</b> · ${user["роль"]} · только просмотр</span>`
        + `<a class="viewAs__exit" href="/__view?role=&back=%2F__admin%2Flyudi">Вернуться к себе</a>`
      : `<span class="viewAs__label">Смотрите как <b>${user["роль"]}</b></span>`
        + `<span class="viewAs__roles">${options}</span>`
        + `<a class="viewAs__exit" href="/__view?role=&back=${back}">Вернуться к своей роли</a>`;
    document.body.prepend(bar);
  }
})();

(() => {
  "use strict";

  /* След того, что человек делает внутри страницы.
   *
   * На сервер переход виден один раз: открыл пикалку — одна строка в журнале.
   * Всё остальное — переключение вкладок, нажатие кнопок, полчаса работы —
   * для журнала не существовало, и ответить «сколько времени он провёл в
   * разделе» было нечем.
   *
   * Шлём три вещи: нажатия, пульс раз в пять минут, пока вкладка открыта и
   * видима, и прощание при уходе. Пульс нужен затем, что время на сайте
   * считается по разрывам между следами: без него человек, читающий страницу
   * полчаса, выглядел бы ушедшим.
   */
  const SLED_URL = "/__sled";
  const PULS_MS = 5 * 60 * 1000;

  function poslat(deystvie) {
    const telo = JSON.stringify({
      "действие": String(deystvie).slice(0, 80),
      "страница": location.pathname,
    });
    try {
      // Маячок переживает уход со страницы, обычный fetch — не всегда.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(SLED_URL, new Blob([telo], { type: "application/json" }));
      } else {
        fetch(SLED_URL, { method: "POST", body: telo, keepalive: true,
                          headers: { "content-type": "application/json" } });
      }
    } catch { /* журнал не повод ломать страницу */ }
  }

  document.addEventListener("click", (event) => {
    const uzel = event.target.closest("button, a, [role='tab'], .tab, summary");
    if (!uzel) return;
    // Имя действия человеческое: подпись кнопки, а не её класс. Длинные
    // подписи режем — это ярлык, а не содержимое.
    const podpis = (uzel.getAttribute("aria-label") || uzel.textContent || "")
      .replace(/\s+/g, " ").trim().slice(0, 60);
    const kuda = uzel.tagName === "A" && uzel.getAttribute("href");
    poslat(kuda ? `переход: ${podpis || kuda}` : `нажал: ${podpis || uzel.tagName.toLowerCase()}`);
  }, true);

  let pulsTaymer = 0;
  function pulsVkl() {
    clearInterval(pulsTaymer);
    pulsTaymer = setInterval(() => {
      if (document.visibilityState === "visible") poslat("на странице");
    }, PULS_MS);
  }
  pulsVkl();

  document.addEventListener("visibilitychange", () => {
    poslat(document.visibilityState === "visible" ? "вернулся на вкладку" : "свернул вкладку");
  });
  window.addEventListener("pagehide", () => poslat("ушёл со страницы"));
})();
