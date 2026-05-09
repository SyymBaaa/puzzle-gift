const PUZZLE_ID = window.PUZZLE_ID;

// Параметры зоны сборки (синхронизированы с серверным config.py)
const SCATTER_MARGIN = 250;      // отступ для разброса кусочков от границ пазла
const ZONE_VISUAL_MARGIN = 15;   // визуальный отступ рамки от реального пазла

// ========== STATE ==========
let pieces = [];
let selectedPiece = null;
let dragOffsetX = 0, dragOffsetY = 0;
let gameStarted = false;
let winShown = false;
let boardW, boardH;
let scale = 0.2, panX = 0, panY = 0;
let isDraggingWrapper = false;
let wrapperDragStart = { x: 0, y: 0 };
let snapHighlight = null; // для подсветки при притягивании

// ========== ЗОНА СБОРКИ ==========
let assemblyZone = {
    x: 0, y: 0, w: 0, h: 0
};

function calculateAssemblyZone() {
    const zoneWidth = boardW * 0.55;
    const zoneHeight = boardH * 0.55;
    assemblyZone.x = (boardW - zoneWidth) / 2;
    assemblyZone.y = (boardH - zoneHeight) / 2;
    assemblyZone.w = zoneWidth;
    assemblyZone.h = zoneHeight;
}

function drawAssemblyZone() {
    ctx.save();
    
    // Внешняя тень для глубины
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    
    // Основная заливка зоны сборки (мягкий градиент)
    const gradient = ctx.createLinearGradient(assemblyZone.x, assemblyZone.y, assemblyZone.x + assemblyZone.w, assemblyZone.y + assemblyZone.h);
    gradient.addColorStop(0, "rgba(200, 220, 180, 0.08)");
    gradient.addColorStop(1, "rgba(170, 190, 150, 0.12)");
    ctx.fillStyle = gradient;
    ctx.fillRect(assemblyZone.x, assemblyZone.y, assemblyZone.w, assemblyZone.h);
    
    ctx.shadowBlur = 0;
    
    // Золотая рамка с двойным контуром
    ctx.shadowBlur = 3;
    ctx.shadowColor = "rgba(212, 175, 90, 0.5)";
    
    // Внешняя рамка (толстая, золотая)
    ctx.strokeStyle = "#e8c28e";
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.strokeRect(assemblyZone.x - 2, assemblyZone.y - 2, assemblyZone.w + 4, assemblyZone.h + 4);
    
    // Основная рамка
    ctx.strokeStyle = "#d4af5a";
    ctx.lineWidth = 3;
    ctx.strokeRect(assemblyZone.x, assemblyZone.y, assemblyZone.w, assemblyZone.h);
    
    // Внутренняя рамка (более тонкая)
    ctx.strokeStyle = "#f0d492";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(assemblyZone.x + 6, assemblyZone.y + 6, assemblyZone.w - 12, assemblyZone.h - 12);
    
    // Декоративные уголки (более насыщенные)
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#f5d98a";
    const cornerSize = 28;
    
    // Уголки с закруглением
    ctx.beginPath();
    ctx.moveTo(assemblyZone.x, assemblyZone.y + cornerSize);
    ctx.lineTo(assemblyZone.x, assemblyZone.y);
    ctx.lineTo(assemblyZone.x + cornerSize, assemblyZone.y);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(assemblyZone.x + assemblyZone.w - cornerSize, assemblyZone.y);
    ctx.lineTo(assemblyZone.x + assemblyZone.w, assemblyZone.y);
    ctx.lineTo(assemblyZone.x + assemblyZone.w, assemblyZone.y + cornerSize);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(assemblyZone.x + assemblyZone.w, assemblyZone.y + assemblyZone.h - cornerSize);
    ctx.lineTo(assemblyZone.x + assemblyZone.w, assemblyZone.y + assemblyZone.h);
    ctx.lineTo(assemblyZone.x + assemblyZone.w - cornerSize, assemblyZone.y + assemblyZone.h);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(assemblyZone.x, assemblyZone.y + assemblyZone.h - cornerSize);
    ctx.lineTo(assemblyZone.x, assemblyZone.y + assemblyZone.h);
    ctx.lineTo(assemblyZone.x + cornerSize, assemblyZone.y + assemblyZone.h);
    ctx.stroke();
    
    // Декоративные точки по углам
    ctx.fillStyle = "#f5d98a";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(assemblyZone.x - 4, assemblyZone.y - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(assemblyZone.x + assemblyZone.w + 4, assemblyZone.y - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(assemblyZone.x - 4, assemblyZone.y + assemblyZone.h + 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(assemblyZone.x + assemblyZone.w + 4, assemblyZone.y + assemblyZone.h + 4, 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Заголовок с подложкой
    ctx.shadowBlur = 0;
    ctx.font = "bold 16px 'Segoe UI', 'Georgia'";
    ctx.fillStyle = "#ecd9b4";
    const titleWidth = ctx.measureText("✦ ЗОНА СБОРКИ ✦").width;
    
    // Подложка под текст
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(assemblyZone.x + assemblyZone.w/2 - titleWidth/2 - 10, assemblyZone.y - 28, titleWidth + 20, 28);
    
    ctx.fillStyle = "#f5d98a";
    ctx.fillText("✦ ЗОНА СБОРКИ ✦", assemblyZone.x + assemblyZone.w/2 - titleWidth/2, assemblyZone.y - 12);
    
    // Светящиеся элементы по бокам
    ctx.font = "18px 'Segoe UI'";
    ctx.fillStyle = "#e8c28e";
    ctx.fillText("◈", assemblyZone.x - 18, assemblyZone.y + assemblyZone.h/2);
    ctx.fillText("◈", assemblyZone.x + assemblyZone.w + 8, assemblyZone.y + assemblyZone.h/2);
    
    ctx.restore();
}

// Подсветка при притягивании
function drawSnapHighlight() {
    if (!snapHighlight) return;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#f5d98a";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(snapHighlight.x - 2, snapHighlight.y - 2, snapHighlight.w + 4, snapHighlight.h + 4);
    ctx.setLineDash([]);
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
    
    // Лёгкая сетка фона для ориентации
    ctx.strokeStyle = "rgba(100, 120, 80, 0.15)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }
    
    // Рисуем зону сборки
    drawAssemblyZone();
    
    // Рисуем подсветку притягивания
    drawSnapHighlight();
    
    // Рисуем все кусочки
    pieces.forEach(p => {
        if (selectedPiece === p) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = "rgba(255, 215, 0, 0.7)";
        } else if (p.fixed) {
            ctx.shadowBlur = 6;
            ctx.shadowColor = "rgba(76, 175, 80, 0.4)";
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