/* Новости уценки — лента и статья (27.09). Стиль — как у Медузы: главная новость крупно,
   рядом «Коротко», дальше карточки и цитаты; статья — узкая колонка для чтения.
   Без картинок: вместо них цвет рубрики и цитаты с встреч. */
(function () {
  "use strict";

  const LENTY = [
    { key: "uc", imya: "Уценка", c: "#27c46b", src: "data/news.json" },
    { key: "ag", imya: "Антигенерация", c: "#f05d72", src: "data/news-antigen.json" },
    { key: "sl", imya: "Продажи", c: "#f5ad32", src: "data/news-sales.json" },
  ];
  const MES = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const DNI = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]));
  const dataTxt = (d) => { const m = /(\d{4})-(\d\d)-(\d\d)/.exec(d || ""); return m ? `${+m[3]} ${MES[+m[2] - 1]}` : ""; };
  const box = document.getElementById("nv");

  let vse = [];      // все новости всех лент, свежие сверху
  let svodka = null; // «итоги месяца» из news.json
  let rubrika = "";  // фильтр ленты
  let pokazano = 12; // карточек в сетке; «Показать ещё» — плюс 12

  function rub(n) {
    return `<span class="nvRub" style="--c:${n.lenta.c}">${esc(n.lenta.imya)}</span>`;
  }
  function lid(n) { return (n.цифры || [])[0] || ((n.пункты || [])[0] || {}).текст || ""; }
  function citata(n) { return (n.пункты || []).find((p) => p.цитата && p.цитата.length > 20); }

  // Одна карточка на всё (28.09, «слишком вразнобой — не за что глазу зацепиться»):
  // цвет рубрики — только полоска сверху и подпись, цитата — строкой внутри.
  function karta(n) {
    const q = citata(n);
    return `<a class="nvKarta" href="novosti/#/${n.id}" style="--c:${n.lenta.c}">
      ${rub(n)}<h3>${esc(n.заголовок)}</h3><p class="nvKarta__lid">${esc(lid(n))}</p>
      ${q ? `<p class="nvKarta__q">«${esc(q.цитата)}» <span>— ${esc(q.кто)}</span></p>` : ""}
      ${n.встреча ? `<p class="nvMeta">${esc(n.встреча)}</p>` : ""}</a>`;
  }

  // Лента по дням: дата — заголовок, под ней карточки этого дня.
  function poDnyam(spisok) {
    const dni = [];
    spisok.forEach((n) => {
      const d = dni[dni.length - 1];
      if (d && d.data === n.дата) d.n.push(n); else dni.push({ data: n.дата, n: [n] });
    });
    return dni.map((d) => `<section class="nvDenBlok"><h3 class="nvDenBlok__d">${dataTxt(d.data)}</h3>
      <div class="nvSetka">${d.n.map(karta).join("")}</div></section>`).join("");
  }

  let sohranitProkrutku = false;
  function lenta() {
    const spisok = vse.filter((n) => !rubrika || n.lenta.key === rubrika);
    const [glav, ...ost] = spisok;
    const segodnya = new Date();
    const tabs = [{ key: "", imya: "Все", c: "#f2f6fb" }, ...LENTY].map((l) =>
      `<button type="button" class="nvTab${rubrika === l.key ? " is-on" : ""}" data-rub="${l.key}" style="--c:${l.c}">${l.imya}</button>`).join("");
    const korotko = ost.slice(0, 6).map((n) => `
      <a class="nvKor" href="novosti/#/${n.id}"><span class="nvKor__d">${dataTxt(n.дата)}</span>
        <span class="nvKor__t"><i style="--c:${n.lenta.c}"></i>${esc(n.заголовок)}</span></a>`).join("");
    const s = svodka;
    box.innerHTML = `
      <header class="nvShapka">
        <p class="nvDen">${DNI[segodnya.getDay()]}, ${segodnya.getDate()} ${MES[segodnya.getMonth()]}</p>
        <h1 class="nvLogo">Новости<span>.</span></h1>
        <nav class="nvTabs" aria-label="Рубрики">${tabs}</nav>
      </header>
      ${glav ? `<section class="nvVerh">
        <a class="nvGlav" href="novosti/#/${glav.id}" style="--c:${glav.lenta.c}">
          ${rub(glav)}<h2>${esc(glav.заголовок)}</h2>
          <p class="nvGlav__lid">${esc(lid(glav))}</p>
          ${citata(glav) ? `<blockquote>«${esc(citata(glav).цитата)}»<cite>${esc(citata(glav).кто)}</cite></blockquote>` : ""}
          <p class="nvMeta">${dataTxt(glav.дата)}${glav.встреча ? ` · ${esc(glav.встреча)}` : ""}</p>
        </a>
        <aside class="nvKorotko"><p class="nvZag">Коротко</p>${korotko}</aside>
      </section>` : '<p class="nvZhdu">Новостей нет.</p>'}
      ${s && !rubrika ? `<a class="nvItogi" href="novosti/#/itogi">
        <p class="nvZag">Итоги месяца · ${esc(s.период || "")}</p>
        <p class="nvItogi__t">${esc(s.итог)}</p>
        <div class="nvItogi__tri">
          <div><b>Тянется</b>${(s.тянется || []).slice(0, 2).map((x) => `<p>${esc(x)}</p>`).join("")}</div>
          <div><b>Сделано</b>${(s.сделано || []).slice(0, 2).map((x) => `<p>${esc(x)}</p>`).join("")}</div>
          <div><b>Цифры</b>${(s.цифры || []).slice(0, 2).map((x) => `<p>${esc(x)}</p>`).join("")}</div>
        </div><span class="nvDalee">Читать целиком →</span></a>` : ""}
      ${poDnyam(ost.slice(6, 6 + pokazano))}
      ${ost.length > 6 + pokazano ? `<button type="button" class="nvEshyo" data-eshyo>Показать ещё · осталось ${ost.length - 6 - pokazano}</button>` : ""}`;
    if (!sohranitProkrutku) window.scrollTo(0, 0);
    sohranitProkrutku = false;
  }

  function statya(n) {
    const pohozhie = vse.filter((x) => x.lenta.key === n.lenta.key && x.id !== n.id).slice(0, 3);
    box.innerHTML = `
      <article class="nvStatya" style="--c:${n.lenta.c}">
        <a class="nvNazad" href="novosti/">← Все новости</a>
        <p class="nvStatya__meta">${rub(n)}<span>${dataTxt(n.дата)}${n.встреча ? ` · ${esc(n.встреча)}` : ""}</span></p>
        <h1>${esc(n.заголовок)}</h1>
        ${(n.цифры || []).length ? `<section class="nvKorBox"><p class="nvZag">Коротко</p><ul>${n.цифры.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
        ${(n.пункты || []).map((p) => `<section class="nvPunkt">
          ${p.цитата ? `<blockquote>«${esc(p.цитата)}»</blockquote>` : ""}
          <p><b>${esc(p.кто)}.</b> ${esc(p.текст)}</p></section>`).join("")}
        ${(n.теги || []).length ? `<p class="nvTegi">${n.теги.map((t) => `<span>${esc(t)}</span>`).join("")}</p>` : ""}
      </article>
      ${pohozhie.length ? `<section class="nvEshe"><p class="nvZag">Ещё — ${esc(n.lenta.imya)}</p><div class="nvSetka">${pohozhie.map(karta).join("")}</div></section>` : ""}`;
    window.scrollTo(0, 0);
  }

  function itogi() {
    const s = svodka;
    const blok = (zag, arr) => (arr || []).length ? `<section class="nvKorBox"><p class="nvZag">${zag}</p><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : "";
    box.innerHTML = `<article class="nvStatya" style="--c:#27c46b">
      <a class="nvNazad" href="novosti/">← Все новости</a>
      <p class="nvStatya__meta"><span class="nvRub" style="--c:#27c46b">Итоги месяца</span><span>${esc(s.период || "")} · встреч ${esc(s.встреч || "")}</span></p>
      <h1>Что было за месяц</h1>
      <p class="nvStatya__lid">${esc(s.итог)}</p>
      ${blok("Тянется", s.тянется)}${blok("Сделано", s.сделано)}${blok("Цифры", s.цифры)}
    </article>`;
    window.scrollTo(0, 0);
  }

  function marshrut() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    if (h === "itogi" && svodka) return itogi();
    const n = h && vse.find((x) => x.id === h);
    return n ? statya(n) : lenta();
  }

  box.addEventListener("click", (e) => {
    if (e.target.closest("[data-eshyo]")) { pokazano += 12; sohranitProkrutku = true; lenta(); return; }
    const t = e.target.closest("[data-rub]");
    if (!t) return;
    rubrika = t.dataset.rub; pokazano = 12;
    lenta();
  });
  window.addEventListener("hashchange", marshrut);

  Promise.all(LENTY.map((l) => fetch(l.src, { cache: "no-store" }).then((o) => (o.ok ? o.json() : null)).catch(() => null)))
    .then((dannye) => {
      dannye.forEach((d, i) => {
        if (!d) return;
        if (LENTY[i].key === "uc" && d.сводка) svodka = d.сводка;
        (d.записи || []).forEach((z, j) => vse.push({ ...z, lenta: LENTY[i], id: `${LENTY[i].key}-${z.дата}-${j}` }));
      });
      vse.sort((a, b) => String(b.дата).localeCompare(String(a.дата)));
      marshrut();
    });
})();
