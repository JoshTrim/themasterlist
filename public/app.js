const form = document.querySelector('#gig-form');
const message = document.querySelector('#form-message');
const results = document.querySelector('#search-results');
const gigList = document.querySelector('#gig-list');
const emptyState = document.querySelector('#empty-state');
const count = document.querySelector('#record-count');
const copyPlaylist = document.querySelector('#copy-playlist');
const showFilter = document.querySelector('#show-filter');
const yearFilter = document.querySelector('#year-filter');
const sortFilter = document.querySelector('#sort-filter');
const favouriteFilter = document.querySelector('#favourite-filter');
const archiveStats = document.querySelector('#archive-stats');
const loadMapButton = document.querySelector('#load-map');
const mapMessage = document.querySelector('#map-message');
const mapElement = document.querySelector('#gig-map');
const favoriteChoice = document.querySelector('#favorite-choice');
const mediaInput = document.querySelector('#media-input');
const youtubeMediaInput = document.querySelector('#youtube-media-input');
const editYoutubeMediaInput = document.querySelector('#edit-youtube-media-input');
const profileSelect = document.querySelector('#profile-select');
const sharedMessage = document.querySelector('#shared-message');
const sharedList = document.querySelector('#shared-list');
const authPanel = document.querySelector('#auth-panel');
const authMessage = document.querySelector('#auth-message');
const setupForm = document.querySelector('#setup-form');
const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const profileBar = document.querySelector('#profile-bar');
const inviteButton = document.querySelector('#create-invite');
const downloadBackupButton = document.querySelector('#download-backup');
const logoutButton = document.querySelector('#logout');
let selectedSetlist = null;
let gigs = [];
let integrations = {};
let profiles = [];
let sharedShows = [];
let activeProfileId = '';
let account = null;
let musicKitConfigured = false;
let venueMap;
let venueLayer;

const page = ({ '/': 'home', '/shows': 'shows', '/shared': 'shared', '/artist': 'artist', '/show': 'show', '/edit': 'edit', '/venue': 'venue', '/venue/edit': 'venue-edit', '/add': 'add', '/map': 'map', '/account': 'account' })[window.location.pathname] || 'home';
document.body.dataset.page = page;
const routeSections = {
  home: ['home-page'],
  add: ['add-page'],
  shows: ['shows-archive'],
  shared: ['shows-shared'],
  artist: ['artist-page'],
  show: ['show-page'],
  venue: ['venue-page'],
  'venue-edit': ['venue-edit-page'],
  edit: ['edit-page'],
  map: ['map-page'],
  account: ['shows-shared']
};
for (const id of ['home-page', 'add-page', 'shows-archive', 'artist-page', 'show-page', 'venue-page', 'venue-edit-page', 'edit-page', 'shows-shared', 'map-page']) {
  document.querySelector(`#${id}`).hidden = !routeSections[page].includes(id);
}
const chestButton = document.querySelector('#open-chest');
if (chestButton) chestButton.addEventListener('click', () => window.location.assign('/shows'));

const artistNameFromUrl = new URLSearchParams(window.location.search).get('name')?.trim() || '';
const artistHeading = document.querySelector('#artist-heading');
const artistDescription = document.querySelector('#artist-description');
const artistBio = document.querySelector('#artist-bio');
const artistImage = document.querySelector('#artist-image');
const artistSource = document.querySelector('#artist-source');
const artistShows = document.querySelector('#artist-shows');
const artistEmpty = document.querySelector('#artist-empty');
const editForm = document.querySelector('#edit-form');
const editMessage = document.querySelector('#edit-message');
const editMediaInput = document.querySelector('#edit-media-input');
const editGallery = document.querySelector('#edit-gallery');
const editSetlistTracks = document.querySelector('#edit-setlist-tracks');
const addEditTrack = document.querySelector('#add-edit-track');
const editGigId = new URLSearchParams(window.location.search).get('id') || '';
const mediaLightbox = document.querySelector('#media-lightbox');
const mediaLightboxImage = document.querySelector('#media-lightbox-image');
const mediaLightboxVideo = document.querySelector('#media-lightbox-video');
const mediaLightboxCaption = document.querySelector('#media-lightbox-caption');
const mediaLightboxClose = document.querySelector('#media-lightbox-close');
const showDetailId = new URLSearchParams(window.location.search).get('id') || '';
const showDetailHeading = document.querySelector('#show-heading');
const showDetailPlace = document.querySelector('#show-detail-place');
const showDetailDate = document.querySelector('#show-detail-date');
const showDetailNotes = document.querySelector('#show-detail-notes');
const showDetailVenueNotes = document.querySelector('#show-detail-venue-notes');
const showDetailRatings = document.querySelector('#show-detail-ratings');
const showDetailGallery = document.querySelector('#show-detail-gallery');
const showDetailNoMedia = document.querySelector('#show-detail-no-media');
const showDetailSetlist = document.querySelector('#show-detail-setlist');
const findYouTubeSet = document.querySelector('#find-youtube-set');
const youtubeResults = document.querySelector('#youtube-results');
const youtubeSearchMessage = document.querySelector('#youtube-search-message');
const playWholeSet = document.querySelector('#play-whole-set');
const setPlayer = document.querySelector('#set-player');
const setPlayerTitle = document.querySelector('#set-player-title');
const setPlayerStage = document.querySelector('#set-player-stage');
const setPlayerNext = document.querySelector('#set-player-next');
const setPlayerFullscreen = document.querySelector('#set-player-fullscreen');
const setPlayerPrev = document.createElement('button');
setPlayerPrev.type = 'button'; setPlayerPrev.className = 'button button-secondary'; setPlayerPrev.textContent = '← Previous';
const setPlayerControls = document.createElement('div'); setPlayerControls.className = 'set-player-controls';
if (setPlayerNext?.parentNode) { setPlayerNext.parentNode.insertBefore(setPlayerControls, setPlayerNext); setPlayerControls.append(setPlayerPrev); if (setPlayerFullscreen) setPlayerControls.append(setPlayerFullscreen); setPlayerControls.append(setPlayerNext); }
const setPlayerStatus = document.querySelector('#set-player-status');
const setPlayerProgress = document.querySelector('#set-player-progress');
const setPlayerMarkers = document.querySelector('#set-player-markers');
const setPlayerElapsed = document.querySelector('#set-player-elapsed');
const setPlayerTotal = document.querySelector('#set-player-total');
let setQueue = [];
let setQueueIndex = 0;
let youtubeApiPromise;
let activeYoutubePlayer;
let activeYoutubeVideoId = '';
const formatPlaybackTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function renderSetTimeline(gig) {
  setPlayerMarkers.innerHTML = setQueue.map((entry, index) => `<span class="set-marker" style="left:${((index + .5) / setQueue.length) * 100}%" title="${escapeHtml(gig.songs[entry.songIndex].title)}">${index + 1}</span>`).join('');
  setPlayerProgress.style.width = `${(setQueueIndex / Math.max(1, setQueue.length)) * 100}%`;
  setPlayerElapsed.textContent = formatPlaybackTime(setQueueIndex * 240);
  setPlayerTotal.textContent = `~${formatPlaybackTime(setQueue.length * 240)}`;
}
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApiPromise) youtubeApiPromise = new Promise((resolve) => { const previous = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); }; const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(script); });
  return youtubeApiPromise;
}
const showEditLink = document.querySelector('#show-edit-link');
const venueNameFromUrl = new URLSearchParams(window.location.search).get('name')?.trim() || '';
const venueCityFromUrl = new URLSearchParams(window.location.search).get('city')?.trim() || '';
const venueHeading = document.querySelector('#venue-heading');
const venuePageCity = document.querySelector('#venue-page-city');
const venueStats = document.querySelector('#venue-stats');
const venueShows = document.querySelector('#venue-shows');
const venueEmpty = document.querySelector('#venue-empty');
const venueDescription = document.querySelector('#venue-description');
const venueBio = document.querySelector('#venue-bio');
const venueImage = document.querySelector('#venue-image');
const venueSource = document.querySelector('#venue-source');
const venueEditLink = document.querySelector('#venue-edit-link');
const venueEditForm = document.querySelector('#venue-edit-form');
const venueEditMessage = document.querySelector('#venue-edit-message');

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const formatGigDate = (date, options = { month: 'short', day: 'numeric', year: 'numeric' }) => date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options) : 'Date unknown';

function populateShowAutofill() {
  const values = {
    'artist-options': [...new Set(gigs.map((gig) => gig.artist).filter(Boolean))].sort(),
    'venue-options': [...new Set(gigs.map((gig) => gig.venue).filter(Boolean))].sort(),
    'city-options': [...new Set(gigs.map((gig) => gig.city).filter(Boolean))].sort()
  };
  Object.entries(values).forEach(([id, options]) => { const list = document.querySelector(`#${id}`); if (list) list.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}"></option>`).join(''); });
}

function setRatingPicker(picker, value = '') {
  const rating = Number(value) || 0;
  const choice = picker.closest('.rating-choice');
  choice.querySelector('input').value = rating || '';
  picker.querySelectorAll('button').forEach((button) => {
    const selected = Number(button.value) <= rating;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function resetReviewForm() {
  document.querySelectorAll('.star-picker').forEach((picker) => setRatingPicker(picker));
  setFavoriteChoice(false);
}

function setFavoriteChoice(favorite) {
  favoriteChoice.setAttribute('aria-pressed', String(favorite));
  favoriteChoice.querySelector('span').textContent = favorite ? '♥' : '♡';
  form.elements.favorite.value = String(favorite);
}

document.querySelectorAll('.star-picker').forEach((picker) => {
  picker.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => setRatingPicker(picker, button.value)));
});

favoriteChoice.addEventListener('click', () => setFavoriteChoice(favoriteChoice.getAttribute('aria-pressed') !== 'true'));

function formValues() {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Something went wrong.');
  return payload;
}

async function fileAsBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function uploadGigMedia(gigId, files) {
  for (const file of files) {
    const response = await fetch(`/api/gigs/${gigId}/media`, { method: 'POST', headers: { 'Content-Type': file.type, 'X-Media-Filename': encodeURIComponent(file.name), 'X-Media-Caption': encodeURIComponent(file.name) }, body: file });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Media upload failed.');
  }
}

async function addYouTubeMedia(gigId, input) {
  const externalUrl = input?.value.trim();
  if (!externalUrl) return;
  await fetchJson(`/api/gigs/${gigId}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ externalUrl, caption: 'YouTube video' }) });
  input.value = '';
}

function youtubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const id = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&autoplay=1&origin=${encodeURIComponent(window.location.origin)}` : url;
  } catch { return url; }
}

function openMediaLightbox(item) {
  mediaLightbox.hidden = false;
  mediaLightboxImage.hidden = !item.mimeType.startsWith('image/');
  mediaLightboxVideo.hidden = !item.mimeType.startsWith('video/');
  if (mediaLightboxImage.hidden) mediaLightboxVideo.src = item.url; else mediaLightboxImage.src = item.url;
  mediaLightboxImage.style.transform = `rotate(${item.rotation || 0}deg)`;
  mediaLightboxVideo.style.transform = 'none';
  mediaLightboxCaption.textContent = item.caption || item.filename || '';
}

mediaLightboxClose.addEventListener('click', () => { mediaLightbox.hidden = true; mediaLightboxVideo.pause(); });
mediaLightbox.addEventListener('click', (event) => { if (event.target === mediaLightbox) mediaLightboxClose.click(); });

function renderMediaGallery(container, media = [], { editable = false, songs = [] } = {}) {
  container.replaceChildren();
  if (!media.length) return;
  container.innerHTML = media.map((item, index) => `<figure class="media-item${item.isCover ? ' is-cover' : ''}" data-media-id="${item.id}">${item.mimeType === 'video/youtube' ? `<iframe src="${youtubeEmbedUrl(item.url)}" title="${escapeHtml(item.caption || 'YouTube video')}" loading="lazy" allowfullscreen></iframe>` : item.mimeType.startsWith('video/') ? `<video src="${item.url}" controls preload="metadata"></video>` : `<button class="media-open" type="button"><img src="${item.url}" alt="${escapeHtml(item.caption || 'Photo from the show')}" loading="lazy" style="transform:rotate(${item.rotation || 0}deg)" /></button>`}<figcaption>${escapeHtml(item.caption || item.filename || '')}</figcaption>${editable ? `<div class="media-actions"><button type="button" class="media-menu-toggle" aria-expanded="false">⋮ Options</button><div class="media-action-menu" hidden>${songs.length ? `<label class="media-song-label">Setlist track<select class="media-song-select"><option value="">Unassigned</option>${songs.map((song, songIndex) => `<option value="${songIndex}" ${item.songIndex === songIndex ? 'selected' : ''}>${songIndex + 1}. ${escapeHtml(song.title)}</option>`).join('')}</select></label>` : ''}<button type="button" class="media-caption">Caption</button><button type="button" class="media-cover">${item.isCover ? 'Cover photo' : 'Make cover'}</button>${item.mimeType.startsWith('video/') && item.mimeType !== 'video/youtube' ? '<button type="button" class="media-rotate media-rotate-cw">↻ Clockwise</button><button type="button" class="media-rotate media-rotate-ccw">↺ Counter-clockwise</button>' : ''}<button type="button" class="media-delete">Delete</button><button type="button" class="media-up" ${index === 0 ? 'disabled' : ''}>↑ Move earlier</button><button type="button" class="media-down" ${index === media.length - 1 ? 'disabled' : ''}>↓ Move later</button></div></div>` : ''}</figure>`).join('');
  container.querySelectorAll('.media-open').forEach((button, index) => button.addEventListener('click', () => openMediaLightbox(media[index])));
  if (editable) {
    container.querySelectorAll('.media-song-select').forEach((select) => select.addEventListener('change', async () => {
      const item = media.find((entry) => entry.id === select.closest('.media-item').dataset.mediaId);
      const value = select.value === '' ? null : Number(select.value);
      await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songIndex: value }) });
      item.songIndex = value;
    }));
    container.querySelectorAll('.media-menu-toggle').forEach((button) => button.addEventListener('click', () => {
      const menu = button.nextElementSibling;
      const open = menu.hidden;
      container.querySelectorAll('.media-action-menu').forEach((entry) => { entry.hidden = true; });
      container.querySelectorAll('.media-menu-toggle').forEach((entry) => entry.setAttribute('aria-expanded', 'false'));
      menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }));
    container.querySelectorAll('.media-caption').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      const caption = prompt('Caption this memory', item.caption || item.filename || '');
      if (caption === null) return;
      await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caption }) });
      item.caption = caption; renderMediaGallery(container, media, { editable: true, songs });
    }));
    container.querySelectorAll('.media-cover').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isCover: true }) });
      media.forEach((entry) => { entry.isCover = entry.id === item.id; }); renderMediaGallery(container, media, { editable: true, songs });
    }));
    container.querySelectorAll('.media-delete').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      if (!confirm('Delete this memory?')) return;
      await fetchJson(`/api/media/${item.id}`, { method: 'DELETE' });
      media.splice(media.indexOf(item), 1); renderMediaGallery(container, media, { editable: true, songs });
    }));
    container.querySelectorAll('.media-rotate').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      if (item.mimeType.startsWith('video/')) {
        button.disabled = true; button.textContent = 'Rotating…';
        const direction = button.classList.contains('media-rotate-ccw') ? 'counterclockwise' : 'clockwise';
        await fetchJson(`/api/media/${item.id}/rotate?direction=${direction}`, { method: 'POST' });
      } else {
        item.rotation = ((item.rotation || 0) + 90) % 360;
        await fetchJson(`/api/media/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotation: item.rotation }) });
      }
      renderMediaGallery(container, media, { editable: true, songs });
    }));
    container.querySelectorAll('.media-up, .media-down').forEach((button) => button.addEventListener('click', async () => {
      const item = media.find((entry) => entry.id === button.closest('.media-item').dataset.mediaId);
      const index = media.indexOf(item); const nextIndex = button.classList.contains('media-up') ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= media.length) return;
      [media[index], media[nextIndex]] = [media[nextIndex], media[index]];
      await Promise.all(media.map((entry, order) => fetchJson(`/api/media/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sortOrder: order }) })));
      renderMediaGallery(container, media, { editable: true, songs });
    }));
  }
}

function setSharedMessage(text, isError = false) {
  sharedMessage.textContent = text;
  sharedMessage.classList.toggle('error', isError);
}

function activeProfile() {
  return profiles.find((profile) => profile.id === activeProfileId);
}

function renderArtistShows(records) {
  artistShows.replaceChildren();
  artistEmpty.hidden = records.length > 0;
  for (const gig of records) {
    const card = document.querySelector('#gig-template').content.cloneNode(true);
    card.querySelector('.edit-gig').href = `/edit?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.show-detail-link').href = `/show?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.gig-date').textContent = formatGigDate(gig.date, { day: '2-digit', month: 'short', year: 'numeric' });
    card.querySelector('.gig-summary h3').textContent = gig.artist;
    card.querySelector('.gig-place').textContent = `${gig.venue} · ${gig.city}`;
    card.querySelector('.gig-notes').textContent = gig.performanceNotes || gig.notes || '';
    card.querySelector('.venue-notes').textContent = gig.venueNotes || '';
    card.querySelector('.song-total').textContent = gig.songs?.length ? `${gig.songs.length} songs` : 'No setlist';
    const ratings = card.querySelector('.gig-ratings');
    ratings.innerHTML = `${gig.performanceRating ? `<span>Performance ${gig.performanceRating} / 5</span>` : ''}${gig.venueRating ? `<span>Venue ${gig.venueRating} / 5</span>` : ''}`;
    const setlist = card.querySelector('.setlist');
    if (gig.songs?.length) setlist.innerHTML = `<ol>${gig.songs.map((song) => `<li>${escapeHtml(song.title)}${song.encore ? ' <b>Encore</b>' : ''}</li>`).join('')}</ol>`;
    renderMediaGallery(card.querySelector('.media-gallery'), gig.media);
    artistShows.append(card);
  }
}

async function renderArtistPage() {
  if (page !== 'artist') return;
  if (!artistNameFromUrl) {
    artistHeading.textContent = 'Artist not found';
    artistDescription.textContent = 'Choose an artist from your shows archive.';
    return;
  }
  artistHeading.textContent = artistNameFromUrl;
  renderArtistShows(gigs.filter((gig) => gig.artist.toLowerCase() === artistNameFromUrl.toLowerCase()));
  try {
    const info = await fetchJson(`/api/artists?name=${encodeURIComponent(artistNameFromUrl)}`);
    artistHeading.textContent = info.title || artistNameFromUrl;
    artistDescription.textContent = info.description || '';
    artistBio.textContent = info.bio || 'No biography was found for this artist yet.';
    artistImage.hidden = !info.image;
    if (info.image) { artistImage.src = info.image; artistImage.alt = `${info.title || artistNameFromUrl} portrait`; }
    artistSource.hidden = !info.source;
    if (info.source) artistSource.href = info.source;
  } catch (error) {
    artistDescription.textContent = 'Artist information could not be loaded right now.';
    artistBio.textContent = error.message;
  }
}

async function renderVenuePage() {
  if (page !== 'venue') return;
  const records = gigs.filter((gig) => gig.venue.toLowerCase() === venueNameFromUrl.toLowerCase() && (!venueCityFromUrl || gig.city.toLowerCase() === venueCityFromUrl.toLowerCase()));
  venueHeading.textContent = venueNameFromUrl || 'Venue not found';
  venuePageCity.textContent = venueCityFromUrl;
  venueStats.innerHTML = records.length ? `<span>${records.length} show${records.length === 1 ? '' : 's'}</span><span>${new Set(records.map((gig) => gig.artist)).size} artists</span><span>${records.filter((gig) => gig.favorite).length} favourites</span>` : '';
  venueEmpty.hidden = Boolean(records.length);
  venueShows.replaceChildren();
  records.forEach((gig) => {
    const card = document.querySelector('#gig-template').content.cloneNode(true);
    card.querySelector('.gig-date').textContent = formatGigDate(gig.date, { day: '2-digit', month: 'short', year: 'numeric' });
    card.querySelector('.gig-summary h3').innerHTML = `<a class="artist-link" href="/artist?name=${encodeURIComponent(gig.artist)}">${escapeHtml(gig.artist)}</a>`;
    card.querySelector('.gig-place').textContent = `${gig.venue} · ${gig.city}`;
    card.querySelector('.gig-notes').textContent = gig.performanceNotes || gig.notes || '';
    card.querySelector('.song-total').textContent = gig.songs?.length ? `${gig.songs.length} songs` : 'No setlist';
    renderMediaGallery(card.querySelector('.media-gallery'), gig.media);
    venueShows.append(card);
  });
  if (!venueNameFromUrl) return;
  try {
    const info = await fetchJson(`/api/venues?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`);
    venueHeading.textContent = info.title || venueNameFromUrl;
    venueDescription.textContent = info.description || '';
    venueBio.textContent = info.bio || 'No venue biography was found yet.';
    venueImage.hidden = !info.image;
    if (info.image) { venueImage.src = info.image; venueImage.alt = `${info.title || venueNameFromUrl} photo`; }
    venueSource.hidden = !info.source;
    if (info.source) venueSource.href = info.source;
    venueEditLink.href = `/venue/edit?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`;
  } catch (error) { venueBio.textContent = 'Venue information could not be loaded right now.'; }
}

async function renderVenueEditPage() {
  if (page !== 'venue-edit') return;
  const info = await fetchJson(`/api/venues?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`);
  document.querySelector('#venue-edit-heading').textContent = `Edit ${info.title || venueNameFromUrl}`;
  document.querySelector('#venue-edit-back').href = `/venue?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`;
  venueEditForm.elements.title.value = info.title || '';
  venueEditForm.elements.description.value = info.description || '';
  venueEditForm.elements.bio.value = info.bio || '';
  venueEditForm.elements.image.value = info.image || '';
  venueEditForm.elements.source.value = info.source || '';
}

venueEditForm.addEventListener('submit', async (event) => {
  if (page !== 'venue-edit') return;
  event.preventDefault();
  try {
    const info = await fetchJson(`/api/venues?name=${encodeURIComponent(venueNameFromUrl)}&city=${encodeURIComponent(venueCityFromUrl)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(venueEditForm).entries())) });
    venueHeading.textContent = info.title; venueDescription.textContent = info.description; venueBio.textContent = info.bio;
    venueImage.hidden = !info.image; if (info.image) { venueImage.src = info.image; venueImage.alt = `${info.title} photo`; }
    venueSource.hidden = !info.source; if (info.source) venueSource.href = info.source;
    venueEditMessage.textContent = 'Venue info saved.'; venueEditMessage.classList.remove('error');
  } catch (error) { venueEditMessage.textContent = error.message; venueEditMessage.classList.add('error'); }
});

function renderEditPage() {
  if (page !== 'edit') return;
  const gig = gigs.find((entry) => entry.id === editGigId);
  if (!gig) { editMessage.textContent = 'Show not found.'; editMessage.classList.add('error'); return; }
  editForm.elements.artist.value = gig.artist;
  editForm.elements.date.value = gig.date;
  editForm.elements.venue.value = gig.venue;
  editForm.elements.city.value = gig.city;
  const tracks = [...(gig.songs || [])];
  const renderTracks = () => {
    editSetlistTracks.innerHTML = tracks.map((song, index) => `<div class="edit-track" data-track-index="${index}"><span class="edit-track-number">${index + 1}</span><input class="edit-track-title" value="${escapeHtml(song.title || '')}" placeholder="Track title" /><input class="edit-track-artist" value="${escapeHtml(song.artist || '')}" placeholder="Artist (optional)" /><button class="icon-button edit-track-remove" type="button" aria-label="Remove track">×</button></div>`).join('');
    editSetlistTracks.querySelectorAll('.edit-track-remove').forEach((button) => button.addEventListener('click', () => { tracks.splice(Number(button.closest('.edit-track').dataset.trackIndex), 1); renderTracks(); }));
  };
  renderTracks();
  addEditTrack.onclick = () => { tracks.push({ title: '', artist: gig.artist }); renderTracks(); editSetlistTracks.lastElementChild?.querySelector('.edit-track-title')?.focus(); };
  renderMediaGallery(editGallery, gig.media, { editable: true, songs: gig.songs || [] });
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const update = Object.fromEntries(new FormData(editForm).entries());
      update.songs = [...editSetlistTracks.querySelectorAll('.edit-track')].map((row) => ({ title: row.querySelector('.edit-track-title').value, artist: row.querySelector('.edit-track-artist').value, encore: false }));
      const saved = await fetchJson(`/api/gigs/${gig.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
      const files = [...(editMediaInput?.files || [])];
      if (files.length) await uploadGigMedia(gig.id, files);
      await addYouTubeMedia(gig.id, editYoutubeMediaInput);
      gigs = gigs.map((entry) => entry.id === gig.id ? { ...entry, ...saved } : entry);
      editMessage.textContent = files.length ? 'Show and media saved.' : 'Show saved.';
      editMessage.classList.remove('error');
      editMediaInput.value = '';
      const refreshed = await fetchJson(`/api/gigs/${gig.id}/media`);
      renderMediaGallery(editGallery, refreshed, { editable: true, songs: gig.songs || [] });
      renderGigs();
    } catch (error) { editMessage.textContent = error.message; editMessage.classList.add('error'); }
  });
}

function renderShowPage() {
  if (page !== 'show') return;
  const gig = gigs.find((entry) => entry.id === showDetailId);
  if (!gig) { showDetailHeading.textContent = 'Show not found'; return; }
  showDetailHeading.textContent = gig.artist;
  showDetailPlace.innerHTML = `<a class="venue-link" href="/venue?name=${encodeURIComponent(gig.venue)}&city=${encodeURIComponent(gig.city)}">${escapeHtml(gig.venue)}</a> · ${escapeHtml(gig.city)}`;
  showDetailDate.textContent = formatGigDate(gig.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  showDetailNotes.textContent = gig.performanceNotes || gig.notes || 'No performance notes yet.';
  showDetailVenueNotes.textContent = gig.venueNotes ? `Venue: ${gig.venueNotes}` : 'No venue notes yet.';
  showDetailRatings.innerHTML = `${gig.performanceRating ? `<span>Performance ${gig.performanceRating} / 5</span>` : '<span>Performance unrated</span>'}${gig.venueRating ? `<span>Venue ${gig.venueRating} / 5</span>` : '<span>Venue unrated</span>'}`;
  showDetailSetlist.innerHTML = gig.songs?.length ? `<ol>${gig.songs.map((song) => `<li>${escapeHtml(song.title)}${song.artist && song.artist !== gig.artist ? ` <span>— ${escapeHtml(song.artist)}</span>` : ''}${song.encore ? ' <b>Encore</b>' : ''}</li>`).join('')}</ol>` : '<p>No setlist attached.</p>';
  showEditLink.href = `/edit?id=${encodeURIComponent(gig.id)}`;
  showDetailNoMedia.hidden = Boolean(gig.media?.length);
  // Keep the gallery manageable from the show page too, including YouTube videos
  // attached by the setlist search.
  renderMediaGallery(showDetailGallery, gig.media, { editable: true, songs: gig.songs || [] });
}

function playSetTrack() {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  const entry = setQueue[setQueueIndex];
  if (!gig || !entry) { setPlayerStatus.textContent = 'End of available set.'; return; }
  const song = gig.songs[entry.songIndex];
  setPlayer.hidden = false;
  setPlayerTitle.textContent = `${entry.songIndex + 1}. ${song.title}`;
  renderSetTimeline(gig);
  if (entry.media.mimeType === 'video/youtube' && activeYoutubePlayer) {
    const parsed = new URL(entry.media.url);
    const videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop();
    activeYoutubeVideoId = videoId;
    activeYoutubePlayer.loadVideoById(videoId);
    return;
  }
  const next = setQueue[setQueueIndex + 1];
  const currentMarkup = entry.media.mimeType === 'video/youtube'
    ? `<iframe src="${youtubeEmbedUrl(entry.media.url)}" title="${escapeHtml(song.title)}" allowfullscreen></iframe>`
    : `<video class="set-player-current" src="${entry.media.url}" controls autoplay playsinline></video>`;
  const preloadMarkup = next?.media.mimeType === 'video/youtube'
    ? `<iframe class="set-player-preload" src="${youtubeEmbedUrl(next.media.url)}" title="Preloaded next track" aria-hidden="true"></iframe>`
    : next ? `<video class="set-player-preload" src="${next.media.url}" preload="auto" muted playsinline></video>` : '';
  setPlayerStage.innerHTML = `${currentMarkup}${preloadMarkup}`;
  setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length}`;
  const video = setPlayerStage.querySelector('video');
  if (video) video.play().catch(() => { setPlayerStatus.textContent = `${setQueueIndex + 1} of ${setQueue.length} · Press play to continue`; });
  if (video) video.addEventListener('ended', () => {
    const nextVideo = setPlayerStage.querySelector('.set-player-preload');
    if (nextVideo?.tagName === 'VIDEO' && next?.media.mimeType !== 'video/youtube') {
      nextVideo.classList.add('set-player-fading-in');
      video.classList.add('set-player-fading-out');
      nextVideo.muted = false;
      nextVideo.play().catch(() => {});
      setTimeout(() => { setQueueIndex += 1; playSetTrack(); }, 650);
    } else { setQueueIndex += 1; playSetTrack(); }
  });
  const youtubeFrame = setPlayerStage.querySelector('iframe:not(.set-player-preload)');
  if (youtubeFrame) {
    youtubeFrame.id = `set-player-youtube-${Date.now()}`;
    loadYouTubeApi().then((YT) => {
      activeYoutubePlayer = new YT.Player(youtubeFrame.id, { events: { onReady: (event) => event.target.playVideo(), onStateChange: (event) => { if (event.data === YT.PlayerState.ENDED) { setQueueIndex += 1; playSetTrack(); } } } });
    }).catch(() => {});
  }
}

playWholeSet?.addEventListener('click', () => {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  setQueue = (gig?.media || []).filter((media) => Number.isInteger(media.songIndex) && gig.songs[media.songIndex]).sort((a, b) => a.songIndex - b.songIndex).map((media) => ({ media, songIndex: media.songIndex }));
  setQueueIndex = 0;
  if (!setQueue.length) { setPlayer.hidden = false; setPlayerStatus.textContent = 'Assign media to setlist tracks first.'; return; }
  playSetTrack();
});
setPlayerNext?.addEventListener('click', () => { setQueueIndex += 1; playSetTrack(); });
setPlayerPrev.addEventListener('click', () => { if (setQueueIndex > 0) { setQueueIndex -= 1; playSetTrack(); } });
setPlayerFullscreen?.addEventListener('click', async () => {
  if (!document.fullscreenElement) await setPlayer.requestFullscreen?.();
  else await document.exitFullscreen?.();
});

findYouTubeSet.addEventListener('click', async () => {
  const gig = gigs.find((entry) => entry.id === showDetailId);
  if (!gig?.songs?.length) { youtubeSearchMessage.textContent = 'Add a setlist before searching YouTube.'; return; }
  findYouTubeSet.disabled = true; findYouTubeSet.textContent = 'Searching YouTube…'; youtubeSearchMessage.textContent = ''; youtubeResults.replaceChildren();
  try {
    const payload = await fetchJson(`/api/gigs/${gig.id}/youtube-search`, { method: 'POST' });
    youtubeResults.innerHTML = payload.matches.map((match) => `<article class="youtube-match" data-song-index="${match.index}"><h3>${escapeHtml(match.title)}</h3><div class="youtube-match-options">${match.results.map((result) => `<div class="youtube-result"><img src="${escapeHtml(result.thumbnail)}" alt="" /><div><p>${escapeHtml(result.title)}</p><small>${escapeHtml(result.channel)}</small><button type="button" data-youtube-url="https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}">Add to other media</button></div></div>`).join('') || '<p>No matching videos found.</p>'}</div></article>`).join('');
    youtubeResults.querySelectorAll('[data-youtube-url]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = 'Adding…';
      const match = button.closest('.youtube-match');
      const songIndex = Number(match?.dataset.songIndex);
      const added = await fetchJson(`/api/gigs/${gig.id}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ externalUrl: button.dataset.youtubeUrl, caption: button.closest('.youtube-result').querySelector('p').textContent, songIndex: Number.isInteger(songIndex) ? songIndex : null }) });
      gig.media = [...(gig.media || []), added]; button.textContent = 'Added'; renderMediaGallery(document.querySelector('#show-detail-gallery'), gig.media, { editable: true, songs: gig.songs || [] });
    }));
  } catch (error) { youtubeSearchMessage.textContent = error.message; youtubeSearchMessage.classList.add('error'); }
  finally { findYouTubeSet.disabled = false; findYouTubeSet.textContent = 'Find YouTube videos'; }
});

function renderProfiles() {
  if (!profiles.some((profile) => profile.id === activeProfileId)) activeProfileId = account?.id || '';
  profileSelect.replaceChildren(new Option('Choose a profile…', ''));
  for (const profile of profiles) profileSelect.add(new Option(profile.name, profile.id));
  profileSelect.value = activeProfileId;
}

function renderSharedShows() {
  sharedList.replaceChildren();
  const profile = activeProfile();
  if (!profiles.length) {
    setSharedMessage('Add yourself, then add friends who use this shared instance.');
    return;
  }
  if (!profile) {
    setSharedMessage('Choose your profile to create or review shared shows.');
    return;
  }
  setSharedMessage(sharedShows.length ? `${sharedShows.length} shared show${sharedShows.length === 1 ? '' : 's'} in this instance.` : 'Share a gig from your archive to start a collaborative record.');
  for (const show of sharedShows) {
    const card = document.querySelector('#shared-template').content.cloneNode(true);
    const date = formatGigDate(show.date);
    card.querySelector('.shared-date').textContent = date;
    card.querySelector('h3').textContent = show.artist;
    card.querySelector('.shared-place').textContent = `${show.venue} · ${show.city}`;
    card.querySelector('.shared-song-count').textContent = show.songs?.length ? `${show.songs.length} songs` : 'No setlist yet';
    card.querySelector('.shared-people').innerHTML = `<span>Went with</span>${show.attendees.map((person) => `<b>${escapeHtml(person.name)}</b>`).join('')}`;
    const attendeeSelect = card.querySelector('.attendee-select');
    const attendeeIds = new Set(show.attendees.map((person) => person.id));
    for (const person of profiles.filter((candidate) => !attendeeIds.has(candidate.id))) attendeeSelect.add(new Option(person.name, person.id));
    const addAttendee = card.querySelector('.add-attendee');
    if (!attendeeSelect.options.length) addAttendee.hidden = true;
    else card.querySelector('.add-attendee').addEventListener('click', async () => {
      try {
        await fetchJson(`/api/shared/shows/${show.id}/attendees`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: attendeeSelect.value }) });
        await refreshCollaboration();
      } catch (error) { setSharedMessage(error.message, true); }
    });

    const review = show.reviews.find((entry) => entry.profileId === profile.id) || {};
    const reviewSection = card.querySelector('.shared-review');
    if (!attendeeIds.has(profile.id)) {
      reviewSection.hidden = true;
    } else {
      reviewSection.querySelector('.shared-notes').value = review.notes || '';
      reviewSection.querySelectorAll('.shared-stars').forEach((stars) => {
        const field = stars.dataset.field;
        stars.dataset.value = review[field] || '';
        renderSharedStars(stars);
      });
      card.querySelector('.save-shared-review').addEventListener('click', async () => {
        try {
          const data = { profileId: profile.id, notes: reviewSection.querySelector('.shared-notes').value };
          reviewSection.querySelectorAll('.shared-stars').forEach((stars) => { data[stars.dataset.field] = stars.dataset.value || null; });
          await fetchJson(`/api/shared/shows/${show.id}/reviews`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
          await refreshCollaboration();
        } catch (error) { setSharedMessage(error.message, true); }
      });
    }
    sharedList.append(card);
  }
}

function renderSharedStars(stars) {
  const rating = Number(stars.dataset.value) || 0;
  stars.innerHTML = [1, 2, 3, 4, 5].map((value) => `<button type="button" value="${value}" class="${value <= rating ? 'selected' : ''}" aria-label="${value} stars">★</button>`).join('');
  stars.closest('.shared-rating-row').querySelector('.shared-rating-number').textContent = rating ? `${rating} / 5` : 'Unrated';
  stars.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    stars.dataset.value = button.value;
    renderSharedStars(stars);
  }));
}

async function refreshCollaboration() {
  const [profileData, showData] = await Promise.all([fetchJson('/api/profiles'), fetchJson('/api/shared/shows')]);
  profiles = profileData;
  sharedShows = showData;
  renderProfiles();
  renderSharedShows();
}

function showAuth(status) {
  authPanel.hidden = false;
  profileBar.hidden = true;
  setupForm.hidden = Boolean(status.configured);
  loginForm.hidden = !status.configured;
  const invite = new URLSearchParams(window.location.search).get('invite');
  registerForm.hidden = !invite;
  if (invite) loginForm.hidden = true;
  authMessage.textContent = invite ? 'Create your account to join this shared instance.' : status.configured ? 'Sign in to your account.' : 'Create the owner account for this shared instance.';
}

async function submitAuth(form, endpoint, extra = {}) {
  try {
    const payload = { ...Object.fromEntries(new FormData(form).entries()), ...extra };
    const signedIn = await fetchJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    account = signedIn;
    activeProfileId = account.id;
    await initializeApp();
  } catch (error) { authMessage.textContent = error.message; authMessage.classList.add('error'); }
}

setupForm.addEventListener('submit', (event) => { event.preventDefault(); submitAuth(setupForm, '/api/auth/setup'); });
loginForm.addEventListener('submit', (event) => { event.preventDefault(); submitAuth(loginForm, '/api/auth/login'); });
registerForm.addEventListener('submit', (event) => { event.preventDefault(); submitAuth(registerForm, '/api/auth/register', { inviteToken: new URLSearchParams(window.location.search).get('invite') }); });
logoutButton.addEventListener('click', async () => { await fetchJson('/api/auth/logout', { method: 'POST' }); account = null; activeProfileId = ''; showAuth({ configured: true }); });
inviteButton.addEventListener('click', async () => {
  try {
    const invite = await fetchJson('/api/auth/invites', { method: 'POST' });
    await navigator.clipboard.writeText(invite.inviteUrl);
    setSharedMessage('Invite link copied. It expires in seven days.');
  } catch (error) { setSharedMessage(error.message, true); }
});
downloadBackupButton.addEventListener('click', async () => {
  try {
    downloadBackupButton.disabled = true;
    const backup = await fetchJson('/api/backup');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
    link.download = `the-master-list-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) { setSharedMessage(error.message, true); } finally { downloadBackupButton.disabled = false; }
});

document.querySelector('#find-setlist').addEventListener('click', async () => {
  const gig = formValues();
  if (!gig.artist || !gig.city) {
    setMessage('Add an artist and city before searching.', true);
    return;
  }
  setMessage('Searching setlist.fm…');
  results.hidden = true;
  try {
    const params = new URLSearchParams({ artistName: gig.artist, cityName: gig.city, eventDate: gig.date });
    const payload = await fetchJson(`/api/setlists/search?${params}`);
    if (!payload.setlists.length) {
      setMessage('No matches found. You can still save the show without a setlist.');
      return;
    }
    renderMatches(payload.setlists);
    setMessage(`Found ${payload.setlists.length} possible match${payload.setlists.length === 1 ? '' : 'es'}. Choose a date to attach it.`);
  } catch (error) {
    setMessage(error.message, true);
  }
});

function renderMatches(setlists) {
  results.innerHTML = `<p class="eyebrow">Possible setlists</p>${setlists.map((setlist, index) => `
    <button class="match" data-match="${index}" type="button">
      <strong>${escapeHtml(setlist.venue || 'Unknown venue')}</strong>
      <span>${escapeHtml(setlist.city)} · ${escapeHtml(setlist.date || 'Date unknown')} · ${setlist.songs.length} songs</span>
    </button>`).join('')}`;
  results.hidden = false;
  results.querySelectorAll('[data-match]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedSetlist = setlists[Number(button.dataset.match)];
      form.elements.venue.value = selectedSetlist.venue || form.elements.venue.value;
      form.elements.city.value = selectedSetlist.city || form.elements.city.value;
      if (selectedSetlist.date) { const [day, month, year] = selectedSetlist.date.split('-'); form.elements.date.value = `${year}-${month}-${day}`; }
      results.querySelectorAll('.match').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      setMessage(`Setlist selected: ${selectedSetlist.songs.length} songs will be saved with this show.`);
    });
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const gig = formValues();
  const mediaFiles = [...(mediaInput?.files || [])];
  delete gig.media;
  const payload = { ...gig, songs: selectedSetlist?.songs || [], setlistFmId: selectedSetlist?.id || null, setlistFmUrl: selectedSetlist?.url || null };
  try {
    const saved = await fetchJson('/api/gigs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (mediaFiles.length) await uploadGigMedia(saved.id, mediaFiles);
    await addYouTubeMedia(saved.id, youtubeMediaInput);
    gigs.unshift(saved);
    form.reset();
    resetReviewForm();
    selectedSetlist = null;
    results.hidden = true;
    setMessage('Show saved to The Master List.');
    renderGigs();
  } catch (error) {
    setMessage(error.message, true);
  }
});

function renderGigs() {
  count.textContent = `${gigs.length} show${gigs.length === 1 ? '' : 's'}`;
  archiveStats.innerHTML = `<span>${gigs.length} shows</span><span>${new Set(gigs.map((gig) => gig.artist.toLowerCase())).size} artists</span><span>${new Set(gigs.map((gig) => `${gig.venue}|${gig.city}`.toLowerCase())).size} venues</span><span>${gigs.filter((gig) => gig.favorite).length} favourites</span><span>${gigs.reduce((total, gig) => total + (gig.songs?.length || 0), 0)} songs</span>`;
  const query = showFilter?.value.trim().toLowerCase() || '';
  const year = yearFilter?.value || '';
  const sort = sortFilter?.value || 'newest';
  const filtered = gigs.filter((gig) => (!query || [gig.artist, gig.venue, gig.city].some((value) => value.toLowerCase().includes(query))) && (!year || gig.date.startsWith(year)) && (!favouriteFilter?.checked || gig.favorite));
  emptyState.hidden = Boolean(filtered.length);
  copyPlaylist.hidden = !gigs.some((gig) => gig.songs?.length);
  gigList.replaceChildren();
  const orderedGigs = [...filtered].sort((a, b) => sort === 'oldest' ? a.date.localeCompare(b.date) : sort === 'rating' ? (Number(b.performanceRating || 0) - Number(a.performanceRating || 0)) || b.date.localeCompare(a.date) : Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.date.localeCompare(a.date));
  for (const gig of orderedGigs) {
    const card = document.querySelector('#gig-template').content.cloneNode(true);
    card.querySelector('.gig-card').id = `gig-${gig.id}`;
    card.querySelector('.edit-gig').href = `/edit?id=${encodeURIComponent(gig.id)}`;
    card.querySelector('.show-detail-link').href = `/show?id=${encodeURIComponent(gig.id)}`;
    const date = formatGigDate(gig.date);
    card.querySelector('.gig-date').textContent = date;
    card.querySelector('h3').innerHTML = `<a class="artist-link" href="/artist?name=${encodeURIComponent(gig.artist)}">${escapeHtml(gig.artist)}</a>`;
    card.querySelector('.gig-place').innerHTML = `<a class="venue-link" href="/venue?name=${encodeURIComponent(gig.venue)}&city=${encodeURIComponent(gig.city)}">${escapeHtml(gig.venue)}</a> · ${escapeHtml(gig.city)}`;
    card.querySelector('.gig-notes').textContent = gig.performanceNotes || gig.notes || '';
    card.querySelector('.venue-notes').textContent = gig.venueNotes ? `Venue: ${gig.venueNotes}` : '';
    card.querySelector('.song-total').textContent = gig.songs?.length ? `${gig.songs.length} songs` : 'No setlist';
    const ratings = card.querySelector('.gig-ratings');
    ratings.innerHTML = quickRating('performanceRating', 'Performance', gig.performanceRating) + quickRating('venueRating', 'Venue', gig.venueRating);
    ratings.querySelectorAll('.quick-star').forEach((button) => button.addEventListener('click', async () => {
      try {
        const updated = await fetchJson(`/api/gigs/${gig.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [button.dataset.field]: Number(button.dataset.rating) })
        });
        gigs = gigs.map((entry) => entry.id === gig.id ? updated : entry);
        renderGigs();
      } catch (error) {
        setMessage(error.message, true);
      }
    }));
    const heart = card.querySelector('.heart-toggle');
    heart.textContent = gig.favorite ? '♥' : '♡';
    heart.classList.toggle('favorite', Boolean(gig.favorite));
    heart.setAttribute('aria-label', gig.favorite ? 'Remove from favourites' : 'Mark as favourite');
    heart.addEventListener('click', async () => {
      try {
        const updated = await fetchJson(`/api/gigs/${gig.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: !gig.favorite }) });
        gigs = gigs.map((entry) => entry.id === gig.id ? updated : entry);
        renderGigs();
      } catch (error) {
        setMessage(error.message, true);
      }
    });
    card.querySelector('.share-gig').addEventListener('click', async () => {
      const profile = activeProfile();
      if (!profile) {
        window.location.assign('/shared');
        return;
      }
      try {
        await fetchJson('/api/shared/shows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceGigId: gig.id, profileId: profile.id }) });
        window.location.assign('/shared');
      } catch (error) { setSharedMessage(error.message, true); }
    });
    const setlist = card.querySelector('.setlist');
    const exports = card.querySelector('.exports');
    if (gig.songs?.length) {
      setlist.innerHTML = `<ol>${gig.songs.map((song) => `<li>${escapeHtml(song.title)}${song.artist && song.artist !== gig.artist ? ` <span>— ${escapeHtml(song.artist)}</span>` : ''}${song.encore ? ' <b>Encore</b>' : ''}</li>`).join('')}</ol>${gig.setlistFmUrl ? `<a href="${escapeHtml(gig.setlistFmUrl)}" target="_blank" rel="noreferrer">View source on setlist.fm ↗</a>` : ''}`;
      exports.hidden = false;
      setupExportButtons(exports, gig);
    }
    renderMediaGallery(card.querySelector('.media-gallery'), gig.media);
    card.querySelector('.delete-gig').addEventListener('click', async () => {
      if (!confirm(`Remove ${gig.artist} at ${gig.venue}?`)) return;
      await fetchJson(`/api/gigs/${gig.id}`, { method: 'DELETE' });
      gigs = gigs.filter((item) => item.id !== gig.id);
      renderGigs();
    });
    gigList.append(card);
  }
}

function populateYearFilter() {
  if (!yearFilter) return;
  const selected = yearFilter.value;
  yearFilter.replaceChildren(new Option('All years', ''));
  [...new Set(gigs.map((gig) => gig.date.slice(0, 4)))].sort().reverse().forEach((year) => yearFilter.add(new Option(year, year)));
  yearFilter.value = selected;
}

[showFilter, yearFilter, sortFilter, favouriteFilter].forEach((control) => control?.addEventListener('input', renderGigs));

function quickRating(field, label, value) {
  const rating = Number(value) || 0;
  return `<span class="quick-rating"><span class="rating-label">${label}</span>${[1, 2, 3, 4, 5].map((star) => `<button class="quick-star${star <= rating ? ' selected' : ''}" type="button" data-field="${field}" data-rating="${star}" aria-label="Rate ${label.toLowerCase()} ${star} out of 5">★</button>`).join('')}</span>`;
}

loadMapButton.addEventListener('click', async () => {
  if (!gigs.length) {
    mapMessage.textContent = 'Add a show first, then come back to map the places it happened.';
    return;
  }
  loadMapButton.disabled = true;
  loadMapButton.textContent = 'Finding venues…';
  mapMessage.textContent = 'Looking up venues that have not been placed yet…';
  try {
    const payload = await fetchJson('/api/map/locations', { method: 'POST' });
    drawMap(payload.locations);
  } catch (error) {
    mapMessage.textContent = error.message;
    mapMessage.classList.add('error');
  } finally {
    loadMapButton.disabled = false;
    loadMapButton.textContent = 'Refresh map';
  }
});

function drawMap(locations) {
  if (!locations.length) {
    mapMessage.textContent = 'No venues could be placed yet. Try adding a clearer venue and city name.';
    return;
  }
  mapMessage.classList.remove('error');
  mapMessage.textContent = `${locations.length} venue${locations.length === 1 ? '' : 's'} placed. Select a marker to revisit a show.`;
  mapElement.hidden = false;
  if (!venueMap) {
    venueMap = L.map(mapElement, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(venueMap);
    venueLayer = L.layerGroup().addTo(venueMap);
  }
  venueLayer.clearLayers();
  for (const location of locations) {
    const popup = `<strong>${escapeHtml(location.venue)}</strong><br><span>${escapeHtml(location.city)}</span><ul>${location.gigs.map((gig) => `<li><a href="/artist?name=${encodeURIComponent(gig.artist)}">${escapeHtml(gig.artist)}</a> · ${escapeHtml(gig.date || 'Date unknown')}</li>`).join('')}</ul>`;
    L.circleMarker([location.lat, location.lng], {
      radius: Math.min(7 + location.gigs.length * 2, 16), color: '#274b42', weight: 2, fillColor: '#e85c34', fillOpacity: 0.9
    }).bindPopup(popup).addTo(venueLayer);
  }
  const points = locations.map((location) => [location.lat, location.lng]);
  if (points.length === 1) venueMap.setView(points[0], 13);
  else venueMap.fitBounds(points, { padding: [48, 48], maxZoom: 13 });
  setTimeout(() => venueMap.invalidateSize(), 0);
}

function providerName(provider) {
  return ({ spotify: 'Spotify', youtube: 'YouTube', 'apple-music': 'Apple Music' })[provider];
}

function integrationFor(provider) {
  return provider === 'apple-music' ? integrations.appleMusic : integrations[provider];
}

function setupExportButtons(exports, gig) {
  const status = exports.querySelector('.export-result');
  exports.querySelectorAll('.export-button').forEach((button) => {
    const provider = button.dataset.provider;
    const integration = integrationFor(provider);
    const label = providerName(provider);
    if (!integration?.configured) {
      button.textContent = `Set up ${label}`;
      button.disabled = true;
      button.title = `Add ${label} credentials to .env, then restart the server.`;
      return;
    }
    if (provider !== 'apple-music' && !integration.connected) button.textContent = `Connect ${label}`;
    else button.textContent = `Export to ${label}`;
    button.addEventListener('click', () => runExport(provider, gig, exports, status));
  });
}

async function runExport(provider, gig, exports, status) {
  const integration = integrationFor(provider);
  if (provider !== 'apple-music' && !integration.connected) {
    window.location.assign(`/auth/${provider}`);
    return;
  }
  const buttons = [...exports.querySelectorAll('button')];
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = `Matching ${gig.songs.length} songs and creating your ${providerName(provider)} playlist…`;
  try {
    let body = {};
    if (provider === 'apple-music') body = { musicUserToken: await authorizeAppleMusic(integration.developerToken) };
    const result = await fetchJson(`/api/gigs/${gig.id}/export/${provider}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    status.replaceChildren();
    const link = document.createElement('a');
    link.href = result.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = `Open ${providerName(provider)} playlist ↗`;
    status.append(`Created with ${result.matched} matched song${result.matched === 1 ? '' : 's'}. `, link);
    if (result.unmatched?.length) status.append(` ${result.unmatched.length} song${result.unmatched.length === 1 ? '' : 's'} could not be matched.`);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error');
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function authorizeAppleMusic(developerToken) {
  if (!developerToken) throw new Error('Apple Music is not configured yet.');
  if (!window.MusicKit) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js-cdn.music.apple.com/musickit/v1/musickit.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load MusicKit.'));
      document.head.append(script);
    });
  }
  if (!musicKitConfigured) {
    window.MusicKit.configure({ developerToken, app: { name: 'The Master List', build: '0.1.0' } });
    musicKitConfigured = true;
  }
  return window.MusicKit.getInstance().authorize();
}

copyPlaylist.addEventListener('click', async () => {
  const source = gigs.find((gig) => gig.songs?.length);
  if (!source) return;
  const text = source.songs.map((song) => `${song.artist || source.artist} — ${song.title}`).join('\n');
  await navigator.clipboard.writeText(text);
  copyPlaylist.textContent = 'Copied!';
  setTimeout(() => { copyPlaylist.textContent = 'Copy selected setlist'; }, 1800);
});

async function initializeApp() {
  const auth = await fetchJson('/api/auth/status');
  account = auth.account;
  if (!account) {
    showAuth(auth);
  } else {
    authPanel.hidden = true;
    profileBar.hidden = false;
    inviteButton.hidden = !account.isAdmin;
    activeProfileId = account.id;
  }
  const [gigData, integrationData, profileData, showData] = await Promise.all([fetchJson('/api/gigs'), fetchJson('/api/integrations'), fetchJson('/api/profiles'), fetchJson('/api/shared/shows')]);
    gigs = gigData;
    integrations = integrationData;
    profiles = profileData;
    sharedShows = showData;
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) setMessage(`${providerName(params.get('connected'))} connected. Choose a show to export.`);
    if (params.get('integrationError')) setMessage('Could not connect that music service. Check its configuration and try again.', true);
    populateYearFilter();
    populateShowAutofill();
    renderGigs();
    renderProfiles();
    renderSharedShows();
    await renderArtistPage();
    renderShowPage();
    await renderVenuePage();
    await renderVenueEditPage();
    renderEditPage();
    if (page === 'map' && loadMapButton) loadMapButton.click();
}

initializeApp().catch((error) => setMessage(error.message, true));
