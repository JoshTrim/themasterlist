(function exposeTheatreController(root, factory) {
  const controller = factory();
  if (typeof module === 'object' && module.exports) module.exports = controller;
  else root.MasterListTheatreController = controller;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createTheatreControllerModule() {
  function createController({ document, window, player, fullscreenButton, controlsToggle, theatre, isPlaying, timelineActive, requestWakeLock, releaseWakeLock, commands, setTimeout, clearTimeout, autoHideDelay = 3400 }) {
    let timer;
    const inTheatre = () => document.fullscreenElement === player;
    function schedule() {
      clearTimeout(timer);
      if (!theatre.shouldAutoHide({ inTheatre: inTheatre(), playing: isPlaying(), timelineActive: timelineActive() })) return;
      timer = setTimeout(() => { if (theatre.shouldAutoHide({ inTheatre: inTheatre(), playing: isPlaying(), timelineActive: timelineActive() })) player.classList.add('theatre-idle'); }, autoHideDelay);
    }
    function reveal({ schedule: shouldSchedule = true } = {}) { player.classList.remove('theatre-idle', 'controls-hidden'); clearTimeout(timer); if (shouldSchedule) schedule(); }
    async function toggle() { if (!document.fullscreenElement) await player.requestFullscreen?.(); else await document.exitFullscreen?.(); }
    function bind() {
      fullscreenButton?.addEventListener('click', toggle);
      controlsToggle.addEventListener('click', () => { if (player.classList.contains('theatre-idle')) reveal(); else player.classList.add('theatre-idle'); });
      player.addEventListener('pointermove', () => reveal()); player.addEventListener('pointerdown', () => reveal()); player.addEventListener('focusin', () => reveal({ schedule: false }));
      document.addEventListener('fullscreenchange', () => {
        const active = inTheatre(); const presentation = theatre.fullscreenPresentation(active); reveal();
        fullscreenButton.textContent = presentation.buttonLabel; controlsToggle.setAttribute('aria-label', presentation.controlsLabel);
        if (active) requestWakeLock(); else releaseWakeLock();
      });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && inTheatre()) requestWakeLock(); });
      window.addEventListener('pagehide', releaseWakeLock);
      document.addEventListener('keydown', (event) => {
        const command = theatre.commandForKey({ key: event.key, inTheatre: inTheatre(), playerHidden: player.hidden, editing: Boolean(event.target.closest?.('input, textarea, select, [contenteditable="true"]')) });
        if (!command) return; event.preventDefault(); commands[command]?.(); reveal();
      });
    }
    return { bind, schedule, reveal, toggle, inTheatre };
  }
  return { createController };
}));
