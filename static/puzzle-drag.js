// ========== MOUSE EVENTS ==========
let dragStartTime = 0;
let lastDragPos = null;

function onMouseDown(e) {
    e.preventDefault();
    if (!gameStarted) return;
    const coord = getCanvasCoords(e.clientX, e.clientY);
    const piece = getPieceAt(coord.x, coord.y);
    if (piece) {
        selectedPiece = piece;
        dragOffsetX = coord.x - piece.x;
        dragOffsetY = coord.y - piece.y;
        dragStartTime = Date.now();
        lastDragPos = { x: coord.x, y: coord.y };
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
        
        // Показываем притягивание в реальном времени
        showSnapPreview(selectedPiece);
        
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
        trySnap(selectedPiece);
        selectedPiece = null;
        draw();
    }
    isDraggingWrapper = false;
    snapHighlight = null;
    draw();
}

// Предпросмотр притягивания
function showSnapPreview(piece) {
    snapHighlight = null;
    
    // Проверяем притягивание к границе
    const threshold = 50;
    if (Math.abs(piece.x - assemblyZone.x) < threshold) {
        snapHighlight = { x: assemblyZone.x, y: piece.y, w: piece.w, h: piece.h };
    } else if (Math.abs(piece.x + piece.w - (assemblyZone.x + assemblyZone.w)) < threshold) {
        snapHighlight = { x: assemblyZone.x + assemblyZone.w - piece.w, y: piece.y, w: piece.w, h: piece.h };
    } else if (Math.abs(piece.y - assemblyZone.y) < threshold) {
        snapHighlight = { x: piece.x, y: assemblyZone.y, w: piece.w, h: piece.h };
    } else if (Math.abs(piece.y + piece.h - (assemblyZone.y + assemblyZone.h)) < threshold) {
        snapHighlight = { x: piece.x, y: assemblyZone.y + assemblyZone.h - piece.h, w: piece.w, h: piece.h };
    }
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
        showSnapPreview(selectedPiece);
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
        trySnap(selectedPiece);
        selectedPiece = null;
        draw();
    }
    isDraggingWrapper = false;
    snapHighlight = null;
    draw();
}

// ========== WHEEL ZOOM ==========
function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.min(Math.max(0.3, scale + delta), 2.5);
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