(function exposeTheatre(root, factory) {
  const theatre = factory();
  if (typeof module === 'object' && module.exports) module.exports = theatre;
  else root.MasterListTheatre = theatre;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createTheatre() {
  function commandForKey({ key, inTheatre, playerHidden, editing }) {
    if (playerHidden || editing) return null;
    const normalized = String(key || '').toLowerCase();
    if (!inTheatre && normalized !== 'f') return null;
    if (normalized === 'arrowright') return 'next';
    if (normalized === 'arrowleft') return 'previous';
    if (normalized === ' ' || normalized === 'k') return 'toggle-playback';
    if (normalized === 'm') return 'toggle-mute';
    if (normalized === 'f') return 'toggle-theatre';
    return null;
  }

  function fullscreenPresentation(inTheatre) {
    return { buttonLabel: inTheatre ? '↙ Exit theatre' : '⛶ Theatre', controlsLabel: inTheatre ? 'Show or hide playback controls' : 'Playback controls' };
  }

  function shouldAutoHide({ inTheatre, playing, timelineActive }) {
    return Boolean(inTheatre && playing && !timelineActive);
  }

  return { commandForKey, fullscreenPresentation, shouldAutoHide };
}));
