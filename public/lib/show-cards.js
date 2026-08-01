(function exposeShowCards(root, factory) {
  const showCards = factory();
  if (typeof module === 'object' && module.exports) module.exports = showCards;
  else root.MasterListShowCards = showCards;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createShowCardsModule() {
  function quickRatingMarkup(field, label, value) {
    const rating = Number(value) || 0;
    return `<span class="quick-rating"><span class="rating-label">${label}</span>${[1, 2, 3, 4, 5].map((star) => `<button class="quick-star${star <= rating ? ' selected' : ''}" type="button" data-field="${field}" data-rating="${star}" aria-label="Rate ${label.toLowerCase()} ${star} out of 5">★</button>`).join('')}</span>`;
  }

  function mediaSectionState(label, media = []) {
    return { hidden: media.length === 0, label: media.length ? `${label} · ${media.length}` : label, count: media.length };
  }

  function localCardModel(gig) {
    const media = (gig.media || []).filter((item) => item.category !== 'artifact');
    const artifacts = (gig.media || []).filter((item) => item.category === 'artifact');
    return {
      id: `gig-${gig.id}`,
      showDate: gig.date || '',
      showRating: Number(gig.performanceRating || 0),
      showFavorite: gig.favorite ? '1' : '0',
      editHref: `/edit?id=${encodeURIComponent(gig.id)}`,
      detailHref: `/show?id=${encodeURIComponent(gig.id)}`,
      playbackHref: `/playback?id=${encodeURIComponent(gig.id)}`,
      artistHref: `/artist?name=${encodeURIComponent(gig.artist)}`,
      venueHref: `/venue?name=${encodeURIComponent(gig.venue)}&city=${encodeURIComponent(gig.city)}`,
      cityHref: `/city?name=${encodeURIComponent(gig.city)}`,
      notes: gig.performanceNotes || gig.notes || '',
      venueNotes: gig.venueNotes ? `Venue: ${gig.venueNotes}` : '',
      favoriteLabel: gig.favorite ? 'Remove from favourites' : 'Mark as favourite',
      media,
      artifacts,
      hasSetlist: Boolean(gig.songs?.length)
    };
  }

  function remoteCardModel(show) {
    const contributions = show.contributions || [];
    const favorite = contributions.some((entry) => entry.favorite);
    const mediaTotal = contributions.reduce((sum, entry) => sum + (entry.media?.length || 0), 0);
    return {
      id: `shared-${show.id}`,
      showDate: show.date || '',
      showRating: Math.max(0, ...contributions.map((entry) => Number(entry.performanceRating || 0))),
      showFavorite: favorite ? '1' : '0',
      favorite,
      mediaTotal,
      participants: contributions.map((entry) => entry.participantName || 'Peer'),
      hasSetlist: Boolean(show.songs?.length)
    };
  }

  function setupMediaSection(card, media = [], options = {}, renderMediaGallery) {
    const section = card.querySelector('.show-media-section');
    const gallery = section?.querySelector('.media-gallery');
    if (!section || !gallery) return;
    const state = mediaSectionState('Media', media);
    section.hidden = state.hidden;
    section.querySelector('summary span').textContent = state.label;
    if (!state.hidden) renderMediaGallery(gallery, media, options);
  }

  function setupArtifactSection(card, gig, renderMediaGallery) {
    const section = card.querySelector('.artifact-section');
    const gallery = card.querySelector('.artifact-gallery');
    if (!section || !gallery) return;
    const artifacts = (gig.media || []).filter((item) => item.category === 'artifact');
    const syncState = () => {
      const state = mediaSectionState('Artifacts', artifacts);
      section.hidden = state.hidden;
      section.querySelector('summary span').textContent = state.label;
    };
    syncState();
    renderMediaGallery(gallery, artifacts, {
      editable: true,
      allowCover: false,
      onDelete: (removed) => {
        const removedIds = new Set(removed.map((item) => item.id));
        gig.media = (gig.media || []).filter((item) => !removedIds.has(item.id));
        syncState();
      }
    });
  }

  function peerContributionMarkup(contributions, escapeHtml) {
    return contributions.map((entry) => `<div><strong>${escapeHtml(entry.participantName || 'Peer')}</strong><span>${entry.performanceRating ? `Performance ${entry.performanceRating}/5` : 'Performance unrated'} · ${entry.venueRating ? `Venue ${entry.venueRating}/5` : 'Venue unrated'} · ${entry.media?.length || 0} media</span>${entry.performanceNotes || entry.venueNotes ? `<small>${escapeHtml(entry.performanceNotes || entry.venueNotes)}</small>` : ''}</div>`).join('');
  }

  function createLocalCard(options) {
    const { document, template, gig, sharedShows = [], formatGigDate, escapeHtml, setupArtistVisual, renderAttendeeSummary, setupSetlist, setupExports, setupMedia, setupArtifacts, patchGig, deleteGig, onUpdate, onDelete, onError, confirm } = options;
    const card = template.content.cloneNode(true);
    const model = localCardModel(gig);
    const article = card.querySelector('.gig-card');
    article.id = model.id;
    article.dataset.showDate = model.showDate;
    article.dataset.showRating = String(model.showRating);
    article.dataset.showFavorite = model.showFavorite;
    setupArtistVisual(card, gig.artist);
    card.querySelector('.edit-gig').href = model.editHref;
    card.querySelector('.show-detail-link').href = model.detailHref;
    const play = card.querySelector('.play-gig');
    play.href = model.playbackHref;
    play.textContent = '▶';
    play.setAttribute('aria-label', 'Play set');
    card.querySelector('.gig-date').textContent = formatGigDate(gig.date);
    card.querySelector('h3').innerHTML = `<a class="artist-link" href="${model.artistHref}">${escapeHtml(gig.artist)}</a>`;
    card.querySelector('.gig-place').innerHTML = `<a class="venue-link" href="${model.venueHref}">${escapeHtml(gig.venue)}</a> · <a class="venue-link" href="${model.cityHref}">${escapeHtml(gig.city)}</a>`;
    card.querySelector('.gig-notes').textContent = model.notes;
    card.querySelector('.venue-notes').textContent = model.venueNotes;
    const summary = card.querySelector('.gig-summary');
    renderAttendeeSummary(summary, gig);
    const synced = sharedShows.find((show) => show.id === gig.sharedId || show.sourceGigId === gig.id);
    const peerContributions = (synced?.contributions || []).filter((entry) => entry.localGigId !== gig.id);
    if (peerContributions.length) {
      const details = document.createElement('details');
      details.className = 'peer-contribution-summary';
      details.innerHTML = `<summary>${peerContributions.length} peer contribution${peerContributions.length === 1 ? '' : 's'}</summary>${peerContributionMarkup(peerContributions, escapeHtml)}`;
      summary.append(details);
    }
    const ratings = card.querySelector('.gig-ratings');
    ratings.innerHTML = quickRatingMarkup('performanceRating', 'Performance', gig.performanceRating);
    ratings.querySelectorAll('.quick-star').forEach((button) => button.addEventListener('click', async () => {
      try { onUpdate(await patchGig(gig.id, { [button.dataset.field]: Number(button.dataset.rating) })); } catch (error) { onError(error); }
    }));
    const heart = card.querySelector('.heart-toggle');
    heart.textContent = gig.favorite ? '♥' : '♡';
    heart.classList.toggle('favorite', Boolean(gig.favorite));
    heart.setAttribute('aria-label', model.favoriteLabel);
    heart.addEventListener('click', async () => {
      try { onUpdate(await patchGig(gig.id, { favorite: !gig.favorite })); } catch (error) { onError(error); }
    });
    const exports = card.querySelector('.exports');
    exports.hidden = !model.hasSetlist;
    if (model.hasSetlist) {
      setupSetlist(card.querySelector('.setlist'), gig);
      setupExports(exports, gig);
    }
    const peerMedia = peerContributions.flatMap((entry) => entry.media || []);
    setupMedia(card, [...model.media, ...peerMedia.filter((item) => item.category !== 'artifact')], { songs: gig.songs || [] });
    setupArtifacts(card, { ...gig, media: [...(gig.media || []), ...peerMedia] });
    card.querySelector('.delete-gig').addEventListener('click', async () => {
      if (!confirm(`Remove ${gig.artist} at ${gig.venue}?`)) return;
      try { await deleteGig(gig.id); onDelete(gig); } catch (error) { onError(error); }
    });
    return card;
  }

  function createRemoteCard(options) {
    const { template, show, formatGigDate, escapeHtml, setupArtistVisual, setupSetlist, renderMediaGallery } = options;
    const card = template.content.cloneNode(true);
    const model = remoteCardModel(show);
    const article = card.querySelector('.gig-card');
    article.id = model.id;
    article.classList.add('remote-shared-gig');
    article.dataset.showDate = model.showDate;
    article.dataset.showRating = String(model.showRating);
    article.dataset.showFavorite = model.showFavorite;
    setupArtistVisual(card, show.artist);
    card.querySelectorAll('.artifact-section, .add-artifact-gig').forEach((element) => element.remove());
    card.querySelector('.gig-date').textContent = formatGigDate(show.date);
    card.querySelector('h3').innerHTML = `<a class="artist-link" href="/artist?name=${encodeURIComponent(show.artist)}">${escapeHtml(show.artist)}</a>`;
    card.querySelector('.gig-place').innerHTML = `<a class="venue-link" href="/venue?name=${encodeURIComponent(show.venue)}&city=${encodeURIComponent(show.city)}">${escapeHtml(show.venue)}</a> · <a class="venue-link" href="/city?name=${encodeURIComponent(show.city)}">${escapeHtml(show.city)}</a>`;
    card.querySelector('.gig-notes').textContent = `Shared by ${model.participants.join(', ')}`;
    card.querySelector('.venue-notes').textContent = `${model.mediaTotal} media item${model.mediaTotal === 1 ? '' : 's'} listed on peer instances`;
    card.querySelector('.gig-ratings').innerHTML = (show.contributions || []).map((entry) => `<span class="remote-rating"><b>${escapeHtml(entry.participantName || 'Peer')}</b> · ${entry.performanceRating ? `Performance ${entry.performanceRating}/5` : 'Performance unrated'} · ${entry.venueRating ? `Venue ${entry.venueRating}/5` : 'Venue unrated'}${entry.favorite ? ' · ♥ Favourite' : ''}</span>`).join('');
    const heart = card.querySelector('.heart-toggle');
    heart.textContent = model.favorite ? '♥' : '♡';
    heart.disabled = true;
    heart.title = 'Favourite status belongs to the contributing peer';
    card.querySelectorAll('.show-detail-link, .play-gig, .share-gig, .edit-gig, .delete-gig').forEach((control) => control.remove());
    if (model.hasSetlist) setupSetlist(card.querySelector('.setlist'), show, { fetchAlbums: false });
    const section = card.querySelector('.show-media-section');
    section.hidden = model.mediaTotal === 0;
    section.querySelector('summary span').textContent = mediaSectionState('Peer media', Array(model.mediaTotal).fill(null)).label;
    const contributions = card.querySelector('.media-gallery');
    if (model.mediaTotal && renderMediaGallery) renderMediaGallery(contributions, (show.contributions || []).flatMap((entry) => entry.media || []), { editable: false, songs: show.songs || [] });
    return card;
  }

  return { quickRatingMarkup, mediaSectionState, localCardModel, remoteCardModel, setupMediaSection, setupArtifactSection, createLocalCard, createRemoteCard };
}));
