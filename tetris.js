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
    
    // Dynamic columns for mobile vs desktop
    COLS = window.innerWidth < 768 ? 10 : 30;
    
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
let currentPath = [];
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
        
        let textX = (currentPiece.x + 2) * BLOCK_SIZE;
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

function evaluateBoard(b, testPiece, isLastMoveSpin) {
    let landingHeight = ROWS - testPiece.y;
    let erasedLines = 0;
    let rowTransitions = 0;
    let colTransitions = 0;
    let holes = 0;
    let wellSums = 0;

    for (let r = 0; r < ROWS; r++) {
        let isFull = true;
        for (let c = 0; c < COLS; c++) {
            if (!b[r][c]) {
                isFull = false;
                break;
            }
        }
        if (isFull) erasedLines++;
    }

    // Check if we are in extreme danger (top 8 rows)
    let isDanger = false;
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < 8; r++) {
            if (b[r] && b[r][c]) {
                isDanger = true; break;
            }
        }
        if (isDanger) break;
    }

    // MAGIC: By treating the far-right column as a solid wall (unless in danger), 
    // the AI no longer incurs rowTransition penalties for leaving it empty! 
    // This removes the mathematical urge to skim and fill the well.
    for (let r = 0; r < ROWS; r++) {
        let lastCell = 1; 
        for (let c = 0; c < COLS; c++) {
            let cell = (!isDanger && c === COLS - 1) ? 1 : (b[r][c] ? 1 : 0);
            if (cell !== lastCell) rowTransitions++;
            lastCell = cell;
        }
        if (lastCell !== 1) rowTransitions++; 
    }

    let endCol = isDanger ? COLS : COLS - 1;

    for (let c = 0; c < endCol; c++) { 
        let lastCell = 1; 
        for (let r = ROWS - 1; r >= 0; r--) {
            let cell = b[r][c] ? 1 : 0;
            if (cell !== lastCell) colTransitions++;
            lastCell = cell;
        }
    }

    for (let c = 0; c < endCol; c++) { 
        let blockFound = false;
        for (let r = 0; r < ROWS; r++) {
            if (b[r][c]) {
                blockFound = true;
            } else if (blockFound) {
                holes++;
            }
        }
    }

    for (let c = 0; c < endCol; c++) { 
        let wellDepth = 0;
        for (let r = 0; r < ROWS; r++) {
            if (!b[r][c]) {
                let leftFilled = (c === 0 || b[r][c-1]);
                let rightFilled = (c === endCol-1 || b[r][c+1]);
                if (leftFilled && rightFilled) {
                    wellDepth++;
                    wellSums += wellDepth;
                }
            } else {
                wellDepth = 0; 
            }
        }
    }

    // Penalize dropping garbage in the well (unless we are in danger and need to skim)
    let wellGarbage = 0;
    if (!isDanger) {
        for (let r = 0; r < ROWS; r++) {
            if (b[r][COLS-1]) wellGarbage++;
        }
    }

    let quadReward = (erasedLines === 4) ? 500 : 0; 
    
    let tSpinReward = 0;
    if (testPiece.shapeId === 6 && isLastMoveSpin && checkTSpin(testPiece, b)) {
        if (erasedLines > 0) tSpinReward = erasedLines * 100;
    }

    return (-4.50015 * landingHeight) + 
           (3.41812 * erasedLines) - 
           (3.21788 * rowTransitions) - 
           (9.34869 * colTransitions) - 
           (7.89926 * holes) - 
           (3.38559 * wellSums) - 
           (20.0 * wellGarbage) + 
           quadReward + 
           tSpinReward;
}

function calculateBestMove() {
    let mats = [
        currentPiece.matrix,
        rotateMatrix(currentPiece.matrix),
        rotateMatrix(rotateMatrix(currentPiece.matrix)),
        rotateMatrix(rotateMatrix(rotateMatrix(currentPiece.matrix)))
    ];
    
    let queue = [{
        x: currentPiece.x, 
        y: currentPiece.y, 
        rot: 0, 
        path: [] 
    }];
    let visited = new Set();
    let placements = [];
    
    let getKey = (x, y, r) => `${x},${y},${r}`;
    visited.add(getKey(currentPiece.x, currentPiece.y, 0));
    
    let iterations = 0;
    while (queue.length > 0 && iterations < 5000) {
        iterations++;
        let curr = queue.shift();
        let mat = mats[curr.rot];
        
        // Is it locked? (can't move down)
        if (collide(board, {x: curr.x, y: curr.y, matrix: mat}, 0, 1)) {
            placements.push(curr);
        } 
        
        // Try Down
        if (!collide(board, {x: curr.x, y: curr.y, matrix: mat}, 0, 1)) {
            let k = getKey(curr.x, curr.y+1, curr.rot);
            if (!visited.has(k)) {
                visited.add(k);
                queue.push({x: curr.x, y: curr.y+1, rot: curr.rot, path: curr.path.concat('D')});
            }
        }
        
        // Try Left
        if (!collide(board, {x: curr.x, y: curr.y, matrix: mat}, -1, 0)) {
            let k = getKey(curr.x-1, curr.y, curr.rot);
            if (!visited.has(k)) {
                visited.add(k);
                queue.push({x: curr.x-1, y: curr.y, rot: curr.rot, path: curr.path.concat('L')});
            }
        }
        
        // Try Right
        if (!collide(board, {x: curr.x, y: curr.y, matrix: mat}, 1, 0)) {
            let k = getKey(curr.x+1, curr.y, curr.rot);
            if (!visited.has(k)) {
                visited.add(k);
                queue.push({x: curr.x+1, y: curr.y, rot: curr.rot, path: curr.path.concat('R')});
            }
        }
        
        // Try Rotate (Clockwise)
        let nextRot = (curr.rot + 1) % 4;
        let nextMat = mats[nextRot];
        // Test basic kicks to allow tucks and T-Spins
        let kicks = [[0,0], [-1,0], [1,0], [0,-1], [-1,-1], [1,-1], [0,1], [-1,1], [1,1]];
        for (let kick of kicks) {
            if (!collide(board, {x: curr.x, y: curr.y, matrix: nextMat}, kick[0], kick[1])) {
                let nx = curr.x + kick[0];
                let ny = curr.y + kick[1];
                let k = getKey(nx, ny, nextRot);
                if (!visited.has(k)) {
                    visited.add(k);
                    queue.push({x: nx, y: ny, rot: nextRot, path: curr.path.concat('O')}); 
                }
                break; 
            }
        }
    }
    
    let bestScore = -Infinity;
    let bestPlacement = null;
    
    for (let p of placements) {
        let testPiece = { x: p.x, y: p.y, matrix: mats[p.rot], shapeId: currentPiece.shapeId };
        
        // place on board
        for(let py=0; py<testPiece.matrix.length; py++){
            for(let px=0; px<testPiece.matrix[py].length; px++){
                if(testPiece.matrix[py][px]) {
                    let ny = testPiece.y + py;
                    if(ny>=0 && ny<ROWS) board[ny][testPiece.x + px] = 1;
                }
            }
        }
        
        let isLastMoveSpin = (p.path.length > 0 && p.path[p.path.length-1] === 'O');
        let score = evaluateBoard(board, testPiece, isLastMoveSpin);
        
        // unplace
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
            bestPlacement = p;
        }
    }
    
    if (bestPlacement) {
        currentPath = bestPlacement.path;
    } else {
        currentPath = [];
    }
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

    if (moveTimer > 17) { 
        moveTimer = 0;
        if (currentPath.length > 0) {
            let move = currentPath.shift();
            if (move === 'L') currentPiece.x--;
            else if (move === 'R') currentPiece.x++;
            else if (move === 'D') currentPiece.y++;
            else if (move === 'O') {
                let nextMat = rotateMatrix(currentPiece.matrix);
                let kicks = [[0,0], [-1,0], [1,0], [0,-1], [-1,-1], [1,-1], [0,1], [-1,1], [1,1]];
                for (let kick of kicks) {
                    if (!collide(board, currentPiece, kick[0], kick[1], nextMat)) {
                        currentPiece.x += kick[0];
                        currentPiece.y += kick[1];
                        currentPiece.matrix = nextMat;
                        break;
                    }
                }
            }
        }
    }

    if (currentPath.length === 0) {
        if (dropTimer > 17) { 
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
        dropTimer = 0; // Suspend gravity while following path
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
