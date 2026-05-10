const PUZZLE_ID = window.PUZZLE_ID;

// ========== НАСТРОЙКИ ОТСТУПОВ ==========
const SCATTER_MARGIN_X = 1900;
const SCATTER_MARGIN_Y = 900;
const ZONE_VISUAL_MARGIN = 0;
const SNAP_THRESHOLD = 45;
const GROUP_SNAP_THRESHOLD = 55;
const BORDER_SNAP_THRESHOLD = 55;

// ========== ОПТИМИЗАЦИЯ ДЛЯ МОБИЛЬНЫХ ==========
const MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const ENABLE_SHADOWS = !MOBILE;
const ENABLE_PULSE = true;

let pieces = [];
let selectedPiece = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let gameStarted = false;
let winShown = false;
let boardW = 0;
let boardH = 0;
let scale = 0.25;
let panX = 0;
let panY = 0;
let isDraggingWrapper = false;
let wrapperDragStart = { x: 0, y: 0 };
let snapHighlight = null;
let assemblyZone = { x: 0, y: 0, w: 0, h: 0 };

// ======================================================
// PARTICLE SYSTEM
// ======================================================

let snapEffects = [];
let groupFlashEffects = [];
let animFrameId = null;

// ========== ОПТИМИЗАЦИЯ DRAG ==========
let dragPending = false;
let dragGroup = null;
let dragDx = 0, dragDy = 0;

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

function getRandomPositionOutsideAssembly(pieceW, pieceH, existingPieces = []) {
    const margin = 20;
    const maxAttempts = 200;

    function stage1_NoOverlap(x, y, w, h, existing) {
        for (const piece of existing) {
            if (piece.fixed) continue;
            if (x < piece.x + piece.w + margin &&
                x + w + margin > piece.x &&
                y < piece.y + piece.h + margin &&
                y + h + margin > piece.y) {
                return false;
            }
        }
        return true;
    }

    function getOverlapRatio(x1, y1, w1, h1, x2, y2, w2, h2) {
        const overlapX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
        const overlapY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
        const overlapArea = overlapX * overlapY;
        const pieceArea = w1 * h1;
        return overlapArea / pieceArea;
    }

    function stage2_ControlledOverlap(x, y, w, h, existing) {
        let overlappingCount = 0;
        for (const piece of existing) {
            if (piece.fixed) continue;
            const overlap = getOverlapRatio(x, y, w, h, piece.x, piece.y, piece.w, piece.h);
            if (overlap > 0.01) {
                overlappingCount++;
                if (overlappingCount > 2) return false;
                if (overlap > 0.05) return false;
            }
        }
        return true;
    }

    function stage3_RandomPlacement(x, y, w, h) {
        const overlapsAssembly = !(
            x + w < assemblyZone.x ||
            x > assemblyZone.x + assemblyZone.w ||
            y + h < assemblyZone.y ||
            y > assemblyZone.y + assemblyZone.h
        );
        return !overlapsAssembly;
    }

    const zones = [];
    const totalPieces = existingPieces.length + 1;
    const sideExpansion = Math.min(1.5, 1 + totalPieces / 100);

    if (assemblyZone.x - pieceW > margin) {
        zones.push({
            xMin: margin,
            xMax: assemblyZone.x - pieceW + pieceW * 0.3,
            yMin: Math.max(margin, assemblyZone.y - pieceH * sideExpansion),
            yMax: Math.min(boardH - pieceH - margin, assemblyZone.y + assemblyZone.h + pieceH * sideExpansion),
            priority: 1
        });
    }

    if (assemblyZone.x + assemblyZone.w + pieceW < boardW - margin) {
        zones.push({
            xMin: assemblyZone.x + assemblyZone.w - pieceW * 0.3,
            xMax: boardW - pieceW - margin,
            yMin: Math.max(margin, assemblyZone.y - pieceH * sideExpansion),
            yMax: Math.min(boardH - pieceH - margin, assemblyZone.y + assemblyZone.h + pieceH * sideExpansion),
            priority: 1
        });
    }

    if (assemblyZone.y - pieceH > margin) {
        zones.push({
            xMin: Math.max(margin, assemblyZone.x - pieceW * sideExpansion),
            xMax: Math.min(boardW - pieceW - margin, assemblyZone.x + assemblyZone.w + pieceW * sideExpansion),
            yMin: margin,
            yMax: assemblyZone.y - pieceH + pieceH * 0.3,
            priority: 2
        });
    }

    if (assemblyZone.y + assemblyZone.h + pieceH < boardH - margin) {
        zones.push({
            xMin: Math.max(margin, assemblyZone.x - pieceW * sideExpansion),
            xMax: Math.min(boardW - pieceW - margin, assemblyZone.x + assemblyZone.w + pieceW * sideExpansion),
            yMin: assemblyZone.y + assemblyZone.h - pieceH * 0.3,
            yMax: boardH - pieceH - margin,
            priority: 2
        });
    }

    if (assemblyZone.x - pieceW - margin > margin && assemblyZone.y - pieceH - margin > margin) {
        zones.push({ xMin: margin, xMax: assemblyZone.x - pieceW - margin, yMin: margin, yMax: assemblyZone.y - pieceH - margin, priority: 3 });
    }
    if (assemblyZone.x + assemblyZone.w + pieceW + margin < boardW - margin && assemblyZone.y - pieceH - margin > margin) {
        zones.push({ xMin: assemblyZone.x + assemblyZone.w + margin, xMax: boardW - pieceW - margin, yMin: margin, yMax: assemblyZone.y - pieceH - margin, priority: 3 });
    }
    if (assemblyZone.x - pieceW - margin > margin && assemblyZone.y + assemblyZone.h + pieceH + margin < boardH - margin) {
        zones.push({ xMin: margin, xMax: assemblyZone.x - pieceW - margin, yMin: assemblyZone.y + assemblyZone.h + margin, yMax: boardH - pieceH - margin, priority: 3 });
    }
    if (assemblyZone.x + assemblyZone.w + pieceW + margin < boardW - margin && assemblyZone.y + assemblyZone.h + pieceH + margin < boardH - margin) {
        zones.push({ xMin: assemblyZone.x + assemblyZone.w + margin, xMax: boardW - pieceW - margin, yMin: assemblyZone.y + assemblyZone.h + margin, yMax: boardH - pieceH - margin, priority: 3 });
    }

    zones.push({ xMin: margin, xMax: boardW - pieceW - margin, yMin: margin, yMax: boardH - pieceH - margin, priority: 10 });
    zones.sort((a, b) => a.priority - b.priority);

    const piecesCount = existingPieces.length;
    let useStage = 1;
    if (piecesCount > 20) useStage = 2;
    if (piecesCount > 32) useStage = 3;

    for (const zone of zones) {
        if (zone.xMax < zone.xMin || zone.yMax < zone.yMin) continue;
        const attempts = maxAttempts + piecesCount * 3;
        for (let attempt = 0; attempt < attempts; attempt++) {
            let x = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
            let y = zone.yMin + Math.random() * (zone.yMax - zone.yMin);
            x += (Math.random() - 0.5) * pieceW * 0.1;
            y += (Math.random() - 0.5) * pieceH * 0.1;
            x = Math.max(zone.xMin, Math.min(zone.xMax, x));
            y = Math.max(zone.yMin, Math.min(zone.yMax, y));
            let isValid = false;
            if (useStage === 1) isValid = stage1_NoOverlap(x, y, pieceW, pieceH, existingPieces);
            else if (useStage === 2) isValid = stage2_ControlledOverlap(x, y, pieceW, pieceH, existingPieces);
            else isValid = stage3_RandomPlacement(x, y, pieceW, pieceH);
            if (isValid) return { x, y };
        }
    }

    for (let attempt = 0; attempt < 100; attempt++) {
        const x = margin + Math.random() * (boardW - pieceW - margin * 2);
        const y = margin + Math.random() * (boardH - pieceH - margin * 2);
        const overlapsAssembly = !(
            x + pieceW < assemblyZone.x + pieceW * 0.5 ||
            x > assemblyZone.x + assemblyZone.w - pieceW * 0.5 ||
            y + pieceH < assemblyZone.y + pieceH * 0.5 ||
            y > assemblyZone.y + assemblyZone.h - pieceH * 0.5
        );
        if (!overlapsAssembly) return { x, y };
    }

    return {
        x: margin + (boardW - pieceW - margin * 2) * Math.random(),
        y: margin + (boardH - pieceH - margin * 2) * Math.random()
    };
}

// ======================================================
// SNAP PARTICLE EFFECT
// ======================================================

function spawnSnapEffect(cx, cy) {
    const now = performance.now();
    const starCount = MOBILE ? 8 : 16;
    const stars = [];

    for (let i = 0; i < starCount; i++) {
        const angle = (i / starCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const speed = 360 + Math.random() * 440;
        const size = (MOBILE ? 4 : 6) + Math.random() * (MOBILE ? 6 : 10);
        const hue = 38 + Math.random() * 22;
        const sat = 90 + Math.random() * 10;
        const lit = 55 + Math.random() * 20;

        stars.push({
            x: cx, y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 60,
            gravity: 320,
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 12,
            size,
            color: `hsl(${hue},${sat}%,${lit}%)`,
            born: now,
            life: 0.65 + Math.random() * 0.35,
        });
    }

    snapEffects.push({
        type: 'snap',
        cx, cy,
        born: now,
        flashDuration: 0.35,
        totalLife: 1.1,
        stars,
    });

    if (!animFrameId) {
        animFrameId = requestAnimationFrame(animateTick);
    }
}

// ======================================================
// GROUP FLASH EFFECT
// ======================================================

function spawnGroupFlashEffect(piecesInGroup, duration = 1.5) {
    if (!piecesInGroup || piecesInGroup.length === 0) return;
    const now = performance.now();
    groupFlashEffects.push({
        pieceIds: piecesInGroup.map(p => p.id),
        startTime: now,
        duration,
    });
    if (!animFrameId) {
        animFrameId = requestAnimationFrame(animateTick);
    }
}

function animateTick(timestamp) {
    draw();
    const now = performance.now();
    snapEffects = snapEffects.filter(e => (now - e.born) / 1000 < e.totalLife);
    groupFlashEffects = groupFlashEffects.filter(e => (now - e.startTime) / 1000 < e.duration);
    if (snapEffects.length > 0 || groupFlashEffects.length > 0) {
        animFrameId = requestAnimationFrame(animateTick);
    } else {
        animFrameId = null;
    }
}

function drawStar5(ctx, cx, cy, innerR, outerR) {
    const points = 5;
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < points * 2; i++) {
        const angle = (Math.PI / points) * i - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    ctx.closePath();
}

function drawSnapEffects() {
    if (snapEffects.length === 0) return;
    const now = performance.now();
    ctx.save();
    for (const eff of snapEffects) {
        const t = (now - eff.born) / 1000;
        if (t >= eff.totalLife) continue;
        {
            const ft = Math.min(t / eff.flashDuration, 1);
            const radius = ft * 180;
            const alpha = (1 - ft) * 0.75;
            const grd = ctx.createRadialGradient(eff.cx, eff.cy, radius * 0.3, eff.cx, eff.cy, radius);
            grd.addColorStop(0, `rgba(255,240,160,${alpha})`);
            grd.addColorStop(0.5, `rgba(255,200,60,${alpha * 0.6})`);
            grd.addColorStop(1, `rgba(255,160,0,0)`);
            ctx.beginPath();
            ctx.arc(eff.cx, eff.cy, Math.max(0.1, radius), 0, Math.PI * 2);
            ctx.fillStyle = grd;
            ctx.fill();
            const coreR = Math.max(0.1, radius * 0.25 * (1 - ft));
            const coreGrd = ctx.createRadialGradient(eff.cx, eff.cy, 0, eff.cx, eff.cy, coreR);
            coreGrd.addColorStop(0, `rgba(255,255,220,${alpha * 1.4})`);
            coreGrd.addColorStop(1, `rgba(255,220,100,0)`);
            ctx.beginPath();
            ctx.arc(eff.cx, eff.cy, coreR, 0, Math.PI * 2);
            ctx.fillStyle = coreGrd;
            ctx.fill();
        }
        for (const s of eff.stars) {
            const st = (now - s.born) / 1000;
            if (st >= s.life) continue;
            const lifeRatio = st / s.life;
            const alpha = lifeRatio < 0.15 ? lifeRatio / 0.15 : 1 - (lifeRatio - 0.15) / 0.85;
            const px = s.x + s.vx * st;
            const py = s.y + s.vy * st + 0.5 * s.gravity * st * st;
            const rot = s.rotation + s.rotSpeed * st;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(rot);
            ctx.globalAlpha = Math.max(0, alpha);
            const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, s.size);
            grd.addColorStop(0, '#fffde0');
            grd.addColorStop(0.3, s.color);
            grd.addColorStop(1, 'rgba(255,140,0,0)');
            ctx.fillStyle = grd;
            ctx.beginPath();
            drawStar5(ctx, 0, 0, s.size * 0.42, s.size);
            ctx.fill();
            ctx.restore();
        }
    }
    ctx.restore();
}

// ======================================================
// DRAW
// ======================================================

function drawAssemblyZone() {
    ctx.save();
    if (ENABLE_SHADOWS) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
    }
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
    ctx.lineWidth = MOBILE ? 2 : 3;
    ctx.strokeRect(assemblyZone.x, assemblyZone.y, assemblyZone.w, assemblyZone.h);
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1a2418";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawAssemblyZone();

    // Вычисляем интенсивность пульсации для каждого кусочка
    const flashIntensityMap = new Map();
    if (groupFlashEffects.length > 0 && ENABLE_PULSE) {
        const now = performance.now();
        for (const eff of groupFlashEffects) {
            const elapsed = (now - eff.startTime) / 1000;
            if (elapsed >= eff.duration) continue;
            const decay = 1 - Math.pow(elapsed / eff.duration, 1.5);
            const frequency = 0.8 * Math.PI * 2;
            let intensity = (Math.sin(elapsed * frequency) + 1) / 2;
            intensity = intensity * decay * 0.45;
            for (const pieceId of eff.pieceIds) {
                const existing = flashIntensityMap.get(pieceId);
                if (existing === undefined || intensity > existing) {
                    flashIntensityMap.set(pieceId, intensity);
                }
            }
        }
    }

    if (!wrapper.style.willChange) {
        wrapper.style.willChange = 'transform';
    }

    for (const p of pieces) {
        if (ENABLE_SHADOWS) {
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
        }

        const flashIntensity = flashIntensityMap.get(p.id) || 0;

        if (flashIntensity > 0.02 && ENABLE_PULSE) {
            // OffscreenCanvas + source-atop:
            // накладываем золотой цвет ТОЛЬКО по непрозрачным пикселям (форме пазла).
            // Прозрачные края кусочка остаются нетронутыми — прямоугольная рамка не светится.
            const oc = new OffscreenCanvas(p.w, p.h);
            const octx = oc.getContext('2d');
            octx.drawImage(p.img, 0, 0, p.w, p.h);         // 1. Рисуем фигурный пазл
            octx.globalCompositeOperation = 'source-atop';  // 2. Следующий рендер — только по форме
            octx.fillStyle = `rgba(255, 220, 100, ${flashIntensity * 0.55})`;
            octx.fillRect(0, 0, p.w, p.h);                  // 3. Накладываем золотой цвет
            ctx.drawImage(oc, p.x, p.y, p.w, p.h);         // 4. Выводим результат
        } else {
            ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
        }
    }

    ctx.shadowBlur = 0;
    drawSnapEffects();
}

// ======================================================
// CAMERA
// ======================================================

function updateTransform() {
    wrapper.style.transform = `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${scale})`;
}

function resetView() {
    scale = MOBILE ? 0.2 : 0.25;
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
    // Запускаем пульсацию для всей объединённой группы
    setTimeout(() => spawnGroupFlashEffect(merged.pieces, 1.0), 10);
    return merged;
}

// ======================================================
// GROUP BOUNDS
// ======================================================

function getGroupBounds(group) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    group.pieces.forEach(p => {
        const offX = p.x - p.correctX;
        const offY = p.y - p.correctY;
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
// ======================================================

function areNeighbors(a, b) {
    const aCenterX = a.correctX + a.bboxW / 2;
    const aCenterY = a.correctY + a.bboxH / 2;
    const bCenterX = b.correctX + b.bboxW / 2;
    const bCenterY = b.correctY + b.bboxH / 2;
    const dx = Math.abs(aCenterX - bCenterX);
    const dy = Math.abs(aCenterY - bCenterY);
    const avgW = (a.bboxW + b.bboxW) / 2;
    const avgH = (a.bboxH + b.bboxH) / 2;
    const areAdjacent = (dx < avgW * 1.2) && (dy < avgH * 1.2);
    const isSame = a.id === b.id;
    return areAdjacent && !isSame;
}

// ======================================================
// BORDER SNAP
// ======================================================

function checkBorderSnap(piece) {
    if (piece.fixed) return false;
    let snapped = false;
    let newX = piece.x;
    let newY = piece.y;
    if (Math.abs(piece.x - assemblyZone.x) < BORDER_SNAP_THRESHOLD) {
        newX = assemblyZone.x; snapped = true;
    } else if (Math.abs(piece.x + piece.w - (assemblyZone.x + assemblyZone.w)) < BORDER_SNAP_THRESHOLD) {
        newX = assemblyZone.x + assemblyZone.w - piece.w; snapped = true;
    }
    if (Math.abs(piece.y - assemblyZone.y) < BORDER_SNAP_THRESHOLD) {
        newY = assemblyZone.y; snapped = true;
    } else if (Math.abs(piece.y + piece.h - (assemblyZone.y + assemblyZone.h)) < BORDER_SNAP_THRESHOLD) {
        newY = assemblyZone.y + assemblyZone.h - piece.h; snapped = true;
    }
    if (snapped) {
        const group = getGroup(piece);
        const dx = newX - piece.x;
        const dy = newY - piece.y;
        group.pieces.forEach(p => {
            if (!p.fixed) { p.x += dx; p.y += dy; }
        });
        return true;
    }
    return false;
}

// ======================================================
// SNAP LOGIC
// ======================================================

function checkCorrectPositionSnap(piece) {
    const group = getGroup(piece);
    const hasFixed = group.pieces.some(p => p.fixed);
    if (hasFixed) {
        const dist = Math.hypot(piece.x - piece.correctX, piece.y - piece.correctY);
        if (dist < 25) {
            piece.x = piece.correctX;
            piece.y = piece.correctY;
            piece.fixed = true;
            return true;
        }
        return false;
    }
    const dx = piece.correctX - piece.x;
    const dy = piece.correctY - piece.y;
    const dist = Math.hypot(dx, dy);
    if (dist < SNAP_THRESHOLD) {
        group.pieces.forEach(p => {
            if (!p.fixed) { p.x += dx; p.y += dy; }
        });
        group.pieces.forEach(p => {
            if (Math.hypot(p.correctX - p.x, p.correctY - p.y) < 3) {
                p.x = p.correctX; p.y = p.correctY; p.fixed = true;
            }
        });
        return true;
    }
    return false;
}

function checkNeighborSnap(piece) {
    const myGroup = getGroup(piece);
    for (const other of pieces) {
        if (piece === other) continue;
        if (getGroup(other) === myGroup) continue;
        if (!areNeighbors(piece, other)) continue;
        const targetX = other.x + (piece.correctX - other.correctX);
        const targetY = other.y + (piece.correctY - other.correctY);
        const dist = Math.hypot(targetX - piece.x, targetY - piece.y);
        if (dist < GROUP_SNAP_THRESHOLD) {
            const dx = targetX - piece.x;
            const dy = targetY - piece.y;
            myGroup.pieces.forEach(p => {
                if (!p.fixed) { p.x += dx; p.y += dy; }
            });
            const mergedGroup = mergeGroups(piece, other);
            mergedGroup.pieces.forEach(p => {
                if (Math.hypot(p.correctX - p.x, p.correctY - p.y) < 3) {
                    p.x = p.correctX; p.y = p.correctY; p.fixed = true;
                }
            });
            return true;
        }
    }
    return false;
}

// ======================================================
// CENTER GROUP AFTER SNAP
// ======================================================

function tryCenterGroup(piece) {
    if (piece.fixed) {
        const group = getGroup(piece);
        if (group.pieces.length >= 2) {
            let allInside = true;
            for (const p of group.pieces) {
                if (p.x < assemblyZone.x || p.x + p.w > assemblyZone.x + assemblyZone.w ||
                    p.y < assemblyZone.y || p.y + p.h > assemblyZone.y + assemblyZone.h) {
                    allInside = false;
                    break;
                }
            }
            if (!allInside) centerGroupInAssemblyZone(group);
        }
    }
}

// ======================================================
// MAIN SNAP FUNCTION
// ======================================================

function trySnap(piece) {
    if (!piece || piece.fixed) return false;
    const fixedBefore = new Set(pieces.filter(p => p.fixed));
    let snapped = false;
    if (checkBorderSnap(piece)) snapped = true;
    if (checkCorrectPositionSnap(piece)) snapped = true;
    if (checkNeighborSnap(piece)) snapped = true;
    if (snapped) {
        draw();
        updateProgress();
        tryCenterGroup(piece);
        draw();
        pieces.forEach(p => {
            if (p.fixed && !fixedBefore.has(p)) {
                const cx = p.correctX + p.w / 2;
                const cy = p.correctY + p.h / 2;
                spawnSnapEffect(cx, cy);
            }
        });
        // Вибрация на мобиле при фиксации
        if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
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
            const video = document.getElementById('winVideo');
            if (video) video.play().catch(e => console.log('Видео не запустилось:', e));
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
            boardW = Math.max(800, puzzleData.puzzle_width + SCATTER_MARGIN_X * 2);
            boardH = Math.max(600, puzzleData.puzzle_height + SCATTER_MARGIN_Y * 2);
            canvas.width = boardW;
            canvas.height = boardH;
            const zone = calculateAssemblyZoneFromBounds(puzzleData.puzzle_width, puzzleData.puzzle_height, ZONE_VISUAL_MARGIN);
            assemblyZone = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
            const shiftX = zone.offsetX - puzzleData.puzzle_min_x;
            const shiftY = zone.offsetY - puzzleData.puzzle_min_y;
            const placedPieces = [];
            for (const info of piecesInfo) {
                const img = await loadPieceImage(info.id);
                const randomPos = getRandomPositionOutsideAssembly(info.width, info.height, placedPieces);
                const piece = {
                    id: info.id, img,
                    x: randomPos.x, y: randomPos.y,
                    correctX: info.correct_x + shiftX,
                    correctY: info.correct_y + shiftY,
                    w: info.width, h: info.height,
                    bboxX: info.bbox_x + shiftX, bboxY: info.bbox_y + shiftY,
                    bboxW: info.bbox_w, bboxH: info.bbox_h,
                    fixed: false, group: null
                };
                placedPieces.push(piece);
            }
            pieces = placedPieces;
        } else {
            let maxDim = 0;
            piecesInfo.forEach(p => { maxDim = Math.max(maxDim, p.width, p.height); });
            const cols = Math.ceil(Math.sqrt(piecesInfo.length));
            const rows = Math.ceil(piecesInfo.length / cols);
            boardW = Math.max(1000, maxDim * cols * 1.4);
            boardH = Math.max(800, maxDim * rows * 1.4);
            canvas.width = boardW;
            canvas.height = boardH;
            calculateLegacyAssemblyZone();
            const placedPieces = [];
            for (const info of piecesInfo) {
                const img = await loadPieceImage(info.id);
                const randomPos = getRandomPositionOutsideAssembly(info.width, info.height, placedPieces);
                const piece = {
                    id: info.id, img,
                    x: randomPos.x, y: randomPos.y,
                    correctX: info.correct_x, correctY: info.correct_y,
                    w: info.width, h: info.height,
                    bboxX: info.correct_x, bboxY: info.correct_y,
                    bboxW: info.width, bboxH: info.height,
                    fixed: false, group: null
                };
                placedPieces.push(piece);
            }
            pieces = placedPieces;
        }
        groupFlashEffects = [];
        snapEffects = [];
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