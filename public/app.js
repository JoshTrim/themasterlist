const form = document.querySelector('#gig-form');
const message = document.querySelector('#form-message');
const results = document.querySelector('#search-results');
const gigList = document.querySelector('#gig-list');
const emptyState = document.querySelector('#empty-state');
const count = document.querySelector('#record-count');
const copyPlaylist = document.querySelector('#copy-playlist');
const loadMapButton = document.querySelector('#load-map');
const mapMessage = document.querySelector('#map-message');
const mapElement = document.querySelector('#gig-map');
const favoriteChoice = document.querySelector('#favorite-choice');
const mediaInput = document.querySelector('#media-input');
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

const page = ({ '/': 'home', '/shows': 'shows', '/shared': 'shared', '/artist': 'artist', '/edit': 'edit', '/add': 'add', '/map': 'map', '/account': 'account' })[window.location.pathname] || 'home';
document.body.dataset.page = page;
const routeSections = {
  home: ['home-page'],
  add: ['add-page'],
  shows: ['shows-archive'],
  shared: ['shows-shared'],
  artist: ['artist-page'],
  edit: ['edit-page'],
  map: ['map-page'],
  account: ['shows-shared']
};
for (const id of ['home-page', 'add-page', 'shows-archive', 'artist-page', 'edit-page', 'shows-shared', 'map-page']) {
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
const editGigId = new URLSearchParams(window.location.search).get('id') || '';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

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
    await fetchJson(`/api/gigs/${gigId}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, mimeType: file.type, data: await fileAsBase64(file) }) });
  }
}

function renderMediaGallery(container, media = []) {
  container.replaceChildren();
  if (!media.length) return;
  container.innerHTML = media.map((item) => item.mimeType.startsWith('video/')
    ? `<video src="${item.url}" controls preload="metadata"></video>`
    : `<a href="${item.url}" target="_blank" rel="noreferrer"><img src="${item.url}" alt="Photo from the show" loading="lazy" /></a>`).join('');
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
    card.querySelector('.gig-date').textContent = new Date(`${gig.date}T12:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
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

function renderEditPage() {
  if (page !== 'edit') return;
  const gig = gigs.find((entry) => entry.id === editGigId);
  if (!gig) { editMessage.textContent = 'Show not found.'; editMessage.classList.add('error'); return; }
  editForm.elements.artist.value = gig.artist;
  editForm.elements.date.value = gig.date;
  editForm.elements.venue.value = gig.venue;
  editForm.elements.city.value = gig.city;
  renderMediaGallery(editGallery, gig.media);
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const update = Object.fromEntries(new FormData(editForm).entries());
      const saved = await fetchJson(`/api/gigs/${gig.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
      const files = [...(editMediaInput?.files || [])];
      if (files.length) await uploadGigMedia(gig.id, files);
      gigs = gigs.map((entry) => entry.id === gig.id ? { ...entry, ...saved } : entry);
      editMessage.textContent = files.length ? 'Show and media saved.' : 'Show saved.';
      editMessage.classList.remove('error');
      editMediaInput.value = '';
      const refreshed = await fetchJson(`/api/gigs/${gig.id}/media`);
      renderMediaGallery(editGallery, refreshed);
      renderGigs();
    } catch (error) { editMessage.textContent = error.message; editMessage.classList.add('error'); }
  });
}

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
    const date = new Date(`${show.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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

document.querySelector('#find-setlist').addEventListener('click', async () => {
  const gig = formValues();
  if (!gig.artist || !gig.city || !gig.date) {
    setMessage('Add an artist, city and date before searching.', true);
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
    setMessage(`Found ${payload.setlists.length} possible match${payload.setlists.length === 1 ? '' : 'es'}. Choose one to attach it.`);
  } catch (error) {
    setMessage(error.message, true);
  }
});

function renderMatches(setlists) {
  results.innerHTML = `<p class="eyebrow">Possible setlists</p>${setlists.map((setlist, index) => `
    <button class="match" data-match="${index}" type="button">
      <strong>${escapeHtml(setlist.venue || 'Unknown venue')}</strong>
      <span>${escapeHtml(setlist.city)} · ${setlist.songs.length} songs</span>
    </button>`).join('')}`;
  results.hidden = false;
  results.querySelectorAll('[data-match]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedSetlist = setlists[Number(button.dataset.match)];
      form.elements.venue.value = selectedSetlist.venue || form.elements.venue.value;
      form.elements.city.value = selectedSetlist.city || form.elements.city.value;
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
  emptyState.hidden = Boolean(gigs.length);
  copyPlaylist.hidden = !gigs.some((gig) => gig.songs?.length);
  gigList.replaceChildren();
  const orderedGigs = [...gigs].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.date.localeCompare(a.date));
  for (const gig of orderedGigs) {
    const card = document.querySelector('#gig-template').content.cloneNode(true);
    card.querySelector('.gig-card').id = `gig-${gig.id}`;
    card.querySelector('.edit-gig').href = `/edit?id=${encodeURIComponent(gig.id)}`;
    const date = new Date(`${gig.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    card.querySelector('.gig-date').textContent = date;
    card.querySelector('h3').innerHTML = `<a class="artist-link" href="/artist?name=${encodeURIComponent(gig.artist)}">${escapeHtml(gig.artist)}</a>`;
    card.querySelector('.gig-place').textContent = `${gig.venue} · ${gig.city}`;
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
    const popup = `<strong>${escapeHtml(location.venue)}</strong><br><span>${escapeHtml(location.city)}</span><ul>${location.gigs.map((gig) => `<li><a href="#gig-${gig.id}">${escapeHtml(gig.artist)}</a> · ${escapeHtml(gig.date)}</li>`).join('')}</ul>`;
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
    renderGigs();
    renderProfiles();
    renderSharedShows();
    await renderArtistPage();
    renderEditPage();
    if (page === 'map' && loadMapButton) loadMapButton.click();
}

initializeApp().catch((error) => setMessage(error.message, true));
