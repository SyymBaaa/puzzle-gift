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

// Проверка, находится ли кусочек вне зоны сборки
function isOutsideAssemblyZone(piece) {
    const margin = 20;
    return (piece.x + piece.w + margin < assemblyZone.x ||
            piece.x - margin > assemblyZone.x + assemblyZone.w ||
            piece.y + piece.h + margin < assemblyZone.y ||
            piece.y - margin > assemblyZone.y + assemblyZone.h);
}

// Получить случайную позицию вне зоны сборки
function getRandomPositionOutsideAssembly(pieceW, pieceH) {
    const margin = 30;
    
    for (let attempt = 0; attempt < 60; attempt++) {
        // Зона разброса - вся область canvas, но с отступами
        const randX = margin + Math.random() * (boardW - pieceW - margin * 2);
        const randY = margin + Math.random() * (boardH - pieceH - margin * 2);
        
        // Проверяем, не пересекается ли с зоной сборки
        const overlapsAssembly = !(randX + pieceW + margin < assemblyZone.x ||
                                   randX - margin > assemblyZone.x + assemblyZone.w ||
                                   randY + pieceH + margin < assemblyZone.y ||
                                   randY - margin > assemblyZone.y + assemblyZone.h);
        
        if (!overlapsAssembly) {
            return { x: randX, y: randY };
        }
    }
    
    // Если не нашли - кладём в левый верхний угол
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
        
        boardW = Math.max(900, maxDim * cols * 1.3);
        boardH = Math.max(700, maxDim * rows * 1.3);
        
        canvas.width = boardW;
        canvas.height = boardH;
        
        // Вычисляем зону сборки после установки размеров
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
                correctX: info.correct_x + 100,
                correctY: info.correct_y + 100,
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
    return piece.group ? piece.group.pieces : [piece];
}

function mergeGroups(a, b) {
    const groupA = getGroup(a);
    const groupB = getGroup(b);
    
    const merged = [...new Set([...groupA, ...groupB])];
    const group = { pieces: merged };
    
    merged.forEach(p => p.group = group);
}

// Центрирование группы в зоне сборки
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
    
    // Центрируем в зоне сборки
    const targetX = assemblyZone.x + (assemblyZone.w - groupWidth) / 2;
    const targetY = assemblyZone.y + (assemblyZone.h - groupHeight) / 2;
    
    const dx = targetX - minX;
    const dy = targetY - minY;
    
    group.forEach(p => {
        p.x += dx;
        p.y += dy;
    });
}

// ========== SMART SNAP ==========
function trySnapToAssemblyBorder(piece) {
    if (piece.fixed) return false;
    if (getGroup(piece).length > 1) return false;
    
    const threshold = 45;
    let snapX = piece.x;
    let snapY = piece.y;
    let snapped = false;
    
    // Притягивание к левой границе
    if (Math.abs(piece.x - assemblyZone.x) < threshold) {
        snapX = assemblyZone.x;
        snapped = true;
    }
    // Притягивание к правой границе
    else if (Math.abs(piece.x + piece.w - (assemblyZone.x + assemblyZone.w)) < threshold) {
        snapX = assemblyZone.x + assemblyZone.w - piece.w;
        snapped = true;
    }
    
    // Притягивание к верхней границе
    if (Math.abs(piece.y - assemblyZone.y) < threshold) {
        snapY = assemblyZone.y;
        snapped = true;
    }
    // Притягивание к нижней границе
    else if (Math.abs(piece.y + piece.h - (assemblyZone.y + assemblyZone.h)) < threshold) {
        snapY = assemblyZone.y + assemblyZone.h - piece.h;
        snapped = true;
    }
    
    if (snapped) {
        piece.x = snapX;
        piece.y = snapY;
        draw();
        return true;
    }
    return false;
}

function trySnap(piece) {
    // Сначала проверяем притягивание к границе зоны сборки
    if (trySnapToAssemblyBorder(piece)) {
        return true;
    }
    
    // 1. Проверяем притягивание к правильному месту
    const dxToCorrect = piece.x - piece.correctX;
    const dyToCorrect = piece.y - piece.correctY;
    const distToCorrect = Math.hypot(dxToCorrect, dyToCorrect);
    
    if (distToCorrect < 45) {
        const group = getGroup(piece);
        const dx = piece.correctX - piece.x;
        const dy = piece.correctY - piece.y;
        
        group.forEach(p => {
            p.x += dx;
            p.y += dy;
            p.fixed = true;
        });
        
        draw();
        updateProgress();
        return true;
    }
    
    // 2. Проверяем притягивание к другим кусочкам
    for (const other of pieces) {
        if (piece === other) continue;
        
        const dx = piece.correctX - other.correctX;
        const dy = piece.correctY - other.correctY;
        const targetX = other.x + dx;
        const targetY = other.y + dy;
        
        const distToOther = Math.hypot(piece.x - targetX, piece.y - targetY);
        
        if (distToOther < 45) {
            mergeGroups(piece, other);
            
            const group = getGroup(piece);
            const moveX = targetX - piece.x;
            const moveY = targetY - piece.y;
            
            group.forEach(p => {
                if (!p.fixed) {
                    p.x += moveX;
                    p.y += moveY;
                }
            });
            
            // Центрируем группу в зоне сборки, если это первое объединение
            if (group.length === 2 && !piece.fixed && !other.fixed) {
                centerGroupInAssemblyZone(group);
            }
            
            draw();
            updateProgress();
            return true;
        }
    }
    
    return false;
}

// ========== PIECE HIT TEST ==========
function getPieceAt(x, y) {
    for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        if (p.fixed) continue;
        
        const group = getGroup(p);
        for (const piece of group) {
            if (x >= piece.x && x <= piece.x + piece.w && 
                y >= piece.y && y <= piece.y + piece.h) {
                return piece;
            }
        }
    }
    return null;
}