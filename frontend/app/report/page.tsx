"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import IrisMapOverlay from "./IrisMapOverlay";

interface AiAnalysis {
  overall_impression?: string;
  color_analysis?: string;
  texture_analysis?: string;
  notable_findings?: string[];
  zone_observations?: {
    pupil_border?: string;
    ciliary_zone?: string;
    iris_rim?: string;
  };
  health_signals?: {
    nervous_system?: string;
    digestive_system?: string;
    circulation?: string;
  };
  recommendations?: string[];
  confidence?: string;
  disclaimer?: string;
  error?: string;
}

interface ScanResult {
  id: number;
  iris_detected: boolean;
  detection_method: string;
  eye_side: string;
  total_score: number;
  structural_score: number;
  neurological_score: number;
  kinetic_score: number;
  details: {
    structural: { score: number; tissue_density: number; toxin_index: number; nerve_ring_count: number };
    neurological: { score: number; pupil_ratio: number; symmetry: number; focus_index: number };
    kinetic: { score: number; tracking_accuracy: number; fiber_continuity: number; anti_saccade_rate: number };
  };
  ai_analysis: AiAnalysis;
  iris_crop: string;
  created_at: string;
}

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const [animated, setAnimated] = useState(0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;
  const color = score >= 75 ? "#00c8b4" : score >= 50 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 200);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
      <circle
        cx={size/2} cy={size/2} r={radius} fill="none"
        stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)" }}
      />
    </svg>
  );
}

function ScoreCard({ label, score, items, icon }: {
  label: string; score: number;
  items: { label: string; value: number | string }[];
  icon: string;
}) {
  const color = score >= 75 ? "#00c8b4" : score >= 50 ? "#f59e0b" : "#ef4444";
  const status = score >= 75 ? "양호" : score >= 50 ? "보통" : "주의";
  return (
    <div className="p-5 rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className="font-semibold text-sm">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{score}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ color, background: `${color}22` }}>{status}</span>
        </div>
      </div>
      <div className="w-full h-1.5 rounded-full mb-4" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full score-bar" style={{ width: `${score}%`, background: color }} />
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between text-xs">
            <span className="text-slate-400">{item.label}</span>
            <span className="text-slate-200 font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const map: Record<string, { label: string; color: string }> = {
    high:   { label: "신뢰도 높음", color: "#00c8b4" },
    medium: { label: "신뢰도 보통", color: "#f59e0b" },
    low:    { label: "신뢰도 낮음", color: "#ef4444" },
  };
  const c = map[confidence ?? "medium"] ?? map.medium;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ color: c.color, background: `${c.color}22` }}>
      {c.label}
    </span>
  );
}

function AiSection({ ai }: { ai: AiAnalysis }) {
  if (ai.error) {
    return (
      <div className="p-4 rounded-xl text-sm text-amber-300 bg-amber-900/20 border border-amber-500/20">
        ⚠️ AI 소견을 불러오지 못했습니다: {ai.error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <span className="font-semibold text-sm">Gemini AI 홍채 소견</span>
        </div>
        <ConfidenceBadge confidence={ai.confidence} />
      </div>

      {/* 종합 인상 */}
      {ai.overall_impression && (
        <div className="p-4 rounded-xl border-l-2" style={{ background: "rgba(0,200,180,0.06)", borderColor: "var(--accent)" }}>
          <p className="text-sm text-slate-200 leading-relaxed">{ai.overall_impression}</p>
        </div>
      )}

      {/* 색상 + 질감 분석 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ai.color_analysis && (
          <div className="p-4 rounded-xl border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
            <p className="text-xs text-slate-400 mb-1.5 uppercase tracking-widest">색상 분석</p>
            <p className="text-sm text-slate-300 leading-relaxed">{ai.color_analysis}</p>
          </div>
        )}
        {ai.texture_analysis && (
          <div className="p-4 rounded-xl border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
            <p className="text-xs text-slate-400 mb-1.5 uppercase tracking-widest">질감 분석</p>
            <p className="text-sm text-slate-300 leading-relaxed">{ai.texture_analysis}</p>
          </div>
        )}
      </div>

      {/* 주목할 소견 */}
      {ai.notable_findings && ai.notable_findings.length > 0 && (
        <div className="p-4 rounded-xl border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-widest">주목 소견</p>
          <ul className="space-y-1.5">
            {ai.notable_findings.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span style={{ color: "var(--accent)" }}>•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 영역별 관찰 */}
      {ai.zone_observations && Object.keys(ai.zone_observations).length > 0 && (
        <div className="p-4 rounded-xl border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
          <p className="text-xs text-slate-400 mb-3 uppercase tracking-widest">영역별 관찰</p>
          <div className="space-y-2">
            {ai.zone_observations.pupil_border && (
              <div>
                <span className="text-xs text-slate-500">동공 경계부 </span>
                <span className="text-sm text-slate-300">{ai.zone_observations.pupil_border}</span>
              </div>
            )}
            {ai.zone_observations.ciliary_zone && (
              <div>
                <span className="text-xs text-slate-500">섬모대 </span>
                <span className="text-sm text-slate-300">{ai.zone_observations.ciliary_zone}</span>
              </div>
            )}
            {ai.zone_observations.iris_rim && (
              <div>
                <span className="text-xs text-slate-500">홍채 외곽 </span>
                <span className="text-sm text-slate-300">{ai.zone_observations.iris_rim}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 건강 신호 */}
      {ai.health_signals && Object.keys(ai.health_signals).length > 0 && (
        <div className="p-4 rounded-xl border border-white/10" style={{ background: "rgba(255,255,255,0.02)" }}>
          <p className="text-xs text-slate-400 mb-3 uppercase tracking-widest">장기별 신호</p>
          <div className="space-y-3">
            {[
              { key: "nervous_system", label: "🧠 신경계", value: ai.health_signals.nervous_system },
              { key: "digestive_system", label: "🫀 소화계", value: ai.health_signals.digestive_system },
              { key: "circulation", label: "🩸 순환계", value: ai.health_signals.circulation },
            ].filter(item => item.value).map((item) => (
              <div key={item.key}>
                <p className="text-xs text-slate-500 mb-0.5">{item.label}</p>
                <p className="text-sm text-slate-300">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 권장사항 */}
      {ai.recommendations && ai.recommendations.length > 0 && (
        <div className="p-4 rounded-xl border border-white/10" style={{ background: "rgba(0,200,180,0.04)" }}>
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-widest">생활 습관 권장사항</p>
          <ul className="space-y-1.5">
            {ai.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className="text-teal-400 font-bold">{i + 1}.</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 면책 */}
      {ai.disclaimer && (
        <p className="text-xs text-slate-600">{ai.disclaimer}</p>
      )}
    </div>
  );
}

const EYE_LABEL: Record<string, string> = { left: "왼쪽 눈", right: "오른쪽 눈" };

function scoreStatus(score: number) {
  return score >= 75
    ? { label: "양호", emoji: "✅", desc: "전반적으로 건강한 홍채 패턴을 보입니다." }
    : score >= 50
    ? { label: "보통", emoji: "⚠️", desc: "일부 지표가 평균 이하입니다. 생활 습관을 점검해 보세요." }
    : { label: "주의 필요", emoji: "🔴", desc: "복수의 지표가 낮습니다. 전문의 상담을 권장합니다." };
}

function SingleEyeResult({ result }: { result: ScanResult }) {
  const { details } = result;
  const totalColor = result.total_score >= 75 ? "#00c8b4" : result.total_score >= 50 ? "#f59e0b" : "#ef4444";
  const status = scoreStatus(result.total_score);

  return (
    <div className="space-y-6">
      {!result.iris_detected && (
        <div className="p-4 rounded-xl text-sm text-amber-300 bg-amber-900/30 border border-amber-500/30">
          ⚠️ 홍채가 명확히 검출되지 않았습니다. 밝은 곳에서 가까이 재촬영하면 더 정확한 결과를 얻을 수 있습니다.
        </div>
      )}

      <div className="p-6 rounded-2xl border border-white/10 flex flex-col items-center text-center glow-pulse"
        style={{ background: "rgba(0,200,180,0.05)" }}>
        <p className="text-xs text-slate-400 mb-4 tracking-widest uppercase">
          {EYE_LABEL[result.eye_side]} · {new Date(result.created_at).toLocaleString("ko-KR")}
        </p>
        <div className="relative mb-4">
          <ScoreRing score={result.total_score} size={140} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold" style={{ color: totalColor }}>{result.total_score}</span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
        </div>
        <p className="text-lg font-semibold mb-1">{status.emoji} 종합 건강 지수 {status.label}</p>
        <p className="text-sm text-slate-400">{status.desc}</p>
      </div>

      {result.iris_crop && (
        <div className="p-4 rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">검출된 홍채</p>
          <IrisMapOverlay
            irisCrop={result.iris_crop}
            eyeSide={result.eye_side}
            detectionMethod={result.detection_method}
          />
        </div>
      )}

      <div className="p-5 rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
        <AiSection ai={result.ai_analysis ?? {}} />
      </div>

      <ScoreCard icon="🏗️" label="홍채 형태 점수" score={result.structural_score}
        items={[
          { label: "조직 밀도 지수", value: `${details.structural.tissue_density} / 100` },
          { label: "독소 누적 지표", value: `${details.structural.toxin_index} / 100` },
          { label: "신경 링 빈도", value: `${details.structural.nerve_ring_count}개` },
        ]}
      />
      <ScoreCard icon="🧠" label="신경 반응 점수" score={result.neurological_score}
        items={[
          { label: "동공/홍채 비율", value: details.neurological.pupil_ratio.toFixed(3) },
          { label: "좌우 대칭도", value: `${details.neurological.symmetry} / 100` },
          { label: "집중력 지수", value: `${details.neurological.focus_index} / 100` },
        ]}
      />
      <ScoreCard icon="⚡" label="안구 운동성 점수" score={result.kinetic_score}
        items={[
          { label: "추적 정확도", value: `${details.kinetic.tracking_accuracy}%` },
          { label: "섬유 연속성", value: `${details.kinetic.fiber_continuity} / 100` },
          { label: "항-사카드 성공률", value: `${details.kinetic.anti_saccade_rate}%` },
        ]}
      />
    </div>
  );
}

function DualEyeResult({ left, right }: { left: ScanResult; right: ScanResult }) {
  const avg = Math.round((left.total_score + right.total_score) / 2);
  const avgColor = avg >= 75 ? "#00c8b4" : avg >= 50 ? "#f59e0b" : "#ef4444";
  const status = scoreStatus(avg);

  return (
    <div className="space-y-6">
      {/* 양안 종합 */}
      <div className="p-5 rounded-2xl border border-white/10 glow-pulse" style={{ background: "rgba(0,200,180,0.05)" }}>
        <p className="text-xs text-slate-400 mb-4 text-center tracking-widest uppercase">양안 종합 분석</p>
        <div className="grid grid-cols-2 gap-4">
          {([left, right] as ScanResult[]).map((r) => {
            const color = r.total_score >= 75 ? "#00c8b4" : r.total_score >= 50 ? "#f59e0b" : "#ef4444";
            return (
              <div key={r.eye_side} className="flex flex-col items-center">
                <p className="text-xs text-slate-400 mb-2">{EYE_LABEL[r.eye_side]}</p>
                <div className="relative">
                  <ScoreRing score={r.total_score} size={100} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold" style={{ color }}>{r.total_score}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-white/10 text-center">
          <span className="text-2xl font-bold" style={{ color: avgColor }}>{avg}</span>
          <span className="text-xs text-slate-400 ml-1">/ 100 평균</span>
          <p className="text-sm text-slate-400 mt-1">{status.emoji} {status.desc}</p>
        </div>
      </div>

      {/* 홍채 이미지 + 표시도 나란히 */}
      {(left.iris_crop || right.iris_crop) && (
        <div className="grid grid-cols-2 gap-3">
          {([left, right] as ScanResult[]).map((r) => r.iris_crop && (
            <div key={r.eye_side} className="p-3 rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-xs text-slate-400 mb-2">{EYE_LABEL[r.eye_side]}</p>
              <IrisMapOverlay
                irisCrop={r.iris_crop}
                eyeSide={r.eye_side}
                detectionMethod={r.detection_method}
              />
            </div>
          ))}
        </div>
      )}

      {/* 지표 비교 테이블 */}
      <div className="p-5 rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-4">지표 비교</p>
        <div className="space-y-3">
          {[
            { label: "🏗️ 형태 점수", l: left.structural_score, r: right.structural_score },
            { label: "🧠 신경 점수", l: left.neurological_score, r: right.neurological_score },
            { label: "⚡ 운동 점수", l: left.kinetic_score, r: right.kinetic_score },
          ].map((item) => (
            <div key={item.label}>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>{item.label}</span>
                <span className="flex gap-4">
                  <span style={{ color: item.l >= 75 ? "#00c8b4" : item.l >= 50 ? "#f59e0b" : "#ef4444" }}>L {item.l}</span>
                  <span style={{ color: item.r >= 75 ? "#00c8b4" : item.r >= 50 ? "#f59e0b" : "#ef4444" }}>R {item.r}</span>
                </span>
              </div>
              <div className="relative h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="absolute left-0 top-0 h-full rounded-full opacity-60"
                  style={{ width: `${item.l}%`, background: item.l >= 75 ? "#00c8b4" : item.l >= 50 ? "#f59e0b" : "#ef4444" }} />
              </div>
              <div className="relative h-1.5 rounded-full mt-1" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="absolute left-0 top-0 h-full rounded-full opacity-40"
                  style={{ width: `${item.r}%`, background: item.r >= 75 ? "#00c8b4" : item.r >= 50 ? "#f59e0b" : "#ef4444" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 각 눈 AI 소견 */}
      {([left, right] as ScanResult[]).map((r) => (
        <div key={r.eye_side} className="p-5 rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
          <p className="text-xs font-semibold mb-3" style={{ color: "var(--accent)" }}>{EYE_LABEL[r.eye_side]} AI 소견</p>
          <AiSection ai={r.ai_analysis ?? {}} />
        </div>
      ))}
    </div>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const [results, setResults] = useState<Partial<Record<"left" | "right", ScanResult>> | null>(null);

  useEffect(() => {
    // 신규: iris_results (양안)
    const raw = sessionStorage.getItem("iris_results");
    if (raw) { setResults(JSON.parse(raw)); return; }
    // 구버전 호환: iris_result (단안)
    const old = sessionStorage.getItem("iris_result");
    if (old) {
      const r: ScanResult = JSON.parse(old);
      setResults({ [r.eye_side as "left" | "right"]: r });
      return;
    }
    router.push("/scan");
  }, [router]);

  if (!results) return null;

  const left = results.left;
  const right = results.right;
  const isBoth = left && right;

  return (
    <main className="min-h-screen" style={{ background: "var(--background)" }}>
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link href="/scan" className="text-sm text-slate-400 hover:text-white transition-colors">← 다시 촬영</Link>
        <span className="font-semibold" style={{ color: "var(--accent)" }}>분석 리포트</span>
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white transition-colors">기록 보기 →</Link>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8 fade-in">
        {isBoth
          ? <DualEyeResult left={left} right={right} />
          : <SingleEyeResult result={(left ?? right)!} />
        }
        <p className="text-xs text-center text-slate-600 py-6">
          본 결과는 AI 기반 참고 지표이며 의료 진단을 대체하지 않습니다.
        </p>
      </div>
    </main>
  );
}
