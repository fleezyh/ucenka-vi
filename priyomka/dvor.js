/* Двор приёмки: машины от КПП до конца разгрузки.
   Данные — data/dvor.json, задача ucenka-dvor на сервере раз в 10 минут.
   Источник — «Отчёт по поставкам» WMS (reg_delivery_registration), встреча
   с оператором двора 22.09.2026. Персональных данных на странице нет. */
(() => {
  const $ = (id) => document.getElementById(id);
  const root = $("dvor");
  if (!root) return;

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const num = (value) => Number(value || 0).toLocaleString("ru-RU");
  const chmm = (minut) => {
    const m = Math.max(0, Math.round(Number(minut) || 0));
    return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`;
  };
  const KLASS = { "красный": "dv--krasnyy", "жёлтый": "dv--zhyoltyy", "зелёный": "dv--zelyonyy", "синий": "dv--siniy" };

  let dannye = null;
  let sklad = "ДМД";

  const plitka = (zag, znach, pod, klass = "") => `
    <article class="prPlitka ${klass}">
      <p class="prPlitka__zag">${escape(zag)}</p>
      <p class="prPlitka__znak">${znach}</p>
      <p class="prPlitka__pod">${pod}</p>
    </article>`;

  /** Этапы одной полосой: сколько машин на каждом шаге прямо сейчас. */
  function polosa(s) {
    const chasti = [
      { imya: "ждут ворот", n: s.ждут_ворот, klass: "dvEtap--zhdut" },
      { imya: "на разгрузке", n: s.на_разгрузке, klass: "dvEtap--razgruzka" },
      { imya: "разгружено", n: s.разгружено, klass: "dvEtap--gotovo" },
    ];
    const vsego = chasti.reduce((sum, c) => sum + c.n, 0) || 1;
    return `<div class="dvEtapy">
      ${chasti.map((c) => c.n ? `<div class="dvEtap ${c.klass}" style="flex:${c.n / vsego}"
        title="${escape(c.imya)}: ${num(c.n)}"><b>${num(c.n)}</b><span>${escape(c.imya)}</span></div>` : "").join("")}
    </div>`;
  }

  /** Поток по часам: приехало против вставших на ворота. Если первые
      выше вторых — очередь в этот час росла. */
  function potok(s) {
    const chasy = s.поток.filter((h) => h.приехало || h.на_ворота || h.разгружено);
    if (!chasy.length) return '<p class="prHint">Сегодня машин ещё не было.</p>';
    const max = Math.max(...chasy.map((h) => Math.max(h.приехало, h.на_ворота)), 1);
    return `<div class="dvChasy">
      ${chasy.map((h) => {
        const rost = h.приехало - h.на_ворота;
        return `<div class="dvChas" title="${h.час}:00 — приехало ${h.приехало}, на ворота ${h.на_ворота}, разгружено ${h.разгружено}">
          <div class="dvChas__stolbiki">
            <i class="dvChas__priehalo" style="height:${h.приехало / max * 100}%"></i>
            <i class="dvChas__vorota" style="height:${h.на_ворота / max * 100}%"></i>
          </div>
          <span class="dvChas__rost ${rost > 0 ? "is-rost" : ""}">${rost > 0 ? "+" + rost : ""}</span>
          <span class="dvChas__chas">${h.час}</span>
        </div>`;
      }).join("")}
    </div>
    <p class="dvLegenda"><i class="dvChas__priehalo"></i>приехало <i class="dvChas__vorota"></i>встало на ворота
      <span>· «+N» над часом — на столько машин за час выросла очередь</span></p>`;
  }

  function ochered(s) {
    const mashiny = s.машины;
    if (!mashiny.length) return '<p class="prHint">На дворе никто не ждёт.</p>';
    return `<table class="dvTablica">
      <thead><tr><th></th><th>Приехал</th><th>Тип</th><th>Паллет</th><th>Ворота</th><th>Этап</th><th>На дворе</th></tr></thead>
      <tbody>${mashiny.map((m) => `<tr class="${KLASS[m.цвет] || ""}">
        <td><i class="dvTochka"></i></td>
        <td>${escape(String(m.приехал || "").slice(11, 16))}${String(m.приехал || "").slice(0, 10) !== (dannye.обновлено || "").slice(0, 10) ? ' <em>вчера</em>' : ""}</td>
        <td>${escape(m.тип)}</td>
        <td>${num(m.паллет)}</td>
        <td>${escape(m.ворота) || "—"}</td>
        <td>${escape(m.этап)}${m.разгрузка_мин != null ? ` · ${chmm(m.разгрузка_мин)}` : ""}</td>
        <td><b>${chmm(m.на_дворе_мин)}</b></td>
      </tr>`).join("")}</tbody>
    </table>`;
  }

  function narisovat() {
    const s = (dannye.склады || []).find((x) => x.склад === sklad) || (dannye.склады || [])[0];
    if (!s) { root.innerHTML = '<p class="prHint">Данных по двору пока нет.</p>'; return; }
    const porogi = dannye.пороги_мин || {};
    $("dvorStamp").textContent = `обновлено ${dannye.обновлено} · последняя регистрация ${String(s.последняя_регистрация || "").slice(11, 16) || "—"}`;

    $("dvorPlitki").innerHTML = [
      plitka("Приехало сегодня", num(s.регистраций), `${num(s.паллет_всего)} паллет заявлено`),
      plitka("Ждут ворот", num(s.ждут_ворот), `${num(s.паллет_в_очереди)} паллет · дольше 4 ч: ${num(s.старше_4_часов)}`,
        KLASS[s.цвет] ? `pr--${s.цвет === "красный" ? "krasnyy" : s.цвет === "жёлтый" ? "zhyoltyy" : "zelyonyy"}` : ""),
      plitka("На разгрузке", num(s.на_разгрузке), "стоят на воротах сейчас"),
      plitka("Разгружено", num(s.разгружено), `${num(s.паллет_разгружено)} паллет`),
      plitka("Ожидание ворот", chmm(s.среднее_ожидание_мин),
        `в среднем · разгрузка ${chmm(s.средняя_разгрузка_мин)} · дольше всех ${chmm(s.дольше_всех_мин)}`),
    ].join("");
    $("dvorEtapy").innerHTML = polosa(s);
    $("dvorPotok").innerHTML = potok(s);
    $("dvorOchered").innerHTML = ochered(s);
    $("dvorPravilo").textContent =
      `Цвет по времени на дворе: до ${porogi.тревога / 60 || 2} ч — норма, до ${porogi.пробка / 60 || 4} ч — тормозит, дольше — пробка.`;
    for (const knopka of document.querySelectorAll("#dvorSklady button")) {
      knopka.classList.toggle("is-on", knopka.dataset.sklad === s.склад);
    }
  }

  function zagruzit() {
    fetch("../data/dvor.json", { cache: "no-store" })
      .then((otvet) => otvet.ok ? otvet.json() : Promise.reject(new Error(otvet.status)))
      .then((json) => {
        dannye = json;
        $("dvorSklady").innerHTML = (json.склады || []).map((s) =>
          `<button type="button" class="prFiltr" data-sklad="${escape(s.склад)}">${escape(s.склад)}</button>`).join("");
        root.hidden = false;
        narisovat();
      })
      .catch(() => { root.hidden = true; });
  }

  document.addEventListener("click", (event) => {
    const knopka = event.target.closest("#dvorSklady button");
    if (!knopka || !dannye) return;
    sklad = knopka.dataset.sklad;
    narisovat();
  });

  zagruzit();
  // Двор меняется за минуты: страницу, оставленную открытой, обновляем сами.
  setInterval(zagruzit, 5 * 60 * 1000);
})();
