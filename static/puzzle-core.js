// ========== STATE ==========
let pieces = [];
let selectedPiece = null;
let dragMode = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let scale = 1;
let panX = 0, panY = 0;
let gameStarted = false;

// puzzle_id приходит из шаблона
const PUZZLE_ID = window.PUZZLE_ID;

// ========== DOM ELEMENTS ==========
const canvas = document.getElementById('puzzleCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('puzzleWrapper');

// ========== UTILS ==========
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function getMouse(e) {
    const r = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - r.left) * canvas.width / r.width,
        y: (e.clientY - r.top) * canvas.height / r.height
    };
}

// ========== DRAW ==========
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
        ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
    });
}

// ========== LOOP ==========
function loop() {
    draw();
    requestAnimationFrame(loop);
}
loop();

// ========== LOAD & INIT ==========
async function initPuzzle() {
    const res = await fetch(`/pieces-info/${PUZZLE_ID}`);
    const data = await res.json();

    const imgs = await Promise.all(data.map(p => {
        return new Promise(resolve => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.src = `/piece/${PUZZLE_ID}/${p.id}`;
        });
    }));

    let maxW = 0, maxH = 0;

    pieces = data.map((p, i) => {
        const img = imgs[i];
        const hitCanvas = document.createElement('canvas');
        hitCanvas.width = img.width;
        hitCanvas.height = img.height;
        const hitCtx = hitCanvas.getContext('2d');
        hitCtx.drawImage(img, 0, 0);

        maxW = Math.max(maxW, p.correct_x + p.width);
        maxH = Math.max(maxH, p.correct_y + p.height);

        return {
            id: p.id,
            img: img,
            hitCtx: hitCtx,
            w: img.width,
            h: img.height,
            correctX: p.correct_x,
            correctY: p.correct_y,
            x: 0,
            y: 0,
            fixed: false,
            group: null
        };
    });

    const target = Math.min(window.innerWidth, window.innerHeight) * 0.6;
    const scaleFactor = Math.min(target / Math.max(maxW, maxH), 1);

    pieces.forEach(p => {
        p.w *= scaleFactor;
        p.h *= scaleFactor;
        p.correctX *= scaleFactor;
        p.correctY *= scaleFactor;
    });

    const padding = 150;
    canvas.width = maxW * scaleFactor + padding * 2;
    canvas.height = maxH * scaleFactor + padding * 2;

    pieces.forEach(p => {
        p.correctX += padding;
        p.correctY += padding;
        p.x = Math.random() * canvas.width;
        p.y = Math.random() * canvas.height;
    });

    resetView();
}

// ========== START BUTTON ==========
document.getElementById('startBtn').onclick = async () => {
    if (gameStarted) return;
    await initPuzzle();
    gameStarted = true;
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('game').classList.remove('hidden');
};