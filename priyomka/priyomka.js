/* Монитор приёмки и размещения ДМД.
 *
 * Задача со встречи 11.09.2026: показать, где на складе пробка, а не где
 * «операция завершена». Первая итерация — заполненность мест по секторам.
 *
 * Два правила из ТЗ, которые здесь главные:
 *   цвет агрегата = цвет худшего элемента, иначе проблема тонет в среднем;
 *   drill-down обязателен: сектор разворачивается до своих зон.
 */
(() => {
  "use strict";

  const DATA = "../data/priyomka.json";

  const CVETA = {
    "красный": { podpis: "мест нет", klass: "pr--krasnyy" },
    "жёлтый": { podpis: "на пределе", klass: "pr--zhyoltyy" },
    "зелёный": { podpis: "норма", klass: "pr--zelyonyy" },
    "недогруз": { podpis: "недозагружен", klass: "pr--nedogruz" },
    "нет данных": { podpis: "нет мест в системе", klass: "pr--net" },
    "нет мест": { podpis: "нет мест в системе", klass: "pr--net" },
  };

  const el = (id) => document.getElementById(id);
  const chislo = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const escape = (text) => String(text ?? "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  let dannye = null;
  let filtr = null;
  let sektorNaKarte = null;

  function plitka(zagolovok, znachenie, podpis, klass) {
    return `<article class="prPlitka ${klass || ""}">
      <p class="prPlitka__zag">${escape(zagolovok)}</p>
      <p class="prPlitka__znak">${escape(znachenie)}</p>
      <p class="prPlitka__pod">${escape(podpis)}</p>
    </article>`;
  }

  function narisovatPlitki() {
    const sektory = dannye.секторы || [];
    const schet = (cvet) => sektory.filter((s) => s.цвет === cvet).length;
    // Сортировка уже по занятости мест хранения, поэтому худший — первый
    // с посчитанным процентом. Служебные зоны в этот счёт не входят.
    const hudshiy = sektory.find((s) => s.процент_хранения !== null
                                     && s.процент_хранения !== undefined);
    const mestHr = sektory.reduce((sum, s) => sum + (s.мест_хранения || 0), 0);
    const zanyatoHr = sektory.reduce((sum, s) => sum + (s.занято_хранения || 0), 0);
    const procentHr = mestHr ? (100 * zanyatoHr / mestHr) : 0;

    el("prPlitki").innerHTML = [
      plitka("Мест нет", schet("красный"), `секторов из ${sektory.length}`, "pr--krasnyy"),
      plitka("На пределе", schet("жёлтый"), "секторов подходят к потолку", "pr--zhyoltyy"),
      plitka("Хуже всех", hudshiy ? hudshiy.сектор.replace(/^\d+\s*/, "") : "—",
             hudshiy ? `${hudshiy.процент_хранения}% мест хранения занято` : "", "pr--krasnyy"),
      plitka("Места хранения", `${procentHr.toFixed(1)}%`,
             `${chislo(zanyatoHr)} из ${chislo(mestHr)} · служебные не в счёт`),
    ].join("");
    el("prPlitki").hidden = false;
  }


  // Сколько товар лежит в приёмке. Возраст считается по товару (пара
  // «SKU + ячейка»), а не по таре: контейнер многоразовый и по нему
  // возраст выходит в тысячи часов. SLA — 48 часов.
  const KORZINY = {
    "1. до 24 ч": { podpis: "до 24 ч", klass: "pr--zelyonyy" },
    "2. 24–48 ч": { podpis: "24–48 ч", klass: "pr--zhyoltyy" },
    "3. больше 48 ч": { podpis: "больше 48 ч · SLA нарушен", klass: "pr--krasnyy" },
    "4. движения не найдено": { podpis: "без следа прихода", klass: "pr--net" },
  };

  function narisovatVozrast() {
    const vozrast = dannye.возраст;
    const uzel = el("prVozrast");
    if (!uzel || !vozrast || !vozrast.зоны || !vozrast.зоны.length) return;

    const itogo = vozrast.итого || {};
    const vsego = Object.values(itogo).reduce((s, n) => s + n, 0);
    const plitki = Object.keys(KORZINY).map((k) => {
      const n = itogo[k] || 0;
      const dolya = vsego ? (100 * n / vsego).toFixed(1) : "0.0";
      return `<article class="prPlitka ${KORZINY[k].klass}">
        <p class="prPlitka__zag">${escape(KORZINY[k].podpis)}</p>
        <p class="prPlitka__znak">${chislo(n)}</p>
        <p class="prPlitka__pod">${dolya}% штук</p>
      </article>`;
    }).join("");

    const rows = vozrast.зоны.slice(0, 20).map((z) => {
      const prosr = (z.корзины || {})["3. больше 48 ч"] || 0;
      const dolya = z.штук ? (100 * prosr / z.штук) : 0;
      return `<tr>
        <td>${escape(z.зона)}</td>
        <td class="prNum">${chislo(z.штук)}</td>
        <td class="prNum"><b class="${dolya > 50 ? "prKrit" : ""}">${chislo(prosr)}</b></td>
        <td class="prNum">${dolya.toFixed(0)}%</td>
        <td class="prNum">${z.максимум_часов ? chislo(z.максимум_часов) + " ч" : "—"}</td>
      </tr>`;
    }).join("");

    uzel.innerHTML = `<h2 class="prVozrast__zag">Сколько товар лежит в приёмке</h2>
      <div class="prPlitki prPlitki--vozrast">${plitki}</div>
      <table class="prVozrast__tab">
        <thead><tr><th>Зона</th><th class="prNum">штук</th>
          <th class="prNum">старше 48 ч</th><th class="prNum">доля</th>
          <th class="prNum">самое старое</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    uzel.hidden = false;
  }


  // Карта входа: зоны расставлены по этапам движения товара, как в
  // паноптикуме — колонка на этап, кружок на зону, радиус по объёму.
  // Плитками это не читалось: не видно, на каком шаге затор.
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ETAPY = [
    { key: "разгрузка", name: "Разгрузка" },
    { key: "поступление", name: "Поступление" },
    { key: "приёмка", name: "Приёмка" },
    { key: "размещение", name: "Размещение" },
    { key: "хранение", name: "Хранение" },
  ];
  // Цвет этапа — как в паноптикуме: по нему видно, на каком шаге узел,
  // даже когда светофор у всех одинаковый.
  const CVET_ETAPA = {
    "разгрузка": "#4d8df7",
    "поступление": "#4d8df7",
    "приёмка": "#27c46b",
    "размещение": "#a985ff",
    "хранение": "#f5ad32",
  };
  const KOL_W_MIN = 190;
  const KOL_W_MAX = 470;
  const SHAG_Y_MIN = 78;
  const OTSTUP_SVERHU = 62;
  const OTSTUP_SNIZU = 34;



  function cvetZony(z, vozrastPoZonam) {
    // У приёмки и разгрузки занятость ничего не значит — товар стоит на полу
    // вне системы. Там красит время; у мест хранения — заполненность.
    const v = vozrastPoZonam.get(z.зона);
    if (v && v.штук) {
      const dolya = v.просрочено / v.штук;
      if (dolya >= 0.5) return "красный";
      if (dolya > 0.25) return "жёлтый";
      return "зелёный";
    }
    return z.мест ? z.цвет : "нет данных";
  }

  function obrezat(text, predel) {
    const s = String(text || "");
    return s.length > predel ? s.slice(0, predel - 1) + "…" : s;
  }

  function razbit(text, predel) {
    const slova = String(text).split(/\s+/);
    const stroki = [];
    let tekushchaya = "";
    slova.forEach((slovo) => {
      if (!tekushchaya) { tekushchaya = slovo; return; }
      if ((tekushchaya + " " + slovo).length <= predel) { tekushchaya += " " + slovo; return; }
      stroki.push(tekushchaya);
      tekushchaya = slovo;
    });
    if (tekushchaya) stroki.push(tekushchaya);
    return stroki.slice(0, 2);
  }

  function korotko(imya) {
    return String(imya || "").replace(/^\d+\s*/, "").replace(/\s*\(ДМД\)\s*$/i, "");
  }

  function narisovatKartu() {
    const uzel = el("prKarta");
    if (!uzel) return;
    uzel.hidden = false;

    const vozrastPoZonam = new Map();
    ((dannye.возраст || {}).зоны || []).forEach((z) => {
      vozrastPoZonam.set(z.зона, {
        штук: z.штук || 0,
        просрочено: (z.корзины || {})["3. больше 48 ч"] || 0,
        часов: z.максимум_часов || 0,
        корзины: z.корзины || {},
      });
    });

    const kolonki = new Map(ETAPY.map((e) => [e.key, []]));
    (dannye.секторы || []).forEach((s) => {
      if (sektorNaKarte && s.сектор !== sektorNaKarte) return;
      (s.зоны || []).forEach((z) => {
        if (!kolonki.has(z.назначение)) return;
        if (!z.штук) return;
        kolonki.get(z.назначение).push({ ...z, сектор: s.сектор });
      });
    });

    const polosy = ETAPY.filter((e) => kolonki.get(e.key).length);
    if (!polosy.length) { uzel.hidden = true; return; }
    if (!polosy.length) return;

    // Сколько узлов влезет в экран по высоте: от карты до низа окна минус
    // запас. Всё, что не помещается, сворачивается в «· ещё N» — иначе карта
    // уезжает в прокрутку, а её надо видеть целиком с первого взгляда.
    // От верха карты до низа окна, минус воздух снизу. Заголовок и легенда
    // живут внутри блока, поэтому их высоту вычитаем отдельно.
    const svoyVerh = uzel.getBoundingClientRect().top + window.scrollY;
    const shapka = uzel.querySelector(".prLegenda");
    const vysotaShapki = shapka ? shapka.getBoundingClientRect().bottom
                                  + window.scrollY - svoyVerh : 70;
    const vysota = Math.max(320,
      window.innerHeight - (svoyVerh - window.scrollY) - vysotaShapki - 36);
    const vlezaet = Math.max(5, Math.floor((vysota - 92) / SHAG_Y_MIN));

    polosy.forEach((e) => {
      const spisok = kolonki.get(e.key).sort((a, b) => (b.штук || 0) - (a.штук || 0));
      if (spisok.length > vlezaet) {
        const hvost = spisok.slice(vlezaet - 1);
        kolonki.set(e.key, spisok.slice(0, vlezaet - 1).concat({
          зона: "· ещё " + hvost.length,
          штук: hvost.reduce((n, z) => n + (z.штук || 0), 0),
          мест: hvost.reduce((n, z) => n + (z.мест || 0), 0),
          занято: hvost.reduce((n, z) => n + (z.занято || 0), 0),
          цвет: "нет данных",
          свёрнутая: true,
        }));
      }
    });

    const rows = polosy.map((e) => kolonki.get(e.key).length);
    // Место под панель разбора держим всегда: она открывается по клику,
    // и если ширину не зарезервировать, карта с панелью вылезут за экран.
    const dostupno = Math.max(600, (uzel.clientWidth || 1200) - 286);
    const KOL_W = Math.min(KOL_W_MAX,
                           Math.max(KOL_W_MIN, Math.floor(dostupno / polosy.length)));
    const W = KOL_W * polosy.length;
    // Высота — ровно под экран: шаг растягивается, если зон мало, и жмётся
    // до минимума, если много.
    const strok = Math.max(...rows, 1);
    const SHAG_Y = Math.max(SHAG_Y_MIN, Math.floor((vysota - 92) / strok));
    const H = OTSTUP_SVERHU + OTSTUP_SNIZU + SHAG_Y * strok;
    const maksVKolonke = new Map(polosy.map((e) =>
      [e.key, Math.max(1, ...kolonki.get(e.key).map((z) => z.штук || 0))]));

    const dobavit = (tag, atr, roditel) => {
      const n = document.createElementNS(SVG_NS, tag);
      Object.entries(atr).forEach(([k, v]) => n.setAttribute(k, v));
      if (roditel) roditel.appendChild(n);
      return n;
    };

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("class", "prKartaSvg");
    svg.style.width = W + "px";
    svg.style.height = H + "px";
    svg.setAttribute("role", "img");

    const stil = document.createElementNS(SVG_NS, "style");
    stil.textContent = [
      '.prKartaSvg text { font-family: "VI Sans", system-ui, sans-serif; }',
      ".prKartaSvg .etap { font: 600 15px 'VI Sans', system-ui, sans-serif; fill: #8f9cad; letter-spacing: .08em; }",
      ".prKartaSvg .etapItog { font: 500 13px 'VI Sans', system-ui, sans-serif; fill: #6b7a8f; }",
      ".prKartaSvg .povod { font: 500 12px 'VI Sans', system-ui, sans-serif; opacity: .85; }",
      ".prKartaSvg .imya { font: 600 15px 'VI Sans', system-ui, sans-serif; fill: #dfe7f2; }",
      ".prKartaSvg .chislo { font: 600 14px 'VI Sans', system-ui, sans-serif; fill: #8f9cad; }",
      ".prKartaSvg .potok { fill: none; opacity: .34; }",
      ".prKartaSvg .uzel { cursor: pointer; }",
      ".prKartaSvg .uzel circle { transition: fill-opacity .25s ease; }",
      ".prKartaSvg .uzel:hover circle { fill-opacity: .72; }",
    ].join("\n");
    svg.appendChild(stil);

    const SVETOFOR = {
      "красный": "#f05d72",
      "жёлтый": "#f5ad32",
      "зелёный": "#27c46b",
      "недогруз": "#5b6b82",
      "нет данных": "#5b6b82",
      "нет мест": "#5b6b82",
    };

    polosy.forEach((etap, i) => {
      const spisok = kolonki.get(etap.key);
      const prostor = H - OTSTUP_SVERHU - OTSTUP_SNIZU;
      const shag = prostor / spisok.length;
      const potolok = Math.max(9, (shag - 46) / 2);

      const vsegoShtuk = spisok.reduce((n, z) => n + (z.штук || 0), 0);
      const prosrocheno = spisok.reduce((n, z) => {
        const v = vozrastPoZonam.get(z.зона);
        return n + (v ? v.просрочено : 0);
      }, 0);
      dobavit("text", { x: KOL_W * i + KOL_W / 2, y: 22, class: "etap", "text-anchor": "middle" }, svg)
        .textContent = etap.name.toUpperCase();
      dobavit("text", { x: KOL_W * i + KOL_W / 2, y: 40, class: "etapItog", "text-anchor": "middle" }, svg)
        .textContent = prosrocheno
          ? chislo(vsegoShtuk) + " шт · " + chislo(prosrocheno) + " за SLA"
          : chislo(vsegoShtuk) + " шт";

      spisok.forEach((z, k) => {
        const x = KOL_W * i + KOL_W / 2;
        const y = OTSTUP_SVERHU + shag * (k + 0.5);
        const r = Math.min(11 + 26 * Math.sqrt((z.штук || 0) / maksVKolonke.get(etap.key)), potolok);

        const cvet = z.свёрнутая ? "нет данных" : cvetZony(z, vozrastPoZonam);
        const ton = SVETOFOR[cvet] || SVETOFOR["нет данных"];
        const v = vozrastPoZonam.get(z.зона);
        const gruppa = dobavit("g", { class: "uzel" }, svg);
        // Красное кольцо снаружи — зона за SLA. Видно издалека, даже когда
        // кружок маленький и цвет заливки читается плохо.
        if (cvet === "красный") {
          dobavit("circle", { cx: x, cy: y, r: (r + 4).toFixed(1), fill: "none",
                              stroke: ton, "stroke-width": 1, "stroke-opacity": .45 }, gruppa);
        }
        dobavit("circle", { cx: x, cy: y, r: r.toFixed(1), fill: ton,
                            "fill-opacity": .34, stroke: ton, "stroke-width": 1.5 }, gruppa);

        const podpis = dobavit("title", {}, gruppa);
        podpis.textContent = z.свёрнутая
          ? z.зона + ": " + chislo(z.штук) + " штук"
          : z.зона + "\n" + chislo(z.штук) + " штук"
            + (z.мест ? "\n" + chislo(z.занято) + " из " + chislo(z.мест) + " мест · " + z.процент + "%" : "")
            + (v && v.просрочено ? "\nстарше 48 ч: " + chislo(v.просрочено) + " шт, до " + chislo(v.часов) + " ч" : "");

        // Подпись держим в двух строках: имя и «штуки · причина». Раньше
        // строк было три — имя в две плюс число плюс причина, — и нижняя
        // наезжала на следующий узел.
        dobavit("text", { x, y: y + r + 18, class: "imya", "text-anchor": "middle" }, gruppa)
          .textContent = obrezat(korotko(z.зона), 30);
        const povod = pochemu(z, v);
        const nizhnyaya = dobavit("text", { x, y: y + r + 35, class: "chislo",
                                            "text-anchor": "middle" }, gruppa);
        nizhnyaya.textContent = chislo(z.штук);
        if (povod) {
          const hvost = document.createElementNS(SVG_NS, "tspan");
          hvost.setAttribute("class", "povod");
          hvost.setAttribute("fill", ton);
          hvost.textContent = "  ·  " + povod;
          nizhnyaya.appendChild(hvost);
        }

        if (!z.свёрнутая) {
          gruppa.addEventListener("click", () => pokazatZonu(z, v));
        }
      });
    });

    uzel.innerHTML = '<h2 class="prKarta__zag">Карта входа</h2>'
      + '<p class="prHint">колонка — этап пути товара, кружок — зона, размер по штукам · '
      + 'клик по зоне открывает разбор справа</p>'
      + '<div class="prLegenda">'
      + '<span><i style="background:#f05d72"></i>больше половины за SLA 48 ч</span>'
      + '<span><i style="background:#f5ad32"></i>четверть и больше за SLA</span>'
      + '<span><i style="background:#27c46b"></i>идёт в срок</span>'
      + '<span><i style="background:#5b6b82"></i>мест нет или движения не видно</span>'
      + '<span class="prLegenda__pr">на хранении цвет по занятости, не по времени</span>'
      + '</div>'
      + '<div class="prSektory" id="prSektory"></div>';
    const holst = document.createElement("div");
    holst.className = "prKartaHolst";
    holst.appendChild(svg);
    const bok = document.createElement("aside");
    bok.className = "prKartaBok";
    bok.id = "prKartaBok";
    bok.className = "prKartaBok prKartaBok--pusto";
    bok.innerHTML = "<p>Кликните зону на карте — здесь появится разбор: "
      + "сколько штук, сколько мест, сколько лежит и что с SLA.</p>";
    holst.appendChild(bok);
    uzel.appendChild(holst);
    narisovatKnopkiSektorov();
    uzel.hidden = false;
  }

  // Почему узел такого цвета — одной строкой под числом.
  function pochemu(z, v) {
    if (z.свёрнутая) return "";
    if (v && v.штук) {
      const dolya = Math.round(100 * v.просрочено / v.штук);
      if (v.просрочено) return dolya + "% за SLA";
      return "в срок";
    }
    if (z.мест) return z.процент + "% занято";
    return "";
  }

  // Разбор зоны рядом с картой: что за зона, чем забита, сколько лежит и
  // куда идти разбираться. Раньше клик уводил в таблицу внизу страницы —
  // приходилось искать глазами строку, и связь с картой терялась.
  function pokazatZonu(z, v) {
    const bok = el("prKartaBok");
    if (!bok) return;
    const stroka = (podpis, znachenie, klass) =>
      `<div class="prBokStroka"><span>${escape(podpis)}</span>` +
      `<b class="${klass || ""}">${znachenie}</b></div>`;

    let korziny = "";
    if (v && v.штук) {
      const k = v.корзины || {};
      korziny = ["1. до 24 ч", "2. 24–48 ч", "3. больше 48 ч", "4. движения не найдено"]
        .filter((imya) => k[imya])
        .map((imya) => stroka(KORZINY[imya] ? KORZINY[imya].podpis : imya,
                              chislo(k[imya]),
                              imya === "3. больше 48 ч" ? "prKrit" : ""))
        .join("");
    }

    bok.className = "prKartaBok";
    bok.innerHTML = `<div class="prBokZag">${escape(z.зона)}</div>
      <p class="prBokPod">${escape(z.сектор || "")} · ${escape(z.назначение || "")}</p>
      ${stroka("Штук в зоне", chislo(z.штук))}
      ${z.мест ? stroka("Мест", chislo(z.занято) + " из " + chislo(z.мест)) : ""}
      ${z.мест ? stroka("Занято", z.процент + "%") : ""}
      ${z.контейнеров ? stroka("Контейнеров", chislo(z.контейнеров)) : ""}
      ${v && v.часов ? stroka("Самое старое", chislo(v.часов) + " ч", "prKrit") : ""}
      ${korziny ? `<p class="prBokPod prBokPod--tit">Сколько лежит</p>${korziny}` : ""}
      ${z.сектор ? `<button class="prBokKnopka" type="button">Открыть сектор целиком</button>` : ""}`;
    const knopka = bok.querySelector(".prBokKnopka");
    if (knopka) knopka.addEventListener("click", () => otkrytSektor(z.сектор));
  }

  let pereschyot = null;
  window.addEventListener("resize", () => {
    clearTimeout(pereschyot);
    pereschyot = setTimeout(() => { if (dannye) narisovatKartu(); }, 200);
  });

  // Кнопки секторов: по ним карта сужается до одного сектора. Без этого
  // таблица секторов и карта жили порознь — «Сектор Ж 89,4%» есть, а где
  // он на карте, непонятно.
  function narisovatKnopkiSektorov() {
    const ryad = el("prSektory");
    if (!ryad) return;
    const spisok = (dannye.секторы || []).filter((s) => (s.зоны || [])
      .some((z) => z.штук && ETAPY.some((e) => e.key === z.назначение)));
    if (spisok.length < 2) return;

    const knopka = (imya, podpis, cvet) =>
      `<button type="button" class="prSektorKn ${cvet || ""}${sektorNaKarte === imya ? " is-on" : ""}"
        data-sektor="${escape(imya || "")}">${escape(podpis)}</button>`;

    ryad.innerHTML = knopka("", "весь склад")
      + spisok.map((s) => knopka(s.сектор, s.сектор.replace(/^\d+\s*(Сектор\s*)?/i, ""),
                                 (CVETA[s.цвет] || {}).klass)).join("");

    ryad.querySelectorAll(".prSektorKn").forEach((kn) => {
      kn.addEventListener("click", () => {
        sektorNaKarte = kn.dataset.sektor || null;
        narisovatKartu();
      });
    });
  }

  function otkrytSektor(imya) {
    sektorNaKarte = imya;
    narisovatKartu();
    filtr = null;
    narisovatTablicu();
    const stroki = [...document.querySelectorAll("#prTable .prRow")];
    const nuzhnaya = stroki.find((r) => r.querySelector("b") &&
                                        r.querySelector("b").textContent === imya);
    if (nuzhnaya) {
      nuzhnaya.click();
      nuzhnaya.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function narisovatFiltry() {
    const sektory = dannye.секторы || [];
    // «Нет данных» тоже нужен отдельной кнопкой: это три десятка зон, где
    // мест в системе нет вовсе, и в общем списке они только мешают.
    const poryadok = ["красный", "жёлтый", "зелёный", "недогруз", "нет данных"];
    const knopki = [`<button class="prFiltr${filtr === null ? " is-on" : ""}" type="button"
      data-cvet="">все · ${sektory.length}</button>`];
    poryadok.forEach((cvet) => {
      const skolko = sektory.filter((s) => s.цвет === cvet).length;
      if (!skolko) return;
      knopki.push(`<button class="prFiltr ${CVETA[cvet].klass}${filtr === cvet ? " is-on" : ""}"
        type="button" data-cvet="${cvet}">${CVETA[cvet].podpis} · ${skolko}</button>`);
    });
    el("prFilters").innerHTML = knopki.join("");
  }

  function stroka(sektor, nomer) {
    const cvet = CVETA[sektor.цвет] || CVETA["нет данных"];
    return `<div class="prRow ${cvet.klass}" data-nomer="${nomer}">
      <div class="prRow__cvet" title="${escape(cvet.podpis)}"></div>
      <div class="prRow__imya">
        <b>${escape(sektor.сектор)}</b>
        <i>${escape(sektor.блок)}</i>
      </div>
      <div class="prRow__chislo">
        <b>${sektor.процент_хранения == null ? "—" : sektor.процент_хранения + "%"}</b>
        <i>места хранения</i>
      </div>
      <div class="prRow__zona">${escape(sektor.худшая_зона || "—")}</div>
      <div class="prRow__chislo">
        <b>${chislo(sektor.занято_хранения)}</b>
        <i>из ${chislo(sektor.мест_хранения)} мест</i>
      </div>
      <div class="prRow__chislo">
        <b>${chislo(sektor.штук)}</b>
        <i>штук</i>
      </div>
      <div class="prRow__znak">▾</div>
    </div>`;
  }

  function zonyHtml(sektor) {
    const zony = (sektor.зоны || []).filter((z) => z.мест || z.штук);
    if (!zony.length) return `<div class="prZony"><p class="prHint">Зон с местами нет</p></div>`;
    const rows = zony.map((z) => {
      const cvet = CVETA[z.цвет] || CVETA["нет данных"];
      // У приёмки и разгрузки занятость не значит ничего: товар стоит на полу
      // и в системе не оприходован. Показываем, но цветом не пугаем.
      const vne = z.хранение === false;
      return `<tr class="${vne ? "prVne" : ""}">
        <td><span class="prTochka ${vne ? "pr--net" : cvet.klass}"></span>${escape(z.зона)}</td>
        <td class="prNum">${escape(z.назначение)}</td>
        <td class="prNum">${z.мест ? chislo(z.мест) : "—"}</td>
        <td class="prNum">${z.мест ? chislo(z.занято) : "—"}</td>
        <td class="prNum"><b>${z.мест ? z.процент + "%" : "—"}</b></td>
        <td class="prNum">${chislo(z.штук)}</td>
        <td class="prNum">${chislo(z.контейнеров)}</td>
      </tr>`;
    }).join("");
    return `<div class="prZony"><table>
      <thead><tr><th>Зона</th><th>Назначение</th><th>Мест</th><th>Занято</th>
        <th>Заполнено</th><th>Штук</th><th>Контейнеров</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function narisovatTablicu() {
    const sektory = (dannye.секторы || [])
      .filter((s) => !filtr || s.цвет === filtr);
    el("prTable").innerHTML = sektory.length
      ? sektory.map((s, i) => stroka(s, i)).join("")
      : `<p class="prHint">Таких секторов нет</p>`;
    el("prPanel").hidden = false;
  }

  function razvernut(row) {
    const otkryta = row.nextElementSibling
      && row.nextElementSibling.classList.contains("prZony");
    document.querySelectorAll(".prZony").forEach((z) => z.remove());
    document.querySelectorAll(".prRow.is-open").forEach((r) => r.classList.remove("is-open"));
    if (otkryta) return;
    const sektory = (dannye.секторы || []).filter((s) => !filtr || s.цвет === filtr);
    const sektor = sektory[Number(row.dataset.nomer)];
    if (!sektor) return;
    row.classList.add("is-open");
    row.insertAdjacentHTML("afterend", zonyHtml(sektor));
  }

  async function start() {
    let otvet;
    try {
      otvet = await fetch(DATA, { cache: "no-cache" });
      if (!otvet.ok) throw new Error(String(otvet.status));
      dannye = await otvet.json();
    } catch {
      el("message").textContent = "Монитор ещё не собран";
      return;
    }
    el("message").hidden = true;
    el("stamp").textContent = `${dannye.склад} · обновлено ${dannye.обновлено}`;

    narisovatPlitki();
    narisovatKartu();
    narisovatVozrast();
    narisovatFiltry();
    narisovatTablicu();

    const p = dannye.пороги || {};
    el("prNote").textContent =
      `Заполненность считается по локациям, а не по объёму: корректных ВГХ нет, `
      + `и «в кубах» посчитать нечем. Пороги: до ${p.недогруз}% склад недозагружен, `
      + `${p.недогруз}–${p.норма}% норма, ${p.норма}–${p.тревога}% на пределе, `
      + `выше ${p.тревога}% мест нет. Зоны приёмки, разгрузки и поступления показаны серым: `
      + `там занятость ничего не значит — товар стоит в проездах и в системе не оприходован, `
      + `поэтому приёмка выглядит пустой даже когда она встала.`;

    const zapKn = el("prZapiskaKn");
    if (zapKn) {
      zapKn.addEventListener("click", () => {
        const telo = el("prZapiskaTelo");
        telo.hidden = !telo.hidden;
        zapKn.textContent = telo.hidden ? "Развернуть" : "Свернуть";
        if (!telo.hidden) telo.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }

    el("prTable").addEventListener("click", (event) => {
      const row = event.target.closest(".prRow");
      if (!row) return;
      razvernut(row);
      const imya = row.querySelector("b") ? row.querySelector("b").textContent : "";
      if (imya) {
        sektorNaKarte = imya;
        narisovatKartu();
      }
    });
    el("prFilters").addEventListener("click", (event) => {
      const knopka = event.target.closest(".prFiltr");
      if (!knopka) return;
      filtr = knopka.dataset.cvet || null;
      narisovatFiltry();
      narisovatTablicu();
    });
  }

  start();
})();
