/* Снимок страницы в чат через бота «Направление по работе с браком».

   Снимает браузер человека — штатным захватом вкладки (Chrome спросит
   разрешение), без библиотек и без браузера на сервере. Сервер получает
   готовую картинку и только пересылает её в чат из списка. Перед отправкой —
   превью и выбор чата: случайно в группу ничего не уйдёт.

   Подключение: Snimok.podklyuchit(кнопка, { oblast: () => [элементы],
                                               podpis: () => "Воронка · сентябрь" }) */
(function () {
  const pauza = (ms) => new Promise((gotovo) => setTimeout(gotovo, ms));

  async function snyat(elementy) {
    // Сначала выводим нужное в начало экрана: снимается только видимое.
    elementy[0].scrollIntoView({ block: "start" });
    const potok = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser" }, audio: false,
      preferCurrentTab: true, selfBrowserSurface: "include",
    });
    try {
      const video = document.createElement("video");
      video.srcObject = potok;
      video.muted = true;
      await video.play();
      // Дать окну выбора вкладки закрыться, иначе оно попадёт в кадр.
      await pauza(600);
      const masshtab = video.videoWidth / window.innerWidth;
      const ramki = elementy.map((el) => el.getBoundingClientRect());
      const verh = Math.max(0, Math.min(...ramki.map((r) => r.top)) - 12);
      const niz = Math.min(window.innerHeight, Math.max(...ramki.map((r) => r.bottom)) + 12);
      const levo = Math.max(0, Math.min(...ramki.map((r) => r.left)) - 12);
      const pravo = Math.min(window.innerWidth, Math.max(...ramki.map((r) => r.right)) + 12);
      const holst = document.createElement("canvas");
      holst.width = Math.round((pravo - levo) * masshtab);
      holst.height = Math.round((niz - verh) * masshtab);
      holst.getContext("2d").drawImage(video,
        levo * masshtab, verh * masshtab, holst.width, holst.height,
        0, 0, holst.width, holst.height);
      return holst.toDataURL("image/png");
    } finally {
      potok.getTracks().forEach((dorozhka) => dorozhka.stop());
    }
  }

  function okno(png, chaty, podpis) {
    return new Promise((reshenie) => {
      const fon = document.createElement("div");
      fon.className = "snimok";
      fon.innerHTML = `
        <div class="snimok__okno" role="dialog" aria-modal="true">
          <p class="snimok__zag">Отправить в чат</p>
          <img class="snimok__kartinka" alt="Снимок">
          <label class="snimok__pole"><span>Куда</span><select></select></label>
          <label class="snimok__pole"><span>Подпись</span><input type="text" maxlength="200"></label>
          <div class="snimok__knopki">
            <button class="action action--secondary" type="button" data-otmena>Отмена</button>
            <button class="action" type="button" data-otpravit>Отправить</button>
          </div>
          <p class="snimok__otvet"></p>
        </div>`;
      fon.querySelector("img").src = png;
      const vybor = fon.querySelector("select");
      chaty.forEach((imya, nomer) => vybor.add(new Option(imya, nomer)));
      fon.querySelector("input").value = podpis;
      const zakryt = (itog) => { fon.remove(); reshenie(itog); };
      fon.querySelector("[data-otmena]").addEventListener("click", () => zakryt(null));
      fon.addEventListener("click", (event) => { if (event.target === fon) zakryt(null); });
      fon.querySelector("[data-otpravit]").addEventListener("click", async (event) => {
        const knopka = event.currentTarget;
        const otvet = fon.querySelector(".snimok__otvet");
        knopka.disabled = true;
        otvet.textContent = "Отправляю…";
        try {
          const zapros = await fetch("/__bot/kartinka", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ png, "чат": Number(vybor.value),
                                   "подпись": fon.querySelector("input").value.trim() }),
          });
          const dannye = await zapros.json().catch(() => ({}));
          if (!zapros.ok) throw new Error(dannye.error || "бот не отправил");
          otvet.textContent = `Ушло в «${dannye["чат"]}»`;
          setTimeout(() => zakryt(dannye), 900);
        } catch (error) {
          otvet.textContent = "Не ушло: " + error.message;
          knopka.disabled = false;
        }
      });
      document.body.append(fon);
    });
  }

  async function podklyuchit(knopka, { oblast, podpis }) {
    if (!knopka || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return;
    let chaty = [];
    try {
      const otvet = await fetch("/__bot/chaty", { credentials: "same-origin", cache: "no-store" });
      if (otvet.ok) chaty = await otvet.json();
    } catch (error) {
      return;
    }
    // Бот ещё никуда не добавлен или нет прав — кнопки просто нет.
    if (!chaty.length) return;
    knopka.hidden = false;
    knopka.addEventListener("click", async () => {
      let png;
      try {
        png = await snyat(oblast());
      } catch (error) {
        return; // человек отменил выбор вкладки
      }
      await okno(png, chaty, podpis ? podpis() : "");
    });
  }

  window.Snimok = { podklyuchit };
})();
