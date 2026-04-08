#!/bin/bash
# Coding Buddy — 모델 추천만 담당하는 경량 훅
# ~50 토큰/턴. 이전 buddy-hook.sh는 ~200 토큰/턴이었음.

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(d.get('message', d.get('prompt', d.get('content', d.get('text', '')))))
" 2>/dev/null)

[ -z "$PROMPT" ] && exit 0

LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

# 복잡도 판단
MODEL="Sonnet (\$15/\$75)"
CMD="/model sonnet"

if echo "$LOWER" | grep -qiE '오타|typo|rename|이름.*변경|format|포맷|간단|simple|주석|import|복사|quick'; then
  MODEL="Haiku (\$1/\$5)"
  CMD="/model haiku"
elif echo "$LOWER" | grep -qiE 'migrat|마이그레이션|architect|아키텍처|전체.*리팩|redesign|rewrite|스키마|schema|from scratch|전체 구조|시스템.*설계'; then
  MODEL="Opus (\$15/\$75)"
  CMD="/model opus"
fi

echo "IMPORTANT: 응답 첫 줄에 반드시 포함 → 💡 모델 추천: ${MODEL}. 현재 모델이 다르면 새 세션에서 ${CMD} 을 안내하세요."
exit 0
