const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

/* ========== SUDOKU GENERATOR ========== */
const DIFFICULTY_MAP = {
    easy:   30,
    medium: 40,
    hard:   50,
    expert: 56
};

function generateSudoku(difficulty = 'medium') {
    let base = [
        [5, 3, 4, 6, 7, 8, 9, 1, 2],
        [6, 7, 2, 1, 9, 5, 3, 4, 8],
        [1, 9, 8, 3, 4, 2, 5, 6, 7],
        [8, 5, 9, 7, 6, 1, 4, 2, 3],
        [4, 2, 6, 8, 5, 3, 7, 9, 1],
        [7, 1, 3, 9, 2, 4, 8, 5, 6],
        [9, 6, 1, 5, 3, 7, 2, 8, 4],
        [2, 8, 7, 4, 1, 9, 6, 3, 5],
        [3, 4, 5, 2, 8, 6, 1, 7, 9]
    ];

    // Swap rows within bands
    for (let i = 0; i < 9; i += 3) {
        let r1 = i + Math.floor(Math.random() * 3);
        let r2 = i + Math.floor(Math.random() * 3);
        [base[r1], base[r2]] = [base[r2], base[r1]];
    }
    // Swap columns within bands
    for (let i = 0; i < 9; i += 3) {
        let c1 = i + Math.floor(Math.random() * 3);
        let c2 = i + Math.floor(Math.random() * 3);
        for (let row = 0; row < 9; row++) {
            [base[row][c1], base[row][c2]] = [base[row][c2], base[row][c1]];
        }
    }
    // Swap row bands
    for (let i = 0; i < 2; i++) {
        let b1 = Math.floor(Math.random() * 3) * 3;
        let b2 = Math.floor(Math.random() * 3) * 3;
        for (let j = 0; j < 3; j++) {
            [base[b1+j], base[b2+j]] = [base[b2+j], base[b1+j]];
        }
    }

    const solution = JSON.parse(JSON.stringify(base));
    const puzzle = JSON.parse(JSON.stringify(base));

    const remove = DIFFICULTY_MAP[difficulty] || 40;
    let removed = 0;
    while (removed < remove) {
        const r = Math.floor(Math.random() * 9);
        const c = Math.floor(Math.random() * 9);
        if (puzzle[r][c] !== 0) {
            puzzle[r][c] = 0;
            removed++;
        }
    }

    return { solution, puzzle };
}

/* ========== GAME STATE ========== */
const games = {};

const COLORS = ['#c8dead', '#f5e6a3', '#f5c2be', '#b8d4f0'];

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    /* -- Join Room (enters lobby) -- */
    socket.on('joinRoom', (roomId, playerName) => {
        socket.join(roomId);

        if (!games[roomId]) {
            const { puzzle, solution } = generateSudoku();
            games[roomId] = {
                puzzle,
                solution,
                players: {},
                filledCells: {},
                started: false,
                host: socket.id
            };
        }

        const game = games[roomId];
        const colorIdx = Object.keys(game.players).length % COLORS.length;

        game.players[socket.id] = {
            id: socket.id,
            name: playerName || 'Player',
            score: 0,
            firsts: 0,
            mistakes: 0,
            color: COLORS[colorIdx]
        };

        if (game.started) {
            // Late join — go straight to game
            socket.emit('lobbyState', {
                puzzle: game.puzzle,
                players: game.players,
                filledCells: game.filledCells,
                myId: socket.id
            });
            // Immediately start them
            setTimeout(() => socket.emit('gameStarted'), 100);
        } else {
            // Send lobby state
            socket.emit('lobbyState', {
                puzzle: game.puzzle,
                players: game.players,
                filledCells: game.filledCells,
                myId: socket.id
            });
        }

        // Notify others
        socket.to(roomId).emit('playerJoined', game.players);
    });

    /* -- Start Game -- */
    socket.on('startGame', (roomId, difficulty) => {
        const game = games[roomId];
        if (!game || game.started) return;

        // Regenerate puzzle with chosen difficulty
        const diff = DIFFICULTY_MAP[difficulty] ? difficulty : 'medium';
        const { puzzle, solution } = generateSudoku(diff);
        game.puzzle = puzzle;
        game.solution = solution;
        game.started = true;
        game.difficulty = diff;

        // Send the new puzzle to all players
        for (const pid of Object.keys(game.players)) {
            io.to(pid).emit('gameState', {
                puzzle: game.puzzle,
                players: game.players,
                filledCells: {},
                myId: pid,
                difficulty: diff
            });
        }
        io.to(roomId).emit('gameStarted');
    });

    /* -- Play Move -- */
    socket.on('playMove', ({ roomId, r, c, value }) => {
        const game = games[roomId];
        if (!game || !game.started) return;

        const correct = (game.solution[r][c] === value);

        if (correct && !game.filledCells[`${r}_${c}`]) {
            game.filledCells[`${r}_${c}`] = { playerId: socket.id };
            game.players[socket.id].score += 10;
            game.players[socket.id].firsts += 1;

            socket.emit('moveResult', {
                r, c, value, correct,
                score: game.players[socket.id].score
            });

            socket.to(roomId).emit('opponentPlayed', {
                r, c,
                playerId: socket.id,
                scores: game.players
            });
        } else if (!correct) {
            game.players[socket.id].score = Math.max(0, game.players[socket.id].score - 5);
            game.players[socket.id].mistakes += 1;
            socket.emit('moveResult', {
                r, c, value, correct,
                score: game.players[socket.id].score
            });
            socket.to(roomId).emit('scoreUpdate', game.players);
        }
        // Already filled by someone — ignore
    });

    /* -- Cheat Detection -- */
    socket.on('cheatDetected', (roomId) => {
        const game = games[roomId];
        if (game && game.players[socket.id]) {
            io.to(roomId).emit('cheatAlert', game.players[socket.id].name);
        }
    });

    /* -- Chat -- */
    socket.on('chatMessage', ({ roomId, message }) => {
        const game = games[roomId];
        if (game && game.players[socket.id]) {
            io.to(roomId).emit('chatMsg', {
                name: game.players[socket.id].name,
                message
            });
        }
    });

    /* -- Disconnect -- */
    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);
        for (const roomId in games) {
            if (games[roomId].players[socket.id]) {
                delete games[roomId].players[socket.id];
                io.to(roomId).emit('playerLeft', games[roomId].players);
                // Clean up empty rooms
                if (Object.keys(games[roomId].players).length === 0) {
                    delete games[roomId];
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Neshloves Kim Sudoku running on port ${PORT}`);
});
