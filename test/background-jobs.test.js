const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Database = require('better-sqlite3');
const { migrateSchema } = require('../lib/schema');
const { createBackgroundJobs } = require('../lib/background-jobs');

test('background jobs persist progress and only list active work', () => {
  const database = new Database(':memory:');
  migrateSchema(database);
  const jobs = createBackgroundJobs({ database, now: () => '2026-07-18T00:00:00.000Z' });

  assert.deepEqual(jobs.save('one', 'Encode video', 'clip.mov', 'running', 145), {
    id: 'one', type: 'Encode video', name: 'clip.mov', status: 'running', progress: 100, error: null
  });
  assert.equal(jobs.listActive().length, 1);
  jobs.save('one', 'Encode video', 'clip.mov', 'complete', 100);
  assert.deepEqual(jobs.listActive(), []);
  database.close();
});

test('cancelling a running job terminates its process and remains authoritative', () => {
  const database = new Database(':memory:');
  migrateSchema(database);
  const jobs = createBackgroundJobs({ database });
  const child = new EventEmitter();
  let signal = null;
  child.kill = (value) => { signal = value; };

  jobs.save('rotate', 'Rotate video', 'clip.mp4', 'running', 42);
  jobs.attach('rotate', child);
  assert.equal(jobs.cancel('rotate').status, 'cancelled');
  assert.equal(signal, 'SIGTERM');
  assert.equal(jobs.save('rotate', 'Rotate video', 'clip.mp4', 'error', 0, 'late close').status, 'cancelled');
  database.close();
});

test('cancelling missing and completed jobs is safe', () => {
  const database = new Database(':memory:');
  migrateSchema(database);
  const jobs = createBackgroundJobs({ database });
  assert.equal(jobs.cancel('missing'), null);
  jobs.save('done', 'Trim video', 'clip.mp4', 'complete', 100);
  assert.equal(jobs.cancel('done').status, 'complete');
  database.close();
});
