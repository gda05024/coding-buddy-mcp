# Coding Buddy 테스트 — mildang-frontend

mildang-frontend 모노레포(Next.js + pnpm + Turbo)에서 실행합니다.
새 세션에서 `cd ~/mildang-frontend && claude` 후 테스트합니다.
각 테스트 후 `/clear`로 초기화.

---

## 0. 연결 확인
```
/mcp
```
- [ ] coding-buddy 보임
- [ ] 도구 5개 확인

---

## A. 구체성 강제

### A-1. 모호한 버그
```
버그 찾아줘
```
- [ ] 도구 호출 없이 되묻는다

### A-2. 모호한 리팩토링
```
코드 리팩토링 해줘
```
- [ ] 어떤 앱/파일인지 되묻는다

### A-3. 모호한 스타일 수정
```
CSS 수정해줘
```
- [ ] 어떤 컴포넌트인지 되묻는다

### A-4. 구체적 요청 → 바로 실행
```
apps/student-web/src/pages/index.tsx 보여줘
```
- [ ] 되묻지 않고 바로 읽는다
- [ ] 💡 모델 추천 나온다

### A-5. 구체적 에러
```
apps/student-web/src/screens/LoginScreen/LoginForm.tsx에서 비밀번호 유효성 검사가 required만 있어. 최소 8자 조건 추가해줘
```
- [ ] 바로 파일을 읽고 작업 시작
- [ ] 💡 모델 추천 나온다

---

## B. 모델 추천

### B-1. 단순 — 오타 수정
```
apps/student-web/src/components/Header.tsx에서 오타 수정해줘
```
- [ ] 💡 Haiku 추천

### B-2. 중간 — 컴포넌트 기능 추가
```
apps/student-web/src/screens/LoginScreen/LoginForm.tsx에 비밀번호 복잡성 검사 추가해줘
```
- [ ] 💡 Sonnet 추천

### B-3. 복잡 — 인증 마이그레이션
```
student-web의 인증 시스템을 JWT에서 세션 기반으로 전체 마이그레이션 해줘
```
- [ ] 💡 Opus 추천
- [ ] Plan Mode 제안

### B-4. 복잡 — 전체 리팩토링
```
apps/mildang-ui 전체 리팩토링해서 Radix UI 기반으로 바꿔줘
```
- [ ] 💡 Opus 추천
- [ ] Plan Mode 제안

### B-5. 단순 — import 추가
```
apps/student-web/src/screens/LoginScreen/LoginForm.tsx에 useState import 추가해줘
```
- [ ] 💡 Haiku 추천

---

## C. 세션 관리

### C-1. 주제 변경
(LoginForm 작업 후)
```
그건 됐고, 이제 CI/CD 파이프라인 설정해줘
```
- [ ] 새 세션 안내

### C-2. 다른 앱으로 전환
(student-web 작업 후)
```
이제 cms-web 쪽 작업할게
```
- [ ] 새 세션 권장 (다른 앱 = 다른 작업)

### C-3. 작업 완료 후
(간단한 수정 완료 후)
- [ ] /cost 안내
- [ ] /clear 또는 새 세션 제안

---

## D. 캐시 보호

### D-1. CLAUDE.md 생성 시도
```
이 프로젝트에 CLAUDE.md 만들어줘
```
- [ ] Hook이 차단하거나, 세션 시작 전에 하라고 안내

### D-2. 모델 변경
```
모델을 haiku로 바꿔줘
```
- [ ] 캐시 브레이크 경고
- [ ] 새 세션에서 바꾸라고 안내

---

## E. 프롬프트 최적화

### E-1.
```
"student-web에서 성능 개선해줘"를 더 효율적인 프롬프트로 바꿔줘
```
- [ ] optimize_prompt 호출
- [ ] 파일 경로 추가, 구체적 지표 지정 등 제안

---

## F. 비용 참조

### F-1.
```
지금 쓰고 있는 모델 비용이 얼마야?
```
- [ ] cost_reference 호출
- [ ] 단가표 안내

---

## G. 프로젝트 설정

### G-1. 최적화 설정
```
이 모노레포에 맞는 Claude Code 설정 만들어줘
```
- [ ] setup_project 호출
- [ ] CLAUDE.md 구조 제안 (루트 + apps/student-web/ + packages/)
- [ ] pnpm 기반 권한 설정
- [ ] prettier hook 제안

### G-2. 팀 설정
```
우리 프론트엔드 팀 5명이 쓸 수 있는 Claude Code 설정 만들어줘
```
- [ ] CLAUDE.md + CLAUDE.local.md 분리 제안
- [ ] .gitignore 안내

---

## H. 실전 시나리오

### H-1. GraphQL 코드젠 후 타입 에러
```
pnpm codegen 돌렸는데 apps/student-web/src/generated/graphql.tsx에서 타입 에러가 나. Property 'newField' does not exist
```
- [ ] 바로 해당 파일/에러 분석
- [ ] 💡 Sonnet 추천

### H-2. 디자인 시스템 토큰 변경
```
packages/design-system의 color 토큰에서 primary를 #3B82F6으로 바꿔줘
```
- [ ] 바로 파일 찾아서 수정
- [ ] 💡 Haiku 추천 (간단한 값 변경)

### H-3. 새 페이지 추가
```
apps/student-web/src/pages/에 settings.tsx 페이지 추가해줘. 기존 페이지 패턴 따라서
```
- [ ] 기존 페이지 패턴 확인 후 생성
- [ ] 💡 Sonnet 추천

### H-4. 여러 앱에 걸친 작업
```
mildang-ui에 새 Button variant 추가하고, student-web에서 사용하는 곳 전부 업데이트해줘
```
- [ ] 복잡도 판단 (multi-file)
- [ ] 서브에이전트 병렬 또는 Plan Mode 제안 가능

### H-5. Panda CSS 스타일 수정
```
apps/student-web/src/screens/LoginScreen/LoginForm.tsx의 폼 레이아웃을 flex에서 grid로 바꿔줘
```
- [ ] 바로 파일 읽고 수정
- [ ] 💡 Sonnet 추천

---

## 결과 요약

| 카테고리 | 수 | 통과 | 실패 |
|---------|---|------|------|
| 0. 연결 | 1 | /1 | /1 |
| A. 구체성 | 5 | /5 | /5 |
| B. 모델 추천 | 5 | /5 | /5 |
| C. 세션 관리 | 3 | /3 | /3 |
| D. 캐시 보호 | 2 | /2 | /2 |
| E. 프롬프트 최적화 | 1 | /1 | /1 |
| F. 비용 참조 | 1 | /1 | /1 |
| G. 프로젝트 설정 | 2 | /2 | /2 |
| H. 실전 시나리오 | 5 | /5 | /5 |
| **합계** | **25** | **/25** | **/25** |
