(async () => {
  const results = [];
  const audio = document.querySelector('#audio-player');
  const rows = [...document.querySelectorAll('.track')];
  const tracks = window.PANIC_TRACKS;
  const expectedDurations = tracks.map(track => track.duration);
  const $ = selector => document.querySelector(selector);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (condition, label, timeout = 6000) => {
    const start = performance.now();
    while (!condition()) {
      if (performance.now() - start > timeout) throw new Error(`Timeout: ${label}`);
      await wait(30);
    }
  };
  const check = (name, condition) => {
    results.push({ name, passed: Boolean(condition) });
    if (!condition) throw new Error(`FAIL: ${name}`);
  };
  const activeIndex = () => rows.findIndex(row => row.classList.contains('active'));
  const pressPlay = () => $('#play-toggle').click();
  const isPlaying = () => !audio.paused && $('#play-toggle').getAttribute('aria-pressed') === 'true';
  const ready = () => until(() => audio.readyState >= 1 && !$('#seek').disabled && !audio.error, 'metadata ready');
  const seekTo = seconds => {
    $('#seek').value = seconds;
    $('#seek').dispatchEvent(new Event('input', { bubbles: true }));
  };
  const loadMetadata = async () => {
    seekTo(1); // A real seek request loads metadata; zero requires no network work.
    await ready();
    seekTo(0);
    await until(() => !audio.seeking && audio.currentTime < .1, 'reset after metadata load');
  };
  audio.muted = true; // Real decoding/progress tests without sound from the QA browser.
  check('One native audio and no audiovisual embeds', document.querySelectorAll('audio').length === 1 && document.querySelectorAll('video,iframe').length === 0);
  check('Default fifth track is paused and defers MP3 loading', rows.length === 10 && activeIndex() === 4 && audio.paused && audio.preload === 'none' && audio.readyState === 0 && !$('#seek').disabled);
  check('Metadata remains clearly unverified', document.body.textContent.includes('datos preparados') && document.body.textContent.includes('discografía verificada'));
  check('P!ATDXLILY is the document and accessible brand', document.title.startsWith('P!ATDXLILY') && $('.brand').getAttribute('aria-label') === 'P!ATDXLILY, inicio');
  check('Demo placeholders are absent from page copy', !/\bdemo\b|desert echoes|visualizer/i.test(document.body.textContent));
  check('Dedication describes the recovered collection', $('#view-inicio').textContent.includes('habías perdido esas diez canciones') && $('#view-inicio').textContent.includes('reunidas aquí'));
  check('Journey label describes the song route, not a video', $('#video-preview').getAttribute('aria-label').includes('viaje por las diez canciones') && $('#view-videos').textContent.includes('acompañe la escucha'));

  for (let i = 0; i < tracks.length; i++) {
    if (activeIndex() !== i) rows[i].click();
    check(`Track ${i + 1}: paused selection defers audio`, audio.paused && audio.readyState === 0);
    await loadMetadata();
    await $('#album-cover').decode();
    check(`Track ${i + 1}: title/album/artist/year`, $('#player-track').textContent === tracks[i].title && $('#album-name').textContent === tracks[i].album && $('#album-artist').textContent === tracks[i].artist && $('#album-year').textContent === tracks[i].year);
    check(`Track ${i + 1}: correct source and cover`, audio.currentSrc === new URL(tracks[i].src, location.href).href && $('#album-cover').src === new URL(tracks[i].cover, location.href).href);
    check(`Track ${i + 1}: actual finite duration`, Number.isFinite(audio.duration) && audio.duration > 100 && Math.abs(audio.duration - expectedDurations[i]) < .2);
    const rect = $('#album-cover').getBoundingClientRect();
    check(`Track ${i + 1}: complete square cover`, Math.abs(rect.width - rect.height) < 1 && getComputedStyle($('#album-cover')).objectFit === 'contain');
    pressPlay();
    await until(() => isPlaying() && audio.currentTime > .18, `track ${i + 1} playing`);
    check(`Track ${i + 1}: native playback advances`, isPlaying() && audio.currentTime > 0 && !$('#player-state').textContent.includes('SIMULACIÓN'));
    pressPlay();
    const pausedTime = audio.currentTime;
    await wait(180);
    check(`Track ${i + 1}: pause freezes native clock`, audio.paused && Math.abs(audio.currentTime - pausedTime) < .01);
  }

  rows[4].click();
  await loadMetadata();
  seekTo(45);
  await until(() => !audio.seeking, 'seek to 45 seconds');
  check('Seek uses real media time and accessible value', Math.abs(audio.currentTime - 45) < .2 && $('#seek').getAttribute('aria-valuetext').startsWith('0:45'));
  $('#next').click();
  await loadMetadata();
  check('Next while paused resets without autoplay', activeIndex() === 5 && audio.paused && audio.currentTime === 0);
  $('#previous').click();
  await loadMetadata();
  check('Previous preserves paused state', activeIndex() === 4 && audio.paused);
  pressPlay();
  await until(() => isPlaying(), 'start before changing track');
  rows[2].click();
  await ready();
  await until(() => isPlaying(), 'continue after selection');
  check('Selection while playing continues on new audio', activeIndex() === 2 && audio.currentSrc.endsWith(tracks[2].src));

  rows[0].click(); rows[1].click(); rows[7].click(); rows[3].click();
  await ready();
  await until(() => isPlaying(), 'rapid switch winner');
  check('Rapid switches keep only final source and state', activeIndex() === 3 && audio.currentSrc.endsWith(tracks[3].src) && $('#player-track').textContent === tracks[3].title && $('#player-error').hidden);
  pressPlay();
  pressPlay(); pressPlay();
  await wait(150);
  check('Rapid play then pause remains paused', audio.paused && $('#play-toggle').getAttribute('aria-pressed') === 'false' && $('#player-error').hidden);

  rows[0].click();
  await loadMetadata();
  pressPlay();
  await until(() => isPlaying(), 'before auto advance');
  seekTo(audio.duration - .25);
  await until(() => activeIndex() === 1 && isPlaying(), 'native ended auto advances');
  check('Native ended advances and keeps playing', activeIndex() === 1 && isPlaying());
  rows[9].click();
  await ready();
  await until(() => isPlaying(), 'last track starts');
  seekTo(audio.duration - .25);
  await until(() => audio.ended && $('#play-toggle').getAttribute('aria-pressed') === 'false', 'album ends');
  check('Final ended stops rather than loops', activeIndex() === 9 && audio.paused && $('#player-state').textContent === 'LISTA FINALIZADA');
  pressPlay();
  await until(() => isPlaying() && audio.currentTime < 2, 'replay last track');
  check('Play after end restarts real track', !audio.ended && audio.currentTime < 2);
  pressPlay();
  $('#next').click();
  await loadMetadata();
  check('Manual next wraps last to first', activeIndex() === 0 && audio.paused);
  $('#previous').click();
  await loadMetadata();
  check('Manual previous wraps first to last', activeIndex() === 9 && audio.paused);

  // Controlled failure injection: verify rejection UI and recovery, not a simulated player.
  const nativePlay = audio.play;
  audio.play = () => Promise.reject(new DOMException('QA rejection', 'NotAllowedError'));
  pressPlay();
  await until(() => !$('#player-error').hidden, 'blocked play message');
  check('Autoplay rejection is handled honestly', audio.paused && $('#player-error').textContent.includes('bloqueó') && $('#play-toggle').getAttribute('aria-pressed') === 'false');
  audio.play = nativePlay;
  pressPlay();
  await until(() => isPlaying(), 'retry after rejection');
  check('Retry recovers actual playback', isPlaying() && $('#player-error').hidden);
  pressPlay();

  for (const view of ['inicio', 'informacion', 'musica', 'karaoke', 'videos', 'novedades']) {
    $(`[data-view="${view}"]`).click();
    await wait(60);
    check(`Navigation ${view}`, !$(`#view-${view}`).hidden && document.querySelectorAll('.view:not([hidden])').length === 1);
  }
  location.hash = 'videos';
  await wait(60);
  $('#video-preview').click();
  check('Journey dialog describes the treasured songs', $('#demo-dialog').open && $('#dialog-title').textContent === 'El viaje de las canciones' && $('#dialog-copy').textContent.includes('guardaste como un tesoro') && $('#dialog-copy').textContent.includes('Música para volver a escucharla'));
  $('#dialog-confirm').click();
  $('#help-button').click();
  check('Collection help explains the local archive and burger invitation', $('#demo-dialog').open && $('#dialog-copy').textContent.includes('archivo local') && $('#dialog-copy').textContent.includes('no es una discografía verificada') && $('#dialog-copy').textContent.includes('hamburguesa'));
  $('#dialog-close').click();
  location.hash = 'musica';
  await wait(60);
  rows[4].click();
  await loadMetadata();
  check('Music no longer claims simulated audio', !$('#view-musica').textContent.includes('DEMO') && !$('.album-panel').textContent.includes('SIMULACIÓN') && !$('.panel-footer').textContent.includes('SIN AUDIO REAL'));
  check('No horizontal overflow', document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  return { passed: results.length, checks: results, url: location.href };
})().then(report => { window.__panicRealQA = report; }).catch(error => {
  window.__panicRealQA = { error: error.message };
  console.error(error);
});
