"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DemoPage() {
  const router = useRouter();

  useEffect(() => {
    localStorage.setItem("iris_user", JSON.stringify({ user_id: "guest", name: "게스트" }));
    router.replace("/patient");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
      <div className="flex flex-col items-center gap-4">
        <span className="text-5xl">👁️</span>
        <p className="text-slate-400 text-sm">잠시만 기다려주세요...</p>
      </div>
    </main>
  );
}
