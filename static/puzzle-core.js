const PUZZLE_ID = window.PUZZLE_ID;

// ======================================================
// CONFIG
// ======================================================

const SCATTER_MARGIN = 250;
const ZONE_VISUAL_MARGIN = 15;

const SNAP_THRESHOLD = 35;
const GROUP_SNAP_THRESHOLD = 40;

// ======================================================
// STATE
// ======================================================

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

let wrapperDragStart = {
    x: 0,
    y: 0
};

let snapHighlight = null;

let assemblyZone = {
    x: 0,
    y: 0,
    w: 0,
    h: 0
};

// ======================================================
// DOM
// ======================================================

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

// ======================================================
// AUDIO
// ======================================================

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

        if (
            x >= p.x &&
            x <= p.x + p.w &&
            y >= p.y &&
            y <= p.y + p.h
        ) {
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

function calculateAssemblyZoneFromBounds(
    puzzleWidth,
    puzzleHeight,
    visualMargin
) {
    const zoneWidth = puzzleWidth + visualMargin * 2;
    const zoneHeight = puzzleHeight + visualMargin * 2;

    const zoneX = (boardW - zoneWidth) / 2;
    const zoneY = (boardH - zoneHeight) / 2;

    return {
        x: zoneX,
        y: zoneY,
        w: zoneWidth,
        h: zoneHeight,

        offsetX: zoneX - visualMargin,
        offsetY: zoneY - visualMargin
    };
}

// ======================================================
// RANDOM POSITIONING
// ======================================================

function getRandomPositionOutsideAssembly(pieceW, pieceH) {
    const maxAttempts = 300;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {

        const x = 20 + Math.random() * (boardW - pieceW - 40);
        const y = 20 + Math.random() * (boardH - pieceH - 40);

        const overlaps =
            !(
                x + pieceW < assemblyZone.x ||
                x > assemblyZone.x + assemblyZone.w ||
                y + pieceH < assemblyZone.y ||
                y > assemblyZone.y + assemblyZone.h
            );

        if (!overlaps) {
            return { x, y };
        }
    }

    return {
        x: 30,
        y: 30
    };
}

// ======================================================
// DRAW
// ======================================================

function drawAssemblyZone() {
    ctx.save();

    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(0,0,0,0.5)";

    const gradient = ctx.createLinearGradient(
        assemblyZone.x,
        assemblyZone.y,
        assemblyZone.x + assemblyZone.w,
        assemblyZone.y + assemblyZone.h
    );

    gradient.addColorStop(0, "rgba(200,220,180,0.08)");
    gradient.addColorStop(1, "rgba(170,190,150,0.12)");

    ctx.fillStyle = gradient;

    ctx.fillRect(
        assemblyZone.x,
        assemblyZone.y,
        assemblyZone.w,
        assemblyZone.h
    );

    ctx.shadowBlur = 0;

    ctx.strokeStyle = "#d4af5a";
    ctx.lineWidth = 3;

    ctx.strokeRect(
        assemblyZone.x,
        assemblyZone.y,
        assemblyZone.w,
        assemblyZone.h
    );

    ctx.restore();
}

function drawSnapHighlight() {
    if (!snapHighlight) return;

    ctx.save();

    ctx.strokeStyle = "#f5d98a";
    ctx.lineWidth = 3;

    ctx.setLineDash([8, 6]);

    ctx.strokeRect(
        snapHighlight.x,
        snapHighlight.y,
        snapHighlight.w,
        snapHighlight.h
    );

    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#1a2418";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawAssemblyZone();

    drawSnapHighlight();

    pieces.forEach(p => {

        if (selectedPiece === p) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = "rgba(255,215,0,0.7)";
        }
        else if (p.fixed) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = "rgba(76,175,80,0.5)";
        }
        else {
            ctx.shadowBlur = 4;
            ctx.shadowColor = "rgba(0,0,0,0.35)";
        }

        ctx.drawImage(
            p.img,
            p.x,
            p.y,
            p.w,
            p.h
        );

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

        const group = {
            pieces: [piece]
        };

        piece.group = group;
    }

    return piece.group;
}

function mergeGroups(a, b) {

    const groupA = getGroup(a);
    const groupB = getGroup(b);

    if (groupA === groupB) {
        return groupA;
    }

    const merged = {
        pieces: [
            ...groupA.pieces,
            ...groupB.pieces
        ]
    };

    merged.pieces.forEach(p => {
        p.group = merged;
    });

    return merged;
}

// ======================================================
// GROUP BOUNDS
// ======================================================

function getPieceRealBounds(piece) {

    const offsetX = piece.x - piece.correctX;
    const offsetY = piece.y - piece.correctY;

    return {
        x: piece.bboxX + offsetX,
        y: piece.bboxY + offsetY,
        w: piece.bboxW,
        h: piece.bboxH
    };
}

function getGroupBounds(group) {

    let minX = Infinity;
    let minY = Infinity;

    let maxX = -Infinity;
    let maxY = -Infinity;

    group.pieces.forEach(piece => {

        const b = getPieceRealBounds(piece);

        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);

        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
    });

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

function centerGroupInAssemblyZone(group) {

    if (!group || group.pieces.length === 0) {
        return;
    }

    const bounds = getGroupBounds(group);

    const targetX =
        assemblyZone.x +
        (assemblyZone.w - bounds.width) / 2;

    const targetY =
        assemblyZone.y +
        (assemblyZone.h - bounds.height) / 2;

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
// ======================================================

function areNeighbors(a, b) {

    const ax1 = a.correctX;
    const ay1 = a.correctY;

    const ax2 = a.correctX + a.w;
    const ay2 = a.correctY + a.h;

    const bx1 = b.correctX;
    const by1 = b.correctY;

    const bx2 = b.correctX + b.w;
    const by2 = b.correctY + b.h;

    const horizontalTouch =
        Math.abs(ax2 - bx1) < 10 ||
        Math.abs(ax1 - bx2) < 10;

    const verticalOverlap =
        !(ay2 < by1 || ay1 > by2);

    const verticalTouch =
        Math.abs(ay2 - by1) < 10 ||
        Math.abs(ay1 - by2) < 10;

    const horizontalOverlap =
        !(ax2 < bx1 || ax1 > bx2);

    return (
        (horizontalTouch && verticalOverlap) ||
        (verticalTouch && horizontalOverlap)
    );
}

// ======================================================
// SNAP LOGIC
// ======================================================

function checkCorrectPositionSnap(piece) {

    const group = getGroup(piece);

    const dx = piece.correctX - piece.x;
    const dy = piece.correctY - piece.y;

    const dist = Math.hypot(dx, dy);

    if (dist > SNAP_THRESHOLD) {
        return false;
    }

    group.pieces.forEach(p => {

        if (!p.fixed) {

            p.x += dx;
            p.y += dy;
        }

    });

    group.pieces.forEach(p => {

        const d = Math.hypot(
            p.correctX - p.x,
            p.correctY - p.y
        );

        if (d < 5) {

            p.x = p.correctX;
            p.y = p.correctY;

            p.fixed = true;
        }

    });

    return true;
}

function checkNeighborSnap(piece) {

    for (const other of pieces) {

        if (piece === other) continue;

        if (!areNeighbors(piece, other)) continue;

        const targetX =
            other.x +
            (piece.correctX - other.correctX);

        const targetY =
            other.y +
            (piece.correctY - other.correctY);

        const dist = Math.hypot(
            targetX - piece.x,
            targetY - piece.y
        );

        if (dist < GROUP_SNAP_THRESHOLD) {

            const groupA = getGroup(piece);
            const groupB = getGroup(other);

            const mergedGroup = mergeGroups(piece, other);

            const dx = targetX - piece.x;
            const dy = targetY - piece.y;

            groupA.pieces.forEach(p => {

                if (!p.fixed) {
                    p.x += dx;
                    p.y += dy;
                }

            });

            const unfixedCount =
                mergedGroup.pieces.filter(p => !p.fixed).length;

            if (unfixedCount >= 2) {
                centerGroupInAssemblyZone(mergedGroup);
            }

            return true;
        }
    }

    return false;
}

function trySnap(piece) {

    if (!piece || piece.fixed) {
        return false;
    }

    let snapped = false;

    if (checkCorrectPositionSnap(piece)) {
        snapped = true;
    }

    if (checkNeighborSnap(piece)) {
        snapped = true;
    }

    if (snapped) {

        updateProgress();

        draw();
    }

    return snapped;
}

// ======================================================
// PROGRESS
// ======================================================

function updateProgress() {

    const fixedCount =
        pieces.filter(p => p.fixed).length;

    const total = pieces.length;

    const percent =
        (fixedCount / total) * 100;

    progressBar.style.width = `${percent}%`;

    progressText.innerHTML =
        `🧩 Собрано ${fixedCount} / ${total}`;

    checkWin();
}

function checkWin() {

    const allPlaced =
        pieces.length > 0 &&
        pieces.every(p => p.fixed);

    if (
        allPlaced &&
        gameStarted &&
        !winShown
    ) {

        winShown = true;

        setTimeout(() => {

            winOverlay.classList.remove("hidden");
            winOverlay.classList.add("active");

            if (audio && audioEnabled) {
                audio.pause();
            }

        }, 500);
    }
}

// ======================================================
// LOAD PUZZLE
// ======================================================

async function loadPiecesInfo() {

    const response =
        await fetch(`/pieces-info/${PUZZLE_ID}`);

    if (!response.ok) {
        throw new Error('Не удалось загрузить пазл');
    }

    const data = await response.json();

    if (data.pieces) {
        return data;
    }

    return {
        pieces: data,
        legacy: true
    };
}

async function initPuzzle() {

    loadingSpinner.classList.remove('hidden');

    try {

        const puzzleData = await loadPiecesInfo();

        const piecesInfo = puzzleData.pieces;

        const isLegacy =
            puzzleData.legacy ||
            !puzzleData.puzzle_width;

        if (piecesInfo.length === 0) {
            throw new Error('Нет кусочков');
        }

        // ==================================================
        // NEW SYSTEM
        // ==================================================

        if (!isLegacy) {

            boardW =
                Math.max(
                    800,
                    puzzleData.puzzle_width + SCATTER_MARGIN * 2
                );

            boardH =
                Math.max(
                    600,
                    puzzleData.puzzle_height + SCATTER_MARGIN * 2
                );

            canvas.width = boardW;
            canvas.height = boardH;

            const zone =
                calculateAssemblyZoneFromBounds(
                    puzzleData.puzzle_width,
                    puzzleData.puzzle_height,
                    ZONE_VISUAL_MARGIN
                );

            assemblyZone = {
                x: zone.x,
                y: zone.y,
                w: zone.w,
                h: zone.h
            };

            const shiftX =
                zone.offsetX -
                puzzleData.puzzle_min_x;

            const shiftY =
                zone.offsetY -
                puzzleData.puzzle_min_y;

            pieces = [];

            for (const info of piecesInfo) {

                const img =
                    await loadPieceImage(info.id);

                const randomPos =
                    getRandomPositionOutsideAssembly(
                        info.width,
                        info.height
                    );

                pieces.push({

                    id: info.id,

                    img,

                    x: randomPos.x,
                    y: randomPos.y,

                    correctX: info.correct_x + shiftX,
                    correctY: info.correct_y + shiftY,

                    w: info.width,
                    h: info.height,

                    bboxX: info.bbox_x + shiftX,
                    bboxY: info.bbox_y + shiftY,

                    bboxW: info.bbox_w,
                    bboxH: info.bbox_h,

                    fixed: false,

                    group: null
                });
            }
        }

        // ==================================================
        // LEGACY
        // ==================================================

        else {

            let maxDim = 0;

            piecesInfo.forEach(p => {
                maxDim =
                    Math.max(maxDim, p.width, p.height);
            });

            const cols =
                Math.ceil(Math.sqrt(piecesInfo.length));

            const rows =
                Math.ceil(piecesInfo.length / cols);

            boardW =
                Math.max(1000, maxDim * cols * 1.4);

            boardH =
                Math.max(800, maxDim * rows * 1.4);

            canvas.width = boardW;
            canvas.height = boardH;

            calculateLegacyAssemblyZone();

            pieces = [];

            for (const info of piecesInfo) {

                const img =
                    await loadPieceImage(info.id);

                const randomPos =
                    getRandomPositionOutsideAssembly(
                        info.width,
                        info.height
                    );

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

    }
    catch (err) {

        console.error(err);

        alert("Ошибка загрузки пазла");
    }
    finally {

        loadingSpinner.classList.add('hidden');
    }
}