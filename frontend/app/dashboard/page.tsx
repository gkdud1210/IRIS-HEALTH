"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface HistoryRecord {
  id: number;
  eye_side: string;
  total_score: number;
  structural_score: number;
  neurological_score: number;
  kinetic_score: number;
  created_at: string;
}

function TrendBar({ records }: { records: HistoryRecord[] }) {
  if (records.length < 2) return null;
  const recent = records.slice(0, 7).reverse();
  const max = 100;

  return (
    <div
      className="p-5 rounded-2xl border border-white/10"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <p className="text-xs text-slate-400 uppercase tracking-widest mb-4">최근 7회 종합 점수 추이</p>
      <div className="flex items-end gap-2 h-20">
        {recent.map((r, i) => (
          <div key={r.id} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: `${(r.total_score / max) * 72}px`,
                background: i === recent.length - 1 ? "var(--accent)" : "rgba(0,200,180,0.4)",
              }}
            />
            <span className="text-xs text-slate-500">
              {new Date(r.created_at).getMonth() + 1}/{new Date(r.created_at).getDate()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function scoreColor(score: number) {
  return score >= 75 ? "#00c8b4" : score >= 50 ? "#f59e0b" : "#ef4444";
}

export default function DashboardPage() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API}/api/history/guest`);
      if (!res.ok) throw new Error("불러오기 실패");
      const data = await res.json();
      setRecords(data);
    } catch {
      setError("서버 연결 오류. 백엔드가 실행 중인지 확인하세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const deleteRecord = async (id: number) => {
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      await fetch(`${API}/api/history/${id}`, { method: "DELETE" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError("삭제 실패");
    }
  };

  const avg = (key: keyof HistoryRecord) => {
    if (records.length === 0) return 0;
    return Math.round(
      records.reduce((sum, r) => sum + (r[key] as number), 0) / records.length
    );
  };

  return (
    <main className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors">
          ← 홈
        </Link>
        <span className="font-semibold" style={{ color: "var(--accent)" }}>내 기록</span>
        <Link
          href="/scan"
          className="px-4 py-1.5 rounded-full text-xs font-medium"
          style={{ background: "var(--accent)", color: "#080d1a" }}
        >
          새 측정
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6 fade-in">
        {error && (
          <div className="p-4 rounded-xl text-sm text-red-300 bg-red-900/30 border border-red-500/30">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">👁️</p>
            <p className="text-slate-400 mb-6">아직 측정 기록이 없습니다.</p>
            <Link
              href="/scan"
              className="px-6 py-3 rounded-full font-medium"
              style={{ background: "var(--accent)", color: "#080d1a" }}
            >
              첫 번째 분석 시작
            </Link>
          </div>
        ) : (
          <>
            {/* 평균 요약 */}
            <div
              className="p-5 rounded-2xl border border-white/10"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-4">
                총 {records.length}회 측정 · 평균
              </p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "종합", value: avg("total_score") },
                  { label: "형태", value: avg("structural_score") },
                  { label: "신경", value: avg("neurological_score") },
                  { label: "운동", value: avg("kinetic_score") },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <p className="text-2xl font-bold" style={{ color: scoreColor(item.value) }}>
                      {item.value}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 추이 차트 */}
            <TrendBar records={records} />

            {/* 기록 목록 */}
            <div
              className="rounded-2xl border border-white/10 overflow-hidden"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <p className="text-xs text-slate-400 uppercase tracking-widest px-5 py-3 border-b border-white/10">
                측정 이력
              </p>
              <div className="divide-y divide-white/5">
                {records.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-white/5 transition-colors">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">
                        {new Date(r.created_at).toLocaleString("ko-KR")} ·{" "}
                        {r.eye_side === "left" ? "왼쪽" : "오른쪽"} 눈
                      </p>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-xl font-bold"
                          style={{ color: scoreColor(r.total_score) }}
                        >
                          {r.total_score}
                        </span>
                        <div className="flex gap-1.5 text-xs text-slate-500">
                          <span>형태 {r.structural_score}</span>
                          <span>·</span>
                          <span>신경 {r.neurological_score}</span>
                          <span>·</span>
                          <span>운동 {r.kinetic_score}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteRecord(r.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors text-xs"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
