const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const playback = require('../public/lib/playback-core');
const mediaUi = require('../public/lib/playback-media');
const theatre = require('../public/lib/theatre');

function video(id, clips = [], extra = {}) {
  return { id, mimeType: 'video/youtube', url: `https://www.youtube.com/watch?v=${id}`, playbackClips: clips, ...extra };
}

describe('frontend playback engine', () => {
  test('orders primary and fallback sources and supports legacy assignments', () => {
    const primary = video('primary', [{ songIndex: 0, startSeconds: 10, endSeconds: 30, priority: 0 }]);
    const backup = video('backup', [{ songIndex: 0, startSeconds: 5, endSeconds: 28, priority: 1 }]);
    const artifact = { id: 'shirt', category: 'artifact', mimeType: 'image/jpeg' };
    const gig = { media: [backup, artifact, primary] };
    assert.deepEqual(playback.sourcesForSong(gig, 0).map((entry) => entry.media.id), ['primary', 'backup']);
    const legacy = { id: 'legacy', mimeType: 'video/mp4', songIndex: 2, playbackStart: 3, playbackEnd: 23 };
    assert.deepEqual(playback.sourcesForSong({ media: [legacy] }, 2)[0].clip, { songIndex: 2, startSeconds: 3, endSeconds: 23, priority: 0 });
  });

  test('maps manually trimmed clips between media time and track progress', () => {
    const source = { media: video('clip'), clip: { startSeconds: 30, endSeconds: 90 } };
    assert.deepEqual(playback.bounds(source, 120), { start: 30, end: 90, length: 60 });
    assert.equal(playback.fraction(source, 60, 120), 0.5);
    assert.equal(playback.timeAt(source, 0.25, 120), 45);
    assert.equal(playback.timeAt(source, 2, 120), 90);
  });

  test('keeps unassigned portions of a whole-show source as Unknown entries', () => {
    const wholeShow = video('whole', [
      { songIndex: 0, startSeconds: 20, endSeconds: 50, priority: 0 },
      { songIndex: 1, startSeconds: 70, endSeconds: 100, priority: 0 }
    ], { sourceDuration: 130 });
    const queue = playback.buildQueue({ songs: [{ title: 'One' }, { title: 'Two' }], media: [wholeShow] });
    assert.deepEqual(queue.map((entry) => entry.isUnknown ? 'unknown' : entry.songIndex), ['unknown', 0, 'unknown', 1, 'unknown']);
    assert.deepEqual(queue.filter((entry) => entry.isUnknown).map((entry) => playback.bounds(entry)), [
      { start: 0, end: 20, length: 20 }, { start: 50, end: 70, length: 20 }, { start: 100, end: 130, length: 30 }
    ]);
  });

  test('weights timeline markers by edited clip duration', () => {
    const source = video('set', [
      { songIndex: 0, startSeconds: 0, endSeconds: 30, priority: 0 },
      { songIndex: 1, startSeconds: 30, endSeconds: 90, priority: 0 }
    ]);
    const gig = { songs: [{ title: 'Short' }, { title: 'Long' }], media: [source] };
    const queue = playback.buildQueue(gig);
    const timeline = playback.timelineModel(gig, queue);
    assert.equal(timeline[0].start, 0);
    assert.equal(timeline[0].end, 1 / 3);
    assert.equal(timeline[1].marker, 1 / 3);
    assert.equal(timeline[1].end, 1);
    assert.ok(Math.abs(playback.progressModel(timeline[1], 0.5) - (2 / 3)) < Number.EPSILON);
  });

  test('interpolates clicks inside a segment and skips gaps to available media', () => {
    const available = { media: video('available') };
    const model = [
      { index: 0, entry: { media: null }, start: 0, end: 0.25 },
      { index: 1, entry: available, start: 0.25, end: 0.75 },
      { index: 2, entry: { media: null }, start: 0.75, end: 1 }
    ];
    const middle = playback.seekTarget(model, 0.5);
    assert.equal(middle.segment.index, 1);
    assert.equal(middle.fraction, 0.5);
    assert.equal(playback.seekTarget(model, 0.1).segment.index, 1);
    assert.equal(playback.seekTarget(model, 0.9).segment.index, 1);
  });

  test('activates backups and locates the next playable queue entry', () => {
    const entry = { sources: [{ media: video('bad'), clip: {} }, { media: video('backup'), clip: {} }] };
    playback.activateSource(entry, 1);
    assert.equal(entry.media.id, 'backup');
    assert.equal(playback.nextPlayableIndex([{ media: null }, entry], 0, 1), 1);
    assert.equal(playback.nextPlayableIndex([{ media: null }, entry], 0, -1), -1);
  });
});

describe('frontend playback media adapters', () => {
  test('parses common YouTube URLs and labels fallback sources', () => {
    assert.equal(mediaUi.youtubeVideoId('https://youtu.be/abc123'), 'abc123');
    assert.equal(mediaUi.youtubeVideoId('https://www.youtube.com/watch?v=xyz789'), 'xyz789');
    assert.equal(mediaUi.youtubeEmbedUrl('https://youtu.be/abc123', { autoplay: true, origin: 'http://127.0.0.1:3000' }), 'https://www.youtube-nocookie.com/embed/abc123?enablejsapi=1&autoplay=1&origin=http%3A%2F%2F127.0.0.1%3A3000');
    assert.equal(mediaUi.youtubeEmbedUrl('not a URL'), 'not a URL');
    assert.deepEqual(mediaUi.sourcePresentation({ media: { mimeType: 'video/youtube', caption: 'Full set' }, sourceIndex: 1 }), { kind: 'YouTube · Backup 1', label: 'Full set' });
    assert.deepEqual(mediaUi.sourcePresentation({ media: { mimeType: 'video/mp4', remote: true, peerName: 'Sam', caption: 'Clip' } }), { kind: 'From Sam', label: 'Clip' });
  });

  test('builds uploaded and YouTube stages without preloading the same source twice', () => {
    const escapeHtml = (value) => value;
    const youtubeEmbedUrl = (url) => `embed:${url}`;
    const upload = { id: 'upload', mimeType: 'video/mp4', url: '/media/upload.mp4' };
    const same = mediaUi.stageMarkup({ entry: { media: upload }, next: { media: upload }, songTitle: 'Track', escapeHtml, youtubeEmbedUrl });
    assert.match(same, /set-player-current/);
    assert.doesNotMatch(same, /set-player-preload/);
    const youtube = mediaUi.stageMarkup({ entry: { media: video('yt') }, next: null, songTitle: 'Track', escapeHtml, youtubeEmbedUrl });
    assert.match(youtube, /<iframe/);
    assert.match(youtube, /embed:https:\/\/www\.youtube\.com/);
  });
});

describe('theatre controls', () => {
  test('maps shortcuts only when playback context permits them', () => {
    assert.equal(theatre.commandForKey({ key: 'ArrowRight', inTheatre: true, playerHidden: false, editing: false }), 'next');
    assert.equal(theatre.commandForKey({ key: 'k', inTheatre: true, playerHidden: false, editing: false }), 'toggle-playback');
    assert.equal(theatre.commandForKey({ key: 'f', inTheatre: false, playerHidden: false, editing: false }), 'toggle-theatre');
    assert.equal(theatre.commandForKey({ key: 'm', inTheatre: false, playerHidden: false, editing: false }), null);
    assert.equal(theatre.commandForKey({ key: 'f', inTheatre: false, playerHidden: false, editing: true }), null);
  });

  test('describes fullscreen controls and only hides them during active theatre playback', () => {
    assert.equal(theatre.fullscreenPresentation(true).buttonLabel, '↙ Exit theatre');
    assert.equal(theatre.shouldAutoHide({ inTheatre: true, playing: true, timelineActive: false }), true);
    assert.equal(theatre.shouldAutoHide({ inTheatre: true, playing: true, timelineActive: true }), false);
  });
});
