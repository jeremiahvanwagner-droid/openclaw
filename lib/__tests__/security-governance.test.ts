import { beforeEach, describe, expect, it, vi } from "vitest";

const { logAgentEvent } = vi.hoisted(() => ({
  logAgentEvent: vi.fn().mockResolvedValue("evt-security"),
}));

vi.mock("../human-approval.mjs", () => ({
  logAgentEvent,
}));

import {
  enforceAgentCapability,
  enforceSkillRegistry,
  getAgentCapabilityPolicy,
} from "../security-governance";

describe("security-governance", () => {
  beforeEach(() => {
    logAgentEvent.mockClear();
    delete process.env.OPENCLAW_CAPABILITY_ENFORCEMENT_MODE;
    delete process.env.OPENCLAW_SKILL_REGISTRY_ENFORCEMENT_MODE;
  });

  it("derives capability policy from configured agent tools and delivery channels", async () => {
    const policy = await getAgentCapabilityPolicy("shared_exec_orchestrator");

    expect(policy).not.toBeNull();
    expect(policy?.allowed_channels).toContain("telegram");
    expect(policy?.allowed_action_families).toContain("ghl_write");
  });

  it("blocks disallowed channels when capability enforcement is fail-closed", async () => {
    process.env.OPENCLAW_CAPABILITY_ENFORCEMENT_MODE = "fail";

    await expect(
      enforceAgentCapability({
        agentId: "marketing",
        channel: "msteams",
        tool: "agent_messaging",
      }),
    ).rejects.toThrow('Agent "marketing" is not allowed to use channel "msteams"');
  });

  it("allows registered risky skills on declared external systems", async () => {
    process.env.OPENCLAW_SKILL_REGISTRY_ENFORCEMENT_MODE = "fail";

    const result = await enforceSkillRegistry({
      skillId: "social-media-publisher",
      externalSystem: "browser",
      operation: "publish",
    });

    expect(result.allowed).toBe(true);
  });

  it("blocks risky skills from undeclared external systems in fail mode", async () => {
    process.env.OPENCLAW_SKILL_REGISTRY_ENFORCEMENT_MODE = "fail";

    await expect(
      enforceSkillRegistry({
        skillId: "social-media-publisher",
        externalSystem: "telegram",
        operation: "publish",
      }),
    ).rejects.toThrow(
      'Skill "social-media-publisher" is not allowed to use external system "telegram"',
    );
  });
});
