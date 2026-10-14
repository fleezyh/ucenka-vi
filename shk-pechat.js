/* Печать ШК паллеты с компьютера стола (30.09.2026, вечер).

   Степан: «надо создание паллет из пикалки и возможность печатать ШК сразу после этого».
   В вмс «Печать этикеток» бывает удалённой (сетевой принтер из справочника — у столов ФБ
   своих там нет) и локальной — с компьютера, на его принтер. Здесь — локальная: сайт сам
   рисует этикетку (Code 128, как наклейка вмс «CON 0168673141») и отдаёт её на печать
   браузеру. Формат этикетки выбирается один раз и запоминается на этом компьютере.

   ShkPechat.svg(tekst)                      — штрихкод SVG-строкой
   ShkPechat.pechat({ shk, imya, kategoriya }) — печать этикетки
   ShkPechat.formaty / format() / zadatFormat(k) */
(function () {
  "use strict";
  // Code 128: ширины полос и пробелов для значений 0…106 (106 — стоп).
  const P = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];
  const START_B = 104;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function kody(tekst) {
    const t = String(tekst || "");
    const v = [START_B];
    for (const ch of t) {
      const k = ch.charCodeAt(0) - 32;
      if (k < 0 || k > 94) throw new Error("в штрихкоде недопустимый символ: " + ch);
      v.push(k);
    }
    const sum = v.reduce((s, x, i) => s + x * (i || 1), 0);
    v.push(sum % 103, 106);
    return v;
  }

  /** Штрихкод SVG: ширина в модулях, растягивается по контейнеру. */
  function svg(tekst, vysota = 40) {
    const polosy = [];
    let x = 10;                       // тихая зона 10 модулей
    for (const k of kody(tekst)) {
      const w = P[k];
      for (let i = 0; i < w.length; i++) {
        const n = Number(w[i]);
        if (i % 2 === 0) polosy.push(`<rect x="${x}" y="0" width="${n}" height="${vysota}"/>`);
        x += n;
      }
    }
    x += 10;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} ${vysota}" preserveAspectRatio="none" shape-rendering="crispEdges">${polosy.join("")}</svg>`;
  }

  const FORMATY = { "60x30": [60, 30], "70x50": [70, 50], "100x100": [100, 100] };
  const KLYUCH = "shk-format";
  // 01.10 (Белитов: «60*30 боком печатает»): драйвер термопринтера держит ленту книжной —
  // широкая этикетка уходит повёрнутой. Поворот запоминается на компьютере для каждого формата.
  const KL_POV = "shk-povorot";
  const povorot = (f) => { try { return (JSON.parse(localStorage.getItem(KL_POV) || "{}"))[f] === true; } catch (e) { return false; } };
  const zadatPovorot = (f, da) => { try { const o = JSON.parse(localStorage.getItem(KL_POV) || "{}"); o[f] = !!da; localStorage.setItem(KL_POV, JSON.stringify(o)); } catch (e) { /* не страшно */ } };
  // 08.10 Степан: «надо 60x30, а печатается по-разному» — по умолчанию 60×30 (на ленте столов)
  const format = () => { try { const f = localStorage.getItem(KLYUCH); return FORMATY[f] ? f : "60x30"; } catch (e) { return "60x30"; } };
  const zadatFormat = (f) => { if (FORMATY[f]) try { localStorage.setItem(KLYUCH, f); } catch (e) { /* не сохранилось — не страшно */ } };

  /* 14.10 Степан: «в чём смысл два раза писать — должно остаться посередине максимально крупно в рамках наклейки,
     и штрихкод как и везде, снизу ничего не надо; в печати вообще другое покажет». Наклейка: заголовок один раз,
     по центру, кегль подбирается под ширину (длинный — в две строки), под ним — пояснение, только если это не повтор
     (товар у акта), дальше штрихкод с кодом. Превью на странице наклеек рисуется этой же разметкой.
     Данные: { shk, zag, pod } или по-старому { shk, kategoriya, imya } — повтор (имя паллеты = категория + номер) отбрасываем. */
  function norm(d) {
    const shk = String(d.shk || "");
    // 14.10: «название паллеты должно быть целиком» — имя («ФБ-Сад-0170347571») главнее категории
    const zag = String(d.zag || d.imya || d.kategoriya || shk).trim();
    let pod = String(d.pod || "").trim();
    const cifry = (shk.match(/\d{5,}/) || [""])[0].replace(/^0+/, "");
    if (!pod || pod === zag || pod.startsWith(zag) || zag.startsWith(pod) || (cifry && pod.includes(cifry))) pod = "";
    return { shk, zag, pod };
  }
  const SHIR_BUKVY = 0.5;   // ширина жирной буквы Arial в долях кегля — с запасом вверх, точнее подгоняет PODGON
  function etiketka(dannye, f, pov = povorot(f)) {
    const { shk, zag, pod } = norm(dannye);
    const [w, h] = FORMATY[f] || FORMATY["60x30"];
    const pole = Math.max(1.5, Math.min(w, h) * 0.06);
    const shir = w - 2 * pole, vys = h - 2 * pole;
    const zagMax = vys * (pod ? 0.3 : 0.38);
    const odna = Math.min(zagMax, shir / Math.max(3, zag.length * SHIR_BUKVY));
    const dve = Math.min(zagMax * 0.62, shir / Math.max(3, (Math.ceil(zag.length / 2) + 1) * SHIR_BUKVY));
    const dveStroki = zag.length > 8 && dve > odna * 1.2;
    const kegl = dveStroki ? dve : odna;
    const podKegl = Math.min(vys * 0.1, 4.5);
    const kodKegl = Math.min(vys * 0.1, 4.5);
    const [pw, ph] = pov ? [h, w] : [w, h];
    const mm = (x) => `${Math.round(x * 100) / 100}mm`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(zag)}</title><style>
      @page { size: ${pw}mm ${ph}mm; margin: 0 }
      @font-face { font-family: "VI Sans"; src: url("${SHRIFT}VI_Sans_DemiBold.woff2") format("woff2"); font-weight: 600 }
      @font-face { font-family: "VI Sans"; src: url("${SHRIFT}VI_Sans_Medium.woff2") format("woff2"); font-weight: 500 }
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden }
      body { font-family: "VI Sans", Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact;
             display: flex; align-items: center; justify-content: center; background: #fff }
      .l { flex: none; width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: ${mm(pole)}; display: flex; flex-direction: column;
           align-items: center; justify-content: center; gap: ${mm(vys * 0.04)}; overflow: hidden; text-align: center;
           ${pov ? "transform: rotate(90deg);" : ""} }
      .z, .p, .k { flex: none }
      .z { font-weight: 600; font-size: ${mm(kegl)}; line-height: 1.15; max-width: 100%; overflow: hidden;
           ${dveStroki ? "display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" : "white-space: nowrap;"} }
      .p { font-weight: 500; font-size: ${mm(podKegl)}; line-height: 1.1; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }
      .b { flex: 1 1 auto; min-height: ${mm(vys * 0.3)}; width: 100% }
      .b svg { width: 100%; height: 100%; display: block }
      .k { font-weight: 600; font-size: ${mm(kodKegl)}; line-height: 1; letter-spacing: .08em }
    </style></head><body><div class="l">
      <div class="z${dveStroki ? " z2" : ""}">${esc(zag)}</div>${pod ? `<div class="p">${esc(pod)}</div>` : ""}
      <div class="b">${svg(shk, 40)}</div><div class="k">${esc(shk)}</div>
    </div>${PODGON}</body></html>`;
  }
  // 14.10 «название паллеты должно быть целиком»: ширина букв на глаз врёт («МисБокс-0170…» обрезалось) — кегль
  // берём с запасом и уменьшаем по факту, пока заголовок не войдёт целиком (по ширине и по двум строкам).
  // 14.10 Степан: «хочу вот так, с красивым шрифтом» — VI Sans DemiBold, как карточки сайта (шрифт с сайта по полному адресу:
  // наклейка печатается из фрейма about:blank). Подгон — после загрузки шрифта, иначе меряется запасной Arial.
  const SHRIFT = (typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "") + "/assets/fonts/";
  const PODGON = `<script>(function () {
    function podgon() {
    var zz = document.querySelectorAll(".z");
    for (var j = 0; j < zz.length; j++) {
      var z = zz[j], s = parseFloat(getComputedStyle(z).fontSize), i = 0;
      while (i++ < 60 && (z.scrollWidth > z.clientWidth + 0.5 || (z.classList.contains("z2") && z.scrollHeight > z.clientHeight + 0.5))) { s *= 0.96; z.style.fontSize = s + "px"; }
    }
    }
    var f = document.fonts;
    if (f && f.load) f.load('600 20px "VI Sans"').then(podgon, podgon); else podgon();
  })();</script>`;

  /** Печать: скрытый фрейм с этикеткой → окно печати браузера (принтер стола).
      08.10 «печатается через раз по-разному»: фрейм был 0×0 и печать звалась через 150 мс, не дожидаясь
      отрисовки. Теперь фрейм размером с этикетку (за экраном), печать — после загрузки и двух кадров. */
  function pechat(dannye, f = format()) {
    let fr = document.getElementById("shkPechatFrame");
    if (fr) fr.remove();
    const [w, h] = FORMATY[f] || FORMATY["60x30"];
    const [pw, ph] = povorot(f) ? [h, w] : [w, h];
    fr = document.createElement("iframe");
    fr.id = "shkPechatFrame";
    fr.style.cssText = `position:fixed;left:-2000px;top:0;width:${pw}mm;height:${ph}mm;border:0;opacity:0;pointer-events:none`;
    document.body.appendChild(fr);
    const d = fr.contentWindow.document;
    // 09.10: dannye — одна этикетка или список (пачка наклеек актов: по одной на страницу, одно окно печати)
    d.open(); d.write(Array.isArray(dannye) ? pachka(dannye, f) : etiketka(dannye, f)); d.close();
    const pusk = () => {
      const win = fr.contentWindow;
      // 14.10: VI Sans грузится с сайта — ждём сам шрифт (и подгон кегля под него), потом печать
      const fs = win.document.fonts;
      const shrifty = fs && fs.load ? fs.load('600 20px "VI Sans"').catch(() => {}).then(() => fs.ready)
        : fs && fs.ready ? fs.ready : Promise.resolve();
      // кадры фрейма за экраном Chrome не рисует (rAF там не срабатывает) — ждём таймером главного окна
      shrifty.then(() => setTimeout(() => { win.focus(); win.print(); }, 120));
    };
    if (d.readyState === "complete") setTimeout(pusk, 50); else fr.addEventListener("load", pusk, { once: true });
  }
  /** Пачка этикеток: стиль одной, тела — каждая на своей странице того же размера. */
  function pachka(spisok, f) {
    const [w, h] = FORMATY[f] || FORMATY["60x30"];
    const [pw, ph] = povorot(f) ? [h, w] : [w, h];
    const odna = etiketka(spisok[0], f);
    const golova = odna.slice(0, odna.indexOf("<body>"));
    const tela = spisok.map((x) => {
      const t = etiketka(x, f);
      return `<div class="pg">${t.slice(t.indexOf("<body>") + 6, t.lastIndexOf("</body>"))}</div>`;
    }).join("");
    return golova.replace("</style>", `html, body { height: auto !important; width: auto !important; overflow: visible !important; display: block !important }
      .pg { position: relative; width: ${pw}mm; height: ${ph}mm; overflow: hidden; page-break-after: always; break-after: page;
            display: flex; align-items: center; justify-content: center }
      .pg:last-child { page-break-after: auto; break-after: auto }</style>`) + `<body>${tela}</body></html>`;
  }
  const dannyeAkta = (nomer, tovar = "", kategoriya = "") => {
    const n = String(nomer).replace(/\D/g, "").replace(/^0+/, "");
    return n ? { shk: `ACT ${n.padStart(10, "0")}`, zag: `Акт №${n}`, pod: String(tovar || "").slice(0, 80) } : null;
  };
  /** Пачка наклеек актов: [{акт, товар}] или номера. */
  function pechatAktov(spisok) {
    const d = (spisok || []).map((x) => (typeof x === "object" ? dannyeAkta(x.акт, x.товар, x.категория) : dannyeAkta(x))).filter(Boolean);
    if (d.length) pechat(d);
  }
  /** Наклейка акта — та же этикетка, что у паллет: «Акт №…» крупно, ШК ACT, товар. */
  function pechatAkta(nomer, tovar = "", kategoriya = "") {
    const n = String(nomer).replace(/\D/g, "").replace(/^0+/, "");
    if (!n) return;
    pechat(dannyeAkta(n, tovar, kategoriya));
  }

  window.ShkPechat = { svg, pechat, pechatAkta, pechatAktov, etiketka, formaty: Object.keys(FORMATY), format, zadatFormat, povorot, zadatPovorot };
})();
