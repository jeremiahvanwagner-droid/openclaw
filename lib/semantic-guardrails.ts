import type { ChatMessage } from "./llm-router";

export interface GuardrailMatch {
  category: "instruction_override" | "system_prompt_exfiltration" | "tool_jailbreak" | "secret_exfiltration";
  rule: string;
  excerpt: string;
}

export interface PromptInjectionAssessment {
  blocked: boolean;
  matches: GuardrailMatch[];
}

export interface OutputScrubResult {
  content: string;
  redactionCounts: Record<string, number>;
  scrubbed: boolean;
}

export interface CompletionSafetyMetadata {
  input: {
    blocked: boolean;
    matchedRules: string[];
  };
  output: {
    scrubbed: boolean;
    redactionCounts: Record<string, number>;
  };
}

export class GuardrailBlockedError extends Error {
  readonly matches: GuardrailMatch[];

  constructor(message: string, matches: GuardrailMatch[]) {
    super(message);
    this.name = "GuardrailBlockedError";
    this.matches = matches;
  }
}

const INPUT_RULES: Array<{
  category: GuardrailMatch["category"];
  rule: string;
  pattern: RegExp;
}> = [
  {
    category: "instruction_override",
    rule: "ignore-previous-instructions",
    pattern: /\b(ignore|disregard|forget)\b[\s\S]{0,80}\b(previous|prior|system|developer)\b[\s\S]{0,40}\b(instruction|prompt|message)s?\b/i,
  },
  {
    category: "system_prompt_exfiltration",
    rule: "reveal-system-prompt",
    pattern: /\b(reveal|show|print|dump|expose)\b[\s\S]{0,60}\b(system|developer|hidden)\b[\s\S]{0,40}\b(prompt|instruction|message)s?\b/i,
  },
  {
    category: "tool_jailbreak",
    rule: "tool-jailbreak",
    pattern: /\b(bypass|override|disable|jailbreak)\b[\s\S]{0,60}\b(safety|guardrail|policy|tool|restriction)s?\b/i,
  },
  {
    category: "secret_exfiltration",
    rule: "secret-exfiltration",
    pattern: /\b(api key|token|secret|password|environment variable|env var)\b[\s\S]{0,80}\b(show|reveal|print|dump|list|return|export)\b/i,
  },
];

const OUTPUT_PATTERNS: Array<{ key: string; pattern: RegExp; replacement: string }> = [
  {
    key: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
  {
    key: "phone",
    pattern: /(?<!\w)(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}(?!\w)/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    key: "ssn_or_tin",
    pattern: /\b(?:\d{3}-\d{2}-\d{4}|\d{2}-\d{7})\b/g,
    replacement: "[REDACTED_TAX_ID]",
  },
  {
    key: "payment_card",
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    replacement: "[REDACTED_CARD]",
  },
  {
    key: "bank_account",
    pattern: /\b(?:routing|account)\s*(?:number|#|num|no\.?)?\s*[:=]?\s*\d{4,17}\b/gi,
    replacement: "[REDACTED_BANK_ACCOUNT]",
  },
  {
    key: "api_secret",
    pattern: /\b(?:sk|rk|ghp|ghs|xoxb|xoxp|AIza)[A-Za-z0-9._-]{10,}\b/g,
    replacement: "[REDACTED_SECRET]",
  },
  {
    key: "key_assignment",
    pattern: /\b(?:api[_ -]?key|token|secret|password)\b\s*[:=]\s*\S+/gi,
    replacement: "[REDACTED_SECRET_ASSIGNMENT]",
  },
];

function excerpt(content: string, pattern: RegExp): string {
  const match = content.match(pattern);
  if (!match?.[0]) return content.slice(0, 120);
  return match[0].slice(0, 120);
}

export function detectPromptInjection(messages: ChatMessage[]): PromptInjectionAssessment {
  const matches: GuardrailMatch[] = [];

  for (const message of messages) {
    if (message.role === "system") continue;
    for (const rule of INPUT_RULES) {
      if (!rule.pattern.test(message.content)) continue;
      matches.push({
        category: rule.category,
        rule: rule.rule,
        excerpt: excerpt(message.content, rule.pattern),
      });
    }
  }

  return {
    blocked: matches.length > 0,
    matches,
  };
}

export function scrubModelOutput(content: string): OutputScrubResult {
  let scrubbedContent = content;
  const redactionCounts: Record<string, number> = {};

  for (const { key, pattern, replacement } of OUTPUT_PATTERNS) {
    const matchCount = scrubbedContent.match(pattern)?.length ?? 0;
    if (matchCount === 0) continue;
    redactionCounts[key] = matchCount;
    scrubbedContent = scrubbedContent.replace(pattern, replacement);
  }

  return {
    content: scrubbedContent,
    redactionCounts,
    scrubbed: Object.keys(redactionCounts).length > 0,
  };
}

export function buildCompletionSafetyMetadata(
  input: PromptInjectionAssessment,
  output: OutputScrubResult,
): CompletionSafetyMetadata {
  return {
    input: {
      blocked: input.blocked,
      matchedRules: input.matches.map((match) => match.rule),
    },
    output: {
      scrubbed: output.scrubbed,
      redactionCounts: output.redactionCounts,
    },
  };
}
