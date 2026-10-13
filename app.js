(() => {
  'use strict';
  // One native audio element; the catalog is supplied by the prepared local files.
  const tracks = window.PANIC_TRACKS;
  const lyrics = window.PANIC_LYRICS;
  const views = ['inicio', 'informacion', 'musica', 'karaoke', 'videos', 'novedades'];
  const $ = (id) => document.getElementById(id);
  const audio = $('audio-player');
  const state = { selected: 4, wantPlaying: false, loading: false, metadataReady: false, error: '', operation: 0, karaoke: false, view: '', pendingSeek: null, resumeFallbackTime: 0, lyricIndex: -1, followLyrics: true };
  const list = $('track-list');
  const seek = $('seek');
  const play = $('play-toggle');
  const dialog = $('demo-dialog');
  const lyricScroller = $('lyrics-scroll');
  const lyricLines = $('lyrics-lines');
  const lyricSelect = $('karaoke-song');
  const karaokeToggle = $('karaoke-toggle');
  const followButton = $('lyrics-follow');
  const mainPanel = document.querySelector('.main-panel');
  let renderedLyrics = [];
  const formatTime = (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  };
  const announce = (message) => { $('status').textContent = message; };
  const currentTrack = () => tracks[state.selected];
  const currentSource = () => state.karaoke ? currentTrack().instrumentalSrc : currentTrack().src;
  const currentSourceMatches = () => audio.currentSrc === new URL(currentSource(), document.baseURI).href;
  const currentSourceAssigned = () => audio.src === new URL(currentSource(), document.baseURI).href;

  tracks.forEach((track, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'track';
    button.dataset.index = index;
    button.title = track.title;
    button.innerHTML = '<span class="track-symbol" aria-hidden="true"></span><span class="track-number"></span><span class="track-name"></span><span class="track-duration"></span><span class="track-progress" aria-hidden="true"></span>';
    button.querySelector('.track-number').textContent = `${String(index + 1).padStart(3, '0')}.`;
    button.querySelector('.track-name').textContent = track.title;
    button.addEventListener('click', () => {
      if (index === state.selected) togglePlayback();
      else selectTrack(index);
    });
    item.append(button);
    list.append(item);
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${String(index + 1).padStart(2, '0')} · ${track.title}`;
    lyricSelect.append(option);
  });
  const buttons = [...list.querySelectorAll('button')];

  function renderLyrics() {
    const lines = lyrics?.[currentTrack().id] || [];
    lyricLines.replaceChildren();
    renderedLyrics = lines.map(({ text }) => {
      const line = document.createElement('p');
      line.className = 'lyric-line';
      line.textContent = text;
      lyricLines.append(line);
      return line;
    });
    if (!lines.length) {
      const empty = document.createElement('p');
      empty.className = 'karaoke-note';
      empty.textContent = 'La letra de esta canción no está disponible.';
      lyricLines.append(empty);
    }
    lyricSelect.value = String(state.selected);
    state.lyricIndex = -1;
    state.followLyrics = true;
    followButton.hidden = true;
    lyricScroller.scrollTop = 0;
    renderLyricsProgress();
  }

  function renderLyricsProgress() {
    const lines = lyrics?.[currentTrack().id] || [];
    const time = currentSourceMatches() ? audio.currentTime || 0 : 0;
    const index = lines.findIndex(line => time >= line.start && time < line.end);
    if (index === state.lyricIndex) return;
    state.lyricIndex = index;
    renderedLyrics.forEach((line, i) => {
      line.classList.toggle('is-active', i === index);
      line.classList.toggle('is-past', index >= 0 && i < index);
      if (i === index) line.setAttribute('aria-current', 'true');
      else line.removeAttribute('aria-current');
    });
    if (index >= 0 && state.followLyrics && state.view === 'karaoke') {
      const line = renderedLyrics[index];
      const top = line.getBoundingClientRect().top - lyricScroller.getBoundingClientRect().top + lyricScroller.scrollTop - (lyricScroller.clientHeight - line.clientHeight) / 2;
      lyricScroller.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  function renderKaraokeMode() {
    karaokeToggle.setAttribute('aria-pressed', String(state.karaoke));
    karaokeToggle.textContent = state.karaoke ? 'Volver a voz original' : 'Activar solo instrumental';
    const error = $('karaoke-error');
    error.hidden = !state.karaoke || !state.error;
    error.textContent = error.hidden ? '' : state.error;
  }

  function renderProgress() {
    const track = currentTrack();
    const duration = state.metadataReady && Number.isFinite(audio.duration) ? audio.duration : track.duration;
    const elapsed = state.pendingSeek ? Math.min(state.pendingSeek.time, duration) : currentSourceMatches() ? Math.min(audio.currentTime || 0, duration) : 0;
    const percent = `${Math.min(100, (elapsed / duration) * 100)}%`;
    seek.max = duration;
    seek.value = elapsed;
    seek.disabled = Boolean(state.error);
    seek.style.setProperty('--progress', percent);
    seek.setAttribute('aria-valuetext', `${formatTime(elapsed)} de ${formatTime(duration)}`);
    $('elapsed').textContent = formatTime(elapsed);
    $('duration').textContent = formatTime(duration);
    buttons[state.selected].querySelector('.track-progress').style.width = percent;
    renderLyricsProgress();
  }

  function renderPlayer() {
    const playing = state.wantPlaying && !audio.paused && !state.loading && !state.error;
    buttons.forEach((button, index) => {
      const active = index === state.selected;
      button.classList.toggle('active', active);
      button.classList.toggle('playing', active && playing);
      button.setAttribute('aria-pressed', String(active));
      button.querySelector('.track-progress').style.width = '0%';
      button.querySelector('.track-duration').textContent = formatTime(tracks[index].duration);
      const action = active ? (state.wantPlaying ? 'Pausar' : 'Reproducir') : 'Seleccionar';
      button.setAttribute('aria-label', `${action} ${tracks[index].title}, ${formatTime(tracks[index].duration)}`);
    });
    $('player-track').textContent = currentTrack().title;
    play.setAttribute('aria-label', state.error ? 'Reintentar reproducción' : state.wantPlaying ? 'Pausar' : 'Reproducir');
    play.setAttribute('aria-pressed', String(state.wantPlaying));
    $('play-icon').classList.toggle('is-playing', state.wantPlaying);
    $('player-state').textContent = state.error ? 'NO SE PUDO REPRODUCIR' : state.loading ? 'CARGANDO AUDIO…' : playing ? (state.karaoke ? 'REPRODUCIENDO · SOLO INSTRUMENTAL' : 'REPRODUCIENDO · ARCHIVO LOCAL') : audio.ended ? 'LISTA FINALIZADA' : state.karaoke ? 'EN PAUSA · SOLO INSTRUMENTAL' : 'EN PAUSA · ARCHIVO LOCAL';
    $('player-error').hidden = !state.error;
    $('player-error').textContent = state.error;
    renderKaraokeMode();
    renderProgress();
  }

  function renderMetadata() {
    const track = currentTrack();
    mainPanel.style.setProperty('--karaoke-art', `url("${track.karaokeImage}")`);
    $('album-name').textContent = track.album;
    $('album-artist').textContent = track.artist;
    $('album-year').textContent = track.year || 'Sin dato';
    $('album-position').textContent = `${String(state.selected + 1).padStart(2, '0')} / ${tracks.length}`;
    const cover = $('album-cover');
    cover.src = track.cover;
    cover.alt = `Portada asociada a ${track.title}: ${track.album}`;
  }

  function failPlayback(message) {
    state.operation += 1;
    state.wantPlaying = false;
    state.loading = false;
    state.error = message;
    state.pendingSeek = null;
    audio.pause();
    renderPlayer();
  }

  async function requestPlayback() {
    if (state.pendingSeek) {
      state.pendingSeek.shouldPlay = true;
      state.wantPlaying = true;
      renderPlayer();
      return;
    }
    const operation = ++state.operation;
    state.wantPlaying = true;
    state.loading = true;
    state.error = '';
    if (audio.error || audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      state.metadataReady = false;
      audio.load();
    }
    if (audio.ended) audio.currentTime = 0;
    renderPlayer();
    try {
      await audio.play();
      if (operation !== state.operation) return;
      state.loading = false;
      renderPlayer();
      announce(`Reproduciendo ${currentTrack().title}.`);
    } catch (error) {
      // load()/pause() rejects obsolete play promises; never report them on a new track.
      if (operation !== state.operation) return;
      if (error.name === 'NotAllowedError') {
        failPlayback('El navegador bloqueó la reproducción. Pulsa reproducir para intentarlo de nuevo.');
      } else {
        failPlayback(state.karaoke ? 'No se pudo cargar el instrumental. Vuelve a voz original o selecciona otra canción.' : 'No se pudo cargar esta pista. Pulsa reproducir para reintentar o selecciona otra canción.');
      }
    }
  }

  function pausePlayback() {
    state.operation += 1;
    state.wantPlaying = false;
    state.loading = false;
    if (state.pendingSeek) state.pendingSeek.shouldPlay = false;
    audio.pause();
    renderPlayer();
    announce('Reproducción en pausa.');
  }

  function togglePlayback() {
    if (state.wantPlaying) pausePlayback();
    else requestPlayback();
  }

  function selectTrack(index, shouldPlay = state.wantPlaying) {
    state.operation += 1;
    state.selected = (index + tracks.length) % tracks.length;
    state.wantPlaying = shouldPlay;
    state.loading = shouldPlay;
    state.metadataReady = false;
    state.error = '';
    state.pendingSeek = null;
    audio.pause();
    audio.src = currentSource();
    if (shouldPlay) audio.load();
    renderMetadata();
    renderLyrics();
    renderPlayer();
    announce(`${currentTrack().title} seleccionada. Datos de tu colección.`);
    if (shouldPlay) requestPlayback();
  }

  function updateMetadata(event) {
    if (!currentSourceMatches() || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    // On some browsers durationchange arrives before loadedmetadata and a seek
    // made there is silently discarded. Consume the saved position only later.
    if (state.pendingSeek && event.type !== 'loadedmetadata') return;
    if (!state.karaoke) currentTrack().duration = audio.duration;
    state.metadataReady = audio.readyState >= HTMLMediaElement.HAVE_METADATA;
    if (state.pendingSeek && state.metadataReady) {
      const { time, shouldPlay } = state.pendingSeek;
      state.pendingSeek = null;
      audio.currentTime = Math.max(0, Math.min(time, audio.duration - 0.05));
      state.resumeFallbackTime = 0;
      state.loading = false;
      renderPlayer();
      if (shouldPlay) requestPlayback();
      return;
    }
    if (!state.wantPlaying) state.loading = false;
    renderPlayer();
  }
  audio.addEventListener('loadedmetadata', updateMetadata);
  audio.addEventListener('durationchange', updateMetadata);
  audio.addEventListener('timeupdate', renderProgress);
  audio.addEventListener('seeked', () => {
    state.followLyrics = true;
    followButton.hidden = true;
    renderProgress();
  });
  audio.addEventListener('playing', () => {
    if (!currentSourceMatches()) return;
    if (!state.wantPlaying) { audio.pause(); return; }
    state.loading = false;
    renderPlayer();
  });
  audio.addEventListener('pause', () => {
    if (audio.ended) return; // ended, not pause, owns automatic next-track behavior.
    if (!state.loading) state.wantPlaying = false;
    renderPlayer();
  });
  ['waiting', 'stalled'].forEach(event => audio.addEventListener(event, () => {
    if (state.wantPlaying && currentSourceMatches()) {
      state.loading = true;
      renderPlayer();
    }
  }));
  audio.addEventListener('canplay', () => {
    if (currentSourceMatches() && (!state.wantPlaying || !audio.paused)) {
      state.loading = false;
      renderPlayer();
    }
  });
  audio.addEventListener('error', () => {
    if (!audio.error || !currentSourceMatches()) return;
    failPlayback(state.karaoke ? 'No se pudo cargar el instrumental. Vuelve a voz original o selecciona otra canción.' : 'No se pudo cargar esta pista. Pulsa reproducir para reintentar o selecciona otra canción.');
  });
  audio.addEventListener('ended', () => {
    if (!currentSourceMatches() || !audio.ended) return;
    if (state.selected < tracks.length - 1) selectTrack(state.selected + 1, true);
    else {
      state.operation += 1;
      state.wantPlaying = false;
      state.loading = false;
      renderPlayer();
      announce('La lista terminó.');
    }
  });

  play.addEventListener('click', togglePlayback);
  $('previous').addEventListener('click', () => selectTrack(state.selected - 1));
  $('next').addEventListener('click', () => selectTrack(state.selected + 1));
  seek.addEventListener('input', () => {
    // currentSrc can still refer to the previous track until the browser's next
    // media-selection step. The configured src is already authoritative here.
    if (!currentSourceAssigned() || state.error) return;
    const duration = state.metadataReady && Number.isFinite(audio.duration) ? audio.duration : currentTrack().duration;
    const target = Math.max(0, Math.min(Number(seek.value), duration));
    if (!state.metadataReady) {
      if (state.pendingSeek) state.pendingSeek.time = target;
      else {
        state.pendingSeek = { time: target, shouldPlay: state.wantPlaying };
        state.resumeFallbackTime = target;
        state.loading = true;
        audio.load();
      }
      renderPlayer();
      return;
    }
    audio.currentTime = target;
    renderProgress();
  });

  function setKaraoke(enabled) {
    if (enabled === state.karaoke) return;
    if (enabled && !currentTrack().instrumentalSrc) {
      $('karaoke-error').textContent = 'Esta canción no tiene instrumental disponible.';
      $('karaoke-error').hidden = false;
      return;
    }
    const resumeAt = state.pendingSeek?.time ?? (state.error && state.karaoke ? state.resumeFallbackTime : audio.currentTime || 0);
    const shouldPlay = state.wantPlaying && !state.error;
    state.operation += 1;
    state.karaoke = enabled;
    state.wantPlaying = shouldPlay;
    state.loading = true;
    state.metadataReady = false;
    state.error = '';
    state.pendingSeek = { time: resumeAt, shouldPlay };
    state.resumeFallbackTime = resumeAt;
    audio.pause();
    audio.src = currentSource();
    audio.load();
    renderPlayer();
    announce(enabled ? 'Modo karaoke activado. Solo instrumental.' : 'Voz original restaurada.');
  }

  karaokeToggle.addEventListener('click', () => setKaraoke(!state.karaoke));
  lyricSelect.addEventListener('change', () => selectTrack(Number(lyricSelect.value)));
  const suspendFollow = () => {
    state.followLyrics = false;
    followButton.hidden = false;
  };
  lyricScroller.addEventListener('wheel', suspendFollow, { passive: true });
  lyricScroller.addEventListener('touchstart', suspendFollow, { passive: true });
  lyricScroller.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) suspendFollow();
  });
  followButton.addEventListener('click', () => {
    state.followLyrics = true;
    followButton.hidden = true;
    state.lyricIndex = -1;
    renderLyricsProgress();
    lyricScroller.focus();
  });

  function showView() {
    const requested = window.location.hash.slice(1);
    const active = views.includes(requested) ? requested : 'musica';
    if (active !== 'karaoke' && state.karaoke) setKaraoke(false);
    state.view = active;
    mainPanel.classList.toggle('karaoke-active', active === 'karaoke');
    document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== `view-${active}`; });
    document.querySelectorAll('[data-view]').forEach(link => {
      if (link.dataset.view === active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const label = document.querySelector(`[data-view="${active}"]`).textContent;
    document.title = `P!ATDXLILY — ${label} | Panic! at the Disco`;
    announce(`Vista ${label}. Sitio independiente, no oficial.`);
    if (active === 'karaoke') {
      state.lyricIndex = -1; // The line may have advanced while this view was hidden.
      renderLyricsProgress();
    }
  }
  window.addEventListener('hashchange', showView);

  function openDialog(video = false) {
    $('dialog-title').textContent = video ? 'El viaje de las canciones' : 'Un archivo para volver.';
    $('dialog-copy').textContent = video
      ? 'Este paisaje acompaña las diez canciones que guardaste como un tesoro. Elige una en Música para volver a escucharla.'
      : 'Reuní las diez canciones en este archivo local para que puedas escucharlas juntas. Los títulos, años, álbumes y portadas son datos preparados; no es una discografía verificada ni un sitio oficial. Y si quieres los demás álbumes, invítame una hamburguesa :P';
    dialog.showModal();
  }
  $('help-button').addEventListener('click', () => openDialog());
  $('video-preview').addEventListener('click', () => openDialog(true));
  $('dialog-close').addEventListener('click', () => dialog.close());
  $('dialog-confirm').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  window.addEventListener('pagehide', pausePlayback);
  selectTrack(4, false);
  showView();
})();
