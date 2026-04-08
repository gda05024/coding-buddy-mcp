#!/bin/bash
# Coding Buddy — CLAUDE.md/settings.json 세션 중 수정 차단
# preToolUse:Edit|Write 에서 실행
# exit 2 = 차단, exit 0 = 허용

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(d.get('file_path', d.get('path', d.get('input',{}).get('file_path',''))))
" 2>/dev/null)

if echo "$FILE_PATH" | grep -qiE 'CLAUDE\.md$|CLAUDE\.local\.md$'; then
  echo "⚠️ [Coding Buddy] CLAUDE.md 수정은 캐시 브레이크를 유발합니다. 세션 시작 전에 수정하세요. 지금 수정하면 캐시가 깨져서 이후 모든 요청의 input 비용이 10배 증가합니다."
  exit 2
fi

if echo "$FILE_PATH" | grep -qiE '\.claude/settings\.json$'; then
  echo "⚠️ [Coding Buddy] settings.json 수정은 캐시 브레이크를 유발할 수 있습니다. 세션 시작 전에 수정하세요."
  exit 2
fi

exit 0
