import cv2
import numpy as np
import os
import uuid
import shutil
from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Form
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import RedirectResponse
import config

try:
    import pypdfium2 as pdfium
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False
    print("⚠️ pypdfium2 не установлен, PDF не поддерживается")

app = FastAPI(title="Puzzle Gift Service")

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

# Хранилище метаданных (в реальном проекте используйте БД)
puzzles_db = {}  # {uuid: {"original_path": str, "image_path": str, "created_at": datetime}}


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


def generate_puzzle_image(user_file_bytes, filename):
    """Генерирует итоговое изображение для пазла"""
    ext = os.path.splitext(filename)[1].lower()

    if ext == '.pdf':
        if not PDF_SUPPORT:
            raise ValueError("PDF не поддерживается")
        user_img = pdf_to_image(user_file_bytes)
    else:
        user_img = image_from_bytes(user_file_bytes)

    result = process_layers(user_img)

    if result is None:
        raise ValueError("Не удалось обработать изображения")

    return result


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
            if os.path.exists(data["original_path"]):
                os.remove(data["original_path"])
            if os.path.exists(data["image_path"]):
                os.remove(data["image_path"])
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
        # Генерируем изображение для пазла
        result_img = generate_puzzle_image(contents, filename)
        image_path = os.path.join(config.GENERATED_DIR, f"{puzzle_id}.jpg")
        cv2.imwrite(image_path, result_img)

        # Сохраняем в БД
        puzzles_db[puzzle_id] = {
            "original_path": original_path,
            "original_ext": ext,
            "image_path": image_path,
            "created_at": datetime.now()
        }

        # Возвращаем ссылку на пазл
        puzzle_url = f"/puzzle/{puzzle_id}"
        return JSONResponse({
            "success": True,
            "puzzle_id": puzzle_id,
            "puzzle_url": puzzle_url,
            "full_url": f"https://your-site.com{puzzle_url}"  # замените на реальный домен
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
    """Отдаёт сгенерированное изображение для пазла"""
    if puzzle_id not in puzzles_db:
        raise HTTPException(404, "Изображение не найдено")

    image_path = puzzles_db[puzzle_id]["image_path"]
    if not os.path.exists(image_path):
        raise HTTPException(404, "Файл изображения удалён")

    return FileResponse(image_path, media_type="image/jpeg", filename=f"puzzle_{puzzle_id}.jpg")


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
    uvicorn.run(app, host="0.0.0.0", port=8000)