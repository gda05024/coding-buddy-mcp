#!/bin/bash
# Coding Buddy — 모델 추천 + 복잡 작업 Plan Mode 제안

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(d.get('message', d.get('prompt', d.get('content', d.get('text', '')))))
" 2>/dev/null)

[ -z "$PROMPT" ] && exit 0

LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

# 복잡도 판단
COMPLEXITY="medium"
MODEL="Sonnet (\$15/\$75)"
CMD="/model sonnet"

if echo "$LOWER" | grep -qiE '오타|typo|rename|이름.*변경|format|포맷|간단|simple|주석|import|복사|quick'; then
  COMPLEXITY="simple"
  MODEL="Haiku (\$1/\$5)"
  CMD="/model haiku"
elif echo "$LOWER" | grep -qiE 'migrat|마이그레이션|architect|아키텍처|전체.*리팩|redesign|rewrite|스키마|schema|from scratch|전체 구조|시스템.*설계|전체.*변경|overhaul'; then
  COMPLEXITY="complex"
  MODEL="Opus (\$15/\$75)"
  CMD="/model opus"
fi

if [ "$COMPLEXITY" = "complex" ]; then
  echo "IMPORTANT: 응답에 반드시 다음 2가지를 포함하세요. 첫째: 💡 모델 추천: ${MODEL}. 현재 모델이 다르면 새 세션에서 ${CMD} 을 안내. 둘째: 🗺️ 이 작업은 복잡합니다. Plan Mode에서 먼저 계획을 세운 후 실행하는 것을 권장합니다."
else
  echo "IMPORTANT: 응답 첫 줄에 반드시 포함 → 💡 모델 추천: ${MODEL}. 현재 모델이 다르면 새 세션에서 ${CMD} 을 안내하세요."
fi
exit 0
