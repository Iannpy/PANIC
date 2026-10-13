(async () => {
  const results = [];
  const check = (name, condition) => {
    results.push({ name, passed: Boolean(condition) });
    if (!condition) throw new Error(`FAIL: ${name}`);
  };
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const $ = (selector) => document.querySelector(selector);
  const rows = [...document.querySelectorAll('.track')];
  const seek = $('#seek');
  const playing = () => $('#play-toggle').getAttribute('aria-pressed') === 'true';
  const seekTo = value => { seek.value = value; seek.dispatchEvent(new Event('input', { bubbles: true })); };
  const activeIndex = () => rows.findIndex(row => row.classList.contains('active'));

  check('Ten demo tracks and default track 005', rows.length === 10 && activeIndex() === 4);
  check('No real audio or video elements', document.querySelectorAll('audio,video,iframe').length === 0);
  check('Paused initially', !playing() && $('#elapsed').textContent === '0:00');
  $('#play-toggle').click();
  await wait(1350);
  check('Playback simulation advances', playing() && Number(seek.value) >= 1);
  $('#play-toggle').click();
  const paused = seek.value;
  await wait(600);
  check('Pause freezes progress', !playing() && seek.value === paused);
  seekTo(45);
  check('Seeking updates elapsed and accessibility text', $('#elapsed').textContent === '0:45' && seek.getAttribute('aria-valuetext') === '0:45 de 3:51');
  $('#next').click();
  check('Next selects track and resets progress', activeIndex() === 5 && Number(seek.value) === 0 && !playing());
  $('#previous').click();
  check('Previous selects preceding track', activeIndex() === 4);
  rows[0].click();
  check('Click selects a new track without autoplay', activeIndex() === 0 && !playing());
  rows[0].click();
  check('Click selected track toggles playback', playing());
  seekTo(Number(seek.max) - 1);
  await wait(1350);
  check('End of track advances automatically', activeIndex() === 1 && playing());
  rows[9].click();
  seekTo(Number(seek.max) - 1);
  await wait(1350);
  check('End of album stops without looping', activeIndex() === 9 && !playing() && Number(seek.value) === Number(seek.max));
  $('#play-toggle').click();
  check('Replay restarts completed track', playing() && Number(seek.value) === 0);
  $('#play-toggle').click();
  rows[0].click();
  $('#previous').click();
  check('Manual previous wraps first to last', activeIndex() === 9);
  $('#next').click();
  check('Manual next wraps last to first', activeIndex() === 0);

  for (const view of ['inicio', 'informacion', 'musica', 'videos', 'novedades']) {
    $(`[data-view="${view}"]`).click();
    await wait(80);
    check(`Navigation: ${view}`, !$(`#view-${view}`).hidden && document.querySelectorAll('.view:not([hidden])').length === 1 && $(`[data-view="${view}"]`).getAttribute('aria-current') === 'page');
  }
  window.location.hash = 'unknown';
  await wait(80);
  check('Unknown hash safely displays music', !$('#view-musica').hidden);
  window.location.hash = 'videos';
  await wait(80);
  $('#video-preview').click();
  check('Video preview opens honest demo explanation', $('#demo-dialog').open && $('#dialog-copy').textContent.includes('No hay un video real'));
  $('#dialog-confirm').click();
  check('Dialog confirmation closes modal', !$('#demo-dialog').open);
  $('#help-button').click();
  check('Help dialog opens', $('#demo-dialog').open);
  $('#dialog-close').click();
  check('Close button closes modal', !$('#demo-dialog').open);

  for (const src of ['assets/optimized/canyon.webp', 'assets/optimized/silk.webp', 'assets/favicon.svg']) {
    const image = new Image();
    image.src = src;
    await image.decode();
    check(`Local image loads: ${src}`, image.naturalWidth > 0);
  }
  window.location.hash = 'musica';
  await wait(80);
  rows[4].click();
  check('No horizontal overflow', document.documentElement.scrollWidth <= innerWidth);
  return JSON.stringify({ passed: results.length, checks: results, url: location.href });
})().then(report => {
  window.__panicQA = JSON.parse(report);
}).catch(error => {
  window.__panicQA = { error: error.message };
  console.error(error);
});
