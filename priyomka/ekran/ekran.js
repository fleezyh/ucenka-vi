/* Экран обстановки склада — «карта войны» для руководителей.
 *
 * Одно полотно без прокрутки: сверху цепочка входа с цветом каждого звена,
 * в центре схема «двор → ворота → зоны приёмки → секторы хранения», справа
 * тревоги словами, внизу машины во дворе и очередь за сутки против вчера.
 *
 * Данные — те же, что у страницы приёмки: data/dvor.json (раз в 10 минут)
 * и data/priyomka.json (раз в час). Сам экран перечитывает их каждую минуту
 * и раз в шесть часов перезагружается целиком, чтобы подхватить новую версию. */
(() => {
  const $ = (id) => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";
  const DATA = "../../data/";

  const CVET = { krasnyy: "#f05d72", zhyoltyy: "#e3a93f", zelyonyy: "#2fc97c", siniy: "#4d8df7", nedogruz: "#4d8df7", seryy: "#46525f" };
  const PO_RUSSKI = { "красный": "krasnyy", "жёлтый": "zhyoltyy", "зелёный": "zelyonyy", "недогруз": "siniy", "синий": "siniy" };

  const num = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const tys = (v) => {
    const x = Number(v) || 0;
    return x >= 10000 ? `${Math.round(x / 1000)} тыс` : x >= 1000 ? `${(x / 1000).toFixed(1).replace(".", ",")} тыс` : num(x);
  };
  const chmm = (minut) => {
    const m = Math.max(0, Math.round(Number(minut) || 0));
    return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`;
  };
  const hmm = (minut) => {
    const m = Math.max(0, Math.round(Number(minut) || 0));
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const el = (tag, atr = {}, roditel = null, tekst = null) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(atr)) n.setAttribute(k, v);
    if (tekst !== null) n.textContent = tekst;
    if (roditel) roditel.appendChild(n);
    return n;
  };

  let dvor = null;
  let priyomka = null;

  /* ── цепочка ─────────────────────────────────────────────────────── */
  function narisovatCepochku() {
    const modeli = window.PrCepochka ? window.PrCepochka.sobrat(dvor, priyomka) : [];
    $("ekCep").innerHTML = modeli.map((m) => `
      <div class="ekZveno ek--${m.cvet}">
        <span class="ekZveno__imya">${esc(m.imya)}</span>
        <b class="ekZveno__glavnoe">${m.glavnoe}</b>
        <span class="ekZveno__pod">${m.pod}</span>
        <span class="ekZveno__vremya">${m.vremya}</span>
      </div>`).join('<span class="ekCep__strelka">→</span>');

    const krasnye = modeli.filter((m) => m.cvet === "krasnyy").map((m) => m.imya.toLowerCase());
    const zhyoltye = modeli.filter((m) => m.cvet === "zhyoltyy");
    const status = $("ekStatus");
    if (krasnye.length) {
      status.className = "ekStatus is-krasnyy";
      status.textContent = `в красном: ${krasnye.join(", ")}`;
    } else if (zhyoltye.length) {
      status.className = "ekStatus is-zhyoltyy";
      status.textContent = `на пределе: ${zhyoltye.map((m) => m.imya.toLowerCase()).join(", ")}`;
    } else {
      status.className = "ekStatus is-zelyonyy";
      status.textContent = "вход работает штатно";
    }
  }

  /* ── схема входа ─────────────────────────────────────────────────── */
  function cvetZony(z) {
    const k = z.корзины || {};
    const izvestno = (z.штук || 0) - (k["4. движения не найдено"] || 0);
    if (izvestno <= 0) return "seryy";
    const d = (k["3. больше 48 ч"] || 0) / izvestno;
    return d > 0.5 ? "krasnyy" : d > 0.25 ? "zhyoltyy" : "zelyonyy";
  }
  const korotkoZona = (imya) => String(imya).replace(/^\d+\s*/, "").replace("Приёмка товара ", "Приёмка ");
  const bukvaSektora = (imya) => (String(imya).match(/Сектор\s+(\S+)/) || [])[1] || korotkoZona(imya);

  function narisovatKartu() {
    const holst = $("ekKarta");
    const dmd = (dvor?.склады || []).find((s) => s.склад === "ДМД");
    const vseZony = (priyomka?.возраст?.зоны || []).filter((z) => (z.штук || 0) > 0)
      .sort((a, b) => (b.штук || 0) - (a.штук || 0));
    const visyaki = new Map((priyomka?.висяки?.зоны || []).map((z) => [z.зона, z]));
    const sektory = (priyomka?.секторы || []).filter((s) => /Сектор .+ ДМД$/.test(s.сектор) && (s.мест_хранения || 0) > 0)
      .sort((a, b) => String(a.сектор).localeCompare(String(b.сектор), "ru"));
    if (!dmd && !vseZony.length) { holst.innerHTML = ""; return; }

    // Рисуем в настоящих пикселях блока: схема заполняет его целиком, а
    // шрифт привязан к высоте экрана — читается с другого конца комнаты.
    const W = Math.max(600, holst.clientWidth);
    const H = Math.max(260, holst.clientHeight);
    const fs = Math.max(12, Math.round(window.innerHeight * 0.0145));
    const VERH = Math.round(fs * 2.4);
    const NIZ = Math.round(fs * 0.9);

    // Сколько зон влезает в столбец — остальные сворачиваем в одну.
    const MAKS_ZON = Math.max(6, Math.floor((H - VERH - NIZ) / (fs * 2.1)));
    let zony = vseZony.slice(0, MAKS_ZON);
    if (vseZony.length > MAKS_ZON) {
      const hvost = vseZony.slice(MAKS_ZON - 1);
      const korziny = {};
      for (const z of hvost) {
        for (const [kl, v] of Object.entries(z.корзины || {})) korziny[kl] = (korziny[kl] || 0) + v;
      }
      zony = vseZony.slice(0, MAKS_ZON - 1).concat({
        зона: `ещё ${hvost.length} зон`, сектор: null, свёрнутая: true,
        штук: hvost.reduce((s, z) => s + (z.штук || 0), 0), корзины: korziny,
      });
    }
    zony.sort((a, b) => (a.свёрнутая ? 1 : 0) - (b.свёрнутая ? 1 : 0)
      || String(a.сектор).localeCompare(String(b.сектор), "ru")
      || String(a.зона).localeCompare(String(b.зона), "ru"));

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    const sloiLiniy = el("g", {}, svg);
    const sloiUzlov = el("g", {}, svg);
    const X = { dvor: W * 0.07, vorota: W * 0.21, priemka: W * 0.53, sklad: W * 0.83 };

    for (const [x, imya] of [[X.dvor, "ДВОР"], [X.vorota, "ВОРОТА"], [X.priemka, "ПРИЁМКА"], [X.sklad, "ХРАНЕНИЕ"]]) {
      el("text", { x, y: fs * 1.1, "text-anchor": "middle", fill: "#5f6f84", "font-size": fs * 0.95,
        "font-weight": 700, "letter-spacing": "2" }, sloiUzlov, imya);
    }

    const rasstavit = (n) => Array.from({ length: n }, (_, i) => VERH + (H - VERH - NIZ) * (n === 1 ? 0.5 : i / (n - 1)));
    const yZon = rasstavit(zony.length);
    const ySek = rasstavit(sektory.length);
    const shagZon = (H - VERH - NIZ) / Math.max(1, zony.length - 1);
    const shagSek = (H - VERH - NIZ) / Math.max(1, sektory.length - 1);
    const serY = VERH + (H - VERH - NIZ) / 2;

    const krivaya = (x1, y1, x2, y2, shirina, cvet, prozrachnost = 0.42) => {
      const dx = (x2 - x1) * 0.5;
      el("path", { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, fill: "none",
        stroke: cvet, "stroke-width": Math.max(1, shirina).toFixed(1), "stroke-opacity": prozrachnost,
        "stroke-linecap": "round" }, sloiLiniy);
    };
    const podpis = (x, y, tekst, atr = {}) => el("text", { x, y, fill: "#dfe7f2", "font-size": fs, "font-weight": 600,
      stroke: "#0e151f", "stroke-width": 4, "paint-order": "stroke", ...atr }, sloiUzlov, tekst);

    const maxRZony = Math.max(6, Math.min(fs * 1.7, shagZon * 0.46));

    // Двор и ворота.
    if (dmd) {
      const rMaks = Math.min(H * 0.2, W * 0.055);
      const rDvor = rMaks * (0.35 + 0.65 * Math.sqrt(Math.min(dmd.ждут_ворот, 400) / 400));
      const rVorota = rMaks * 0.8 * (0.35 + 0.65 * Math.sqrt(Math.min(dmd.на_разгрузке, 60) / 60));
      const cvetDvor = !dmd.ждут_ворот ? "zelyonyy"
        : dmd.дольше_всех_мин >= 240 ? "krasnyy" : dmd.дольше_всех_мин >= 120 ? "zhyoltyy" : "zelyonyy";
      const cvetVorot = dmd.среднее_ожидание_мин > 120 ? "krasnyy" : dmd.среднее_ожидание_мин > 60 ? "zhyoltyy" : "zelyonyy";

      const chas = new Date().getHours();
      const zaChas = (dmd.поток || []).find((h) => h.час === chas - 1) || { на_ворота: 0 };
      krivaya(X.dvor + rDvor, serY, X.vorota - rVorota, serY,
        3 + fs * 1.2 * Math.min(zaChas.на_ворота, 60) / 60, CVET.siniy, 0.55);
      podpis((X.dvor + X.vorota) / 2, serY - fs * 0.9, `${num(zaChas.на_ворота)} машин/ч`,
        { "text-anchor": "middle", "font-size": fs * 0.9, fill: "#8fb4f8" });

      for (const [x, r, cvet, glavnoe, pod] of [
        [X.dvor, rDvor, cvetDvor, num(dmd.ждут_ворот), `ждут · ${num(dmd.паллет_в_очереди)} пал`],
        [X.vorota, rVorota, cvetVorot, num(dmd.на_разгрузке), "на воротах"],
      ]) {
        el("circle", { cx: x, cy: serY, r, fill: CVET[cvet], "fill-opacity": 0.22, stroke: CVET[cvet], "stroke-width": 3 }, sloiUzlov);
        el("text", { x, y: serY + fs * 0.6, "text-anchor": "middle", fill: "#fff", "font-size": fs * 1.8,
          "font-weight": 700 }, sloiUzlov, glavnoe);
        podpis(x, serY + r + fs * 1.4, pod, { "text-anchor": "middle", "font-size": fs * 0.9, fill: "#9fb0c4" });
      }

      // Ворота → зоны приёмки: сколько поступило в зону за сутки.
      const maxSvezh = Math.max(1, ...zony.map((z) => (z.корзины || {})["1. до 24 ч"] || 0));
      zony.forEach((z, i) => {
        const svezh = (z.корзины || {})["1. до 24 ч"] || 0;
        if (svezh) {
          krivaya(X.vorota + rVorota, serY, X.priemka - maxRZony - 4, yZon[i],
            1 + fs * 0.9 * svezh / maxSvezh, CVET.siniy, 0.3);
        }
      });
    }

    // Зоны приёмки → секторы хранения: сколько ждёт размещения дольше 48 ч.
    const maxZona = Math.max(1, ...zony.map((z) => z.штук || 0));
    const maxStaroe = Math.max(1, ...zony.map((z) => (z.корзины || {})["3. больше 48 ч"] || 0));
    const yPoSektoru = new Map(sektory.map((s, i) => [s.сектор, ySek[i]]));
    const maxMest = Math.max(1, ...sektory.map((s) => s.мест_хранения || 0));
    const maxRSek = Math.max(6, Math.min(fs * 1.6, shagSek * 0.46));
    const rSek = new Map(sektory.map((s) => [s.сектор, 5 + (maxRSek - 5) * Math.sqrt((s.мест_хранения || 0) / maxMest)]));

    zony.forEach((z, i) => {
      const cvet = z.свёрнутая ? "seryy" : cvetZony(z);
      const r = 4 + (maxRZony - 4) * Math.sqrt((z.штук || 0) / maxZona);
      const y = yZon[i];
      const staroe = (z.корзины || {})["3. больше 48 ч"] || 0;
      if (yPoSektoru.has(z.сектор) && staroe) {
        krivaya(X.priemka + r, y, X.sklad - rSek.get(z.сектор), yPoSektoru.get(z.сектор),
          1 + fs * 1.1 * staroe / maxStaroe, CVET[cvet], 0.4);
      }
      // Кольцо висяков: какая доля зоны лежит дольше недели.
      const v = visyaki.get(z.зона);
      if (v && v.штук) {
        const dolya = Math.min(1, (v.старое || 0) / v.штук);
        const rr = r + 4.5;
        const dlina = 2 * Math.PI * rr;
        el("circle", { cx: X.priemka, cy: y, r: rr, fill: "none", stroke: "#1d2a3a", "stroke-width": 3.5 }, sloiUzlov);
        el("circle", { cx: X.priemka, cy: y, r: rr, fill: "none", stroke: "#b3263c", "stroke-width": 3.5,
          "stroke-dasharray": `${(dlina * dolya).toFixed(1)} ${dlina.toFixed(1)}`,
          transform: `rotate(-90 ${X.priemka} ${y})` }, sloiUzlov);
      }
      el("circle", { cx: X.priemka, cy: y, r, fill: CVET[cvet], "fill-opacity": 0.85 }, sloiUzlov);
      const k = z.корзины || {};
      const izvestno = (z.штук || 0) - (k["4. движения не найдено"] || 0);
      const d48 = izvestno > 0 ? Math.round(staroe / izvestno * 100) : null;
      podpis(X.priemka - maxRZony - 10, y + fs * 0.35, korotkoZona(z.зона), { "text-anchor": "end" });
      podpis(X.priemka + maxRZony + 10, y + fs * 0.35,
        `${tys(z.штук)} шт${d48 !== null && !z.свёрнутая ? ` · ${d48}% > 48 ч` : ""}`,
        { "font-size": fs * 0.9, fill: CVET[cvet] === CVET.zelyonyy || z.свёрнутая ? "#9fb0c4" : CVET[cvet] });
    });

    sektory.forEach((s, i) => {
      const cvet = PO_RUSSKI[s.цвет] || "seryy";
      const r = rSek.get(s.сектор);
      el("circle", { cx: X.sklad, cy: ySek[i], r, fill: CVET[cvet], "fill-opacity": 0.8 }, sloiUzlov);
      podpis(X.sklad + maxRSek + 10, ySek[i] + fs * 0.35,
        `${bukvaSektora(s.сектор)}  ${String(s.процент_хранения ?? "—").replace(".", ",")}%`,
        { "font-size": fs * 1.05, "font-weight": 700 });
    });

    holst.replaceChildren(svg);
    $("ekKartaPod").textContent = priyomka?.обновлено ? `зоны на ${priyomka.обновлено.slice(11, 16)}` : "";
  }

  /* ── тревоги ─────────────────────────────────────────────────────── */
  function sobratTrevogi() {
    const t = [];
    const dmd = (dvor?.склады || []).find((s) => s.склад === "ДМД");
    if (dmd) {
      const zhdut = (dmd.машины || []).filter((m) => m.этап !== "на разгрузке");
      const hudshaya = zhdut[0];
      if (dmd.старше_4_часов) {
        t.push({ cvet: "krasnyy", ves: 100 + dmd.старше_4_часов,
          b: `${num(dmd.старше_4_часов)} машин ждут ворот дольше 4 часов`,
          s: hudshaya ? `дольше всех — ${hudshaya.тип}, ${num(hudshaya.паллет)} паллет, ${chmm(hudshaya.на_дворе_мин)} на дворе` : "" });
      }
      // Динамика очереди: сейчас против часа назад и против вчера.
      const segodnya = (dmd.кривая || []).filter((k) => k.t.slice(0, 10) === (dvor.обновлено || "").slice(0, 10));
      const posled = segodnya[segodnya.length - 1];
      if (posled) {
        const chasNazad = segodnya.filter((k) => k.t <= sdvig(posled.t, -60)).pop();
        const delta = chasNazad ? posled.ждут - chasNazad.ждут : 0;
        if (delta >= 10) t.push({ cvet: "krasnyy", ves: 90 + delta, b: `За час очередь выросла на ${num(delta)} машин`, s: `было ${num(chasNazad.ждут)}, стало ${num(posled.ждут)}` });
        else if (delta <= -10) t.push({ cvet: "zelyonyy", ves: 20, b: `Очередь разгружается: −${num(-delta)} машин за час`, s: `было ${num(chasNazad.ждут)}, стало ${num(posled.ждут)}` });
        const vchera = (dmd.кривая || []).filter((k) => k.t.slice(0, 10) !== posled.t.slice(0, 10) && k.t.slice(11) <= posled.t.slice(11)).pop();
        const pik = segodnya.reduce((a, k) => (k.ждут > (a?.ждут ?? -1) ? k : a), null);
        if (pik && pik.ждут >= 100) {
          t.push({ cvet: "zhyoltyy", ves: 60, b: `Пик очереди сегодня — ${num(pik.ждут)} машин в ${pik.t.slice(11, 16)}`,
            s: `${num(pik.паллет)} паллет у ворот${vchera ? ` · вчера в это время ждали ${num(vchera.ждут)}` : ""}` });
        }
      }
      if (dmd.среднее_ожидание_мин > 60) {
        t.push({ cvet: dmd.среднее_ожидание_мин > 120 ? "krasnyy" : "zhyoltyy", ves: 70,
          b: `Ожидание ворот в среднем ${chmm(dmd.среднее_ожидание_мин)}`, s: `разгрузка сама — ${chmm(dmd.средняя_разгрузка_мин)}: ворота ждут дольше, чем работают` });
      }
    }

    const sektory = (priyomka?.секторы || []).filter((s) => /Сектор .+ ДМД$/.test(s.сектор) && s.цвет === "красный")
      .sort((a, b) => (b.процент_хранения || 0) - (a.процент_хранения || 0));
    for (const s of sektory.slice(0, 2)) {
      t.push({ cvet: "krasnyy", ves: 50 + (s.процент_хранения || 0) / 10, b: `Сектор ${bukvaSektora(s.сектор)} в красном`,
        s: `${String(s.процент_хранения).replace(".", ",")}% мест занято${s.доля_просрочки ? ` · ${String(s.доля_просрочки).replace(".", ",")}% штук на входе дольше 48 ч` : ""}` });
    }

    const zony = (priyomka?.возраст?.зоны || []).map((z) => ({ z, staroe: (z.корзины || {})["3. больше 48 ч"] || 0 }))
      .sort((a, b) => b.staroe - a.staroe);
    if (zony[0] && zony[0].staroe > 1000) {
      t.push({ cvet: "zhyoltyy", ves: 45, b: `${korotkoZona(zony[0].z.зона)}: ${tys(zony[0].staroe)} шт дольше 48 часов`,
        s: `больше всех на входе · всего в зоне ${tys(zony[0].z.штук)} шт` });
    }
    const vis = priyomka?.висяки;
    if (vis?.старое_штук) {
      const star = (vis.зоны || []).reduce((a, z) => ((z.максимум_дней || 0) > (a?.максимум_дней || 0) ? z : a), null);
      t.push({ cvet: "zhyoltyy", ves: 40, b: `${tys(vis.старое_штук)} шт висят на входе дольше недели`,
        s: star ? `самый старый — ${num(star.максимум_дней)} дней, ${korotkoZona(star.зона)}` : "" });
    }

    // Устаревшие данные — сами по себе тревога: экран не должен врать молча.
    const chas = new Date().getHours();
    const minutOt = (s) => s ? (Date.now() - new Date(s.replace(" ", "T")).getTime()) / 60000 : Infinity;
    if (chas >= 7 && chas <= 22 && minutOt(dvor?.обновлено) > 30) t.push({ cvet: "siniy", ves: 95, b: "Данные двора не обновлялись больше получаса", s: `последние — ${dvor?.обновлено || "нет"}` });
    if (chas >= 8 && chas <= 22 && minutOt(priyomka?.обновлено) > 150) t.push({ cvet: "siniy", ves: 94, b: "Данные зон не обновлялись больше двух часов", s: `последние — ${priyomka?.обновлено || "нет"}` });

    return t.sort((a, b) => b.ves - a.ves);
  }
  const sdvig = (t, minut) => {
    const d = new Date(t.replace(" ", "T"));
    d.setMinutes(d.getMinutes() + minut);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  function narisovatTrevogi() {
    const spisok = sobratTrevogi();
    $("ekTrevogi").innerHTML = spisok.length
      ? spisok.slice(0, 8).map((x) => `<li class="ekTrevoga ek--${x.cvet}"><i></i><div><b>${esc(x.b)}</b>${x.s ? `<span>${esc(x.s)}</span>` : ""}</div></li>`).join("")
      : '<li class="ekTrevoga ek--zelyonyy"><i></i><div><b>Тревог нет</b><span>все звенья входа в норме</span></div></li>';
  }

  /* ── машины во дворе ─────────────────────────────────────────────── */
  function narisovatMashiny() {
    const box = $("ekMashiny");
    const dmd = (dvor?.склады || []).find((s) => s.склад === "ДМД");
    if (!dmd) { box.innerHTML = ""; return; }
    const zhdut = (dmd.машины || []).filter((m) => m.этап !== "на разгрузке");
    const naVorotah = (dmd.машины || []).filter((m) => m.этап === "на разгрузке");
    $("ekOcheredPod").textContent = `${num(zhdut.length)} ждут ворот · ${num(naVorotah.length)} на воротах · сегодня приехало ${num(dmd.регистраций)}`;

    const plitki = [
      ...zhdut.map((m) => ({ cvet: PO_RUSSKI[m.цвет] || "seryy", b: hmm(m.на_дворе_мин), s: `${m.тип} · ${num(m.паллет)} пал` })),
      ...naVorotah.map((m) => ({ cvet: "siniy", b: hmm(m.разгрузка_мин || 0), s: `ворота ${m.ворота || "—"}` })),
    ];
    // Сколько плиток влезает в блок — остальное свернуть в «ещё N».
    const shir = box.clientWidth, vys = box.clientHeight;
    const kolonok = Math.max(1, Math.floor((shir + window.innerWidth * 0.0035) / (window.innerWidth * 0.052 + window.innerWidth * 0.0035)));
    const ryadov = Math.max(1, Math.floor((vys + window.innerHeight * 0.0045) / (window.innerHeight * 0.072 + window.innerHeight * 0.0045)));
    const vlezaet = kolonok * ryadov;
    const pokazat = plitki.length > vlezaet ? plitki.slice(0, vlezaet - 1) : plitki;
    box.innerHTML = pokazat.map((p) => `<div class="ekMashina ek--${p.cvet}"><b>${esc(p.b)}</b><span>${esc(p.s)}</span></div>`).join("")
      + (plitki.length > vlezaet ? `<div class="ekMashina is-esche"><b>+${num(plitki.length - pokazat.length)}</b><span>ещё машин</span></div>` : "")
      + (!plitki.length ? '<div class="ekMashina ek--zelyonyy"><b>0</b><span>двор пуст</span></div>' : "");
  }

  /* ── кривая очереди ──────────────────────────────────────────────── */
  function narisovatKrivuyu() {
    const holst = $("ekKrivaya");
    const dmd = (dvor?.склады || []).find((s) => s.склад === "ДМД");
    const tochki = dmd?.кривая || [];
    if (!tochki.length) { holst.innerHTML = ""; return; }
    const den = (dvor.обновлено || tochki[tochki.length - 1].t).slice(0, 10);
    const W = 1000;
    const H = Math.max(160, Math.round(W * holst.clientHeight / Math.max(holst.clientWidth, 1)));
    const L = 36, R = 16, T = 12, B = 24;
    const OT = 5 * 60, DO = 23 * 60;
    const minuty = (t) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));

    // Слоты по 10 минут: пустые в данных — это ноль, двор пуст.
    const ryad = (fil) => {
      const map = new Map(tochki.filter(fil).map((k) => [minuty(k.t), k]));
      const kon = fil === segodnyaFil ? Math.min(DO, minuty(dvor.обновлено || "00:00")) : DO;
      const out = [];
      for (let m = OT; m <= kon; m += 10) out.push({ m, k: map.get(m) || { ждут: 0, на_воротах: 0, паллет: 0 } });
      return out;
    };
    const segodnyaFil = (k) => k.t.slice(0, 10) === den;
    const vcheraFil = (k) => k.t.slice(0, 10) < den;
    const segodnya = ryad(segodnyaFil);
    const vchera = ryad(vcheraFil);
    const maksY = Math.max(10, ...segodnya.map((p) => p.k.ждут), ...vchera.map((p) => p.k.ждут)) * 1.12;
    const x = (m) => L + (W - L - R) * (m - OT) / (DO - OT);
    const y = (v) => T + (H - T - B) * (1 - v / maksY);

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" });
    for (let c = 6; c <= 22; c += 3) {
      el("line", { x1: x(c * 60), x2: x(c * 60), y1: T, y2: H - B, stroke: "#1d2a3a", "stroke-width": 1 }, svg);
      el("text", { x: x(c * 60), y: H - 6, "text-anchor": "middle", fill: "#5f6f84", "font-size": 13 }, svg, `${c}:00`);
    }
    for (const dolya of [0.5, 1]) {
      const v = Math.round(maksY / 1.12 * dolya);
      el("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", fill: "#5f6f84", "font-size": 12 }, svg, num(v));
    }
    const put = (ryadTochek, pole) => ryadTochek.map((p, i) => `${i ? "L" : "M"}${x(p.m).toFixed(1)},${y(p.k[pole]).toFixed(1)}`).join(" ");
    el("path", { d: put(vchera, "ждут"), fill: "none", stroke: "#46525f", "stroke-width": 2, "stroke-dasharray": "6 5" }, svg);
    if (segodnya.length) {
      el("path", { d: `${put(segodnya, "ждут")} L${x(segodnya[segodnya.length - 1].m)},${y(0)} L${x(OT)},${y(0)} Z`, fill: "#f05d72", "fill-opacity": 0.13 }, svg);
      el("path", { d: put(segodnya, "на_воротах"), fill: "none", stroke: "#4d8df7", "stroke-width": 2 }, svg);
      el("path", { d: put(segodnya, "ждут"), fill: "none", stroke: "#f05d72", "stroke-width": 3 }, svg);
      const sey = segodnya[segodnya.length - 1];
      el("circle", { cx: x(sey.m), cy: y(sey.k.ждут), r: 5, fill: "#f05d72" }, svg);
      el("text", { x: x(sey.m) + 9, y: y(sey.k.ждут) - 8, fill: "#ff8a9a", "font-size": 16, "font-weight": 700 }, svg, num(sey.k.ждут));
      const pik = segodnya.reduce((a, p) => (p.k.ждут > a.k.ждут ? p : a), segodnya[0]);
      if (pik.k.ждут > sey.k.ждут) {
        el("text", { x: x(pik.m), y: y(pik.k.ждут) - 8, "text-anchor": "middle", fill: "#9fb0c4", "font-size": 13 }, svg,
          `пик ${num(pik.k.ждут)} в ${hmm(pik.m)}`);
      }
    }
    holst.replaceChildren(svg);
  }

  /* ── часы, свежесть, обновление ──────────────────────────────────── */
  function chasy() {
    const d = new Date();
    $("ekChasy").textContent = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    $("ekData").textContent = d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  }

  function narisovatVsyo() {
    narisovatCepochku();
    narisovatKartu();
    narisovatTrevogi();
    narisovatMashiny();
    narisovatKrivuyu();
    $("ekSvezhest").innerHTML = `<span>двор: ${esc(dvor?.обновлено || "—")}, раз в 10 минут</span>`
      + `<span>зоны и висяки: ${esc(priyomka?.обновлено || "—")}, раз в час</span>`
      + `<span>источник: WMS · ucenka-vi.ru/priyomka/ekran/</span>`;
  }

  async function zagruzit() {
    const vzyat = (imya) => fetch(DATA + imya, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [d, p] = await Promise.all([vzyat("dvor.json"), vzyat("priyomka.json")]);
    if (d) dvor = d;
    if (p) priyomka = p;
    narisovatVsyo();
  }

  $("ekPolnyi").addEventListener("click", () => document.documentElement.requestFullscreen?.());
  let tishina = null;
  document.addEventListener("mousemove", () => {
    document.body.classList.remove("is-tiho");
    clearTimeout(tishina);
    tishina = setTimeout(() => document.body.classList.add("is-tiho"), 3000);
  });
  let pereris = null;
  window.addEventListener("resize", () => { clearTimeout(pereris); pereris = setTimeout(narisovatVsyo, 200); });

  chasy();
  setInterval(chasy, 1000);
  zagruzit();
  setInterval(zagruzit, 60 * 1000);
  // Раз в шесть часов — полная перезагрузка: экран висит сутками и должен
  // подхватывать новые версии страницы без человека у монитора.
  setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
})();
