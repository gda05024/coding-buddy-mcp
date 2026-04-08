# Coding Buddy v2 테스트 케이스

아무 프로젝트에서 **새 세션**을 열고 테스트합니다.
각 테스트 후 `/clear`로 초기화하고 다음 테스트를 진행하세요.

---

## 0. 연결 확인

```
/mcp
```
- [ ] coding-buddy가 목록에 보인다
- [ ] 도구 5개: analyze_task, cost_reference, session_health, optimize_prompt, setup_project

---

## A. 구체성 강제 (Instructions 규칙 1)

모호한 요청 시 도구를 호출하지 않고 되물어야 합니다.

### A-1. 모호한 버그 요청 (한국어)
```
버그 찾아줘
```
- [ ] Glob/Grep/Read 등 도구를 호출하지 않는다
- [ ] 파일 경로 또는 증상을 되묻는다

### A-2. 모호한 버그 요청 (영어)
```
find bugs in this project
```
- [ ] 도구를 호출하지 않는다
- [ ] which file / what symptoms 를 되묻는다

### A-3. 모호한 리팩토링
```
코드 리팩토링 해줘
```
- [ ] 어떤 파일/범위인지 되묻는다

### A-4. 모호한 테스트 요청
```
테스트 작성해줘
```
- [ ] 어떤 파일/함수인지 되묻는다

### A-5. 모호한 에러 보고
```
에러가 나
```
- [ ] 에러 메시지와 파일을 물어본다

### A-6. 모호한 코드 리뷰
```
코드 리뷰 해줘
```
- [ ] 어떤 파일/PR/범위인지 되묻는다

### A-7. 모호한 설명 요청
```
이 코드 설명해줘
```
- [ ] 어떤 파일/함수인지 되묻는다

### A-8. 구체적 요청 → 바로 실행
```
package.json의 dependencies 보여줘
```
- [ ] 되묻지 않고 바로 파일을 읽는다

### A-9. 구체적 버그 요청 → 바로 실행
```
src/index.ts의 main 함수에서 에러 핸들링이 빠져있어. 확인해줘
```
- [ ] 되묻지 않고 해당 파일을 읽는다

### A-10. 에러 메시지 포함 → 바로 실행
```
TypeError: Cannot read property of undefined 에러가 LoginForm.tsx에서 나와
```
- [ ] 되묻지 않고 해당 파일을 찾아서 읽는다

---

## B. 모델 추천 — analyze_task 도구 호출 (Instructions 규칙 2)

### B-1. 단순 작업 → Haiku 추천
```
README.md에서 오타 수정해줘. recieve를 receive로
```
- [ ] analyze_task 도구를 호출한다
- [ ] complexity: "simple"
- [ ] recommended_model: "haiku"

### B-2. 중간 작업 → Sonnet 추천
```
src/components/LoginForm.tsx에 비밀번호 유효성 검사 추가해줘
```
- [ ] analyze_task 도구를 호출한다
- [ ] complexity: "medium"
- [ ] recommended_model: "sonnet"

### B-3. 복잡한 작업 → Opus + Plan Mode 추천
```
인증 시스템을 JWT에서 세션 기반으로 전체 마이그레이션 해줘
```
- [ ] analyze_task 도구를 호출한다
- [ ] complexity: "complex"
- [ ] recommended_model: "opus"
- [ ] approach: "plan_mode_first"
- [ ] Plan Mode를 먼저 쓰라고 제안한다

### B-4. 단순 작업 — 영어
```
rename the variable "usr" to "user" in src/utils/helpers.ts
```
- [ ] analyze_task 호출
- [ ] complexity: "simple", recommended_model: "haiku"

### B-5. 복잡한 작업 — 전체 리팩토링
```
src/ 전체 리팩토링해서 atomic design 패턴으로 바꿔줘
```
- [ ] analyze_task 호출
- [ ] complexity: "complex", recommended_model: "opus"

### B-6. 현재 모델과 다를 때 새 세션 안내
(Opus로 실행 중일 때 B-1 단순 작업 테스트)
- [ ] "새 세션에서 /model haiku 로 시작하세요" 류의 안내가 포함된다
- [ ] "세션 중 모델 변경은 캐시 브레이크" 경고가 포함된다

---

## C. 세션 관리 — session_health 도구 (Instructions 규칙 4)

### C-1. 주제 변경 감지
(아무 작업 하나 한 후)
```
그건 됐고, 이제 CI/CD 파이프라인 설정해줘
```
- [ ] 새 세션을 시작하라고 안내한다
- [ ] "한 세션 한 작업이 비용과 품질 모두 유리" 류의 안내

### C-2. 주제 변경 감지 — 영어
(아무 작업 하나 한 후)
```
OK that's done, now let's set up the database schema
```
- [ ] 새 세션 안내

### C-3. 작업 완료 후 정리 제안
(간단한 작업 완료 후)
- [ ] "/cost로 비용 확인" 안내가 나온다 (Instructions 규칙 3)
- [ ] /clear 또는 새 세션을 제안한다

### C-4. 명시적 세션 건강 체크
```
이 세션 상태 어때? 계속해도 될까?
```
- [ ] session_health 도구를 호출한다
- [ ] recommendation (continue/compact/new_session) 을 안내한다

---

## D. 캐시 보호 — Hook 차단 + cost_reference

### D-1. CLAUDE.md 수정 시도 → Hook 차단
```
CLAUDE.md에 새로운 규칙 추가해줘
```
- [ ] Claude가 Edit 도구로 CLAUDE.md를 수정하려 할 때 Hook이 차단한다 (exit 2)
- [ ] "캐시 브레이크" 경고 메시지가 표시된다

### D-2. 모델 변경 요청
```
모델을 haiku로 바꿔줘
```
- [ ] 세션 중 모델 변경이 캐시 브레이크임을 경고한다
- [ ] 새 세션에서 바꾸라고 안내한다

### D-3. 캐시 정보 질문
```
캐시가 뭐야? 어떻게 작동해?
```
- [ ] cost_reference 도구를 topic: "cache"로 호출한다
- [ ] 5분 TTL, 캐시 브레이커 목록 등을 설명한다

### D-4. MCP 변경 요청
```
MCP 서버 하나 더 추가해줘
```
- [ ] 세션 시작 전에 설정하라고 안내한다
- [ ] 캐시 브레이크 위험을 언급한다

---

## E. 프롬프트 최적화 — optimize_prompt 도구

### E-1. 모호한 프롬프트 최적화 요청
```
"이 프로젝트에서 버그 찾아줘"를 더 효율적으로 바꿔줘
```
- [ ] optimize_prompt 도구를 호출한다
- [ ] issues (파일 경로 없음 등) 을 식별한다
- [ ] 최적화된 프롬프트 예시를 제안한다
- [ ] 비용 차이 (vague vs specific) 를 보여준다

### E-2. 다른 모호한 프롬프트
```
"코드 개선해줘"를 비용 효율적으로 바꿔줘
```
- [ ] optimize_prompt 호출
- [ ] 파일 경로, 함수명 추가를 제안한다

---

## F. 비용 참조 — cost_reference 도구

### F-1. 전체 가격표 조회
```
Claude Code 모델별 가격이 어떻게 돼?
```
- [ ] cost_reference 도구를 호출한다 (topic: "pricing" 또는 "all")
- [ ] Haiku/Sonnet/Opus 단가를 보여준다

### F-2. 캐시 정보 조회
```
프롬프트 캐시가 어떻게 동작해?
```
- [ ] cost_reference(topic: "cache") 호출
- [ ] TTL, 캐시 브레이커 목록을 보여준다

### F-3. 압축 정보 조회
```
자동 압축이 뭐야?
```
- [ ] cost_reference(topic: "compaction") 호출
- [ ] 임계값, 생존 키워드, 파일 경로 보존을 설명한다

### F-4. thinking 토큰 비용
```
thinking 토큰이 비싸다고 들었는데 설명해줘
```
- [ ] cost_reference(topic: "thinking") 호출
- [ ] output 단가 과금, 단순 작업에서의 낭비를 설명한다

---

## G. 프로젝트 설정 — setup_project 도구

### G-1. CLAUDE.md 없는 프로젝트
(CLAUDE.md가 없는 프로젝트에서)
```
이 프로젝트 Claude Code에 최적화하고 싶어
```
- [ ] setup_project 도구를 호출한다
- [ ] CLAUDE.md 계층 구조를 제안한다
- [ ] CLAUDE.local.md 분리를 안내한다
- [ ] settings.json 권한 설정을 제안한다
- [ ] hooks 설정을 제안한다

### G-2. React 프로젝트 설정
```
이 React 프로젝트에 맞는 Claude Code 설정 만들어줘
```
- [ ] setup_project(project_type: "react") 호출
- [ ] pnpm 기반 명령어가 포함된다
- [ ] prettier 포맷팅 hook이 포함된다

### G-3. Rust 프로젝트 설정
```
이 Rust 프로젝트에 맞는 Claude Code 설정 만들어줘
```
- [ ] setup_project(project_type: "rust") 호출
- [ ] cargo 기반 명령어가 포함된다
- [ ] cargo fmt hook이 포함된다

### G-4. 팀 프로젝트 설정
```
우리 팀 5명이 쓸 수 있는 Claude Code 설정 만들어줘
```
- [ ] setup_project(team_size: 5) 호출
- [ ] CLAUDE.md (공유) + CLAUDE.local.md (개인) 분리를 안내한다
- [ ] .gitignore에 CLAUDE.local.md 추가를 안내한다

---

## H. 복합 시나리오

### H-1. 전체 프로젝트 탐색 요청 → 범위 축소 + 모델 추천
```
이 프로젝트 전체 구조 파악해줘
```
- [ ] 구체적인 디렉토리를 지정하라고 안내하거나
- [ ] analyze_task를 호출해서 복잡도를 판단한다
- [ ] Plan Mode를 먼저 제안할 수 있다

### H-2. 여러 독립 작업 → 병렬 처리 제안
```
다음 3가지를 해줘:
1. src/auth/ 디렉토리의 인증 흐름 분석
2. src/api/ 디렉토리의 에러 핸들링 패턴 분석
3. tests/ 디렉토리의 테스트 커버리지 확인
```
- [ ] 서브 에이전트로 병렬 처리하거나, 병렬 처리를 제안한다

### H-3. 완료 → /diff → /commit → /pr 파이프라인
(코드 수정 작업 완료 후)
```
이제 커밋하고 PR 올려줘
```
- [ ] /diff → /commit → /pr 파이프라인을 안내하거나 실행한다

### H-4. 긴 세션 후 비용 확인 유도
(여러 작업 후)
- [ ] "/cost로 비용 확인해보세요" 류의 안내가 나온다

---

## 결과 요약

| 카테고리 | 테스트 수 | 통과 | 실패 | 비고 |
|---------|----------|------|------|------|
| 0. 연결 확인 | 1 | /1 | /1 | |
| A. 구체성 강제 | 10 | /10 | /10 | |
| B. 모델 추천 | 6 | /6 | /6 | |
| C. 세션 관리 | 4 | /4 | /4 | |
| D. 캐시 보호 | 4 | /4 | /4 | |
| E. 프롬프트 최적화 | 2 | /2 | /2 | |
| F. 비용 참조 | 4 | /4 | /4 | |
| G. 프로젝트 설정 | 4 | /4 | /4 | |
| H. 복합 시나리오 | 4 | /4 | /4 | |
| **합계** | **39** | **/39** | **/39** | |
