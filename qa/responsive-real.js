(async () => {
  window.__panicResponsiveQA = undefined;
  const results = [];
  const audio = document.querySelector('#audio-player');
  const rows = [...document.querySelectorAll('.track')];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const measure = (kind, name) => {
    const card = document.querySelector('.album-card');
    const main = document.querySelector('.main-panel');
    results.push({width: innerWidth, kind, case: name,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      cardOverflow: card.scrollWidth > card.clientWidth,
      panelOverflow: main.scrollWidth > main.clientWidth});
  };
  audio.pause();
  location.hash = 'musica';
  await wait(60);
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].classList.contains('active')) rows[i].click();
    await wait(60);
    measure('track', window.PANIC_TRACKS[i].title);
  }
  rows[4].click();
  for (const view of ['inicio','informacion','musica','karaoke','videos','novedades']) {
    location.hash = view;
    await wait(60);
    measure('view', view);
  }
  location.hash = 'musica';
  window.__panicResponsiveQA = results;
})();
