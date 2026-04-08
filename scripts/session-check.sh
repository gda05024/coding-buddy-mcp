#!/bin/bash
# Coding Buddy — SessionStart 훅
# 오래된 세션을 resume한 경우 새 세션을 권장한다.

# 최근 세션 파일의 수정 시간을 확인
SESSION_DIR="$HOME/.claude/projects"
if [ ! -d "$SESSION_DIR" ]; then
  exit 0
fi

# 가장 최근 세션 파일 찾기
LATEST=$(find "$SESSION_DIR" -name "*.jsonl" -type f 2>/dev/null | xargs ls -t 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  exit 0
fi

# 파일 수정 시간과 현재 시간 차이 (초)
if [[ "$OSTYPE" == "darwin"* ]]; then
  FILE_TIME=$(stat -f %m "$LATEST" 2>/dev/null)
else
  FILE_TIME=$(stat -c %Y "$LATEST" 2>/dev/null)
fi

NOW=$(date +%s)
DIFF=$(( NOW - FILE_TIME ))
HOURS=$(( DIFF / 3600 ))

# 1시간 이상 된 세션이면 경고
if [ "$HOURS" -ge 1 ]; then
  echo "IMPORTANT: 이전 세션이 ${HOURS}시간 전 것입니다. 압축이 누적되어 맥락 손실과 비용 증가가 발생합니다. 새 세션 시작을 권장하세요."
fi

exit 0
