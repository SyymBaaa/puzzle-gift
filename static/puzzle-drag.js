// ======================================================
// DRAG & INPUT SYSTEM
// ======================================================

// ========== STATE ==========

let dragStartTime = 0;
let lastDragPos = null;

// ======================================================
// СОРТИРОВКА ПОРЯДКА ОТРИСОВКИ (незафиксированные поверх)
// ======================================================

function updateDrawOrder() {
    // Сортируем массив pieces так, чтобы незафиксированные были в конце (рисуются поверх)
    pieces.sort((a, b) => {
        if (a.fixed === b.fixed) return 0;
        return a.fixed ? -1 : 1;
    });
}

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

    // Зафиксированные кусочки (всегда внизу)
    const fixedPieces = pieces.filter(p => p.fixed);
    // Незафиксированные кусочки не из выбранной группы
    const otherFreePieces = pieces.filter(p => !p.fixed && !groupPieces.has(p));
    // Выбранная группа (всегда сверху)
    const selectedPieces = group.pieces;

    // Новый порядок: зафиксированные → остальные свободные → выбранная группа
    pieces = [...fixedPieces, ...otherFreePieces, ...selectedPieces];
}

// ======================================================
// ПРОВЕРКА ГРАНИЦ И ВОЗВРАТ
// ======================================================

function getVisiblePercentage(piece) {
    const left = Math.max(0, piece.x);
    const right = Math.min(canvas.width, piece.x + piece.w);
    const top = Math.max(0, piece.y);
    const bottom = Math.min(canvas.height, piece.y + piece.h);

    const visibleWidth = Math.max(0, right - left);
    const visibleHeight = Math.max(0, bottom - top);
    const visibleArea = visibleWidth * visibleHeight;
    const totalArea = piece.w * piece.h;

    return totalArea > 0 ? (visibleArea / totalArea) * 100 : 0;
}

function snapPieceToCanvasBounds(piece) {
    let newX = piece.x;
    let newY = piece.y;
    let changed = false;

    // По горизонтали
    if (piece.x + piece.w < 0) {
        newX = 0;
        changed = true;
    } else if (piece.x > canvas.width) {
        newX = canvas.width - piece.w;
        changed = true;
    } else if (piece.x < 0 && piece.x + piece.w > 0) {
        newX = 0;
        changed = true;
    } else if (piece.x + piece.w > canvas.width && piece.x < canvas.width) {
        newX = canvas.width - piece.w;
        changed = true;
    }

    // По вертикали
    if (piece.y + piece.h < 0) {
        newY = 0;
        changed = true;
    } else if (piece.y > canvas.height) {
        newY = canvas.height - piece.h;
        changed = true;
    } else if (piece.y < 0 && piece.y + piece.h > 0) {
        newY = 0;
        changed = true;
    } else if (piece.y + piece.h > canvas.height && piece.y < canvas.height) {
        newY = canvas.height - piece.h;
        changed = true;
    }

    if (changed) {
        piece.x = newX;
        piece.y = newY;
    }

    return changed;
}

function returnGroupToRandomPositions(group) {
    for (const p of group.pieces) {
        if (!p.fixed) {
            const newPos = getRandomPositionOutsideAssembly(p.w, p.h, pieces);
            p.x = newPos.x;
            p.y = newPos.y;
            p.fixed = false;
            p.group = null;
        }
    }
    updateDrawOrder();
}

function snapGroupToCanvasBounds(group) {
    if (!group) return false;
    let anyChanged = false;
    for (const piece of group.pieces) {
        if (!piece.fixed && snapPieceToCanvasBounds(piece)) {
            anyChanged = true;
        }
    }
    if (anyChanged) {
        updateDrawOrder();
    }
    return anyChanged;
}

// ======================================================
// SNAP PREVIEW
// ======================================================

function showSnapPreview(piece) {
    snapHighlight = null;

    if (!piece) return;

    const dx = piece.correctX - piece.x;
    const dy = piece.correctY - piece.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 60) {
        snapHighlight = {
            x: piece.correctX,
            y: piece.correctY,
            w: piece.w,
            h: piece.h
        };
        return;
    }

    for (const other of pieces) {
        if (other === piece) continue;
        if (!areNeighbors(piece, other)) continue;

        const targetX = other.x + (piece.correctX - other.correctX);
        const targetY = other.y + (piece.correctY - other.correctY);
        const neighborDist = Math.hypot(targetX - piece.x, targetY - piece.y);

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

    const coord = getCanvasCoords(e.clientX, e.clientY);
    const piece = getPieceAt(coord.x, coord.y);

    if (piece) {
        const group = getGroup(piece);
        bringGroupToFront(group);
        selectedPiece = piece;
        dragOffsetX = coord.x - piece.x;
        dragOffsetY = coord.y - piece.y;
        dragStartTime = Date.now();
        lastDragPos = { x: coord.x, y: coord.y };
        draw();
        return;
    }

    isDraggingWrapper = true;
    wrapperDragStart.x = e.clientX - panX;
    wrapperDragStart.y = e.clientY - panY;
}

function onMouseMove(e) {
    if (!gameStarted) return;

    if (selectedPiece && !selectedPiece.fixed) {
        const coord = getCanvasCoords(e.clientX, e.clientY);
        const newX = coord.x - dragOffsetX;
        const newY = coord.y - dragOffsetY;
        const dx = newX - selectedPiece.x;
        const dy = newY - selectedPiece.y;
        const group = getGroup(selectedPiece);
        moveGroup(group, dx, dy);
        lastDragPos = { x: coord.x, y: coord.y };
        showSnapPreview(selectedPiece);
        draw();
        return;
    }

    if (isDraggingWrapper) {
        panX = e.clientX - wrapperDragStart.x;
        panY = e.clientY - wrapperDragStart.y;
        updateTransform();
    }
}

function onMouseUp(e) {
    if (!gameStarted) return;

    if (selectedPiece && !selectedPiece.fixed) {
        const group = getGroup(selectedPiece);

        let anyOutOfBounds = false;

        for (const p of group.pieces) {
            if (!p.fixed) {
                const visiblePercent = getVisiblePercentage(p);
                if (visiblePercent < 25) {
                    anyOutOfBounds = true;
                    break;
                }
            }
        }

        if (anyOutOfBounds) {
            returnGroupToRandomPositions(group);
            draw();
        } else {
            trySnap(selectedPiece);
            updateDrawOrder();
        }
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
    const coord = getCanvasCoords(touch.clientX, touch.clientY);
    const piece = getPieceAt(coord.x, coord.y);

    if (piece) {
        const group = getGroup(piece);
        bringGroupToFront(group);
        selectedPiece = piece;
        dragOffsetX = coord.x - piece.x;
        dragOffsetY = coord.y - piece.y;
        dragStartTime = Date.now();
        lastDragPos = { x: coord.x, y: coord.y };
        draw();
        return;
    }

    isDraggingWrapper = true;
    wrapperDragStart.x = touch.clientX - panX;
    wrapperDragStart.y = touch.clientY - panY;
}

function onTouchMove(e) {
    e.preventDefault();
    if (!gameStarted) return;

    if (selectedPiece && !selectedPiece.fixed) {
        const touch = e.touches[0];
        const coord = getCanvasCoords(touch.clientX, touch.clientY);
        const newX = coord.x - dragOffsetX;
        const newY = coord.y - dragOffsetY;
        const dx = newX - selectedPiece.x;
        const dy = newY - selectedPiece.y;
        const group = getGroup(selectedPiece);
        moveGroup(group, dx, dy);
        lastDragPos = { x: coord.x, y: coord.y };
        showSnapPreview(selectedPiece);
        draw();
        return;
    }

    if (isDraggingWrapper) {
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
        const group = getGroup(selectedPiece);

        let anyOutOfBounds = false;

        for (const p of group.pieces) {
            if (!p.fixed) {
                const visiblePercent = getVisiblePercentage(p);
                if (visiblePercent < 25) {
                    anyOutOfBounds = true;
                    break;
                }
            }
        }

        if (anyOutOfBounds) {
            returnGroupToRandomPositions(group);
            draw();
        } else {
            trySnap(selectedPiece);
            updateDrawOrder();
        }
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
    const delta = e.deltaY > 0 ? -0.02 : 0.02;
    scale = Math.min(Math.max(0.2, scale + delta), 1.5);
    updateTransform();
}

// ======================================================
// REGISTER EVENTS
// ======================================================

function registerDragEvents() {
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    window.addEventListener('wheel', onWheel, { passive: false });
}