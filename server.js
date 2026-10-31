const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const rooms = new Map();
const COLORS = [
  { name: 'Coral', hex: '#ff6b61' }, { name: 'Blue', hex: '#5887ff' },
  { name: 'Lime', hex: '#b9df54' }, { name: 'Violet', hex: '#9b72ef' },
  { name: 'Gold', hex: '#ffc857' }, { name: 'Mint', hex: '#48d6ae' },
];
const AVATARS = ['🐱', '🦊', '🐼', '🐸', '🐯', '🐰', '🐲', '🐺'];
const id = (n = 8) => crypto.randomBytes(n).toString('hex');
const cleanName = (s) => String(s || '').trim().replace(/[<>]/g, '').slice(0, 16) || 'Player';
const cleanAvatar = (s) => {
  if (AVATARS.includes(s)) return s;
  if (/^anime-(?:male|female)-[1-4]$/.test(String(s || ''))) return s;
  if (s === 'computer') return s;
  if (typeof s === 'string' && s.length <= 120000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/i.test(s)) return s;
  return AVATARS[0];
};
function roomCode() { let c; do { c = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(c)); return c; }
function publicRoom(room, token) {
  return {
    code: room.code, phase: room.phase, mode: room.mode, round: room.round, totalRounds: 4,
    target: room.phase === 'playing' ? { ...room.target, inkHex: room.inkColor?.hex } : null,
    choices: room.phase === 'playing' ? room.choices : [],
    endsAt: room.endsAt,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, answered: !!p.answered, isBot: !!p.isBot, forfeited: !!p.forfeited })),
    matches: room.matches, roundHistory: room.roundHistory, matchNo: room.matchNo,
    me: [...room.players.values()].find(p => p.token === token)?.id || null,
    host: room.host,
  };
}
function beginRound(room) {
  room.phase = 'playing'; room.round += 1;
  room.target = COLORS[Math.floor(Math.random() * COLORS.length)];
  const others = COLORS.filter(c => c.name !== room.target.name);
  room.inkColor = others[Math.floor(Math.random() * others.length)];
  room.choices = [room.target, ...others.sort(() => Math.random() - .5).slice(0, 3)].sort(() => Math.random() - .5);
  for (const p of room.players.values()) p.answered = !!p.forfeited;
  room.roundBaseScores = new Map([...room.players.values()].map(p => [p.id, p.score]));
  room.roundRecorded = false;
  room.endsAt = Date.now() + 9000;
  clearTimeout(room.timer); clearTimeout(room.botTimer);
  room.timer = setTimeout(() => {
    advanceRound(room);
  }, 9100);
  const bot = [...room.players.values()].find(p => p.isBot);
  if (bot) room.botTimer = setTimeout(() => {
    if (room.phase !== 'playing' || bot.answered) return;
    bot.answered = true;
    const elapsed = Math.max(0, 9000 - (room.endsAt - Date.now()));
    if (Math.random() < 0.78) bot.score += Math.max(100, Math.round(1000 * (1 - elapsed / 11500)));
    completeRoundIfReady(room);
  }, 1200 + Math.random() * 3000);
}
function advanceRound(room) {
  if (room.phase !== 'playing') return;
  clearTimeout(room.timer); clearTimeout(room.botTimer); recordRound(room);
  room.phase = room.round >= 4 ? 'finished' : 'between';
  if (room.phase === 'finished') finishMatch(room);
}
function completeRoundIfReady(room) {
  if (room.phase === 'playing' && [...room.players.values()].filter(p => !p.forfeited).every(p => p.answered)) advanceRound(room);
}
function recordRound(room) {
  if (room.roundRecorded) return;
  room.roundRecorded = true;
  room.roundHistory.push({ round: room.round, players: [...room.players.values()].map(p => ({
    id: p.id, name: p.name, avatar: p.avatar, points: p.forfeited ? 0 : p.score - (room.roundBaseScores?.get(p.id) || 0), total: p.score, forfeited: !!p.forfeited,
  })) });
}
function finishMatch(room) {
  if (room.matchSaved) return;
  recordRound(room);
  room.matchSaved = true;
  room.matches.unshift({ roomCode: room.code, number: room.matchNo, finishedAt: new Date().toISOString(),
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, forfeited: !!p.forfeited }))
      .sort((a, b) => Number(a.forfeited) - Number(b.forfeited) || b.score - a.score || a.name.localeCompare(b.name)),
    rounds: room.roundHistory });
  room.matches = room.matches.slice(0, 20);
}
function respond(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)); }
function body(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } }); }); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }); return res.end(); }
  if (req.method === 'POST' && url.pathname === '/api/create') {
    const data = await body(req); const code = roomCode(); const token = id(16); const playerId = id(5);
    const solo = data.mode === 'solo';
    const room = { code, host: playerId, mode: solo ? 'solo' : 'multiplayer', phase: 'lobby', round: 0, matchNo: 1, target: null, choices: [], endsAt: null, timer: null, botTimer: null, createdAt: Date.now(),
      matches: [], roundHistory: [], roundBaseScores: new Map(), roundRecorded: false, matchSaved: false,
      players: new Map([[playerId, { id: playerId, token, name: cleanName(data.name), avatar: cleanAvatar(data.avatar), score: 0, answered: false }]]) };
    if (solo) {
      const botId = `bot-${id(3)}`;
      room.players.set(botId, { id: botId, token: null, name: 'Byte Bot', avatar: 'computer', score: 0, answered: false, isBot: true });
    }
    if (solo) beginRound(room);
    rooms.set(code, room); return respond(res, 200, { token, room: publicRoom(room, token) });
  }
  if (req.method === 'POST' && url.pathname === '/api/join') {
    const data = await body(req); const room = rooms.get(String(data.code || '').toUpperCase());
    if (!room) return respond(res, 404, { error: 'That room code isn’t here. Check it and try again.' });
    if (room.mode === 'solo') return respond(res, 400, { error: 'That room is playing solo. Create a multiplayer room to invite friends.' });
    if (room.phase !== 'lobby') return respond(res, 400, { error: 'This game has already started. Ask the host to make a new room.' });
    if (room.players.size >= 12) return respond(res, 400, { error: 'This room is full (12 players max).' });
    const token = id(16); const playerId = id(5); room.players.set(playerId, { id: playerId, token, name: cleanName(data.name), avatar: cleanAvatar(data.avatar), score: 0, answered: false });
    return respond(res, 200, { token, room: publicRoom(room, token) });
  }
  const match = url.pathname.match(/^\/api\/room\/([A-F0-9]+)(?:\/(start|answer|next|leave))?$/i);
  if (match) {
    const [, code, action] = match; const room = rooms.get(code.toUpperCase());
    if (!room) return respond(res, 404, { error: 'Room closed.' });
    const token = req.headers['x-player-token']; const player = [...room.players.values()].find(p => p.token === token);
    if (!player) return respond(res, 401, { error: 'Session expired. Rejoin the room.' });
    if (player.forfeited) return respond(res, 403, { error: 'You left this match and forfeited your place. You can’t rejoin this game.' });
    if (req.method === 'GET' && !action) return respond(res, 200, { room: publicRoom(room, token) });
    if (req.method === 'POST' && action === 'start') {
      if (player.id !== room.host) return respond(res, 403, { error: 'Only the host can start.' });
      if (room.players.size < 2) return respond(res, 400, { error: 'Invite at least one friend first.' });
      if (room.phase === 'lobby') beginRound(room);
      return respond(res, 200, { room: publicRoom(room, token) });
    }
    if (req.method === 'POST' && action === 'answer') {
      const data = await body(req);
      if (room.phase !== 'playing' || player.answered) return respond(res, 400, { error: 'Round already ended.' });
      player.answered = true;
      const elapsed = Math.max(0, 9000 - (room.endsAt - Date.now()));
      if (data.choice === room.target.name) player.score += Math.max(100, Math.round(1000 * (1 - elapsed / 11500)));
      completeRoundIfReady(room);
      return respond(res, 200, { room: publicRoom(room, token) });
    }
    if (req.method === 'POST' && action === 'next') {
      if (player.id !== room.host) return respond(res, 403, { error: 'Only the host can continue.' });
      if (room.phase === 'between') beginRound(room);
      else if (room.phase === 'finished') {
        room.phase = 'lobby'; room.round = 0; room.matchNo += 1; room.roundHistory = []; room.roundRecorded = false; room.matchSaved = false;
        for (const [playerId, p] of room.players) { if (p.forfeited) room.players.delete(playerId); else p.score = 0; }
      }
      return respond(res, 200, { room: publicRoom(room, token) });
    }
    if (req.method === 'POST' && action === 'leave') {
      if (room.phase === 'playing' || room.phase === 'between') {
        player.forfeited = true; player.answered = true;
        const nextHost = [...room.players.values()].find(p => !p.forfeited && !p.isBot);
        if (room.host === player.id) room.host = nextHost?.id || null;
        if (!nextHost) { clearTimeout(room.timer); clearTimeout(room.botTimer); rooms.delete(room.code); return respond(res, 200, { ok: true, forfeited: true }); }
        completeRoundIfReady(room);
      } else if (room.phase === 'lobby') {
        room.players.delete(player.id);
        if (![...room.players.values()].some(p => !p.isBot)) { clearTimeout(room.timer); clearTimeout(room.botTimer); rooms.delete(room.code); return respond(res, 200, { ok: true }); }
        if (room.host === player.id) room.host = [...room.players.values()].find(p => !p.isBot)?.id || null;
      }
      return respond(res, 200, { ok: true });
    }
  }
  if (req.method === 'GET') {
    const safe = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.join(ROOT, path.normalize(safe).replace(/^([/\\])+/, ''));
    if (!file.startsWith(ROOT)) return respond(res, 403, { error: 'Forbidden' });
    fs.readFile(file, (err, data) => {
      if (err) return respond(res, 404, { error: 'Not found' });
      const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' }); res.end(data);
    }); return;
  }
  respond(res, 404, { error: 'Not found' });
});
setInterval(() => { for (const [code, room] of rooms) if (Date.now() - room.createdAt > 6 * 3600_000) rooms.delete(code); }, 60_000).unref();
server.listen(PORT, () => console.log(`Ink Clash listening on ${PORT}`));

