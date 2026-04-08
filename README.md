# coding-buddy-mcp

Claude Code의 내부 구조(프롬프트 캐싱, 자동 압축, 도구 실행, 비용 추적)를 분석하여 만든 **페어 프로그래밍 코딩버디 MCP 서버**입니다.

설치하면 Claude가 작업 전에 복잡도를 분석하고, 적합한 모델을 추천하고, 비용을 최적화합니다.

## 설치

`~/.mcp.json` 또는 프로젝트 `.mcp.json`에 추가:

```json
{
  "mcpServers": {
    "coding-buddy": {
      "type": "stdio",
      "command": "npx",
      "args": ["coding-buddy-mcp"]
    }
  }
}
```

새 세션을 시작하면 자동으로 활성화됩니다.

### 선택: 캐시 보호 Hook 설치

CLAUDE.md를 세션 중간에 수정하면 캐시가 깨져서 비용이 10배 증가합니다. 이를 자동 차단하려면 `~/.claude/settings.json`에 추가:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit",
        "hooks": [{
          "type": "command",
          "command": "FILE=$(cat | python3 -c \"import sys,json; print(json.load(sys.stdin).get('file_path',''))\" 2>/dev/null); echo $FILE | grep -qiE 'CLAUDE\\.md$' && echo '⚠️ CLAUDE.md 수정은 캐시 브레이크를 유발합니다. 세션 시작 전에 수정하세요.' && exit 2 || exit 0"
        }]
      }
    ]
  }
}
```

## 아키텍처

코딩버디는 3개 레이어로 설계되어 있습니다. 각 레이어가 자기 역할에 집중합니다.

```
┌─────────────────────────────────────────────┐
│          MCP Instructions (4줄)             │
│  구체화 → analyze_task → 작업 → /cost 안내   │
│  매 턴 ~50 토큰만 차지                       │
└──────────────────┬──────────────────────────┘
                   │ Claude가 판단해서 호출
                   ▼
┌─────────────────────────────────────────────┐
│          MCP Tools (5개, 온디맨드)            │
│  analyze_task ──→ 복잡도/모델/비용 추정       │
│  cost_reference ──→ 가격표/캐시/팁 조회       │
│  session_health ──→ 세션 상태 진단            │
│  optimize_prompt ──→ 프롬프트 최적화 제안      │
│  setup_project ──→ 프로젝트 설정 생성         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│          Hooks (차단 전용, 선택 설치)         │
│  PreToolUse:Edit(CLAUDE.md) → exit 2 차단   │
└─────────────────────────────────────────────┘
```

### 왜 이 구조인가?

| 레이어 | 역할 | 특성 |
|--------|------|------|
| MCP Instructions | 행동 규칙 (항상 적용) | 매 턴 system prompt에 포함. **짧을수록 좋다** (토큰 비용) |
| MCP Tools | 지능적 분석 (온디맨드) | Claude가 필요할 때만 호출. 풍부한 응답 가능 |
| Hooks | 경량 차단 (자동 트리거) | 셸 명령 기반. exit 2로 위험한 행위를 실제로 차단 |

Instructions에 모든 규칙을 넣으면 매 턴 수백 토큰이 낭비됩니다.  
Hook에 모든 로직을 넣으면 컨텍스트 없이 정적 텍스트만 주입되어 부정확합니다.  
**도구에 지능을 집중**하고, Instructions는 "도구를 언제 호출하라"만 알려주는 것이 최적입니다.

## 어떻게 동작하나요?

### Before (코딩버디 없이)

```
유저: "이 프로젝트에서 버그 찾아줘"
Claude: glob_search → read_file × 5 → grep_search × 3 → 분석
        (4턴, 10+ 도구 호출, $1-5 비용)
```

### After (코딩버디 있을 때)

```
유저: "이 프로젝트에서 버그 찾아줘"
Claude: "어떤 파일에서 어떤 증상이 나오나요?"

유저: "src/auth/login.ts에서 세션 만료가 안 돼"
Claude: [analyze_task 호출] → "이 작업은 Sonnet이 적합합니다 ($15/$75)"
        → read_file → 분석 → 수정
        (2턴, 2 도구 호출, $0.10-0.30 비용)
```

## MCP 도구 (5개)

### `analyze_task`

작업 시작 전 복잡도를 분석하고 최적 모델 + 접근법 + 비용을 추정합니다.

```json
// 입력
{ "task": "JWT에서 세션 기반으로 인증 마이그레이션" }

// 출력
{
  "complexity": "complex",
  "recommended_model": "opus",
  "model_price": "$15/$75 per 1M",
  "estimated_cost": "$2.00-$10.00",
  "approach": "plan_mode_first",
  "tips": ["Plan Mode에서 먼저 계획을 세우면 불필요한 탐색을 줄일 수 있습니다"],
  "switch_note": "새 세션에서 /model opus 로 시작하세요. 세션 중 모델 변경은 캐시 브레이크."
}
```

### `cost_reference`

주제별 비용 정보를 조회합니다: `pricing`, `cache`, `compaction`, `thinking`, `all`

```json
// 입력
{ "topic": "cache" }

// 출력
{
  "cache": {
    "prompt_ttl": "300초 (5분) — Anthropic 서버 캐시",
    "completion_ttl": "30초 — 동일 요청 로컬 캐시",
    "breakers": ["모델 변경", "CLAUDE.md 수정", "MCP 도구 변경"],
    "tip": "5분 이상 자리비움 → 캐시 만료 → 첫 요청 비용 증가"
  }
}
```

### `session_health`

세션 상태를 진단하고 계속/압축/새 세션을 추천합니다.

```json
// 입력
{ "message_count": 25, "minutes_since_start": 40, "topic_changed": true }

// 출력
{
  "recommendation": "new_session",
  "action": "새 세션 시작 추천",
  "warnings": [
    "주제가 바뀌었습니다. 새 세션이 비용과 품질 모두 유리합니다.",
    "25개 메시지 누적. 매 턴 전체 대화가 전송되어 비용이 증가 중."
  ]
}
```

### `optimize_prompt`

모호한 프롬프트를 분석하고 최적화된 버전을 제안합니다.

```json
// 입력
{ "user_prompt": "이 프로젝트에서 버그 찾아줘" }

// 출력
{
  "issues": ["파일 경로 없음 → 탐색 도구 5~10회 예상", "범위 불명확"],
  "estimated_cost": {
    "vague": "$1.00-$5.00 (4+턴, 10+ 도구 호출)",
    "specific": "$0.10-$0.30 (1-2턴, 1-2 도구 호출)"
  },
  "example": {
    "before": "버그 찾아줘",
    "after": "src/routes/auth.ts의 login 함수에서 세션 만료 처리가 안 됨."
  }
}
```

### `setup_project`

프로젝트에 맞는 CLAUDE.md 구조, 권한 설정, hooks를 생성합니다.

```json
// 입력
{ "project_type": "react", "has_claude_md": false, "team_size": 3 }

// 출력
{
  "claude_md": {
    "structure": [
      "project/CLAUDE.md — 프로젝트 전체 규칙",
      "project/CLAUDE.local.md — 개인 환경 (gitignored)",
      "project/src/CLAUDE.md — src 하위 작업 시 추가 컨텍스트"
    ],
    "template": "# Project\n\n## Structure\n...",
    "tip": ".gitignore에 CLAUDE.local.md 추가"
  },
  "settings": {
    "permissions": { "allow": ["Read", "Edit", "Glob", "Grep", "Bash(pnpm *)"] },
    "hooks": { "..." }
  },
  "cost_tips": [
    "CLAUDE.md는 세션 시작 전에 수정 (세션 중 수정 = 캐시 브레이크)",
    "필요한 MCP만 활성화 (각 도구 정의가 매 턴 토큰 차지)"
  ]
}
```

## 설계 원칙 — 37개 액션아이템

Claude Code 내부 코드를 분석한 두 편의 글에서 추출한 최적화 규칙입니다.

### 비용 최적화 (분석 글 1)

| # | 규칙 | 구현 |
|---|------|------|
| 1 | 작업 복잡도에 맞는 모델 선택 | `analyze_task` 도구 |
| 2 | 캐시 적극 활용 (cache_read 10x 저렴) | `cost_reference` + Hook 차단 |
| 3 | output 토큰 줄이기 (5x 비쌈) | Instructions (간결한 응답) |
| 4 | Haiku를 적재적소에 쓰기 | `analyze_task` 복잡도 분석 |
| 5 | 5분 이상 자리비움 주의 | `session_health` 캐시 진단 |
| 6 | 세션 중 모델 변경 금지 | `analyze_task` switch_note |
| 7 | CLAUDE.md 세션 중 수정 금지 | Hook: exit 2 차단 |
| 8 | 툴 목록 변경 금지 | `cost_reference` cache 항목 |
| 9 | 작업 잘게 쪼개기 | Instructions (주제 변경 → 새 세션) |
| 10 | todo/next/pending 키워드 | Instructions 행동 규칙 |
| 11 | 파일 경로 명시 | `optimize_prompt` 제안 |
| 12 | 오래된 세션 재사용 금지 | `session_health` 진단 |
| 13 | /compact 수동 사용 | `session_health` 추천 |
| 14 | /clear 컨텍스트 초기화 | Instructions (작업 완료 후) |
| 15 | 파일 필요한 부분만 읽기 | Instructions 행동 규칙 |
| 16 | CLAUDE.md 컨텍스트 위임 | `setup_project` 템플릿 |
| 17 | 모호한 질문 → 도구 폭발 방지 | Instructions + `optimize_prompt` |
| 18 | /cost 실시간 모니터링 | Instructions (작업 완료 후 안내) |
| 19 | thinking 토큰 위험성 | `analyze_task` tips + `cost_reference` |
| 20 | 네트워크 불안정 시 주의 | `cost_reference` 재시도 항목 |

### 생산성 최적화 (분석 글 2)

| # | 규칙 | 구현 |
|---|------|------|
| 21 | CLAUDE.md 계층적 설계 | `setup_project` structure |
| 22 | CLAUDE.md에 넣어야 할 것 | `setup_project` template |
| 23 | CLAUDE.local.md 분리 | `setup_project` local_template |
| 24 | Agent 병렬 작업 위임 | Instructions 행동 규칙 |
| 25 | 도구 출력 크기 제한 | `optimize_prompt` tips |
| 26 | 권한 모드 최적화 | `setup_project` permissions |
| 27 | settings.json 자동 허용 | `setup_project` settings |
| 28 | Hooks 자동화 | `setup_project` hooks |
| 29 | 한 세션 = 한 작업 | Instructions + `session_health` |
| 30 | --resume 활용 | `session_health` tips |
| 31 | 세션 fork | `session_health` tips |
| 32 | /diff → /commit → /pr | Instructions 행동 규칙 |
| 33 | MCP 타임아웃 인식 | `cost_reference` cache 항목 |
| 34 | MCP 세션 전에 세팅 | `cost_reference` breakers |
| 35 | 필요한 MCP만 켜기 | `setup_project` cost_tips |
| 36 | Plan Mode 활용 | `analyze_task` approach |
| 37 | 모델 자연스럽게 추천 | `analyze_task` recommended_model |

## 배경

이 프로젝트는 Claude Code의 오픈소스 구현체인 [claw-code](https://github.com/gda05024/claw-code)의 Rust 소스코드를 분석하여 다음 모듈들의 동작 원리를 파악한 결과물입니다:

| 모듈 | 역할 | 핵심 인사이트 |
|------|------|---------------|
| `usage.rs` | 비용 추적 | output이 input보다 5배 비쌈, 모델 선택이 비용의 90% 결정 |
| `prompt_cache.rs` | 프롬프트 캐싱 | 5분 TTL, 캐시 브레이크 감지, cache_read가 10배 저렴 |
| `compact.rs` | 자동 압축 | todo/next/pending 키워드 보존, 파일 경로 최대 8개 보존 |
| `providers/mod.rs` | 토큰 추정 | bytes ÷ 4, 매 요청마다 messages+system+tools+tool_choice 전송 |
| `types.rs` | 사고 토큰 | thinking 토큰이 output 단가로 청구, 별도 추적 없음 |
| `anthropic.rs` | 재시도 | 최대 2회 재시도, 타임아웃 시 이중 과금 가능 |
| `prompt.rs` | 시스템 프롬프트 | CLAUDE.md 계층 탐색, 동적/정적 경계 |
| `conversation.rs` | 대화 루프 | 도구 순차 실행, 모호한 질문 = 도구 폭발 |
| `permission_enforcer.rs` | 권한 | 5단계 모드, settings.json 자동 허용 |
| `hooks.rs` | 훅 | pre/post 도구 실행, 환경변수, 종료코드 제어 |
| `session.rs` | 세션 | JSONL 저장, 256KB 로테이션, fork 지원 |

## 라이선스

MIT
