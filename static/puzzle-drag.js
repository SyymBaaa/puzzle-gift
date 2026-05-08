// ========== MOUSE EVENTS ==========
function onMouseDown(e) {
    e.preventDefault();
    if (!gameStarted) return;
    const coord = getCanvasCoords(e.clientX, e.clientY);
    const piece = getPieceAt(coord.x, coord.y);
    if (piece) {
        selectedPiece = piece;
        dragOffsetX = coord.x - piece.x;
        dragOffsetY = coord.y - piece.y;
    } else {
        isDraggingWrapper = true;
        wrapperDragStart.x = e.clientX - panX;
        wrapperDragStart.y = e.clientY - panY;
    }
}

function onMouseMove(e) {
    if (!gameStarted) return;
    if (selectedPiece && !selectedPiece.fixed) {
        const coord = getCanvasCoords(e.clientX, e.clientY);
        selectedPiece.x = coord.x - dragOffsetX;
        selectedPiece.y = coord.y - dragOffsetY;
        draw();
    } else if (isDraggingWrapper) {
        panX = e.clientX - wrapperDragStart.x;
        panY = e.clientY - wrapperDragStart.y;
        updateTransform();
    }
}

function onMouseUp(e) {
    if (!gameStarted) return;
    if (selectedPiece && !selectedPiece.fixed) {
        trySnapToCorrect(selectedPiece);
        selectedPiece = null;
        draw();
    }
    isDraggingWrapper = false;
}

// ========== TOUCH EVENTS ==========
function onTouchStart(e) {
    e.preventDefault();
    if (!gameStarted) return;
    const touch = e.touches[0];
    const coord = getCanvasCoords(touch.clientX, touch.clientY);
    const piece = getPieceAt(coord.x, coord.y);
    if (piece) {
        selectedPiece = piece;
        dragOffsetX = coord.x - piece.x;
        dragOffsetY = coord.y - piece.y;
    } else {
        isDraggingWrapper = true;
        wrapperDragStart.x = touch.clientX - panX;
        wrapperDragStart.y = touch.clientY - panY;
    }
}

function onTouchMove(e) {
    e.preventDefault();
    if (!gameStarted) return;
    if (selectedPiece && !selectedPiece.fixed) {
        const touch = e.touches[0];
        const coord = getCanvasCoords(touch.clientX, touch.clientY);
        selectedPiece.x = coord.x - dragOffsetX;
        selectedPiece.y = coord.y - dragOffsetY;
        draw();
    } else if (isDraggingWrapper) {
        const touch = e.touches[0];
        panX = touch.clientX - wrapperDragStart.x;
        panY = touch.clientY - wrapperDragStart.y;
        updateTransform();
    }
}

function onTouchEnd(e) {
    e.preventDefault();
    if (!gameStarted) return;
    if (selectedPiece && !selectedPiece.fixed) {
        trySnapToCorrect(selectedPiece);
        selectedPiece = null;
        draw();
    }
    isDraggingWrapper = false;
}

// ========== WHEEL ZOOM ==========
function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.min(Math.max(0.05, scale + delta), 2);
    updateTransform();
}

// ========== REGISTER EVENT LISTENERS ==========
function registerDragEvents() {
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
}