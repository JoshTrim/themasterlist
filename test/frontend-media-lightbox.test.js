const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const mediaLightbox = require('../public/lib/media-lightbox');

function fixture() {
  const classes = new Set();
  const lightbox = { hidden: true, classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } }, addEventListener(_type, handler) { this.handler = handler; } };
  const stageClasses = new Set();
  const stage = { classList: { add: (name) => stageClasses.add(name), remove: (name) => stageClasses.delete(name) } };
  const image = { hidden: false, src: '', style: {}, removeAttribute(name) { if (name === 'src') this.src = ''; } };
  const video = { hidden: false, src: '', style: {}, pauses: 0, pause() { this.pauses += 1; }, removeAttribute(name) { if (name === 'src') this.src = ''; } };
  const caption = { textContent: '' };
  const basicCaption = { textContent: '', hidden: false };
  const artifactCopy = { hidden: true }; const artifactType = { textContent: '' }; const artifactNotes = { textContent: '' };
  const artifactViews = { buttons: [], set innerHTML(value) { this.value = value; this.buttons = [...value.matchAll(/<button/g)].map(() => ({ classList: { toggle() {} }, setAttribute() {}, addEventListener(_type, handler) { this.handler = handler; } })); }, querySelectorAll() { return this.buttons; } };
  const control = () => ({ addEventListener(_type, handler) { this.handler = handler; } });
  const artifactPrevious = control(); const artifactFlip = control(); const artifactNext = control();
  const artifactShow = { hidden: true, href: '' }; const artifactDownload = { href: '' };
  const closeButton = { addEventListener(_type, handler) { this.handler = handler; } };
  const controller = mediaLightbox.createController({ elements: { lightbox, stage, image, video, caption, basicCaption, closeButton, artifactCopy, artifactType, artifactNotes, artifactViews, artifactPrevious, artifactFlip, artifactNext, artifactShow, artifactDownload }, setTimeoutFn: (callback) => callback() });
  controller.bind();
  return { controller, lightbox, image, video, caption, basicCaption, closeButton, artifactCopy, artifactType, artifactNotes, artifactViews, artifactPrevious, artifactFlip, artifactNext, artifactShow, artifactDownload, classes };
}

describe('media lightbox controller', () => {
  test('opens rotated images and clears a stale video source', () => {
    const view = fixture();
    view.video.src = '/old-video.mp4';
    view.controller.open({ mimeType: 'image/jpeg', url: '/photo.jpg', rotation: 90, caption: 'Merch table' });
    assert.equal(view.lightbox.hidden, false);
    assert.equal(view.image.hidden, false);
    assert.equal(view.video.hidden, true);
    assert.equal(view.image.src, '/photo.jpg');
    assert.equal(view.video.src, '');
    assert.equal(view.image.style.transform, 'rotate(90deg)');
    assert.equal(view.caption.textContent, 'Merch table');
  });

  test('opens video without rotating the native player', () => {
    const view = fixture();
    view.image.src = '/old-photo.jpg';
    view.controller.open({ mimeType: 'video/mp4', url: '/clip.mp4', rotation: 270, filename: 'clip.mp4' });
    assert.equal(view.image.hidden, true);
    assert.equal(view.video.hidden, false);
    assert.equal(view.image.src, '');
    assert.equal(view.video.src, '/clip.mp4');
    assert.equal(view.video.style.transform, 'none');
    assert.equal(view.caption.textContent, 'clip.mp4');
  });

  test('closes from either control and pauses playback', () => {
    const view = fixture();
    view.lightbox.hidden = false;
    view.closeButton.handler();
    assert.equal(view.lightbox.hidden, true);
    assert.equal(view.video.pauses, 1);
    view.lightbox.hidden = false;
    view.lightbox.handler({ target: view.lightbox });
    assert.equal(view.lightbox.hidden, true);
    assert.equal(view.video.pauses, 2);
    view.lightbox.hidden = false;
    view.lightbox.handler({ target: {} });
    assert.equal(view.lightbox.hidden, false);
  });

  test('groups artifact views and flips from front to back', () => {
    const view = fixture();
    const front = { id: 'front', mimeType: 'image/jpeg', category: 'artifact', artifactView: 'front', url: '/front.jpg', caption: 'Tour shirt', artifactType: 'merch', artifactNotes: 'Bought at the show' };
    const back = { id: 'back', mimeType: 'image/jpeg', category: 'artifact', artifactView: 'back', url: '/back.jpg', caption: 'Tour shirt' };
    view.controller.open({ ...front, gig: { id: 'gig' }, artifactViews: [front, back] });
    assert.equal(view.artifactCopy.hidden, false);
    assert.equal(view.image.src, '/front.jpg');
    assert.equal(view.artifactViews.buttons.length, 2);
    view.artifactFlip.handler();
    assert.equal(view.image.src, '/back.jpg');
    assert.equal(view.artifactDownload.href, '/api/media/back?variant=original');
    assert.equal(view.artifactShow.href, '/show?id=gig');
  });
});
