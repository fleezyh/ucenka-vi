/* Каждая красная плашка пикалки — в журнал (12.10.2026, Степан: «надо проверить, что каждый случай с красной плашкой,
   когда появляется, записывается — а то походу вообще нихуя»).
   Сервер сам пишет только свои отказы перекладки; всё, что пикалка рисует красным сама (стоп «акт не принят», «не
   переместилось», ошибки приёмки, ВТИС, сети), раньше не видел никто. Скрипт смотрит на экран: появилась видимая
   красная плашка — шлёт её текст на /__pik/krasnoe. Та же плашка повторно — не чаще раза в 10 минут.
   Личные промахи («не выбран стол» и т. п.) не пишем: «нам нет смысла знать её, это ошибка личная». */
(() => {
  "use strict";
  const VIDY = [
    [".aktStop:not([hidden]) .aktStop__okno", "стоп"],
    [".bigIt.is-err", "итог перекладки"],
    [".aktPs__oshibka", "карточка"],
    [".aktPs__net", "карточка"],
    [".palKarta__oshibka", "паллета"],
    [".aktStop__vpOsh", "приёмка со стола"],
    [".vmsPolosa__net", "связь с WMS"],
    ["#message.error", "сообщение"],
  ];
  // 12.10: «акта 530922 нет в вмс» — опечатка в номере (5309222), тоже личное
  const LICHNYE = /не выбран стол|пикните наклейку своего стола|уже в списке|дождитесь загрузки|список пуст|^акта \d+ нет в вмс$/i;
  const bylo = new Map();   // вид|текст → когда слали
  // 13.10 (Будаев, акт 4874364: одна ситуация — три строки в «Ошибках»): стоп пишем один раз на акт и только когда
  // проверка «можно ли принять здесь» закончилась — пока она идёт, текст плашки меняется. «Приёмка со стола» внутри
  // открытого стопа отдельно не пишем — она уже в тексте стопа.
  const IDET_PROVERKA = /смотрю в WMS|смотрю, можно ли|принимаю в WMS|выгружаю перемещение|перечитываю акт/i;

  const vidno = (el) => Boolean(el && (el.offsetParent !== null || el.getClientRects().length));
  const tekstOf = (el) => {
    const kopiya = el.cloneNode(true);
    kopiya.querySelectorAll("button, .aktStop__poka, .aktStop__knopki").forEach((x) => x.remove());
    // текст по кусочкам через пробел: у отсоединённой копии innerText без вёрстки склеивал «Не переместилосьACT …»
    const kuski = [];
    const hod = document.createTreeWalker(kopiya, NodeFilter.SHOW_TEXT);
    while (hod.nextNode()) kuski.push(hod.currentNode.nodeValue);
    return kuski.join(" ").replace(/\s+/g, " ").trim();
  };
  const aktIz = (el, tekst) => {
    const m = String(tekst).match(/(?:Акт\s*№|ACT\s*0*|акт\s+)(\d{5,10})/i);
    if (m) return m[1];
    const blok = el.closest("section, article, .aktPs, .cModal__okno, main") || document;
    const m2 = (blok.innerText || "").match(/(?:Акт\s*№|ACT\s*0*)(\d{5,10})/i);
    return m2 ? m2[1] : "";
  };

  // 12.10: висящая плашка слалась заново каждые 10 минут (акт 5309222: 10 плашек на 5 настоящих отказов). Теперь шлём,
  // только когда плашка появилась: была на экране в прошлый проход — это та же, просто страница перерисовалась.
  let naEkrane = new Set();
  function proverit() {
    const seychas = Date.now();
    const teper = new Set();
    for (const [sel, vid] of VIDY) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!vidno(el)) return;
        const tekst = tekstOf(el).slice(0, 600);
        if (!tekst || LICHNYE.test(tekst)) return;
        if (vid === "приёмка со стола" && el.closest(".aktStop:not([hidden])")) return;
        if (vid === "стоп" && IDET_PROVERKA.test(tekst)) return;
        // 13.10: «можно принять прямо здесь» без ошибки — не отказ (товар из частей ждёт подтверждения человека)
        if (vid === "стоп" && /Можно принять прямо здесь/.test(tekst) && !el.querySelector(".aktStop__vpOsh")) return;
        const kl = vid === "стоп" ? `стоп|${aktIz(el, tekst) || tekst}` : vid + "|" + tekst;
        teper.add(kl);
        if (naEkrane.has(kl) || seychas - (bylo.get(kl) || 0) < 60 * 1000) return;
        bylo.set(kl, seychas);
        fetch("/__pik/krasnoe", {
          method: "POST", keepalive: true, credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ вид: vid, текст: tekst, акт: aktIz(el, tekst), страница: location.pathname }),
        }).catch(() => {});
      });
    }
    naEkrane = teper;
  }

  let tajmer = 0;
  const pozzhe = () => { clearTimeout(tajmer); tajmer = setTimeout(proverit, 400); };
  const nachat = () => {
    new MutationObserver(pozzhe).observe(document.body, { subtree: true, childList: true, characterData: true,
                                                          attributes: true, attributeFilter: ["class", "hidden"] });
    pozzhe();
  };
  if (document.body) nachat(); else document.addEventListener("DOMContentLoaded", nachat);
})();
