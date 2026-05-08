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

// ========== GROUP MANAGEMENT (ИСПРАВЛЕНО) ==========
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
    
    const targetX = assemblyZone.x + (assemblyZone.w - groupWidth) / 2;
    const targetY = assemblyZone.y + (assemblyZone.h - groupHeight) / 2;
    
    const dx = targetX - minX;
    const dy = targetY - minY;
    
    group.pieces.forEach(p => {
        p.x += dx;
        p.y += dy;
    });
}

// ========== NEIGHBOR CHECK (ИСПРАВЛЕНО) ==========
function areNeighbors(a, b) {
    const dx = Math.abs(a.correctX - b.correctX);
    const dy = Math.abs(a.correctY - b.correctY);
    const tolerance = 20;
    
    const horizontal = Math.abs(dx - a.w) < tolerance && dy < tolerance;
    const vertical = Math.abs(dy - a.h) < tolerance && dx < tolerance;
    
    return horizontal || vertical;
}

// ========== SNAP LOGIC (ИСПРАВЛЕНО) ==========

function checkBorderSnap(piece) {
    if (piece.fixed) return false;
    
    const threshold = 50;
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
    const dx = piece.correctX - piece.x;
    const dy = piece.correctY - piece.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist < 35) {
        const group = getGroup(piece);
        
        // Сдвигаем всю группу
        group.pieces.forEach(p => {
            p.x += dx;
            p.y += dy;
        });
        
        // Проверяем каждый пазл отдельно (только если он точно на месте)
        group.pieces.forEach(p => {
            const d = Math.hypot(p.x - p.correctX, p.y - p.correctY);
            if (d < 2) {
                p.x = p.correctX;
                p.y = p.correctY;
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
        
        // Проверяем, являются ли они соседями по правильным координатам
        if (!areNeighbors(piece, other)) continue;
        
        const dx = piece.correctX - other.correctX;
        const dy = piece.correctY - other.correctY;
        const targetX = other.x + dx;
        const targetY = other.y + dy;
        
        const distToOther = Math.hypot(piece.x - targetX, piece.y - targetY);
        
        if (distToOther < 50) {
            const mergedGroup = mergeGroups(piece, other);
            
            const moveX = targetX - piece.x;
            const moveY = targetY - piece.y;
            
            // Проверяем, есть ли в группе fixed кусочки
            const hasFixed = mergedGroup.pieces.some(p => p.fixed);
            
            if (!hasFixed) {
                mergedGroup.pieces.forEach(p => {
                    p.x += moveX;
                    p.y += moveY;
                });
            }
            
            // Центрируем группу в зоне сборки, если она новая
            if (mergedGroup.pieces.length === 2 && !piece.fixed && !other.fixed) {
                centerGroupInAssemblyZone(mergedGroup);
            }
            
            return true;
        }
    }
    return false;
}

function trySnap(piece) {
    if (!piece || piece.fixed) return false;
    
    let snapped = false;
    
    if (checkBorderSnap(piece)) snapped = true;
    if (checkCorrectPositionSnap(piece)) snapped = true;
    if (checkNeighborSnap(piece)) snapped = true;
    
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

// ========== UPDATE PROGRESS ==========
function updateProgress() {
    let fixedCount = 0;
    
    for (const piece of pieces) {
        if (piece.fixed) {
            fixedCount++;
        } else {
            const distToCorrect = Math.hypot(piece.x - piece.correctX, piece.y - piece.correctY);
            if (distToCorrect < 2) {
                piece.fixed = true;
                fixedCount++;
            }
        }
    }
    
    const total = pieces.length;
    const percent = (fixedCount / total) * 100;
    progressBar.style.width = `${percent}%`;
    progressText.innerHTML = `🧩 Собрано ${fixedCount} / ${total}`;
    checkWin();
}

function checkWin() {
    const allPlaced = pieces.length > 0 && pieces.every(p => p.fixed === true);
    if (allPlaced && gameStarted && !winShown) {
        winShown = true;
        setTimeout(() => {
            winOverlay.classList.remove("hidden");
            winOverlay.classList.add("active");
            if (audio && audioEnabled) audio.pause();
        }, 500);
    }
}