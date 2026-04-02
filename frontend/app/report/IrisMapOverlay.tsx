"use client";

import { useState } from "react";

// ── 유틸 ─────────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutPath(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number): string {
  const span = ((a2 - a1) + 360) % 360;
  const large = span > 180 ? 1 : 0;
  const p1 = polar(cx, cy, r1, a1);
  const p2 = polar(cx, cy, r2, a1);
  const p3 = polar(cx, cy, r2, a2);
  const p4 = polar(cx, cy, r1, a2);
  return [
    `M${p1.x.toFixed(2)},${p1.y.toFixed(2)}`,
    `L${p2.x.toFixed(2)},${p2.y.toFixed(2)}`,
    `A${r2},${r2},0,${large},1,${p3.x.toFixed(2)},${p3.y.toFixed(2)}`,
    `L${p4.x.toFixed(2)},${p4.y.toFixed(2)}`,
    `A${r1},${r1},0,${large},0,${p1.x.toFixed(2)},${p1.y.toFixed(2)}Z`,
  ].join(" ");
}

// ── 데이터 ────────────────────────────────────────────────────────────────

const CX = 100, CY = 100, IRIS_R = 68;

// 동심원 존 (비율 × IRIS_R)
const ZONES = [
  { frac: 0.29, label: "동공" },
  { frac: 0.42, label: "위" },
  { frac: 0.57, label: "장" },
  { frac: 0.73, label: "장기" },
  { frac: 0.88, label: "근육" },
  { frac: 1.00, label: "림프" },
];
const ZR = ZONES.map((z) => z.frac * IRIS_R);

// 우안 장기 섹터 (a1→a2: 시계방향, 0°=12시)
const RIGHT_SECTORS = [
  { a1: 330, a2:  30, short: "뇌",   label: "뇌·정신·척추",     color: "#a855f7" },
  { a1:  30, a2:  60, short: "안면",  label: "안면·갑상선",      color: "#3b82f6" },
  { a1:  60, a2:  90, short: "목",   label: "목·어깨·팔",       color: "#0ea5e9" },
  { a1:  90, a2: 150, short: "간담",  label: "간·담낭 (우측)",    color: "#f59e0b" },
  { a1: 150, a2: 180, short: "소장",  label: "소장·충수",        color: "#84cc16" },
  { a1: 180, a2: 210, short: "골반",  label: "골반·직장·대장",    color: "#f472b6" },
  { a1: 210, a2: 240, short: "방광",  label: "방광·생식기",      color: "#ec4899" },
  { a1: 240, a2: 270, short: "신장",  label: "신장·부신 (우)",   color: "#ef4444" },
  { a1: 270, a2: 300, short: "흉부",  label: "흉부·심장 (우)",   color: "#fb923c" },
  { a1: 300, a2: 330, short: "폐",   label: "폐·기관지 (우)",   color: "#34d399" },
];

const LEFT_SECTORS = RIGHT_SECTORS.map((s) => {
  if (s.short === "간담") return { ...s, label: "비장·췌장 (좌)", short: "비췌" };
  if (s.short === "흉부") return { ...s, label: "흉부·심장❤️ (좌)", color: "#ef4444" };
  if (s.short === "신장") return { ...s, label: "신장·부신 (좌)" };
  if (s.short === "폐")   return { ...s, label: "폐·기관지 (좌)" };
  return s;
});

// 시계 숫자 위치
const CLOCK_NUMS = Array.from({ length: 12 }, (_, i) => ({
  num: i,
  deg: i * 30,
  pos: polar(CX, CY, IRIS_R + 9, i * 30),
}));

// ── 컴포넌트 ──────────────────────────────────────────────────────────────

interface Props {
  irisCrop: string;
  eyeSide: string;
  detectionMethod?: string;
}

export default function IrisMapOverlay({ irisCrop, eyeSide, detectionMethod }: Props) {
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(55);
  const [hovered, setHovered] = useState<string | null>(null);

  const sectors = eyeSide === "left" ? LEFT_SECTORS : RIGHT_SECTORS;
  const alpha = opacity / 100;
  const hoveredSector = sectors.find((s) => s.short === hovered);

  // 존 채우기용 링 쌍 (위~림프 4개 링)
  const zonePairs: [number, number][] = [
    [ZR[1], ZR[2]],
    [ZR[2], ZR[3]],
    [ZR[3], ZR[4]],
    [ZR[4], ZR[5]],
  ];

  return (
    <div className="w-full space-y-2">
      {/* 컨트롤 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVisible((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-full font-medium border transition-all"
            style={visible
              ? { color: "#00c8b4", background: "rgba(0,200,180,0.12)", borderColor: "rgba(0,200,180,0.35)" }
              : { color: "#94a3b8", background: "transparent", borderColor: "rgba(255,255,255,0.15)" }}
          >
            🗺️ 홍채 표시도 {visible ? "ON" : "OFF"}
          </button>
          {detectionMethod && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={
                detectionMethod === "mediapipe"
                  ? { color: "#00c8b4", background: "rgba(0,200,180,0.12)" }
                  : detectionMethod === "pupil"
                  ? { color: "#a78bfa", background: "rgba(167,139,250,0.12)" }
                  : { color: "#f59e0b", background: "rgba(245,158,11,0.12)" }
              }>
              {detectionMethod === "mediapipe" ? "MediaPipe ✓"
                : detectionMethod === "pupil" ? "동공 검출 ✓"
                : "HoughCircles"}
            </span>
          )}
        </div>
        {visible && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">투명도</span>
            <input type="range" min={15} max={85} value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-20 accent-teal-400" style={{ height: "4px" }} />
          </div>
        )}
      </div>

      {/* 이미지 + 오버레이 */}
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-[#0d1525]">

        {/* 홍채 이미지 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={irisCrop}
          alt="홍채"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* SVG 오버레이 */}
        {visible && (
          <svg
            viewBox="0 0 200 200"
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: "none" }}
          >
            {/* 섹터 채우기 + 방사선 */}
            {sectors.map((s) => {
              const isHov = hovered === s.short;
              // 섹터 중간각
              const span = ((s.a2 - s.a1) + 360) % 360;
              const mid = s.a1 + span / 2;

              return (
                <g key={s.short}>
                  {/* 존별 도넛 섹터 */}
                  {zonePairs.map(([r1, r2], zi) => (
                    <path
                      key={zi}
                      d={donutPath(CX, CY, r1, r2, s.a1, s.a2)}
                      fill={s.color}
                      fillOpacity={alpha * (isHov ? 0.75 : 0.45 - zi * 0.06)}
                      stroke="none"
                      style={{ pointerEvents: "all", cursor: "pointer" }}
                      onMouseEnter={() => setHovered(s.short)}
                      onMouseLeave={() => setHovered(null)}
                    />
                  ))}

                  {/* 섹터 경계 방사선 */}
                  {(() => {
                    const p1 = polar(CX, CY, ZR[0], s.a1);
                    const p2 = polar(CX, CY, ZR[5], s.a1);
                    return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />;
                  })()}

                  {/* 장기명 라벨 */}
                  {(() => {
                    const lp = polar(CX, CY, ZR[3] + 5, mid);
                    return (
                      <text
                        x={lp.x} y={lp.y}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize={isHov ? "5.5" : "4.2"} fontWeight={isHov ? "700" : "500"}
                        fill={isHov ? "#fff" : "rgba(255,255,255,0.9)"}
                        style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.9))" }}
                        transform={`rotate(${mid > 90 && mid < 270 ? mid + 180 : mid},${lp.x},${lp.y})`}
                      >
                        {s.short}
                      </text>
                    );
                  })()}
                </g>
              );
            })}

            {/* 동심원 경계 */}
            {ZR.map((r, i) => (
              <circle key={i} cx={CX} cy={CY} r={r} fill="none"
                stroke={i === 0 || i === ZR.length - 1 ? "rgba(0,200,180,0.6)" : "rgba(255,255,255,0.25)"}
                strokeWidth={i === 0 || i === ZR.length - 1 ? "0.8" : "0.4"}
                strokeDasharray={i > 0 && i < ZR.length - 1 ? "2,1.5" : "none"}
              />
            ))}

            {/* 존 이름 (오른쪽) */}
            {ZONES.slice(1).map((z, i) => {
              const r = ((ZR[i + 1] + ZR[i]) / 2);
              const lp = polar(CX, CY, r, 95); // 약 3시 방향
              return (
                <text key={i} x={lp.x + 1} y={lp.y}
                  textAnchor="start" dominantBaseline="middle"
                  fontSize="2.8" fill="rgba(255,255,255,0.4)">
                  {z.label}
                </text>
              );
            })}

            {/* 시계 숫자 */}
            {CLOCK_NUMS.map(({ num, pos }) => (
              <text key={num} x={pos.x} y={pos.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize="4" fontWeight="600" fill="rgba(255,255,255,0.65)"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,1))" }}
              >
                {num}
              </text>
            ))}
          </svg>
        )}
      </div>

      {/* 호버 툴팁 */}
      {visible && hoveredSector && (
        <div className="px-4 py-2 rounded-xl text-sm font-semibold text-center"
          style={{ background: `${hoveredSector.color}22`, border: `1px solid ${hoveredSector.color}55`, color: hoveredSector.color }}>
          {hoveredSector.label}
        </div>
      )}

      {/* 범례 */}
      {visible && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {sectors.map((s) => (
            <button key={s.short}
              className="flex items-center gap-1 transition-opacity"
              style={{ opacity: hovered && hovered !== s.short ? 0.4 : 1 }}
              onMouseEnter={() => setHovered(s.short)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color, display: "inline-block" }} />
              <span className="text-xs text-slate-400">{s.short}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
