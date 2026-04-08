#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// =============================================================================
// Server Instructions — 이것이 코딩버디의 두뇌. Claude의 행동 자체를 바꾼다.
// 두 글의 37개 액션아이템을 전부 Claude 행동 규칙으로 인코딩.
// =============================================================================

const INSTRUCTIONS = `
You have a Coding Buddy. Follow these 3 mandatory steps for EVERY user request, in order.

STEP 1: CHECK SPECIFICITY
If the request has NO file path, NO function name, and NO error message → ask for specifics. Do NOT call any tools.
- "버그 찾아줘" → respond: "어떤 파일에서 어떤 증상이 나오나요? 파일 경로와 증상을 알려주세요."
- "리팩토링 해줘" → respond: "어떤 파일을 리팩토링할까요?"
- "테스트 작성해줘" → respond: "어떤 파일/함수에 대한 테스트인가요?"
If the request IS specific (has a file path or function name) → go to Step 2.

STEP 2: RECOMMEND MODEL
Before doing any work, tell the user which model fits this task:
- Simple (오타, rename, format, 간단 조회) → "이 작업은 Haiku면 충분합니다 ($1/$5). 현재 모델이 다르다면 새 세션에서 /model haiku 로 시작하세요."
- Medium (기능 구현, 버그 수정, 테스트, 리뷰) → "이 작업은 Sonnet이 적합합니다 ($15/$75)."
- Complex (아키텍처, 마이그레이션, 전체 리팩토링) → "이 작업은 Opus가 필요합니다 ($15/$75). Plan Mode를 먼저 사용하세요."
Say this in 1 line, then proceed to Step 3.

STEP 3: DO THE WORK
Now proceed with the task. While working, follow these rules:
- Keep responses short (output costs 5x more than input)
- Read only needed file sections, not entire files
- Use full file paths in your messages (e.g., src/auth/login.ts) — they survive compaction
- After finishing → suggest "/cost 로 비용 확인해보세요"
- If the topic changes → suggest new session ("새 작업이니 새 세션이 효율적입니다")
- If conversation is long → suggest /compact
- NEVER change model mid-session (cache break = 10x cost spike). Suggest new session instead.
- WARN before editing CLAUDE.md mid-session ("캐시가 깨집니다. 세션 시작 전에 수정하세요")
- Complex tasks → suggest Plan Mode first
- Multiple independent tasks → use sub-agents in parallel
- After code changes → suggest "/diff → /commit → /pr"
`;

// =============================================================================
// Task Complexity Analysis — 작업 복잡도 판단 로직
// =============================================================================

const SIMPLE_KEYWORDS = [
  // English
  "rename", "typo", "format", "formatting", "delete line", "remove line",
  "add import", "simple", "quick", "small", "trivial", "boilerplate",
  "template", "copy", "move file", "what is", "where is", "show me",
  "explain this", "change name", "fix typo", "add comment",
  // Korean
  "오타", "이름 변경", "이름변경", "포맷", "간단", "삭제", "뭐야", "어디",
  "보여줘", "설명해", "주석", "임포트", "복사",
];

const COMPLEX_KEYWORDS = [
  // English
  "migrate", "migration", "architecture", "redesign", "refactor entire",
  "refactor all", "system design", "all files", "entire project",
  "multi-file", "cross-cutting", "overhaul", "rewrite", "restructure",
  "database schema", "auth system", "from scratch",
  // Korean
  "마이그레이션", "아키텍처", "전체 리팩토링", "시스템 설계", "전부",
  "전체 구조", "다시 만들", "데이터베이스 스키마", "인증 시스템",
];

type Complexity = "simple" | "medium" | "complex";

interface ModelRecommendation {
  model: string;
  reason_ko: string;
  reason_en: string;
  switch_command: string;
  estimated_cost_range: string;
  input_price: string;
  output_price: string;
}

interface TaskAnalysis {
  complexity: Complexity;
  model: ModelRecommendation;
  approach: string[];
  warnings: string[];
  tips: string[];
}

function analyzeComplexity(task: string): Complexity {
  const lower = task.toLowerCase();

  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return "complex";
  if (SIMPLE_KEYWORDS.some((k) => lower.includes(k))) return "simple";

  // Heuristic: multiple numbered items suggest multi-step = complex
  const numberedItems = (task.match(/\d+[\.\)]/g) || []).length;
  if (numberedItems >= 3) return "complex";

  // Long descriptions tend toward complexity
  if (task.length > 300) return "complex";
  if (task.length < 80) return "simple";

  return "medium";
}

function getModelRecommendation(complexity: Complexity): ModelRecommendation {
  switch (complexity) {
    case "simple":
      return {
        model: "haiku",
        reason_ko:
          "단순 작업입니다. Haiku는 Sonnet 대비 input 15배, output 15배 저렴합니다.",
        reason_en:
          "Simple task. Haiku is 15x cheaper than Sonnet for both input and output.",
        switch_command: "/model haiku",
        estimated_cost_range: "$0.01 - $0.05",
        input_price: "$1.00 / 1M tokens",
        output_price: "$5.00 / 1M tokens",
      };
    case "complex":
      return {
        model: "opus",
        reason_ko:
          "복잡한 추론이 필요합니다. Opus를 추천하며, Plan Mode를 먼저 사용하세요.",
        reason_en:
          "Deep reasoning required. Opus recommended. Use Plan Mode first.",
        switch_command: "/model opus",
        estimated_cost_range: "$2.00 - $10.00",
        input_price: "$15.00 / 1M tokens",
        output_price: "$75.00 / 1M tokens",
      };
    default:
      return {
        model: "sonnet",
        reason_ko:
          "표준 개발 작업입니다. Sonnet이 성능과 비용의 최적 균형입니다.",
        reason_en:
          "Standard development task. Sonnet is the best balance of capability and cost.",
        switch_command: "/model sonnet",
        estimated_cost_range: "$0.20 - $1.00",
        input_price: "$15.00 / 1M tokens",
        output_price: "$75.00 / 1M tokens",
      };
  }
}

function getApproach(complexity: Complexity, task: string): string[] {
  const approaches: string[] = [];

  if (complexity === "complex") {
    approaches.push(
      "Plan Mode first: 먼저 /plan 으로 영향받는 파일을 파악한 후 실행하세요"
    );
  }

  // Multiple independent subtasks → parallel sub-agents
  const multiTaskPatterns = [
    /\d+\.\s/,
    /and also/i,
    /additionally/i,
    /그리고/,
    /또한/,
    /동시에/,
    /병렬/,
  ];
  if (multiTaskPatterns.some((p) => p.test(task))) {
    approaches.push(
      "Sub-agents: 독립적인 하위 작업을 병렬로 실행하면 속도가 빨라집니다"
    );
  }

  // No file path detected → need specifics
  const hasFilePath = /[\w-]+\/[\w.-]+\.\w{1,5}/.test(task);
  if (!hasFilePath && complexity !== "simple") {
    approaches.push(
      "Specificity needed: 구체적인 파일 경로를 지정하면 도구 호출이 줄어듭니다"
    );
  }

  if (approaches.length === 0) {
    approaches.push(
      "Direct implementation: 작업 범위가 명확합니다. 바로 진행 가능합니다"
    );
  }

  return approaches;
}

function getWarnings(
  complexity: Complexity,
  currentModel?: string,
  sessionMinutes?: number,
  messageCount?: number
): string[] {
  const warnings: string[] = [];
  const rec = getModelRecommendation(complexity);

  // Model mismatch warning
  if (currentModel) {
    const current = currentModel.toLowerCase();
    if (rec.model !== current) {
      warnings.push(
        `현재 ${current} 모델인데, 이 작업은 ${rec.model}이 적합합니다. ` +
          `단, 세션 중간에 모델을 바꾸면 캐시가 깨집니다. 새 세션에서 ${rec.switch_command} 를 사용하세요.`
      );
    }
  }

  // Session too long
  if (sessionMinutes && sessionMinutes > 30) {
    warnings.push(
      "세션이 30분 이상 진행됐습니다. /compact 또는 새 세션을 고려하세요."
    );
  }

  // Many messages = expensive context
  if (messageCount && messageCount > 20) {
    warnings.push(
      `대화가 ${messageCount}개 메시지로 길어졌습니다. 매 턴마다 전체 대화가 전송되므로 비용이 누적됩니다. /compact 또는 /clear 를 추천합니다.`
    );
  }

  // Complex task without plan
  if (complexity === "complex") {
    warnings.push(
      "복잡한 작업은 Plan Mode에서 먼저 계획을 세우면 잘못된 방향으로 작업한 후 되돌리는 낭비를 줄일 수 있습니다."
    );
  }

  return warnings;
}

function getTips(complexity: Complexity, task: string): string[] {
  const tips: string[] = [];

  if (complexity === "simple") {
    tips.push(
      "이 작업에는 extended thinking이 불필요합니다. thinking 토큰은 output 단가($75/1M)로 청구됩니다."
    );
  }

  // Remind about compaction keywords
  tips.push(
    'todo/next/pending 키워드를 메시지에 포함하면 자동 압축 후에도 맥락이 보존됩니다.'
  );

  // File path reminder
  if (!/[\w-]+\/[\w.-]+\.\w{1,5}/.test(task)) {
    tips.push(
      "파일 경로를 정확히 언급하면 (예: src/auth/login.ts) 압축 후에도 Claude가 기억합니다."
    );
  }

  return tips;
}

// =============================================================================
// MCP Server 생성
// =============================================================================

const server = new McpServer(
  {
    name: "coding-buddy",
    version: "1.0.0",
  },
  {
    instructions: INSTRUCTIONS,
  }
);

// =============================================================================
// Tool: analyze_task — 작업 복잡도 분석 → 모델 + 전략 추천
// 매 새 작업 시작 시 Claude가 자동으로 호출
// =============================================================================

server.tool(
  "analyze_task",
  "Analyze task complexity and recommend the optimal model, approach, and estimated cost. Call this at the start of each new task.",
  {
    task: z
      .string()
      .describe("Description of the task the user wants to accomplish"),
    current_model: z
      .string()
      .optional()
      .describe("Currently active model (haiku, sonnet, or opus)"),
    session_age_minutes: z
      .number()
      .optional()
      .describe("Minutes since session started"),
    message_count: z
      .number()
      .optional()
      .describe("Number of messages in the current conversation"),
  },
  async ({
    task,
    current_model,
    session_age_minutes,
    message_count,
  }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    const complexity = analyzeComplexity(task);
    const model = getModelRecommendation(complexity);
    const approach = getApproach(complexity, task);
    const warnings = getWarnings(
      complexity,
      current_model,
      session_age_minutes,
      message_count
    );
    const tips = getTips(complexity, task);

    const analysis: TaskAnalysis = {
      complexity,
      model,
      approach,
      warnings,
      tips,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(analysis, null, 2),
        },
      ],
    };
  }
);

// =============================================================================
// Tool: setup_project — 프로젝트 설정 최적화 추천
// CLAUDE.md, 권한, hooks, settings.json 종합 안내
// =============================================================================

server.tool(
  "setup_project",
  "Get comprehensive Claude Code project setup recommendations: CLAUDE.md structure, permissions, hooks, and settings optimization.",
  {
    has_claude_md: z
      .boolean()
      .describe("Whether the project has a CLAUDE.md file"),
    project_type: z
      .string()
      .optional()
      .describe(
        "Project type: react, nextjs, rust, python, go, monorepo, etc."
      ),
    team_size: z
      .number()
      .optional()
      .describe("Number of developers working on this project"),
    current_permission_mode: z
      .string()
      .optional()
      .describe("Current permission mode: prompt, read-only, workspace-write, danger-full-access"),
  },
  async ({
    has_claude_md,
    project_type,
    team_size,
    current_permission_mode,
  }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    const recommendations: Array<{
      priority: string;
      category: string;
      action: string;
      detail: string;
      cost_impact: string;
    }> = [];

    // --- CLAUDE.md ---
    if (!has_claude_md) {
      recommendations.push({
        priority: "HIGH",
        category: "CLAUDE.md",
        action: "Create CLAUDE.md with /init",
        detail: `Run /init to create CLAUDE.md, then add:

## Include in CLAUDE.md:
- Project structure (directories and their purpose)
- Build/test/lint commands
- Coding conventions (error handling, naming, commit style)
- Common file paths (routes, components, types, configs)

## Hierarchical structure (saves tokens by loading only relevant context):
project/
  CLAUDE.md              # Project-wide rules
  CLAUDE.local.md        # Personal env (gitignored)
  src/
    CLAUDE.md            # src-specific context
  tests/
    CLAUDE.md            # test-specific context

## Example:
\`\`\`markdown
# Project Structure
- src/api/: REST API routes (Express)
- src/components/: React components (Atomic Design)
- src/types/: TypeScript type definitions

# Commands
- Test: pnpm test
- Lint: pnpm lint
- Build: pnpm build

# Conventions
- Error handling: use Result type, no try-catch
- Commits: conventional commits (feat:, fix:, chore:)
\`\`\``,
        cost_impact:
          "Saves ~$0.10-0.50 per session by eliminating repeated project explanations",
      });

      recommendations.push({
        priority: "MEDIUM",
        category: "CLAUDE.local.md",
        action: "Create CLAUDE.local.md for personal environment",
        detail: `Create CLAUDE.local.md (add to .gitignore):
- Local database connection strings
- Your branch naming convention
- Personal preferences
- PR reviewer defaults`,
        cost_impact: "Prevents personal config from polluting team CLAUDE.md",
      });
    } else {
      recommendations.push({
        priority: "LOW",
        category: "CLAUDE.md",
        action: "Review CLAUDE.md for completeness",
        detail:
          "Ensure it includes: project structure, commands, conventions, common paths. Edit BEFORE starting a session (editing mid-session breaks cache).",
        cost_impact:
          "Well-structured CLAUDE.md reduces repeated explanations",
      });
    }

    // --- Permission mode ---
    if (!current_permission_mode || current_permission_mode === "prompt") {
      recommendations.push({
        priority: "HIGH",
        category: "Permissions",
        action: "Optimize permission mode and auto-allow list",
        detail: `Every permission prompt interrupts flow and wastes time.

## Option 1: Permission mode flag
- Code review only: claude --permission-mode read-only
- Active development: claude --permission-mode workspace-write

## Option 2: Auto-allow common tools in settings.json
Add to .claude/settings.json:
{
  "permissions": {
    "allow": [
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "Bash(git *)",
      "Bash(npm *)",
      "Bash(pnpm *)",
      "Bash(cargo *)"
    ]
  }
}

This auto-approves safe operations while still prompting for dangerous ones (rm, curl, etc).`,
        cost_impact:
          "No direct token savings, but eliminates workflow interruptions",
      });
    }

    // --- Hooks ---
    recommendations.push({
      priority: "MEDIUM",
      category: "Hooks",
      action: "Set up automation hooks",
      detail: `Add to .claude/settings.json for automatic formatting and safety:

{
  "hooks": {
    "postToolUse": [
      {
        "matcher": "Edit",
        "command": "${project_type === "rust" ? "cargo fmt -- $HOOK_TOOL_INPUT 2>/dev/null; exit 0" : "npx prettier --write $HOOK_TOOL_INPUT 2>/dev/null; exit 0"}"
      }
    ],
    "preToolUse": [
      {
        "matcher": "Bash",
        "command": "echo $HOOK_TOOL_INPUT | grep -qE 'rm -rf|drop table|force push' && exit 2 || exit 0"
      }
    ]
  }
}

Hook exit codes: 0=allow, 2=block, other=fail`,
      cost_impact:
        "Prevents costly mistakes (accidental deletions, force pushes)",
    });

    // --- MCP optimization ---
    recommendations.push({
      priority: "MEDIUM",
      category: "MCP",
      action: "Audit active MCP servers",
      detail: `Each MCP server's tool definitions are sent with EVERY API request, consuming tokens.

Rules:
- Only enable MCPs you actively use
- Set up ALL needed MCPs BEFORE starting a session (adding/removing = cache break)
- MCP initialization timeout: 10s, tool list timeout: 30s — unstable servers hurt performance

Check current MCPs: /mcp`,
      cost_impact:
        "Removing 1 unused MCP with 5 tools saves ~100-200 tokens per request",
    });

    // --- Session strategy ---
    recommendations.push({
      priority: "HIGH",
      category: "Session Strategy",
      action: "Adopt one-session-one-task discipline",
      detail: `Session management rules:
1. One session = one focused task
2. Task done → /clear or new session
3. Conversation long → /compact (or set CLAUDE_CODE_AUTO_COMPACT_INPUT_TOKENS=50000 for earlier auto-compact)
4. Resume within 5 min: claude --resume latest (cache alive)
5. Want two approaches: use session fork
6. Monitor costs: /cost

Important keywords that survive compaction: todo, next, pending, follow up, remaining
File paths with extensions (e.g., src/auth/login.ts) also survive compaction.`,
      cost_impact:
        "Short focused sessions maximize cache hits and minimize context bloat",
    });

    // --- Team collaboration ---
    if (team_size && team_size > 1) {
      recommendations.push({
        priority: "MEDIUM",
        category: "Team",
        action: "Set up team-wide CLAUDE.md with CLAUDE.local.md split",
        detail: `For teams:
- CLAUDE.md: shared conventions, commands, structure (committed to git)
- CLAUDE.local.md: personal env, preferences (gitignored)

Add to .gitignore:
CLAUDE.local.md`,
        cost_impact:
          "Consistent behavior across team members, personal overrides without conflicts",
      });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ recommendations }, null, 2),
        },
      ],
    };
  }
);

// =============================================================================
// Tool: cost_reference — 비용 참조 테이블
// 모델별 단가, 토큰 비율, 캐시 설정, 캐시 브레이커 등
// =============================================================================

server.tool(
  "cost_reference",
  "Get Claude Code model pricing, token ratios, cache settings, and cost optimization reference data.",
  {},
  async (): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    const reference = {
      pricing_per_1M_tokens: {
        haiku: {
          input: "$1.00",
          output: "$5.00",
          cache_write: "$1.25",
          cache_read: "$0.10",
        },
        sonnet: {
          input: "$15.00",
          output: "$75.00",
          cache_write: "$18.75",
          cache_read: "$1.50",
        },
        opus: {
          input: "$15.00",
          output: "$75.00",
          cache_write: "$18.75",
          cache_read: "$1.50",
        },
      },

      cost_ratios: {
        output_vs_input: "Output is 5x more expensive than input",
        cache_read_vs_input:
          "Cache read is 10x cheaper than input",
        haiku_vs_sonnet:
          "Haiku is 15x cheaper than Sonnet (both input and output)",
        thinking_tokens:
          "Thinking/extended thinking tokens are billed as OUTPUT ($75/1M for Sonnet/Opus)",
      },

      cache_config: {
        completion_cache_ttl: "30 seconds (exact duplicate request reuse, stored locally)",
        prompt_cache_ttl:
          "300 seconds (5 minutes — Anthropic server-side cache)",
        cache_break_threshold:
          "2,000+ token drop in cache_read signals a cache break",
      },

      cache_breakers: [
        "Model change mid-session (model_hash changes)",
        "CLAUDE.md edit during session (system_hash changes)",
        "MCP server add/remove during session (tools_hash changes)",
        "Any system prompt modification",
      ],

      compaction: {
        auto_threshold:
          "100,000 input tokens (configurable: CLAUDE_CODE_AUTO_COMPACT_INPUT_TOKENS)",
        manual_command: "/compact",
        surviving_keywords: [
          "todo",
          "next",
          "pending",
          "follow up",
          "remaining",
        ],
        surviving_paths:
          "File paths with / separator and known extensions (.ts, .js, .rs, .py, .json, .md) — max 8 paths preserved",
        multi_compaction:
          "Previous summaries are merged, not discarded ('Previously compacted context')",
      },

      retry_config: {
        max_retries: "2 (total 3 attempts)",
        initial_backoff: "200ms",
        max_backoff: "2 seconds",
        retried_status_codes: "429, 500, 502, 503, 529",
        cost_note:
          "429/502/503 = no charge (rejected before processing). 500/timeout = possible partial charge.",
      },

      token_estimation: {
        method: "JSON serialized bytes ÷ 4",
        billed_per_request:
          "messages + system prompt + tool definitions + tool_choice — ALL sent every turn",
      },

      quick_tips: [
        "Output 1M tokens saved = $75 saved. Input 1M tokens saved = $15 saved. Prioritize reducing output.",
        "Keep sessions under 30 min for optimal cache utilization",
        "One session = one task. Short focused sessions > long wandering ones.",
        "/cost to monitor, /compact to compress, /clear to reset",
        "Cafe WiFi? Avoid large operations. Timeout → retry → possible double billing.",
      ],
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(reference, null, 2),
        },
      ],
    };
  }
);

// =============================================================================
// Start the server
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Coding Buddy MCP failed to start:", error);
  process.exit(1);
});
