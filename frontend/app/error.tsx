"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--background)" }}
    >
      <span className="text-6xl mb-6">⚠️</span>
      <h1 className="text-2xl font-bold mb-3">오류가 발생했습니다</h1>
      <p className="text-slate-400 mb-8 max-w-sm">
        페이지를 불러오는 중 문제가 생겼습니다. 다시 시도하거나 홈으로 돌아가세요.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-6 py-3 rounded-full font-medium border border-white/20 hover:border-white/40 transition-all"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="px-6 py-3 rounded-full font-medium transition-all hover:scale-105"
          style={{ background: "var(--accent)", color: "#080d1a" }}
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}
