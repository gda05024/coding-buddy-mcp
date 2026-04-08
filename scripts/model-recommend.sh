#!/bin/bash
# Coding Buddy — 프롬프트 분석 → 모든 강제 규칙을 여기서 처리
# 신뢰도 100%가 필요한 것만 훅에 넣는다.

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(d.get('message', d.get('prompt', d.get('content', d.get('text', '')))))
" 2>/dev/null)

[ -z "$PROMPT" ] && exit 0

LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')
HINTS=""

# =============================================
# 1. 모호한 요청 감지 → 되묻기 강제
# =============================================
HAS_PATH=false
echo "$PROMPT" | grep -qE '[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+\.[a-zA-Z]{1,5}' && HAS_PATH=true

VAGUE=false
if [ "$HAS_PATH" = false ]; then
  if echo "$LOWER" | grep -qiE '버그.*(찾|fix)|리팩토링|refactor|개선|improve|테스트.*작성|write.*test|에러가 나|error|코드.*리뷰|review|설명해|explain|분석해|analyz|CSS.*수정|스타일.*수정|성능.*개선|최적화|optimiz'; then
    VAGUE=true
  fi
fi

if [ "$VAGUE" = true ]; then
  HINTS="IMPORTANT: 이 요청은 구체적이지 않습니다. 도구를 호출하지 말고 구체적인 파일 경로와 증상/범위를 먼저 물어보세요. "
fi

# =============================================
# 2. 주제 변경 감지 → 새 세션 안내
# =============================================
if echo "$LOWER" | grep -qiE '그건 됐고|이제 다른|다음으로|다른 작업|이건 끝|넘어가|다음 할|switch to|move on|next task|다른 거 하자|이제.*쪽 작업'; then
  HINTS="${HINTS}IMPORTANT: 주제가 바뀌었습니다. 반드시 안내 → 새 작업이니 새 세션에서 시작하는 게 비용과 품질 모두 유리합니다. "
fi

# =============================================
# 3. 복잡도 분석 → 모델 추천
# =============================================
COMPLEXITY="medium"
MODEL="Sonnet (\$15/\$75)"
CMD="/model sonnet"

if echo "$LOWER" | grep -qiE '오타|typo|rename|이름.*변경|format|포맷|간단|simple|주석|import|복사|quick|삭제.*줄'; then
  COMPLEXITY="simple"
  MODEL="Haiku (\$1/\$5)"
  CMD="/model haiku"
elif echo "$LOWER" | grep -qiE 'migrat|마이그레이션|architect|아키텍처|전체.*리팩|redesign|rewrite|스키마|schema|from scratch|전체 구조|시스템.*설계|전체.*변경|overhaul'; then
  COMPLEXITY="complex"
  MODEL="Opus (\$15/\$75)"
  CMD="/model opus"
fi

# 모호하지 않고, 작업성 프롬프트일 때만 모델 추천
IS_TASK=false
if echo "$LOWER" | grep -qiE '해줘|해주세요|수정|추가|만들|삭제|변경|작성|구현|보여|봐줘|읽어|찾아|고쳐|바꿔|올려|fix|add|create|remove|update|write|implement|refactor|migrate|show|read|find|check|설정|분석|검사|확인|review|test|빌드|build|deploy|설명|explain'; then
  IS_TASK=true
fi

if [ "$VAGUE" = false ] && [ "$IS_TASK" = true ]; then
  HINTS="${HINTS}IMPORTANT: 응답 첫 줄에 반드시 포함 → 💡 모델 추천: ${MODEL}. 현재 모델이 다르면 새 세션에서 ${CMD} 을 안내하세요. "
fi

# =============================================
# 4. 복잡한 작업 → Plan Mode 제안
# =============================================
if [ "$COMPLEXITY" = "complex" ] && [ "$VAGUE" = false ]; then
  HINTS="${HINTS}IMPORTANT: 이 작업은 복잡합니다. 반드시 안내 → Plan Mode에서 먼저 계획을 세운 후 실행하는 것을 권장합니다. "
fi

# =============================================
# 5. 캐시 브레이크 감지
# =============================================
if echo "$LOWER" | grep -qiE 'claude\.md.*(수정|추가|변경|편집|만들|update|edit|modify|add|create)'; then
  HINTS="${HINTS}IMPORTANT: CLAUDE.md 수정은 캐시 브레이크를 유발합니다. 반드시 경고 → 세션 시작 전에 수정하세요. 지금 수정하면 이후 모든 요청 비용이 10배 증가합니다. "
fi

if echo "$LOWER" | grep -qiE '모델.*(바꿔|변경|전환|switch)|haiku로|sonnet으로|opus로|change.*model|switch.*model'; then
  HINTS="${HINTS}IMPORTANT: 세션 중 모델 변경은 캐시 브레이크(비용 10배)입니다. 반드시 안내 → 새 세션에서 모델을 바꾸세요. "
fi

if echo "$LOWER" | grep -qiE 'mcp.*(추가|삭제|켜|끄|설정|변경|add|remove|enable|disable)'; then
  HINTS="${HINTS}IMPORTANT: MCP 변경은 캐시 브레이크입니다. 안내 → MCP 설정은 세션 시작 전에 하세요. "
fi

# =============================================
# 6. 전체 프로젝트 탐색 → 범위 축소
# =============================================
if echo "$LOWER" | grep -qiE '전체 구조|프로젝트 전체|전체 파일|모든 파일|entire project|all files|whole project|전체.*파악|프로젝트.*설명'; then
  HINTS="${HINTS}IMPORTANT: 전체 프로젝트 탐색은 비용이 큽니다. 구체적인 디렉토리나 파일을 지정하도록 안내하세요. "
fi

# =============================================
# 출력 (매칭된 힌트만 출력 — 불필요한 토큰 없음)
# =============================================
[ -n "$HINTS" ] && echo "$HINTS"
exit 0
