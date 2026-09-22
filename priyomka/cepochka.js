/* Цепочка входа одной строкой — «супер-карта»: взглянул и видно, в каком
   звене горит. Двор → ворота → буферы приёмки → висяки → хранение.

   Своих данных у неё нет: собирает то, что уже считают задачи ucenka-dvor
   (раз в 10 минут) и ucenka-priyomka (пять раз в день). Под каждым звеном две
   цифры — сколько стоит и сколько времени, — и цвет. */
(() => {
  const box = document.getElementById("cepochka");
  if (!box) return;

  const num = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
  const chmm = (minut) => {
    const m = Math.max(0, Math.round(Number(minut) || 0));
    return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${String(m % 60).padStart(2, "0")} мин`;
  };
  const dolya = (a, b) => b ? Math.round(a / b * 100) : 0;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const zveno = ({ imya, glavnoe, pod, cvet, yakor, vremya }) => `
    <a class="cepZveno cep--${cvet}" href="#${yakor}">
      <span class="cepZveno__imya">${esc(imya)}</span>
      <b class="cepZveno__glavnoe">${glavnoe}</b>
      <span class="cepZveno__pod">${pod}</span>
      <span class="cepZveno__vremya">${vremya}</span>
    </a>`;

  function sobrat(dvor, priyomka) {
    const dmd = (dvor?.склады || []).find((s) => s.склад === "ДМД");
    const porogiDvor = dvor?.пороги_мин || { тревога: 120, пробка: 240 };
    const vozrast = priyomka?.возраст?.итого || {};
    const visyaki = priyomka?.висяки || {};
    const sektory = priyomka?.секторы || [];
    const porogi = priyomka?.пороги || { недогруз: 80, норма: 90, тревога: 92 };

    const cvetMinut = (m) => m >= porogiDvor.пробка ? "krasnyy" : m >= porogiDvor.тревога ? "zhyoltyy" : "zelyonyy";
    const zvenya = [];

    if (dmd) {
      zvenya.push(zveno({
        imya: "Двор", yakor: "dvor", cvet: dmd.ждут_ворот ? cvetMinut(dmd.дольше_всех_мин) : "zelyonyy",
        glavnoe: `${num(dmd.ждут_ворот)} машин`,
        pod: `ждут ворот · ${num(dmd.паллет_в_очереди)} паллет`,
        vremya: dmd.ждут_ворот ? `дольше всех ${chmm(dmd.дольше_всех_мин)}` : "очереди нет",
      }));
      // Среднее ожидание строже, чем худшая машина: час в среднем — уже
      // тормозит, два — ворота не справляются.
      const cvetSrednee = (m) => m > 120 ? "krasnyy" : m > 60 ? "zhyoltyy" : "zelyonyy";
      zvenya.push(zveno({
        imya: "Ворота и разгрузка", yakor: "dvor", cvet: cvetSrednee(dmd.среднее_ожидание_мин),
        glavnoe: `${num(dmd.на_разгрузке)} на воротах`,
        pod: `разгружено ${num(dmd.разгружено)} машин · ${num(dmd.паллет_разгружено)} паллет`,
        vremya: `ожидание ворот ${chmm(dmd.среднее_ожидание_мин)} · разгрузка ${chmm(dmd.средняя_разгрузка_мин)}`,
      }));
    }

    const vsegoVhod = Object.values(vozrast).reduce((s, v) => s + (Number(v) || 0), 0);
    const starshe48 = Number(vozrast["3. больше 48 ч"]) || 0;
    const izvestno = vsegoVhod - (Number(vozrast["4. движения не найдено"]) || 0);
    const d48 = dolya(starshe48, izvestno);
    if (vsegoVhod) {
      zvenya.push(zveno({
        imya: "Буферы приёмки", yakor: "prKarta", cvet: d48 > 50 ? "krasnyy" : d48 > 25 ? "zhyoltyy" : "zelyonyy",
        glavnoe: `${num(vsegoVhod)} шт`,
        pod: `лежат в зонах входа`,
        vremya: `${d48}% дольше SLA 48 ч`,
      }));
    }

    const vsegoVis = Object.values(visyaki.итого || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    if (vsegoVis) {
      const dStaroe = dolya(visyaki.старое_штук, vsegoVis);
      zvenya.push(zveno({
        imya: "Висяки", yakor: "prVisyaki", cvet: dStaroe > 50 ? "krasnyy" : dStaroe > 25 ? "zhyoltyy" : "zelyonyy",
        glavnoe: `${num(visyaki.старое_штук)} шт`,
        pod: `старше недели · ${dStaroe}% входа`,
        vremya: `самое старое ${num(visyaki.максимум_дней)} дн`,
      }));
    }

    const mest = sektory.reduce((s, x) => s + (x.мест_хранения || 0), 0);
    const zanyato = sektory.reduce((s, x) => s + (x.занято_хранения || 0), 0);
    if (mest) {
      const p = zanyato / mest * 100;
      const cvet = p > porogi.тревога ? "krasnyy" : p > porogi.норма ? "zhyoltyy" : p >= porogi.недогруз ? "zelyonyy" : "nedogruz";
      const krasnyh = sektory.filter((s) => s.цвет === "красный").length;
      zvenya.push(zveno({
        imya: "Хранение", yakor: "prPanel", cvet,
        glavnoe: `${p.toFixed(1).replace(".", ",")}%`,
        pod: `мест занято · ${num(zanyato)} из ${num(mest)}`,
        vremya: krasnyh ? `красных секторов ${krasnyh}` : "красных секторов нет",
      }));
    }
    return zvenya;
  }

  function zagruzit() {
    const vzyat = (url) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([vzyat("../data/dvor.json"), vzyat("../data/priyomka.json")]).then(([dvor, priyomka]) => {
      const zvenya = sobrat(dvor, priyomka);
      if (!zvenya.length) { box.hidden = true; return; }
      box.hidden = false;
      box.querySelector(".cepRyad").innerHTML = zvenya.join('<span class="cepStrelka" aria-hidden="true">→</span>');
      box.querySelector(".cepStamp").textContent =
        `двор: ${dvor?.обновлено || "—"} · зоны и висяки: ${priyomka?.обновлено || "—"}`;
    });
  }

  zagruzit();
  setInterval(zagruzit, 5 * 60 * 1000);
})();
