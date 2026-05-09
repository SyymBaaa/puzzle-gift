import cv2
import numpy as np
import os
import uuid
import json
import re
from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import config

try:
    import pypdfium2 as pdfium
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    print("⚠️ pypdfium2 не установлен, PDF не поддерживается")

# Импорты для работы с SVG
try:
    from svgpath2mpl import parse_path
    SVG_SUPPORT = True
except ImportError:
    SVG_SUPPORT = False
    print("⚠️ svgpath2mpl не установлен, пазлы не будут работать")
    print("   Установите: pip install svgpath2mpl matplotlib")

app = FastAPI(title="Puzzle Gift Service - Фигурные пазлы")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Создаём директории
os.makedirs(config.STATIC_DIR, exist_ok=True)
os.makedirs(config.UPLOADS_DIR, exist_ok=True)
os.makedirs(config.GENERATED_DIR, exist_ok=True)
os.makedirs("templates", exist_ok=True)

# Монтируем статику
app.mount("/static", StaticFiles(directory=config.STATIC_DIR), name="static")
app.mount("/puzzle/static", StaticFiles(directory=config.STATIC_DIR), name="puzzle_static")

templates = Jinja2Templates(directory="templates")

# Хранилище метаданных
puzzles_db = {}


# ========== ФУНКЦИИ ОБРАБОТКИ ИЗОБРАЖЕНИЙ ==========

def pdf_to_image(pdf_bytes, dpi=None):
    if not PDF_SUPPORT:
        raise ValueError("PDF не поддерживается")
    dpi = dpi or config.PDF_DPI
    pdf = pdfium.PdfDocument(pdf_bytes)
    page = pdf[0]
    scale = dpi / 72
    bitmap = page.render(scale=scale, rotation=0)
    pil_image = bitmap.to_pil()
    pdf.close()
    img = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    return img


def image_from_bytes(file_bytes):
    nparr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Не удалось прочитать изображение")
    return img


def insert_user_into_layer(base_img, user_img, frame_corners, opacity=0.6, blur_mask=True):
    h, w = user_img.shape[:2]
    base_h, base_w = base_img.shape[:2]

    src_corners = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst_corners = np.float32(frame_corners)

    matrix = cv2.getPerspectiveTransform(src_corners, dst_corners)
    warped = cv2.warpPerspective(user_img, matrix, (base_w, base_h))

    mask = np.zeros((base_h, base_w), dtype=np.uint8)
    cv2.fillPoly(mask, [np.int32(dst_corners)], 255)

    if blur_mask:
        mask = cv2.GaussianBlur(mask, (5, 5), 0)

    mask_norm = (mask.astype(np.float32) / 255.0) * opacity

    result = base_img.copy().astype(np.float32)
    warped_float = warped.astype(np.float32)

    for c in range(3):
        result[:, :, c] = result[:, :, c] * (1 - mask_norm) + warped_float[:, :, c] * mask_norm

    result = np.clip(result, 0, 255).astype(np.uint8)

    if base_img.shape[2] == 4:
        result = cv2.cvtColor(result, cv2.COLOR_BGR2BGRA)
        result[:, :, 3] = base_img[:, :, 3]

    return result


def overlay_layer(base_img, top_img):
    if top_img is None:
        return base_img

    if len(base_img.shape) == 2 or base_img.shape[2] == 1:
        base_img = cv2.cvtColor(base_img, cv2.COLOR_GRAY2BGRA)
    elif base_img.shape[2] == 3:
        base_img = cv2.cvtColor(base_img, cv2.COLOR_BGR2BGRA)

    if len(top_img.shape) == 2 or top_img.shape[2] == 1:
        top_img = cv2.cvtColor(top_img, cv2.COLOR_GRAY2BGRA)
    elif top_img.shape[2] == 3:
        top_img = cv2.cvtColor(top_img, cv2.COLOR_BGR2BGRA)

    result = base_img.copy().astype(np.float32)
    top_float = top_img.astype(np.float32)

    top_alpha = top_float[:, :, 3] / 255.0

    for c in range(3):
        result[:, :, c] = result[:, :, c] * (1 - top_alpha) + top_float[:, :, c] * top_alpha

    result[:, :, 3] = np.maximum(result[:, :, 3], top_float[:, :, 3])
    result = np.clip(result, 0, 255).astype(np.uint8)
    return result


def process_layers(user_img):
    """Собирает цельное изображение из слоёв и билета пользователя"""
    render_order = config.get_render_order()
    current_image = None

    for item in render_order:
        if item == 'user':
            if user_img is None:
                continue

            if current_image is None:
                h, w = user_img.shape[:2]
                current_image = np.zeros((h, w, 4), dtype=np.uint8)
                current_image[:, :, 3] = 0

            current_image = insert_user_into_layer(
                current_image,
                user_img,
                config.FRAME_CORNERS,
                config.USER_IMAGE_OPACITY,
                config.BLUR_MASK
            )
        else:
            layer_path = os.path.join(config.STATIC_DIR, f"{item}.png")
            if not os.path.exists(layer_path):
                continue

            layer_img = cv2.imread(layer_path, cv2.IMREAD_UNCHANGED)
            if layer_img is None:
                continue

            if current_image is None:
                current_image = layer_img
            else:
                current_image = overlay_layer(current_image, layer_img)

    return current_image


# ========== ФУНКЦИИ ДЛЯ РАБОТЫ С ФИГУРНЫМИ ПАЗЛАМИ ==========

def parse_svg_paths_from_file(file_path):
    """Извлекает все path из текстового файла с SVG путями"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern = r'<path\s+d="([^"]+)"'
    paths = re.findall(pattern, content, re.DOTALL)
    print(f"📦 Найдено {len(paths)} кусочков в {file_path}")
    return paths


def svg_to_polygons(path_str):
    """Конвертирует SVG path в полигоны"""
    path = parse_path(path_str)
    polygons = path.to_polygons()
    
    if not polygons:
        raise Exception("❌ SVG не дал полигонов")
    
    return polygons


def get_svg_bounds(paths_list):
    """Вычисляет bounding box всех путей SVG"""
    all_points = []
    
    for path_str in paths_list:
        try:
            path = parse_path(path_str)
            polys = path.to_polygons()
            for p in polys:
                all_points.extend(p)
        except:
            continue
    
    if not all_points:
        return (0, 0, 1000, 1000)
    
    all_points = np.array(all_points)
    min_x, min_y = all_points.min(axis=0)
    max_x, max_y = all_points.max(axis=0)
    
    return min_x, min_y, max_x, max_y


def transform_polygon(polygon, img_w, img_h, bounds):
    """
    Трансформирует полигон в координаты изображения.
    Возвращает (transformed_poly, bbox_x, bbox_y, bbox_w, bbox_h)
    """
    min_x, min_y, max_x, max_y = bounds
    
    poly = np.array(polygon, dtype=np.float32)
    
    # Нормализация в 0..size
    poly[:, 0] -= min_x
    poly[:, 1] -= min_y
    
    svg_w = max_x - min_x
    svg_h = max_y - min_y
    
    scale = min(img_w / svg_w, img_h / svg_h) * 0.95
    poly *= scale
    
    offset_x = (img_w - svg_w * scale) / 2
    offset_y = (img_h - svg_h * scale) / 2
    
    poly[:, 0] += offset_x
    poly[:, 1] += offset_y
    
    # Вычисляем bounding box трансформированного полигона
    px_min = float(np.min(poly[:, 0]))  # конвертируем в float
    px_max = float(np.max(poly[:, 0]))
    py_min = float(np.min(poly[:, 1]))
    py_max = float(np.max(poly[:, 1]))
    
    return poly, px_min, py_min, (px_max - px_min), (py_max - py_min)


def create_mask_supersample(polygon, w, h, scale=4):
    """
    Настоящий антиалиасинг через supersampling
    Даёт гладкие края без blur артефактов
    """
    hi_w, hi_h = w * scale, h * scale
    
    mask_hi = np.zeros((hi_h, hi_w), dtype=np.uint8)
    
    poly = np.array(polygon, dtype=np.float32) * scale
    poly = poly.astype(np.int32).reshape((-1, 1, 2))
    
    cv2.fillPoly(mask_hi, [poly], 255)
    
    # downscale → даёт мягкий AA без blur артефактов
    mask = cv2.resize(mask_hi, (w, h), interpolation=cv2.INTER_AREA)
    
    return mask


def cut_piece_from_image(img, polygon, output_path, expand_pixels=2):
    """
    Вырезает кусок из изображения по полигону с расширением маски
    expand_pixels - сколько пикселей добавить к маске (для перекрытия стыков)
    """
    h, w = img.shape[:2]
    
    # Создаем маску с антиалиасингом через supersampling
    mask = create_mask_supersample(polygon, w, h, scale=4)
    
    # РАСШИРЯЕМ МАСКУ - чтобы не было зазоров между кусочками
    if expand_pixels > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (expand_pixels * 2 + 1, expand_pixels * 2 + 1))
        mask = cv2.dilate(mask, kernel, iterations=1)
    
    # Конвертируем в RGBA если нужно
    if img.shape[2] == 3:
        result = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    else:
        result = img.copy()
    
    # Применяем маску как альфа-канал
    result[:, :, 3] = mask
    
    # Обрезаем пустое пространство
    coords = cv2.findNonZero(mask)
    if coords is not None:
        x, y, pw, ph = cv2.boundingRect(coords)
        result = result[y:y+ph, x:x+pw]
    
    # Сохраняем с высоким качеством
    cv2.imwrite(output_path, result, [cv2.IMWRITE_PNG_COMPRESSION, 0])


def slice_image_by_svg_paths(image_path, txt_path, output_dir, expand_pixels=2):
    """
    Разрезает изображение по всем path из текстового файла на фигурные кусочки
    expand_pixels - расширение маски для перекрытия стыков (по умолчанию 2px)
    Возвращает (pieces_data, global_bounds)
    где global_bounds = {'min_x': ..., 'min_y': ..., 'max_x': ..., 'max_y': ..., 'width': ..., 'height': ...}
    """
    if not SVG_SUPPORT:
        raise Exception("❌ SVG поддержка не установлена. Установите: pip install svgpath2mpl matplotlib")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Загружаем изображение
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"❌ Не удалось загрузить изображение: {image_path}")
    
    # Добавляем альфа-канал если нужно
    if img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    
    h, w = img.shape[:2]
    print(f"🖼️ Размер изображения для нарезки: {w}x{h}")
    print(f"🔧 Расширение маски: +{expand_pixels}px с каждой стороны")
    
    # Парсим пути
    paths = parse_svg_paths_from_file(txt_path)
    
    # Вычисляем bounding box SVG
    bounds = get_svg_bounds(paths)
    print(f"📐 SVG bounds: ({bounds[0]:.1f}, {bounds[1]:.1f}) -> ({bounds[2]:.1f}, {bounds[3]:.1f})")
    
    pieces_data = []
    global_min_x = float('inf')
    global_min_y = float('inf')
    global_max_x = float('-inf')
    global_max_y = float('-inf')
    
    for i, path_str in enumerate(paths):
        try:
            # Получаем полигоны из SVG
            polygons = svg_to_polygons(path_str)
            
            if not polygons:
                print(f"⚠️ Кусочек {i} не содержит полигонов, пропускаем")
                continue
            
            # Берем самый большой полигон (основной контур)
            main_polygon = max(polygons, key=lambda p: len(p))
            
            # Трансформируем в координаты изображения и получаем bounding box
            transformed_poly, bbox_x, bbox_y, bbox_w, bbox_h = transform_polygon(main_polygon, w, h, bounds)
            
            # Обновляем глобальный bounding box
            global_min_x = min(global_min_x, bbox_x)
            global_min_y = min(global_min_y, bbox_y)
            global_max_x = max(global_max_x, bbox_x + bbox_w)
            global_max_y = max(global_max_y, bbox_y + bbox_h)
            
            # Вырезаем кусочек с расширением маски
            piece_path = os.path.join(output_dir, f'piece_{i:03d}.png')
            cut_piece_from_image(img, transformed_poly, piece_path, expand_pixels)
            
            # Получаем размеры обрезанного кусочка
            piece_img = cv2.imread(piece_path, cv2.IMREAD_UNCHANGED)
            if piece_img is None:
                print(f"⚠️ Не удалось прочитать кусочек {i}")
                continue
                
            ph, pw = piece_img.shape[:2]
            
            # КОНВЕРТИРУЕМ numpy типы в стандартные Python типы для JSON сериализации
            pieces_data.append({
                'id': int(i),  # гарантируем int
                'path': piece_path,
                'correct_x': float(bbox_x),  # конвертируем в float
                'correct_y': float(bbox_y),
                'width': int(pw),  # конвертируем в int
                'height': int(ph),
                'bbox_x': float(bbox_x),
                'bbox_y': float(bbox_y),
                'bbox_w': float(bbox_w),
                'bbox_h': float(bbox_h)
            })
            
            if (i + 1) % 10 == 0:
                print(f"   Обработано {i+1}/{len(paths)}")
                
        except Exception as e:
            print(f"⚠️ Ошибка в кусочке {i}: {e}")
            continue
    
    global_bounds = {
        'min_x': float(global_min_x),  # конвертируем в float
        'min_y': float(global_min_y),
        'max_x': float(global_max_x),
        'max_y': float(global_max_y),
        'width': float(global_max_x - global_min_x),  # конвертируем в float
        'height': float(global_max_y - global_min_y)
    }
    
    print(f"🎉 Создано {len(pieces_data)} фигурных кусочков")
    print(f"📦 Глобальный bounds пазла: {global_bounds}")
    return pieces_data, global_bounds


def generate_puzzle_image(user_file_bytes, filename, puzzle_id):
    """Генерирует цельное изображение + нарезает фигурные пазлы.
    Возвращает (full_image_path, pieces_data, global_bounds)
    """
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == '.pdf':
        if not PDF_SUPPORT:
            raise ValueError("PDF не поддерживается")
        user_img = pdf_to_image(user_file_bytes)
    else:
        user_img = image_from_bytes(user_file_bytes)
    
    # 1. Собираем цельное изображение из слоёв
    result = process_layers(user_img)
    if result is None:
        raise ValueError("Не удалось обработать изображения")
    
    # Сохраняем цельное изображение
    full_image_path = os.path.join(config.GENERATED_DIR, f"{puzzle_id}_full.png")
    cv2.imwrite(full_image_path, result)
    print(f"✅ Цельное изображение сохранено: {full_image_path}")
    
    # 2. Нарезаем на фигурные пазлы по SVG путям
    txt_path = os.path.join(config.STATIC_DIR, "puzzle_shapes.txt")
    pieces_dir = os.path.join(config.GENERATED_DIR, f"pieces_{puzzle_id}")
    
    if not os.path.exists(txt_path):
        raise Exception(f"❌ Файл с путями не найден: {txt_path}")
    
    if not SVG_SUPPORT:
        raise Exception("❌ SVG поддержка не установлена. Установите: pip install svgpath2mpl matplotlib")
    
    # Расширение маски = 2 пикселя (половина толщины линии 4px)
    expand_pixels = getattr(config, 'PUZZLE_EXPAND_PIXELS', 3)
    pieces_data, global_bounds = slice_image_by_svg_paths(full_image_path, txt_path, pieces_dir, expand_pixels=expand_pixels)
    
    if not pieces_data:
        raise Exception("❌ Не удалось нарезать фигурные пазлы. Проверьте файл puzzle_shapes.txt")
    
    return full_image_path, pieces_data, global_bounds


# ========== ОЧИСТКА СТАРЫХ ФАЙЛОВ ==========

def cleanup_old_files():
    """Удаляет файлы старше FILE_LIFETIME_HOURS"""
    now = datetime.now()
    to_delete = []
    for pid, data in puzzles_db.items():
        if now - data["created_at"] > timedelta(hours=config.FILE_LIFETIME_HOURS):
            to_delete.append(pid)

    for pid in to_delete:
        data = puzzles_db.pop(pid)
        try:
            if os.path.exists(data.get("original_path", "")):
                os.remove(data["original_path"])
            if os.path.exists(data.get("image_path", "")):
                os.remove(data["image_path"])
            if os.path.exists(data.get("pieces_dir", "")):
                import shutil
                shutil.rmtree(data["pieces_dir"])
            pieces_json = os.path.join(config.GENERATED_DIR, f"{pid}_pieces.json")
            if os.path.exists(pieces_json):
                os.remove(pieces_json)
        except Exception as e:
            print(f"Ошибка удаления {pid}: {e}")


# ========== API ЭНДПОИНТЫ ==========

@app.on_event("startup")
async def startup_event():
    cleanup_old_files()


@app.get("/", response_class=HTMLResponse)
async def upload_page(request: Request):
    """Страница загрузки билета (даритель)"""
    return templates.TemplateResponse("upload.html", {"request": request})


@app.post("/upload")
async def upload_ticket(user_image: UploadFile = File(...)):
    """Загрузка билета, генерация пазла, возврат puzzle_id"""
    contents = await user_image.read()
    filename = user_image.filename.lower()

    if len(contents) > config.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"Файл слишком большой (макс. {config.MAX_FILE_SIZE_MB} МБ)")

    ext = os.path.splitext(filename)[1]
    if ext not in config.ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Неподдерживаемый формат. Разрешены: {', '.join(config.ALLOWED_EXTENSIONS)}")

    # Генерируем уникальный ID
    puzzle_id = str(uuid.uuid4())[:8]

    # Сохраняем оригинальный файл
    original_path = os.path.join(config.UPLOADS_DIR, f"{puzzle_id}{ext}")
    with open(original_path, "wb") as f:
        f.write(contents)

    try:
        # Генерируем цельное изображение и нарезаем пазлы
        full_image_path, pieces_data, global_bounds = generate_puzzle_image(contents, filename, puzzle_id)

        # Сохраняем информацию о кусочках вместе с габаритами пазла
        pieces_info_path = os.path.join(config.GENERATED_DIR, f"{puzzle_id}_pieces.json")
        with open(pieces_info_path, 'w') as f:
            json.dump({
                'pieces': pieces_data,
                'puzzle_width': global_bounds['width'],
                'puzzle_height': global_bounds['height'],
                'puzzle_min_x': global_bounds['min_x'],
                'puzzle_min_y': global_bounds['min_y']
            }, f, indent=2)

        # Сохраняем в БД
        puzzles_db[puzzle_id] = {
            "original_path": original_path,
            "original_ext": ext,
            "image_path": full_image_path,
            "pieces_dir": os.path.join(config.GENERATED_DIR, f"pieces_{puzzle_id}"),
            "pieces_count": len(pieces_data),
            "created_at": datetime.now()
        }

        # Возвращаем ссылку на пазл
        puzzle_url = f"/puzzle/{puzzle_id}"
        return JSONResponse({
            "success": True,
            "puzzle_id": puzzle_id,
            "puzzle_url": puzzle_url,
            "full_url": f"https://your-site.com{puzzle_url}"
        })

    except Exception as e:
        # При ошибке удаляем сохранённый оригинал
        if os.path.exists(original_path):
            os.remove(original_path)
        raise HTTPException(500, str(e))


@app.get("/puzzle/{puzzle_id}", response_class=HTMLResponse)
async def puzzle_page(request: Request, puzzle_id: str):
    """Страница с пазлом (для одаряемого)"""
    if puzzle_id not in puzzles_db:
        raise HTTPException(404, "Пазл не найден или истёк срок действия")

    return templates.TemplateResponse("puzzle.html", {
        "request": request,
        "puzzle_id": puzzle_id
    })


@app.get("/image/{puzzle_id}")
async def get_puzzle_image(puzzle_id: str):
    """Отдаёт сгенерированное цельное изображение для превью"""
    if puzzle_id not in puzzles_db:
        raise HTTPException(404, "Изображение не найдено")

    image_path = puzzles_db[puzzle_id]["image_path"]
    if not os.path.exists(image_path):
        raise HTTPException(404, "Файл изображения удалён")

    return FileResponse(image_path, media_type="image/png", filename=f"puzzle_{puzzle_id}.png")


@app.get("/piece/{puzzle_id}/{piece_id}")
async def get_piece(puzzle_id: str, piece_id: int):
    """Отдаёт отдельный фигурный кусочек пазла"""
    if puzzle_id not in puzzles_db:
        raise HTTPException(404, "Пазл не найден")
    
    pieces_dir = puzzles_db[puzzle_id].get("pieces_dir")
    if not pieces_dir or not os.path.exists(pieces_dir):
        raise HTTPException(404, "Фигурные кусочки не найдены")
    
    piece_path = os.path.join(pieces_dir, f"piece_{piece_id:03d}.png")
    if not os.path.exists(piece_path):
        raise HTTPException(404, "Кусочек не найден")
    
    return FileResponse(piece_path, media_type="image/png")


@app.get("/pieces-info/{puzzle_id}")
async def get_pieces_info(puzzle_id: str):
    """Возвращает информацию о кусочках (позиции, размеры, а также габариты пазла, если есть)"""
    if puzzle_id not in puzzles_db:
        raise HTTPException(404, "Пазл не найден")
    
    pieces_info_path = os.path.join(config.GENERATED_DIR, f"{puzzle_id}_pieces.json")
    if os.path.exists(pieces_info_path):
        with open(pieces_info_path, 'r') as f:
            data = json.load(f)
            # Для обратной совместимости: если в старом файле нет поля 'pieces', значит он был массивом
            if isinstance(data, list):
                return JSONResponse({
                    'pieces': data,
                    'legacy': True
                })
            return JSONResponse(data)
    
    return JSONResponse({'pieces': [], 'legacy': True})


@app.get("/download/{puzzle_id}")
async def download_original_ticket(puzzle_id: str):
    """Скачивание оригинального билета (после победы)"""
    if puzzle_id not in puzzles_db:
        raise HTTPException(404, "Билет не найден")

    data = puzzles_db[puzzle_id]
    original_path = data["original_path"]

    if not os.path.exists(original_path):
        raise HTTPException(404, "Файл билета удалён")

    ext = data["original_ext"]
    media_type = "application/pdf" if ext == ".pdf" else "image/jpeg"
    return FileResponse(original_path, media_type=media_type, filename=f"ticket{ext}")


@app.get("/health")
async def health_check():
    return {"status": "ok", "puzzles_count": len(puzzles_db)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)