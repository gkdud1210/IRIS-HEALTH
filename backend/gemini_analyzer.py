"""
Claude Vision을 이용한 홍채 AI 분석
- 홍채 이미지를 Claude에게 전송
- 구조화된 JSON 소견 반환
"""
import os
import json
import base64
import re

_api_key = os.environ.get("ANTHROPIC_API_KEY", "")

try:
    import anthropic
    client = anthropic.Anthropic(api_key=_api_key) if _api_key else None
except ImportError:
    client = None

PROMPT = """당신은 홍채학(Iridology) 전문 AI 분석 시스템입니다.
첨부된 눈 이미지를 분석하여 홍채의 색상, 질감, 패턴, 구조적 특징을 관찰하고
아래 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트는 절대 포함하지 마세요.

{
  "overall_impression": "홍채 전반적 인상 한 문장 (한국어)",
  "color_analysis": "홍채 색상 및 색조 분포 분석 (한국어, 2-3문장)",
  "texture_analysis": "섬유 질감, 밀도, 패턴 분석 (한국어, 2-3문장)",
  "notable_findings": ["주목할 소견 1 (한국어)", "주목할 소견 2", "주목할 소견 3"],
  "zone_observations": {
    "pupil_border": "동공 경계부 관찰 소견 (한국어)",
    "ciliary_zone": "섬모대 관찰 소견 (한국어)",
    "iris_rim": "홍채 외곽 관찰 소견 (한국어)"
  },
  "health_signals": {
    "nervous_system": "신경계 관련 홍채 신호 (한국어)",
    "digestive_system": "소화계 관련 홍채 신호 (한국어)",
    "circulation": "순환계 관련 홍채 신호 (한국어)"
  },
  "recommendations": ["생활 습관 권장사항 1 (한국어)", "권장사항 2", "권장사항 3"],
  "confidence": "분석 신뢰도: high/medium/low",
  "disclaimer": "본 분석은 참고용이며 의료 진단을 대체하지 않습니다."
}"""


def analyze_with_gemini(image_data: str) -> dict:
    """
    홍채 이미지를 Claude Vision으로 분석.
    image_data: Base64 data URL 또는 순수 Base64 문자열
    """
    if client is None:
        return {
            "overall_impression": "AI 분석 비활성화 (ANTHROPIC_API_KEY 미설정)",
            "disclaimer": "본 분석은 참고용이며 의료 진단을 대체하지 않습니다.",
        }

    # Base64 추출
    if "," in image_data:
        header, b64 = image_data.split(",", 1)
        mime = header.split(":")[1].split(";")[0]
    else:
        b64 = image_data
        mime = "image/jpeg"

    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime,
                            "data": b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": PROMPT,
                    },
                ],
            }
        ],
    )

    text = response.content[0].text.strip()

    # JSON 블록 추출 (```json ... ``` 감싸진 경우 처리)
    json_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if json_match:
        text = json_match.group(1)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "overall_impression": "홍채 이미지를 분석했습니다.",
            "color_analysis": text[:200] if text else "분석 결과를 가져오지 못했습니다.",
            "texture_analysis": "",
            "notable_findings": [],
            "zone_observations": {},
            "health_signals": {},
            "recommendations": [],
            "confidence": "low",
            "disclaimer": "본 분석은 참고용이며 의료 진단을 대체하지 않습니다.",
        }
