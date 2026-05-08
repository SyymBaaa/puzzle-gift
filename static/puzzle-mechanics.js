// ========== ALPHA HIT ==========
function isOpaquePixel(piece, x, y) {
    const px = Math.floor((x - piece.x) / piece.w * piece.img.width);
    const py = Math.floor((y - piece.y) / piece.h * piece.img.height);
    if (px < 0 || py < 0 || px >= piece.img.width || py >= piece.img.height) return false;
    const data = piece.hitCtx.getImageData(px, py, 1, 1).data;
    return data[3] > 20;
}

// ========== GROUPING ==========
function getGroup(p) {
    return p.group ? p.group.pieces : [p];
}

function mergeGroups(a, b) {
    const g1 = getGroup(a);
    const g2 = getGroup(b);
    const merged = [...new Set([...g1, ...g2])];
    const group = { pieces: merged };
    merged.forEach(p => p.group = group);
}

// ========== SNAP & WIN ==========
function trySnap(p) {
    if (Math.hypot(p.x - p.correctX, p.y - p.correctY) < 30) {
        p.x = p.correctX;
        p.y = p.correctY;
        p.fixed = true;
        checkWin();
        return;
    }

    for (const other of pieces) {
        if (p === other || other.fixed) continue;
        const dx = p.correctX - other.correctX;
        const dy = p.correctY - other.correctY;
        const targetX = other.x + dx;
        const targetY = other.y + dy;
        if (Math.hypot(p.x - targetX, p.y - targetY) < 30) {
            mergeGroups(p, other);
            const g = getGroup(p);
            g.forEach(x => {
                x.x += (targetX - p.x);
                x.y += (targetY - p.y);
            });
            return;
        }
    }
}

function checkWin() {
    if (pieces.every(p => p.fixed)) {
        document.getElementById('winOverlay').classList.remove('hidden');
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

// ========== WHEEL ZOOM ==========
window.onwheel = e => {
    if (!gameStarted) return;
    e.preventDefault();
    scale = clamp(scale + (e.deltaY > 0 ? -0.1 : 0.1), 0.4, 2.5);
    updateTransform();
};