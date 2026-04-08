#!/bin/bash
# Coding Buddy - UserPromptSubmit Hook
# 37개 액션아이템 중 강제성이 필요한 항목을 훅으로 실행한다.
# 매 유저 프롬프트마다 실행되어 Claude에게 리마인더를 주입한다.

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(d.get('message', d.get('prompt', d.get('content', d.get('text', '')))))
" 2>/dev/null)

if [ -z "$PROMPT" ]; then
  exit 0
fi

LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')
HINTS=""

# ==========================================================
# 1. 모호한 요청 감지 (도구 폭발 방지)
# ==========================================================
HAS_PATH=false
echo "$PROMPT" | grep -qE '[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+\.[a-zA-Z]{1,5}' && HAS_PATH=true
echo "$PROMPT" | grep -qE '\.[tj]sx?$|\.(rs|py|go|json|md|css|html|vue|svelte)' && HAS_PATH=true

VAGUE=false
if [ "$HAS_PATH" = false ]; then
  if echo "$LOWER" | grep -qiE '버그.*(찾|fix)|리팩토링|refactor|개선|improve|테스트.*작성|write.*test|에러가 나|error|코드.*리뷰|review|설명해|explain.*code|분석해|analyz'; then
    VAGUE=true
  fi
fi

if [ "$VAGUE" = true ]; then
  HINTS="${HINTS}IMPORTANT: 이 요청은 구체적이지 않습니다. 도구를 호출하지 말고 파일 경로와 증상을 먼저 물어보세요. 모호한 요청은 4+턴 10+도구호출로 비용이 낭비됩니다.\n"
fi

# ==========================================================
# 2. 주제 변경 감지 (세션 분리)
# ==========================================================
if echo "$LOWER" | grep -qiE '그건 됐고|이제 다른|다음으로|다른 작업|다른 거|이건 끝|이건 됐|넘어가|다음 할|다른 주제|그만하고|전환|switch to|move on|next task|different thing|change topic'; then
  HINTS="${HINTS}IMPORTANT: 주제가 바뀌는 것 같습니다. 반드시 이렇게 안내하세요: '새 작업이니 새 세션에서 시작하는 게 효율적입니다. 한 세션에 한 작업이 비용과 품질 모두 유리합니다.'\n"
fi

# ==========================================================
# 3. 작업 복잡도 분석 → 모델 추천
# ==========================================================
COMPLEXITY="medium"
if echo "$LOWER" | grep -qiE '오타|typo|rename|이름.*변경|format|포맷|간단|simple|삭제.*줄|주석|comment|import|복사|copy|move file|간단히|quick'; then
  COMPLEXITY="simple"
elif echo "$LOWER" | grep -qiE 'migrat|마이그레이션|architect|아키텍처|전체.*리팩|redesign|rewrite|스키마|schema|from scratch|전체 구조|시스템.*설계|데이터베이스|다시 만들|overhaul'; then
  COMPLEXITY="complex"
fi

case $COMPLEXITY in
  simple)
    MODEL_REC="Haiku (\$1/\$5 per 1M)"
    MODEL_CMD="/model haiku"
    ;;
  complex)
    MODEL_REC="Opus (\$15/\$75 per 1M)"
    MODEL_CMD="/model opus"
    ;;
  *)
    MODEL_REC="Sonnet (\$15/\$75 per 1M)"
    MODEL_CMD="/model sonnet"
    ;;
esac

if [ "$VAGUE" = false ]; then
  HINTS="${HINTS}IMPORTANT: 응답 첫 줄에 반드시 포함 → 💡 모델 추천: ${MODEL_REC}. 현재 모델이 다르면 새 세션에서 ${MODEL_CMD} 을 안내하세요.\n"
fi

# ==========================================================
# 4. 복잡한 작업 → Plan Mode 제안
# ==========================================================
if [ "$COMPLEXITY" = "complex" ]; then
  HINTS="${HINTS}IMPORTANT: 복잡한 작업입니다. 반드시 Plan Mode를 먼저 제안하세요: '먼저 Plan Mode에서 영향받는 파일을 파악한 후 실행하는 게 효율적입니다.'\n"
fi

# ==========================================================
# 5. CLAUDE.md 수정 감지 → 캐시 브레이크 경고
# ==========================================================
if echo "$LOWER" | grep -qiE 'claude\.md.*(수정|추가|변경|편집|update|edit|modify|add)|claude\.md.*rule|규칙.*claude'; then
  HINTS="${HINTS}IMPORTANT: CLAUDE.md 수정은 캐시 브레이크를 유발합니다. 반드시 경고하세요: '세션 시작 전에 CLAUDE.md를 수정하세요. 지금 수정하면 캐시가 깨져서 비용이 10배 올라갑니다.'\n"
fi

# ==========================================================
# 6. 모델 변경 요청 감지 → 캐시 브레이크 경고
# ==========================================================
if echo "$LOWER" | grep -qiE '모델.*(바꿔|변경|전환|switch)|haiku로|sonnet으로|opus로|change.*model|switch.*model'; then
  HINTS="${HINTS}IMPORTANT: 세션 중 모델 변경은 캐시 브레이크(비용 10배)를 유발합니다. 반드시 안내: '새 세션에서 모델을 바꾸세요. 세션 중간에 바꾸면 캐시가 깨집니다.'\n"
fi

# ==========================================================
# 7. MCP 변경 감지 → 캐시 브레이크 경고
# ==========================================================
if echo "$LOWER" | grep -qiE 'mcp.*(추가|삭제|켜|끄|설정|변경|add|remove|enable|disable)'; then
  HINTS="${HINTS}IMPORTANT: MCP 변경은 캐시 브레이크를 유발합니다. 안내: 'MCP 설정은 세션 시작 전에 하세요.'\n"
fi

# ==========================================================
# 8. 전체 프로젝트 탐색 요청 → 범위 축소 유도
# ==========================================================
if echo "$LOWER" | grep -qiE '전체 구조|프로젝트 전체|전체 파일|모든 파일|entire project|all files|whole project|전체.*파악|프로젝트.*설명'; then
  HINTS="${HINTS}IMPORTANT: 전체 프로젝트 탐색은 비용이 큽니다. 구체적인 디렉토리나 파일을 지정하도록 안내하세요.\n"
fi

# ==========================================================
# 출력
# ==========================================================
if [ -n "$HINTS" ]; then
  printf "$HINTS"
fi

exit 0
