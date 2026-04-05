"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PatientInfo {
  name: string;
  age: number;
  gender: string;
  medications: string;
  surgical_history: string;
  medical_history: string;
}

type EyeSide = "left" | "right";
type CaptureSource = "camera" | "image" | "video";

interface EyeCapture {
  image: string | null;
  source: CaptureSource | null;
}

const EYE_LABEL: Record<EyeSide, string> = { left: "왼쪽 눈", right: "오른쪽 눈" };

export default function ScanPage() {
  const router = useRouter();
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [captures, setCaptures] = useState<Record<EyeSide, EyeCapture>>({
    left: { image: null, source: null },
    right: { image: null, source: null },
  });

  // 카메라 모달
  const [cameraEye, setCameraEye] = useState<EyeSide | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  // 영상 모달
  const [videoModal, setVideoModal] = useState<{ eye: EyeSide | null; url: string | null }>({
    eye: null,
    url: null,
  });

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string>("guest");
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [manualIris, setManualIris] = useState<Record<EyeSide, {cx: number; cy: number; radius: number} | null>>({ left: null, right: null });
  const [adjustingEye, setAdjustingEye] = useState<EyeSide | null>(null);

  // ── 인증 체크 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const userRaw = localStorage.getItem("iris_user");
    if (!userRaw) { router.replace("/login"); return; }
    const user = JSON.parse(userRaw);
    setUserId(String(user.user_id));

    const patientRaw = sessionStorage.getItem("iris_patient");
    if (!patientRaw) { router.replace("/patient"); return; }
    setPatientInfo(JSON.parse(patientRaw));
  }, [router]);


  // ── 카메라 ─────────────────────────────────────────────────────────────

  // 카메라 목록 조회 (권한 허용 후)
  const loadDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = all.filter((d) => d.kind === "videoinput");
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch {
      // ignore
    }
  }, [selectedDeviceId]);

  const openCamera = useCallback(async (eye: EyeSide) => {
    setError("");
    setCameraEye(eye);
    setCameraReady(false);
    try {
      // 먼저 권한 요청 겸 기본 스트림으로 장치 목록 확보
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      };
      const ms = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(ms);
      await loadDevices();
    } catch {
      setError("카메라 접근 권한이 필요합니다.");
      setCameraEye(null);
    }
  }, [selectedDeviceId, loadDevices]);

  // 장치 변경 시 스트림 교체
  const switchDevice = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    stream?.getTracks().forEach((t) => t.stop());
    setCameraReady(false);
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(ms);
    } catch {
      setError("선택한 카메라를 열 수 없습니다.");
    }
  }, [stream]);

  useEffect(() => {
    if (stream && cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = stream;
      cameraVideoRef.current.onloadedmetadata = () => setCameraReady(true);
    }
  }, [stream]);

  const closeCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraReady(false);
    setCountdown(null);
    setCameraEye(null);
  }, [stream]);

  const captureFromCamera = useCallback(() => {
    if (!cameraVideoRef.current || !canvasRef.current || !cameraEye) return;
    const video = cameraVideoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptures((prev) => ({ ...prev, [cameraEye]: { image: dataUrl, source: "camera" } }));
    closeCamera();
  }, [cameraEye, closeCamera]);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cancelCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }, []);

  const startCountdown = useCallback(() => {
    if (countdown !== null) { cancelCountdown(); return; } // Space로 취소
    let count = 3;
    setCountdown(count);
    countdownRef.current = setInterval(() => {
      count--;
      if (count === 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        setCountdown(null);
        captureFromCamera();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [countdown, cancelCountdown, captureFromCamera]);

  // Space 키 단축키 (카메라 모달 열려 있을 때)
  useEffect(() => {
    if (!cameraEye) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        if (!cameraReady) return;
        startCountdown();
      }
      if (e.code === "Escape") closeCamera();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [cameraEye, cameraReady, startCountdown, closeCamera]);

  // ── 이미지 업로드 ──────────────────────────────────────────────────────

  const handleImageUpload = useCallback((eye: EyeSide, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("이미지 파일만 업로드 가능합니다."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCaptures((prev) => ({ ...prev, [eye]: { image: ev.target?.result as string, source: "image" } }));
      setError("");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  // ── 영상 업로드 ────────────────────────────────────────────────────────

  const handleVideoUpload = useCallback((eye: EyeSide, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("영상 파일만 업로드 가능합니다."); return; }
    const url = URL.createObjectURL(file);
    setVideoModal({ eye, url });
    setError("");
    e.target.value = "";
  }, []);

  const captureFromVideo = useCallback(() => {
    if (!videoPreviewRef.current || !canvasRef.current || !videoModal.eye) return;
    const video = videoPreviewRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptures((prev) => ({ ...prev, [videoModal.eye!]: { image: dataUrl, source: "video" } }));
    if (videoModal.url) URL.revokeObjectURL(videoModal.url);
    setVideoModal({ eye: null, url: null });
  }, [videoModal]);

  const closeVideoModal = useCallback(() => {
    if (videoModal.url) URL.revokeObjectURL(videoModal.url);
    setVideoModal({ eye: null, url: null });
  }, [videoModal]);

  // ── 분석 ───────────────────────────────────────────────────────────────

  const analyze = useCallback(async () => {
    const eyes = (["left", "right"] as EyeSide[]).filter((e) => captures[e].image);
    if (eyes.length === 0) return;
    setScanning(true);
    setError("");
    try {
      const results: Record<string, unknown> = {};
      for (const eye of eyes) {
        const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${API}/api/scan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: captures[eye].image, eye_side: eye, user_id: userId, patient_info: patientInfo, manual_iris: manualIris[eye] || null }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "분석 실패");
        }
        results[eye] = await res.json();
      }
      sessionStorage.setItem("iris_results", JSON.stringify(results));
      router.push("/report");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "서버 연결 오류. 백엔드가 실행 중인지 확인하세요.");
    } finally {
      setScanning(false);
    }
  }, [captures, router, userId, patientInfo, manualIris]);

  const hasAny = captures.left.image || captures.right.image;

  // ── 렌더 ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/patient" className="text-sm text-slate-400 hover:text-white transition-colors">← 환자 정보</Link>
        <span className="font-semibold" style={{ color: "var(--accent)" }}>홍채 촬영</span>
        {patientInfo && (
          <span className="text-xs text-slate-500">{patientInfo.name} ({patientInfo.age}세)</span>
        )}
      </nav>

      <div className="flex flex-col items-center flex-1 px-4 py-6 max-w-3xl mx-auto w-full">

        {/* 안내 */}
        <p className="text-xs text-slate-400 mb-5 text-center">
          왼쪽·오른쪽 눈을 각각 촬영하거나 이미지·영상을 업로드하세요. 한쪽만 해도 분석 가능합니다.
        </p>

        {/* 좌우 패널 */}
        <div className="grid grid-cols-2 gap-4 w-full mb-5">
          {(["left", "right"] as EyeSide[]).map((eye) => (
            <EyePanel
              key={eye}
              eye={eye}
              capture={captures[eye]}
              hasManualIris={!!manualIris[eye]}
              onCamera={() => openCamera(eye)}
              onImageUpload={(e) => handleImageUpload(eye, e)}
              onVideoUpload={(e) => handleVideoUpload(eye, e)}
              onClear={() => {
                setCaptures((prev) => ({ ...prev, [eye]: { image: null, source: null } }));
                setManualIris((prev) => ({ ...prev, [eye]: null }));
              }}
              onAdjust={() => setAdjustingEye(eye)}
            />
          ))}
        </div>

        {/* 오류 */}
        {error && (
          <div className="w-full p-3 rounded-xl mb-4 text-sm text-red-300 bg-red-900/30 border border-red-500/30">
            {error}
          </div>
        )}

        {/* 분석 버튼 */}
        <button
          onClick={analyze}
          disabled={!hasAny || scanning}
          className="w-full py-4 rounded-full font-semibold text-base transition-all disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#080d1a" }}
        >
          {scanning ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              분석 중...
            </span>
          ) : (
            `🔍 AI 분석 시작${captures.left.image && captures.right.image ? " (양안)" : captures.left.image ? " (왼쪽)" : captures.right.image ? " (오른쪽)" : ""}`
          )}
        </button>
      </div>

      {/* 공유 캔버스 (hidden) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── 홍채 범위 조정 모달 ── */}
      {adjustingEye && captures[adjustingEye].image && (
        <IrisAdjustModal
          eye={adjustingEye}
          imageData={captures[adjustingEye].image!}
          initialIris={manualIris[adjustingEye]}
          onConfirm={(iris) => {
            setManualIris((prev) => ({ ...prev, [adjustingEye]: iris }));
            setAdjustingEye(null);
          }}
          onClose={() => setAdjustingEye(null)}
        />
      )}

      {/* ── 카메라 모달 ── */}
      {cameraEye && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <button onClick={closeCamera} className="text-sm text-slate-400 hover:text-white">✕ 닫기</button>
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {EYE_LABEL[cameraEye]} 촬영
            </span>
            <div className="w-16" />
          </div>

          {/* 카메라 장치 선택 */}
          {devices.length > 1 && (
            <div className="px-6 py-2 border-b border-white/10 flex items-center gap-3">
              <span className="text-xs text-slate-400 shrink-0">📷 카메라</span>
              <select
                value={selectedDeviceId}
                onChange={(e) => switchDevice(e.target.value)}
                className="flex-1 text-xs rounded-lg px-3 py-1.5 border border-white/20 outline-none"
                style={{ background: "#0d1525", color: "#e2e8f0" }}
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `카메라 ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex-1 relative flex items-center justify-center">
            {/* 가이드 원 */}
            {cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="w-44 h-44 rounded-full border-2 iris-ring" style={{ borderColor: "var(--accent)", opacity: 0.7 }} />
              </div>
            )}
            {/* 카운트다운 */}
            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <span className="text-8xl font-bold" style={{ color: "var(--accent)", textShadow: "0 0 40px var(--accent)" }}>
                  {countdown}
                </span>
              </div>
            )}
            <video ref={cameraVideoRef} autoPlay muted playsInline className="w-full max-h-[65vh] object-contain" />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-slate-400 text-sm">카메라 초기화 중...</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 space-y-2">
            <p className="text-xs text-center text-slate-500">
              <kbd className="px-1.5 py-0.5 rounded border border-white/20 text-slate-400 font-mono">Space</kbd>
              {" "}촬영 시작 · 다시 누르면 취소 &nbsp;|&nbsp;
              <kbd className="px-1.5 py-0.5 rounded border border-white/20 text-slate-400 font-mono">Esc</kbd>
              {" "}닫기
            </p>
            <button
              onClick={startCountdown}
              disabled={!cameraReady}
              className="w-full py-4 rounded-full font-semibold text-base transition-all disabled:opacity-40"
              style={{ background: countdown !== null ? "rgba(239,68,68,0.8)" : "var(--accent)", color: "#080d1a" }}
            >
              {countdown !== null ? `⏹ ${countdown}초 후 촬영 (취소하려면 클릭)` : "📷 촬영 (Space)"}
            </button>
          </div>
        </div>
      )}

      {/* ── 영상 모달 ── */}
      {videoModal.url && videoModal.eye && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <button onClick={closeVideoModal} className="text-sm text-slate-400 hover:text-white">✕ 닫기</button>
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {EYE_LABEL[videoModal.eye]} 영상 프레임 선택
            </span>
            <div className="w-16" />
          </div>

          <div className="flex-1 flex items-center justify-center p-4">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoPreviewRef}
              src={videoModal.url}
              controls
              className="w-full max-h-[65vh] rounded-xl object-contain"
              style={{ background: "#0d1525" }}
            />
          </div>

          <div className="px-6 pb-6 space-y-3">
            <p className="text-xs text-center text-slate-400">
              영상을 재생하다 원하는 프레임에서 일시정지한 뒤 아래 버튼을 누르세요.
            </p>
            <button
              onClick={captureFromVideo}
              className="w-full py-4 rounded-full font-semibold text-base"
              style={{ background: "var(--accent)", color: "#080d1a" }}
            >
              📸 현재 프레임으로 분석
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ── 눈 패널 컴포넌트 ──────────────────────────────────────────────────────

function EyePanel({
  eye,
  capture,
  hasManualIris,
  onCamera,
  onImageUpload,
  onVideoUpload,
  onClear,
  onAdjust,
}: {
  eye: EyeSide;
  capture: EyeCapture;
  hasManualIris: boolean;
  onCamera: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onAdjust: () => void;
}) {
  const SOURCE_LABEL: Record<CaptureSource, string> = {
    camera: "카메라",
    image: "이미지",
    video: "영상",
  };

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
          {eye === "left" ? "👁 왼쪽" : "👁 오른쪽"}
        </span>
        <div className="flex items-center gap-2">
          {capture.image && (
            <button
              onClick={onAdjust}
              className="text-xs px-2 py-0.5 rounded-full border transition-colors"
              style={{
                borderColor: hasManualIris ? "var(--accent)" : "rgba(255,255,255,0.2)",
                color: hasManualIris ? "var(--accent)" : "#94a3b8",
              }}
            >
              {hasManualIris ? "✓ 조정됨" : "범위 조정"}
            </button>
          )}
          {capture.source && (
            <span className="text-xs text-slate-500">{SOURCE_LABEL[capture.source]}</span>
          )}
        </div>
      </div>

      {/* 미리보기 */}
      <div className="relative aspect-square bg-[#0d1525] flex items-center justify-center">
        {capture.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={capture.image} alt={`${eye} eye`} className="w-full h-full object-cover" />
            <button
              onClick={onClear}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-500/70 transition-colors"
            >
              ✕
            </button>
          </>
        ) : (
          <span className="text-4xl opacity-20">👁</span>
        )}
      </div>

      {/* 버튼 */}
      <div className="flex border-t border-white/10">
        {/* 카메라 */}
        <button
          onClick={onCamera}
          className="flex-1 py-2.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors border-r border-white/10 flex flex-col items-center gap-0.5"
        >
          <span>📷</span>
          <span>카메라</span>
        </button>

        {/* 이미지 업로드 */}
        <label className="flex-1 py-2.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors border-r border-white/10 flex flex-col items-center gap-0.5 cursor-pointer">
          <span>🖼️</span>
          <span>이미지</span>
          <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
        </label>

        {/* 영상 업로드 */}
        <label className="flex-1 py-2.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex flex-col items-center gap-0.5 cursor-pointer">
          <span>🎬</span>
          <span>영상</span>
          <input type="file" accept="video/*" className="hidden" onChange={onVideoUpload} />
        </label>
      </div>
    </div>
  );
}

// ── 홍채 범위 수동 조정 모달 ──────────────────────────────────────────────

function IrisAdjustModal({
  eye,
  imageData,
  initialIris,
  onConfirm,
  onClose,
}: {
  eye: EyeSide;
  imageData: string;
  initialIris: { cx: number; cy: number; radius: number } | null;
  onConfirm: (iris: { cx: number; cy: number; radius: number }) => void;
  onClose: () => void;
}) {
  const CANVAS_SIZE = 360;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const scaleRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const dragRef = useRef<{
    mode: "move" | "resize";
    startX: number; startY: number;
    startCx: number; startCy: number; startR: number;
  } | null>(null);

  const [circle, setCircle] = useState({ cx: CANVAS_SIZE / 2, cy: CANVAS_SIZE / 2, radius: CANVAS_SIZE * 0.28 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // 이미지 로드 & 초기 원 설정
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      imgRef.current = img;
      const scale = Math.min(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight);
      const displayW = img.naturalWidth * scale;
      const displayH = img.naturalHeight * scale;
      const offsetX = (CANVAS_SIZE - displayW) / 2;
      const offsetY = (CANVAS_SIZE - displayH) / 2;
      scaleRef.current = { scale, offsetX, offsetY };

      if (initialIris) {
        setCircle({
          cx: initialIris.cx * scale + offsetX,
          cy: initialIris.cy * scale + offsetY,
          radius: initialIris.radius * scale,
        });
      } else {
        setCircle({
          cx: CANVAS_SIZE / 2,
          cy: CANVAS_SIZE / 2,
          radius: Math.min(displayW, displayH) * 0.35,
        });
      }
      setImageLoaded(true);
    };
    img.src = imageData;
  }, [imageData, initialIris]);

  // 캔버스 드로우
  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { scale, offsetX, offsetY } = scaleRef.current;
    const img = imgRef.current;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = "#0d1525";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(img, offsetX, offsetY, img.naturalWidth * scale, img.naturalHeight * scale);

    // 원 밖 어둡게
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(circle.cx, circle.cy, circle.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 원 테두리
    ctx.beginPath();
    ctx.arc(circle.cx, circle.cy, circle.radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#00c8b4";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 중심 십자선
    ctx.strokeStyle = "rgba(0,200,180,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(circle.cx - 10, circle.cy); ctx.lineTo(circle.cx + 10, circle.cy);
    ctx.moveTo(circle.cx, circle.cy - 10); ctx.lineTo(circle.cx, circle.cy + 10);
    ctx.stroke();

    // 크기 조정 핸들 (오른쪽)
    ctx.beginPath();
    ctx.arc(circle.cx + circle.radius, circle.cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#00c8b4";
    ctx.fill();
  }, [circle, imageLoaded]);

  function getPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_SIZE / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_SIZE / rect.height),
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const pos = getPos(e);
    const handleDist = Math.hypot(pos.x - (circle.cx + circle.radius), pos.y - circle.cy);
    const centerDist = Math.hypot(pos.x - circle.cx, pos.y - circle.cy);
    if (handleDist <= 14) {
      dragRef.current = { mode: "resize", startX: pos.x, startY: pos.y, startCx: circle.cx, startCy: circle.cy, startR: circle.radius };
    } else if (centerDist <= circle.radius) {
      dragRef.current = { mode: "move", startX: pos.x, startY: pos.y, startCx: circle.cx, startCy: circle.cy, startR: circle.radius };
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const pos = getPos(e);
    const { mode, startX, startY, startCx, startCy } = dragRef.current;
    if (mode === "move") {
      setCircle((prev) => ({ ...prev, cx: startCx + pos.x - startX, cy: startCy + pos.y - startY }));
    } else {
      const r = Math.max(20, Math.hypot(pos.x - startCx, pos.y - startCy));
      setCircle((prev) => ({ ...prev, radius: r }));
    }
  }

  function onMouseUp() { dragRef.current = null; }

  function handleConfirm() {
    const { scale, offsetX, offsetY } = scaleRef.current;
    onConfirm({
      cx: Math.round((circle.cx - offsetX) / scale),
      cy: Math.round((circle.cy - offsetY) / scale),
      radius: Math.round(circle.radius / scale),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-white">✕ 닫기</button>
        <span className="font-semibold" style={{ color: "var(--accent)" }}>
          {EYE_LABEL[eye]} 홍채 범위 조정
        </span>
        <div className="w-16" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="rounded-xl"
          style={{ maxWidth: "100%", maxHeight: "60vh", cursor: "crosshair", touchAction: "none" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
      </div>

      <div className="px-6 pb-6 space-y-3">
        <p className="text-xs text-center text-slate-400">
          원 안을 드래그 → 이동 &nbsp;|&nbsp; 오른쪽 점을 드래그 → 크기 조정
        </p>
        <button
          onClick={handleConfirm}
          className="w-full py-4 rounded-full font-semibold text-base"
          style={{ background: "var(--accent)", color: "#080d1a" }}
        >
          이 범위로 분석
        </button>
      </div>
    </div>
  );
}
