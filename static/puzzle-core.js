const PUZZLE_ID = window.PUZZLE_ID;

const SCATTER_MARGIN = 250;
const ZONE_VISUAL_MARGIN = 15;
const SNAP_THRESHOLD = 35;
const GROUP_SNAP_THRESHOLD = 40;

let pieces = [];
let selectedPiece = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let gameStarted = false;
let winShown = false;
let boardW = 0;
let boardH = 0;
let scale = 0.2;
let panX = 0;
let panY = 0;
let isDraggingWrapper = false;
let wrapperDragStart = { x: 0, y: 0 };
let snapHighlight = null;
let assemblyZone = { x: 0, y: 0, w: 0, h: 0 };

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

let audio = new Audio("/static/music.mp3");
audio.loop = true;
audio.volume = 0.35;
let audioEnabled = true;

// ======================================================
// UTILS
// ======================================================

function getCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

function getPieceAt(x, y) {
    for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
            return p;
        }
    }
    return null;
}

function loadPieceImage(pieceId) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `/piece/${PUZZLE_ID}/${pieceId}`;
    });
}

// ======================================================
// ASSEMBLY ZONE
// ======================================================

function calculateLegacyAssemblyZone() {
    const zoneWidth = boardW * 0.55;
    const zoneHeight = boardH * 0.55;
    assemblyZone.x = (boardW - zoneWidth) / 2;
    assemblyZone.y = (boardH - zoneHeight) / 2;
    assemblyZone.w = zoneWidth;
    assemblyZone.h = zoneHeight;
}

function calculateAssemblyZoneFromBounds(puzzleWidth, puzzleHeight, visualMargin) {
    const zoneWidth = puzzleWidth + visualMargin * 2;
    const zoneHeight = puzzleHeight + visualMargin * 2;
    const zoneX = (boardW - zoneWidth) / 2;
    const zoneY = (boardH - zoneHeight) / 2;
    return {
        x: zoneX, y: zoneY, w: zoneWidth, h: zoneHeight,
        offsetX: zoneX - visualMargin,
        offsetY: zoneY - visualMargin
    };
}

// ======================================================
// RANDOM POSITIONING
// ======================================================

function getRandomPositionOutsideAssembly(pieceW, pieceH) {
    for (let attempt = 0; attempt < 300; attempt++) {
        const x = 20 + Math.random() * (boardW - pieceW - 40);
        const y = 20 + Math.random() * (boardH - pieceH - 40);
        const overlaps = !(
            x + pieceW < assemblyZone.x ||
            x > assemblyZone.x + assemblyZone.w ||
            y + pieceH < assemblyZone.y ||
            y > assemblyZone.y + assemblyZone.h
        );
        if (!overlaps) return { x, y };
    }
    return { x: 30, y: 30 };
}

// ======================================================
// DRAW
// ======================================================

function drawAssemblyZone() {
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    const gradient = ctx.createLinearGradient(
        assemblyZone.x, assemblyZone.y,
        assemblyZone.x + assemblyZone.w, assemblyZone.y + assemblyZone.h
    );
    gradient.addColorStop(0, "rgba(200,220,180,0.08)");
    gradient.addColorStop(1, "rgba(170,190,150,0.12)");
    ctx.fillStyle = gradient;
    ctx.fillRect(assemblyZone.x, assemblyZone.y, assemblyZone.w, assemblyZone.h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#d4af5a";
    ctx.lineWidth = 3;
    ctx.strokeRect(assemblyZone.x, assemblyZone.y, assemblyZone.w, assemblyZone.h);
    ctx.restore();
}

function drawSnapHighlight() {
    if (!snapHighlight) return;
    ctx.save();
    ctx.strokeStyle = "#f5d98a";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(snapHighlight.x, snapHighlight.y, snapHighlight.w, snapHighlight.h);
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1a2418";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawAssemblyZone();
    drawSnapHighlight();
    pieces.forEach(p => {
        if (selectedPiece && getGroup(selectedPiece) === getGroup(p)) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = "rgba(255,215,0,0.7)";
        } else if (p.fixed) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = "rgba(76,175,80,0.5)";
        } else {
            ctx.shadowBlur = 4;
            ctx.shadowColor = "rgba(0,0,0,0.35)";
        }
        ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
    });
    ctx.shadowBlur = 0;
}

// ======================================================
// CAMERA
// ======================================================

function updateTransform() {
    wrapper.style.transform =
        `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
}

function resetView() {
    scale = 1;
    panX = 0;
    panY = 0;
    updateTransform();
}

// ======================================================
// GROUPS
// ======================================================

function getGroup(piece) {
    if (!piece.group) {
        piece.group = { pieces: [piece] };
    }
    return piece.group;
}

function mergeGroups(a, b) {
    const groupA = getGroup(a);
    const groupB = getGroup(b);
    if (groupA === groupB) return groupA;
    const merged = { pieces: [...groupA.pieces, ...groupB.pieces] };
    merged.pieces.forEach(p => { p.group = merged; });
    return merged;
}

// ======================================================
// GROUP BOUNDS (используем bboxW/bboxH для точного расчёта)
// ======================================================

function getGroupBounds(group) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    group.pieces.forEach(p => {
        // Смещение кусочка от его правильной позиции
        const offX = p.x - p.correctX;
        const offY = p.y - p.correctY;
        // Реальный bbox кусочка в текущей позиции
        const bx = p.bboxX + offX;
        const by = p.bboxY + offY;
        minX = Math.min(minX, bx);
        minY = Math.min(minY, by);
        maxX = Math.max(maxX, bx + p.bboxW);
        maxY = Math.max(maxY, by + p.bboxH);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function centerGroupInAssemblyZone(group) {
    if (!group || group.pieces.length === 0) return;
    const bounds = getGroupBounds(group);
    const targetX = assemblyZone.x + (assemblyZone.w - bounds.width) / 2;
    const targetY = assemblyZone.y + (assemblyZone.h - bounds.height) / 2;
    const dx = targetX - bounds.minX;
    const dy = targetY - bounds.minY;
    group.pieces.forEach(p => {
        if (!p.fixed) {
            p.x += dx;
            p.y += dy;
        }
    });
}

// ======================================================
// NEIGHBOR DETECTION
//
// Ключевое понимание из сервера:
//   correct_x / correct_y = bbox_x / bbox_y = верхний левый угол bbox кусочка
//                           в координатах ПОЛНОГО изображения
//   bboxW / bboxH = размер bbox (до expand_pixels, чистый размер контура)
//   w / h = размер PNG файла кусочка (bbox + expand_pixels с каждой стороны)
//
// Для определения соседства используем bboxW/bboxH (чистые размеры),
// потому что именно они отражают реальные границы контура без расширения.
// ======================================================

function areNeighbors(a, b) {
    // Используем bbox координаты (correctX/Y = bboxX/Y = верхний левый угол bbox)
    const ax1 = a.correctX;
    const ay1 = a.correctY;
    const ax2 = a.correctX + a.bboxW;
    const ay2 = a.correctY + a.bboxH;

    const bx1 = b.correctX;
    const by1 = b.correctY;
    const bx2 = b.correctX + b.bboxW;
    const by2 = b.correctY + b.bboxH;

    // Допуск с учётом expand_pixels (до 4px с каждой стороны) + небольшой запас
    const tol = 16;

    const horizontalTouch =
        Math.abs(ax2 - bx1) < tol ||
        Math.abs(ax1 - bx2) < tol;

    const verticalOverlap = ay1 < by2 && ay2 > by1;

    const verticalTouch =
        Math.abs(ay2 - by1) < tol ||
        Math.abs(ay1 - by2) < tol;

    const horizontalOverlap = ax1 < bx2 && ax2 > bx1;

    return (horizontalTouch && verticalOverlap) || (verticalTouch && horizontalOverlap);
}

// ======================================================
// SNAP LOGIC
//
// piece.x/y — верхний левый угол PNG кусочка на канвасе
// piece.correctX/Y — правильная позиция верхнего левого угла PNG
//
// Но PNG кусочек смещён относительно bbox на (bboxX - correctX, bboxY - correctY) = (0,0)
// т.к. сервер пишет correct_x = bbox_x.
//
// При snap к соседу: позиция piece должна быть такой, чтобы
//   piece.correctX - other.correctX == piece.x - other.x
// то есть: targetX = other.x + (piece.correctX - other.correctX)
// ======================================================

function checkCorrectPositionSnap(piece) {
    const group = getGroup(piece);

    const dx = piece.correctX - piece.x;
    const dy = piece.correctY - piece.y;
    const dist = Math.hypot(dx, dy);

    if (dist > SNAP_THRESHOLD) return false;

    // Двигаем всю группу
    group.pieces.forEach(p => {
        if (!p.fixed) {
            p.x += dx;
            p.y += dy;
        }
    });

    // Фиксируем кусочки, вставшие точно на место
    group.pieces.forEach(p => {
        if (Math.hypot(p.correctX - p.x, p.correctY - p.y) < 3) {
            p.x = p.correctX;
            p.y = p.correctY;
            p.fixed = true;
        }
    });

    return true;
}

function checkNeighborSnap(piece) {
    const myGroup = getGroup(piece);

    for (const other of pieces) {
        if (piece === other) continue;
        if (getGroup(other) === myGroup) continue;
        if (!areNeighbors(piece, other)) continue;

        // Целевая позиция piece рядом с other
        const targetX = other.x + (piece.correctX - other.correctX);
        const targetY = other.y + (piece.correctY - other.correctY);

        const dist = Math.hypot(targetX - piece.x, targetY - piece.y);

        if (dist < GROUP_SNAP_THRESHOLD) {
            const dx = targetX - piece.x;
            const dy = targetY - piece.y;

            // Двигаем группу piece ДО merge
            myGroup.pieces.forEach(p => {
                if (!p.fixed) {
                    p.x += dx;
                    p.y += dy;
                }
            });

            // Объединяем
            const mergedGroup = mergeGroups(piece, other);

            // Фиксируем всех, кто встал на место
            mergedGroup.pieces.forEach(p => {
                if (Math.hypot(p.correctX - p.x, p.correctY - p.y) < 3) {
                    p.x = p.correctX;
                    p.y = p.correctY;
                    p.fixed = true;
                }
            });

            return true;
        }
    }

    return false;
}

function trySnap(piece) {
    if (!piece) return false;

    const group = getGroup(piece);
    let snapped = false;

    // Снэп по точной позиции — только для нефиксированного кусочка
    if (!piece.fixed && checkCorrectPositionSnap(piece)) {
        snapped = true;
    }

    // Соседский снэп — проверяем все нефиксированные кусочки группы
    // (копируем массив т.к. после merge группа может измениться)
    const freePieces = [...group.pieces].filter(p => !p.fixed);
    for (const p of freePieces) {
        if (checkNeighborSnap(p)) {
            snapped = true;
        }
    }

    if (snapped) {
        updateProgress();
        draw();
    }

    return snapped;
}

// ======================================================
// PROGRESS & WIN
// ======================================================

function updateProgress() {
    const fixedCount = pieces.filter(p => p.fixed).length;
    const total = pieces.length;
    progressBar.style.width = `${(fixedCount / total) * 100}%`;
    progressText.innerHTML = `🧩 Собрано ${fixedCount} / ${total}`;
    checkWin();
}

function checkWin() {
    if (pieces.length > 0 && pieces.every(p => p.fixed) && gameStarted && !winShown) {
        winShown = true;
        setTimeout(() => {
            winOverlay.classList.remove("hidden");
            winOverlay.classList.add("active");
            if (audio && audioEnabled) audio.pause();
        }, 500);
    }
}

// ======================================================
// LOAD PUZZLE
// ======================================================

async function loadPiecesInfo() {
    const response = await fetch(`/pieces-info/${PUZZLE_ID}`);
    if (!response.ok) throw new Error('Не удалось загрузить пазл');
    const data = await response.json();
    if (data.pieces) return data;
    return { pieces: data, legacy: true };
}

async function initPuzzle() {
    loadingSpinner.classList.remove('hidden');
    try {
        const puzzleData = await loadPiecesInfo();
        const piecesInfo = puzzleData.pieces;
        const isLegacy = puzzleData.legacy || !puzzleData.puzzle_width;

        if (piecesInfo.length === 0) throw new Error('Нет кусочков');

        if (!isLegacy) {
            boardW = Math.max(800, puzzleData.puzzle_width + SCATTER_MARGIN * 2);
            boardH = Math.max(600, puzzleData.puzzle_height + SCATTER_MARGIN * 2);
            canvas.width = boardW;
            canvas.height = boardH;

            const zone = calculateAssemblyZoneFromBounds(
                puzzleData.puzzle_width, puzzleData.puzzle_height, ZONE_VISUAL_MARGIN
            );
            assemblyZone = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };

            const shiftX = zone.offsetX - puzzleData.puzzle_min_x;
            const shiftY = zone.offsetY - puzzleData.puzzle_min_y;

            pieces = [];
            for (const info of piecesInfo) {
                const img = await loadPieceImage(info.id);
                const randomPos = getRandomPositionOutsideAssembly(info.width, info.height);

                // correct_x/y = bbox_x/y на сервере — верхний левый угол bbox
                // Применяем тот же сдвиг что и к bbox
                const correctX = info.correct_x + shiftX;
                const correctY = info.correct_y + shiftY;

                pieces.push({
                    id: info.id,
                    img,
                    x: randomPos.x,
                    y: randomPos.y,
                    correctX,
                    correctY,
                    w: info.width,
                    h: info.height,
                    // bbox в координатах канваса (для расчёта соседства)
                    bboxX: info.bbox_x + shiftX,
                    bboxY: info.bbox_y + shiftY,
                    bboxW: info.bbox_w,
                    bboxH: info.bbox_h,
                    fixed: false,
                    group: null
                });
            }
        } else {
            // LEGACY
            let maxDim = 0;
            piecesInfo.forEach(p => { maxDim = Math.max(maxDim, p.width, p.height); });
            const cols = Math.ceil(Math.sqrt(piecesInfo.length));
            const rows = Math.ceil(piecesInfo.length / cols);
            boardW = Math.max(1000, maxDim * cols * 1.4);
            boardH = Math.max(800, maxDim * rows * 1.4);
            canvas.width = boardW;
            canvas.height = boardH;
            calculateLegacyAssemblyZone();

            pieces = [];
            for (const info of piecesInfo) {
                const img = await loadPieceImage(info.id);
                const randomPos = getRandomPositionOutsideAssembly(info.width, info.height);
                pieces.push({
                    id: info.id,
                    img,
                    x: randomPos.x,
                    y: randomPos.y,
                    correctX: info.correct_x,
                    correctY: info.correct_y,
                    w: info.width,
                    h: info.height,
                    bboxX: info.correct_x,
                    bboxY: info.correct_y,
                    bboxW: info.width,
                    bboxH: info.height,
                    fixed: false,
                    group: null
                });
            }
        }

        updateProgress();
        draw();
        resetView();

    } catch (err) {
        console.error(err);
        alert("Ошибка загрузки пазла");
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}