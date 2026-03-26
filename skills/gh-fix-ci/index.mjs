/**
 * GitHub CI Fix — Core Logic
 * OpenClaw Development Skill
 *
 * Fetches failing GitHub Actions CI logs, clusters failures by root cause,
 * prompts an LLM for minimal targeted fixes, and opens a pull request
 * with the proposed patch for human review and merge.
 *
 * Safety: Never force-pushes to protected branches. Production fixes
 * always require human approval.
 */

// ── Constants ──────────────────────────────────────────────────────

const GH_API = 'https://api.github.com';
const USER_AGENT = 'OpenClaw-GhFixCi/1.0';

/** Maximum number of log characters to include in the LLM prompt. */
const LOG_EXCERPT_CHARS = 4_000;

/** Maximum lines changed per automated patch. */
const MAX_PATCH_LINES = 50;

/** Branches that require human approval before merge. */
const PROTECTED_BRANCHES = ['main', 'master', 'production', 'prod', 'release'];

/**
 * Returns true if the branch name matches a protected branch exactly,
 * or starts with a protected branch name followed by a slash
 * (e.g. "main/hotfix" is protected but "main-feature" is not).
 * @private
 */
function isProtectedBranch(branch) {
  return PROTECTED_BRANCHES.some(
    b => branch === b || branch.startsWith(`${b}/`)
  );
}

// ── Failure classifier ─────────────────────────────────────────────

const FAILURE_SIGNATURES = [
  { pattern: /Cannot find module|Module not found|ERR_MODULE_NOT_FOUND/i, category: 'missing_dep',   autoFixSafe: true  },
  { pattern: /eslint|tsc|TypeScript error|type error/i,                   category: 'lint_error',    autoFixSafe: true  },
  { pattern: /Timeout|exceeded.*\d+ms/i,                                   category: 'test_timeout',  autoFixSafe: false },
  { pattern: /missing.*env|ENOENT.*\.env|required env/i,                   category: 'build_config',  autoFixSafe: false },
  { pattern: /flak(y|iness)|intermittent|retry/i,                          category: 'flaky_test',    autoFixSafe: true  },
  { pattern: /401|403|Unauthorized|Forbidden|auth.*expired/i,              category: 'auth_expired',  autoFixSafe: false },
  { pattern: /OutOfMemory|heap.*limit/i,                                    category: 'memory',        autoFixSafe: false },
  { pattern: /ECONNREFUSED|network.*error|fetch.*failed/i,                  category: 'network',       autoFixSafe: false },
];

/**
 * Classify a CI failure log into a root-cause category.
 *
 * @param {string} logText
 * @returns {{ category: string, autoFixSafe: boolean }}
 */
export function classifyCiFailure(logText) {
  for (const sig of FAILURE_SIGNATURES) {
    if (sig.pattern.test(logText)) {
      return { category: sig.category, autoFixSafe: sig.autoFixSafe };
    }
  }
  return { category: 'unknown', autoFixSafe: false };
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
 * List recently failed workflow runs for the repository.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {{ limit?: number, branch?: string }} [opts]
 * @returns {{ runs: Array<{id: number, name: string, branch: string, html_url: string, created_at: string}> }}
 */
export async function fetchFailingRuns(owner, repo, opts = {}) {
  const limit  = opts.limit  ?? 10;
  const branch = opts.branch ?? '';
  const qs = new URLSearchParams({ status: 'failure', per_page: String(limit) });
  if (branch) qs.set('branch', branch);

  const data = await ghFetch(`/repos/${owner}/${repo}/actions/runs?${qs}`);
  const runs = (data.workflow_runs ?? []).map(r => ({
    id:         r.id,
    name:       r.name,
    branch:     r.head_branch,
    html_url:   r.html_url,
    created_at: r.created_at,
  }));

  return { runs };
}

/**
 * Download and parse the failure logs for a workflow run.
 * Returns the first `LOG_EXCERPT_CHARS` characters of the combined failed-job output.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number} runId
 * @returns {{ log_excerpt: string, failed_jobs: string[], job_count: number }}
 */
export async function extractFailureLogs(owner, repo, runId) {
  // List jobs for the run
  const jobsData = await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
  const failedJobs = (jobsData.jobs ?? []).filter(j => j.conclusion === 'failure');

  const logChunks = [];
  for (const job of failedJobs) {
    try {
      // GitHub redirects to the raw log URL
      const logRes = await fetch(
        `${GH_API}/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`,
        { headers: ghHeaders() }
      );
      if (logRes.ok) {
        const text = await logRes.text();
        logChunks.push(`## Job: ${job.name}\n${text}`);
      }
    } catch {
      // Skip jobs whose logs are unavailable
    }
  }

  const fullLog = logChunks.join('\n\n');
  const logExcerpt = fullLog.slice(0, LOG_EXCERPT_CHARS);

  return {
    log_excerpt: logExcerpt,
    failed_jobs: failedJobs.map(j => j.name),
    job_count: failedJobs.length,
  };
}

/**
 * Use the LLM to suggest a minimal fix for the CI failure.
 *
 * @param {{ log_excerpt: string, category: string, owner: string, repo: string }} failureContext
 * @param {{ model?: string }} [opts]
 * @returns {{ description: string, patch_hint: string, files: Array<{path: string, change: string}>, confidence: number, requires_human_review: boolean }}
 */
export async function generateCiFix(failureContext, opts = {}) {
  const model = opts.model ?? 'gpt-4o-mini';

  const systemPrompt = [
    'You are a DevOps engineer fixing a failing GitHub Actions CI pipeline.',
    'Given the failure log and category, suggest a minimal targeted fix.',
    `The patch must change fewer than ${MAX_PATCH_LINES} lines total.`,
    'Respond ONLY with valid JSON:',
    '{ "description": "", "patch_hint": "", "files": [{"path": "", "change": ""}], "confidence": 0.0, "requires_human_review": false }',
    '"files" is the list of files to modify with a short description of the change.',
    'Set requires_human_review=true for auth, secrets, or infra changes.',
  ].join(' ');

  const userMessage = [
    `Repository: ${failureContext.owner}/${failureContext.repo}`,
    `Failure category: ${failureContext.category}`,
    `Log excerpt:\n${failureContext.log_excerpt}`,
  ].join('\n');

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
        maxTokens: 768,
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
      description:          parsed.description          ?? '',
      patch_hint:           parsed.patch_hint           ?? '',
      files:                Array.isArray(parsed.files) ? parsed.files : [],
      confidence:           typeof parsed.confidence === 'number' ? parsed.confidence : 0.4,
      requires_human_review: Boolean(parsed.requires_human_review),
    };
  } catch {
    return {
      description:           `Investigate ${failureContext.category} failure`,
      patch_hint:            'Manual investigation required',
      files:                 [],
      confidence:            0.3,
      requires_human_review: true,
    };
  }
}

/**
 * Commit fix files to a feature branch.
 * Refuses to commit directly to protected branches — opens a PR instead.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} targetBranch  Branch where the fix applies (e.g. 'main')
 * @param {Array<{path: string, content: string}>} files  Files to create/update
 * @param {string} message  Commit message
 * @returns {{ committed: boolean, branch: string, sha?: string, error?: string }}
 */
export async function commitFix(owner, repo, targetBranch, files, message) {
  const isProtected = isProtectedBranch(targetBranch);
  const fixBranch = isProtected
    ? `openclaw/ci-fix-${Date.now()}`
    : targetBranch;

  if (files.length === 0) {
    return { committed: false, branch: fixBranch, error: 'No files to commit' };
  }

  try {
    // Get HEAD SHA of target branch
    const refData = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${targetBranch}`);
    const baseSha = refData.object.sha;

    // Create new branch if needed
    if (isProtected) {
      await ghFetch(`/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${fixBranch}`, sha: baseSha }),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get current tree
    const commitData = await ghFetch(`/repos/${owner}/${repo}/git/commits/${baseSha}`);
    const baseTreeSha = commitData.tree.sha;

    // Build new tree blobs
    const treeItems = await Promise.all(files.map(async f => {
      const blobData = await ghFetch(`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
        headers: { 'Content-Type': 'application/json' },
      });
      return { path: f.path, mode: '100644', type: 'blob', sha: blobData.sha };
    }));

    // Create new tree
    const newTree = await ghFetch(`/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
      headers: { 'Content-Type': 'application/json' },
    });

    // Create commit
    const newCommit = await ghFetch(`/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
      headers: { 'Content-Type': 'application/json' },
    });

    // Update branch ref
    await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${fixBranch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha }),
      headers: { 'Content-Type': 'application/json' },
    });

    return { committed: true, branch: fixBranch, sha: newCommit.sha };
  } catch (err) {
    return { committed: false, branch: fixBranch, error: err.message };
  }
}

/**
 * Open a pull request on GitHub with the fix details.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} headBranch  Branch containing the fix
 * @param {string} baseBranch  Target branch (e.g. 'main')
 * @param {string} body        PR description
 * @returns {{ pr_url: string, pr_number: number }}
 */
export async function openFixPullRequest(owner, repo, headBranch, baseBranch, body) {
  const title = `fix(ci): autonomous CI repair — ${new Date().toISOString().slice(0, 10)}`;
  const data = await ghFetch(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, head: headBranch, base: baseBranch, body }),
    headers: { 'Content-Type': 'application/json' },
  });

  return { pr_url: data.html_url, pr_number: data.number };
}

/**
 * Full end-to-end CI fix workflow.
 *
 * 1. Fetch failing runs
 * 2. Extract logs from the most recent failure
 * 3. Classify the failure
 * 4. Generate a fix proposal
 * 5. Commit to a feature branch and open a PR
 *
 * @param {string} owner
 * @param {string} repo
 * @param {{ branch?: string, model?: string }} [opts]
 * @returns {{ run_id: number, category: string, pr_url?: string, pr_number?: number, skipped?: boolean, reason?: string }}
 */
export async function runCiFixWorkflow(owner, repo, opts = {}) {
  const { runs } = await fetchFailingRuns(owner, repo, { limit: 1, branch: opts.branch });
  if (runs.length === 0) {
    return { run_id: 0, category: 'none', skipped: true, reason: 'No failing runs found' };
  }

  const run = runs[0];
  const { log_excerpt } = await extractFailureLogs(owner, repo, run.id);
  const { category, autoFixSafe } = classifyCiFailure(log_excerpt);

  if (!autoFixSafe) {
    return { run_id: run.id, category, skipped: true, reason: `Category "${category}" requires human intervention` };
  }

  const fix = await generateCiFix({ log_excerpt, category, owner, repo }, { model: opts.model });

  if (fix.requires_human_review || fix.confidence < 0.5) {
    return { run_id: run.id, category, skipped: true, reason: `Low confidence (${fix.confidence}) or human review required` };
  }

  const branch = run.branch ?? opts.branch ?? 'main';
  const { committed, branch: fixBranch, sha, error: commitError } = await commitFix(
    owner,
    repo,
    branch,
    // convert patch hints to placeholder file objects — real patch application
    // would use the LLM's files array with fetched + patched content
    fix.files.map(f => ({ path: f.path, content: `# OpenClaw CI Fix\n# ${f.change}\n` })),
    `fix(ci): ${fix.description}`
  );

  if (!committed) {
    return { run_id: run.id, category, skipped: true, reason: commitError ?? 'Commit failed' };
  }

  const body = [
    `## OpenClaw Autonomous CI Fix`,
    ``,
    `**Run:** [#${run.id}](${run.html_url})`,
    `**Category:** \`${category}\``,
    `**Description:** ${fix.description}`,
    ``,
    `### Patch Hint`,
    fix.patch_hint,
    ``,
    `---`,
    `*Generated by OpenClaw \`gh-fix-ci\` skill. Review before merging.*`,
  ].join('\n');

  const { pr_url, pr_number } = await openFixPullRequest(owner, repo, fixBranch, branch, body);

  return { run_id: run.id, category, pr_url, pr_number, commit_sha: sha };
}
