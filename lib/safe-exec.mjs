/**
 * Safe Command Execution
 * OpenClaw Multi-Agent Network
 *
 * Provides shell-injection-safe wrappers for executing the openclaw CLI.
 * Uses execFile (no shell interpretation) instead of exec (shell).
 */

import { execFile } from "child_process";
import { promisify } from "util";

import {
  enforceAgentCapability,
  enforceSkillRegistry,
} from "./security-governance.mjs";

const execFileAsync = promisify(execFile);

function actionFamilyForChannel(channel) {
  if (channel === "email") {
    return "email_send";
  }

  return null;
}

/**
 * Send a message via the openclaw CLI without shell interpretation.
 * Safe against command injection because arguments are passed as an array.
 */
export async function openclawSend({
  agent,
  channel,
  to,
  message,
  correlationId = null,
}) {
  await enforceSkillRegistry({
    externalSystem: channel,
    operation: "openclaw_send",
    correlationId,
    metadata: { to },
  });

  await enforceAgentCapability({
    agentId: agent,
    tool: "agent_messaging",
    channel,
    actionFamily: actionFamilyForChannel(channel),
    correlationId,
    metadata: { to },
  });

  const args = ["send", "--agent", agent, "--channel", channel, "--to", to, message];
  try {
    const { stdout } = await execFileAsync("openclaw", args);
    return stdout;
  } catch (error) {
    console.error(`Failed to send via openclaw (agent=${agent}, channel=${channel}):`, error.message);
    throw error;
  }
}

/**
 * Send a message to an agent via the openclaw CLI without shell interpretation.
 */
export async function openclawMessage({ agent, message, correlationId = null }) {
  await enforceSkillRegistry({
    externalSystem: "openclaw-agent",
    operation: "openclaw_message",
    correlationId,
  });

  await enforceAgentCapability({
    agentId: agent,
    tool: "agent_messaging",
    correlationId,
  });

  const args = ["message", "--agent", agent, message];
  try {
    const { stdout } = await execFileAsync("openclaw", args);
    return stdout;
  } catch (error) {
    console.error(`Failed to message agent ${agent}:`, error.message);
    throw error;
  }
}
