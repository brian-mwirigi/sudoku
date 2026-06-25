const socket = io();

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id');
const joinBtn = document.getElementById('join-btn');
const displayRoom = document.getElementById('display-room');
const boardEl = document.getElementById('sudoku-board');
const playersListEl = document.getElementById('players-list');
const numBtns = document.querySelectorAll('.num-btn');
const cheatOverlay = document.getElementById('cheat-alert-overlay');
const cheatMessage = document.getElementById('cheat-message');
const dismissAlertBtn = document.getElementById('dismiss-alert');

let myId = null;
let currentRoom = null;
let puzzle = null;
let players = {};
let selectedCell = null;

// Audio context could be added for sound effects, keeping it simple for now

// Join Game
joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const room = roomIdInput.value.trim();
    
    if (name && room) {
        currentRoom = room;
        socket.emit('joinRoom', room, name);
        joinScreen.classList.remove('active');
        gameScreen.classList.remove('hidden');
        displayRoom.textContent = room;
        setupAntiCheat();
    } else {
        alert("Please enter both name and room ID.");
    }
});

// Setup Anti-Cheat
let cheatWarned = false;
function setupAntiCheat() {
    // Detect switching tabs or minimizing
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            triggerCheat('Focus lost - Tab switched or minimized');
        }
    });

    // Detect clicking outside the browser window or screenshot tools (sometimes triggers blur)
    window.addEventListener('blur', () => {
        triggerCheat('Window lost focus - Possible screenshot or external tool');
    });

    // Detect PrintScreen key
    window.addEventListener('keyup', (e) => {
        if (e.key === 'PrintScreen') {
            triggerCheat('PrintScreen key detected');
        }
    });
}

function triggerCheat(reason) {
    if (cheatWarned) return; // Prevent spamming
    socket.emit('cheatDetected', currentRoom);
    cheatMessage.textContent = '⚠️ Focus Lost!';
    cheatOverlay.querySelector('p').textContent = `Reason: ${reason}. Please stay focused on the game to prevent cheating!`;
    cheatOverlay.classList.remove('hidden');
    cheatWarned = true;
}

dismissAlertBtn.addEventListener('click', () => {
    cheatOverlay.classList.add('hidden');
    cheatWarned = false;
});

// Render Board
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
            } else {
                // Empty cell
                cell.addEventListener('click', () => selectCell(r, c, cell));
            }
            boardEl.appendChild(cell);
        }
    }
}

function getCellEl(r, c) {
    return document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

function selectCell(r, c, cellEl) {
    if (cellEl.classList.contains('given') || cellEl.classList.contains('filled')) return;
    
    // Deselect previous
    if (selectedCell) {
        selectedCell.el.classList.remove('selected');
    }
    
    selectedCell = { r, c, el: cellEl };
    cellEl.classList.add('selected');
}

// Numpad controls
numBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!selectedCell) return;
        
        const val = parseInt(btn.dataset.val);
        if (val === 0) {
            // Erase
            selectedCell.el.textContent = '';
        } else {
            // Play move
            socket.emit('playMove', { 
                roomId: currentRoom, 
                r: selectedCell.r, 
                c: selectedCell.c, 
                value: val 
            });
        }
    });
});

// Listen for keyboard numbers
window.addEventListener('keydown', (e) => {
    if (!selectedCell) return;
    if (e.key >= '1' && e.key <= '9') {
        socket.emit('playMove', { 
            roomId: currentRoom, 
            r: selectedCell.r, 
            c: selectedCell.c, 
            value: parseInt(e.key) 
        });
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
        selectedCell.el.textContent = '';
    }
});

// Update players list UI
function updatePlayersUI() {
    playersListEl.innerHTML = '';
    for (const id in players) {
        const p = players[id];
        const li = document.createElement('li');
        li.className = 'player-item';
        li.style.setProperty('--player-color', p.color);
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name + (id === myId ? ' (You)' : '');
        
        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'player-score';
        scoreSpan.textContent = p.score;
        
        li.appendChild(nameSpan);
        li.appendChild(scoreSpan);
        playersListEl.appendChild(li);
    }
}

// Socket Events
socket.on('gameState', (state) => {
    puzzle = state.puzzle;
    players = state.players;
    myId = state.myId;
    renderBoard();
    updatePlayersUI();
    
    // Apply already filled cells
    for (const key in state.filledCells) {
        const [r, c] = key.split('_').map(Number);
        const { playerId, correct } = state.filledCells[key];
        const cellEl = getCellEl(r, c);
        if (cellEl) {
            cellEl.classList.add('filled');
            if (playerId !== myId) {
                cellEl.classList.add('opponent-played');
                cellEl.style.setProperty('--opponent-color', players[playerId].color);
            }
        }
    }
});

socket.on('playerJoined', (updatedPlayers) => {
    players = updatedPlayers;
    updatePlayersUI();
});

socket.on('playerLeft', (updatedPlayers) => {
    players = updatedPlayers;
    updatePlayersUI();
});

socket.on('scoreUpdate', (updatedPlayers) => {
    players = updatedPlayers;
    updatePlayersUI();
});

socket.on('moveResult', (data) => {
    const { r, c, value, correct, score } = data;
    players[myId].score = score;
    updatePlayersUI();
    
    if (correct) {
        const cellEl = getCellEl(r, c);
        cellEl.textContent = value;
        cellEl.classList.add('filled', 'input');
        cellEl.classList.remove('selected');
        if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
            selectedCell = null;
        }
    } else {
        // Show wrong visual indicator
        const cellEl = getCellEl(r, c);
        cellEl.style.backgroundColor = 'rgba(239, 68, 68, 0.4)';
        setTimeout(() => {
            cellEl.style.backgroundColor = '';
        }, 500);
    }
});

socket.on('opponentPlayed', (data) => {
    const { r, c, playerId, scores } = data;
    players = scores;
    updatePlayersUI();
    
    const cellEl = getCellEl(r, c);
    if (cellEl && !cellEl.classList.contains('given')) {
        cellEl.classList.add('filled', 'opponent-played');
        cellEl.style.setProperty('--opponent-color', players[playerId].color);
        // Clear text if we were trying to play there
        cellEl.textContent = '';
        if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
            selectedCell.el.classList.remove('selected');
            selectedCell = null;
        }
    }
});

socket.on('cheatAlert', (playerName) => {
    // Notify everyone else that this player might have cheated
    // We create a temporary toast notification in the sidebar or screen
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = 'rgba(239, 68, 68, 0.9)';
    toast.style.color = 'white';
    toast.style.padding = '15px 25px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    toast.style.zIndex = '9999';
    toast.style.animation = 'fadeIn 0.3s ease-out';
    toast.textContent = `🚨 ${playerName} lost focus / possible screenshot!`;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
});
