#!/usr/bin/env node
// Ustube: a shared YouTube queue for everyone on the same Wi-Fi.
// Zero dependencies. Run with: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_QUEUE = 200;

const state = {
  nowPlaying: null, // { id, videoId, title, thumb, addedBy }
  queue: [],
  history: [],
};
let nextId = 1;
const clients = new Set();

function broadcast() {
  const data = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) res.write(data);
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

// Accepts any common YouTube link (watch, youtu.be, shorts, music, embed) or a bare 11-char id.
function parseVideoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1, 12) || null;
    if (u.hostname.endsWith('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
      const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}

async function videoInfo(videoId) {
  const fallback = { title: `YouTube video ${videoId}`, author: '' };
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}`);
    if (!r.ok) return fallback;
    const j = await r.json();
    return { title: j.title || fallback.title, author: j.author_name || '' };
  } catch {
    return fallback;
  }
}

// Best-effort search without an API key: read the data YouTube embeds in its results page.
async function searchYouTube(q) {
  const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=en`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' },
  });
  const html = await r.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];
  const results = [];
  (function walk(node) {
    if (!node || typeof node !== 'object' || results.length >= 15) return;
    if (node.videoRenderer && node.videoRenderer.videoId) {
      const v = node.videoRenderer;
      results.push({
        videoId: v.videoId,
        title: (v.title?.runs || []).map(r => r.text).join('') || v.videoId,
        author: v.ownerText?.runs?.[0]?.text || '',
        duration: v.lengthText?.simpleText || '',
      });
      return;
    }
    for (const k in node) walk(node[k]);
  })(JSON.parse(m[1]));
  return results;
}

function thumbFor(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function advance() {
  if (state.nowPlaying) {
    state.history.unshift(state.nowPlaying);
    state.history.length = Math.min(state.history.length, 20);
  }
  state.nowPlaying = state.queue.shift() || null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serveStatic(req, res, pathname) {
  const file = pathname === '/' ? '/index.html' : pathname === '/player' ? '/player.html' : pathname;
  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(full, (err, buf) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (route === 'GET /api/info') {
    return sendJson(res, 200, { port: PORT, urls: lanAddresses().map(ip => `http://${ip}:${PORT}/`) });
  }

  if (route === 'GET /api/search') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return sendJson(res, 200, { results: [] });
    try {
      return sendJson(res, 200, { results: await searchYouTube(q) });
    } catch {
      return sendJson(res, 502, { error: 'Search failed. Paste a YouTube link instead.' });
    }
  }

  if (route === 'POST /api/add') {
    const body = await readBody(req);
    const videoId = parseVideoId(body.url || body.videoId);
    if (!videoId) return sendJson(res, 400, { error: 'That does not look like a YouTube link.' });
    if (state.queue.length >= MAX_QUEUE) return sendJson(res, 429, { error: 'Queue is full.' });
    const info = body.title ? { title: String(body.title).slice(0, 200), author: String(body.author || '').slice(0, 100) } : await videoInfo(videoId);
    const item = {
      id: nextId++,
      videoId,
      title: info.title,
      author: info.author,
      thumb: thumbFor(videoId),
      addedBy: String(body.name || 'Someone').trim().slice(0, 30) || 'Someone',
    };
    if (body.playNext) state.queue.unshift(item); else state.queue.push(item);
    if (!state.nowPlaying) advance();
    broadcast();
    return sendJson(res, 200, { ok: true, item });
  }

  if (route === 'POST /api/next') {
    const body = await readBody(req);
    // Only advance if the caller is skipping the track that is actually playing (avoids double skips).
    if (body.currentId == null || state.nowPlaying?.id === body.currentId) advance();
    broadcast();
    return sendJson(res, 200, { ok: true });
  }

  if (route === 'POST /api/remove') {
    const body = await readBody(req);
    state.queue = state.queue.filter(i => i.id !== body.id);
    broadcast();
    return sendJson(res, 200, { ok: true });
  }

  if (route === 'POST /api/move') {
    const body = await readBody(req);
    const i = state.queue.findIndex(x => x.id === body.id);
    const j = i + (body.dir === 'up' ? -1 : 1);
    if (i >= 0 && j >= 0 && j < state.queue.length) {
      [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
      broadcast();
    }
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' });
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const playerUrl = `http://localhost:${PORT}/player`;
  console.log('\n  Ustube is running\n');
  console.log(`  Player (this computer):  ${playerUrl}`);
  for (const u of lanAddresses().map(ip => `http://${ip}:${PORT}/`)) console.log(`  Guests on the Wi-Fi:     ${u}`);
  console.log('\n  Press Ctrl+C to stop.\n');

  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
    exec(`${cmd} "${playerUrl}"`);
  }
});
