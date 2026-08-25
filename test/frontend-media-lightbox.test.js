const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const mediaLightbox = require('../public/lib/media-lightbox');

function fixture({ animate = false, prefersReducedMotion = false } = {}) {
  const classList = (classes = new Set()) => ({
    add: (name) => classes.add(name), remove: (name) => classes.delete(name),
    toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: (name) => classes.has(name)
  });
  const classes = new Set();
  const lightbox = { hidden: true, classList: classList(classes), addEventListener(_type, handler) { this.handler = handler; } };
  const stageClasses = new Set();
  const stage = { classList: classList(stageClasses) };
  const image = { hidden: false, src: '', style: {}, removeAttribute(name) { if (name === 'src') this.src = ''; } };
  const video = { hidden: false, src: '', style: {}, pauses: 0, pause() { this.pauses += 1; }, removeAttribute(name) { if (name === 'src') this.src = ''; } };
  const caption = { textContent: '' };
  const basicCaption = { textContent: '', hidden: false };
  const artifactCopy = { hidden: true }; const artifactType = { textContent: '' }; const artifactNotes = { textContent: '' };
  const artifactViews = { buttons: [], set innerHTML(value) { this.value = value; this.buttons = [...value.matchAll(/<button/g)].map(() => ({ classList: { toggle() {} }, setAttribute() {}, addEventListener(_type, handler) { this.handler = handler; } })); }, querySelectorAll() { return this.buttons; } };
  const control = () => ({ addEventListener(_type, handler) { this.handler = handler; } });
  const artifactPrevious = control(); const artifactFlip = control(); const artifactNext = control();
  const artifactShow = { hidden: true, href: '' }; const artifactDownload = { href: '' };
  const modelClasses = new Set();
  const artifactModel = { hidden: true, classList: classList(modelClasses), addEventListener(type, handler) { this[type] = handler; }, setPointerCapture() {} };
  const artifactModelSpinner = { style: { values: {}, setProperty(name, value) { this.values[name] = value; } } };
  const artifactModelFront = { src: '', alt: '', style: {} }; const artifactModelBack = { src: '', alt: '', style: {} };
  const modelControl = () => ({ hidden: false, textContent: '', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(_type, handler) { this.handler = handler; } });
  const artifactModelToggle = modelControl(); const artifactModelMotion = modelControl();
  const frames = []; const cancelledFrames = [];
  const closeButton = { addEventListener(_type, handler) { this.handler = handler; } };
  const controller = mediaLightbox.createController({ elements: { lightbox, stage, image, video, caption, basicCaption, closeButton, artifactCopy, artifactType, artifactNotes, artifactViews, artifactPrevious, artifactFlip, artifactNext, artifactShow, artifactDownload, artifactModel, artifactModelSpinner, artifactModelFront, artifactModelBack, artifactModelToggle, artifactModelMotion }, setTimeoutFn: (callback) => callback(), requestAnimationFrameFn: animate ? ((callback) => { frames.push(callback); return frames.length; }) : null, cancelAnimationFrameFn: (id) => cancelledFrames.push(id), prefersReducedMotion });
  controller.bind();
  return { controller, lightbox, stage, image, video, caption, basicCaption, closeButton, artifactCopy, artifactType, artifactNotes, artifactViews, artifactPrevious, artifactFlip, artifactNext, artifactShow, artifactDownload, artifactModel, artifactModelSpinner, artifactModelFront, artifactModelBack, artifactModelToggle, artifactModelMotion, classes, modelClasses, frames, cancelledFrames };
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

  test('offers a rotating 3D model only when front and back views exist', () => {
    const view = fixture();
    const front = { id: 'front', mimeType: 'image/png', category: 'artifact', artifactView: 'front', url: '/front.png', caption: 'Tour shirt', rotation: 0 };
    const back = { id: 'back', mimeType: 'image/png', category: 'artifact', artifactView: 'back', url: '/back.png', rotation: 180 };
    view.controller.open({ ...front, artifactViews: [front, back] });
    assert.equal(view.artifactModelToggle.hidden, false);
    view.artifactModelToggle.handler();
    assert.equal(view.controller.isModelActive(), true);
    assert.equal(view.image.hidden, true);
    assert.equal(view.artifactModel.hidden, false);
    assert.equal(view.artifactModelFront.src, '/front.png');
    assert.equal(view.artifactModelBack.src, '/back.png');
    assert.equal(view.artifactModelBack.style.transform, 'rotate(180deg)');
    assert.equal(view.artifactModelToggle.textContent, '2D view');
    assert.equal(view.stage.classList.contains('is-model-view'), true);
  });

  test('pauses and manually rotates the artifact model with pointer and keyboard controls', () => {
    const view = fixture();
    const front = { id: 'front', mimeType: 'image/png', category: 'artifact', artifactView: 'front', url: '/front.png' };
    const back = { id: 'back', mimeType: 'image/png', category: 'artifact', artifactView: 'back', url: '/back.png' };
    view.controller.open({ ...front, artifactViews: [front, back] });
    view.artifactModelToggle.handler();
    view.artifactModelMotion.handler();
    assert.equal(view.modelClasses.has('is-paused'), true);
    assert.equal(view.artifactModelMotion.textContent, 'Resume');
    view.artifactModel.pointerdown({ clientX: 100, pointerId: 1 });
    view.artifactModel.pointermove({ clientX: 140 });
    assert.equal(view.artifactModelSpinner.style.values['--artifact-model-angle'], '0deg');
    view.artifactModel.pointerup({});
    let prevented = false;
    view.artifactModel.keydown({ key: 'ArrowRight', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(view.artifactModelSpinner.style.values['--artifact-model-angle'], '15deg');
  });

  test('advances the 3D rotation with animation frames and allows reduced-motion opt in', () => {
    const view = fixture({ animate: true });
    const front = { id: 'front', mimeType: 'image/png', category: 'artifact', artifactView: 'front', url: '/front.png' };
    const back = { id: 'back', mimeType: 'image/png', category: 'artifact', artifactView: 'back', url: '/back.png' };
    view.controller.open({ ...front, artifactViews: [front, back] });
    view.artifactModelToggle.handler();
    view.frames.shift()(1000);
    view.frames.shift()(2000);
    assert.equal(view.artifactModelSpinner.style.transform, 'rotateX(-3deg) rotateY(4.5deg)');

    const reduced = fixture({ animate: true, prefersReducedMotion: true });
    reduced.controller.open({ ...front, artifactViews: [front, back] });
    reduced.artifactModelToggle.handler();
    assert.equal(reduced.frames.length, 0);
    assert.equal(reduced.artifactModelMotion.textContent, 'Resume');
    reduced.artifactModelMotion.handler();
    assert.equal(reduced.frames.length, 1);
  });

  test('continues automatic rotation from the angle where a drag ends', () => {
    const view = fixture({ animate: true });
    const front = { id: 'front', mimeType: 'image/png', category: 'artifact', artifactView: 'front', url: '/front.png' };
    const back = { id: 'back', mimeType: 'image/png', category: 'artifact', artifactView: 'back', url: '/back.png' };
    view.controller.open({ ...front, artifactViews: [front, back] });
    view.artifactModelToggle.handler();
    view.artifactModel.pointerdown({ clientX: 100, pointerId: 1 });
    view.artifactModel.pointermove({ clientX: 180 });
    assert.equal(view.artifactModelSpinner.style.transform, 'rotateX(-3deg) rotateY(18deg)');
    view.artifactModel.pointerup({});
    assert.equal(view.artifactModelSpinner.style.transform, 'rotateX(-3deg) rotateY(18deg)');
    assert.equal(view.modelClasses.has('is-dragging'), false);
    assert.equal(view.frames.length, 2);
  });
});
