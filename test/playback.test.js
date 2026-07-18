const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  recognitionKey,
  youtubeVideoId,
  isoDurationSeconds,
  chapterSeconds,
  parsePlaybackChapters,
  playbackTitleScore,
  bestPlaybackSong,
  estimateFullShowTimings,
  suggestPlaybackPlan
} = require('../lib/playback');

describe('playback analysis', () => {
  test('normalizes recognition titles and YouTube URL forms', () => {
    assert.equal(recognitionKey('Song Name (Live) [HD]'), 'songname');
    assert.equal(youtubeVideoId('https://youtu.be/abc123?t=10'), 'abc123');
    assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=xyz789&list=1'), 'xyz789');
    assert.equal(youtubeVideoId('not a URL'), '');
  });

  test('parses ISO durations and chapter timestamps safely', () => {
    assert.equal(isoDurationSeconds('PT1H2M3.5S'), 3723.5);
    assert.equal(isoDurationSeconds('P1DT2H'), 93600);
    assert.equal(isoDurationSeconds('unknown'), null);
    assert.equal(chapterSeconds('1:02:03'), 3723);
    assert.equal(chapterSeconds('04:20'), 260);
    assert.equal(chapterSeconds('1:2:3:4'), null);
  });

  test('accepts leading and trailing chapter formats and rejects regressions', () => {
    assert.deepEqual(parsePlaybackChapters('0:00 Intro\nSong One - 03:12\n02:00 backwards\n7:30 — Finale'), [
      { seconds: 0, title: 'Intro' },
      { seconds: 192, title: 'Song One' },
      { seconds: 450, title: 'Finale' }
    ]);
  });

  test('scores exact, contained and unrelated track titles', () => {
    const gig = { artist: 'Test Artist', songs: [{ title: 'The Big Song', artist: 'Test Artist' }, { title: 'Closer' }] };
    assert.equal(playbackTitleScore('The Big Song', gig.songs[0], gig), 1);
    assert.ok(playbackTitleScore('Test Artist – The Big Song (Live)', gig.songs[0], gig) >= .9);
    assert.equal(playbackTitleScore('Something Else', gig.songs[0], gig), 0);
    assert.equal(bestPlaybackSong(gig, 'Closer official video').songIndex, 1);
  });

  test('interpolates monotonic whole-show timings around weighted anchors', () => {
    const estimates = estimateFullShowTimings(4, 400, [
      { songIndex: 1, seconds: 80, weight: 1 },
      { songIndex: 1, seconds: 100, weight: 2 },
      { songIndex: 3, seconds: 300, weight: 2 }
    ]);
    assert.deepEqual(estimates.map(({ songIndex, startSeconds, endSeconds }) => ({ songIndex, startSeconds, endSeconds })), [
      { songIndex: 0, startSeconds: 0, endSeconds: 100 },
      { songIndex: 1, startSeconds: 100, endSeconds: 200 },
      { songIndex: 2, startSeconds: 200, endSeconds: 300 },
      { songIndex: 3, startSeconds: 300, endSeconds: 400 }
    ]);
    assert.deepEqual(estimateFullShowTimings(0, 400), []);
    assert.deepEqual(estimateFullShowTimings(2, 0), []);
  });

  test('builds chapter-based plans and keeps existing sources as fallbacks', () => {
    const gig = { artist: 'Test Artist', venue: 'Test Hall', songs: [{ title: 'Opening Track' }, { title: 'Final Track' }] };
    const media = [{
      id: 'youtube-1', mimeType: 'video/youtube', category: 'show', caption: 'Test Artist full concert at Test Hall',
      sourceDescription: '0:00 Opening Track\n2:00 Final Track', sourceDuration: 300,
      playbackClips: [{ songIndex: 0, startSeconds: 0, endSeconds: 120 }]
    }, {
      id: 'phone-clip', mimeType: 'video/mp4', category: 'show', caption: 'Opening Track', recognitionTitle: 'Opening Track', playbackClips: []
    }];
    const suggestions = suggestPlaybackPlan(gig, media);
    assert.deepEqual(suggestions.map((entry) => entry.songIndex), [0, 1]);
    assert.equal(suggestions[0].fallbackOnly, true);
    assert.equal(suggestions[1].startSeconds, 120);
    assert.equal(suggestions[1].endSeconds, 300);
  });

  test('prefers AudD recognition and ignores artifacts and non-video media', () => {
    const gig = { artist: 'Artist', venue: 'Venue', songs: [{ title: 'Known Song' }] };
    const suggestions = suggestPlaybackPlan(gig, [
      { id: 'photo', mimeType: 'image/jpeg', category: 'show', recognitionTitle: 'Known Song', playbackClips: [] },
      { id: 'artifact', mimeType: 'video/mp4', category: 'artifact', recognitionTitle: 'Known Song', playbackClips: [] },
      { id: 'clip', mimeType: 'video/mp4', category: 'show', recognitionTitle: 'Known Song', playbackClips: [], caption: 'phone clip' }
    ]);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].mediaId, 'clip');
    assert.match(suggestions[0].reason, /AudD/);
  });
});
