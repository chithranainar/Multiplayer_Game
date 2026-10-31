const $ = (s) => document.querySelector(s);
const palette = ['#c8f36b', '#a58af7', '#ff8a7d', '#65c9e8', '#ffc857', '#f08bc3'];
const legacyAvatars = ['🐱', '🦊', '🐼', '🐸', '🐯', '🐰', '🐲', '🐺'];
const avatarPresets = [
  ['anime-male-1', 'Kai'], ['anime-male-2', 'Ren'], ['anime-male-3', 'Sora'], ['anime-male-4', 'Haru'],
  ['anime-female-1', 'Aiko'], ['anime-female-2', 'Mika'], ['anime-female-3', 'Yuna'], ['anime-female-4', 'Emi'],
];
let code = '', token = '', room = null, poller = null, ticker = null, toastTimer = null, drawnRound = -1, celebrationTimer = null;
let savedPhoto = localStorage.getItem('colorDashPhoto') || '';
let selectedAvatar = localStorage.getItem('colorDashAvatar') || 'anime-female-1';
let audioContext = null, musicTimer = null, musicOn = false, musicStep = 0;
const melodyNotes = [659.25, 783.99, 987.77, 783.99, 587.33, 698.46, 880, 698.46, 523.25, 659.25, 783.99, 1046.5, 587.33, 783.99, 987.77, 880];
const bassNotes = [164.81, 130.81, 146.83, 146.83];

const api = async (path, method = 'GET', data) => {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-Player-Token': token }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Something went wrong.'); return result;
};
function flash(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function avatarVisual(value, extra = '') {
  if (/^anime-(?:male|female)-[1-4]$/.test(value || '')) return `<span class="avatar-art cartoon-avatar ${value}" role="img" aria-label="${value.startsWith('anime-male-') ? 'Male' : 'Female'} cartoon avatar"></span>`;
  if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(value || '')) return `<img class="avatar-art ${extra}" src="${escapeHtml(value)}" alt="Player photo"/>`;
  if (value === 'computer') return `<span class="robot-avatar ${extra}" aria-label="Computer">🤖</span>`;
  return `<span class="emoji-avatar ${extra}">${escapeHtml(value || 'anime-female-1')}</span>`;
}
function name() { return $('#playerName').value.trim() || 'Player'; }
function historyKey() { return `colorDashHistory:${code}`; }
function getSavedMatches() { try { return JSON.parse(localStorage.getItem(historyKey()) || '[]'); } catch { return []; } }
function getAllSavedMatches() { try { return JSON.parse(localStorage.getItem('colorDashHistoryAll') || '[]'); } catch { return []; } }
function saveMatches() {
  if (!room?.matches?.length || !code) return;
  try {
    const current = new Map([...getSavedMatches(), ...room.matches].map(m => [m.number, m]));
    const currentMatches = [...current.values()].sort((a, b) => b.number - a.number).slice(0, 20);
    localStorage.setItem(historyKey(), JSON.stringify(currentMatches));
    const all = new Map([...getAllSavedMatches(), ...room.matches].map(m => [`${m.roomCode || code}:${m.number}`, { ...m, roomCode: m.roomCode || code }]));
    localStorage.setItem('colorDashHistoryAll', JSON.stringify([...all.values()].sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt))).slice(0, 50)));
  } catch {}
}
function showGame() { $('#home').classList.add('hidden'); $('#game').classList.remove('hidden'); $('#gameCode').textContent = code; $('#inviteCode').textContent = code; }
function showHome() { $('#game').classList.add('hidden'); $('#home').classList.remove('hidden'); }
function setRoom(r) {
  const previousPhase = room?.phase, previousRound = room?.round; room = r;
  if (previousPhase !== r.phase || previousRound !== r.round) drawnRound = -1;
  saveMatches(); render();
  if (r.phase === 'finished' && previousPhase !== 'finished') playWinnerBurst();
}
function playWinnerBurst() {
  const panel = $('#finishedView');
  playWinnerCheer();
  panel.classList.remove('celebrate');
  void panel.offsetWidth;
  panel.classList.add('celebrate');
  clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => panel.classList.remove('celebrate'), 2400);
}
async function createRoom() {
  try { const d = await api('/api/create', 'POST', { name: name(), avatar: selectedAvatar }); code = d.room.code; token = d.token; setRoom(d.room); showGame(); startPolling(); }
  catch (e) { flash(e.message); }
}
async function createSolo() {
  try { const d = await api('/api/create', 'POST', { name: name(), avatar: selectedAvatar, mode: 'solo' }); code = d.room.code; token = d.token; setRoom(d.room); showGame(); startPolling(); }
  catch (e) { flash(e.message); }
}
async function joinRoom(input) {
  const target = input.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!target) return flash('Enter a room code first.');
  try { const d = await api('/api/join', 'POST', { code: target, name: name(), avatar: selectedAvatar }); code = d.room.code; token = d.token; setRoom(d.room); showGame(); startPolling(); }
  catch (e) { flash(e.message); }
}
function inviteUrl() { return `${location.origin}/?room=${encodeURIComponent(code)}`; }
function inviteMessage() { return `Join my Color Dash game! Room code: ${code}\nTap to join: ${inviteUrl()}`; }
async function copyText(value, success) {
  try { await navigator.clipboard.writeText(value); flash(success); }
  catch { openShareDialog(); flash('Use the invite options to copy or share the link.'); }
}
function openShareDialog() {
  const url = inviteUrl(); const message = `Join my Color Dash game! Room code: ${code}`;
  $('#inviteLink').value = url;
  $('#waShare').href = `https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`;
  $('#tgShare').href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`;
  $('#xShare').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`;
  $('#fbShare').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(message)}`;
  $('#emailShare').href = `mailto:?subject=${encodeURIComponent('Join my Color Dash game')}&body=${encodeURIComponent(inviteMessage())}`;
  $('#shareDialog').showModal();
}
async function shareInvite() {
  if (!code) return;
  if (navigator.share) {
    try { await navigator.share({ title: 'Join my Color Dash game', text: `Room code: ${code}`, url: inviteUrl() }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  openShareDialog();
}
function startPolling() {
  clearInterval(poller); clearInterval(ticker);
  poller = setInterval(async () => { try { const d = await api(`/api/room/${code}`); setRoom(d.room); } catch (e) { clearInterval(poller); flash(e.message); } }, 850);
  ticker = setInterval(() => { if (room?.phase === 'playing') drawTimer(); }, 180);
}
function sortedPlayers(players) { return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)); }
function scores(target) {
  target.innerHTML = sortedPlayers(room.players).map((p, i) => `<div class="score-row"><span class="avatar-score">${avatarVisual(p.avatar || 'anime-female-1')}</span><span class="mini-dot" style="background:${palette[i % palette.length]}"></span><span>${escapeHtml(p.name)}${p.isBot ? ' <small>CPU</small>' : p.id === room.me ? ' <small>(you)</small>' : ''}</span><b>${p.score.toLocaleString()}</b>${p.answered && room.phase === 'playing' ? '<span class="answered-mark">✓</span>' : ''}</div>`).join('');
}
function renderBreakdown(target, rounds) {
  if (!rounds?.length) { target.innerHTML = ''; return; }
  const players = [...new Map(rounds.flatMap(r => r.players).map(p => [p.id, p])).values()];
  const max = Math.max(1, ...rounds.flatMap(r => r.players.map(p => p.points)));
  target.innerHTML = `<div class="chart-heading">POINTS BY ROUND</div><div class="round-chart">${rounds.map(r => `<section class="round-chart-card"><b class="chart-round">ROUND ${r.round}</b>${players.map((p, i) => { const result = r.players.find(x => x.id === p.id); const pts = result?.points || 0; return `<div class="bar-row"><span>${avatarVisual(p.avatar || 'anime-female-1')}</span><div class="bar-track"><i style="width:${Math.max(3, pts / max * 100)}%;background:${palette[i % palette.length]}"></i></div><b>${pts}</b></div>`; }).join('')}</section>`).join('')}</div>`;
}
function renderFinalBoard() {
  const ranked = sortedPlayers(room.players), max = Math.max(1, ...ranked.map(p => p.score));
  $('#finalScores').innerHTML = ranked.map((p, i) => `<div class="final-score-row ${i === 0 ? 'winner-row' : ''}"><span class="rank">${String(i + 1).padStart(2, '0')}</span><span class="final-avatar">${avatarVisual(p.avatar || 'anime-female-1')}</span><div class="final-player"><div><b>${escapeHtml(p.name)}</b>${p.isBot ? '<small>CPU</small>' : p.id === room.me ? '<small>YOU</small>' : ''}</div><div class="score-meter"><i style="width:${p.score / max * 100}%"></i></div></div><strong>${p.score.toLocaleString()}</strong></div>`).join('');
  renderBreakdown($('#finalRounds'), room.roundHistory);
}
function renderHistory() {
  const all = new Map([...getAllSavedMatches(), ...(room?.matches || [])].map(m => [`${m.roomCode || code}:${m.number}`, { ...m, roomCode: m.roomCode || code }]));
  const matches = [...all.values()].sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt))).slice(0, 50);
  const target = $('#historyContent');
  if (!matches.length) { target.innerHTML = '<div class="history-empty">Your completed matches will show up here.</div>'; return; }
  target.innerHTML = matches.map(m => {
    const winner = m.players?.[0]; const date = m.finishedAt ? new Date(m.finishedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
    const board = (m.players || []).map((p, i) => `<div class="history-player"><span class="rank">${i + 1}</span><span>${avatarVisual(p.avatar || 'anime-female-1')}</span><b>${escapeHtml(p.name)}</b><strong>${p.score.toLocaleString()}</strong></div>`).join('');
    return `<article class="history-match"><div class="history-match-head"><b>ROOM ${escapeHtml(m.roomCode || '')} · MATCH ${m.number}</b><span>${escapeHtml(date)}</span></div><p>🏆 ${escapeHtml(winner?.name || 'Match complete')} won with ${(winner?.score || 0).toLocaleString()} points</p><div class="history-board">${board}</div><details><summary>Round-by-round graphics</summary><div class="history-chart-wrap"></div></details></article>`;
  }).join('');
  const wraps = target.querySelectorAll('.history-chart-wrap');
  matches.forEach((m, i) => { if (wraps[i]) renderBreakdown(wraps[i], m.rounds); });
}
function audioEngine() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioContext) audioContext = new AudioCtx();
  return audioContext;
}
function playTone(frequency, seconds = .18, volume = .04, type = 'sine', delay = 0) {
  if (!audioContext) return;
  const osc = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
  const start = now + delay;
  osc.type = type; osc.frequency.value = frequency; gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .025); gain.gain.exponentialRampToValueAtTime(.0001, start + seconds);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(start); osc.stop(start + seconds + .02);
}
function playNote(frequency, seconds = .18, volume = .04, type = 'sine') {
  if (musicOn) playTone(frequency, seconds, volume, type);
}
function playTapSound(correct) {
  const ctx = audioEngine(); if (!ctx) return;
  ctx.resume().then(() => {
    playTone(correct ? 880 : 196, correct ? .14 : .12, correct ? .045 : .035, correct ? 'triangle' : 'sine');
    if (correct) playTone(1174.66, .18, .035, 'sine', .08);
  }).catch(() => {});
}
function playWinnerCheer() {
  const ctx = audioEngine(); if (!ctx) return;
  ctx.resume().then(() => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((note, i) => playTone(note, .34, .04, 'triangle', i * .11));
    [659.25, 783.99, 987.77].forEach(note => playTone(note, .95, .024, 'sine', .62));
    playTone(329.63, .8, .035, 'sine', .62);
  }).catch(() => {});
}
async function toggleMusic() {
  if (!audioEngine()) return flash('Music isn’t supported in this browser.');
  if (audioContext.state === 'suspended') await audioContext.resume();
  musicOn = !musicOn;
  if (musicOn) {
    const melody = () => {
      const beat = musicStep % melodyNotes.length;
      playNote(melodyNotes[beat], .19, .012, 'triangle');
      if (beat % 4 === 0) playNote(bassNotes[Math.floor(beat / 4) % bassNotes.length], .38, .012, 'sine');
      if (beat % 4 === 2) playNote(melodyNotes[(beat + 4) % melodyNotes.length] * 2, .28, .004, 'sine');
      musicStep++;
    };
    melody(); musicTimer = setInterval(melody, 250);
  } else { clearInterval(musicTimer); musicTimer = null; }
  $('#musicToggle').textContent = musicOn ? '♫ Music on' : '♫ Music off'; $('#musicToggle').setAttribute('aria-pressed', String(musicOn));
}
function tapGraphic(button, correct) {
  button.classList.add('tap-pop-correct', correct ? 'tap-pop-right' : 'tap-pop-wrong');
  const fx = document.createElement('span'); fx.className = 'tap-feedback'; fx.textContent = correct ? '✦ NICE!' : '✕'; button.append(fx);
  setTimeout(() => { button.classList.remove('tap-pop-correct', 'tap-pop-right', 'tap-pop-wrong'); fx.remove(); }, 900);
  playTapSound(correct);
}
function render() {
  if (!room) return;
  $('#gameCode').textContent = room.code; $('#inviteCode').textContent = room.code;
  $('#roomType').textContent = room.mode === 'solo' ? 'SOLO' : 'ROOM'; $('#copyCode').classList.toggle('hidden', room.mode === 'solo');
  $('#roundInfo').textContent = room.phase === 'playing' ? `ROUND ${room.round} / 4` : room.phase === 'finished' ? 'FINAL SCORES' : room.phase === 'between' ? 'ROUND BREAK' : 'LOBBY';
  $('#playerCount').textContent = room.players.length;
  $('#playerList').innerHTML = room.players.map((p, i) => `<div class="player-chip"><span class="avatar" style="background:${palette[i % palette.length]}">${avatarVisual(p.avatar || 'anime-female-1')}</span>${escapeHtml(p.name)}${p.isBot ? '<span class="host-tag">CPU</span>' : p.id === room.host ? '<span class="host-tag">HOST</span>' : ''}${p.id === room.me ? '<span class="host-tag">YOU</span>' : ''}</div>`).join('');
  const isHost = room.me === room.host;
  $('#lobbyView').classList.toggle('hidden', room.phase !== 'lobby'); $('#roundView').classList.toggle('hidden', room.phase !== 'playing');
  $('#betweenView').classList.toggle('hidden', room.phase !== 'between'); $('#finishedView').classList.toggle('hidden', room.phase !== 'finished');
  if (room.phase === 'lobby') { $('#startBtn').disabled = !isHost || room.players.length < 2; $('#startBtn').innerHTML = room.players.length < 2 ? 'Waiting for a friend… <span>↗</span>' : 'Start the game <span>↗</span>'; $('#hostHint').textContent = isHost ? 'You’re the host — start when everyone’s in.' : 'The host will start the game when everyone’s ready.'; }
  if (room.phase === 'playing') { if (drawnRound !== room.round) drawRound(); else updateChoiceLocks(); drawTimer(); }
  if (room.phase === 'between') {
    $('#betweenTitle').innerHTML = 'Nice reflexes<span class="period">.</span>'; $('#betweenSub').textContent = room.round < 4 ? `Round ${room.round} complete. Get ready for the next color dash!` : 'All rounds complete. The final results are ready!';
    $('#nextBtn').classList.toggle('hidden', !isHost); $('#nextHint').classList.toggle('hidden', isHost); $('#nextBtn').textContent = `Round ${room.round + 1} of 4 →`;
  }
  if (room.phase === 'finished') {
    const winner = sortedPlayers(room.players)[0]; $('#winnerTitle').innerHTML = `${escapeHtml(winner?.name || 'A player')} takes the crown<span class="period">.</span>`;
    $('#matchNumber').textContent = room.matchNo || 1; renderFinalBoard();
    $('#playAgainBtn').classList.toggle('hidden', !isHost); $('#replayHint').classList.toggle('hidden', isHost);
  }
  if ($('#historyDialog').open) renderHistory();
}
function drawRound() {
  drawnRound = room.round; $('#roundLabel').textContent = `ROUND ${room.round} OF 4`;
  $('#bigTarget').textContent = room.target.name.toUpperCase(); $('#bigTarget').style.color = room.target.inkHex || '#ff749a';
  $('#targetCaption').textContent = 'IGNORE THE INK · PICK THE WORD';
  $('#choices').innerHTML = room.choices.map((c, i) => `<button class="choice" data-name="${c.name}" aria-label="${c.name}, press ${i + 1}" aria-keyshortcuts="${i + 1}"><div class="swatch" style="background:${c.hex}"></div><span class="choice-name">${c.name}</span><kbd>${i + 1}</kbd></button>`).join('');
  $('#choices').querySelectorAll('.choice').forEach(button => button.addEventListener('click', () => answer(button)));
  updateChoiceLocks();
}
async function answer(button) {
  if (room.phase !== 'playing' || room.players.find(p => p.id === room.me)?.answered) return;
  $('#choices').querySelectorAll('button').forEach(b => b.disabled = true);
  const correct = button.dataset.name === room.target.name; button.classList.add(correct ? 'correct' : 'wrong'); tapGraphic(button, correct);
  $('#tapPrompt').textContent = correct ? 'That’s the one! Nice reflexes.' : `Not quite — the target was ${room.target.name}.`;
  try {
    const d = await api(`/api/room/${code}/answer`, 'POST', { choice: button.dataset.name });
    setRoom(d.room);
  }
  catch (e) { flash(e.message); }
}
function updateChoiceLocks() {
  const me = room.players.find(p => p.id === room.me); const answered = !!me?.answered;
  $('#choices').querySelectorAll('.choice').forEach(b => { b.disabled = answered; if (answered && b.dataset.name === room.target.name) b.classList.add('correct'); });
  if (!answered) $('#tapPrompt').textContent = 'Tap the color name below, or press 1–4. Faster answers score more!';
  else if (!$('#tapPrompt').textContent.startsWith('That’s') && !$('#tapPrompt').textContent.startsWith('Not quite')) $('#tapPrompt').textContent = 'Locked in! See how your friends do…';
}
function drawTimer() {
  if (room?.phase !== 'playing') return;
  const remain = Math.max(0, room.endsAt - Date.now()); $('#timerBar').style.width = `${remain / 9000 * 100}%`; $('#timerText').textContent = Math.ceil(remain / 1000);
  if (!remain) $('#tapPrompt').textContent = 'Time! Round complete.';
}
function leaveGame() { if (code && token) api(`/api/room/${code}/leave`, 'POST').catch(() => {}); clearInterval(poller); clearInterval(ticker); showHome(); room = null; code = ''; token = ''; }
function initAvatars() {
  if (!/^anime-(?:male|female)-[1-4]$/.test(selectedAvatar) && !legacyAvatars.includes(selectedAvatar) && !/^data:image\/(?:jpeg|png|webp);base64,/i.test(selectedAvatar)) selectedAvatar = 'anime-female-1';
  function paint() {
    const options = avatarPresets.map(([id, label]) => `<button type="button" class="avatar-option ${selectedAvatar === id ? 'selected' : ''}" data-avatar="${id}" aria-label="Choose ${label}" aria-pressed="${selectedAvatar === id}">${avatarVisual(id)}<small>${label}</small></button>`);
    if (savedPhoto) options.push(`<button type="button" class="avatar-option photo-option ${selectedAvatar === savedPhoto ? 'selected' : ''}" data-photo="true" aria-label="Use your photo" aria-pressed="${selectedAvatar === savedPhoto}">${avatarVisual(savedPhoto)}<small>Your photo</small></button>`);
    $('#avatarOptions').innerHTML = options.join('');
    $('#avatarOptions').querySelectorAll('.avatar-option').forEach(b => b.addEventListener('click', () => {
      selectedAvatar = b.dataset.photo ? savedPhoto : b.dataset.avatar; localStorage.setItem('colorDashAvatar', selectedAvatar);
      $('#avatarOptions').querySelectorAll('.avatar-option').forEach(x => { const selected = x.dataset.photo ? selectedAvatar === savedPhoto : x.dataset.avatar === selectedAvatar; x.classList.toggle('selected', selected); x.setAttribute('aria-pressed', String(selected)); });
    }));
  }
  paint();
  $('#uploadAvatarBtn').addEventListener('click', () => $('#avatarFile').click());
  $('#avatarFile').addEventListener('change', () => {
    const file = $('#avatarFile').files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { flash('Choose an image under 10 MB.'); $('#avatarFile').value = ''; return; }
    const objectUrl = URL.createObjectURL(file), image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight), x = (image.naturalWidth - side) / 2, y = (image.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
      canvas.getContext('2d').drawImage(image, x, y, side, side, 0, 0, 128, 128);
      savedPhoto = canvas.toDataURL('image/jpeg', .78); selectedAvatar = savedPhoto;
      localStorage.setItem('colorDashPhoto', savedPhoto); localStorage.setItem('colorDashAvatar', selectedAvatar);
      URL.revokeObjectURL(objectUrl); $('#avatarFile').value = ''; paint(); flash('Photo ready. It will be shared with your room.');
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); $('#avatarFile').value = ''; flash('That image could not be opened. Choose another one.'); };
    image.src = objectUrl;
  });
}

$('#createBtn').addEventListener('click', createRoom);
$('#soloBtn').addEventListener('click', createSolo);
$('#joinToggle').addEventListener('click', () => { $('#joinForm').classList.toggle('hidden'); if (!$('#joinForm').classList.contains('hidden')) $('#roomCode').focus(); });
$('#joinForm').addEventListener('submit', e => { e.preventDefault(); joinRoom($('#roomCode').value); });
$('#startBtn').addEventListener('click', async () => { try { setRoom((await api(`/api/room/${code}/start`, 'POST')).room); } catch (e) { flash(e.message); } });
$('#nextBtn').addEventListener('click', async () => { try { setRoom((await api(`/api/room/${code}/next`, 'POST')).room); } catch (e) { flash(e.message); } });
$('#playAgainBtn').addEventListener('click', async () => { try { setRoom((await api(`/api/room/${code}/next`, 'POST')).room); } catch (e) { flash(e.message); } });
$('#copyCode').addEventListener('click', () => code && copyText(inviteMessage(), 'Invite copied. Send it to your friends.'));
$('#copyInvite').addEventListener('click', () => copyText(inviteMessage(), 'Invite copied. Send it to your friends.'));
$('#shareInvite').addEventListener('click', shareInvite);
$('#copyLinkBtn').addEventListener('click', () => copyText(inviteUrl(), 'Game link copied. Send it to your friends.'));
$('#closeShare').addEventListener('click', () => $('#shareDialog').close());
$('#shareDialog').addEventListener('click', e => { if (e.target === $('#shareDialog')) $('#shareDialog').close(); });
$('#leaveBtn').addEventListener('click', leaveGame); $('#leaveBetweenBtn').addEventListener('click', leaveGame);
$('#howToOpen').addEventListener('click', () => $('#howToDialog').showModal());
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(`#${b.dataset.close}`).close()));
$('#historyBtn').addEventListener('click', () => { renderHistory(); $('#historyDialog').showModal(); });
$('#musicToggle').addEventListener('click', toggleMusic);
function unlockAudio() {
  const ctx = audioEngine();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });
document.addEventListener('keydown', e => {
  if (room?.phase !== 'playing' || e.altKey || e.ctrlKey || e.metaKey || e.target?.matches('input,textarea,select,[contenteditable="true"]') || $('#howToDialog').open || $('#historyDialog').open) return;
  const index = Number(e.key) - 1;
  if (index < 0 || index > 3) return;
  const button = $('#choices').querySelectorAll('.choice')[index];
  if (button && !button.disabled) { e.preventDefault(); button.click(); }
});
$('#historyDialog').addEventListener('click', e => { if (e.target === $('#historyDialog')) $('#historyDialog').close(); });
initAvatars();
const inviteRoom = new URLSearchParams(location.search).get('room');
if (inviteRoom && /^[A-Z0-9]{6}$/i.test(inviteRoom)) { $('#roomCode').value = inviteRoom.toUpperCase(); $('#joinForm').classList.remove('hidden'); $('#joinToggle').textContent = `Join room ${inviteRoom.toUpperCase()} →`; }


