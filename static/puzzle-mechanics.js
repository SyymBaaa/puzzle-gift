// ========== LOAD PUZZLE ==========
async function loadPiecesInfo() {
    const response = await fetch(`/pieces-info/${PUZZLE_ID}`);
    if (!response.ok) throw new Error('Не удалось загрузить информацию о пазле');
    return await response.json();
}

function loadPieceImage(pieceId) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `/piece/${PUZZLE_ID}/${pieceId}`;
    });
}

function getRandomPositionOutsideAssembly(pieceW, pieceH) {
    const margin = 30;
    
    for (let attempt = 0; attempt < 80; attempt++) {
        const randX = margin + Math.random() * (boardW - pieceW - margin * 2);
        const randY = margin + Math.random() * (boardH - pieceH - margin * 2);
        
        const overlapsAssembly = !(randX + pieceW + 10 < assemblyZone.x ||
                                   randX - 10 > assemblyZone.x + assemblyZone.w ||
                                   randY + pieceH + 10 < assemblyZone.y ||
                                   randY - 10 > assemblyZone.y + assemblyZone.h);
        
        if (!overlapsAssembly) {
            return { x: randX, y: randY };
        }
    }
    
    // Если не нашли - кладём слева от зоны сборки
    return { x: 30, y: 30 };
}

async function initPuzzle() {
    loadingSpinner.classList.remove('hidden');
    
    try {
        const piecesInfo = await loadPiecesInfo();
        
        if (piecesInfo.length === 0) {
            throw new Error('Нет данных о кусочках пазла');
        }
        
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
        
        calculateAssemblyZone();
        
        pieces = [];
        for (let i = 0; i < piecesInfo.length; i++) {
            const info = piecesInfo[i];
            const img = await loadPieceImage(info.id);
            
            const { x: randomX, y: randomY } = getRandomPositionOutsideAssembly(info.width, info.height);
            
            pieces.push({
                id: info.id,
                img: img,
                x: randomX,
                y: randomY,
                correctX: info.correct_x + 150,
                correctY: info.correct_y + 150,
                w: info.width,
                h: info.height,
                fixed: false,
                group: null
            });
        }
        
        updateProgress();
        draw();
        
    } catch (error) {
        console.error('Ошибка загрузки пазла:', error);
        alert('Не удалось загрузить пазл. Пожалуйста, обновите страницу.');
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

// ========== GROUP MANAGEMENT ==========
function getGroup(piece) {
    if (!piece.group) return [piece];
    return piece.group.pieces;
}

function mergeGroups(a, b) {
    const groupA = getGroup(a);
    const groupB = getGroup(b);
    
    if (groupA === groupB) return groupA;
    
    const merged = [...new Set([...groupA, ...groupB])];
    const groupObj = { pieces: merged };
    
    merged.forEach(p => p.group = groupObj);
    return groupObj;
}

function centerGroupInAssemblyZone(group) {
    if (!group || group.length === 0) return;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    group.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + p.w);
        maxY = Math.max(maxY, p.y + p.h);
    });
    
    const groupWidth = maxX - minX;
    const groupHeight = maxY - minY;
    
    const targetX = assemblyZone.x + (assemblyZone.w - groupWidth) / 2;
    const targetY = assemblyZone.y + (assemblyZone.h - groupHeight) / 2;
    
    const dx = targetX - minX;
    const dy = targetY - minY;
    
    group.forEach(p => {
        p.x += dx;
        p.y += dy;
    });
}

// ========== SNAP LOGIC (исправленное) ==========

// Проверка притягивания к границе зоны сборки
function checkBorderSnap(piece) {
    if (piece.fixed) return false;
    
    const threshold = 50;
    let snapped = false;
    let newX = piece.x;
    let newY = piece.y;
    
    // Притягивание к границам зоны сборки
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
        piece.x = newX;
        piece.y = newY;
        return true;
    }
    return false;
}

// Проверка притягивания к правильному месту
function checkCorrectPositionSnap(piece) {
    const distToCorrect = Math.hypot(piece.x - piece.correctX, piece.y - piece.correctY);
    
    if (distToCorrect < 50) {
        const group = getGroup(piece);
        const dx = piece.correctX - piece.x;
        const dy = piece.correctY - piece.y;
        
        group.forEach(p => {
            p.x += dx;
            p.y += dy;
            p.fixed = true;
        });
        return true;
    }
    return false;
}

// Проверка притягивания к соседним кусочкам
function checkNeighborSnap(piece) {
    for (const other of pieces) {
        if (piece === other) continue;
        
        // Вычисляем, где должен быть этот кусочек относительно соседа
        const dx = piece.correctX - other.correctX;
        const dy = piece.correctY - other.correctY;
        const targetX = other.x + dx;
        const targetY = other.y + dy;
        
        const distToOther = Math.hypot(piece.x - targetX, piece.y - targetY);
        
        if (distToOther < 50) {
            // Объединяем группы
            const mergedGroup = mergeGroups(piece, other);
            
            // Сдвигаем всю объединённую группу
            const moveX = targetX - piece.x;
            const moveY = targetY - piece.y;
            
            mergedGroup.pieces.forEach(p => {
                if (!p.fixed) {
                    p.x += moveX;
                    p.y += moveY;
                }
            });
            
            // Центрируем группу в зоне сборки, если она новая
            if (mergedGroup.pieces.length === 2 && !piece.fixed && !other.fixed) {
                centerGroupInAssemblyZone(mergedGroup);
            }
            
            return true;
        }
    }
    return false;
}

// Главная функция притягивания
function trySnap(piece) {
    if (!piece || piece.fixed) return false;
    
    let snapped = false;
    
    // Сначала проверяем притягивание к границе зоны сборки
    if (checkBorderSnap(piece)) {
        snapped = true;
    }
    
    // Проверяем притягивание к правильному месту
    if (checkCorrectPositionSnap(piece)) {
        snapped = true;
    }
    
    // Проверяем притягивание к соседям
    if (checkNeighborSnap(piece)) {
        snapped = true;
    }
    
    if (snapped) {
        draw();
        updateProgress();
    }
    
    return snapped;
}

// ========== PIECE HIT TEST ==========
function getPieceAt(x, y) {
    for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        if (p.fixed) continue;
        
        if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
            return p;
        }
    }
    return null;
}