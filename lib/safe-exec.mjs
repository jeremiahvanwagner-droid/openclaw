/**
 * Safe Command Execution
 * OpenClaw Multi-Agent Network
 *
 * Provides shell-injection-safe wrappers for executing the openclaw CLI.
 * Uses execFile (no shell interpretation) instead of exec (shell).
 *
 * CLI verified against OpenClaw 2026.6.11 (audit 2026-07-12-003):
 * channel delivery is `openclaw message send`, agent turns are
 * `openclaw agent` — there is no top-level `send` and `message` takes
 * no --agent flag.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Deliver a message to a channel recipient via the openclaw CLI.
 * `agent` is accepted for backward compatibility but channel delivery
 * is not agent-scoped in this CLI.
 */
export async function openclawSend({ agent, channel, to, message }) {
  const args = ['message', 'send', '--channel', channel, '--target', to, '--message', message];
  try {
    const { stdout } = await execFileAsync('openclaw', args);
    return stdout;
  } catch (error) {
    console.error(`Failed to send via openclaw (agent=${agent}, channel=${channel}):`, error.message);
    throw error;
  }
}

/**
 * Run one agent turn via the Gateway and return the agent's reply (stdout).
 * No --deliver: the reply comes back to the caller instead of being posted
 * to any channel — callers decide what to do with it (RTL appends it to the
 * DRY_RUN transcript).
 */
export async function openclawMessage({ agent, message }) {
  const args = ['agent', '--agent', agent, '--message', message, '--json'];
  try {
    const { stdout } = await execFileAsync('openclaw', args, { maxBuffer: 8 * 1024 * 1024 });
    // stdout carries CLI banner noise before the JSON document — parse from
    // the first '{' and return the assistant's text payloads only.
    const start = stdout.indexOf('{');
    if (start >= 0) {
      try {
        const doc = JSON.parse(stdout.slice(start));
        // The CLI emits either { payloads: [...] } or a run envelope
        // { runId, status, result: { payloads: [...] } } — accept both.
        const payloads = doc.payloads || doc.result?.payloads || [];
        const texts = payloads.map(p => p && p.text).filter(Boolean);
        if (texts.length) return texts.join('\n\n');
      } catch {
        // fall through to raw stdout
      }
    }
    return stdout;
  } catch (error) {
    console.error(`Failed to message agent ${agent}:`, error.message);
    throw error;
  }
}
