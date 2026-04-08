#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// =============================================================================
// MCP Instructions — 극도로 짧게. 매 턴 system prompt 토큰으로 잡힌다.
// =============================================================================

const INSTRUCTIONS = `
비용 최적화 코딩 버디. 다음 규칙을 따라라:
1. 구체적이지 않은 요청(파일 경로/함수명/에러 없음)은 먼저 구체화를 요청
2. 작업 시작 전 analyze_task 도구로 적절한 모델과 접근법을 확인
3. 작업 완료 후 "/cost로 비용 확인" 안내
4. 주제가 바뀌면 새 세션 안내 ("한 세션 한 작업이 비용과 품질 모두 유리합니다")
`;

// =============================================================================
// 복잡도 분석 헬퍼
// =============================================================================

const SIMPLE_KEYWORDS = [
  "rename", "typo", "format", "formatting", "delete line", "remove line",
  "add import", "simple", "quick", "small", "trivial", "boilerplate",
  "template", "copy", "move file", "change name", "fix typo", "add comment",
  "오타", "이름 변경", "이름변경", "포맷", "간단", "삭제", "주석", "임포트", "복사",
];

const COMPLEX_KEYWORDS = [
  "migrate", "migration", "architecture", "redesign", "refactor entire",
  "refactor all", "system design", "all files", "entire project",
  "multi-file", "cross-cutting", "overhaul", "rewrite", "restructure",
  "database schema", "auth system", "from scratch",
  "마이그레이션", "아키텍처", "전체 리팩토링", "시스템 설계", "전부",
  "전체 구조", "다시 만들", "데이터베이스 스키마", "인증 시스템",
];

type Complexity = "simple" | "medium" | "complex";

function analyzeComplexity(task: string): Complexity {
  const lower = task.toLowerCase();
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return "complex";
  if (SIMPLE_KEYWORDS.some((k) => lower.includes(k))) return "simple";
  const numberedItems = (task.match(/\d+[\.\)]/g) || []).length;
  if (numberedItems >= 3) return "complex";
  if (task.length > 300) return "complex";
  if (task.length < 80) return "simple";
  return "medium";
}

function hasFilePath(task: string): boolean {
  return /[\w-]+\/[\w.-]+\.\w{1,5}/.test(task);
}

// =============================================================================
// MCP Server
// =============================================================================

const server = new McpServer(
  { name: "coding-buddy", version: "2.0.0" },
  { instructions: INSTRUCTIONS }
);

// =============================================================================
// Tool 1: analyze_task — 복잡도/모델/비용 추정 (온디맨드)
// =============================================================================

server.tool(
  "analyze_task",
  "Analyze task complexity and recommend optimal model, approach, and estimated cost. Call this before starting any new task.",
  {
    task: z.string().describe("Description of the task"),
  },
  async ({ task }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    const complexity = analyzeComplexity(task);
    const specific = hasFilePath(task);

    const models: Record<Complexity, { model: string; price: string; cost_range: string }> = {
      simple: { model: "haiku", price: "$1/$5 per 1M", cost_range: "$0.01-$0.05" },
      medium: { model: "sonnet", price: "$15/$75 per 1M", cost_range: "$0.20-$1.00" },
      complex: { model: "opus", price: "$15/$75 per 1M", cost_range: "$2.00-$10.00" },
    };

    const rec = models[complexity];
    const tips: string[] = [];

    if (!specific) {
      tips.push("파일 경로를 명시하면 도구 호출 횟수가 줄어듭니다 (비용 절감)");
    }
    if (complexity === "complex") {
      tips.push("Plan Mode에서 먼저 계획을 세우면 불필요한 탐색을 줄일 수 있습니다");
    }
    if (complexity === "simple") {
      tips.push("Extended thinking이 불필요합니다. thinking 토큰은 output 단가($75/1M)로 과금됩니다");
    }

    const result = {
      complexity,
      recommended_model: rec.model,
      model_price: rec.price,
      estimated_cost: rec.cost_range,
      is_specific: specific,
      approach: complexity === "complex" ? "plan_mode_first" : "direct",
      tips,
      switch_note: `현재 모델이 ${rec.model}이 아니라면 새 세션에서 /model ${rec.model} 로 시작하세요. 세션 중 모델 변경은 캐시 브레이크(비용 10배)를 유발합니다.`,
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// =============================================================================
// Tool 2: cost_reference — 가격표/캐시/팁 조회 (온디맨드)
// =============================================================================

server.tool(
  "cost_reference",
  "Get Claude Code pricing, cache settings, and cost optimization tips by topic.",
  {
    topic: z.enum(["pricing", "cache", "compaction", "thinking", "all"]).optional().describe("Topic to query. Defaults to 'all'."),
  },
  async ({ topic }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    const t = topic || "all";
    const sections: Record<string, object> = {
      pricing: {
        haiku: { input: "$1", output: "$5", cache_write: "$1.25", cache_read: "$0.10" },
        sonnet: { input: "$15", output: "$75", cache_write: "$18.75", cache_read: "$1.50" },
        opus: { input: "$15", output: "$75", cache_write: "$18.75", cache_read: "$1.50" },
        unit: "USD per 1M tokens",
        key_insight: "output은 input보다 5배 비쌈. cache_read는 input보다 10배 저렴.",
      },
      cache: {
        prompt_ttl: "300초 (5분) — Anthropic 서버 캐시",
        completion_ttl: "30초 — 동일 요청 로컬 캐시",
        breakers: ["모델 변경", "CLAUDE.md 수정", "MCP 도구 변경", "시스템 프롬프트 변경"],
        tip: "5분 이상 자리비움 → 캐시 만료 → 첫 요청 비용 증가",
      },
      compaction: {
        threshold: "100,000 input tokens (CLAUDE_CODE_AUTO_COMPACT_INPUT_TOKENS로 조정)",
        surviving_keywords: ["todo", "next", "pending", "follow up", "remaining"],
        surviving_paths: "파일 경로 (/ 포함 + 확장자) 최대 8개",
        tip: "한 세션 한 작업. 길어지면 /compact. 마무리되면 새 세션.",
      },
      thinking: {
        billing: "output 토큰으로 과금 ($75/1M for Sonnet/Opus)",
        risk: "단순 작업에 thinking 8,000토큰 → $0.60 낭비",
        tip: "단순 작업은 Haiku (thinking 없음). 복잡한 추론에만 Opus.",
      },
    };

    const result = t === "all" ? sections : { [t]: sections[t] };
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// =============================================================================
// Tool 3: session_health — 세션 상태 진단 (온디맨드)
// =============================================================================

server.tool(
  "session_health",
  "Diagnose current session health and recommend whether to continue, compact, or start a new session.",
  {
    message_count: z.number().optional().describe("Approximate number of messages in session"),
    minutes_since_start: z.number().optional().describe("Minutes since session started"),
    minutes_since_last_interaction: z.number().optional().describe("Minutes since last user message"),
    topic_changed: z.boolean().optional().describe("Whether the topic has changed from the original task"),
  },
  async ({ message_count, minutes_since_start, minutes_since_last_interaction, topic_changed }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    let recommendation: "continue" | "compact" | "new_session" = "continue";
    const warnings: string[] = [];

    if (topic_changed) {
      recommendation = "new_session";
      warnings.push("주제가 바뀌었습니다. 새 세션이 비용과 품질 모두 유리합니다.");
    }

    if (message_count && message_count > 20) {
      recommendation = recommendation === "new_session" ? "new_session" : "compact";
      warnings.push(`${message_count}개 메시지 누적. 매 턴 전체 대화가 전송되어 비용이 증가 중.`);
    }

    if (minutes_since_start && minutes_since_start > 30) {
      warnings.push("30분+ 세션. 압축이 누적되어 맥락 손실 위험.");
    }

    if (minutes_since_last_interaction && minutes_since_last_interaction > 5) {
      warnings.push("5분+ 미응답. Anthropic 서버 캐시가 만료됐을 가능성 높음. 첫 요청 비용 증가.");
    }

    const actions: Record<string, string> = {
      continue: "현재 세션 계속 진행",
      compact: "/compact 로 대화 압축 후 계속",
      new_session: "새 세션 시작 추천",
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          recommendation,
          action: actions[recommendation],
          warnings,
          tips: [
            "claude --resume latest 로 5분 이내 이어하기 가능",
            "중요 맥락은 CLAUDE.md에 저장 (압축과 무관하게 보존)",
          ],
        }, null, 2),
      }],
    };
  }
);

// =============================================================================
// Tool 4: optimize_prompt — 모호한 프롬프트 최적화 제안 (온디맨드)
// =============================================================================

server.tool(
  "optimize_prompt",
  "Analyze a vague user prompt and suggest an optimized version that reduces tool calls and cost.",
  {
    user_prompt: z.string().describe("The user's original prompt to optimize"),
  },
  async ({ user_prompt }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    const issues: string[] = [];
    const specific = hasFilePath(user_prompt);

    if (!specific) {
      issues.push("파일 경로 없음 → 탐색 도구 5~10회 예상");
    }

    const lower = user_prompt.toLowerCase();
    if (lower.includes("전체") || lower.includes("entire") || lower.includes("all")) {
      issues.push("범위가 '전체' → 대량 파일 읽기 발생");
    }
    if (!lower.match(/함수|function|컴포넌트|component|클래스|class|메서드|method/)) {
      issues.push("함수/컴포넌트 지정 없음 → 파일 전체 읽기 필요");
    }

    const vague_cost = "$1.00-$5.00 (4+턴, 10+ 도구 호출)";
    const specific_cost = "$0.10-$0.30 (1-2턴, 1-2 도구 호출)";

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          original: user_prompt,
          issues,
          optimization_tips: [
            "파일 경로를 추가하세요 (예: src/auth/login.ts)",
            "함수명이나 컴포넌트명을 지정하세요",
            "에러 메시지가 있다면 포함하세요",
            "증상을 구체적으로 설명하세요",
          ],
          estimated_cost: { vague: vague_cost, specific: specific_cost },
          example: {
            before: "버그 찾아줘",
            after: "src/routes/auth.ts의 login 함수에서 세션 만료 처리가 안 됨. 로그아웃 후에도 세션이 유지됨.",
          },
        }, null, 2),
      }],
    };
  }
);

// =============================================================================
// Tool 5: setup_project — 프로젝트 설정 생성 (온디맨드)
// =============================================================================

server.tool(
  "setup_project",
  "Generate optimized Claude Code project configuration: CLAUDE.md structure, permissions, and hooks.",
  {
    project_type: z.string().optional().describe("Project type: react, nextjs, rust, python, go, monorepo"),
    has_claude_md: z.boolean().optional().describe("Whether project has CLAUDE.md"),
    team_size: z.number().optional().describe("Number of developers"),
  },
  async ({ project_type, has_claude_md, team_size }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    const type = project_type || "unknown";
    const formatter = type === "rust" ? "cargo fmt" : "npx prettier --write";
    const test_cmd = type === "rust" ? "cargo test" : type === "python" ? "pytest" : "pnpm test";
    const lint_cmd = type === "rust" ? "cargo clippy" : type === "python" ? "ruff check" : "pnpm lint";

    const result: Record<string, unknown> = {};

    if (!has_claude_md) {
      result.claude_md = {
        structure: [
          "project/CLAUDE.md — 프로젝트 전체 규칙",
          "project/CLAUDE.local.md — 개인 환경 (gitignored)",
          "project/src/CLAUDE.md — src 하위 작업 시 추가 컨텍스트",
          "project/tests/CLAUDE.md — 테스트 작업 시 추가 컨텍스트",
        ],
        template: `# Project\n\n## Structure\n- src/: source code\n\n## Commands\n- Test: ${test_cmd}\n- Lint: ${lint_cmd}\n\n## Conventions\n- Commit: conventional commits (feat:, fix:, chore:)`,
        local_template: "# Personal\n- Branch naming: yourname/feature-name",
        tip: ".gitignore에 CLAUDE.local.md 추가",
      };
    }

    result.settings = {
      permissions: {
        allow: [
          "Read", "Edit", "Write", "Glob", "Grep",
          "Bash(git *)", `Bash(${type === "rust" ? "cargo *" : "pnpm *"})`,
        ],
      },
      hooks: {
        PostToolUse: [{
          matcher: "Edit",
          hooks: [{ type: "command", command: `${formatter} $HOOK_TOOL_INPUT 2>/dev/null; exit 0` }],
        }],
        PreToolUse: [{
          matcher: "Bash",
          hooks: [{ type: "command", command: "echo $HOOK_TOOL_INPUT | grep -qE 'rm -rf|drop table|force push' && exit 2 || exit 0" }],
        }],
      },
    };

    result.cost_tips = [
      "CLAUDE.md는 세션 시작 전에 수정 (세션 중 수정 = 캐시 브레이크)",
      "MCP 서버는 세션 시작 전에 설정 (도구 변경 = 캐시 브레이크)",
      "필요한 MCP만 활성화 (각 도구 정의가 매 턴 토큰 차지)",
    ];

    if (team_size && team_size > 1) {
      result.team = {
        shared: "CLAUDE.md (git tracked) — 팀 공통 규칙",
        personal: "CLAUDE.local.md (gitignored) — 개인 설정",
      };
    }

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// =============================================================================
// Start
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Coding Buddy MCP failed to start:", error);
  process.exit(1);
});
