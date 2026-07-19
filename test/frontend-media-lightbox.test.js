const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const mediaLightbox = require('../public/lib/media-lightbox');

function fixture() {
  const lightbox = { hidden: true, addEventListener(_type, handler) { this.handler = handler; } };
  const image = { hidden: false, src: '', style: {}, removeAttribute(name) { if (name === 'src') this.src = ''; } };
  const video = { hidden: false, src: '', style: {}, pauses: 0, pause() { this.pauses += 1; }, removeAttribute(name) { if (name === 'src') this.src = ''; } };
  const caption = { textContent: '' };
  const closeButton = { addEventListener(_type, handler) { this.handler = handler; } };
  const controller = mediaLightbox.createController({ elements: { lightbox, image, video, caption, closeButton } });
  controller.bind();
  return { controller, lightbox, image, video, caption, closeButton };
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
});
