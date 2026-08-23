(function exposeArtifactsPage(root, factory) {
  const artifactsPage = factory();
  if (typeof module === 'object' && module.exports) module.exports = artifactsPage;
  else root.MasterListArtifactsPage = artifactsPage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createArtifactsPageModule() {
  const labels = Object.freeze({ merch: 'Merch', ticket: 'Ticket', setlist: 'Physical setlist', poster: 'Poster', memorabilia: 'Memorabilia' });

  function groupArtifactMedia(media = []) {
    const groups = new Map();
    for (const item of media.filter((entry) => entry.category === 'artifact')) {
      const id = item.artifactGroupId || item.id;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({ ...item, artifactGroupId: id, artifactView: item.artifactView || 'front' });
    }
    return [...groups.entries()].map(([id, views]) => {
      views.sort((left, right) => {
        const order = { front: 0, back: 1, detail: 2 };
        return (order[left.artifactView] ?? 3) - (order[right.artifactView] ?? 3) || Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
      });
      const cover = views.find((item) => item.artifactIsCover) || views.find((item) => item.artifactView === 'front') || views[0];
      return { ...cover, id, coverMediaId: cover.id, artifactViews: views };
    });
  }

  function buildArtifactModel(shows = []) {
    return shows.flatMap((gig) => groupArtifactMedia(gig.media || []).map((item) => ({ ...item, gig, artifactViews: item.artifactViews.map((view) => ({ ...view, gig })) })))
      .sort((left, right) => String(right.gig.date || '').localeCompare(String(left.gig.date || '')) || String(left.caption || left.filename || '').localeCompare(String(right.caption || right.filename || '')));
  }

  function createController({ page, getShows, escapeHtml, formatGigDate, openArtifact = () => {}, elements }) {
    const { query, type, summary, grid, empty } = elements;
    function render() {
      if (page !== 'artifacts' || !grid) return;
      const all = buildArtifactModel(getShows());
      const needle = String(query?.value || '').trim().toLowerCase();
      const selectedType = String(type?.value || 'all');
      const filtered = all.filter((item) => {
        const artifactType = item.artifactType || 'memorabilia';
        const text = [item.caption, item.artifactNotes, item.gig.artist, item.gig.venue, item.gig.city].join(' ').toLowerCase();
        return (!needle || text.includes(needle)) && (selectedType === 'all' || artifactType === selectedType);
      });
      if (summary) summary.textContent = `${filtered.length} artifact${filtered.length === 1 ? '' : 's'}${filtered.length === all.length ? '' : ` · ${all.length} total`}`;
      if (empty) empty.hidden = filtered.length > 0;
      grid.innerHTML = filtered.map((item) => {
        const artifactType = item.artifactType || 'memorabilia';
        const imageStyle = `object-position:${Number(item.artifactCropX ?? 50)}% ${Number(item.artifactCropY ?? 50)}%;transform:rotate(${Number(item.rotation || 0)}deg) scale(${Number(item.artifactZoom || 1)})`;
        const showHref = item.remote ? `/shows#shared-${encodeURIComponent(item.gig.id)}` : `/show?id=${encodeURIComponent(item.gig.id)}`;
        const viewCount = item.artifactViews.length;
        return `<article class="artifact-archive-card${item.useBackgroundRemoved ? ' is-cutout' : ''}" data-artifact-id="${escapeHtml(item.id)}"><button class="artifact-archive-image" type="button" aria-label="Open ${escapeHtml(item.caption || labels[artifactType])}"><img src="${escapeHtml(item.url || '')}" alt="${escapeHtml(item.caption || `${labels[artifactType]} from ${item.gig.artist}`)}" loading="lazy" style="${imageStyle}" />${viewCount > 1 ? `<span>${viewCount} views · flip</span>` : ''}</button><div class="artifact-archive-copy"><span class="artifact-type-badge">${escapeHtml(labels[artifactType] || labels.memorabilia)}</span><h2>${escapeHtml(item.caption || item.filename || labels[artifactType] || labels.memorabilia)}</h2>${item.artifactNotes ? `<p>${escapeHtml(item.artifactNotes)}</p>` : ''}<a class="artifact-show-link" href="${showHref}"><strong>${escapeHtml(item.gig.artist)}</strong><span>${escapeHtml(item.gig.venue)} · ${escapeHtml(item.gig.city)}</span><time>${escapeHtml(formatGigDate(item.gig.date))}</time></a></div></article>`;
      }).join('');
      grid.querySelectorAll?.('.artifact-archive-image').forEach((button) => button.addEventListener('click', () => {
        const item = filtered.find((entry) => entry.id === button.closest('.artifact-archive-card').dataset.artifactId);
        if (item) openArtifact(item);
      }));
    }
    query?.addEventListener('input', render);
    type?.addEventListener('change', render);
    return { render };
  }

  return { labels, groupArtifactMedia, buildArtifactModel, createController };
}));
