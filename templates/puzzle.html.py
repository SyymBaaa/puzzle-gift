import os
from pathlib import Path

# Директории
BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
UPLOADS_DIR = BASE_DIR / "uploads"
GENERATED_DIR = BASE_DIR / "generated"

# Параметры обработки
MAX_FILE_SIZE_MB = 20
ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg'}
PDF_DPI = 150
FILE_LIFETIME_HOURS = 72  # 3 дня

# Параметры рендеринга
USER_IMAGE_OPACITY = 0.9
BLUR_MASK = True
FRAME_CORNERS = [
    [100, 150],   # top-left
    [700, 150],   # top-right
    [700, 850],   # bottom-right
    [100, 850]    # bottom-left
]

# Порядок наложения слоёв
def get_render_order():
    """
    Порядок: сначала база, потом пользователь, потом оверлеи
    """
    return [
        'frame',      # Рамка
        'user',       # Фото пользователя
        'overlay',    # Декоративные элементы
    ]

# Создаём директории при импорте
for dir_path in [STATIC_DIR, UPLOADS_DIR, GENERATED_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)