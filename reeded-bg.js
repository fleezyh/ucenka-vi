(() => {
  "use strict";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const field = document.createElement("div");
  field.className = "spotlightField";
  field.setAttribute("aria-hidden", "true");
  field.innerHTML = `
    <span class="spotlightFlow"></span>
    <span class="spotlight spotlight--left"></span>
    <span class="spotlight spotlight--center"></span>
    <span class="spotlight spotlight--right"></span>
    <span class="spotlightGlow"></span>
    <span class="spotlightGrain"></span>
  `;
  document.body.prepend(field);
  const flow = field.querySelector(".spotlightFlow");
  if (reduceMotion) return;

  let frame = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const render = () => {
    const time = performance.now() / 1000;
    currentX += (targetX - currentX) * 0.045;
    currentY += (targetY - currentY) * 0.045;
    field.style.setProperty("--pointer-x", currentX.toFixed(3));
    field.style.setProperty("--pointer-y", currentY.toFixed(3));
    const x = innerWidth * (0.5 + Math.sin(time * 0.58) * 0.72);
    const y = innerHeight * (0.02 + Math.sin(time * 0.31 + 1.4) * 0.09);
    flow.style.transform = `translate3d(${Math.round(x - innerWidth * 0.34)}px, ${Math.round(y)}px, 0) rotate(${(-9 + Math.sin(time * 0.37) * 13).toFixed(2)}deg)`;
    flow.style.opacity = (0.82 + Math.sin(time * 0.91) * 0.16).toFixed(3);
    frame = requestAnimationFrame(render);
  };

  addEventListener("pointermove", (event) => {
    targetX = event.clientX / Math.max(innerWidth, 1) - 0.5;
    targetY = event.clientY / Math.max(innerHeight, 1) - 0.5;
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame) {
      frame = requestAnimationFrame(render);
    }
  });

  frame = requestAnimationFrame(render);
})();
