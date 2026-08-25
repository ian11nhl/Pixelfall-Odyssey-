import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

const activePlayers = {};

function generateHexColor() {
    return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Assign fallback temporary username initialization
    activePlayers[socket.id] = {
        x: 60,
        y: 200,
        username: '',
        colors: {
            head: generateHexColor(),
            body: generateHexColor(),
            feet: generateHexColor()
        }
    };

    // Listen for custom verified username initialization from user
    socket.on('joinGame', (usernameInput) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].username = usernameInput || `Player-${socket.id.substring(0, 4)}`;
            
            // Bootstrap states after naming context is resolved
            socket.emit('currentPlayers', activePlayers);
            socket.broadcast.emit('newPlayer', { id: socket.id, playerInfo: activePlayers[socket.id] });
        }
    });

    socket.on('playerMovement', (movementData) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].x = movementData.x;
            activePlayers[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', { id: socket.id, x: activePlayers[socket.id].x, y: activePlayers[socket.id].y });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete activePlayers[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Game engine serving live frames at http://localhost:${PORT}`);
});
