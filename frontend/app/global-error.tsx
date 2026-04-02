"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#080d1a",
          color: "#e2e8f0",
          fontFamily: "Arial, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <span style={{ fontSize: "3rem", marginBottom: "16px" }}>⚠️</span>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "12px" }}>
          심각한 오류가 발생했습니다
        </h1>
        <p style={{ color: "#94a3b8", marginBottom: "24px" }}>
          페이지를 로드할 수 없습니다. 새로고침을 시도하세요.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "12px 24px",
            borderRadius: "9999px",
            background: "#00c8b4",
            color: "#080d1a",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
