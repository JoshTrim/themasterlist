const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { sendJson, sendError, redirect, readBody } = require('../lib/http');

function responseRecorder() {
  return { status: null, headers: null, body: null, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; } };
}

function requestChunks(...chunks) {
  return { async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; } };
}

describe('HTTP helpers', () => {
  test('writes JSON responses and preserves additional headers', () => {
    const response = responseRecorder();
    sendJson(response, 201, { ok: true }, { 'Cache-Control': 'no-store' });
    assert.equal(response.status, 201);
    assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8');
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(JSON.parse(response.body), { ok: true });
  });

  test('uses the standard error envelope and redirects', () => {
    const errorResponse = responseRecorder();
    sendError(errorResponse, 400, 'Bad input');
    assert.deepEqual(JSON.parse(errorResponse.body), { error: 'Bad input' });
    const redirectResponse = responseRecorder();
    redirect(redirectResponse, '/shows');
    assert.equal(redirectResponse.status, 302);
    assert.equal(redirectResponse.headers.Location, '/shows');
  });

  test('parses chunked JSON by byte length and rejects oversized or invalid bodies', async () => {
    assert.deepEqual(await readBody(requestChunks('{"name":', '"Archive Owner"}')), { name: 'Archive Owner' });
    assert.deepEqual(await readBody(requestChunks()), {});
    await assert.rejects(readBody(requestChunks('12345'), 4), /too large/i);
    await assert.rejects(readBody(requestChunks('{broken')), SyntaxError);
  });
});
