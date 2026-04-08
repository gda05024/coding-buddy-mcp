#!/bin/bash
# Coding Buddy - UserPromptSubmit Hook
# 유저 프롬프트를 받아서 분석 후 Claude에게 리마인더를 주입한다.

# stdin에서 JSON 읽기
INPUT=$(cat)

# 디버그: 입력 로그
echo "$INPUT" >> /tmp/coding-buddy-debug.log
echo "---" >> /tmp/coding-buddy-debug.log

# message 또는 prompt 필드 시도
PROMPT=$(echo "$INPUT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(d.get('message', d.get('prompt', d.get('content', d.get('text', '')))))
" 2>/dev/null)

if [ -z "$PROMPT" ]; then
  exit 0
fi

# 모호한 요청 감지
VAGUE=false
LOWER_PROMPT=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

# 파일 경로가 없고 (/가 포함된 .확장자 패턴)
if ! echo "$PROMPT" | grep -qE '[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+\.[a-zA-Z]{1,5}'; then
  # 모호한 키워드만 있으면
  if echo "$LOWER_PROMPT" | grep -qiE '버그.*(찾|fix)|리팩토링|refactor|개선|improve|테스트.*작성|write.*test|에러가|error'; then
    VAGUE=true
  fi
fi

# 작업 복잡도 분석
COMPLEXITY="medium"
if echo "$LOWER_PROMPT" | grep -qiE '오타|typo|rename|이름.*변경|format|포맷|간단|simple|삭제.*줄|주석|import'; then
  COMPLEXITY="simple"
elif echo "$LOWER_PROMPT" | grep -qiE 'migrat|마이그레이션|architect|아키텍처|전체.*리팩|redesign|rewrite|스키마|schema|from scratch'; then
  COMPLEXITY="complex"
fi

# 모델 추천 결정
case $COMPLEXITY in
  simple)
    MODEL_REC="Haiku (\$1/\$5 per 1M tokens)"
    MODEL_CMD="/model haiku"
    ;;
  complex)
    MODEL_REC="Opus (\$15/\$75 per 1M tokens). Plan Mode를 먼저 사용하세요"
    MODEL_CMD="/model opus"
    ;;
  *)
    MODEL_REC="Sonnet (\$15/\$75 per 1M tokens)"
    MODEL_CMD="/model sonnet"
    ;;
esac

# 결과 출력 — Claude에게 주입되는 메시지
if [ "$VAGUE" = true ]; then
  echo "IMPORTANT: 이 요청은 구체적이지 않습니다. 도구를 호출하지 말고 파일 경로와 증상을 먼저 물어보세요."
else
  echo "IMPORTANT: 응답 첫 줄에 반드시 다음을 포함하세요 → 💡 모델 추천: ${MODEL_REC}. 현재 모델이 다르면 새 세션에서 ${MODEL_CMD} 을 안내하세요. 그 다음 작업을 진행하세요."
fi

exit 0
