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
  const format = () => { try { const f = localStorage.getItem(KLYUCH); return FORMATY[f] ? f : "70x50"; } catch (e) { return "70x50"; } };
  const zadatFormat = (f) => { if (FORMATY[f]) try { localStorage.setItem(KLYUCH, f); } catch (e) { /* не сохранилось — не страшно */ } };

  function etiketka({ shk, imya, kategoriya }, f, pov = povorot(f)) {
    const [w, h] = FORMATY[f];
    const krupno = h >= 50;
    const kv = h >= 100;
    // Повёрнутая этикетка: страница — как лента в драйвере (h×w), сама этикетка развёрнута на 90°.
    const [pw, ph] = pov ? [h, w] : [w, h];
    const razmer = (x) => `${Math.round(x * 10) / 10}mm`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(imya || shk)}</title><style>
      @page { size: ${pw}mm ${ph}mm; margin: 0 }
      html, body { margin: 0; padding: 0; width: ${pw}mm; height: ${ph}mm; overflow: hidden }
      body { font-family: Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; position: relative }
      .l { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: ${kv ? 5 : krupno ? 3 : 1.5}mm ${kv ? 5 : krupno ? 4 : 2.5}mm;
           display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;
           ${pov ? `position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: translate(${pw}mm, 0) rotate(90deg);` : ""} }
      .k { font-weight: 700; font-size: ${kv ? 13 : krupno ? 6.5 : 4}mm; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
      .b { flex: 1; min-height: 0; margin: ${kv ? 4 : krupno ? 2 : 1}mm 0 }
      .b svg { width: 100%; height: 100%; display: block }
      .t { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; font-size: ${kv ? 5 : krupno ? 3 : 2.2}mm; line-height: 1.1; white-space: nowrap }
      .t span { overflow: hidden; text-overflow: ellipsis; min-width: 0 }
      .t b { font-family: "Courier New", monospace; font-size: ${kv ? 7 : krupno ? 3.8 : 2.8}mm }
    </style></head><body><div class="l" data-razmer="${razmer(w)}x${razmer(h)}">
      <div class="k">${esc(kategoriya || imya)}</div>
      <div class="b">${svg(shk, 40)}</div>
      <div class="t"><b>${esc(shk)}</b><span>${esc(imya)}</span></div>
    </div></body></html>`;
  }

  /** Печать: скрытый фрейм с этикеткой → окно печати браузера (принтер стола). */
  function pechat(dannye, f = format()) {
    let fr = document.getElementById("shkPechatFrame");
    if (fr) fr.remove();
    fr = document.createElement("iframe");
    fr.id = "shkPechatFrame";
    fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(fr);
    const d = fr.contentWindow.document;
    d.open(); d.write(etiketka(dannye, f)); d.close();
    setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 150);
  }

  window.ShkPechat = { svg, pechat, etiketka, formaty: Object.keys(FORMATY), format, zadatFormat, povorot, zadatPovorot };
})();
