const PUZZLE_ID = window.PUZZLE_ID;

// ========== STATE ==========
let pieces = [];
let selectedPiece = null;
let dragOffsetX = 0, dragOffsetY = 0;
let gameStarted = false;
let winShown = false;
let boardW, boardH;
let scale = 1, panX = 0, panY = 0;
let isDraggingWrapper = false;
let wrapperDragStart = { x: 0, y: 0 };

// ========== DOM ELEMENTS ==========
const canvas = document.getElementById('puzzleCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('puzzleWrapper');
const overlay = document.getElementById('overlay');
const gameDiv = document.getElementById('game');
const winOverlay = document.getElementById('winOverlay');
const startBtn = document.getElementById('startBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const musicToggle = document.getElementById('musicToggle');
const loadingSpinner = document.getElementById('loadingSpinner');

// ========== AUDIO ==========
let audio = new Audio("/static/music.mp3");
audio.loop = true;
audio.volume = 0.35;
let audioEnabled = true;

// ========== UTILS ==========
function getCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

// ========== DRAW ==========
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#1a2418";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    pieces.forEach(p => {
        if (!p.fixed) {
            ctx.strokeStyle = "rgba(255, 210, 90, 0.5)";
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(p.correctX, p.correctY, p.w, p.h);
            ctx.setLineDash([]);
        }
    });
    
    pieces.forEach(p => {
        if (selectedPiece === p) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = "rgba(255, 215, 0, 0.6)";
        } else {
            ctx.shadowBlur = 4;
            ctx.shadowColor = "rgba(0,0,0,0.3)";
        }
        
        ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
        
        if (p.fixed) {
            ctx.strokeStyle = "#4caf50";
            ctx.lineWidth = 3;
            ctx.strokeRect(p.x, p.y, p.w, p.h);
        }
    });
    ctx.shadowBlur = 0;
}

// ========== PROGRESS & WIN ==========
function updateProgress() {
    const fixedCount = pieces.filter(p => p.fixed).length;
    const total = pieces.length;
    const percent = (fixedCount / total) * 100;
    progressBar.style.width = `${percent}%`;
    progressText.innerHTML = `Собрано ${fixedCount} / ${total}`;
    checkWin();
}

function checkWin() {
    const allPlaced = pieces.length > 0 && pieces.every(p => p.fixed === true);
    if (allPlaced && gameStarted && !winShown) {
        winShown = true;
        setTimeout(() => {
            winOverlay.classList.remove("hidden");
            winOverlay.classList.add("active");
            if (audio && audioEnabled) audio.pause();
        }, 500);
    }
}

// ========== CAMERA ==========
function updateTransform() {
    wrapper.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
}

function resetView() {
    scale = 1;
    panX = 0;
    panY = 0;
    updateTransform();
}