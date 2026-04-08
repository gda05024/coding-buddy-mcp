# coding-buddy-mcp

Claude Code의 내부 구조(프롬프트 캐싱, 자동 압축, 도구 실행, 비용 추적)를 분석하여 만든 **페어 프로그래밍 코딩버디 MCP 서버**입니다.

설치하면 Claude의 행동 자체가 바뀝니다 — 모호한 요청에 되물어보고, 작업 복잡도에 맞는 모델을 추천하고, 캐시를 보호하고, 비용을 최적화합니다.

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

## 어떻게 동작하나요?

MCP의 **Server Instructions**가 Claude 시스템 프롬프트에 자동 주입됩니다. Claude가 코딩버디의 37개 규칙을 따르게 되면서 행동이 바뀝니다.

### Before (코딩버디 없이)

```
유저: "이 프로젝트에서 버그 찾아줘"
Claude: glob_search → read_file × 5 → grep_search × 3 → 분석
        (4턴, 10+ 도구 호출, 느리고 비쌈)
```

### After (코딩버디 있을 때)

```
유저: "이 프로젝트에서 버그 찾아줘"
Claude: "어떤 파일에서 어떤 증상이 나오나요? 
        구체적인 경로와 증상을 알려주시면 빠르게 찾을 수 있습니다."
유저: "src/auth/login.ts에서 세션 만료가 안 돼"
Claude: read_file → 분석 → 수정
        (2턴, 1 도구 호출, 빠르고 저렴)
```

## 코딩버디가 하는 일 (37개 액션아이템)

Claude Code 내부 코드를 분석한 두 편의 글에서 추출한 최적화 규칙입니다.

### 1. 구체성 강제 — 도구 폭발 방지
- 파일 경로 없는 요청 → "어떤 파일인지 알려주세요" 되묻기
- 함수명/라인 없는 코드 작업 → 범위 확인
- 모호한 질문이 4+턴 × 10+ 도구 호출을 유발하는 것을 방지

### 2. 모델 자동 추천
작업 시작 시 `analyze_task` 도구를 호출하여 복잡도를 분석하고 적합한 모델을 추천합니다.

| 복잡도 | 모델 | 단가 (input/output per 1M) | 적합한 작업 |
|--------|------|--------------------------|-------------|
| Simple | Haiku | $1 / $5 | 오타, 이름변경, 포맷, 간단 조회 |
| Medium | Sonnet | $15 / $75 | 기능 구현, 버그 수정, 테스트, 코드 리뷰 |
| Complex | Opus | $15 / $75 | 아키텍처, 마이그레이션, 대규모 리팩토링 |

### 3. 세션 관리
- 한 세션 = 한 작업 원칙
- 대화 길어지면 → `/compact` 제안
- 작업 완료 → `/clear` 또는 새 세션 제안
- `todo:`, `next:`, `pending:` 키워드로 압축 후 맥락 보존
- 파일 경로 명시로 압축 생존율 향상

### 4. 캐시 보호 (비용 10배 절감의 핵심)
Anthropic 서버 캐시가 살아있으면 input 비용이 10분의 1로 줄어듭니다 ($15 → $1.5/1M).

코딩버디는 캐시를 깨는 행위 **전에** 경고합니다:
- 세션 중 모델 변경 → "캐시가 깨집니다. 새 세션에서 바꾸세요"
- 세션 중 CLAUDE.md 수정 → "세션 시작 전에 수정하세요"
- 세션 중 MCP 변경 → "세션 시작 전에 세팅하세요"
- 5분+ 자리 비움 후 복귀 → "캐시 만료됐을 수 있습니다"

### 5. Output 효율화
- output 토큰은 input보다 5배 비쌈 ($75 vs $15)
- 간결한 답변 유도
- 파일 전체가 아닌 필요한 부분만 읽기

### 6. 생산성 최적화
- 복잡한 작업 → Plan Mode 먼저 제안
- 독립적 하위 작업 → 서브 에이전트 병렬 실행
- 코드 변경 후 → `/diff` → `/commit` → `/pr` 파이프라인 안내
- CLAUDE.md 없으면 → 계층적 구조로 생성 제안
- Extended thinking 비용 경고 (단순 작업에 불필요한 사고 토큰 방지)

## MCP 도구

### `analyze_task`
작업 복잡도를 분석하고 최적 모델 + 접근 전략을 추천합니다.

```
입력: { task: "JWT에서 세션 기반으로 인증 마이그레이션" }
출력: {
  complexity: "complex",
  model: { model: "opus", reason_ko: "복잡한 추론이 필요합니다..." },
  approach: ["Plan Mode first: 먼저 영향받는 파일을 파악..."],
  warnings: ["복잡한 작업은 Plan Mode에서 먼저 계획을..."],
  tips: [...]
}
```

### `setup_project`
프로젝트 설정을 분석하고 Claude Code 최적화 방안을 종합 추천합니다.
- CLAUDE.md 계층적 구조 제안
- CLAUDE.local.md 분리 안내
- 권한 모드 최적화
- settings.json 자동 허용 설정
- Hooks 자동화 (포맷팅, 위험 명령 차단)
- MCP 서버 최적화

### `cost_reference`
Claude Code 모델별 단가표, 토큰 비율, 캐시 설정, 비용 최적화 팁을 반환합니다.

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
