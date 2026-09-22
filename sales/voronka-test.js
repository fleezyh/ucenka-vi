/* Черновик новой раскладки воронки продаж.
   Данные те же, что у боевой страницы (data/funnel.json). Отличие одно и
   оно осознанное: цель с отставанием считается здесь заново — как план
   месяца плюс то, что недособрал прошлый месяц. */
(() => {
  const $ = (id) => document.getElementById(id);
  const FUNNEL_URL = "../data/funnel.json";

  const message = $("message");
  const monthSelect = $("month");
  const root = $("vt");
  let data = null;
  /* Править план может только admin/chief — как на боевой воронке.
     До ответа /__me метка плана остаётся некликабельной. */
  let mozhnoPravit = false;

  const IKONKI = {
    korobka: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
    mishen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
    stolbiki: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 20V11"/><path d="M12 20V4"/><path d="M18 20v-6"/></svg>',
    rost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5h-5"/></svg>',
    summa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 5H6l6 7-6 7h12"/></svg>',
    chasy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  };

  /* В json суммы лежат готовыми строками вида «5.62 млн»: сырых чисел по
     факту нет, поэтому разбираем строку. Пробелы бывают неразрывными. */
  const mln = (text) => {
    const clean = String(text ?? "").replace(/ /g, " ").replace(/\s/g, "").replace(",", ".");
    const value = parseFloat(clean);
    return Number.isFinite(value) ? value : 0;
  };
  const dec = (value, digits = 2) => value.toFixed(digits).replace(".", ",");
  const num = (value) => Number(value || 0).toLocaleString("ru-RU");
  const okupClass = (cls) => ({ "ok-grn": "vtOkup--good", "ok-amb": "vtOkup--warn", "ok-red": "vtOkup--bad" }[cls] || "");

  const plitka = ({ mod, znak, teg, val, unit, pod }) => `
    <article class="vtPlitka ${mod || ""}">
      <span class="vtPlitka__znak">${znak}</span>
      <span class="vtPlitka__teg">${teg}</span>
      <span class="vtPlitka__val">${val}${unit ? `<small>${unit}</small>` : ""}</span>
      <span class="vtPlitka__pod">${(pod || []).map((line) => `<span>${line}</span>`).join("")}</span>
    </article>`;

  const renderPlitki = (v) => {
    /* Подпись у всех плиток ровно двухстрочная: иначе карточки в ряду
       тянутся по самой высокой и под короткими висит пустота. */
    const planPod = !v.plan ? ["План на месяц", "не задан"]
      : v.ship >= v.plan
        ? [`Выполнен на <b>${Math.round((v.ship / v.plan) * 100)}%</b>`, `сверху <b>${dec(v.ship - v.plan)} млн ₽</b>`]
        : [`Выполнено <b>${Math.round((v.ship / v.plan) * 100)}%</b>`, `осталось <b>${dec(v.plan - v.ship)} млн ₽</b>`];
    const potPod = v.pot >= v.goal
      ? ["Если закрыть все сделки —", "цель с отставанием <b>закрывается</b>"]
      : ["Если закрыть все сделки —", `до цели не хватает <b>${dec(v.goal - v.pot)} млн ₽</b>`];

    $("vtPlitki").innerHTML = [
      plitka({ mod: "vtPlitka--ship", znak: IKONKI.korobka, teg: "Отгружено", val: dec(v.ship), unit: "млн ₽",
        pod: [`<b>${num(v.shipPallets)}</b> паллет`, `окупаемость <b>${v.shipOkup}</b>`] }),
      plitka({ znak: IKONKI.mishen, teg: "В работе", val: dec(v.work), unit: "млн ₽",
        pod: [`<b>${num(v.workPallets)}</b> паллет`,
              `<b>${v.workStages}</b> ${v.workStages === 1 ? "этап" : "этапа"} до отгрузки`] }),
      plitka({ mod: "vtPlitka--plan", znak: IKONKI.stolbiki, teg: "План месяца", val: dec(v.plan), unit: "млн ₽", pod: planPod }),
      plitka({ mod: "vtPlitka--pot", znak: IKONKI.rost, teg: "Потенциал", val: dec(v.pot), unit: "млн ₽", pod: potPod }),
    ].join("");
  };

  const renderBar = (v) => {
    /* Шкала берётся по самому дальнему ориентиру, иначе метка цели уедет
       за полосу. Запас 6% — чтобы подпись у правого края не обрезалась. */
    const scale = Math.max(v.pot, v.plan, v.goal) * 1.06 || 1;
    const pct = (value) => (value / scale) * 100;
    /* План и цель с отставанием стоят почти вплотную, когда долг мал:
       тогда подписи расходятся в разные стороны от своих линий. */
    const tesno = v.plan && v.goal && Math.abs(pct(v.goal) - pct(v.plan)) < 16;
    const metka = (mod, title, value, pravka) => value ? `
      <div class="vtMetka ${mod}" style="left:${pct(value)}%">
        <button type="button" class="vtMetka__podpis"${pravka ? ' data-plan="1"' : " disabled"}>
          <span class="vtMetka__t">${title}</span>
          <span class="vtMetka__v">${dec(value)} млн ₽</span>
          ${pravka ? '<span class="vtMetka__pravka">изменить план</span>' : ""}
        </button>
        <span class="vtMetka__tochka"></span><span class="vtMetka__liniya"></span>
      </div>` : "";

    $("vtBar").innerHTML = `
      ${metka(tesno ? "vtMetka--vlevo" : "", "План месяца", v.plan, mozhnoPravit)}
      ${metka(`vtMetka--goal ${tesno ? "vtMetka--vpravo" : ""}`, "Цель с отставанием", v.goal)}
      <div class="vtBar__zhelob">
        <div class="vtBar__seg vtBar__seg--ship" style="width:${pct(v.ship)}%">${dec(v.ship)}</div>
        <div class="vtBar__seg vtBar__seg--work" style="width:${pct(v.work)}%">${v.work ? dec(v.work) : ""}</div>
      </div>
      <div class="vtBar__podpis">
        <span style="width:${pct(v.ship)}%">Отгружено</span>
        <span style="width:${pct(v.work)}%">В работе</span>
      </div>`;

    const dolg = v.dolg > 0
      ? `Цель с отставанием: план <b>${dec(v.plan)}</b> + долг за ${v.prevName.toLowerCase()} <b>${dec(v.dolg)} млн ₽</b>`
      : `Прошлый месяц закрыт, отставания нет: цель равна плану — <b>${dec(v.goal)} млн ₽</b>`;

    $("vtItogi").innerHTML = `
      <div class="vtItog"><span class="vtItog__znak">${IKONKI.rost}</span>
        Потенциал при закрытии всех сделок: <b>${dec(v.pot)} млн ₽</b></div>
      <div class="vtItog vtItog--net"><span class="vtItog__znak">${IKONKI.mishen}</span>${dolg}</div>`;
  };

  const renderTable = (list) => {
    /* В json ступени идут сверху вниз от отгрузки; в раскладке путь сделки
       читается снизу вверх, поэтому разворачиваем. */
    const rows = [...list].reverse();
    const max = Math.max(...rows.map((r) => mln(r.sale_txt)), 0.001);
    $("vtTable").innerHTML = `
      <table>
        <thead><tr>
          <th></th><th>Этап</th><th></th>
          <th>Лоты</th><th>Паллеты</th><th>Себест., млн ₽</th><th>Окупаемость</th>
        </tr></thead>
        <tbody>${rows.map((r, i) => {
          const sale = mln(r.sale_txt);
          const ship = Number(r.stage_ord) === 1;
          return `<tr class="${ship ? "is-ship" : ""}">
            <td><span class="vtNum">${i + 1}</span></td>
            <td>${r.stage}</td>
            <td><span class="vtPoloska"><i style="width:${Math.max((sale / max) * 100, 2)}%"></i><b>${dec(sale)}</b></span></td>
            <td>${num(r.lots)}</td>
            <td>${num(r.pallets_txt)}</td>
            <td>${dec(mln(r.cost_txt))}</td>
            <td class="${okupClass(r.okup_cls)}">${r.okup_txt || "—"}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
  };

  const renderKvartal = (head) => {
    const kv = Math.floor((Number(head.month_num) - 1) / 3);
    const rims = ["I", "II", "III", "IV"][kv];
    let fact = 0, potential = 0, budget = 0;
    for (const list of Object.values(data.поМесяцам || {})) {
      const first = list[0];
      if (!first || Math.floor((Number(first.month_num) - 1) / 3) !== kv) continue;
      if (Number(first.month_num) > Number(head.month_num)) continue;
      fact += mln(first.sale_txt);
      potential += mln(first.total_sale_txt);
      budget += Number(first.plan_sale_raw || 0) / 1e6;
    }
    const kart = (znak, teg, val) => `
      <article class="vtKv"><span class="vtKv__znak">${znak}</span>
        <span class="vtKv__teg">${teg}</span>
        <span class="vtKv__val">${dec(val)}<small>млн ₽</small></span>
      </article>`;
    $("vtKvartal").innerHTML =
      kart(IKONKI.stolbiki, `${rims} квартал — факт`, fact) +
      kart(IKONKI.summa, "С учётом всех сделок в работе", potential) +
      kart(IKONKI.chasy, "Бюджет квартала", budget);
  };

  /* Отставание — хвост прошлого месяца: сколько он недодал к своему плану.
     Перевыполнение в минус не уходит, цель не должна опускаться ниже плана. */
  const otstavanie = (head) => {
    const prevNum = Number(head.month_num) - 1;
    for (const [name, list] of Object.entries(data.поМесяцам || {})) {
      const first = list[0];
      if (!first || Number(first.month_num) !== prevNum) continue;
      const plan = Number(first.plan_sale_raw || 0) / 1e6;
      const fact = mln(first.sale_txt);
      return { prevName: name, dolg: Math.max(plan - fact, 0) };
    }
    return { prevName: "", dolg: 0 };
  };

  const render = (month) => {
    const list = data.поМесяцам?.[month] || data.ступени || [];
    if (!list.length) return;
    const head = list[0];
    const shipRow = list.find((r) => Number(r.stage_ord) === 1) || head;
    const workRows = list.filter((r) => Number(r.stage_ord) !== 1);
    const { prevName, dolg } = otstavanie(head);
    const plan = Number(head.plan_sale_raw || 0) / 1e6;

    const v = {
      ship: mln(shipRow.sale_txt),
      shipPallets: shipRow.pallets_txt,
      shipOkup: shipRow.okup_txt,
      work: workRows.reduce((sum, r) => sum + mln(r.sale_txt), 0),
      workPallets: workRows.reduce((sum, r) => sum + Number(r.pallets_txt || 0), 0),
      workStages: workRows.length,
      pot: mln(head.total_sale_txt),
      plan, prevName, dolg, goal: plan + dolg,
    };

    $("vtMesyac").textContent = `${month} ${String(head.month_key || "").slice(0, 4)}`;
    renderPlitki(v);
    renderBar(v);
    renderTable(list);
    renderKvartal(head);
    root.hidden = false;
    message.hidden = true;
  };

  monthSelect.addEventListener("change", () => render(monthSelect.value));

  /* Цель вписывается прямо на графике: клик по метке плана разворачивает
     три поля той же ручки /__funnel/plan, что и у боевой воронки. */
  const planDialog = $("vtPlan");
  const planPole = { sale: $("vtPlanSale"), cost: $("vtPlanCost"), pallets: $("vtPlanPallets") };
  const planStatus = (text, error = false) => {
    $("vtPlanStatus").textContent = text;
    $("vtPlanStatus").classList.toggle("is-error", error);
  };

  document.addEventListener("click", (event) => {
    const knopka = event.target.closest('.vtMetka__podpis[data-plan]');
    if (!knopka) return;
    const head = (data.поМесяцам?.[monthSelect.value] || data.ступени || [])[0];
    if (!head) return;
    planDialog.dataset.monthKey = head.month_key;
    $("vtPlanMesyac").textContent = `${monthSelect.value} ${String(head.month_key).slice(0, 4)}`;
    planPole.sale.value = Math.round(Number(head.plan_sale_raw || 0));
    planPole.cost.value = Math.round(Number(head.plan_cost_raw || 0));
    planPole.pallets.value = Math.round(Number(head.plan_pal_raw || 0));
    planStatus("");
    planDialog.showModal();
    planPole.sale.select();
  });

  $("vtPlanCancel")?.addEventListener("click", () => planDialog.close());
  $("vtPlanForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(planPole).map(([key, field]) =>
      [key, Number(String(field.value).trim().replace(/\s/g, "").replace(",", "."))]));
    if (Object.values(values).some((value) => !Number.isFinite(value) || value <= 0) ||
        !Number.isSafeInteger(values.pallets)) {
      planStatus("Нужны положительные суммы и целое число паллет.", true);
      return;
    }
    const monthKey = planDialog.dataset.monthKey;
    const chosen = monthSelect.value;
    planStatus("Сохраняю цель и пересчитываю график…");
    try {
      const response = await fetch("/__funnel/plan", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month_num: Number(monthKey.slice(5)), month_key: monthKey, ...values }),
      });
      const latest = await response.json();
      if (!response.ok) throw new Error(latest.error || "сервер не сохранил цель");
      if (!latest.поМесяцам) throw new Error("нет подтверждения пересчёта графика");
      data = latest;
      if ([...monthSelect.options].some((option) => option.value === chosen)) monthSelect.value = chosen;
      render(monthSelect.value);
      planDialog.close();
    } catch (error) {
      planStatus(`Не удалось сохранить: ${error.message}`, true);
    }
  });

  fetch("/__me", { credentials: "same-origin", cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((user) => {
      mozhnoPravit = ["admin", "chief"].includes(user?.role || user?.роль);
      if (data && mozhnoPravit) render(monthSelect.value);
    })
    .catch(() => {});

  fetch(FUNNEL_URL, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error(response.status)))
    .then((json) => {
      data = json;
      const months = data.месяцы?.length ? [...data.месяцы].reverse() : [data.месяц];
      monthSelect.innerHTML = months.map((m) => `<option${m === data.месяц ? " selected" : ""}>${m}</option>`).join("");
      $("stamp").textContent = `обновлено ${data.обновлено || ""}`;
      render(data.месяц);
    })
    .catch((error) => { message.textContent = `Не получилось загрузить воронку: ${error.message}`; });
})();
