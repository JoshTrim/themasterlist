const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGallery } = require('../public/lib/media-gallery');

function gallery() {
  const selection = { prune: () => {}, selected: () => [], has: () => false, toggle: () => {}, clear: () => {}, delete: () => {} };
  return createGallery({
    escapeHtml: (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'), youtubeEmbedUrl: (url) => `embed:${url}`,
    isMobileUpload: true, openMediaLightbox: () => {}, mediaSelection: selection, fetchJson: async () => ({}), confirm: () => true, prompt: () => null,
    mediaJobs: { poll: async () => ({ status: 'complete' }) }, updateJob: () => {}, mediaRecognitionMarkup: () => ''
  });
}

test('media gallery renders uploaded images, mobile video and YouTube safely', () => {
  const container = { innerHTML: '', replaceChildren() { this.innerHTML = ''; }, querySelectorAll() { return []; } };
  let rendered = 0;
  gallery().render(container, [
    { id: 'photo', mimeType: 'image/jpeg', url: '/photo.jpg', caption: '<Photo>', rotation: 90 },
    { id: 'video', mimeType: 'video/mp4', url: '/video.mp4', caption: 'Video' },
    { id: 'youtube', mimeType: 'video/youtube', url: 'https://youtu.be/id', caption: 'YouTube' }
  ], { afterRender: () => { rendered += 1; } });
  assert.match(container.innerHTML, /&lt;Photo>/); assert.match(container.innerHTML, /rotate\(90deg\)/);
  assert.match(container.innerHTML, /preload="none"/); assert.match(container.innerHTML, /src="embed:https:\/\/youtu\.be\/id"/);
  assert.equal(rendered, 1);
});

test('empty media gallery clears stale content and still completes rendering', () => {
  const container = { innerHTML: 'stale', replaceChildren() { this.innerHTML = ''; } }; let completed = false;
  gallery().render(container, [], { afterRender: () => { completed = true; } });
  assert.equal(container.innerHTML, ''); assert.equal(completed, true);
});
