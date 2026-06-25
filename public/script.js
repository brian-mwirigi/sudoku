const socket = io();

/* ========== DOM ========== */
const $ = id => document.getElementById(id);

// Screens
const joinScreen   = $('join-screen');
const lobbyScreen  = $('lobby-screen');
const gameScreen   = $('game-screen');

// Join
const playerNameInput = $('player-name');
const roomIdInput     = $('room-id');
const joinBtn         = $('join-btn');

// Lobby
const lobbyMyColor   = $('lobby-my-color');
const lobbyMyName    = $('lobby-my-name');
const lobbyRoomCode  = $('lobby-room-code');
const lobbyLinkLabel = $('lobby-link-label');
const lobbyLinkText  = $('lobby-link-text');
const lobbyLinkBox   = $('lobby-link-box');
const copyLinkBtn    = $('copy-link-btn');
const shareBtn       = $('share-btn');
const lobbyWaitMsg   = $('lobby-waiting-msg');
const lobbyPlayersList = $('lobby-players-list');
const startBtn       = $('start-btn');

// Game
const topBadges      = $('game-top-badges');
const boardEl        = $('sudoku-board');
const scoreDisplay   = $('score-display');
const chatAction     = $('chat-action');
const notesAction    = $('notes-action');
const notesLabel     = $('notes-label');
const eraseAction    = $('erase-action');
const numBtns        = document.querySelectorAll('.num-btn');
const statCards      = $('player-stats-cards');
const chatPanel      = $('chat-panel');
const closeChat      = $('close-chat');
const chatInput      = $('chat-input');
const sendChat       = $('send-chat');
const chatMessages   = $('chat-messages');

// Cheat
const cheatOverlay  = $('cheat-overlay');
const cheatReason   = $('cheat-reason');
const dismissCheat  = $('dismiss-cheat');

const toastContainer = $('toast-container');

/* ========== STATE ========== */
let myId = null;
let currentRoom = null;
let puzzle = null;
let solution = null;
let players = {};
let selectedCell = null;
let notesMode = false;
let cellNotes = {};
let filledCells = {};
let gameStarted = false;

const PLAYER_COLORS = ['#c8dead', '#f5e6a3', '#f5c2be', '#b8d4f0'];
const PLAYER_COLORS_STRONG = ['#8cbf5e', '#d4b84a', '#e07a72', '#6aa3d4'];

/* ========== HELPERS ========== */
function showScreen(screen) {
    [joinScreen, lobbyScreen, gameScreen].forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    screen.classList.remove('hidden');
    screen.classList.add('active');
}

function ordinal(n) {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
}

function showToast(message, type = 'info', icon = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="material-symbols-rounded">${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(t);
    setTimeout(() => {
        t.classList.add('leaving');
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

function getJoinLink() {
    return `${window.location.origin}?room=${currentRoom}`;
}

/* ========== JOIN ========== */
joinBtn.addEventListener('click', doJoin);
playerNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
roomIdInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

// Auto-fill room from URL params
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) {
    roomIdInput.value = urlParams.get('room');
}

function doJoin() {
    const name = playerNameInput.value.trim();
    const room = roomIdInput.value.trim().toUpperCase();
    if (!name || !room) return;
    currentRoom = room;
    roomIdInput.value = room;
    socket.emit('joinRoom', room, name);
}

/* ========== LOBBY ========== */
function enterLobby() {
    showScreen(lobbyScreen);
    lobbyRoomCode.textContent = currentRoom;
    const link = getJoinLink();
    lobbyLinkText.textContent = link;

    // Copy link handlers
    const copyLink = () => {
        navigator.clipboard.writeText(link).then(() => {
            lobbyLinkLabel.textContent = 'JOIN LINK (COPIED)';
            lobbyLinkLabel.classList.add('copied');
            setTimeout(() => {
                lobbyLinkLabel.textContent = 'CLICK TO COPY LINK';
                lobbyLinkLabel.classList.remove('copied');
            }, 2000);
        });
    };
    copyLinkBtn.onclick = copyLink;
    lobbyLinkBox.onclick = copyLink;
    lobbyLinkLabel.onclick = copyLink;

    shareBtn.onclick = () => {
        if (navigator.share) {
            navigator.share({ title: 'Neshloves Kim Sudoku', text: 'Join my Sudoku game!', url: link });
        } else {
            copyLink();
        }
    };

    updateLobbyPlayers();
}

function updateLobbyPlayers() {
    const list = Object.values(players).filter(p => p.id !== myId);
    if (list.length === 0) {
        lobbyWaitMsg.textContent = "Looks like you're the first one here.";
        lobbyPlayersList.innerHTML = '';
    } else {
        lobbyWaitMsg.textContent = 'Your fellow players:';
        lobbyPlayersList.innerHTML = '';
        list.forEach(p => {
            const row = document.createElement('div');
            row.className = 'lobby-player-row';
            row.innerHTML = `<div class="lobby-player-dot" style="background:${p.color}"></div><span>${p.name}</span>`;
            lobbyPlayersList.appendChild(row);
        });
    }
}

// Difficulty picker
let selectedDifficulty = 'medium';
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedDifficulty = btn.dataset.diff;
    });
});

startBtn.addEventListener('click', () => {
    socket.emit('startGame', currentRoom, selectedDifficulty);
});

/* ========== GAME ========== */
function enterGame() {
    showScreen(gameScreen);
    gameStarted = true;
    renderBoard();
    updateTopBadges();
    updateStatCards();
    setupAntiCheat();
}

// -- Top badges --
function updateTopBadges() {
    topBadges.innerHTML = '';
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);

    sorted.forEach((p, idx) => {
        const isRight = idx % 2 !== 0;
        const badge = document.createElement('div');
        badge.className = `top-badge ${isRight ? 'right' : ''}`;
        badge.innerHTML = `
            <div class="top-badge-dot" style="background:${p.color}"></div>
            <div class="top-badge-info">
                <span class="top-badge-name">${p.name}</span>
                <span class="top-badge-rank">${ordinal(idx+1)} | ${p.score} pts</span>
            </div>
        `;
        topBadges.appendChild(badge);
    });
}

// -- Board --
function renderBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const val = puzzle[r][c];
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.r = r;
            cell.dataset.c = c;
            if (val !== 0) {
                cell.textContent = val;
                cell.classList.add('given');
            }
            cell.addEventListener('click', () => selectCell(r, c, cell));
            boardEl.appendChild(cell);
        }
    }
}

function getCellEl(r, c) {
    return boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

function selectCell(r, c, cellEl) {
    if (cellEl.classList.contains('opponent-played')) return;
    boardEl.querySelectorAll('.selected, .highlight-related, .highlight-same').forEach(el => {
        el.classList.remove('selected', 'highlight-related', 'highlight-same');
    });
    selectedCell = { r, c, el: cellEl };
    cellEl.classList.add('selected');

    // Highlight row, col, box
    const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
    for (let i = 0; i < 9; i++) {
        if (i !== c) getCellEl(r, i)?.classList.add('highlight-related');
        if (i !== r) getCellEl(i, c)?.classList.add('highlight-related');
    }
    for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) {
            const tr = br+dr, tc = bc+dc;
            if (tr !== r || tc !== c) getCellEl(tr, tc)?.classList.add('highlight-related');
        }

    // Highlight all cells with the same number
    const val = cellEl.textContent.trim();
    if (val && val >= '1' && val <= '9') {
        boardEl.querySelectorAll('.cell').forEach(other => {
            if (other === cellEl) return;
            if (other.textContent.trim() === val) {
                other.classList.add('highlight-same');
            }
        });
    }
}

// -- Number input --
numBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!selectedCell) return;
        const val = parseInt(btn.dataset.val);
        const { r, c, el } = selectedCell;
        if (el.classList.contains('given') || el.classList.contains('opponent-played')) return;
        if (notesMode) { toggleNote(r, c, val); return; }
        socket.emit('playMove', { roomId: currentRoom, r, c, value: val });
    });
});

window.addEventListener('keydown', (e) => {
    if (!selectedCell || !gameStarted) return;
    const { r, c, el } = selectedCell;

    if (e.key >= '1' && e.key <= '9') {
        if (el.classList.contains('given') || el.classList.contains('opponent-played')) return;
        const val = parseInt(e.key);
        if (notesMode) { toggleNote(r, c, val); return; }
        socket.emit('playMove', { roomId: currentRoom, r, c, value: val });
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
        eraseCell();
    }
    // Arrow keys
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
        let nr = r, nc = c;
        if (e.key === 'ArrowUp') nr = Math.max(0, r-1);
        if (e.key === 'ArrowDown') nr = Math.min(8, r+1);
        if (e.key === 'ArrowLeft') nc = Math.max(0, c-1);
        if (e.key === 'ArrowRight') nc = Math.min(8, c+1);
        selectCell(nr, nc, getCellEl(nr, nc));
    }
});

// -- Notes --
notesAction.addEventListener('click', () => {
    notesMode = !notesMode;
    notesAction.classList.toggle('active', notesMode);
    notesLabel.textContent = notesMode ? 'Notes On' : 'Notes';
});

function toggleNote(r, c, val) {
    const key = `${r}_${c}`;
    if (!cellNotes[key]) cellNotes[key] = new Set();
    if (cellNotes[key].has(val)) cellNotes[key].delete(val);
    else cellNotes[key].add(val);
    renderNotes(r, c);
}

function renderNotes(r, c) {
    const key = `${r}_${c}`;
    const el = getCellEl(r, c);
    if (!el || el.classList.contains('given') || el.classList.contains('filled')) return;
    const old = el.querySelector('.notes-grid');
    if (old) old.remove();
    el.textContent = '';
    const notes = cellNotes[key];
    if (!notes || notes.size === 0) return;
    const grid = document.createElement('div');
    grid.className = 'notes-grid';
    for (let n = 1; n <= 9; n++) {
        const s = document.createElement('span');
        s.textContent = notes.has(n) ? n : '';
        grid.appendChild(s);
    }
    el.appendChild(grid);
}

// -- Erase --
eraseAction.addEventListener('click', eraseCell);
function eraseCell() {
    if (!selectedCell) return;
    const { r, c, el } = selectedCell;
    if (el.classList.contains('given') || el.classList.contains('opponent-played')) return;
    delete cellNotes[`${r}_${c}`];
    el.textContent = '';
    el.classList.remove('input-val', 'filled', 'error-val');
    const g = el.querySelector('.notes-grid');
    if (g) g.remove();
}

// -- Stat cards --
function updateStatCards() {
    statCards.innerHTML = '';
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);

    sorted.forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = 'stat-card';

        // Mini board
        const mini = document.createElement('div');
        mini.className = 'stat-mini-board';
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const mc = document.createElement('div');
                mc.className = 'stat-mini-cell';
                const key = `${r}_${c}`;
                if (filledCells[key] && filledCells[key].playerId === p.id) {
                    mc.style.background = p.color;
                } else if (puzzle && puzzle[r][c] !== 0) {
                    mc.style.background = '#e8e8e8';
                } else {
                    mc.style.background = '#fff';
                }
                mini.appendChild(mc);
            }
        }

        const details = document.createElement('div');
        details.className = 'stat-details';
        details.innerHTML = `
            <div class="stat-name">
                <div class="stat-dot" style="background:${p.color}"></div>
                ${p.name}
            </div>
            <div class="stat-meta">
                ${ordinal(idx+1)} of ${sorted.length}<br>
                Score: <strong>${p.score}</strong><br>
                Firsts: <strong>${p.firsts || 0}</strong><br>
                Mistakes: <strong>${p.mistakes || 0}</strong>
            </div>
        `;

        card.appendChild(mini);
        card.appendChild(details);
        statCards.appendChild(card);
    });
}

// -- Chat --
chatAction.addEventListener('click', () => chatPanel.classList.toggle('hidden'));
closeChat.addEventListener('click', () => chatPanel.classList.add('hidden'));
sendChat.addEventListener('click', doSendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSendChat(); });

function doSendChat() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('chatMessage', { roomId: currentRoom, message: msg });
    chatInput.value = '';
}

function addChatMessage(name, text) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="msg-name">${name}:</span> <span class="msg-text">${text}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ========== ANTI-CHEAT ========== */
let cheatCooldown = false;

function setupAntiCheat() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') triggerCheat('Tab switch or window minimize detected');
    });
    window.addEventListener('blur', () => triggerCheat('Window lost focus'));
    window.addEventListener('keyup', e => { if (e.key === 'PrintScreen') triggerCheat('PrintScreen key pressed'); });
}

function triggerCheat(reason) {
    if (cheatCooldown || !gameStarted) return;
    cheatCooldown = true;
    setTimeout(() => cheatCooldown = false, 3000);
    socket.emit('cheatDetected', currentRoom);
    cheatReason.textContent = reason + '. Stay on the game tab!';
    cheatOverlay.classList.remove('hidden');
}

dismissCheat.addEventListener('click', () => cheatOverlay.classList.add('hidden'));

/* ========== SOCKET EVENTS ========== */

socket.on('lobbyState', (state) => {
    puzzle = state.puzzle;
    players = state.players;
    myId = state.myId;
    filledCells = {};

    // Set my color on lobby
    if (players[myId]) {
        lobbyMyName.textContent = players[myId].name;
        lobbyMyColor.style.background = players[myId].color;
    }
    enterLobby();
});

socket.on('playerJoined', (updatedPlayers) => {
    players = updatedPlayers;
    if (!gameStarted) {
        updateLobbyPlayers();
    } else {
        updateTopBadges();
        updateStatCards();
    }
    const names = Object.values(updatedPlayers).filter(p => p.id !== myId).map(p => p.name);
    if (names.length > 0) {
        showToast(`${names[names.length-1]} joined!`, 'info', 'person_add');
    }
});

socket.on('playerLeft', (updatedPlayers) => {
    players = updatedPlayers;
    if (!gameStarted) updateLobbyPlayers();
    else { updateTopBadges(); updateStatCards(); }
});

socket.on('gameState', (state) => {
    puzzle = state.puzzle;
    players = state.players;
    myId = state.myId;
    filledCells = state.filledCells || {};
    cellNotes = {};
    checkCompletedNumbers();
});

socket.on('gameStarted', () => {
    enterGame();
});

socket.on('moveResult', (data) => {
    const { r, c, value, correct, score } = data;
    players[myId].score = score;
    if (!correct) {
        players[myId].mistakes = (players[myId].mistakes || 0) + 1;
    } else {
        players[myId].firsts = (players[myId].firsts || 0) + 1;
        filledCells[`${r}_${c}`] = { playerId: myId, value };
    }
    updateTopBadges();
    scoreDisplay.textContent = players[myId].score;

    const cellEl = getCellEl(r, c);
    if (correct) {
        delete cellNotes[`${r}_${c}`];
        const ng = cellEl.querySelector('.notes-grid');
        if (ng) ng.remove();
        cellEl.textContent = value;
        cellEl.classList.add('filled', 'input-val', 'correct-flash');
        cellEl.style.color = players[myId].color.replace(/[a-f0-9]{6}$/i, m => {
            // Darken the color for text readability
            return PLAYER_COLORS_STRONG[PLAYER_COLORS.indexOf(players[myId].color)] || players[myId].color;
        });
        cellEl.style.color = PLAYER_COLORS_STRONG[PLAYER_COLORS.indexOf(players[myId].color)] || players[myId].color;
        cellEl.classList.remove('selected');
        setTimeout(() => cellEl.classList.remove('correct-flash'), 300);
        if (selectedCell && selectedCell.r === r && selectedCell.c === c) selectedCell = null;
        clearRelatedNotes(r, c, value);
        checkCompletedNumbers();
    } else {
        cellEl.textContent = value;
        cellEl.classList.add('error-val', 'error-flash');
        setTimeout(() => cellEl.classList.remove('error-flash'), 500);
    }
    updateStatCards();
});

socket.on('opponentPlayed', (data) => {
    const { r, c, value, playerId, scores } = data;
    players = scores;
    filledCells[`${r}_${c}`] = { playerId, value };
    updateTopBadges();
    scoreDisplay.textContent = players[myId]?.score || 0;

    const cellEl = getCellEl(r, c);
    if (cellEl && !cellEl.classList.contains('given')) {
        cellEl.classList.add('filled', 'opponent-played');
        cellEl.style.setProperty('--opponent-color', players[playerId]?.color || PLAYER_COLORS[0]);
        delete cellNotes[`${r}_${c}`];
        const ng = cellEl.querySelector('.notes-grid');
        if (ng) ng.remove();
        cellEl.textContent = '';
        if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
            selectedCell.el.classList.remove('selected');
            selectedCell = null;
        }
    }
    updateStatCards();
    checkCompletedNumbers();
});

socket.on('scoreUpdate', (updatedPlayers) => {
    players = updatedPlayers;
    updateTopBadges();
    scoreDisplay.textContent = players[myId]?.score || 0;
    updateStatCards();
});

socket.on('cheatAlert', (playerName) => {
    showToast(`🚨 ${playerName} may have taken a screenshot!`, 'cheat', 'warning');
});

socket.on('chatMsg', (data) => {
    addChatMessage(data.name, data.message);
});

/* ========== NOTE CLEANUP ========== */
function clearRelatedNotes(r, c, val) {
    const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
    const cells = new Set();
    for (let i = 0; i < 9; i++) { cells.add(`${r}_${i}`); cells.add(`${i}_${c}`); }
    for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
            cells.add(`${br+dr}_${bc+dc}`);
    cells.forEach(key => {
        if (cellNotes[key]?.has(val)) {
            cellNotes[key].delete(val);
            const [nr, nc] = key.split('_').map(Number);
            renderNotes(nr, nc);
        }
    });
}

/* ========== NUMBER FADEOUT ========== */
function checkCompletedNumbers() {
    if (!puzzle) return;
    const counts = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0 };
    
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const given = puzzle[r][c];
            if (given !== 0) counts[given]++;
            else {
                const filled = filledCells[`${r}_${c}`];
                if (filled && filled.value) {
                    counts[filled.value]++;
                }
            }
        }
    }
    
    numBtns.forEach(btn => {
        const val = parseInt(btn.dataset.val);
        if (counts[val] === 9) {
            btn.classList.add('fade-out');
        } else {
            btn.classList.remove('fade-out');
        }
    });
}
