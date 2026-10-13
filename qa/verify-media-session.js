(async () => {
  const results = [];
  const $ = selector => document.querySelector(selector);
  const audio = $('#audio-player');
  const tracks = window.PANIC_TRACKS;
  const probe = window.__panicMediaProbe;
  const handlers = probe.handlers;
  const check = (name, value) => { results.push({ name, passed: Boolean(value) }); if (!value) throw new Error(`FAIL: ${name}`); };
  const until = async (fn, label) => {
    const end = performance.now() + 10000;
    while (!fn()) { if (performance.now() > end) throw new Error(`Timeout: ${label}`); await new Promise(resolve => setTimeout(resolve, 25)); }
  };
  const action = (name, data = {}) => handlers[name]({ action: name, ...data });
  const at = time => !audio.seeking && Math.abs(audio.currentTime - time) < 0.4;
  const imageIs = track => navigator.mediaSession.metadata.artwork[0].src === new URL(track.karaokeImage, document.baseURI).href;
  const titleIs = index => navigator.mediaSession.metadata.title === tracks[index].title;
  const playing = () => !audio.paused && audio.currentTime > 0.1 && navigator.mediaSession.playbackState === 'playing';
  audio.muted = true;
  check('Media Session registers eight system actions', ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward', 'stop'].every(name => typeof handlers[name] === 'function'));
  check('Default title and artist use the song, not document title', titleIs(4) && navigator.mediaSession.metadata.artist === tracks[4].artist);
  check('Default artwork is its song background, not the app icon', imageIs(tracks[4]));
  check('Media Session initialization does not autoplay', audio.paused && audio.readyState === 0 && navigator.mediaSession.playbackState === 'paused');

  action('play');
  await until(playing, 'system play');
  check('System play starts native audio and updates UI', $('#play-toggle').getAttribute('aria-pressed') === 'true');
  action('pause');
  check('System pause synchronizes native audio, UI and platform state', audio.paused && navigator.mediaSession.playbackState === 'paused' && $('#play-toggle').getAttribute('aria-pressed') === 'false');
  action('seekto', { seekTime: 45 });
  await until(() => at(45), 'absolute seek');
  check('Absolute system seek stays paused', audio.paused);
  action('seekbackward');
  await until(() => at(35), 'backward default');
  check('System seek backward defaults to ten seconds', true);
  action('seekforward', { seekOffset: 7 });
  await until(() => at(42), 'forward explicit');
  check('System seek forward honors supplied offset', true);
  check('Position state includes valid native duration/rate/position', Math.abs(probe.position.duration - audio.duration) < .2 && Math.abs(probe.position.position - 42) < .4 && probe.position.playbackRate === 1);
  audio.playbackRate = 1.25;
  await until(() => probe.position.playbackRate === 1.25, 'playback rate');
  check('Playback-rate changes reach the platform', true);
  audio.playbackRate = 1;
  action('seekto', { seekTime: NaN });
  check('Invalid system seek is ignored safely', at(42));

  action('play');
  await until(playing, 'resume');
  action('nexttrack');
  await until(() => titleIs(5) && playing(), 'next playing');
  check('System next changes metadata/artwork and preserves playback', imageIs(tracks[5]));
  action('previoustrack');
  await until(() => titleIs(4) && playing(), 'previous playing');
  check('System previous uses existing playlist navigation', imageIs(tracks[4]));
  action('pause');
  action('nexttrack');
  await until(() => titleIs(5) && audio.readyState === 0, 'next paused');
  check('Paused system next does not autoplay or load the audio element', audio.paused && navigator.mediaSession.playbackState === 'paused');
  action('seekto', { seekTime: 3 });
  action('seekto', { seekTime: 7 });
  await until(() => audio.readyState >= 1 && at(7), 'pending lazy seek');
  check('Lazy system seeks reuse metadata queue and keep the final request', audio.paused);

  $('[data-view="karaoke"]').click();
  await until(() => !$('#view-karaoke').hidden, 'karaoke');
  $('#karaoke-toggle').click();
  await until(() => audio.currentSrc.includes('/instrumental/') && audio.readyState >= 1 && at(7), 'instrumental seek completed');
  check('Instrumental mode appears in platform album metadata', navigator.mediaSession.metadata.album.endsWith(' · Solo instrumental'));
  check('Changing mode preserves the song background and position', imageIs(tracks[5]) && at(7));
  action('play');
  await until(playing, 'instrumental play');
  action('nexttrack');
  await until(() => titleIs(6) && playing() && audio.currentSrc.includes('/instrumental/'), 'instrumental next');
  check('System playlist controls retain instrumental mode', $('#karaoke-toggle').getAttribute('aria-pressed') === 'true' && imageIs(tracks[6]));
  action('stop');
  await until(() => at(0), 'stop');
  check('System stop pauses and resets without selecting another song', audio.paused && titleIs(6) && navigator.mediaSession.playbackState === 'paused');

  for (let i = 0; i < tracks.length; i++) {
    $('#karaoke-song').value = String(i);
    $('#karaoke-song').dispatchEvent(new Event('change', { bubbles: true }));
    check(`Song ${i + 1}: exact title/artist metadata`, titleIs(i) && navigator.mediaSession.metadata.artist === tracks[i].artist);
    check(`Song ${i + 1}: its background URL and honest MIME/dimensions`, imageIs(tracks[i]) && navigator.mediaSession.metadata.artwork[0].type === 'image/webp' && !navigator.mediaSession.metadata.artwork[0].sizes);
    const artwork = new Image();
    artwork.src = navigator.mediaSession.metadata.artwork[0].src;
    await artwork.decode();
    check(`Song ${i + 1}: background decodes offline`, artwork.naturalWidth > 0 && artwork.naturalHeight > 0);
  }

  $('#karaoke-song').value = '0';
  $('#karaoke-song').dispatchEvent(new Event('change', { bubbles: true }));
  action('seekto', { seekTime: tracks[0].duration - .4 });
  await until(() => audio.readyState >= 1 && !audio.seeking, 'end seek');
  action('play');
  await until(() => titleIs(1) && playing(), 'automatic advance');
  check('Native automatic advance refreshes system metadata/artwork', imageIs(tracks[1]));
  action('pause');
  const nativePlay = audio.play;
  audio.play = () => Promise.reject(new DOMException('QA blocked', 'NotAllowedError'));
  action('play');
  await until(() => !$('#player-error').hidden, 'play rejection');
  check('Blocked system play reports paused state rather than fake playback', audio.paused && navigator.mediaSession.playbackState === 'paused');
  audio.play = nativePlay;
  action('play');
  await until(playing, 'retry');
  check('System play recovers from a blocked playback request', $('#player-error').hidden);
  action('pause');
  check('Integration still uses only one native audio element', document.querySelectorAll('audio').length === 1);
  return { passed: results.length, checks: results };
})().then(report => { window.__panicMediaQA = report; }).catch(error => {
  window.__panicMediaQA = { error: error.message };
  console.error(error);
});
