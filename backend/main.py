from __future__ import annotations
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List
import traceback
import hashlib
import os

from database import User, ScanRecord, get_db
from iris_analyzer import analyze
from gemini_analyzer import analyze_with_gemini

app = FastAPI(title="Iris Health API", version="1.0.0")

ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5501"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{hashed}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split(":", 1)
        return hashlib.sha256((salt + password).encode()).hexdigest() == hashed
    except Exception:
        return False


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    user_id: int
    name: str
    email: str


class ScanRequest(BaseModel):
    image: str
    eye_side: str = "left"
    user_id: str = "guest"
    patient_info: Optional[dict] = None
    manual_iris: Optional[dict] = None


class ScanResponse(BaseModel):
    id: int
    iris_detected: bool
    detection_method: str
    eye_side: str
    total_score: int
    structural_score: int
    neurological_score: int
    kinetic_score: int
    details: dict
    ai_analysis: dict
    iris_crop: str
    iris_strip: Optional[str] = None
    pupil_center: Optional[List[int]] = None
    pupil_radius: Optional[int] = None
    created_at: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다.")
    user = User(email=req.email, name=req.name, password_hash=_hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return AuthResponse(user_id=user.id, name=user.name, email=user.email)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not _verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    return AuthResponse(user_id=user.id, name=user.name, email=user.email)


@app.post("/api/scan", response_model=ScanResponse)
def scan_iris(req: ScanRequest, db: Session = Depends(get_db)):
    # 1) OpenCV 기반 수치 분석
    try:
        cv_result = analyze(req.image, req.eye_side, req.manual_iris)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=422, detail=f"이미지 분석 오류: {str(e)}")

    # 2) Gemini AI 소견 분석 (실패해도 CV 결과는 반환)
    ai_result = {}
    try:
        # 홍채 크롭 이미지가 있으면 그것을, 없으면 원본 사용
        img_for_ai = cv_result["iris_crop"] if cv_result["iris_crop"] else req.image
        ai_result = analyze_with_gemini(img_for_ai)
    except Exception as e:
        traceback.print_exc()
        ai_result = {"error": str(e), "overall_impression": "AI 분석 중 오류가 발생했습니다."}

    record = ScanRecord(
        user_id=req.user_id,
        eye_side=req.eye_side,
        structural_score=cv_result["structural"]["score"],
        neurological_score=cv_result["neurological"]["score"],
        kinetic_score=cv_result["kinetic"]["score"],
        total_score=cv_result["total_score"],
        details={
            "structural": cv_result["structural"],
            "neurological": cv_result["neurological"],
            "kinetic": cv_result["kinetic"],
            "iris_detected": cv_result["iris_detected"],
            "ai_analysis": ai_result,
            "patient_info": req.patient_info or {},
        },
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return ScanResponse(
        id=record.id,
        iris_detected=cv_result["iris_detected"],
        detection_method=cv_result.get("detection_method", "hough"),
        eye_side=req.eye_side,
        total_score=cv_result["total_score"],
        structural_score=cv_result["structural"]["score"],
        neurological_score=cv_result["neurological"]["score"],
        kinetic_score=cv_result["kinetic"]["score"],
        details={
            "structural": cv_result["structural"],
            "neurological": cv_result["neurological"],
            "kinetic": cv_result["kinetic"],
        },
        ai_analysis=ai_result,
        iris_crop=cv_result["iris_crop"],
        iris_strip=cv_result.get("iris_strip"),
        pupil_center=cv_result.get("pupil_center"),
        pupil_radius=cv_result.get("pupil_radius"),
        created_at=record.created_at.isoformat(),
    )


@app.get("/api/history/{user_id}")
def get_history(user_id: str, db: Session = Depends(get_db)):
    records = (
        db.query(ScanRecord)
        .filter(ScanRecord.user_id == user_id)
        .order_by(ScanRecord.created_at.desc())
        .limit(30)
        .all()
    )
    return [
        {
            "id": r.id,
            "eye_side": r.eye_side,
            "total_score": r.total_score,
            "structural_score": r.structural_score,
            "neurological_score": r.neurological_score,
            "kinetic_score": r.kinetic_score,
            "created_at": r.created_at.isoformat(),
        }
        for r in records
    ]


@app.delete("/api/history/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(ScanRecord).filter(ScanRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="기록 없음")
    db.delete(record)
    db.commit()
    return {"ok": True}
