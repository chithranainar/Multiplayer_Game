const $ = (s) => document.querySelector(s);
const palette = ['#c8f36b', '#a58af7', '#ff8a7d', '#65c9e8', '#ffc857', '#f08bc3'];
let code = '', token = '', room = null, poller = null, ticker = null, toastTimer = null, drawnRound = -1;
const api = async (path, method = 'GET', data) => {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-Player-Token': token }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Something went wrong.'); return result;
};
function flash(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400); }
function name() { return $('#playerName').value.trim() || 'Player'; }
function showGame() { $('#home').classList.add('hidden'); $('#game').classList.remove('hidden'); $('#gameCode').textContent = code; $('#inviteCode').textContent = code; }
function showHome() { $('#game').classList.add('hidden'); $('#home').classList.remove('hidden'); }
function setRoom(r) { const previousPhase = room?.phase; const previousRound = room?.round; room = r; if (previousPhase !== r.phase || previousRound !== r.round) drawnRound = -1; render(); }
async function createRoom() {
  try { const d = await api('/api/create', 'POST', { name: name() }); code = d.room.code; token = d.token; setRoom(d.room); showGame(); startPolling(); }
  catch (e) { flash(e.message); }
}
async function joinRoom(input) {
  const target = input.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!target) return flash('Enter a room code first.');
  try { const d = await api('/api/join', 'POST', { code: target, name: name() }); code = d.room.code; token = d.token; setRoom(d.room); showGame(); startPolling(); }
  catch (e) { flash(e.message); }
}
function startPolling() {
  clearInterval(poller); clearInterval(ticker);
  poller = setInterval(async () => { try { const d = await api(`/api/room/${code}`); setRoom(d.room); } catch (e) { clearInterval(poller); flash(e.message); } }, 850);
  ticker = setInterval(() => { if (room?.phase === 'playing') drawTimer(); }, 180);
}
function sortedPlayers(players) { return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)); }
function scores(target) {
  target.innerHTML = sortedPlayers(room.players).map(p => `<div class="score-row"><span class="mini-dot" style="background:${palette[room.players.indexOf(p) % palette.length]}"></span><span>${escapeHtml(p.name)}${p.id === room.me ? ' <small>(you)</small>' : ''}</span><b>${p.score.toLocaleString()}</b>${p.answered && room.phase === 'playing' ? '<span class="answered-mark">✓</span>' : ''}</div>`).join('');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function render() {
  if (!room) return;
  $('#gameCode').textContent = room.code; $('#inviteCode').textContent = room.code;
  $('#roundInfo').textContent = room.phase === 'playing' ? `ROUND ${room.round} / 4` : room.phase === 'finished' ? 'FINAL SCORES' : room.phase === 'between' ? 'ROUND BREAK' : 'LOBBY';
  $('#playerCount').textContent = room.players.length;
  $('#playerList').innerHTML = room.players.map((p, i) => `<div class="player-chip"><span class="avatar" style="background:${palette[i % palette.length]}">${escapeHtml(p.name.slice(0, 1).toUpperCase())}</span>${escapeHtml(p.name)}${p.id === room.host ? '<span class="host-tag">HOST</span>' : ''}${p.id === room.me ? '<span class="host-tag">YOU</span>' : ''}</div>`).join('');
  const isHost = room.me === room.host;
  $('#lobbyView').classList.toggle('hidden', room.phase !== 'lobby'); $('#roundView').classList.toggle('hidden', room.phase !== 'playing');
  $('#betweenView').classList.toggle('hidden', room.phase !== 'between'); $('#finishedView').classList.toggle('hidden', room.phase !== 'finished');
  if (room.phase === 'lobby') { $('#startBtn').disabled = !isHost || room.players.length < 2; $('#startBtn').innerHTML = room.players.length < 2 ? 'Waiting for a friend… <span>↗</span>' : 'Start the game <span>↗</span>'; $('#hostHint').textContent = isHost ? 'You’re the host — start when everyone’s in.' : 'The host will start the game when everyone’s ready.'; }
  if (room.phase === 'playing') {
    if (drawnRound !== room.round) drawRound(); else updateChoiceLocks();
    scores($('#scoreboard')); drawTimer();
  }
  if (room.phase === 'between') {
    $('#betweenTitle').innerHTML = 'Nice reflexes<span class="period">.</span>'; $('#betweenSub').textContent = `Round ${room.round} is in the books. Here’s how the crew is doing.`; scores($('#betweenScores'));
    $('#nextBtn').classList.toggle('hidden', !isHost); $('#nextHint').classList.toggle('hidden', isHost); $('#nextBtn').textContent = `Round ${room.round + 1} of 4 →`;
  }
  if (room.phase === 'finished') {
    const winner = sortedPlayers(room.players)[0]; $('#winnerTitle').innerHTML = `${escapeHtml(winner?.name || 'A player')} takes the crown<span class="period">.</span>`; scores($('#finalScores'));
    $('#playAgainBtn').classList.toggle('hidden', !isHost); $('#replayHint').classList.toggle('hidden', isHost);
  }
}
function drawRound() {
  drawnRound = room.round; $('#roundLabel').textContent = `ROUND ${room.round} OF 4`;
  $('#bigTarget').style.background = room.target.hex; $('#targetCaption').textContent = room.target.name.toUpperCase();
  $('#choices').innerHTML = room.choices.map(c => `<button class="choice" data-name="${c.name}" aria-label="${c.name}"><div class="swatch" style="background:${c.hex}"></div>${c.name}</button>`).join('');
  $('#choices').querySelectorAll('.choice').forEach(button => button.addEventListener('click', () => answer(button)));
  updateChoiceLocks();
}
async function answer(button) {
  if (room.phase !== 'playing' || room.players.find(p => p.id === room.me)?.answered) return;
  $('#choices').querySelectorAll('button').forEach(b => b.disabled = true);
  const correct = button.dataset.name === room.target.name; button.classList.add(correct ? 'correct' : 'wrong');
  $('#tapPrompt').textContent = correct ? 'That’s the one! Nice reflexes.' : `Not quite — the target was ${room.target.name}.`;
  try { const d = await api(`/api/room/${code}/answer`, 'POST', { choice: button.dataset.name }); setRoom(d.room); }
  catch (e) { flash(e.message); }
}
function updateChoiceLocks() {
  const me = room.players.find(p => p.id === room.me); const answered = !!me?.answered;
  $('#choices').querySelectorAll('.choice').forEach(b => { b.disabled = answered; if (answered && b.dataset.name === room.target.name) b.classList.add('correct'); });
  if (!answered) $('#tapPrompt').textContent = 'Tap its match below. Faster taps score more!';
  else if (!$('#tapPrompt').textContent.startsWith('That’s') && !$('#tapPrompt').textContent.startsWith('Not quite')) $('#tapPrompt').textContent = 'Locked in! See how your friends do…';
}
function drawTimer() {
  if (room?.phase !== 'playing') return;
  const remain = Math.max(0, room.endsAt - Date.now()); $('#timerBar').style.width = `${remain / 9000 * 100}%`; $('#timerText').textContent = Math.ceil(remain / 1000);
  if (!remain) $('#tapPrompt').textContent = 'Time! Here comes the score…';
}
$('#createBtn').addEventListener('click', createRoom);
$('#joinToggle').addEventListener('click', () => { $('#joinForm').classList.toggle('hidden'); if (!$('#joinForm').classList.contains('hidden')) $('#roomCode').focus(); });
$('#joinForm').addEventListener('submit', e => { e.preventDefault(); joinRoom($('#roomCode').value); });
$('#startBtn').addEventListener('click', async () => { try { setRoom((await api(`/api/room/${code}/start`, 'POST')).room); } catch (e) { flash(e.message); } });
$('#nextBtn').addEventListener('click', async () => { try { setRoom((await api(`/api/room/${code}/next`, 'POST')).room); } catch (e) { flash(e.message); } });
$('#playAgainBtn').addEventListener('click', async () => { try { setRoom((await api(`/api/room/${code}/next`, 'POST')).room); } catch (e) { flash(e.message); } });
async function copyCode() { try { await navigator.clipboard.writeText(code); flash('Room code copied! Send it to your friends.'); } catch { flash(`Room code: ${code}`); } }
$('#copyCode').addEventListener('click', copyCode); $('#copyInvite').addEventListener('click', copyCode);
$('#leaveBtn').addEventListener('click', async () => { try { await api(`/api/room/${code}/leave`, 'POST'); } catch {} clearInterval(poller); clearInterval(ticker); showHome(); room = null; code = ''; token = ''; });

