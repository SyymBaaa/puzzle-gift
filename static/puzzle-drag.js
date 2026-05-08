// ========== GET PIECE UNDER MOUSE ==========
function getPiece(m) {
    for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        if (p.fixed) continue;
        if (m.x >= p.x && m.x <= p.x + p.w &&
            m.y >= p.y && m.y <= p.y + p.h &&
            isOpaquePixel(p, m.x, m.y)) {
            return p;
        }
    }
    return null;
}

// ========== MOUSE DOWN ==========
canvas.onmousedown = e => {
    if (!gameStarted) return;
    const m = getMouse(e);
    const piece = getPiece(m);

    if (piece) {
        dragMode = 'piece';
        selectedPiece = piece;
        const group = getGroup(piece);
        const base = group[0];
        dragOffsetX = m.x - base.x;
        dragOffsetY = m.y - base.y;

        // переупорядочиваем, чтобы группа рисовалась поверх
        pieces = pieces.filter(p => !group.includes(p));
        pieces.push(...group);
    } else {
        dragMode = 'canvas';
    }
};

// ========== MOUSE MOVE ==========
window.onmousemove = e => {
    if (!gameStarted) return;
    const m = getMouse(e);

    if (dragMode === 'piece' && selectedPiece) {
        const group = getGroup(selectedPiece);
        const base = group[0];
        const nx = m.x - dragOffsetX;
        const ny = m.y - dragOffsetY;
        const dx = nx - base.x;
        const dy = ny - base.y;

        group.forEach(p => {
            if (!p.fixed) {
                p.x = clamp(p.x + dx, -200, canvas.width + 200);
                p.y = clamp(p.y + dy, -200, canvas.height + 200);
            }
        });
    }

    if (dragMode === 'canvas') {
        panX += e.movementX;
        panY += e.movementY;
        updateTransform();
    }
};

// ========== MOUSE UP ==========
window.onmouseup = () => {
    if (selectedPiece) {
        getGroup(selectedPiece).forEach(trySnap);
    }
    selectedPiece = null;
    dragMode = null;
};