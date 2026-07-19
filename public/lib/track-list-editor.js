(function initTrackListEditor(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListTrackListEditor = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function trackListEditorFactory() {
  function trackRowMarkup(song, index, escapeHtml) {
    return `<div class="edit-track" data-track-index="${index}"><button class="edit-track-drag" type="button" draggable="true" aria-label="Reorder track ${index + 1}. Drag or use arrow keys" title="Drag to reorder · arrow keys also work">⠿</button><span class="edit-track-number">${index + 1}</span><input class="edit-track-title" value="${escapeHtml(song.title || '')}" placeholder="Track title" /><input class="edit-track-artist" value="${escapeHtml(song.artist || '')}" placeholder="Artist (optional)" /><input class="edit-track-album" value="${escapeHtml(song.album || '')}" placeholder="Album (optional)" /><button class="icon-button edit-track-remove" type="button" aria-label="Remove track">×</button></div>`;
  }

  function createController({ document, editor, escapeHtml, container, addButton, getDefaultArtist }) {
    let tracks = [];

    function sync() {
      const rows = [...container.querySelectorAll('.edit-track')].map((row) => ({
        title: row.querySelector('.edit-track-title').value,
        artist: row.querySelector('.edit-track-artist').value,
        album: row.querySelector('.edit-track-album').value
      }));
      tracks = editor.syncTracks(tracks, rows);
      return tracks;
    }

    function clearDropIndicators() {
      container.querySelectorAll('.edit-track').forEach((row) => row.classList.remove('is-dragging', 'drop-before', 'drop-after'));
    }

    function move(sourceIndex, targetIndex, placeAfter = false) {
      sync();
      const moved = editor.moveTrack(tracks, sourceIndex, targetIndex, placeAfter);
      tracks = moved.tracks;
      render();
      container.querySelectorAll('.edit-track-drag')[moved.index]?.focus();
    }

    function wireReordering() {
      let draggedIndex = null;
      let nativeDropTarget = null;
      let nativeDropCompleted = false;
      let pointerTarget = null;
      let pointerMoved = false;
      const showDropTarget = (row, placeAfter) => {
        container.querySelectorAll('.edit-track').forEach((entry) => entry.classList.remove('drop-before', 'drop-after'));
        row?.classList.add(placeAfter ? 'drop-after' : 'drop-before');
        return row ? { index: Number(row.dataset.trackIndex), placeAfter } : null;
      };
      container.querySelectorAll('.edit-track').forEach((row) => {
        const handle = row.querySelector('.edit-track-drag');
        handle.addEventListener('dragstart', (event) => {
          draggedIndex = Number(row.dataset.trackIndex);
          nativeDropTarget = null;
          nativeDropCompleted = false;
          row.classList.add('is-dragging');
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(draggedIndex));
        });
        row.addEventListener('dragover', (event) => {
          if (draggedIndex === null) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          nativeDropTarget = showDropTarget(row, event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2);
        });
        row.addEventListener('drop', (event) => {
          if (draggedIndex === null) return;
          event.preventDefault();
          const sourceIndex = draggedIndex;
          const placeAfter = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
          const targetIndex = Number(row.dataset.trackIndex);
          nativeDropCompleted = true;
          clearDropIndicators();
          draggedIndex = null;
          move(sourceIndex, targetIndex, placeAfter);
        });
        handle.addEventListener('dragend', () => {
          const sourceIndex = draggedIndex;
          const destination = nativeDropTarget;
          draggedIndex = null;
          nativeDropTarget = null;
          clearDropIndicators();
          if (!nativeDropCompleted && sourceIndex !== null && destination) move(sourceIndex, destination.index, destination.placeAfter);
        });
        handle.addEventListener('pointerdown', (event) => {
          if (event.pointerType === 'mouse') return;
          draggedIndex = Number(row.dataset.trackIndex);
          pointerTarget = null;
          pointerMoved = false;
          handle.setPointerCapture(event.pointerId);
          row.classList.add('is-dragging');
        });
        handle.addEventListener('pointermove', (event) => {
          if (draggedIndex === null || event.pointerType === 'mouse') return;
          pointerMoved = true;
          const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest('.edit-track');
          if (!targetRow || !container.contains(targetRow)) { pointerTarget = null; return; }
          pointerTarget = showDropTarget(targetRow, event.clientY > targetRow.getBoundingClientRect().top + targetRow.offsetHeight / 2);
        });
        const finishPointerDrag = (event, cancelled = false) => {
          if (draggedIndex === null || event.pointerType === 'mouse') return;
          const sourceIndex = draggedIndex;
          const destination = pointerTarget;
          draggedIndex = null;
          pointerTarget = null;
          clearDropIndicators();
          if (!cancelled && pointerMoved && destination) move(sourceIndex, destination.index, destination.placeAfter);
        };
        handle.addEventListener('pointerup', (event) => finishPointerDrag(event));
        handle.addEventListener('pointercancel', (event) => finishPointerDrag(event, true));
        handle.addEventListener('keydown', (event) => {
          const sourceIndex = Number(row.dataset.trackIndex);
          if (event.key === 'ArrowUp' && sourceIndex > 0) { event.preventDefault(); move(sourceIndex, sourceIndex - 1); }
          if (event.key === 'ArrowDown' && sourceIndex < tracks.length - 1) { event.preventDefault(); move(sourceIndex, sourceIndex + 1, true); }
        });
      });
    }

    function render() {
      container.innerHTML = tracks.map((song, index) => trackRowMarkup(song, index, escapeHtml)).join('');
      container.querySelectorAll('.edit-track-remove').forEach((button) => button.addEventListener('click', () => {
        const index = Number(button.closest('.edit-track').dataset.trackIndex);
        sync();
        tracks = editor.removeTrack(tracks, index);
        render();
      }));
      wireReordering();
    }

    function load(songs = []) { tracks = [...songs]; render(); return tracks; }

    function add() {
      sync();
      tracks = editor.addTrack(tracks, getDefaultArtist());
      render();
      container.lastElementChild?.querySelector('.edit-track-title')?.focus();
    }

    function bind() { addButton.addEventListener('click', add); }

    return { load, render, sync, move, add, bind, getTracks: () => tracks };
  }

  return { trackRowMarkup, createController };
}));
