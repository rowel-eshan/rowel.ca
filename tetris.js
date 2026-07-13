const canvas = document.createElement('canvas');
canvas.id = 'tetris-bg';
canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.zIndex = '-2';
canvas.style.pointerEvents = 'none';
document.body.prepend(canvas);
const ctx = canvas.getContext('2d');

let COLS = 30;
let ROWS;
let BLOCK_SIZE;
let yOffset = 0;
let xOffset = 0;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Resize unit size based on screen width to fit COLS perfectly
    BLOCK_SIZE = Math.floor(canvas.width / COLS);
    if (BLOCK_SIZE < 1) BLOCK_SIZE = 1; // Safeguard
    
    // Resize height (ROWS) dynamically to fill screen height
    ROWS = Math.ceil(canvas.height / BLOCK_SIZE);
    
    // Center any leftover pixels horizontally
    xOffset = Math.floor((canvas.width - (COLS * BLOCK_SIZE)) / 2);
    
    // Calculate negative offset to make the board perfectly flush with the bottom
    yOffset = canvas.height - (ROWS * BLOCK_SIZE);
    
    initBoard();
    currentPiece = null;
}

const COLORS = [
    null,
    '#00ffff', // I - cyan
    '#0000ff', // J - blue
    '#ff7f00', // L - orange
    '#ffff00', // O - yellow
    '#00ff00', // S - green
    '#800080', // T - purple
    '#ff0000'  // Z - red
];

const SHAPES = [
    [],
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], 
    [[2,0,0],[2,2,2],[0,0,0]], 
    [[0,0,3],[3,3,3],[0,0,0]], 
    [[4,4],[4,4]], 
    [[0,5,5],[5,5,0],[0,0,0]], 
    [[0,6,0],[6,6,6],[0,0,0]], 
    [[7,7,0],[0,7,7],[0,0,0]]  
];

let board = [];
function initBoard() {
    board = Array.from({length: ROWS || 30}, () => Array(COLS).fill(0));
}

// 7-Bag Randomizer
let bag = [];
function getNextPieceId() {
    if (bag.length === 0) {
        bag = [1, 2, 3, 4, 5, 6, 7];
        // Fisher-Yates shuffle
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
    }
    return bag.pop();
}

class Piece {
    constructor(shapeId) {
        this.shapeId = shapeId;
        this.matrix = SHAPES[shapeId];
        this.x = Math.floor((COLS / 2) - 2);
        this.y = 0;
    }
}

let currentPiece = null;
let targetX = 0;
let targetRotation = 0;
let floatingTexts = [];
let flashTimer = 0;
let shakeTimer = 0;
let lastSpin = false; // Tracks if the last lock was a T-Spin

function rotateMatrix(matrix) {
    const N = matrix.length;
    const res = Array.from({length: N}, () => Array(N).fill(0));
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            res[x][N - 1 - y] = matrix[y][x];
        }
    }
    return res;
}

function collide(b, p, dx=0, dy=0, mat=p.matrix) {
    for (let y = 0; y < mat.length; y++) {
        for (let x = 0; x < mat[y].length; x++) {
            if (mat[y][x] !== 0) {
                let nx = p.x + x + dx;
                let ny = p.y + y + dy;
                if (nx < 0 || nx >= COLS || ny >= ROWS || (ny >= 0 && b[ny] && b[ny][nx] !== 0)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function checkTSpin(p, b) {
    if (p.shapeId !== 6) return false;
    let cx = p.x + 1;
    let cy = p.y + 1;
    let corners = [[cx-1, cy-1], [cx+1, cy-1], [cx-1, cy+1], [cx+1, cy+1]];
    let filled = 0;
    for (let c of corners) {
        let nx = c[0]; let ny = c[1];
        if (nx < 0 || nx >= COLS || ny >= ROWS || (ny >= 0 && b[ny][nx])) filled++;
    }
    return filled >= 3;
}

function merge(b, p) {
    lastSpin = checkTSpin(p, b);
    for (let y = 0; y < p.matrix.length; y++) {
        for (let x = 0; x < p.matrix[y].length; x++) {
            if (p.matrix[y][x] !== 0) {
                let ny = p.y + y;
                if(ny >= 0 && ny < ROWS) {
                    b[ny][p.x + x] = p.shapeId;
                }
            }
        }
    }
    shakeTimer = 5; 
}

function clearLines() {
    let linesCleared = 0;
    outer: for (let y = ROWS - 1; y >= 0; y--) {
        for (let x = 0; x < COLS; x++) {
            if (board[y][x] === 0) continue outer;
        }
        const row = board.splice(y, 1)[0].fill(0);
        board.unshift(row);
        linesCleared++;
        y++;
    }
    
    if (linesCleared > 0) {
        shakeTimer = linesCleared * 2; // Keep shake very subtle
        
        let text = "";
        if (lastSpin) {
            text = "T-SPIN " + (linesCleared === 3 ? "TRIPLE!" : (linesCleared === 2 ? "DOUBLE!" : "SINGLE!"));
        } else {
            text = linesCleared === 4 ? "TETRIS!" : (linesCleared === 3 ? "TRIPLE!" : (linesCleared === 2 ? "DOUBLE!" : "SINGLE!"));
        }
        
        let textX = (targetX + 2) * BLOCK_SIZE;
        let textY = (currentPiece.y) * BLOCK_SIZE;
        floatingTexts.push({ text: text, x: textX, y: textY, alpha: 1, life: 80, spin: lastSpin });
    }
}

function spawnPiece() {
    const shapeId = getNextPieceId();
    currentPiece = new Piece(shapeId);
    if (collide(board, currentPiece)) {
        initBoard(); 
    }
    calculateBestMove();
}

function evaluateBoard(b, testPiece) {
    let landingHeight = ROWS - testPiece.y;
    let erasedLines = 0;
    let rowTransitions = 0;
    let colTransitions = 0;
    let holes = 0;
    let wellSums = 0;

    // 1. erasedLines
    for (let r = 0; r < ROWS; r++) {
        let full = true;
        for (let c = 0; c < COLS; c++) {
            if (!b[r][c]) full = false;
        }
        if (full) erasedLines++;
    }

    // 2. rowTransitions
    for (let r = 0; r < ROWS; r++) {
        let lastCell = 1; // Wall is filled
        for (let c = 0; c < COLS; c++) {
            let cell = b[r][c] ? 1 : 0;
            if (cell !== lastCell) rowTransitions++;
            lastCell = cell;
        }
        if (lastCell !== 1) rowTransitions++;
    }

    // 3. colTransitions
    for (let c = 0; c < COLS; c++) {
        let lastCell = 0; // Top is empty
        for (let r = 0; r < ROWS; r++) {
            let cell = b[r][c] ? 1 : 0;
            if (cell !== lastCell) colTransitions++;
            lastCell = cell;
        }
        if (lastCell !== 1) colTransitions++;
    }

    // 4. holes
    for (let c = 0; c < COLS; c++) {
        let blockFound = false;
        for (let r = 0; r < ROWS; r++) {
            if (b[r][c]) blockFound = true;
            else if (blockFound) holes++;
        }
    }

    // 5. wellSums
    for (let c = 0; c < COLS; c++) {
        let wellDepth = 0;
        for (let r = 0; r < ROWS; r++) {
            if (!b[r][c]) {
                let leftFilled = (c === 0 || b[r][c-1]);
                let rightFilled = (c === COLS-1 || b[r][c+1]);
                if (leftFilled && rightFilled) {
                    wellDepth++;
                    // Do not penalize the designated Tetris well (far right column)
                    if (c !== COLS - 1) {
                        wellSums += wellDepth;
                    }
                }
            } else {
                wellDepth = 0; 
            }
        }
    }

    let wellPenalty = 0;
    for(let py=0; py<testPiece.matrix.length; py++){
        for(let px=0; px<testPiece.matrix[py].length; px++){
            if(testPiece.matrix[py][px] && (testPiece.x + px === COLS - 1)) {
                // Keep the well clear!
                if (testPiece.shapeId !== 1) wellPenalty += 100; 
                // Only allow the I piece in the well if it clears 4 lines!
                else if (erasedLines < 4) wellPenalty += 100; 
            }
        }
    }

    let quadReward = (erasedLines === 4) ? 50 : 0; // Massive explicit reward for quads

    // Professional Dellacherie algorithm weights, heavily tuned to aggressively hunt for Quads
    return -landingHeight + 
           (3.2178 * erasedLines) - 
           (3.2256 * rowTransitions) - 
           (9.3486 * colTransitions) - 
           (7.8992 * holes) - 
           (3.3855 * wellSums) - 
           wellPenalty + 
           quadReward;
}

function calculateBestMove() {
    let bestScore = -Infinity;
    let bestX = currentPiece.x;
    let bestRot = 0;

    let testPiece = { x: currentPiece.x, y: 0, matrix: currentPiece.matrix, shapeId: currentPiece.shapeId };
    let isI = currentPiece.shapeId === 1;

    for (let rot = 0; rot < 4; rot++) {
        for (let x = -2; x < COLS + 2; x++) {
            testPiece.x = x;
            testPiece.y = 0;
            if (collide(board, testPiece, 0, 0, testPiece.matrix)) continue;
            
            while (!collide(board, testPiece, 0, 1, testPiece.matrix)) {
                testPiece.y++;
            }
            
            for(let py=0; py<testPiece.matrix.length; py++){
                for(let px=0; px<testPiece.matrix[py].length; px++){
                    if(testPiece.matrix[py][px]) {
                        let ny = testPiece.y + py;
                        if(ny>=0 && ny<ROWS) {
                            board[ny][testPiece.x + px] = 1;
                        }
                    }
                }
            }
            
            let score = evaluateBoard(board, testPiece);
            
            for(let py=0; py<testPiece.matrix.length; py++){
                for(let px=0; px<testPiece.matrix[py].length; px++){
                    if(testPiece.matrix[py][px]) {
                        let ny = testPiece.y + py;
                        if(ny>=0 && ny<ROWS) board[ny][testPiece.x + px] = 0;
                    }
                }
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestX = x;
                bestRot = rot;
            }
        }
        testPiece.matrix = rotateMatrix(testPiece.matrix);
    }
    targetX = bestX;
    targetRotation = bestRot;
}

let lastTime = 0;
let moveTimer = 0;
let dropTimer = 0;

function update(time) {
    let deltaTime = time - lastTime;
    lastTime = time;

    if (!currentPiece) spawnPiece();

    moveTimer += deltaTime;
    dropTimer += deltaTime;

    if (moveTimer > 10) { 
        moveTimer = 0;
        if (targetRotation > 0) {
            let nextMat = rotateMatrix(currentPiece.matrix);
            // Basic SRS Wall Kicks to allow spins to snap into place
            if (!collide(board, currentPiece, 0, 0, nextMat)) {
                currentPiece.matrix = nextMat; targetRotation--;
            } else if (!collide(board, currentPiece, 1, 0, nextMat)) {
                currentPiece.x++; currentPiece.matrix = nextMat; targetRotation--;
            } else if (!collide(board, currentPiece, -1, 0, nextMat)) {
                currentPiece.x--; currentPiece.matrix = nextMat; targetRotation--;
            } else targetRotation = 0; 
        } 
        else if (currentPiece.x < targetX) {
            if (!collide(board, currentPiece, 1, 0)) currentPiece.x++;
            else targetX = currentPiece.x;
        } else if (currentPiece.x > targetX) {
            if (!collide(board, currentPiece, -1, 0)) currentPiece.x--;
            else targetX = currentPiece.x;
        }
    }

    let isAtTarget = (currentPiece.x === targetX && targetRotation === 0);

    // Only allow dropping once the piece is perfectly aligned to prevent getting snagged on towers!
    if (isAtTarget) {
        if (dropTimer > 10) { 
            dropTimer = 0;
            if (!collide(board, currentPiece, 0, 1)) {
                currentPiece.y++;
            } else {
                merge(board, currentPiece);
                clearLines();
                currentPiece = null;
            }
        }
    } else {
        dropTimer = 0; // Suspend gravity while shifting
    }
    
    draw();
    requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    
    // Apply offsets to center the board horizontally and render flush with bottom
    ctx.translate(xOffset, yOffset);
    
    // Smooth subtle Screen shake
    if (shakeTimer > 0) {
        let dx = (Math.random() - 0.5) * 2;
        let dy = (Math.random() - 0.5) * 2;
        ctx.translate(dx, dy);
        shakeTimer--;
    }
    
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (board[y] && board[y][x]) {
                drawBlock(x, y, COLORS[board[y][x]], 0.15, true); 
            }
        }
    }

    if (currentPiece) {
        let ghostY = currentPiece.y;
        while (!collide(board, currentPiece, 0, ghostY - currentPiece.y + 1)) {
            ghostY++;
        }
        for (let y = 0; y < currentPiece.matrix.length; y++) {
            for (let x = 0; x < currentPiece.matrix[y].length; x++) {
                if (currentPiece.matrix[y][x]) {
                    drawBlock(currentPiece.x + x, ghostY + y, COLORS[currentPiece.shapeId], 0.05, false, true);
                    drawBlock(currentPiece.x + x, currentPiece.y + y, COLORS[currentPiece.shapeId], 0.6, true);
                }
            }
        }
    }
    
    ctx.restore();

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ctx.fillStyle = ft.spin ? `rgba(168, 85, 247, ${ft.alpha})` : `rgba(255, 255, 255, ${ft.alpha})`; // Purple for T-Spins!
        ctx.font = 'bold 30px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ft.text, ft.x, ft.y + yOffset);
        ft.y -= 2;
        ft.alpha -= 0.02;
        ft.life--;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
}

function drawBlock(x, y, color, alpha, glow=false, isGhost=false) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    
    if (glow) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
    }
    
    ctx.strokeStyle = isGhost ? color : `rgba(255,255,255,${alpha * 1.5})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
}

window.addEventListener('resize', () => {
    resize();
});
resize();

requestAnimationFrame(update);
