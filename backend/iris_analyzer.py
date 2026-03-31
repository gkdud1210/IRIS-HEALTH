"""
홍채 분석 파이프라인
- 홍채 검출: MediaPipe FaceMesh (refine_landmarks) → HoughCircles fallback
- 정규화: Daugman's Rubber Sheet Model
- 특징 추출: Gabor Filter + 색상/밀도 분석
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
# Right eye (user's right): 468=center, 469-472=boundary
# Left  eye (user's left) : 473=center, 474-477=boundary
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


# ── MediaPipe 홍채 검출 ────────────────────────────────────────────────────

def detect_iris_mediapipe(img: np.ndarray, eye_side: str = "left"):
    """
    MediaPipe FaceLandmarker (Tasks API) 로 홍채 중심·반지름 검출.
    Returns: (cx, cy), radius  or  None, None
    """
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

    # 반지름: 중심 → 경계 4점 평균 거리
    dists = []
    for idx in info["boundary"]:
        bx = int(landmarks[idx].x * w)
        by = int(landmarks[idx].y * h)
        dists.append(np.sqrt((bx - cx) ** 2 + (by - cy) ** 2))

    radius = max(5, int(np.mean(dists)))
    return (cx, cy), radius


# ── HoughCircles fallback ────────────────────────────────────────────────

def detect_iris_hough(img: np.ndarray, eye_side: str = "left"):
    """
    OpenCV Haar Cascade + HoughCircles로 홍채 검출 (MediaPipe 실패 시 fallback).
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    eye_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_eye.xml"
    )
    eyes = eye_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
    )

    roi_gray = None
    roi_offset = (0, 0)

    if len(eyes) >= 1:
        sorted_eyes = sorted(eyes, key=lambda e: e[0])
        if eye_side == "left" and len(sorted_eyes) >= 1:
            ex, ey, ew, eh = sorted_eyes[0]
        elif eye_side == "right" and len(sorted_eyes) >= 2:
            ex, ey, ew, eh = sorted_eyes[-1]
        else:
            ex, ey, ew, eh = sorted_eyes[0]
        pad = int(ew * 0.15)
        x1 = max(0, ex - pad)
        y1 = max(0, ey - pad)
        x2 = min(w, ex + ew + pad)
        y2 = min(h, ey + eh + pad)
        roi_gray = gray[y1:y2, x1:x2]
        roi_offset = (x1, y1)
    else:
        roi_gray = gray[h // 3: 2 * h // 3, w // 4: 3 * w // 4]
        roi_offset = (w // 4, h // 3)

    blurred = cv2.GaussianBlur(roi_gray, (7, 7), 1.5)
    rh, rw = blurred.shape
    min_r = max(10, rw // 8)
    max_r = min(rw // 2, rh // 2)

    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT,
        dp=1.2, minDist=rw // 3,
        param1=60, param2=28,
        minRadius=min_r, maxRadius=max_r,
    )

    if circles is not None:
        circles = np.round(circles[0]).astype(int)
        center_roi = np.array([rw / 2, rh / 2])
        best = min(circles, key=lambda c: np.linalg.norm(c[:2] - center_roi))
        cx = best[0] + roi_offset[0]
        cy = best[1] + roi_offset[1]
        return (cx, cy), int(best[2])

    rh, rw = roi_gray.shape
    cx = roi_offset[0] + rw // 2
    cy = roi_offset[1] + rh // 2
    return (cx, cy), min(rw, rh) // 3


# ── 통합 검출 (MediaPipe → fallback) ─────────────────────────────────────

def detect_iris(img: np.ndarray, eye_side: str = "left"):
    """
    MediaPipe 우선, 실패 시 HoughCircles fallback.
    Returns: (center, radius, method)
    """
    try:
        center, radius = detect_iris_mediapipe(img, eye_side)
        if center is not None and radius > 5:
            return center, radius, "mediapipe"
    except Exception:
        pass

    center, radius = detect_iris_hough(img, eye_side)
    return center, radius, "hough"


# ── 정규화 (Daugman's Rubber Sheet) ──────────────────────────────────────

def normalize_iris(img: np.ndarray, center, radius: int, output_size=(64, 360)):
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


# ── 홍채 크롭 이미지 ────────────────────────────────────────────────────

def crop_iris_image(img: np.ndarray, center, radius: int, method: str = "mediapipe") -> str:
    cx, cy = center
    h, w = img.shape[:2]
    pad = int(radius * 1.4)
    x1, y1 = max(0, cx - pad), max(0, cy - pad)
    x2, y2 = min(w, cx + pad), min(h, cy + pad)
    cropped = img[y1:y2, x1:x2].copy()
    rcx, rcy = cx - x1, cy - y1

    # MediaPipe 검출 시 더 정밀한 마킹
    ring_color = (0, 220, 180) if method == "mediapipe" else (100, 180, 255)
    cv2.circle(cropped, (rcx, rcy), radius, ring_color, 2)
    cv2.circle(cropped, (rcx, rcy), int(radius * 0.28), (100, 200, 255), 1)

    # 검출 방법 표시
    label = "MediaPipe" if method == "mediapipe" else "HoughCircles"
    cv2.putText(cropped, label, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, ring_color, 1, cv2.LINE_AA)

    _, buf = cv2.imencode(".jpg", cropped)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode()


# ── 메인 파이프라인 ──────────────────────────────────────────────────────

def analyze(image_data: str, eye_side: str = "left") -> dict:
    img = decode_image(image_data)
    if img is None:
        raise ValueError("이미지 디코딩 실패")

    center, radius, method = detect_iris(img, eye_side)
    iris_detected = radius > 15

    normalized = normalize_iris(img, center, radius)
    if normalized is None:
        raise ValueError("홍채 정규화 실패")

    structural = compute_structural_score(normalized)
    neurological = compute_neurological_score(img, center, radius)
    kinetic = compute_kinetic_score(normalized)

    total = int(
        structural["score"] * 0.40
        + neurological["score"] * 0.35
        + kinetic["score"] * 0.25
    )

    iris_crop = crop_iris_image(img, center, radius, method)

    return {
        "iris_detected": iris_detected,
        "detection_method": method,
        "eye_side": eye_side,
        "total_score": total,
        "structural": structural,
        "neurological": neurological,
        "kinetic": kinetic,
        "iris_crop": iris_crop,
        "center": list(center),
        "radius": radius,
    }
