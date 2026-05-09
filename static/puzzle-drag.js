// ======================================================
// DRAG & INPUT SYSTEM
// ======================================================

// ========== STATE ==========

let dragStartTime = 0;

let lastDragPos = null;

// ======================================================
// HELPERS
// ======================================================

function moveGroup(group, dx, dy) {

    if (!group) return;

    group.pieces.forEach(piece => {

        if (!piece.fixed) {

            piece.x += dx;
            piece.y += dy;

        }

    });
}

function bringGroupToFront(group) {

    if (!group) return;

    const groupPieces = new Set(group.pieces);

    const remaining =
        pieces.filter(p => !groupPieces.has(p));

    pieces = [
        ...remaining,
        ...group.pieces
    ];
}

// ======================================================
// SNAP PREVIEW
// ======================================================

function showSnapPreview(piece) {

    snapHighlight = null;

    if (!piece) return;

    // ==========================================
    // PREVIEW CORRECT POSITION SNAP
    // ==========================================

    const dx =
        piece.correctX - piece.x;

    const dy =
        piece.correctY - piece.y;

    const dist =
        Math.hypot(dx, dy);

    if (dist < 60) {

        snapHighlight = {

            x: piece.correctX,
            y: piece.correctY,

            w: piece.w,
            h: piece.h
        };

        return;
    }

    // ==========================================
    // PREVIEW NEIGHBOR SNAP
    // ==========================================

    for (const other of pieces) {

        if (other === piece) continue;

        if (!areNeighbors(piece, other)) continue;

        const targetX =
            other.x +
            (piece.correctX - other.correctX);

        const targetY =
            other.y +
            (piece.correctY - other.correctY);

        const neighborDist =
            Math.hypot(
                targetX - piece.x,
                targetY - piece.y
            );

        if (neighborDist < 60) {

            snapHighlight = {

                x: targetX,
                y: targetY,

                w: piece.w,
                h: piece.h
            };

            return;
        }
    }
}

// ======================================================
// MOUSE EVENTS
// ======================================================

function onMouseDown(e) {

    e.preventDefault();

    if (!gameStarted) return;

    const coord =
        getCanvasCoords(
            e.clientX,
            e.clientY
        );

    const piece =
        getPieceAt(coord.x, coord.y);

    // ==========================================
    // SELECT PIECE
    // ==========================================

    if (piece) {

        const group =
            getGroup(piece);

        bringGroupToFront(group);

        selectedPiece = piece;

        dragOffsetX =
            coord.x - piece.x;

        dragOffsetY =
            coord.y - piece.y;

        dragStartTime = Date.now();

        lastDragPos = {
            x: coord.x,
            y: coord.y
        };

        draw();

        return;
    }

    // ==========================================
    // PAN CAMERA
    // ==========================================

    isDraggingWrapper = true;

    wrapperDragStart.x =
        e.clientX - panX;

    wrapperDragStart.y =
        e.clientY - panY;
}

function onMouseMove(e) {

    if (!gameStarted) return;

    // ==========================================
    // DRAG PIECE / GROUP
    // ==========================================

    if (
        selectedPiece &&
        !selectedPiece.fixed
    ) {

        const coord =
            getCanvasCoords(
                e.clientX,
                e.clientY
            );

        const newX =
            coord.x - dragOffsetX;

        const newY =
            coord.y - dragOffsetY;

        const dx =
            newX - selectedPiece.x;

        const dy =
            newY - selectedPiece.y;

        const group =
            getGroup(selectedPiece);

        moveGroup(group, dx, dy);

        lastDragPos = {
            x: coord.x,
            y: coord.y
        };

        showSnapPreview(selectedPiece);

        draw();

        return;
    }

    // ==========================================
    // PAN CAMERA
    // ==========================================

    if (isDraggingWrapper) {

        panX =
            e.clientX - wrapperDragStart.x;

        panY =
            e.clientY - wrapperDragStart.y;

        updateTransform();
    }
}

function onMouseUp(e) {

    if (!gameStarted) return;

    if (
        selectedPiece &&
        !selectedPiece.fixed
    ) {

        trySnap(selectedPiece);
    }

    selectedPiece = null;

    isDraggingWrapper = false;

    snapHighlight = null;

    draw();
}

// ======================================================
// TOUCH EVENTS
// ======================================================

function onTouchStart(e) {

    e.preventDefault();

    if (!gameStarted) return;

    const touch = e.touches[0];

    const coord =
        getCanvasCoords(
            touch.clientX,
            touch.clientY
        );

    const piece =
        getPieceAt(coord.x, coord.y);

    // ==========================================
    // SELECT PIECE
    // ==========================================

    if (piece) {

        const group =
            getGroup(piece);

        bringGroupToFront(group);

        selectedPiece = piece;

        dragOffsetX =
            coord.x - piece.x;

        dragOffsetY =
            coord.y - piece.y;

        dragStartTime = Date.now();

        lastDragPos = {
            x: coord.x,
            y: coord.y
        };

        draw();

        return;
    }

    // ==========================================
    // PAN CAMERA
    // ==========================================

    isDraggingWrapper = true;

    wrapperDragStart.x =
        touch.clientX - panX;

    wrapperDragStart.y =
        touch.clientY - panY;
}

function onTouchMove(e) {

    e.preventDefault();

    if (!gameStarted) return;

    // ==========================================
    // DRAG GROUP
    // ==========================================

    if (
        selectedPiece &&
        !selectedPiece.fixed
    ) {

        const touch = e.touches[0];

        const coord =
            getCanvasCoords(
                touch.clientX,
                touch.clientY
            );

        const newX =
            coord.x - dragOffsetX;

        const newY =
            coord.y - dragOffsetY;

        const dx =
            newX - selectedPiece.x;

        const dy =
            newY - selectedPiece.y;

        const group =
            getGroup(selectedPiece);

        moveGroup(group, dx, dy);

        lastDragPos = {
            x: coord.x,
            y: coord.y
        };

        showSnapPreview(selectedPiece);

        draw();

        return;
    }

    // ==========================================
    // PAN CAMERA
    // ==========================================

    if (isDraggingWrapper) {

        const touch = e.touches[0];

        panX =
            touch.clientX - wrapperDragStart.x;

        panY =
            touch.clientY - wrapperDragStart.y;

        updateTransform();
    }
}

function onTouchEnd(e) {

    e.preventDefault();

    if (!gameStarted) return;

    if (
        selectedPiece &&
        !selectedPiece.fixed
    ) {

        trySnap(selectedPiece);
    }

    selectedPiece = null;

    isDraggingWrapper = false;

    snapHighlight = null;

    draw();
}

// ======================================================
// WHEEL ZOOM
// ======================================================

function onWheel(e) {

    e.preventDefault();

    const delta =
        e.deltaY > 0
            ? -0.05
            : 0.05;

    scale =
        Math.min(
            Math.max(0.02, scale + delta),
            2.5
        );

    updateTransform();
}

// ======================================================
// REGISTER EVENTS
// ======================================================

function registerDragEvents() {

    // ==========================================
    // MOUSE
    // ==========================================

    canvas.addEventListener(
        'mousedown',
        onMouseDown
    );

    window.addEventListener(
        'mousemove',
        onMouseMove
    );

    window.addEventListener(
        'mouseup',
        onMouseUp
    );

    // ==========================================
    // TOUCH
    // ==========================================

    canvas.addEventListener(
        'touchstart',
        onTouchStart,
        { passive: false }
    );

    canvas.addEventListener(
        'touchmove',
        onTouchMove,
        { passive: false }
    );

    canvas.addEventListener(
        'touchend',
        onTouchEnd
    );

    canvas.addEventListener(
        'touchcancel',
        onTouchEnd
    );

    // ==========================================
    // ZOOM
    // ==========================================

    window.addEventListener(
        'wheel',
        onWheel,
        { passive: false }
    );
}