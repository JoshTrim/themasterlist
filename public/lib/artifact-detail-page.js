(function exposeArtifactDetailPage(root, factory) {
  const artifactDetailPage = factory(
    typeof module === 'object' && module.exports ? require('./artifacts-page') : root.MasterListArtifactsPage
  );
  if (typeof module === 'object' && module.exports) module.exports = artifactDetailPage;
  else root.MasterListArtifactDetailPage = artifactDetailPage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createArtifactDetailPageModule(artifactsPage) {
  function findArtifact(shows = [], id = '') {
    return artifactsPage.buildArtifactModel(shows).find((item) => String(item.id) === String(id)) || null;
  }

  function viewLabel(view, index) {
    return view.artifactViewLabel || ({ front: 'Front', back: 'Back', detail: `Detail ${index + 1}` }[view.artifactView] || `View ${index + 1}`);
  }

  function nextViewIndex(views, currentIndex, direction = 1) {
    if (!views.length) return 0;
    return (currentIndex + direction + views.length) % views.length;
  }

  function flipViewIndex(views, currentIndex) {
    const current = views[currentIndex];
    const target = current?.artifactView === 'front' ? 'back' : 'front';
    const targetIndex = views.findIndex((view) => view.artifactView === target);
    return targetIndex >= 0 ? targetIndex : nextViewIndex(views, currentIndex);
  }

  function createController({ page, getShows, artifactId, escapeHtml, formatGigDate, openArtifact = () => {}, elements }) {
    let artifact = null;
    let currentIndex = 0;
    const { content, missing, image, viewTabs, previous, flip, next, fullscreen, download } = elements;

    function renderView() {
      if (!artifact || !image) return;
      const view = artifact.artifactViews[currentIndex] || artifact;
      image.src = view.url || '';
      image.alt = view.caption || artifact.caption || `${artifactsPage.labels[artifact.artifactType] || 'Artifact'} from ${artifact.gig.artist}`;
      image.style.objectPosition = `${Number(view.artifactCropX ?? 50)}% ${Number(view.artifactCropY ?? 50)}%`;
      image.style.transform = `rotate(${Number(view.rotation || 0)}deg) scale(${Number(view.artifactZoom || 1)})`;
      if (download) download.href = `/api/media/${encodeURIComponent(view.id)}?variant=original`;
      viewTabs.innerHTML = artifact.artifactViews.map((item, index) => `<button type="button" data-view-index="${index}" class="${index === currentIndex ? 'active' : ''}" aria-pressed="${index === currentIndex}">${escapeHtml(viewLabel(item, index))}</button>`).join('');
      viewTabs.querySelectorAll?.('[data-view-index]').forEach((button) => button.addEventListener('click', () => {
        currentIndex = Number(button.dataset.viewIndex);
        renderView();
      }));
      const hasMultiple = artifact.artifactViews.length > 1;
      [previous, flip, next].forEach((button) => { if (button) button.disabled = !hasMultiple; });
    }

    function render() {
      if (page !== 'artifact' || !content) return;
      artifact = findArtifact(getShows(), artifactId());
      content.hidden = !artifact;
      if (missing) missing.hidden = Boolean(artifact);
      if (!artifact) return;
      currentIndex = 0;
      const type = artifact.artifactType || 'memorabilia';
      const showHref = artifact.remote ? `/shows#shared-${encodeURIComponent(artifact.gig.id)}` : `/show?id=${encodeURIComponent(artifact.gig.id)}`;
      elements.type.textContent = artifactsPage.labels[type] || artifactsPage.labels.memorabilia;
      elements.title.textContent = artifact.caption || artifact.filename || artifactsPage.labels[type] || 'Artifact';
      elements.notes.textContent = artifact.artifactNotes || 'No notes have been added yet.';
      elements.notes.classList?.toggle('is-empty', !artifact.artifactNotes);
      elements.artist.textContent = artifact.gig.artist;
      elements.show.href = showHref;
      elements.showMeta.textContent = [artifact.gig.venue, artifact.gig.city, formatGigDate(artifact.gig.date)].filter(Boolean).join(' · ');
      elements.viewCount.textContent = `${artifact.artifactViews.length} photo${artifact.artifactViews.length === 1 ? '' : 's'}`;
      if (elements.edit) {
        elements.edit.hidden = Boolean(artifact.remote);
        elements.edit.href = `/edit?id=${encodeURIComponent(artifact.gig.id)}#artifacts`;
      }
      renderView();
    }

    previous?.addEventListener('click', () => { currentIndex = nextViewIndex(artifact?.artifactViews || [], currentIndex, -1); renderView(); });
    next?.addEventListener('click', () => { currentIndex = nextViewIndex(artifact?.artifactViews || [], currentIndex, 1); renderView(); });
    flip?.addEventListener('click', () => { currentIndex = flipViewIndex(artifact?.artifactViews || [], currentIndex); renderView(); });
    fullscreen?.addEventListener('click', () => {
      if (!artifact) return;
      const selected = artifact.artifactViews[currentIndex] || artifact;
      openArtifact({ ...artifact, ...selected, id: selected.id, artifactGroupId: artifact.id, artifactViews: artifact.artifactViews });
    });
    return { render, renderView, getArtifact: () => artifact, getCurrentIndex: () => currentIndex };
  }

  return { findArtifact, viewLabel, nextViewIndex, flipViewIndex, createController };
}));
