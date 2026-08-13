const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Prompt user for name immediately before loading network assets
const chosenName = prompt("Enter your multiplayer runner username:", "Guest Player");
socket.emit('joinGame', chosenName || "Anonymous");

const CONFIG = {
    GRAVITY: 0.5,
    FRICTION: 0.85,
    WALK_SPEED: 4.5,
    JUMP_FORCE: 13,
    SPAWN_X: 40,
    SPAWN_Y: 200,
    LAVA_BASE_HEIGHT: 50
};

let myId = null;
let players = {};
let platforms = [];
let currentLevelIndex = 0; // State variable track
let localScore = 0;

const keys = { ArrowUp: false, ArrowLeft: false, ArrowRight: false };

// --- 10 HARDCORE OBSTACLE MAPS (0=Sky, 1=Platform, 2=Bouncer, 3=Spikes) ---
const ALL_LEVELS = [
    // Level 1: The Squeeze (Narrow gaps and precision drops with spikes)
    [
        "1111001111",
        "0000000000",
        "0000000000",
        "1100000011",
        "0000030000",
        "0001111000",
        "0000000000",
        "0110000110", // Added Spike Hazard!
        "1100000011",
        "0000000000"
    ],
    // Level 2: The Lava Chasm (One giant gap, one tiny jump platform)
    [
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000003000",
        "0000011000",
        "0001000000", // Added Spike Trap!
        "1100000011",
        "0000000000"
    ],
    // Level 3: Trampoline Tunnel (You MUST use the bouncer to cross)
    [
        "0000000000",
        "0000000000",
        "4000000003",
        "1110000111",
        "0000000000",
        "0000000000",
        "0000220000",
        "0000000000",
        "1100000011", // Added Spike Underbelly!
        "0000000000"
    ],
    // Level 4: The Pillars (Three single-block pillars over open magma)
    [
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000300",
        "0001001100", // Spike hidden on standard path!
        "1100000011",
        "0000000000"
    ],
    // Level 5: Staircase of Death (Alternating steps over open drops)
    [
        "0000000011",
        "0000000100",
        "0000011000",
        "0000000000",
        "0400000000",
        "0100030000", // Watch your drop point!
        "0000000000",
        "0000200000",
        "1100000000",
        "0000000000"
    ],
    // Level 6: Cloud Hopping (Tiny platforms positioned at maximum jump reach)
    [
        "0000000000",
        "0000110000",
        "0000000030",
        "0000000111",
        "0000001000",
        "0000010000",
        "0000000000", // Mid-air drop hazard
        "0000100000",
        "1100000000",
        "0000000000"
    ],
    // Level 7: Bouncer Zig-Zag (High rhythm bouncing required to scale)
    [
        "0000000011",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0220030000", // Spike right behind a boost spring!
        "0000000000",
        "1100001111",
        "0000000000"
    ],
    // Level 8: Leap of Faith (Blinded dropdown paths around obstacles)
    [
        "1100000011",
        "1110000111",
        "0000000000",
        "0000110000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0001310000", // Blind drop spike!
        "1100000011",
        "0000000000"
    ],
    // Level 9: Precision Springing (Narrow spring pad centered in a massive hazard zone)
    [
        "0000000000",
        "3000000003",
        "1110000111",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000130000", // Guarded platform edge
        "0000000003",
        "1100000011",
        "0000000000"
    ],
    // Level 10: Hell's Corridor (Absolute bare minimum safety structures)
    [
        "1110000111",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000000",
        "0000000030",
        "1100200011", // Spikes guarding the final dash!
        "0000000000"
    ]
];

class Platform {
    constructor(x, y, width, height, type = 1) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;
        this.collected = false; // <-- ADD THIS LINE
    }
    draw(context) {
        if (this.type === 4) { // <-- ADD THIS COIN BLOCK LOGIC
            if (this.collected) return;
            context.fillStyle = '#ffd700'; // Gold color
            context.beginPath();
            context.arc(this.x + this.width / 2, this.y + this.height / 2, 8, 0, Math.PI * 2);
            context.fill();
            context.strokeStyle = '#b8860b';
            context.stroke();
        } else if (this.type === 3) {
            // Draw dangerous sharp spike triangles
            context.fillStyle = '#ff5555';
            context.beginPath();
            // Point 1 (Bottom Left)
            context.moveTo(this.x, this.y + this.height);
            // Point 2 (Top Middle Apex)
            context.lineTo(this.x + this.width / 2, this.y);
            // Point 3 (Bottom Right)
            context.lineTo(this.x + this.width, this.y + this.height);
            context.fill();
        } else if (this.type === 2) {
            context.fillStyle = '#ff3333'; // Crimson bouncer
            context.fillRect(this.x, this.y, this.width, this.height);
        } else {
            context.fillStyle = '#44bb44'; // Grassy platform
            context.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Engine {
    static loadLevelIndex(idx) {
        platforms = []; // Flush old level vectors
        const rows = ALL_LEVELS[idx];
        const blockW = canvas.width / rows.length;
        const blockH = canvas.height / rows.length;

        rows.forEach((row, rowIndex) => {
            row.split('').forEach((cellValue, colIndex) => {
                const type = parseInt(cellValue, 10);
                if (type > 0) {
                    platforms.push(new Platform(colIndex * blockW, rowIndex * blockH, blockW, blockH, type));
                }
            });
        });
    }
    static checkAABB(r1, r2) {
        return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x &&
               r1.y < r2.y + r2.height && r1.y + r1.height > r2.y;
    }
}

// --- NETWORKING DATA LOGIC ---
socket.on('currentPlayers', (serverPlayers) => {
    players = serverPlayers;
    myId = socket.id;
    Object.keys(players).forEach(id => initPhysicsState(players[id]));
});
socket.on('newPlayer', (data) => {
    players[data.id] = data.playerInfo;
    initPhysicsState(players[data.id]);
});
socket.on('playerMoved', (data) => {
    if (players[data.id]) {
        players[data.id].x = data.x;
        players[data.id].y = data.y;
    }
});
socket.on('playerDisconnected', (id) => delete players[id]);

function initPhysicsState(pObj) {
    pObj.vx = 0; pObj.vy = 0;
    pObj.width = 24; pObj.height = 32;
    pObj.grounded = false;
}

window.addEventListener('keydown', (e) => { if (e.key in keys) keys[e.key] = true; });
window.addEventListener('keyup', (e) => { if (e.key in keys) keys[e.key] = false; });

function runUpdateCycle() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw level static geometries
    platforms.forEach(p => p.draw(ctx));

    // 2. Render Lava Horizon
    let lavaSurfaceY = canvas.height - CONFIG.LAVA_BASE_HEIGHT;
    let lavaGrad = ctx.createLinearGradient(0, lavaSurfaceY, 0, canvas.height);
    lavaGrad.addColorStop(0, '#ff1a00'); lavaGrad.addColorStop(0.4, '#ff6600'); lavaGrad.addColorStop(1, '#660000');
    ctx.fillStyle = lavaGrad;
    ctx.fillRect(0, lavaSurfaceY, canvas.width, CONFIG.LAVA_BASE_HEIGHT);

    // 3. Render Top Banner HUD Text 
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`STAGE: ${currentLevelIndex + 1} / 10`, 20, 30);
    ctx.fillText(`COINS: ${localScore}`, 20, 55);


    // 4. Local Simulation Pipeline Loop
    if (myId && players[myId]) {
        const local = players[myId];

        if (keys.ArrowLeft)  local.vx = -CONFIG.WALK_SPEED;
        if (keys.ArrowRight) local.vx = CONFIG.WALK_SPEED;
        local.vx *= CONFIG.FRICTION;
        local.vy += CONFIG.GRAVITY;

        // X movement physics handling
        local.x += local.vx;
        let hitSpike = false;
        
        platforms.forEach(p => {
            if (Engine.checkAABB(local, p)) {
                if (p.type === 3) { hitSpike = true; return; }
                if (local.vx > 0) local.x = p.x - local.width;
                if (local.vx < 0) local.x = p.x + p.width;
            }
        });

        // Y movement physics handling
        local.grounded = false;
        local.y += local.vy;
        
        platforms.forEach(p => {
    if (Engine.checkAABB(local, p)) {
        // 1. Check for Coin collection
        if (p.type === 4) { 
            if (!p.collected) { 
                p.collected = true; 
                localScore += 1; 
            }
            return; // Skip normal solid wall blocking
        }
        
        // 2. Check for Spike damage
        if (p.type === 3) { 
            hitSpike = true; 
            return; 
        }
        
        // 3. Handle Normal Solid Landings / Ceilings
        if (local.vy > 0) {
            local.y = p.y - local.height;
            local.vy = p.type === 2 ? -CONFIG.JUMP_FORCE * 1.5 : 0;
            local.grounded = true;
        } else if (local.vy < 0) {
            local.y = p.y + p.height;
            local.vy = 0;
        }
    }
});


        // Handle Jump commands
        if (keys.ArrowUp && local.grounded) {
            local.vy = -CONFIG.JUMP_FORCE;
            local.grounded = false;
        }

        // Prevent moving past the left edge
        if (local.x < 0) local.x = 0;

        // PROGRESSION MATRIX RULE: Reaching absolute right edge increments current level index
        if (local.x > canvas.width - local.width) {
            currentLevelIndex = (currentLevelIndex + 1) % ALL_LEVELS.length;
            Engine.loadLevelIndex(currentLevelIndex);
            local.x = CONFIG.SPAWN_X;
            local.y = CONFIG.SPAWN_Y;
            local.vx = 0; local.vy = 0;
        }

        // Spike or Lava Hazard evaluation death snap
        if (hitSpike || local.y + local.height >= lavaSurfaceY) {
            local.x = CONFIG.SPAWN_X; 
            local.y = CONFIG.SPAWN_Y;
            local.vx = 0; 
            local.vy = 0;
            local.grounded = false;
        }

        socket.emit('playerMovement', { x: local.x, y: local.y });
    }

  // 5. Draw Segmented Players + Floating Names
    Object.keys(players).forEach((id) => {
        const p = players[id];
        const pX = p.x; const pY = p.y;
        const pW = p.width || 24; const pH = p.height || 32;

        const headH = pH * 0.25; const bodyH = pH * 0.50; const feetH = pH * 0.25;
        const palette = p.colors || { head: '#fff', body: '#888', feet: '#000' };

        // Render Slices
        ctx.fillStyle = palette.head; ctx.fillRect(pX, pY, pW, headH);
        ctx.fillStyle = palette.body; ctx.fillRect(pX, pY + headH, pW, bodyH);
        ctx.fillStyle = palette.feet; ctx.fillRect(pX, pY + headH + bodyH, pW, feetH);

        // Draw Floating Username centered directly over the player's head
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.username || 'Guest', pX + (pW / 2), pY - 8);
    });

    requestAnimationFrame(runUpdateCycle);
}
// Initial engine activation
Engine.loadLevelIndex(currentLevelIndex);
requestAnimationFrame(runUpdateCycle);
