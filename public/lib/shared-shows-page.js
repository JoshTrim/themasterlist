(function initSharedShowsPage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MasterListSharedShowsPage = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function sharedShowsPageFactory() {
  function attendeeNames(show) {
    return (Array.isArray(show?.attendees) ? show.attendees : []).map((person) => person?.name).filter(Boolean);
  }

  function partitionShows(gigs, sharedShows) {
    const local = gigs.filter((gig) => attendeeNames(gig).length > 1);
    const localIds = new Set(local.flatMap((gig) => [gig.id, gig.sharedId].filter(Boolean)));
    const remote = sharedShows.filter((show) => show.contributions?.length && !localIds.has(show.id) && !localIds.has(show.sourceGigId));
    const legacy = sharedShows.filter((show) => !show.contributions?.length && !localIds.has(show.id) && !localIds.has(show.sourceGigId));
    return { local, remote, legacy, total: local.length + remote.length + legacy.length };
  }

  function contributionDetail({ contribution, gig, isLocal }) {
    if (!contribution) {
      if (!isLocal) return 'Peer contribution will appear after sync';
      return `${gig.performanceRating ? `Performance ${gig.performanceRating}/5` : 'Performance unrated'} · ${gig.venueRating ? `Venue ${gig.venueRating}/5` : 'Venue unrated'}${gig.favorite ? ' · Favourite' : ''}`;
    }
    return `${contribution.performanceRating ? `Performance ${contribution.performanceRating}/5` : 'Performance unrated'} · ${contribution.venueRating ? `Venue ${contribution.venueRating}/5` : 'Venue unrated'}${contribution.favorite ? ' · Favourite' : ''} · ${contribution.media?.length || 0} media`;
  }

  function averageLabel(contributions, field, label) {
    const ratings = contributions.map((entry) => Number(entry[field])).filter(Boolean);
    if (!ratings.length) return `${label} unrated`;
    return `${label} average ${(ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)} / 5`;
  }

  function localSummary(contributions, gig) {
    const mediaTotal = contributions.length
      ? contributions.reduce((sum, entry) => sum + (entry.media?.length || 0), 0)
      : gig.media?.length || 0;
    return `${averageLabel(contributions, 'performanceRating', 'Performance')} · ${averageLabel(contributions, 'venueRating', 'Venue')} · ${mediaTotal} media item${mediaTotal === 1 ? '' : 's'} across attendees`;
  }

  function renderStars(stars) {
    const rating = Number(stars.dataset.value) || 0;
    stars.innerHTML = [1, 2, 3, 4, 5].map((value) => `<button type="button" value="${value}" class="${value <= rating ? 'selected' : ''}" aria-label="${value} stars">★</button>`).join('');
    stars.closest('.shared-rating-row').querySelector('.shared-rating-number').textContent = rating ? `${rating} / 5` : 'Unrated';
    stars.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      stars.dataset.value = button.value;
      renderStars(stars);
    }));
  }

  function createController({
    document, OptionClass = Option, navigator, fetchJson, escapeHtml, formatDate,
    getState, onActiveProfile = () => {}, onData = () => {}, elements
  }) {
    const { profileSelect, message, list, template, inviteButton } = elements;

    function setMessage(text, isError = false) {
      message.textContent = text;
      message.classList.toggle('error', isError);
    }

    function renderProfiles() {
      const { profiles, activeProfileId, account } = getState();
      const selected = profiles.some((profile) => profile.id === activeProfileId) ? activeProfileId : account?.id || '';
      onActiveProfile(selected);
      profileSelect.replaceChildren(new OptionClass('Choose a profile…', ''));
      for (const profile of profiles) profileSelect.add(new OptionClass(profile.name, profile.id));
      profileSelect.value = selected;
      return selected;
    }

    function renderLocalCard(gig, sharedShows, account) {
      const card = document.createElement('article');
      card.className = 'shared-card local-shared-card';
      const names = attendeeNames(gig);
      const syncedShow = sharedShows.find((show) => show.id === gig.sharedId || show.sourceGigId === gig.id);
      const contributions = syncedShow?.contributions || [];
      card.innerHTML = `<div class="shared-card-header"><div><p class="shared-date"></p><h3></h3><p class="shared-place"></p></div><span class="shared-song-count"></span></div><div class="shared-people"></div><div class="local-shared-attendees"></div><div class="local-shared-meta"></div><div class="local-shared-actions"><a class="button button-secondary" href="/show?id=${encodeURIComponent(gig.id)}">Open show</a><a class="button button-secondary" href="/edit?id=${encodeURIComponent(gig.id)}">Edit attendees</a></div>`;
      card.querySelector('.shared-date').textContent = formatDate(gig.date);
      card.querySelector('h3').textContent = gig.artist;
      card.querySelector('.shared-place').textContent = `${gig.venue} · ${gig.city}`;
      card.querySelector('.shared-song-count').textContent = gig.songs?.length ? `${gig.songs.length} songs` : 'No setlist yet';
      card.querySelector('.shared-people').innerHTML = `<span>Attendees</span>${names.map((name) => `<b>${escapeHtml(name)}</b>`).join('')}`;
      card.querySelector('.local-shared-attendees').innerHTML = (gig.attendees || []).map((person) => {
        const isLocal = person.id === account?.id;
        const contribution = contributions.find((entry) => isLocal ? entry.localGigId === gig.id : entry.instanceId === person.id);
        const detail = contributionDetail({ contribution, gig, isLocal });
        const notes = contribution?.performanceNotes || contribution?.venueNotes;
        return `<div><strong>${escapeHtml(contribution?.participantName || person.name || 'Attendee')}</strong><span>${escapeHtml(detail)}</span>${notes ? `<small>${escapeHtml(notes)}</small>` : ''}</div>`;
      }).join('');
      card.querySelector('.local-shared-meta').textContent = localSummary(contributions, gig);
      return card;
    }

    function renderRemoteCard(show) {
      const card = document.createElement('article');
      card.className = 'shared-card local-shared-card';
      const mediaTotal = show.contributions.reduce((sum, entry) => sum + (entry.media?.length || 0), 0);
      card.innerHTML = '<div class="shared-card-header"><div><p class="shared-date"></p><h3></h3><p class="shared-place"></p></div><span class="shared-song-count"></span></div><div class="local-shared-attendees"></div><div class="local-shared-meta"></div>';
      card.querySelector('.shared-date').textContent = formatDate(show.date);
      card.querySelector('h3').textContent = show.artist;
      card.querySelector('.shared-place').textContent = `${show.venue} · ${show.city}`;
      card.querySelector('.shared-song-count').textContent = show.songs?.length ? `${show.songs.length} songs` : 'No setlist yet';
      card.querySelector('.local-shared-attendees').innerHTML = show.contributions.map((entry) => `<div><strong>${escapeHtml(entry.participantName || 'Peer')}</strong><span>${entry.performanceRating ? `Performance ${entry.performanceRating}/5` : 'Performance unrated'} · ${entry.venueRating ? `Venue ${entry.venueRating}/5` : 'Venue unrated'}${entry.favorite ? ' · Favourite' : ''} · ${entry.media?.length || 0} media</span>${entry.performanceNotes || entry.venueNotes ? `<small>${escapeHtml(entry.performanceNotes || entry.venueNotes)}</small>` : ''}</div>`).join('');
      card.querySelector('.local-shared-meta').textContent = `${mediaTotal} media item${mediaTotal === 1 ? '' : 's'} listed across synced instances`;
      return card;
    }

    function appendHeading(text) {
      const heading = document.createElement('p');
      heading.className = 'eyebrow shared-list-heading';
      heading.textContent = text;
      list.append(heading);
    }

    function renderLegacyCard(show, profiles, profile) {
      const card = template.content.cloneNode(true);
      card.querySelector('.shared-date').textContent = formatDate(show.date);
      card.querySelector('h3').textContent = show.artist;
      card.querySelector('.shared-place').textContent = `${show.venue} · ${show.city}`;
      card.querySelector('.shared-song-count').textContent = show.songs?.length ? `${show.songs.length} songs` : 'No setlist yet';
      card.querySelector('.shared-people').innerHTML = `<span>Went with</span>${show.attendees.map((person) => `<b>${escapeHtml(person.name)}</b>`).join('')}`;
      const attendeeSelect = card.querySelector('.attendee-select');
      const attendeeIds = new Set(show.attendees.map((person) => person.id));
      for (const person of profiles.filter((candidate) => !attendeeIds.has(candidate.id))) attendeeSelect.add(new OptionClass(person.name, person.id));
      const addAttendee = card.querySelector('.add-attendee');
      if (!attendeeSelect.options.length) addAttendee.hidden = true;
      else addAttendee.addEventListener('click', async () => {
        try {
          await fetchJson(`/api/shared/shows/${show.id}/attendees`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: attendeeSelect.value }) });
          await refresh();
        } catch (error) { setMessage(error.message, true); }
      });

      const review = show.reviews.find((entry) => entry.profileId === profile.id) || {};
      const reviewSection = card.querySelector('.shared-review');
      if (!attendeeIds.has(profile.id)) reviewSection.hidden = true;
      else {
        reviewSection.querySelector('.shared-notes').value = review.notes || '';
        reviewSection.querySelectorAll('.shared-stars').forEach((stars) => {
          stars.dataset.value = review[stars.dataset.field] || '';
          renderStars(stars);
        });
        card.querySelector('.save-shared-review').addEventListener('click', async () => {
          try {
            const data = { profileId: profile.id, notes: reviewSection.querySelector('.shared-notes').value };
            reviewSection.querySelectorAll('.shared-stars').forEach((stars) => { data[stars.dataset.field] = stars.dataset.value || null; });
            await fetchJson(`/api/shared/shows/${show.id}/reviews`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            await refresh();
          } catch (error) { setMessage(error.message, true); }
        });
      }
      return card;
    }

    function render() {
      const { gigs, sharedShows, profiles, activeProfileId, account } = getState();
      list.replaceChildren();
      const groups = partitionShows(gigs, sharedShows);
      setMessage(groups.total ? `${groups.total} shared show${groups.total === 1 ? '' : 's'} in this instance.` : 'Add attendees to a show to start a collaborative record.');
      if (groups.local.length) {
        appendHeading('Shared from this archive');
        groups.local.forEach((gig) => list.append(renderLocalCard(gig, sharedShows, account)));
      }
      if (groups.remote.length) {
        appendHeading('Received from peers');
        groups.remote.forEach((show) => list.append(renderRemoteCard(show)));
      }
      const profile = profiles.find((entry) => entry.id === activeProfileId);
      if (!profiles.length || !profile) {
        if (groups.legacy.length) setMessage('Choose your profile to create or review shared shows.', true);
        return groups;
      }
      groups.legacy.forEach((show) => list.append(renderLegacyCard(show, profiles, profile)));
      return groups;
    }

    async function refresh() {
      const [profiles, sharedShows] = await Promise.all([fetchJson('/api/profiles'), fetchJson('/api/shared/shows')]);
      onData({ profiles, sharedShows });
      renderProfiles();
      render();
    }

    async function createAccountInvite() {
      try {
        const invite = await fetchJson('/api/auth/invites', { method: 'POST' });
        await navigator.clipboard.writeText(invite.inviteUrl);
        setMessage('Invite link copied. It expires in seven days.');
      } catch (error) { setMessage(error.message, true); }
    }

    function bind() { inviteButton?.addEventListener('click', createAccountInvite); }

    return { setMessage, renderProfiles, render, refresh, createAccountInvite, bind };
  }

  return { attendeeNames, partitionShows, contributionDetail, averageLabel, localSummary, renderStars, createController };
}));
