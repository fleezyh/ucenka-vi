(() => {
  const cards = document.querySelectorAll('.card, .decision-card');
  cards.forEach((card) => {
    const head = card.querySelector(':scope > .card-head');
    if (!head || head.querySelector('.chart-expand')) return;
    const button = document.createElement('button');
    button.className = 'chart-expand';
    button.type = 'button';
    button.title = 'Развернуть график';
    button.setAttribute('aria-label', 'Развернуть график');
    button.setAttribute('aria-pressed', 'false');
    button.textContent = '↗';
    button.addEventListener('click', () => {
      const open = card.classList.toggle('is-expanded');
      document.body.classList.toggle('has-expanded-chart', open);
      button.setAttribute('aria-pressed', String(open));
      button.setAttribute('aria-label', open ? 'Свернуть график' : 'Развернуть график');
      button.title = open ? 'Свернуть график' : 'Развернуть график';
      button.textContent = open ? '×' : '↗';
      window.dispatchEvent(new Event('resize'));
    });
    head.appendChild(button);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const card = document.querySelector('.is-expanded');
    if (!card) return;
    card.querySelector('.chart-expand')?.click();
  });
})();
