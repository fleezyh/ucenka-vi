(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'reededCanvas';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '-2', opacity: '.86',
    filter: 'blur(.7px) saturate(108%)', transform: 'scale(1.01)'
  });
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d', { alpha: false });
  const palette = [
    [0.00, [181, 128, 34]], [0.14, [207, 76, 139]],
    [0.31, [54, 75, 205]], [0.49, [8, 12, 28]],
    [0.68, [29, 66, 206]], [0.85, [190, 73, 142]],
    [1.00, [174, 117, 28]]
  ];
  let width = 0, height = 0, quality = 1, lastFrame = 0, raf = 0;

  function colorAt(position, alpha = 1) {
    const p = Math.max(0, Math.min(1, position));
    let left = palette[0], right = palette[palette.length - 1];
    for (let i = 1; i < palette.length; i += 1) {
      if (p <= palette[i][0]) { left = palette[i - 1]; right = palette[i]; break; }
    }
    const k = (p - left[0]) / Math.max(.001, right[0] - left[0]);
    const rgb = left[1].map((v, i) => Math.round(v + (right[1][i] - v) * k));
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    quality = Math.min(devicePixelRatio || 1, 1.2) * (width < 600 ? .82 : .72);
    canvas.width = Math.max(1, Math.round(width * quality));
    canvas.height = Math.max(1, Math.round(height * quality));
    ctx.setTransform(quality, 0, 0, quality, 0, 0);
  }

  function ribbonPath(baseX, center, pulseWidth, time) {
    const lens = Math.exp(-Math.pow((baseX - center) / pulseWidth, 2) * 2.1);
    const breath = .5 + .5 * Math.sin(time * 1.08);
    const amplitude = lens * (34 + 64 * breath);
    const path = new Path2D();
    const step = Math.max(9, height / 84);
    for (let y = -step, first = true; y <= height + step; y += step) {
      const vertical = y / Math.max(1, height);
      const body = Math.pow(Math.max(0, Math.sin(Math.PI * Math.max(0, Math.min(1, vertical)))), .7);
      const curve = Math.sin(vertical * Math.PI * 1.65 + time * .68);
      const shoulder = Math.sin(vertical * Math.PI * 3.2 - time * .31) * .16;
      const x = baseX + amplitude * body * (curve + shoulder);
      if (first) { path.moveTo(x, y); first = false; } else { path.lineTo(x, y); }
    }
    return { path, lens, breath };
  }

  function draw(now) {
    const time = now / 1000;
    const spacing = width < 600 ? 19 : 25;
    const pulseWidth = Math.max(220, width * .27);
    const center = width * .5 + Math.sin(time * .37) * width * .39;

    const field = ctx.createLinearGradient(0, 0, width, 0);
    palette.forEach(([stop, rgb]) => field.addColorStop(stop, `rgb(${rgb.join(',')})`));
    ctx.fillStyle = '#030711';
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = .34;
    ctx.fillStyle = field;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    for (let x = -spacing * 5; x < width + spacing * 5; x += spacing) {
      const { path, lens, breath } = ribbonPath(x, center, pulseWidth, time);
      const normalized = (x + Math.sin(time * .22) * 38) / Math.max(1, width);

      ctx.strokeStyle = 'rgba(1,3,10,.94)';
      ctx.lineWidth = spacing * (.86 - lens * .12 * breath);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(path);

      ctx.strokeStyle = colorAt(normalized, .62 + lens * .18);
      ctx.lineWidth = spacing * (.42 + lens * .16 * breath);
      ctx.stroke(path);

      ctx.strokeStyle = `rgba(210,224,255,${.07 + lens * .11})`;
      ctx.lineWidth = Math.max(1.2, spacing * (.07 + lens * .035));
      ctx.stroke(path);
    }

    const glow = ctx.createRadialGradient(center, height * .48, 0, center, height * .48, pulseWidth * 1.08);
    glow.addColorStop(0, `rgba(116,139,255,${.15 + .08 * Math.sin(time * 1.08)})`);
    glow.addColorStop(.62, 'rgba(106,70,190,.065)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(width * .5, height * .42, height * .12, width * .5, height * .46, Math.max(width, height) * .72);
    vignette.addColorStop(0, 'rgba(2,5,13,0)');
    vignette.addColorStop(.68, 'rgba(2,5,13,.18)');
    vignette.addColorStop(1, 'rgba(2,5,13,.72)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  function frame(now) {
    if (now - lastFrame >= 32) { draw(now); lastFrame = now; }
    raf = requestAnimationFrame(frame);
  }

  resize();
  draw(0);
  if (!reduceMotion) raf = requestAnimationFrame(frame);
  addEventListener('resize', () => { resize(); draw(performance.now()); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (reduceMotion) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf) raf = requestAnimationFrame(frame);
  });
})();
