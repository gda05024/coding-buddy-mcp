#!/bin/bash
# Coding Buddy — Haiku LLM으로 프롬프트 분석
# claude CLI 대신 Anthropic API 직접 호출. 비용 ~$0.001/턴.

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(d.get('message', d.get('prompt', d.get('content', d.get('text', '')))))
" 2>/dev/null)

[ -z "$PROMPT" ] && exit 0

# Anthropic API 키 확인
API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$API_KEY" ]; then
  # API 키 없으면 키워드 매칭 폴백
  exec /Users/mildang/coding-buddy-mcp/scripts/model-recommend-fallback.sh <<< "$INPUT"
fi

# Haiku API 직접 호출
ESCAPED_PROMPT=$(echo "$PROMPT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null)

RESPONSE=$(curl -s --max-time 5 https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d "{
    \"model\": \"claude-haiku-4-5-20251001\",
    \"max_tokens\": 300,
    \"messages\": [{
      \"role\": \"user\",
      \"content\": \"당신은 Claude Code 비용 최적화 분석기입니다. 유저 프롬프트를 분석하여 JSON만 출력하세요.\\n\\n분석 항목:\\n- is_task: 코딩/개발 작업인가 (true/false)\\n- is_vague: 파일 경로/함수명/에러 없는 모호한 요청인가 (true/false)\\n- complexity: simple/medium/complex\\n- topic_change: 주제 전환인가 (true/false)\\n- has_multiple_tasks: 독립 작업 3개+ 나열 (true/false)\\n- is_test_or_build: 테스트/빌드 실행 (true/false)\\n- is_commit_or_pr: 커밋/PR/배포 (true/false)\\n- is_implementation: 기능 구현/추가 (true/false)\\n- is_code_review: 코드 리뷰 (true/false)\\n- is_large_scale: 대규모 일괄 변경 (true/false)\\n- is_claude_md_edit: CLAUDE.md 수정 (true/false)\\n- is_model_change: 모델 변경 요청 (true/false)\\n- is_mcp_change: MCP 변경 (true/false)\\n- is_whole_project: 전체 프로젝트 탐색 (true/false)\\n- has_file_path: 파일 경로 포함 (true/false)\\n\\n유저 프롬프트: ${ESCAPED_PROMPT}\"
    }]
  }" 2>/dev/null)

# API 실패 시 키워드 폴백
if [ -z "$RESPONSE" ] || echo "$RESPONSE" | grep -q '"error"'; then
  exec /Users/mildang/coding-buddy-mcp/scripts/model-recommend-fallback.sh <<< "$INPUT"
fi

# JSON 파싱
JSON=$(echo "$RESPONSE" | python3 -c "
import sys,json,re
resp = json.load(sys.stdin)
text = resp.get('content',[{}])[0].get('text','{}')
match = re.search(r'\{[^}]+\}', text, re.DOTALL)
if match:
    try:
        d = json.loads(match.group())
        print(json.dumps(d))
    except: print('{}')
else: print('{}')
" 2>/dev/null)

[ -z "$JSON" ] || [ "$JSON" = "{}" ] && exec /Users/mildang/coding-buddy-mcp/scripts/model-recommend-fallback.sh <<< "$INPUT"

# 값 추출
val() {
  echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('$1','')).lower())" 2>/dev/null
}

IS_TASK=$(val is_task)
IS_VAGUE=$(val is_vague)
COMPLEXITY=$(val complexity)

# 비작업 → 출력 없음
[ "$IS_TASK" != "true" ] && exit 0

HINTS=""

# 모델 결정
MODEL="Sonnet (\$15/\$75)"
CMD="/model sonnet"
case "$COMPLEXITY" in
  simple) MODEL="Haiku (\$1/\$5)"; CMD="/model haiku" ;;
  complex) MODEL="Opus (\$15/\$75)"; CMD="/model opus" ;;
esac

# 1. 모호한 요청
[ "$(val is_vague)" = "true" ] && HINTS="IMPORTANT: 이 요청은 구체적이지 않습니다. 도구를 호출하지 말고 구체적인 파일 경로와 증상/범위를 먼저 물어보세요. "

# 2. 주제 변경
[ "$(val topic_change)" = "true" ] && HINTS="${HINTS}IMPORTANT: 주제가 바뀌었습니다. 반드시 안내 → 새 작업이니 새 세션에서 시작하는 게 비용과 품질 모두 유리합니다. "

# 3. 모델 추천
if [ "$IS_VAGUE" != "true" ]; then
  if [ "$COMPLEXITY" = "simple" ]; then
    HINTS="${HINTS}IMPORTANT: 응답 첫 줄에 반드시 포함 → 💡 모델 추천: ${MODEL}. Haiku는 thinking 토큰이 없어 output 비용이 크게 절감됩니다. 현재 모델이 다르면 새 세션에서 ${CMD} 을 안내하세요. "
  else
    HINTS="${HINTS}IMPORTANT: 응답 첫 줄에 반드시 포함 → 💡 모델 추천: ${MODEL}. 현재 모델이 다르면 새 세션에서 ${CMD} 을 안내하세요. "
  fi
  HINTS="${HINTS}IMPORTANT: 파일을 언급할 때 전체 경로를 사용하세요. 미완성 작업은 'todo:', 'next:', 'pending:' 키워드를 포함하세요. "
fi

# 4. Plan Mode
[ "$COMPLEXITY" = "complex" ] && [ "$IS_VAGUE" != "true" ] && HINTS="${HINTS}IMPORTANT: 복잡한 작업입니다. Plan Mode에서 먼저 계획을 세운 후 실행하는 것을 권장합니다. "

# 5. 캐시 브레이크
[ "$(val is_claude_md_edit)" = "true" ] && HINTS="${HINTS}IMPORTANT: CLAUDE.md 수정은 캐시 브레이크입니다. 세션 시작 전에 수정하세요. "
[ "$(val is_model_change)" = "true" ] && HINTS="${HINTS}IMPORTANT: 세션 중 모델 변경은 캐시 브레이크(비용 10배)입니다. 새 세션에서 바꾸세요. "
[ "$(val is_mcp_change)" = "true" ] && HINTS="${HINTS}IMPORTANT: MCP 변경은 캐시 브레이크입니다. 세션 시작 전에 설정하세요. "

# 6-12. 추가 가이드
[ "$(val is_whole_project)" = "true" ] && HINTS="${HINTS}IMPORTANT: 전체 프로젝트 탐색은 비용이 큽니다. 구체적인 디렉토리를 지정하도록 안내하세요. "
[ "$(val has_multiple_tasks)" = "true" ] && HINTS="${HINTS}IMPORTANT: 독립 작업이 여러 개 있습니다. 서브에이전트로 병렬 처리하면 빠릅니다. "
[ "$(val is_test_or_build)" = "true" ] && HINTS="${HINTS}IMPORTANT: 테스트/빌드 출력은 16KB에서 잘립니다. '| tail -50' 을 쓰세요. "
[ "$(val is_commit_or_pr)" = "true" ] && HINTS="${HINTS}IMPORTANT: /diff → /commit → /pr 파이프라인을 안내하세요. "
[ "$(val is_implementation)" = "true" ] && [ "$(val has_file_path)" = "true" ] && HINTS="${HINTS}IMPORTANT: 검증 루프 안내 → 구현→lint→테스트→새 테스트→재테스트. TDD를 제안하세요. "
[ "$(val is_code_review)" = "true" ] && [ "$(val has_file_path)" = "true" ] && HINTS="${HINTS}IMPORTANT: 서브에이전트로 독립 리뷰를 제안하세요. "
[ "$(val is_large_scale)" = "true" ] && HINTS="${HINTS}IMPORTANT: 대규모 변경은 점진적으로 → 1단계씩 /diff → /commit 체크포인트. "

[ -n "$HINTS" ] && echo "$HINTS"
exit 0
