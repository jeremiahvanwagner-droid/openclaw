/**
 * GitHub PR Review Comment Handler — Core Logic
 * OpenClaw Development Skill
 *
 * Reads open review comments on GitHub pull requests, groups them by type,
 * generates targeted code fixes using an LLM, and commits the changes back
 * to the PR branch with a summary reply comment.
 *
 * Safety: Security-category fixes always require human approval.
 * Logic fixes only auto-apply when LLM confidence ≥ 0.7.
 */

// ── Constants ──────────────────────────────────────────────────────

const GH_API = 'https://api.github.com';
const USER_AGENT = 'OpenClaw-GhAddressComments/1.0';

/** Minimum LLM confidence required to auto-apply a logic fix. */
const LOGIC_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Maximum file content characters included in the LLM prompt.
 * Keeps token usage bounded while preserving enough context for most files.
 */
const FILE_CONTEXT_CHARS = 6_000;

/** Categories that always require human review. */
const HUMAN_REVIEW_CATEGORIES = ['security'];

/** Files that must never be modified autonomously. */
const PROTECTED_FILE_PATTERNS = [/\.env/i, /secret/i, /credential/i, /migration/i, /password/i];

// ── Comment categorizer ────────────────────────────────────────────

const CATEGORY_PATTERNS = [
  { pattern: /sql.inject|xss|csrf|auth.*bypass|insecure|vuln|cve/i, category: 'security' },
  { pattern: /eslint|prettier|style|indent|spacing|format|naming/i,  category: 'style' },
  { pattern: /jsdoc|comment|docstring|readme|docs?|explain/i,         category: 'docs' },
  { pattern: /test|spec|coverage|assert/i,                            category: 'test' },
  { pattern: /logic|bug|incorrect|wrong|should be|inverted/i,         category: 'logic' },
];

/**
 * Classify a review comment into a category.
 *
 * @param {{ body: string }} comment
 * @returns {'security'|'style'|'docs'|'test'|'logic'|'other'}
 */
export function categorizeComment(comment) {
  const text = comment.body ?? '';
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return 'other';
}

// ── GitHub API helpers ─────────────────────────────────────────────

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN env var is required');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT,
  };
}

async function ghFetch(path, options = {}) {
  const res = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: { ...ghHeaders(), ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${options.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Fetch all open (unresolved) review comment threads for a pull request.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @returns {{ comments: Array<{id: number, body: string, path: string, line: number|null, diff_hunk: string, url: string}> }}
 */
export async function fetchOpenReviewComments(owner, repo, pullNumber) {
  const data = await ghFetch(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments?per_page=100`);
  const comments = (Array.isArray(data) ? data : []).map(c => ({
    id:         c.id,
    body:       c.body ?? '',
    path:       c.path ?? '',
    line:       c.line ?? c.original_line ?? null,
    diff_hunk:  c.diff_hunk ?? '',
    url:        c.html_url ?? '',
    in_reply_to_id: c.in_reply_to_id ?? null,
  })).filter(c => !c.in_reply_to_id); // top-level comments only

  return { comments };
}

/**
 * Fetch the current file content from the PR branch.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} filePath
 * @param {string} branch
 * @returns {{ content: string, sha: string }}
 */
export async function fetchFileContent(owner, repo, filePath, branch) {
  const data = await ghFetch(
    `/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`
  );
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content, sha: data.sha };
}

/**
 * Generate a targeted code fix for a single review comment using the LLM.
 *
 * @param {{ body: string, path: string, diff_hunk: string, line: number|null }} comment
 * @param {string} fileContent  Current content of the file being changed
 * @param {{ model?: string }} [opts]
 * @returns {{ fixed_content: string|null, description: string, confidence: number, requires_human_review: boolean }}
 */
export async function generateCommentFix(comment, fileContent, opts = {}) {
  const model = opts.model ?? 'gpt-4o-mini';
  const category = categorizeComment(comment);

  if (HUMAN_REVIEW_CATEGORIES.includes(category)) {
    return {
      fixed_content: null,
      description: `Security concern flagged — human review required`,
      confidence: 0,
      requires_human_review: true,
    };
  }

  const isProtectedFile = PROTECTED_FILE_PATTERNS.some(p => p.test(comment.path));
  if (isProtectedFile) {
    return {
      fixed_content: null,
      description: `Protected file — autonomous modification not allowed`,
      confidence: 0,
      requires_human_review: true,
    };
  }

  const systemPrompt = [
    'You are a software engineer addressing a code review comment.',
    'Given the comment, the relevant diff hunk, and the full file content,',
    'produce an updated version of the file that addresses the reviewer\'s concern.',
    'Make the minimum necessary change. Preserve all unrelated code exactly.',
    'Respond ONLY with valid JSON:',
    '{ "fixed_content": "<full updated file content>", "description": "<what you changed>", "confidence": 0.0, "requires_human_review": false }',
    'Set requires_human_review=true if you are not confident the change is correct.',
  ].join(' ');

  const userMessage = [
    `Review comment: ${comment.body}`,
    `File: ${comment.path}`,
    `Diff hunk:\n${comment.diff_hunk}`,
    `Full file content:\n${fileContent.slice(0, FILE_CONTEXT_CHARS)}`,
  ].join('\n\n');

  let rawText = '';
  try {
    const mod = await import('../../lib/llm-router.js').catch(
      () => import('../../lib/llm-router.ts').catch(() => null)
    );
    if (mod?.complete) {
      const result = await mod.complete({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
        maxTokens: 2_048,
        queueClass: 'P2',
      });
      rawText = result.content;
    }
  } catch {
    // LLM unavailable
  }

  try {
    const parsed = JSON.parse(rawText);
    return {
      fixed_content:         parsed.fixed_content          ?? null,
      description:           parsed.description            ?? '',
      confidence:            typeof parsed.confidence === 'number' ? parsed.confidence : 0.4,
      requires_human_review: Boolean(parsed.requires_human_review),
    };
  } catch {
    return {
      fixed_content: null,
      description: 'Unable to generate fix — manual resolution required',
      confidence: 0,
      requires_human_review: true,
    };
  }
}

/**
 * Apply a batch of comment fixes as individual commits on the PR branch.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @param {Array<{comment_id: number, path: string, fixed_content: string, description: string}>} fixBatch
 * @returns {{ applied: number, skipped: number, results: Array<{comment_id: number, committed: boolean, sha?: string}> }}
 */
export async function applyCommentFixes(owner, repo, branch, fixBatch) {
  let applied = 0;
  let skipped = 0;
  const results = [];

  for (const fix of fixBatch) {
    if (!fix.fixed_content) {
      skipped++;
      results.push({ comment_id: fix.comment_id, committed: false });
      continue;
    }

    try {
      // Get current file SHA
      const fileData = await ghFetch(
        `/repos/${owner}/${repo}/contents/${fix.path}?ref=${encodeURIComponent(branch)}`
      );

      // Update file via Contents API
      const updateData = await ghFetch(`/repos/${owner}/${repo}/contents/${fix.path}`, {
        method: 'PUT',
        body: JSON.stringify({
          message:  `fix(review): ${fix.description}`,
          content:  Buffer.from(fix.fixed_content).toString('base64'),
          sha:      fileData.sha,
          branch,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      applied++;
      results.push({ comment_id: fix.comment_id, committed: true, sha: updateData.commit?.sha });
    } catch (err) {
      skipped++;
      results.push({ comment_id: fix.comment_id, committed: false, error: err.message });
    }
  }

  return { applied, skipped, results };
}

/**
 * Post a summary reply comment on the pull request listing all addressed items.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @param {{ applied: number, skipped: number, descriptions: string[] }} summary
 * @returns {{ comment_url: string }}
 */
export async function postResolutionSummary(owner, repo, pullNumber, summary) {
  const lines = [
    `## 🤖 OpenClaw Review Comment Resolution`,
    ``,
    `Processed **${summary.applied + summary.skipped}** review comment(s):`,
    `- ✅ **${summary.applied}** applied automatically`,
    `- ⚠️ **${summary.skipped}** skipped (require human review)`,
    ``,
  ];

  if (summary.descriptions.length > 0) {
    lines.push('### Changes Made');
    for (const desc of summary.descriptions) {
      lines.push(`- ${desc}`);
    }
  }

  lines.push('', '---', '*Generated by OpenClaw `gh-address-comments` skill. Review each commit before merging.*');

  const data = await ghFetch(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: lines.join('\n') }),
    headers: { 'Content-Type': 'application/json' },
  });

  return { comment_url: data.html_url };
}

/**
 * Full end-to-end workflow: fetch comments → categorize → fix → commit → summarize.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number} pullNumber
 * @param {string} branch  PR head branch
 * @param {{ model?: string }} [opts]
 * @returns {{ applied: number, skipped: number, comment_url?: string }}
 */
export async function runAddressCommentsWorkflow(owner, repo, pullNumber, branch, opts = {}) {
  const { comments } = await fetchOpenReviewComments(owner, repo, pullNumber);
  if (comments.length === 0) {
    return { applied: 0, skipped: 0, reason: 'No open review comments' };
  }

  const fixBatch = [];
  const descriptions = [];

  for (const comment of comments) {
    const category = categorizeComment(comment);

    // Skip human-review and other categories
    if (HUMAN_REVIEW_CATEGORIES.includes(category) || category === 'other') {
      fixBatch.push({ comment_id: comment.id, path: comment.path, fixed_content: null, description: `Skipped (${category})` });
      continue;
    }

    let fileContent = '';
    try {
      const fetched = await fetchFileContent(owner, repo, comment.path, branch);
      fileContent = fetched.content;
    } catch {
      fixBatch.push({ comment_id: comment.id, path: comment.path, fixed_content: null, description: 'Could not fetch file' });
      continue;
    }

    const fix = await generateCommentFix(comment, fileContent, opts);

    // Only apply if confidence meets threshold
    const meetsThreshold = category === 'logic'
      ? fix.confidence >= LOGIC_CONFIDENCE_THRESHOLD
      : fix.confidence >= 0.5;

    if (fix.requires_human_review || !meetsThreshold || !fix.fixed_content) {
      fixBatch.push({ comment_id: comment.id, path: comment.path, fixed_content: null, description: fix.description });
    } else {
      fixBatch.push({ comment_id: comment.id, path: comment.path, fixed_content: fix.fixed_content, description: fix.description });
      descriptions.push(fix.description);
    }
  }

  const { applied, skipped } = await applyCommentFixes(owner, repo, branch, fixBatch);
  const { comment_url } = await postResolutionSummary(owner, repo, pullNumber, { applied, skipped, descriptions });

  return { applied, skipped, comment_url };
}
