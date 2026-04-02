#!/bin/bash
# IRIS HEALTH 개발 서버 실행

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 IRIS HEALTH 서버 시작..."

# 백엔드
echo "📡 FastAPI 백엔드 시작 (port 8000)..."
cd "$ROOT_DIR/backend"
source venv/bin/activate
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# 프론트엔드
echo "🌐 Next.js 프론트엔드 시작 (port 3000)..."
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ 실행 완료!"
echo "   프론트엔드: http://localhost:3000  (Go Live 시 http://localhost:5501)"
echo "   백엔드 API: http://localhost:8000"
echo "   API 문서:   http://localhost:8000/docs"
echo ""
echo "종료하려면 Ctrl+C 를 누르세요."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '서버 종료'" EXIT
wait
