/**
 * Safe Command Execution
 * OpenClaw Multi-Agent Network
 *
 * Provides shell-injection-safe wrappers for executing the openclaw CLI.
 * Uses execFile (no shell interpretation) instead of exec (shell).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Send a message via the openclaw CLI without shell interpretation.
 * Safe against command injection — arguments are passed as an array.
 */
export async function openclawSend({ agent, channel, to, message }) {
  const args = ['send', '--agent', agent, '--channel', channel, '--to', to, message];
  try {
    const { stdout } = await execFileAsync('openclaw', args);
    return stdout;
  } catch (error) {
    console.error(`Failed to send via openclaw (agent=${agent}, channel=${channel}):`, error.message);
    throw error;
  }
}

/**
 * Send a message to an agent via the openclaw CLI without shell interpretation.
 */
export async function openclawMessage({ agent, message }) {
  const args = ['message', '--agent', agent, message];
  try {
    const { stdout } = await execFileAsync('openclaw', args);
    return stdout;
  } catch (error) {
    console.error(`Failed to message agent ${agent}:`, error.message);
    throw error;
  }
}
