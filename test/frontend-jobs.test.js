const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createJobQueue } = require('../public/lib/jobs');

function fakeDocument() {
  const list = { childElementCount: 0, innerHTML: '', replaceChildren() { this.innerHTML = ''; }, querySelectorAll() { return []; } };
  const panel = { hidden: true, className: '', innerHTML: '', querySelector() { return list; } };
  return { panel, list, document: { body: { append() {} }, createElement() { return panel; } } };
}

describe('frontend background jobs', () => {
  test('keeps the panel hidden until a visible job exists', () => {
    const dom = fakeDocument();
    let mobile = true;
    const jobs = createJobQueue({ document: dom.document, fetchJson: async () => [], escapeHtml: String, hideUploads: () => mobile });
    jobs.update('upload-1', { type: 'Uploading', name: 'clip.mp4', status: 'running', progress: 20 });
    assert.equal(dom.panel.hidden, true);
    mobile = false;
    jobs.render();
    assert.equal(dom.panel.hidden, false);
    assert.match(dom.list.innerHTML, /clip\.mp4/);
  });

  test('restores persistent server jobs into the queue', async () => {
    const dom = fakeDocument();
    const jobs = createJobQueue({ document: dom.document, fetchJson: async () => [{ id: 'encode-1', type: 'Encode video', name: 'show.mp4', status: 'running', progress: 45 }], escapeHtml: String });
    await jobs.loadPersistent();
    assert.equal(jobs.queue.get('encode-1').progress, 45);
    assert.equal(dom.panel.hidden, false);
  });
});
