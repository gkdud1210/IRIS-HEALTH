import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👁️</span>
          <span className="font-bold text-lg tracking-tight" style={{ color: "var(--accent)" }}>
            IRIS HEALTH
          </span>
        </div>
        <Link
          href="/scan"
          className="px-5 py-2 rounded-full text-sm font-medium transition-all"
          style={{ background: "var(--accent)", color: "#080d1a" }}
        >
          지금 분석하기
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center flex-1 text-center px-6 py-24">
        {/* Iris animation */}
        <div className="relative w-40 h-40 mb-12">
          <div
            className="absolute inset-0 rounded-full iris-ring"
            style={{ border: "2px solid var(--accent)", opacity: 0.4 }}
          />
          <div
            className="absolute inset-4 rounded-full iris-ring"
            style={{ border: "1px solid var(--accent)", opacity: 0.6, animationDelay: "0.4s" }}
          />
          <div
            className="absolute inset-8 rounded-full iris-ring"
            style={{ border: "1px solid var(--accent)", opacity: 0.8, animationDelay: "0.8s" }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="text-6xl">👁️</span>
          </div>
        </div>

        <div className="fade-in">
          <p className="text-sm font-medium mb-3 tracking-widest uppercase" style={{ color: "var(--accent)" }}>
            AI 홍채 분석 진단
          </p>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            10초로 읽는<br />
            <span style={{ color: "var(--accent)" }}>당신의 건강</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
            홍채 촬영 한 번으로 신경계, 장기, 독소 수치를 AI가 분석합니다.
            매일 모니터링으로 질병을 조기에 예측하세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/scan"
              className="px-8 py-4 rounded-full text-base font-semibold glow-pulse transition-all hover:scale-105"
              style={{ background: "var(--accent)", color: "#080d1a" }}
            >
              홍채 분석 시작
            </Link>
            <Link
              href="/dashboard"
              className="px-8 py-4 rounded-full text-base font-medium border border-white/20 hover:border-white/40 transition-all"
            >
              내 기록 보기
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 pb-20 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: "🏗️",
              title: "홍채 형태 분석",
              desc: "조직 밀도, 독소 누적, 신경 링 빈도를 수치화해 장기 건강 상태를 진단합니다.",
            },
            {
              icon: "🧠",
              title: "신경계 스코어",
              desc: "동공 반사 속도와 자율신경 균형을 분석해 뇌·신경 건강 지수를 산출합니다.",
            },
            {
              icon: "📈",
              title: "시계열 추적",
              desc: "매일 측정 이력을 저장하고 시간에 따른 건강 트렌드를 시각화합니다.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="p-6 rounded-2xl border border-white/10"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className="font-semibold text-base mb-2">{item.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-600 py-6 border-t border-white/10">
        본 서비스는 의료 진단을 대체하지 않습니다. 건강 이상 시 전문의와 상담하세요.
      </footer>
    </main>
  );
}
