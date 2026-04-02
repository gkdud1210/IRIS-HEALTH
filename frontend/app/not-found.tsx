import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--background)" }}
    >
      <span className="text-6xl mb-6">👁️</span>
      <h1 className="text-3xl font-bold mb-3" style={{ color: "var(--accent)" }}>
        404
      </h1>
      <p className="text-slate-400 mb-8">페이지를 찾을 수 없습니다.</p>
      <Link
        href="/"
        className="px-6 py-3 rounded-full font-medium transition-all hover:scale-105"
        style={{ background: "var(--accent)", color: "#080d1a" }}
      >
        홈으로 돌아가기
      </Link>
    </main>
  );
}
