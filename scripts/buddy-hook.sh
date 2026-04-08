#!/bin/bash
# Coding Buddy - UserPromptSubmit Hook
# 유저 프롬프트를 받아서 분석 후 Claude에게 리마인더를 주입한다.

# stdin에서 JSON 읽기
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message',''))" 2>/dev/null)

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
  cat << EOF
[Coding Buddy] 이 요청은 구체적이지 않습니다.
작업 전에 반드시 파일 경로와 증상을 먼저 물어보세요.
모호한 요청에 바로 도구를 호출하면 4+턴, 10+도구 호출 = 비용 낭비입니다.
EOF
else
  cat << EOF
[Coding Buddy] 모델 추천: ${MODEL_REC}
현재 모델과 다르다면 새 세션에서 ${MODEL_CMD} 로 시작하는 것을 추천하세요.
세션 중 모델 변경은 캐시 브레이크(비용 10배)를 유발합니다.
EOF
fi

exit 0
