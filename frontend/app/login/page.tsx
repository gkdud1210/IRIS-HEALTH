"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "로그인 실패");
      localStorage.setItem("iris_user", JSON.stringify(data));
      router.push("/patient");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "var(--background)" }}>
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <a href="/" className="flex items-center justify-center gap-2 mb-10 hover:opacity-80 transition-opacity">
          <span className="text-3xl">👁️</span>
          <span className="font-bold text-xl tracking-tight" style={{ color: "var(--accent)" }}>
            IRIS HEALTH
          </span>
        </a>

        <div className="rounded-2xl border border-white/10 p-8" style={{ background: "rgba(255,255,255,0.03)" }}>
          <h1 className="text-xl font-bold mb-6 text-center">로그인</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="비밀번호를 입력하세요"
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
                  로그인 중...
                </span>
              ) : "로그인"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          계정이 없으신가요?{" "}
          <Link href="/signup" className="font-medium hover:text-white transition-colors" style={{ color: "var(--accent)" }}>
            회원가입
          </Link>
        </p>
      </div>
    </main>
  );
}
