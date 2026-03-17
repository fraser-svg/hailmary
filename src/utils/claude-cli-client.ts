/**
 * Claude CLI Client — duck-typed Anthropic SDK replacement
 *
 * Uses `claude -p` subprocess (MAX subscription auth) instead of the
 * Anthropic API. Avoids needing ANTHROPIC_API_KEY.
 *
 * Implements the subset of Anthropic.messages.create() used by:
 *   - writeMemo (V3-M4)
 *   - criticiseMemo (V3-M5)
 *   - synthesiseArgument (V4-M2a)
 *
 * Originally proven in phase3-eval-live.ts, extracted here for reuse.
 */

import { execFileSync } from "node:child_process";

interface CreateParams {
  model?: string;
  system?: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

interface CreateResult {
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Create a duck-typed Anthropic client that calls `claude -p` as a subprocess.
 *
 * Usage:
 *   const client = makeClaudeCliClient();
 *   const config = { client: client as never }; // cast for type compatibility
 */
export function makeClaudeCliClient(): {
  messages: { create: (params: CreateParams) => Promise<CreateResult> };
} {
  return {
    messages: {
      create: async (params: CreateParams): Promise<CreateResult> => {
        const model = params.model ?? "claude-haiku-4-5-20251001";
        const userMsg =
          params.messages.findLast?.((m) => m.role === "user")?.content ??
          params.messages[params.messages.length - 1]?.content ??
          "";
        const system = params.system ?? "";

        const args = ["-p", userMsg, "--model", model];
        if (system) {
          args.push("--system-prompt", system);
        }

        const raw = execFileSync("claude", args, {
          maxBuffer: 16 * 1024 * 1024, // 16 MB
          timeout: 300_000, // 5 min (Sonnet can be slow)
          encoding: "utf-8",
        });

        return {
          content: [{ type: "text" as const, text: raw.trim() }],
        };
      },
    },
  };
}
