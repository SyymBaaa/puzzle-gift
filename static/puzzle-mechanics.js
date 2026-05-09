// ========== LOAD PUZZLE ==========
async function loadPiecesInfo() {
    const response = await fetch(`/pieces-info/${PUZZLE_ID}`);
    if (!response.ok) throw new Error('Не удалось загрузить информацию о пазле');
    const data = await response.json();
    
    // Новая структура: { pieces: [...], puzzle_width, puzzle_height, puzzle_min_x, puzzle_min_y }
    // Для обратной совместимости, если data.pieces нет, значит data сам был массивом
    if (data.pieces) {
        return data;
    } else {
        // Легаси-режим: data сам массив кусочков
        return { pieces: data, legacy: true };
    }
}

function calculateAssemblyZoneFromBounds(puzzleWidth, puzzleHeight, visualMargin) {
    // Рассчитываем зону сборки на основе реальных размеров пазла
    const zoneWidth = puzzleWidth + visualMargin * 2;
    const zoneHeight = puzzleHeight + visualMargin * 2;
    
    // Центрируем зону сборки на игровом поле
    const zoneX = (boardW - zoneWidth) / 2;
    const zoneY = (boardH - zoneHeight) / 2;
    
    return {
        x: zoneX,
        y: zoneY,
        w: zoneWidth,
        h: zoneHeight,
        // Сохраняем также смещение для корректировки правильных координат кусочков
        offsetX: zoneX - visualMargin,
        offsetY: zoneY - visualMargin
    };
}

function getRandomPositionOutsideAssembly(pieceW, pieceH, margin = 50) {
    // Генерируем позицию строго ЗА пределами зоны сборки
    const maxAttempts = 200;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const randX = margin + Math.random() * (boardW - pieceW - margin * 2);
        const randY = margin + Math.random() * (boardH - pieceH - margin * 2);
        
        // Проверяем, не пересекается ли с зоной сборки
        const overlapsAssembly = !(randX + pieceW + 10 < assemblyZone.x ||
                                   randX - 10 > assemblyZone.x + assemblyZone.w ||
                                   randY + pieceH + 10 < assemblyZone.y ||
                                   randY - 10 > assemblyZone.y + assemblyZone.h);
        
        if (!overlapsAssembly) {
            return { x: randX, y: randY };
        }
    }
    // fallback
    return { x: 30, y: 30 };
}

async function initPuzzle() {
    loadingSpinner.classList.remove('hidden');
    
    try {
        const puzzleData = await loadPiecesInfo();
        const piecesInfo = puzzleData.pieces;
        const isLegacy = puzzleData.legacy || !puzzleData.puzzle_width;
        
        if (piecesInfo.length === 0) {
            throw new Error('Нет данных о кусочках пазла');
        }
        
        // Определяем размер игрового поля
        if (!isLegacy && puzzleData.puzzle_width && puzzleData.puzzle_height) {
            // НОВАЯ ЛОГИКА: размер поля = размер пазла + отступы для разброса кусочков
            const margin = SCATTER_MARGIN; // 250px из конфига
            boardW = puzzleData.puzzle_width + margin * 2;
            boardH = puzzleData.puzzle_height + margin * 2;
            
            // Минимальный размер для комфорта
            boardW = Math.max(boardW, 800);
            boardH = Math.max(boardH, 600);
            
            canvas.width = boardW;
            canvas.height = boardH;
            
            // Рассчитываем зону сборки (с учётом визуального отступа)
            const visualMargin = ZONE_VISUAL_MARGIN; // 15px
            const zone = calculateAssemblyZoneFromBounds(puzzleData.puzzle_width, puzzleData.puzzle_height, visualMargin);
            assemblyZone = {
                x: zone.x,
                y: zone.y,
                w: zone.w,
                h: zone.h
            };
            
            // Корректируем правильные координаты кусочков (сдвигаем в центр)
            const shiftX = zone.offsetX - puzzleData.puzzle_min_x;
            const shiftY = zone.offsetY - puzzleData.puzzle_min_y;
            
            pieces = [];
            for (let i = 0; i < piecesInfo.length; i++) {
                const info = piecesInfo[i];
                const img = await loadPieceImage(info.id);
                
                // Корректируем правильные координаты
                const correctedX = info.correct_x + shiftX;
                const correctedY = info.correct_y + shiftY;
                
                const { x: randomX, y: randomY } = getRandomPositionOutsideAssembly(info.width, info.height, 50);
                
                pieces.push({
                    id: info.id,
                    img: img,
                    x: randomX,
                    y: randomY,
                    correctX: correctedX,
                    correctY: correctedY,
                    w: info.width,
                    h: info.height,
                    fixed: false,
                    group: null
                });
            }
        } else {
            // СТАРАЯ ЛОГИКА (обратная совместимость)
            console.log("Используется легаси-режим (старый формат пазла)");
            
            let maxDim = 0;
            piecesInfo.forEach(p => {
                maxDim = Math.max(maxDim, p.width, p.height);
            });
            const cols = Math.ceil(Math.sqrt(piecesInfo.length));
            const rows = Math.ceil(piecesInfo.length / cols);
            boardW = Math.max(1000, maxDim * cols * 1.4);
            boardH = Math.max(800, maxDim * rows * 1.4);
            canvas.width = boardW;
            canvas.height = boardH;
            calculateAssemblyZone(); // старый метод: 55% от canvas
        }
        
        updateProgress();
        draw();
        
        // Сброс камеры
        resetView();
        
    } catch (error) {
        console.error('Ошибка загрузки пазла:', error);
        alert('Не удалось загрузить пазл. Пожалуйста, обновите страницу.');
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

// ========== GROUP MANAGEMENT ==========
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
    
    if (groupA === groupB) return groupA;
    
    const mergedPieces = [...groupA.pieces, ...groupB.pieces];
    const mergedGroup = {
        pieces: mergedPieces
    };
    
    mergedPieces.forEach(p => {
        p.group = mergedGroup;
    });
    
    return mergedGroup;
}

function centerGroupInAssemblyZone(group) {
    if (!group || group.pieces.length === 0) return;
    
    // Вычисляем bounding box группы
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    group.pieces.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + p.w);
        maxY = Math.max(maxY, p.y + p.h);
    });
    
    const groupWidth = maxX - minX;
    const groupHeight = maxY - minY;
    
    // Центрируем группу ВНУТРИ зоны сборки
    const targetX = assemblyZone.x + (assemblyZone.w - groupWidth) / 2;
    const targetY = assemblyZone.y + (assemblyZone.h - groupHeight) / 2;
    
    const dx = targetX - minX;
    const dy = targetY - minY;
    
    group.pieces.forEach(p => {
        p.x += dx;
        p.y += dy;
    });
}

// Обновлённая проверка соседей с использованием bounding box
function areNeighbors(a, b) {
    // Проверяем, соприкасаются ли bounding box'ы кусочков
    const aRight = a.correctX + a.w / 2;
    const aLeft = a.correctX - a.w / 2;
    const aTop = a.correctY - a.h / 2;
    const aBottom = a.correctY + a.h / 2;
    
    const bRight = b.correctX + b.w / 2;
    const bLeft = b.correctX - b.w / 2;
    const bTop = b.correctY - b.h / 2;
    const bBottom = b.correctY + b.h / 2;
    
    // Горизонтальное соседство (бок о бок)
    const horizontalNeighbor = Math.abs(aRight - bLeft) < 10 || Math.abs(aLeft - bRight) < 10;
    const verticalOverlap = !(aBottom < bTop || aTop > bBottom);
    
    // Вертикальное соседство
    const verticalNeighbor = Math.abs(aBottom - bTop) < 10 || Math.abs(aTop - bBottom) < 10;
    const horizontalOverlap = !(aRight < bLeft || aLeft > bRight);
    
    return (horizontalNeighbor && verticalOverlap) || (verticalNeighbor && horizontalOverlap);
}

// ========== SNAP LOGIC (адаптирована под новую зону сборки) ==========
function checkBorderSnap(piece) {
    if (piece.fixed) return false;
    
    const threshold = 35;
    let snapped = false;
    let newX = piece.x;
    let newY = piece.y;
    
    if (Math.abs(piece.x - assemblyZone.x) < threshold) {
        newX = assemblyZone.x;
        snapped = true;
    } else if (Math.abs(piece.x + piece.w - (assemblyZone.x + assemblyZone.w)) < threshold) {
        newX = assemblyZone.x + assemblyZone.w - piece.w;
        snapped = true;
    }
    
    if (Math.abs(piece.y - assemblyZone.y) < threshold) {
        newY = assemblyZone.y;
        snapped = true;
    } else if (Math.abs(piece.y + piece.h - (assemblyZone.y + assemblyZone.h)) < threshold) {
        newY = assemblyZone.y + assemblyZone.h - piece.h;
        snapped = true;
    }
    
    if (snapped) {
        const group = getGroup(piece);
        const dx = newX - piece.x;
        const dy = newY - piece.y;
        
        group.pieces.forEach(p => {
            if (!p.fixed) {
                p.x += dx;
                p.y += dy;
            }
        });
        return true;
    }
    return false;
}

function checkCorrectPositionSnap(piece) {
    const group = getGroup(piece);
    const hasFixed = group.pieces.some(p => p.fixed);
    
    if (hasFixed) {
        // Проверяем только сам кусочек
        const dist = Math.hypot(piece.x - piece.correctX, piece.y - piece.correctY);
        if (dist < 25) {
            piece.x = piece.correctX - piece.w / 2;
            piece.y = piece.correctY - piece.h / 2;
            piece.fixed = true;
            return true;
        }
        return false;
    }
    
    // Нет фиксированных — можно сдвинуть всю группу
    const dx = piece.correctX - (piece.x + piece.w / 2);
    const dy = piece.correctY - (piece.y + piece.h / 2);
    const dist = Math.hypot(dx, dy);
    
    if (dist < 35) {
        group.pieces.forEach(p => {
            p.x += dx;
            p.y += dy;
        });
        group.pieces.forEach(p => {
            const d = Math.hypot((p.x + p.w / 2) - p.correctX, (p.y + p.h / 2) - p.correctY);
            if (d < 5) {
                p.x = p.correctX - p.w / 2;
                p.y = p.correctY - p.h / 2;
                p.fixed = true;
            }
        });
        return true;
    }
    return false;
}

function checkNeighborSnap(piece) {
    for (const other of pieces) {
        if (piece === other) continue;
        if (!areNeighbors(piece, other)) continue;
        
        // Расчёт желаемой позиции piece относительно other
        const targetX = other.x + (piece.correctX - other.correctX);
        const targetY = other.y + (piece.correctY - other.correctY);
        const dist = Math.hypot((piece.x + piece.w / 2) - (targetX + piece.w / 2), 
                                (piece.y + piece.h / 2) - (targetY + piece.h / 2));
        
        if (dist < 40) {
            const groupA = getGroup(piece);
            const groupB = getGroup(other);
            const mergedGroup = mergeGroups(piece, other);
            
            const hasFixed = mergedGroup.pieces.some(p => p.fixed);
            
            if (!hasFixed) {
                // Двигаем всю объединённую группу
                const dx = targetX - piece.x;
                const dy = targetY - piece.y;
                mergedGroup.pieces.forEach(p => {
                    p.x += dx;
                    p.y += dy;
                });
            } else {
                // Двигаем только нефиксированную часть
                const dx = targetX - piece.x;
                const dy = targetY - piece.y;
                groupA.pieces.forEach(p => {
                    if (!p.fixed) {
                        p.x += dx;
                        p.y += dy;
                    }
                });
            }
            return true;
        }
    }
    return false;
}

// Центрирование группы при соединении (вызывать после успешного снэпа)
function tryCenterGroup(piece) {
    // Если кусочек зафиксировался и в группе больше 1 элемента — центрируем
    if (piece.fixed) {
        const group = getGroup(piece);
        if (group.pieces.length >= 2) {
            // Проверяем, что вся группа внутри зоны сборки
            let allInside = true;
            for (const p of group.pieces) {
                if (p.x < assemblyZone.x || p.x + p.w > assemblyZone.x + assemblyZone.w ||
                    p.y < assemblyZone.y || p.y + p.h > assemblyZone.y + assemblyZone.h) {
                    allInside = false;
                    break;
                }
            }
            if (!allInside) {
                centerGroupInAssemblyZone(group);
            }
        }
    }
}

// Обновлённый trySnap
function trySnap(piece) {
    if (!piece || piece.fixed) return false;
    
    let snapped = false;
    
    if (checkBorderSnap(piece)) snapped = true;
    if (checkCorrectPositionSnap(piece)) snapped = true;
    if (checkNeighborSnap(piece)) snapped = true;
    
    if (snapped) {
        draw();
        updateProgress();
        tryCenterGroup(piece);
        draw();
    }
    
    return snapped;
}