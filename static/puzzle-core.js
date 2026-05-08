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

// ========== ЗОНА СБОРКИ ==========
let assemblyZone = {
    x: 0, y: 0, w: 0, h: 0
};

function calculateAssemblyZone() {
    // Зона сборки занимает 55% центральной части поля
    const zoneWidth = boardW * 0.55;
    const zoneHeight = boardH * 0.55;
    assemblyZone.x = (boardW - zoneWidth) / 2;
    assemblyZone.y = (boardH - zoneHeight) / 2;
    assemblyZone.w = zoneWidth;
    assemblyZone.h = zoneHeight;
}

function drawAssemblyZone() {
    ctx.save();
    
    // Фон зоны сборки (светлый полупрозрачный)
    ctx.fillStyle = "rgba(180, 200, 170, 0.1)";
    ctx.fillRect(assemblyZone.x, assemblyZone.y, assemblyZone.w, assemblyZone.h);
    
    // Внешняя пунктирная рамка
    ctx.strokeStyle = "#d4af5a";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(assemblyZone.x, assemblyZone.y, assemblyZone.w, assemblyZone.h);
    
    // Внутренняя сплошная рамка
    ctx.setLineDash([]);
    ctx.strokeStyle = "#c9a458";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(assemblyZone.x + 5, assemblyZone.y + 5, assemblyZone.w - 10, assemblyZone.h - 10);
    
    // Угловые маркеры
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#e8c28e";
    const markerSize = 22;
    
    // Верхний левый
    ctx.beginPath();
    ctx.moveTo(assemblyZone.x, assemblyZone.y + markerSize);
    ctx.lineTo(assemblyZone.x, assemblyZone.y);
    ctx.lineTo(assemblyZone.x + markerSize, assemblyZone.y);
    ctx.stroke();
    
    // Верхний правый
    ctx.beginPath();
    ctx.moveTo(assemblyZone.x + assemblyZone.w - markerSize, assemblyZone.y);
    ctx.lineTo(assemblyZone.x + assemblyZone.w, assemblyZone.y);
    ctx.lineTo(assemblyZone.x + assemblyZone.w, assemblyZone.y + markerSize);
    ctx.stroke();
    
    // Нижний правый
    ctx.beginPath();
    ctx.moveTo(assemblyZone.x + assemblyZone.w, assemblyZone.y + assemblyZone.h - markerSize);
    ctx.lineTo(assemblyZone.x + assemblyZone.w, assemblyZone.y + assemblyZone.h);
    ctx.lineTo(assemblyZone.x + assemblyZone.w - markerSize, assemblyZone.y + assemblyZone.h);
    ctx.stroke();
    
    // Нижний левый
    ctx.beginPath();
    ctx.moveTo(assemblyZone.x, assemblyZone.y + assemblyZone.h - markerSize);
    ctx.lineTo(assemblyZone.x, assemblyZone.y + assemblyZone.h);
    ctx.lineTo(assemblyZone.x + markerSize, assemblyZone.y + assemblyZone.h);
    ctx.stroke();
    
    // Текст "ЗОНА СБОРКИ"
    ctx.font = "bold 13px 'Segoe UI', 'Georgia'";
    ctx.fillStyle = "#ecd9b4";
    ctx.shadowBlur = 0;
    ctx.fillText("✦ ЗОНА СБОРКИ ✦", assemblyZone.x + assemblyZone.w/2 - 65, assemblyZone.y - 10);
    
    // Маленькие декоративные звёздочки по углам
    ctx.font = "14px 'Segoe UI'";
    ctx.fillStyle = "#e8c28e";
    ctx.fillText("✦", assemblyZone.x - 8, assemblyZone.y - 5);
    ctx.fillText("✦", assemblyZone.x + assemblyZone.w + 2, assemblyZone.y - 5);
    ctx.fillText("✦", assemblyZone.x - 8, assemblyZone.y + assemblyZone.h + 8);
    ctx.fillText("✦", assemblyZone.x + assemblyZone.w + 2, assemblyZone.y + assemblyZone.h + 8);
    
    ctx.restore();
}

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
    
    // Фон
    ctx.fillStyle = "#1a2418";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Рисуем зону сборки (под пазлами, но над фоном)
    drawAssemblyZone();
    
    // Рисуем все кусочки
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
    progressText.innerHTML = `🧩 Собрано ${fixedCount} / ${total}`;
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