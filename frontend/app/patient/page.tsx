"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PatientPage() {
  const router = useRouter();
  const [userName, setUserName] = useState("");
  const [isGuest, setIsGuest] = useState(false);

  const [patientName, setPatientName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"남" | "여" | "기타" | "">("");
  const [medications, setMedications] = useState("");
  const [surgicalHistory, setSurgicalHistory] = useState("");
  const [medicalHistory, setMedicalHistory] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("iris_user");
    if (!raw) {
      router.replace("/login");
      return;
    }
    const user = JSON.parse(raw);
    setUserName(user.name);
    setIsGuest(user.user_id === "guest");
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("iris_user");
    router.replace(isGuest ? "/" : "/login");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientName.trim()) {
      setError("환자 이름을 입력해주세요.");
      return;
    }
    if (!age || Number(age) <= 0) {
      setError("나이를 올바르게 입력해주세요.");
      return;
    }
    if (!gender) {
      setError("성별을 선택해주세요.");
      return;
    }
    const patientInfo = {
      name: patientName.trim(),
      age: Number(age),
      gender,
      medications: medications.trim(),
      surgical_history: surgicalHistory.trim(),
      medical_history: medicalHistory.trim(),
    };
    sessionStorage.setItem("iris_patient", JSON.stringify(patientInfo));
    router.push("/scan");
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      {/* 네비게이션 */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-xl">👁️</span>
          <span className="font-bold tracking-tight" style={{ color: "var(--accent)" }}>IRIS HEALTH</span>
        </a>
        <div className="flex items-center gap-4">
          {isGuest ? (
            <span className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
              체험 중
            </span>
          ) : (
            <span className="text-sm text-slate-400">{userName}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30"
          >
            {isGuest ? "홈으로" : "로그아웃"}
          </button>
        </div>
      </nav>

      {/* 콘텐츠 */}
      <div className="flex flex-col items-center flex-1 px-4 py-10 max-w-xl mx-auto w-full">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
            <span className="text-2xl">🩺</span>
          </div>
          <h1 className="text-2xl font-bold mb-2">환자 정보 입력</h1>
          <p className="text-sm text-slate-400">홍채 분석 전 환자의 기본 정보를 입력해주세요.</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-5">
          {/* 이름 + 나이 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                환자 이름 <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="홍길동"
                className="w-full px-4 py-3 rounded-xl text-sm border border-white/10 outline-none focus:border-white/30 transition-colors"
                style={{ background: "#0d1525", color: "#e2e8f0" }}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                나이 <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="만 나이"
                className="w-full px-4 py-3 rounded-xl text-sm border border-white/10 outline-none focus:border-white/30 transition-colors"
                style={{ background: "#0d1525", color: "#e2e8f0" }}
              />
            </div>
          </div>

          {/* 성별 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              성별 <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <div className="flex gap-3">
              {(["남", "여", "기타"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium border transition-all"
                  style={{
                    background: gender === g ? "var(--accent)" : "#0d1525",
                    color: gender === g ? "#080d1a" : "#94a3b8",
                    borderColor: gender === g ? "var(--accent)" : "rgba(255,255,255,0.1)",
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* 복용 중인 약 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">복용 중인 약</label>
            <textarea
              value={medications}
              onChange={(e) => setMedications(e.target.value)}
              placeholder="예: 아스피린 100mg, 메트포르민 500mg (없으면 비워두세요)"
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm border border-white/10 outline-none focus:border-white/30 transition-colors resize-none"
              style={{ background: "#0d1525", color: "#e2e8f0" }}
            />
          </div>

          {/* 과거 수술 이력 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">수술 이력</label>
            <textarea
              value={surgicalHistory}
              onChange={(e) => setSurgicalHistory(e.target.value)}
              placeholder="예: 2018년 충수돌기 절제술, 2020년 무릎 관절경 수술 (없으면 비워두세요)"
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm border border-white/10 outline-none focus:border-white/30 transition-colors resize-none"
              style={{ background: "#0d1525", color: "#e2e8f0" }}
            />
          </div>

          {/* 과거 병력 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">과거 병력</label>
            <textarea
              value={medicalHistory}
              onChange={(e) => setMedicalHistory(e.target.value)}
              placeholder="예: 고혈압, 2형 당뇨, 갑상선 기능 저하증 (없으면 비워두세요)"
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm border border-white/10 outline-none focus:border-white/30 transition-colors resize-none"
              style={{ background: "#0d1525", color: "#e2e8f0" }}
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl text-xs text-red-300 bg-red-900/30 border border-red-500/30">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-4 rounded-full font-semibold text-base transition-all hover:scale-[1.02] mt-2"
            style={{ background: "var(--accent)", color: "#080d1a" }}
          >
            홍채 촬영으로 이동 →
          </button>
        </form>
      </div>
    </main>
  );
}
