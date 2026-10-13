(async () => {
  const results = [];
  const $ = selector => document.querySelector(selector);
  const tracks = window.PANIC_TRACKS;
  const lyrics = window.PANIC_LYRICS;
  const audio = $('#audio-player');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (condition, label, timeout = 10000) => {
    const start = performance.now();
    while (!condition()) {
      if (performance.now() - start > timeout) throw new Error(`Timeout: ${label}`);
      await wait(35);
    }
  };
  const check = (name, value) => {
    results.push({ name, passed: Boolean(value) });
    if (!value) throw new Error(`FAIL: ${name}`);
  };
  const sourceIs = path => audio.currentSrc === new URL(path, location.href).href;
  const choose = index => {
    $('#karaoke-song').value = String(index);
    $('#karaoke-song').dispatchEvent(new Event('change', { bubbles: true }));
  };
  const toggle = () => $('#karaoke-toggle').click();
  const seekTo = seconds => {
    $('#seek').value = String(seconds);
    $('#seek').dispatchEvent(new Event('input', { bubbles: true }));
  };
  audio.muted = true;
  location.hash = 'karaoke';
  await until(() => !$('#view-karaoke').hidden, 'karaoke view');
  check('Karaoke route, lyrics and deferred audio without autoplay', $('#karaoke-song').value === '4' && $('#lyrics-lines').children.length > 0 && audio.paused && audio.preload === 'none' && audio.readyState === 0 && $('#karaoke-toggle').getAttribute('aria-pressed') === 'false');
  check('One shared native audio', document.querySelectorAll('audio').length === 1);
  check('Artwork is confined to Karaoke', $('.main-panel').classList.contains('karaoke-active'));
  check('Ten sets of timed lyrics', tracks.length === 10 && tracks.every(track => (lyrics[track.id] || []).length > 0));
  for (const track of tracks) {
    const lines = lyrics[track.id];
    check(`${track.id}: chronological lyrics`, lines.every((line, index) => line.start >= 0 && line.end > line.start && line.end <= track.duration + 0.1 && (index === 0 || line.start >= lines[index - 1].end - 0.02) && typeof line.text === 'string' && line.text.length));
  }
  check('Uncertain source wording remains marked', tracks.some(track => lyrics[track.id].some(line => line.text.includes('[?]'))));

  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index];
    choose(index);
    await until(() => sourceIs(track.src) && audio.readyState === 0, `${track.title} original stays deferred`);
    const artwork = new Image();
    artwork.src = track.karaokeImage;
    await artwork.decode();
    const lyricArt = getComputedStyle($('#lyrics-scroll')).backgroundImage;
    const panelArt = getComputedStyle($('.main-panel'), '::after');
    check(`${track.id}: its local artwork fills only the lyrics box`, artwork.naturalWidth > 0 && lyricArt.includes(track.karaokeImage) && panelArt.content === 'none');
    check(`${track.id}: selector loads its own lyrics`, $('#lyrics-lines').children.length === lyrics[track.id].length && $('#player-track').textContent === track.title && audio.paused);
    toggle();
    await until(() => sourceIs(track.instrumentalSrc) && audio.readyState >= 1, `${track.title} instrumental`);
    check(`${track.id}: instrumental is the actual source`, $('#karaoke-toggle').getAttribute('aria-pressed') === 'true' && Math.abs(audio.duration - track.duration) < 0.25 && audio.paused);
    toggle();
    await until(() => sourceIs(track.src) && audio.readyState >= 1, `${track.title} restored`);
    check(`${track.id}: original restored`, $('#karaoke-toggle').getAttribute('aria-pressed') === 'false' && audio.paused);
  }

  choose(4);
  seekTo(35);
  await until(() => audio.readyState >= 1 && Math.abs(audio.currentTime - 35) < 0.4, 'lazy seek to 35s loads metadata');
  const active = lyrics[5].findIndex(line => 35 >= line.start && 35 < line.end);
  check('Seeking highlights the corresponding line', active >= 0 && [...$('#lyrics-lines').children].findIndex(line => line.classList.contains('is-active')) === active);
  toggle();
  await until(() => sourceIs(tracks[4].instrumentalSrc) && audio.readyState >= 1 && Math.abs(audio.currentTime - 35) < 0.5, 'paused mode change retains time');
  check('Paused switch preserves playhead', audio.paused && Math.abs(audio.currentTime - 35) < 0.5);
  for (let i = 0; i < 4; i++) toggle();
  await until(() => sourceIs(tracks[4].instrumentalSrc) && audio.readyState >= 1 && Math.abs(audio.currentTime - 35) < 0.5, 'rapid switches settle');
  check('Rapid mode changes preserve the final source and time', audio.paused && $('#karaoke-toggle').getAttribute('aria-pressed') === 'true');
  $('#play-toggle').click();
  await until(() => !audio.paused && audio.currentTime > 35.1, 'instrumental playback');
  const beforeExit = audio.currentTime;
  location.hash = 'musica';
  await until(() => sourceIs(tracks[4].src) && audio.readyState >= 1 && !audio.paused, 'leaving karaoke restores original');
  check('Artwork disappears outside Karaoke', !$('.main-panel').classList.contains('karaoke-active') && getComputedStyle($('#lyrics-scroll')).backgroundImage === 'none');
  check('Leaving karaoke restores original without losing playback', $('#karaoke-toggle').getAttribute('aria-pressed') === 'false' && Math.abs(audio.currentTime - beforeExit) < 1.5);
  $('#play-toggle').click();
  location.hash = 'karaoke';
  await until(() => !$('#view-karaoke').hidden, 'return karaoke');

  const originalPath = tracks[4].instrumentalSrc;
  tracks[4].instrumentalSrc = 'assets/audio/instrumental/missing-qa.mp3';
  toggle();
  await until(() => !$('#karaoke-error').hidden, 'missing instrumental error');
  check('Missing instrumental never falls back to voiced audio', audio.paused && sourceIs(tracks[4].instrumentalSrc) && $('#karaoke-toggle').getAttribute('aria-pressed') === 'true');
  tracks[4].instrumentalSrc = originalPath;
  location.hash = 'musica';
  await until(() => sourceIs(tracks[4].src) && audio.readyState >= 1, 'recover after unavailable stem');
  check('Exit recovers original after instrumental failure', $('#karaoke-toggle').getAttribute('aria-pressed') === 'false' && $('#player-error').hidden);

  location.hash = 'karaoke';
  await until(() => !$('#view-karaoke').hidden, 'karaoke again');
  choose(0);
  await until(() => sourceIs(tracks[0].src) && audio.readyState === 0, 'first track remains deferred');
  toggle();
  await until(() => sourceIs(tracks[0].instrumentalSrc) && audio.readyState >= 1, 'first instrumental for ending');
  choose(1);
  await until(() => sourceIs(tracks[1].instrumentalSrc) && audio.readyState === 0, 'manual song change retains instrumental without loading');
  check('Song selector retains instrumental mode', $('#karaoke-toggle').getAttribute('aria-pressed') === 'true' && audio.paused);
  choose(0);
  await until(() => sourceIs(tracks[0].instrumentalSrc) && audio.readyState === 0, 'first instrumental selection stays deferred');
  seekTo(tracks[0].duration - 0.4);
  await until(() => audio.readyState >= 1 && Math.abs(audio.currentTime - (tracks[0].duration - 0.4)) < 0.5, 'load first track metadata for end seek');
  $('#play-toggle').click();
  await until(() => $('#karaoke-song').value === '1' && sourceIs(tracks[1].instrumentalSrc), 'automatic next instrumental', 12000);
  check('Ending advances to the next instrumental', $('#karaoke-toggle').getAttribute('aria-pressed') === 'true');
  $('#play-toggle').click();
  choose(9);
  await until(() => sourceIs(tracks[9].instrumentalSrc) && audio.readyState === 0, 'last instrumental remains deferred while paused');
  seekTo(tracks[9].duration - 0.4);
  await until(() => audio.readyState >= 1 && Math.abs(audio.currentTime - (tracks[9].duration - 0.4)) < 0.5, 'load last track metadata for end seek');
  $('#play-toggle').click();
  await until(() => audio.ended, 'last track ends', 12000);
  check('Last track stops instead of wrapping', $('#karaoke-song').value === '9' && $('#player-state').textContent === 'LISTA FINALIZADA');
  return { passed: results.length, checks: results, url: location.href };
})().then(report => { window.__panicKaraokeQA = report; }).catch(error => {
  window.__panicKaraokeQA = { error: error.message };
  console.error(error);
});
