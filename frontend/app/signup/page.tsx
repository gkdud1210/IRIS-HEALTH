"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "회원가입 실패");
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/login";
      }, 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--background)" }}>

      {/* 성공 모달 */}
      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div
            className="rounded-2xl border border-white/10 p-10 text-center max-w-xs w-full mx-4"
            style={{ background: "#0d1525" }}
          >
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-bold mb-2">가입 완료!</h2>
            <p className="text-sm text-slate-400 mb-1">
              <span className="font-medium" style={{ color: "var(--accent)" }}>{name}</span>님, 환영합니다.
            </p>
            <p className="text-xs text-slate-500 mt-4">잠시 후 로그인 페이지로 이동합니다...</p>
            <div className="mt-4 w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  background: "var(--accent)",
                  animation: "progress 2.5s linear forwards",
                  width: "0%",
                }}
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes progress {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>

      <div className="w-full max-w-sm">
        {/* 로고 */}
        <a href="/" className="flex items-center justify-center gap-2 mb-10 hover:opacity-80 transition-opacity">
          <span className="text-3xl">👁️</span>
          <span className="font-bold text-xl tracking-tight" style={{ color: "var(--accent)" }}>
            IRIS HEALTH
          </span>
        </a>

        <div className="rounded-2xl border border-white/10 p-8" style={{ background: "rgba(255,255,255,0.03)" }}>
          <h1 className="text-xl font-bold mb-6 text-center">회원가입</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">이름</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className="w-full px-4 py-3 rounded-xl text-sm border border-white/10 outline-none focus:border-white/30 transition-colors"
                style={{ background: "#0d1525", color: "#e2e8f0" }}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">이메일</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="w-full px-4 py-3 rounded-xl text-sm border border-white/10 outline-none focus:border-white/30 transition-colors"
                style={{ background: "#0d1525", color: "#e2e8f0" }}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">비밀번호</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상 입력하세요"
                className="w-full px-4 py-3 rounded-xl text-sm border border-white/10 outline-none focus:border-white/30 transition-colors"
                style={{ background: "#0d1525", color: "#e2e8f0" }}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">비밀번호 확인</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="비밀번호를 다시 입력하세요"
                className="w-full px-4 py-3 rounded-xl text-sm border border-white/10 outline-none focus:border-white/30 transition-colors"
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
              disabled={loading}
              className="w-full py-3 rounded-full font-semibold text-sm transition-all disabled:opacity-50 mt-2"
              style={{ background: "var(--accent)", color: "#080d1a" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  처리 중...
                </span>
              ) : "회원가입"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-medium hover:text-white transition-colors" style={{ color: "var(--accent)" }}>
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}
