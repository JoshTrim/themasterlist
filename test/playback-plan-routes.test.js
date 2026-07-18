'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createPlaybackPlanRoutes } = require('../lib/routes/playback-plans');

test('playback plan routes suggest, validate and persist ordered clips', async () => {
  const database = new Database(':memory:'); migrateSchema(database);
  database.prepare('INSERT INTO gigs (id, artist, venue, city, date, songs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('gig', 'Artist', 'Hall', 'City', '2026-01-01', '[{"title":"One"},{"title":"Two"}]', 'now');
  database.prepare('INSERT INTO gig_media (id, gig_id, filename, mime_type, category, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('video', 'gig', 'video.mp4', 'video/mp4', 'show', 1, 'now');
  const replies = []; let body = {};
  const mediaRows = (gigId) => database.prepare(`SELECT media.id, media.mime_type AS mimeType, media.category,
    clips.song_index AS songIndex, clips.start_seconds AS startSeconds, clips.end_seconds AS endSeconds, clips.priority
    FROM gig_media media LEFT JOIN media_playback_clips clips ON clips.media_id = media.id WHERE media.gig_id = ? ORDER BY clips.song_index`).all(gigId);
  const handle = createPlaybackPlanRoutes({
    database, requireAccount: () => ({}), readBody: async () => body,
    sendJson: (_response, status, payload) => replies.push({ status, payload }), sendError: (_response, status, error) => replies.push({ status, payload: { error } }),
    findGig: () => ({ id: 'gig', songs: [{ title: 'One' }, { title: 'Two' }] }), mediaRows,
    refreshMetadata: async () => null, suggestPlaybackPlan: () => [{ mediaId: 'video', songIndex: 0 }], now: () => 'timestamp'
  });

  assert.equal(await handle({ method: 'POST' }, {}, new URL('http://x/api/gigs/gig/playback-plan/suggest')), true);
  assert.equal(replies.pop().payload.inspected, 1);

  body = { clips: [
    { mediaId: 'video', songIndex: 0, startSeconds: 0, endSeconds: 60, priority: 4 },
    { mediaId: 'video', songIndex: 1, startSeconds: 60, endSeconds: 120, priority: 2 }
  ] };
  await handle({ method: 'PUT' }, {}, new URL('http://x/api/gigs/gig/playback-plan'));
  assert.equal(replies.pop().status, 200);
  assert.deepEqual(database.prepare('SELECT song_index AS songIndex, priority FROM media_playback_clips ORDER BY song_index').all(), [{ songIndex: 0, priority: 0 }, { songIndex: 1, priority: 0 }]);

  body = { clips: [{ mediaId: 'video', songIndex: 0, startSeconds: 30, endSeconds: 10 }] };
  await handle({ method: 'PUT' }, {}, new URL('http://x/api/gigs/gig/playback-plan'));
  assert.match(replies.pop().payload.error, /end must follow/i);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM media_playback_clips').get().count, 2);
  assert.equal(await handle({ method: 'GET' }, {}, new URL('http://x/api/elsewhere')), false);
  database.close();
});
