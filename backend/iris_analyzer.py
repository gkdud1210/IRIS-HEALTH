"""
홍채 분석 파이프라인

Step 1: Pre-processing
  - 가우시안 블러 (노이즈 제거)
  - 반사광(Glint) 감지 + cv2.inpaint 보간
  - CLAHE 대비 극대화

Step 2: Segmentation — Daugman's Integro-differential Operator
  max_{r,x0,y0} |∂/∂r [G_σ(r) * ∮ I(x,y)/(2πr) ds]|
  동공 (xp, yp, rp) + 홍채 외곽 (xi, yi, ri), 비동심원 모델 적용

Step 3: Normalization — Rubber Sheet Model (bicentric)
  I(x(r,θ), y(r,θ)) → E(r,θ), r∈[0,1], θ∈[0,2π]
  x(r,θ) = (1-r)·xp(θ) + r·xi(θ)

Step 4: Visualization
  - 원본 이미지 위에 동공/홍채 경계 표시
  - 정규화된 Iris Strip 출력

Fallback: MediaPipe FaceLandmarker → 동공 기반 → HoughCircles
"""
import cv2
import numpy as np
import base64
import os
import mediapipe as mp

# ── MediaPipe FaceLandmarker (Tasks API, 싱글톤) ──────────────────────────
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")

BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
RunningMode = mp.tasks.vision.RunningMode

_face_landmarker_options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=_MODEL_PATH),
    running_mode=RunningMode.IMAGE,
    output_face_blendshapes=False,
    output_facial_transformation_matrixes=False,
    num_faces=1,
)
_face_landmarker = FaceLandmarker.create_from_options(_face_landmarker_options)

# Iris landmark indices (face_landmarker 478점 기준)
_IRIS_LANDMARKS = {
    "right": {"center": 468, "boundary": [469, 470, 471, 472]},
    "left":  {"center": 473, "boundary": [474, 475, 476, 477]},
}


# ── 이미지 유틸 ────────────────────────────────────────────────────────────

def decode_image(image_data: str) -> np.ndarray:
    if "," in image_data:
        image_data = image_data.split(",")[1]
    img_bytes = base64.b64decode(image_data)
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    return img


# ── Step 1: Pre-processing ────────────────────────────────────────────────

def remove_glints(img: np.ndarray, bright_percentile: float = 98.5) -> np.ndarray:
    """
    반사광(Glint) 감지 및 cv2.inpaint를 활용한 데이터 보간.
    밝기 상위 percentile 이상이면서 절댓값 200 이상인 영역을 반사광으로 판정.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    thresh = max(200.0, float(np.percentile(gray, bright_percentile)))
    glint_mask = (gray > thresh).astype(np.uint8) * 255
    if glint_mask.sum() == 0:
        return img
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    glint_mask = cv2.dilate(glint_mask, kernel, iterations=2)
    return cv2.inpaint(img, glint_mask, inpaintRadius=4, flags=cv2.INPAINT_TELEA)


def preprocess_iris_image(img: np.ndarray) -> tuple:
    """
    Step 1 전처리 파이프라인.

    1. 가우시안 블러 → 고주파 노이즈 제거
    2. 반사광 제거 → cv2.inpaint 보간
    3. CLAHE → LAB 색공간 L 채널에 적용 (색상 보존)

    Returns: (preprocessed_bgr, enhanced_gray)
    """
    # 1. 가우시안 블러
    blurred = cv2.GaussianBlur(img, (5, 5), 1.2)

    # 2. 반사광 제거
    inpainted = remove_glints(blurred)

    # 3. CLAHE (LAB L 채널)
    lab = cv2.cvtColor(inpainted, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l_ch)
    preprocessed = cv2.cvtColor(cv2.merge([l_enhanced, a_ch, b_ch]), cv2.COLOR_LAB2BGR)
    enhanced_gray = cv2.cvtColor(preprocessed, cv2.COLOR_BGR2GRAY)

    return preprocessed, enhanced_gray


# ── Step 2: Daugman's Integro-differential Operator ──────────────────────

def _gaussian_smooth1d(arr: np.ndarray, sigma: float = 2.5) -> np.ndarray:
    """1D 가우시안 평활화 — scipy gaussian_filter1d 사용 (항상 입력과 같은 크기 반환)."""
    from scipy.ndimage import gaussian_filter1d
    return gaussian_filter1d(arr.astype(np.float64), sigma=sigma)


def daugman_ido(
    gray: np.ndarray,
    cx_range: tuple,
    cy_range: tuple,
    r_range: tuple,
    sigma: float = 2.5,
    center_step: int = 4,
    r_step: int = 2,
    n_angles: int = 180,
) -> tuple:
    """
    Daugman's Integro-differential Operator (벡터화 근사 구현).

    각 후보 중심 (cx, cy)에 대해 모든 반지름의 원형 평균 밝기를 한 번에
    벡터화 계산하고, Gaussian 평활화 후 최대 기울기 위치를 경계로 판정.

      max_{r,x0,y0} |∂/∂r [G_σ(r) * ∮ I(x,y)/(2πr) ds]|

    Returns: (cx, cy, radius)
    """
    h, w = gray.shape
    cx_min = max(0, int(cx_range[0]))
    cx_max = min(w - 1, int(cx_range[1]))
    cy_min = max(0, int(cy_range[0]))
    cy_max = min(h - 1, int(cy_range[1]))
    r_min, r_max = int(r_range[0]), int(r_range[1])

    angles = np.linspace(0, 2 * np.pi, n_angles, endpoint=False)
    cos_a = np.cos(angles)
    sin_a = np.sin(angles)
    radii = np.arange(r_min, r_max, r_step)

    if len(radii) < 2:
        return (cx_min + cx_max) // 2, (cy_min + cy_max) // 2, r_min

    best_score = -1.0
    best_cx = (cx_min + cx_max) // 2
    best_cy = (cy_min + cy_max) // 2
    best_r = int(radii[0])

    for cy0 in range(cy_min, cy_max + 1, center_step):
        for cx0 in range(cx_min, cx_max + 1, center_step):
            # 모든 반지름 × 각도에 대해 픽셀 좌표 한 번에 계산
            # xs, ys: shape (n_r, n_angles)
            xs = np.clip(
                (cx0 + radii[:, None] * cos_a[None, :]).astype(np.int32), 0, w - 1
            )
            ys = np.clip(
                (cy0 + radii[:, None] * sin_a[None, :]).astype(np.int32), 0, h - 1
            )
            # 원형 적분 (평균 밝기)
            means = gray[ys, xs].mean(axis=1).astype(np.float64)  # (n_r,)

            # G_σ 평활화 후 미분 → 경계에서 최대 기울기
            smoothed = _gaussian_smooth1d(means, sigma=sigma)
            grad = np.abs(np.diff(smoothed))

            best_i = int(np.argmax(grad))
            score = float(grad[best_i])

            if score > best_score:
                best_score = score
                best_cx, best_cy, best_r = cx0, cy0, int(radii[best_i])

    return best_cx, best_cy, best_r


def detect_pupil_daugman(gray: np.ndarray) -> tuple:
    """
    Daugman IDO로 동공 검출 (coarse-to-fine).

    탐색 영역: 이미지 중앙 50%, 반지름 3%–25% of min(h, w)

    Returns: ((cx, cy), radius)
    """
    h, w = gray.shape
    side = min(h, w)
    qw, qh = w // 4, h // 4

    r_min = max(5, int(side * 0.03))
    r_max = int(side * 0.25)

    # Coarse 탐색
    cx, cy, r = daugman_ido(
        gray,
        cx_range=(qw, w - qw),
        cy_range=(qh, h - qh),
        r_range=(r_min, r_max),
        sigma=3.0, center_step=6, r_step=3, n_angles=180,
    )

    # Fine 탐색 (±12px 범위)
    m = 12
    cx, cy, r = daugman_ido(
        gray,
        cx_range=(cx - m, cx + m),
        cy_range=(cy - m, cy + m),
        r_range=(max(r_min, r - 6), r + 6),
        sigma=2.0, center_step=2, r_step=1, n_angles=360,
    )

    return (cx, cy), r


def detect_iris_outer_daugman(
    gray: np.ndarray, pupil_center: tuple, pupil_radius: int
) -> tuple:
    """
    Daugman IDO로 홍채 외곽 경계 검출 (coarse-to-fine).

    탐색 영역: 동공 중심 ±50% of pupil_radius,
    반지름: 1.5× – 4.5× pupil_radius

    Returns: ((cx, cy), radius)
    """
    h, w = gray.shape
    px, py = pupil_center

    r_min = max(8, int(pupil_radius * 1.5))
    r_max = min(min(h, w) // 2, int(pupil_radius * 4.5))
    if r_max <= r_min:
        r_max = r_min + 20

    sm = max(int(pupil_radius * 0.5), 8)

    # Coarse 탐색
    cx, cy, r = daugman_ido(
        gray,
        cx_range=(px - sm, px + sm),
        cy_range=(py - sm, py + sm),
        r_range=(r_min, r_max),
        sigma=3.0, center_step=4, r_step=3, n_angles=180,
    )

    # Fine 탐색 (±8px 범위)
    m = 8
    cx, cy, r = daugman_ido(
        gray,
        cx_range=(cx - m, cx + m),
        cy_range=(cy - m, cy + m),
        r_range=(max(r_min, r - 8), r + 8),
        sigma=2.0, center_step=2, r_step=1, n_angles=360,
    )

    return (cx, cy), r


# ── Step 3: Normalization — Rubber Sheet Model (bicentric) ────────────────

def normalize_iris_binocentric(
    img: np.ndarray,
    pupil_center: tuple,
    pupil_radius: int,
    iris_center: tuple,
    iris_radius: int,
    output_size: tuple = (64, 360),
) -> np.ndarray:
    """
    Daugman's Rubber Sheet Model — 비동심원(bicentric) 버전.

    I(x(r,θ), y(r,θ)) → E(r,θ),  r∈[0,1], θ∈[0,2π]

    x(r,θ) = (1-r)·xp(θ) + r·xi(θ)
    y(r,θ) = (1-r)·yp(θ) + r·yi(θ)

    xp(θ) = xp_center + rp·cos(θ)   ← 동공 경계
    xi(θ) = xi_center + ri·cos(θ)   ← 홍채 외곽 경계
    """
    if pupil_center is None or iris_center is None:
        return None
    if pupil_radius <= 0 or iris_radius <= pupil_radius:
        return None

    rows, cols = output_size
    h, w = img.shape[:2]
    xp, yp_c = int(pupil_center[0]), int(pupil_center[1])
    xi, yi_c = int(iris_center[0]), int(iris_center[1])
    rp, ri = int(pupil_radius), int(iris_radius)

    angles = np.linspace(0, 2 * np.pi, cols, endpoint=False)
    cos_a = np.cos(angles)
    sin_a = np.sin(angles)

    # 동공 경계 및 홍채 외곽 경계 (각 θ에 대해)
    xp_bnd = xp + rp * cos_a   # (cols,)
    yp_bnd = yp_c + rp * sin_a
    xi_bnd = xi + ri * cos_a   # (cols,)
    yi_bnd = yi_c + ri * sin_a

    normalized = np.zeros((rows, cols, 3), dtype=np.uint8)

    for r_idx in range(rows):
        r = r_idx / rows  # r ∈ [0, 1)

        # 선형 보간: 동공 경계 → 홍채 외곽 경계
        x_coords = np.clip(
            ((1 - r) * xp_bnd + r * xi_bnd).astype(np.int32), 0, w - 1
        )
        y_coords = np.clip(
            ((1 - r) * yp_bnd + r * yi_bnd).astype(np.int32), 0, h - 1
        )
        normalized[r_idx] = img[y_coords, x_coords]

    return normalized


# ── Step 4: Visualization ─────────────────────────────────────────────────

def create_iris_visualization(
    img: np.ndarray,
    pupil_center: tuple,
    pupil_radius: int,
    iris_center: tuple,
    iris_radius: int,
    detection_method: str = "daugman",
) -> str:
    """
    원본 이미지 위에 동공·홍채 경계를 표시하고 홍채 영역으로 크롭.

    - 홍채 외곽: 초록 (0, 220, 80)
    - 동공 경계: 주황 (50, 160, 255)
    """
    h, w = img.shape[:2]
    vis = img.copy()

    px, py = int(pupil_center[0]), int(pupil_center[1])
    ix, iy = int(iris_center[0]), int(iris_center[1])

    # 홍채 외곽 경계
    cv2.circle(vis, (ix, iy), iris_radius, (0, 220, 80), 2, cv2.LINE_AA)
    # 동공 경계
    cv2.circle(vis, (px, py), pupil_radius, (50, 160, 255), 2, cv2.LINE_AA)
    # 중심점
    cv2.circle(vis, (ix, iy), 2, (0, 255, 180), -1)
    cv2.circle(vis, (px, py), 2, (100, 200, 255), -1)

    label = "Daugman IDO" if detection_method == "daugman" else detection_method
    cv2.putText(vis, label, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                (0, 220, 80), 1, cv2.LINE_AA)

    # 홍채 영역 크롭
    pad = int(iris_radius * 1.35)
    x1, y1 = max(0, ix - pad), max(0, iy - pad)
    x2, y2 = min(w, ix + pad), min(h, iy + pad)
    cropped = vis[y1:y2, x1:x2]

    _, buf = cv2.imencode(".jpg", cropped, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


def encode_iris_strip(normalized: np.ndarray, scale_h: int = 4) -> str:
    """
    정규화된 홍채 이미지(Iris Strip)를 시각화용으로 높이 확대 후 base64 인코딩.
    """
    if normalized is None:
        return None
    h, w = normalized.shape[:2]
    strip = cv2.resize(normalized, (w, h * scale_h), interpolation=cv2.INTER_NEAREST)
    _, buf = cv2.imencode(".jpg", strip, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


# ── MediaPipe 홍채 검출 (Fallback) ───────────────────────────────────────

def detect_iris_mediapipe(img: np.ndarray, eye_side: str = "left"):
    """MediaPipe FaceLandmarker로 홍채 중심·반지름 검출."""
    h, w = img.shape[:2]
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
    result = _face_landmarker.detect(mp_image)

    if not result.face_landmarks:
        return None, None

    landmarks = result.face_landmarks[0]
    if len(landmarks) < 478:
        return None, None

    info = _IRIS_LANDMARKS[eye_side]
    center_lm = landmarks[info["center"]]
    cx = int(center_lm.x * w)
    cy = int(center_lm.y * h)

    dists = []
    for idx in info["boundary"]:
        bx = int(landmarks[idx].x * w)
        by = int(landmarks[idx].y * h)
        dists.append(np.sqrt((bx - cx) ** 2 + (by - cy) ** 2))

    radius = max(5, int(np.mean(dists)))
    return (cx, cy), radius


def _enhance_for_detection(gray: np.ndarray) -> np.ndarray:
    """CLAHE로 대비 강화 후 블러 처리."""
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    return cv2.GaussianBlur(enhanced, (7, 7), 1.5)


def _hough_on_roi(roi_gray: np.ndarray, roi_offset: tuple) -> tuple:
    """주어진 ROI에서 HoughCircles를 여러 파라미터로 시도."""
    rh, rw = roi_gray.shape
    min_r = max(8, rw // 10)
    max_r = min(rw // 2, rh // 2)
    enhanced = _enhance_for_detection(roi_gray)

    for param1, param2, dp in [(60, 30, 1.2), (50, 22, 1.2), (40, 16, 1.5), (30, 12, 1.8)]:
        circles = cv2.HoughCircles(
            enhanced, cv2.HOUGH_GRADIENT,
            dp=dp, minDist=max(rw // 4, 10),
            param1=param1, param2=param2,
            minRadius=min_r, maxRadius=max_r,
        )
        if circles is not None:
            circles = np.round(circles[0]).astype(int)
            center_roi = np.array([rw / 2, rh / 2])
            best = min(circles, key=lambda c: np.linalg.norm(c[:2] - center_roi))
            cx = int(best[0]) + roi_offset[0]
            cy = int(best[1]) + roi_offset[1]
            return (cx, cy), int(best[2])

    return None, None


def detect_iris_hough(img: np.ndarray, eye_side: str = "left"):
    """Haar Cascade + HoughCircles로 홍채 검출 (fallback)."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")
    eyes = eye_cascade.detectMultiScale(
        gray, scaleFactor=1.05, minNeighbors=3, minSize=(20, 20)
    )

    if len(eyes) >= 1:
        sorted_eyes = sorted(eyes, key=lambda e: e[0])
        if eye_side == "right" and len(sorted_eyes) >= 2:
            ex, ey, ew, eh = sorted_eyes[-1]
        else:
            ex, ey, ew, eh = sorted_eyes[0]
        pad = int(ew * 0.2)
        x1, y1 = max(0, ex - pad), max(0, ey - pad)
        x2, y2 = min(w, ex + ew + pad), min(h, ey + eh + pad)
        center, radius = _hough_on_roi(gray[y1:y2, x1:x2], (x1, y1))
        if center is not None:
            return center, radius

    cy0, cx0 = h // 2, w // 2
    my, mx = max(h // 4, 40), max(w // 4, 40)
    center, radius = _hough_on_roi(
        gray[cy0 - my:cy0 + my, cx0 - mx:cx0 + mx], (cx0 - mx, cy0 - my)
    )
    if center is not None:
        return center, radius

    center, radius = _hough_on_roi(gray, (0, 0))
    if center is not None:
        return center, radius

    return (w // 2, h // 2), min(w, h) // 3


def detect_via_pupil(img: np.ndarray):
    """동공(가장 어두운 원형 영역)을 먼저 찾고 홍채 반지름 추정."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    smooth = cv2.bilateralFilter(gray, 9, 75, 75)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(smooth)

    blur = cv2.GaussianBlur(enhanced, (11, 11), 2)
    _, dark = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    k_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, k_open)
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, k_close)

    contours, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    side = min(h, w)
    min_r = side * 0.03
    max_r = side * 0.40

    best_center, best_iris_r = None, None
    best_score = 0.0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < np.pi * min_r ** 2:
            continue

        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue

        circularity = 4 * np.pi * area / (perimeter ** 2)
        if circularity < 0.35:
            continue

        M = cv2.moments(cnt)
        if M["m00"] == 0:
            continue

        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"])
        pupil_r = np.sqrt(area / np.pi)

        if not (min_r <= pupil_r <= max_r):
            continue

        mask = np.zeros_like(gray)
        cv2.drawContours(mask, [cnt], -1, 255, -1)
        mean_val = float(np.mean(gray[mask > 0]))
        darkness_score = max(0.0, 1.0 - mean_val / 128.0)

        dist = np.sqrt((cx - w / 2) ** 2 + (cy - h / 2) ** 2)
        dist_score = max(0.0, 1.0 - dist / (side / 2))

        score = circularity * 0.4 + darkness_score * 0.35 + dist_score * 0.25

        if score > best_score:
            best_score = score
            iris_r = int(pupil_r * 2.6)
            iris_r = min(iris_r, int(min(cx, cy, w - cx, h - cy) * 0.95))
            iris_r = max(iris_r, 10)
            best_center = (cx, cy)
            best_iris_r = iris_r

    if best_center is not None and best_score > 0.3:
        return best_center, best_iris_r

    return None, None


def detect_iris(img: np.ndarray, eye_side: str = "left"):
    """Fallback 3단계: MediaPipe → 동공 기반 → HoughCircles."""
    try:
        center, radius = detect_iris_mediapipe(img, eye_side)
        if center is not None and radius > 5:
            return center, radius, "mediapipe"
    except Exception:
        pass

    try:
        center, radius = detect_via_pupil(img)
        if center is not None and radius > 5:
            return center, radius, "pupil"
    except Exception:
        pass

    center, radius = detect_iris_hough(img, eye_side)
    return center, radius, "hough"


# ── 기존 정규화 (Fallback 호환용) ────────────────────────────────────────

def normalize_iris(img: np.ndarray, center, radius: int, output_size=(64, 360)):
    """동심원 Rubber Sheet Model (Fallback 용)."""
    if center is None or radius <= 0:
        return None
    cx, cy = center
    pupil_radius = max(int(radius * 0.28), 3)
    rows, cols = output_size
    h, w = img.shape[:2]
    normalized = np.zeros((rows, cols, 3), dtype=np.uint8)

    for r_idx in range(rows):
        r = pupil_radius + (radius - pupil_radius) * r_idx / rows
        for c_idx in range(cols):
            angle = 2 * np.pi * c_idx / cols
            x = int(cx + r * np.cos(angle))
            y = int(cy + r * np.sin(angle))
            if 0 <= x < w and 0 <= y < h:
                normalized[r_idx, c_idx] = img[y, x]

    return normalized


# ── Gabor 필터 ───────────────────────────────────────────────────────────

def apply_gabor_filter(gray_img: np.ndarray) -> np.ndarray:
    responses = []
    for theta in np.linspace(0, np.pi, 8):
        kernel = cv2.getGaborKernel(
            ksize=(21, 21), sigma=4.0, theta=theta,
            lambd=10.0, gamma=0.5, psi=0
        )
        filtered = cv2.filter2D(gray_img, cv2.CV_64F, kernel)
        responses.append(float(np.mean(np.abs(filtered))))
        responses.append(float(np.std(filtered)))
    return np.array(responses)


# ── 점수 계산 ────────────────────────────────────────────────────────────

def compute_structural_score(normalized: np.ndarray) -> dict:
    gray = cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY)

    texture_variance = float(np.var(gray))
    tissue_density = min(100, int(texture_variance / 18))

    hsv = cv2.cvtColor(normalized, cv2.COLOR_BGR2HSV)
    hue_std = float(np.std(hsv[:, :, 0]))
    toxin_index = min(100, max(0, 100 - int(hue_std * 1.4)))

    edges = cv2.Canny(gray, 50, 150)
    nerve_ring_count = int(np.sum(edges > 0) / max(1, gray.shape[1] * 2))
    nerve_score = min(100, nerve_ring_count * 9)

    score = int(tissue_density * 0.4 + toxin_index * 0.35 + nerve_score * 0.25)
    return {
        "score": max(20, min(100, score)),
        "tissue_density": tissue_density,
        "toxin_index": toxin_index,
        "nerve_ring_count": nerve_ring_count,
    }


def compute_neurological_score(img: np.ndarray, center, radius: int) -> dict:
    cx, cy = center
    h, w = img.shape[:2]
    pupil_radius = max(int(radius * 0.28), 5)

    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(mask, (cx, cy), pupil_radius, 255, -1)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    pupil_vals = gray[mask > 0]

    pupil_mean = float(np.mean(pupil_vals)) if len(pupil_vals) > 0 else 128
    pupil_score = min(100, int((255 - pupil_mean) / 2.55))

    left_vals = gray[mask > 0][:len(pupil_vals) // 2]
    right_vals = gray[mask > 0][len(pupil_vals) // 2:]
    sym_diff = abs(float(np.mean(left_vals)) - float(np.mean(right_vals))) if len(left_vals) > 0 else 0
    symmetry = max(0, 100 - int(sym_diff * 1.8))

    pupil_ratio = round(pupil_radius / max(radius, 1), 3)
    focus_index = min(100, max(40, int(85 - abs(pupil_ratio - 0.3) * 120)))

    score = int(pupil_score * 0.4 + symmetry * 0.35 + focus_index * 0.25)
    return {
        "score": max(20, min(100, score)),
        "pupil_ratio": pupil_ratio,
        "symmetry": symmetry,
        "focus_index": focus_index,
    }


def compute_kinetic_score(normalized: np.ndarray) -> dict:
    gray = cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY)
    gabor_features = apply_gabor_filter(gray)

    direction_variance = float(np.var(gabor_features[:8]))
    tracking_accuracy = min(100, max(30, int(92 - direction_variance * 0.5)))

    sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    grad_mag = np.sqrt(sobelx ** 2 + sobely ** 2)
    fiber_continuity = min(100, int(float(np.mean(grad_mag)) * 2.2))

    anti_saccade = min(100, max(40, (tracking_accuracy + fiber_continuity) // 2))

    score = int(tracking_accuracy * 0.45 + fiber_continuity * 0.3 + anti_saccade * 0.25)
    return {
        "score": max(20, min(100, score)),
        "tracking_accuracy": tracking_accuracy,
        "fiber_continuity": fiber_continuity,
        "anti_saccade_rate": anti_saccade,
    }


# ── 기존 시각화 (하위 호환) ──────────────────────────────────────────────

def crop_iris_image(img: np.ndarray, center, radius: int, method: str = "mediapipe") -> str:
    cx, cy = center
    h, w = img.shape[:2]
    pad = int(radius * 1.4)
    x1, y1 = max(0, cx - pad), max(0, cy - pad)
    x2, y2 = min(w, cx + pad), min(h, cy + pad)
    cropped = img[y1:y2, x1:x2].copy()
    rcx, rcy = cx - x1, cy - y1

    ring_color = (0, 220, 180) if method == "mediapipe" else (100, 180, 255)
    cv2.circle(cropped, (rcx, rcy), radius, ring_color, 2)
    cv2.circle(cropped, (rcx, rcy), int(radius * 0.28), (100, 200, 255), 1)

    label = "MediaPipe" if method == "mediapipe" else "HoughCircles"
    cv2.putText(cropped, label, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, ring_color, 1, cv2.LINE_AA)

    _, buf = cv2.imencode(".jpg", cropped)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


# ── 메인 파이프라인 ──────────────────────────────────────────────────────

def _preprocess_image(img: np.ndarray) -> np.ndarray:
    """크기 정규화: 최소 200px, 최대 1600px."""
    h, w = img.shape[:2]
    if min(h, w) < 200:
        scale = 200 / min(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    if max(h, w) > 1600:
        scale = 1600 / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def analyze(image_data: str, eye_side: str = "left") -> dict:
    img = decode_image(image_data)
    if img is None:
        raise ValueError("이미지 디코딩 실패")
    img = _preprocess_image(img)

    # ── Step 1: Pre-processing ─────────────────────────────────────────────
    preprocessed, enhanced_gray = preprocess_iris_image(img)

    # ── Step 2: Segmentation (Daugman's IDO) ──────────────────────────────
    detection_method = "daugman"
    try:
        pupil_center, pupil_radius = detect_pupil_daugman(enhanced_gray)
        iris_center, iris_radius = detect_iris_outer_daugman(
            enhanced_gray, pupil_center, pupil_radius
        )
        # 결과 유효성 검사
        if (iris_radius < 10 or pupil_radius < 3
                or iris_radius <= pupil_radius
                or iris_radius > min(img.shape[:2]) // 2):
            raise ValueError("IDO 검출 결과 비합리적")
    except Exception:
        # Fallback: MediaPipe → 동공 → HoughCircles
        center, iris_radius, detection_method = detect_iris(img, eye_side)
        pupil_center = center
        pupil_radius = max(int(iris_radius * 0.28), 3)
        iris_center = center

    iris_detected = iris_radius > 15

    # ── Step 3: Normalization (Rubber Sheet, bicentric) ────────────────────
    normalized = normalize_iris_binocentric(
        preprocessed, pupil_center, pupil_radius, iris_center, iris_radius
    )
    if normalized is None:
        # 동심원 fallback
        normalized = normalize_iris(preprocessed, iris_center, iris_radius)
    if normalized is None:
        raise ValueError("홍채 정규화 실패")

    # ── 분석 점수 ──────────────────────────────────────────────────────────
    structural = compute_structural_score(normalized)
    neurological = compute_neurological_score(img, iris_center, iris_radius)
    kinetic = compute_kinetic_score(normalized)

    total = int(
        structural["score"] * 0.40
        + neurological["score"] * 0.35
        + kinetic["score"] * 0.25
    )

    # ── Step 4: Visualization ──────────────────────────────────────────────
    iris_crop = create_iris_visualization(
        img, pupil_center, pupil_radius, iris_center, iris_radius, detection_method
    )
    iris_strip = encode_iris_strip(normalized)

    return {
        "iris_detected": iris_detected,
        "detection_method": detection_method,
        "eye_side": eye_side,
        "total_score": total,
        "structural": structural,
        "neurological": neurological,
        "kinetic": kinetic,
        "iris_crop": iris_crop,
        "iris_strip": iris_strip,      # 정규화된 Iris Strip (base64)
        "center": list(iris_center),
        "radius": iris_radius,
        "pupil_center": list(pupil_center),
        "pupil_radius": pupil_radius,
    }
