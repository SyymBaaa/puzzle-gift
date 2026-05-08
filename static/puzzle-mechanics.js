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
        
        boardW = Math.max(800, maxDim * cols * 1.2);
        boardH = Math.max(600, maxDim * rows * 1.2);
        
        canvas.width = boardW;
        canvas.height = boardH;
        
        pieces = [];
        for (let i = 0; i < piecesInfo.length; i++) {
            const info = piecesInfo[i];
            const img = await loadPieceImage(info.id);
            
            const maxX = Math.max(50, boardW - info.width - 50);
            const maxY = Math.max(50, boardH - info.height - 50);
            const randomX = 50 + Math.random() * maxX;
            const randomY = 50 + Math.random() * maxY;
            
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

// ========== SNAP ==========
function trySnapToCorrect(piece) {
    const snapDistance = 40;
    const dx = piece.x - piece.correctX;
    const dy = piece.y - piece.correctY;
    const dist = Math.hypot(dx, dy);
    
    if (dist < snapDistance) {
        piece.x = piece.correctX;
        piece.y = piece.correctY;
        piece.fixed = true;
        draw();
        updateProgress();
        return true;
    }
    return false;
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