'use strict';

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(payload));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

async function readBody(request, maxBytes = 30_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  try {
    return body ? JSON.parse(body) : {};
  } catch (error) {
    error.message = 'Request body must contain valid JSON.';
    error.status = 400;
    throw error;
  }
}

module.exports = { sendJson, sendError, redirect, readBody };
