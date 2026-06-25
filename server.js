const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

function generateSudoku() {
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
    
    // Simple randomization: swap rows within bands
    for (let i = 0; i < 9; i += 3) {
        let r1 = i + Math.floor(Math.random() * 3);
        let r2 = i + Math.floor(Math.random() * 3);
        let temp = base[r1];
        base[r1] = base[r2];
        base[r2] = temp;
    }

    let solution = JSON.parse(JSON.stringify(base));
    let puzzle = JSON.parse(JSON.stringify(base));

    const cellsToRemove = 40;
    for (let i = 0; i < cellsToRemove; i++) {
        let r = Math.floor(Math.random() * 9);
        let c = Math.floor(Math.random() * 9);
        puzzle[r][c] = 0;
    }

    return { solution, puzzle };
}

const games = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinRoom', (roomId, playerName) => {
        socket.join(roomId);
        
        if (!games[roomId]) {
            const { puzzle, solution } = generateSudoku();
            games[roomId] = {
                puzzle,
                solution,
                players: {},
                filledCells: {},
                colors: ['#FF3366', '#33CCFF', '#00FF66', '#FF9900']
            };
        }

        const game = games[roomId];
        const color = game.colors[Object.keys(game.players).length % game.colors.length];
        
        game.players[socket.id] = {
            id: socket.id,
            name: playerName || 'Player',
            score: 0,
            color: color
        };

        socket.emit('gameState', {
            puzzle: game.puzzle,
            players: game.players,
            filledCells: game.filledCells,
            myId: socket.id
        });

        socket.to(roomId).emit('playerJoined', game.players);
    });

    socket.on('playMove', ({ roomId, r, c, value }) => {
        const game = games[roomId];
        if (!game) return;

        const correct = (game.solution[r][c] === value);
        
        if (correct && !game.filledCells[`${r}_${c}`]) {
            game.filledCells[`${r}_${c}`] = { playerId: socket.id, correct: true };
            game.players[socket.id].score += 10;

            socket.emit('moveResult', { r, c, value, correct, score: game.players[socket.id].score });
            
            socket.to(roomId).emit('opponentPlayed', { 
                r, c, 
                playerId: socket.id, 
                scores: game.players 
            });
        } else if (!correct) {
            game.players[socket.id].score = Math.max(0, game.players[socket.id].score - 5);
            socket.emit('moveResult', { r, c, value, correct, score: game.players[socket.id].score });
            socket.to(roomId).emit('scoreUpdate', game.players);
        }
    });

    socket.on('cheatDetected', (roomId) => {
        const game = games[roomId];
        if (game && game.players[socket.id]) {
            io.to(roomId).emit('cheatAlert', game.players[socket.id].name);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const roomId in games) {
            if (games[roomId].players[socket.id]) {
                delete games[roomId].players[socket.id];
                io.to(roomId).emit('playerLeft', games[roomId].players);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
