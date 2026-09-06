(() => {
  if (matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let frame = 0;
    addEventListener('pointermove', (event) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const x = Math.max(14, Math.min(86, event.clientX / innerWidth * 100));
        const y = Math.max(-16, Math.min(20, event.clientY / innerHeight * 12 - 6));
        document.body.style.setProperty('--spot-x', `${x.toFixed(1)}%`);
        document.body.style.setProperty('--spot-y', `${y.toFixed(1)}px`);
        frame = 0;
      });
    }, { passive: true });
  }
})();
