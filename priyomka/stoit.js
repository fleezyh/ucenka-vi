/* «Стоит ли склад?» — ответ одной строкой наверху приёмки ДМД (28.09).
 *
 * Вопрос Степана: отвечает ли борд, стоит ли склад. Ответ собирается по
 * звеньям входа — двор, приёмка, размещение — и честно говорит «не знаю»,
 * когда DWH застыл: тогда очередь на дворе растёт на бумаге, а темп внутри
 * склада известен только на момент последних данных.
 *
 * Темп: последний полный час и три последних против нормы — медианы того же
 * дня недели и часа за пять недель (priyomka_temp.py). Карточка кликается и
 * ведёт к своему блоку ниже.
 */
(() => {
  "use strict";
  const el = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const chislo = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const vremya = (s) => String(s || "").slice(11, 16);
  const skolko = (min) => min >= 60 ? `${Math.floor(min / 60)} ч ${min % 60} мин` : `${min} мин`;

  const SOST = {
    "стоит": { klass: "st--krasnyy", slovo: "стоит" },
    "тормозит": { klass: "st--zhyoltyy", slovo: "тормозит" },
    "норма": { klass: "st--zelyonyy", slovo: "работает" },
    "нет нормы": { klass: "st--seryy", slovo: "нет нормы" },
    "застыл": { klass: "st--seryy", slovo: "данные застыли" },
  };
  const DVOR = { "красный": "стоит", "жёлтый": "тормозит", "зелёный": "норма" };

  async function json(adres) {
    try {
      const o = await fetch(adres, { cache: "no-cache" });
      return o.ok ? await o.json() : null;
    } catch { return null; }
  }

  // Мини-график: факт за двое суток сплошной, норма пунктиром.
  function grafik(ryad) {
    if (!ryad.length) return "";
    const w = 260, h = 46;
    const max = Math.max(1, ...ryad.map((x) => Math.max(x.штук || 0, x.норма || 0)));
    const xy = (i, v) => `${(i * w / (ryad.length - 1)).toFixed(1)},${(h - 2 - (v || 0) * (h - 4) / max).toFixed(1)}`;
    const fakt = ryad.map((x, i) => xy(i, x.штук)).join(" ");
    const norma = ryad.map((x, i) => (x.норма == null ? null : xy(i, x.норма))).filter(Boolean).join(" ");
    return `<svg class="stGr" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline class="stGr__norma" points="${norma}"/><polyline class="stGr__fakt" points="${fakt}"/></svg>`;
  }

  function kartochka(zag, sost, glavnoe, pod, kuda, ryad) {
    const s = SOST[sost] || SOST["нет нормы"];
    return `<a class="stKart ${s.klass}" href="${kuda}">
      <p class="stKart__zag">${esc(zag)} · <b>${esc(s.slovo)}</b></p>
      <p class="stKart__znak">${glavnoe}</p>
      <p class="stKart__pod">${pod}</p>
      ${ryad ? grafik(ryad) : ""}
    </a>`;
  }

  async function start() {
    const uzel = el("stoit");
    if (!uzel) return;
    const [pr, dv, sv] = await Promise.all([json("../data/priyomka.json"), json("../data/dvor.json"), json("../data/svezhest.json")]);
    const temp = pr && pr.темп;
    const v = (temp && temp.вердикт) || {};
    const dmd = dv && (dv.склады || []).find((s) => s.склад === "ДМД");
    const zastyl = sv && sv.застыл;
    const kray = sv && (sv.источники || []).reduce((m, x) => (!m || x.край > m.край ? x : m), null);

    const zvenya = [];
    if (dmd) zvenya.push(["двор", zastyl ? "застыл" : DVOR[dmd.цвет] || "нет нормы"]);
    ["приёмка", "размещение"].forEach((k) => { if (v[k]) zvenya.push([k, v[k].состояние]); });
    const stoyat = zvenya.filter(([, s]) => s === "стоит").map(([k]) => k);
    const tormozyat = zvenya.filter(([, s]) => s === "тормозит").map(([k]) => k);
    const chas = v["размещение"] ? vremya(v["размещение"].час) : "";

    let otvet, klass, poyasnenie;
    if (zastyl) {
      otvet = "Не знаю — данные застыли";
      klass = "st--seryy";
      poyasnenie = `WMS не присылает данные с ${esc(vremya(kray && kray.край))} — уже ${skolko(kray ? Math.max(0, Math.round((Date.now() - Date.parse(kray.край.replace(" ", "T") + ":00+03:00")) / 60000)) : 0)}. `
        + `Очередь на дворе и время ожидания ниже растут на бумаге. `
        + (chas ? `За последние три часа данных (${String((+chas.slice(0, 2) + 22) % 24).padStart(2, "0")}:00–${String((+chas.slice(0, 2) + 1) % 24).padStart(2, "0")}:00): `
          + zvenya.filter(([k]) => k !== "двор").map(([k, s]) => `${k} — ${(SOST[s] || SOST["нет нормы"]).slovo}`).join(", ") + "." : "");
    } else if (stoyat.length) {
      otvet = `Да — стоит ${stoyat.join(" и ")}`;
      klass = "st--krasnyy";
      poyasnenie = "за последние три часа сделано меньше 40% от обычного для этого часа и дня недели";
    } else if (tormozyat.length) {
      otvet = `Нет, но тормозит ${tormozyat.join(" и ")}`;
      klass = "st--zhyoltyy";
      poyasnenie = "за последние три часа 40–70% от обычного для этого часа и дня недели";
    } else {
      otvet = "Нет — склад работает";
      klass = "st--zelyonyy";
      poyasnenie = "двор без пробки, приёмка и размещение идут в обычном темпе";
    }

    const ryad = (k) => (temp && temp.ряд || []).filter((x) => x.участок === k);
    const temKart = (k) => {
      const x = v[k];
      if (!x) return "";
      const dolya = x.доля_3ч != null ? `${Math.round(x.доля_3ч * 100)}% от нормы` : "нормы пока нет";
      return kartochka(k[0].toUpperCase() + k.slice(1), x.состояние,
        `${chislo(x.факт_3ч)} шт <small>за 3 ч · ${dolya}</small>`,
        `норма ${x.норма_3ч != null ? chislo(x.норма_3ч) : "—"} шт · в ${vremya(x.час)} работало ${x.людей} чел. · линия — двое суток, пунктир — норма`,
        k === "размещение" ? "#prUchastki" : "#prUchastki", ryad(k));
    };
    const dvorKart = dmd ? kartochka("Двор", zastyl ? "застыл" : DVOR[dmd.цвет] || "нет нормы",
      `${chislo(dmd.ждут_ворот)} машин <small>ждут ворот · ${chislo(dmd.паллет_в_очереди)} паллет</small>`,
      zastyl ? "цифры от застывших данных — не верить" : `дольше всех ${skolko(dmd.дольше_всех_мин || 0)} · на разгрузке ${dmd.на_разгрузке}`,
      "#dvor", null) : "";

    uzel.innerHTML = `<div class="stOtvet ${klass}">
        <p class="stOtvet__vopros">Стоит ли склад?</p>
        <p class="stOtvet__da">${esc(otvet)}</p>
        <p class="stOtvet__pochemu">${poyasnenie}</p>
      </div>
      <div class="stKarty">${dvorKart}${temKart("приёмка")}${temKart("размещение")}</div>
      ${temp && temp.дней_истории < 14 ? `<p class="stSnoska">норма ещё копится: истории ${temp.дней_истории} дн., нужно пять недель</p>` : ""}`;
    uzel.hidden = false;
  }

  start();
})();
