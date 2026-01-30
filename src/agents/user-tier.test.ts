import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../config/types.agents.js";
import {
  SCOPE_ORDER,
  TIER_SCOPE_CEILING,
  isScopeWithinCeiling,
  resolveUserTier,
  resolveUserTierToolPolicy,
  resolveDelegationOverride,
} from "./user-tier.js";
import type { SkillScope } from "./skills/types.js";
import type { MoltbotConfig } from "../config/config.js";

// ---------------------------------------------------------------------------
// resolveUserTier
// ---------------------------------------------------------------------------

describe("resolveUserTier", () => {
  const agentConfig: AgentConfig = {
    id: "main",
    users: {
      admins: ["telegram_7338489031"],
      trusted: ["telegram_1234567890", "whatsapp_+15551234567"],
    },
  };

  it("returns admin for user in admins list", () => {
    expect(resolveUserTier(agentConfig, "telegram", "7338489031")).toBe("admin");
  });

  it("returns trusted for user in trusted list", () => {
    expect(resolveUserTier(agentConfig, "telegram", "1234567890")).toBe("trusted");
  });

  it("returns trusted for whatsapp user in trusted list", () => {
    expect(resolveUserTier(agentConfig, "whatsapp", "+15551234567")).toBe("trusted");
  });

  it("returns default for unknown user", () => {
    expect(resolveUserTier(agentConfig, "telegram", "9999999999")).toBe("default");
  });

  it("returns default when no users config", () => {
    expect(resolveUserTier({ id: "test" }, "telegram", "7338489031")).toBe("default");
  });

  it("returns default when agentConfig is undefined", () => {
    expect(resolveUserTier(undefined, "telegram", "7338489031")).toBe("default");
  });

  it("returns undefined when channel is undefined (no tier restrictions)", () => {
    expect(resolveUserTier(agentConfig, undefined, "7338489031")).toBeUndefined();
  });

  it("returns undefined when senderId is undefined (no tier restrictions)", () => {
    expect(resolveUserTier(agentConfig, "telegram", undefined)).toBeUndefined();
  });

  it("returns undefined when both channel and senderId are undefined (no tier restrictions)", () => {
    expect(resolveUserTier(agentConfig, undefined, undefined)).toBeUndefined();
  });

  it("is case-sensitive for user matching", () => {
    expect(resolveUserTier(agentConfig, "Telegram", "7338489031")).toBe("default");
  });

  it("checks admins before trusted", () => {
    const config: AgentConfig = {
      id: "test",
      users: {
        admins: ["telegram_123"],
        trusted: ["telegram_123"],
      },
    };
    expect(resolveUserTier(config, "telegram", "123")).toBe("admin");
  });

  it("returns default when users block has empty arrays", () => {
    const config: AgentConfig = {
      id: "test",
      users: { admins: [], trusted: [] },
    };
    expect(resolveUserTier(config, "telegram", "7338489031")).toBe("default");
  });

  it("handles discord snowflake IDs", () => {
    const config: AgentConfig = {
      id: "test",
      users: { admins: ["discord_123456789012345678"] },
    };
    expect(resolveUserTier(config, "discord", "123456789012345678")).toBe("admin");
  });

  it("handles imessage email handles", () => {
    const config: AgentConfig = {
      id: "test",
      users: { trusted: ["imessage_user@icloud.com"] },
    };
    expect(resolveUserTier(config, "imessage", "user@icloud.com")).toBe("trusted");
  });
});

// ---------------------------------------------------------------------------
// TIER_SCOPE_CEILING
// ---------------------------------------------------------------------------

describe("TIER_SCOPE_CEILING", () => {
  it("admin has no ceiling", () => {
    expect(TIER_SCOPE_CEILING.admin).toBeNull();
  });

  it("trusted ceiling is read-write", () => {
    expect(TIER_SCOPE_CEILING.trusted).toBe("read-write");
  });

  it("default ceiling is workspace", () => {
    expect(TIER_SCOPE_CEILING.default).toBe("workspace");
  });
});

// ---------------------------------------------------------------------------
// SCOPE_ORDER
// ---------------------------------------------------------------------------

describe("SCOPE_ORDER", () => {
  it("has correct ordering", () => {
    expect(SCOPE_ORDER["conversation-only"]).toBeLessThan(SCOPE_ORDER["read-only"]);
    expect(SCOPE_ORDER["read-only"]).toBeLessThan(SCOPE_ORDER.workspace);
    expect(SCOPE_ORDER.workspace).toBeLessThan(SCOPE_ORDER["read-write"]);
    expect(SCOPE_ORDER["read-write"]).toBeLessThan(SCOPE_ORDER.full);
  });

  it("treats custom as equivalent to full", () => {
    expect(SCOPE_ORDER.custom).toBe(SCOPE_ORDER.full);
  });
});

// ---------------------------------------------------------------------------
// isScopeWithinCeiling
// ---------------------------------------------------------------------------

describe("isScopeWithinCeiling", () => {
  it("null ceiling allows any scope", () => {
    const allScopes: SkillScope[] = [
      "conversation-only",
      "read-only",
      "workspace",
      "read-write",
      "full",
      "custom",
    ];
    for (const scope of allScopes) {
      expect(isScopeWithinCeiling(scope, null)).toBe(true);
    }
  });

  describe("trusted ceiling (read-write)", () => {
    const ceiling: SkillScope = "read-write";

    it("allows conversation-only", () => {
      expect(isScopeWithinCeiling("conversation-only", ceiling)).toBe(true);
    });

    it("allows read-only", () => {
      expect(isScopeWithinCeiling("read-only", ceiling)).toBe(true);
    });

    it("allows workspace", () => {
      expect(isScopeWithinCeiling("workspace", ceiling)).toBe(true);
    });

    it("allows read-write", () => {
      expect(isScopeWithinCeiling("read-write", ceiling)).toBe(true);
    });

    it("blocks full", () => {
      expect(isScopeWithinCeiling("full", ceiling)).toBe(false);
    });

    it("blocks custom (treated as full)", () => {
      expect(isScopeWithinCeiling("custom", ceiling)).toBe(false);
    });
  });

  describe("default ceiling (workspace)", () => {
    const ceiling: SkillScope = "workspace";

    it("allows conversation-only", () => {
      expect(isScopeWithinCeiling("conversation-only", ceiling)).toBe(true);
    });

    it("allows read-only", () => {
      expect(isScopeWithinCeiling("read-only", ceiling)).toBe(true);
    });

    it("allows workspace", () => {
      expect(isScopeWithinCeiling("workspace", ceiling)).toBe(true);
    });

    it("blocks read-write", () => {
      expect(isScopeWithinCeiling("read-write", ceiling)).toBe(false);
    });

    it("blocks full", () => {
      expect(isScopeWithinCeiling("full", ceiling)).toBe(false);
    });

    it("blocks custom", () => {
      expect(isScopeWithinCeiling("custom", ceiling)).toBe(false);
    });
  });

  it("conversation-only ceiling only allows conversation-only", () => {
    const ceiling: SkillScope = "conversation-only";
    expect(isScopeWithinCeiling("conversation-only", ceiling)).toBe(true);
    expect(isScopeWithinCeiling("read-only", ceiling)).toBe(false);
    expect(isScopeWithinCeiling("workspace", ceiling)).toBe(false);
    expect(isScopeWithinCeiling("read-write", ceiling)).toBe(false);
    expect(isScopeWithinCeiling("full", ceiling)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveUserTierToolPolicy
// ---------------------------------------------------------------------------

describe("resolveUserTierToolPolicy", () => {
  it("admin returns undefined (no restriction)", () => {
    expect(resolveUserTierToolPolicy("admin")).toBeUndefined();
  });

  it("trusted includes memory tools", () => {
    const policy = resolveUserTierToolPolicy("trusted");
    expect(policy).toBeDefined();
    expect(policy!.allow).toContain("group:memory");
    expect(policy!.allow).toContain("group:fs");
    expect(policy!.allow).toContain("group:web");
    expect(policy!.allow).toContain("image");
    expect(policy!.allow).toContain("sessions_spawn");
    expect(policy!.allow).toContain("skill_memory_write");
  });

  it("default excludes memory tools", () => {
    const policy = resolveUserTierToolPolicy("default");
    expect(policy).toBeDefined();
    expect(policy!.allow).not.toContain("group:memory");
    expect(policy!.allow).toContain("group:fs");
    expect(policy!.allow).toContain("group:web");
    expect(policy!.allow).toContain("image");
    expect(policy!.allow).toContain("sessions_spawn");
    expect(policy!.allow).toContain("skill_memory_write");
  });

  it("default does not include runtime or session management tools", () => {
    const policy = resolveUserTierToolPolicy("default");
    expect(policy!.allow).not.toContain("group:runtime");
    expect(policy!.allow).not.toContain("group:sessions");
    expect(policy!.allow).not.toContain("group:automation");
    expect(policy!.allow).not.toContain("group:moltbot");
  });

  it("trusted does not include runtime tools", () => {
    const policy = resolveUserTierToolPolicy("trusted");
    expect(policy!.allow).not.toContain("group:runtime");
    expect(policy!.allow).not.toContain("group:automation");
  });

  it("no deny list for any tier", () => {
    expect(resolveUserTierToolPolicy("trusted")?.deny).toBeUndefined();
    expect(resolveUserTierToolPolicy("default")?.deny).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveDelegationOverride
// ---------------------------------------------------------------------------

describe("resolveDelegationOverride", () => {
  it("admin returns undefined (no override)", () => {
    expect(resolveDelegationOverride("admin")).toBeUndefined();
  });

  it("trusted returns undefined (no override)", () => {
    expect(resolveDelegationOverride("trusted")).toBeUndefined();
  });

  it("default returns thinking: high", () => {
    const result = resolveDelegationOverride("default");
    expect(result).toBeDefined();
    expect(result!.thinking).toBe("high");
  });

  it("default returns no model when config has no defaultDelegationModel", () => {
    const result = resolveDelegationOverride("default");
    expect(result!.model).toBeUndefined();
  });

  it("default returns configured model from agents.defaults.users.defaultDelegationModel", () => {
    const config = {
      agents: {
        defaults: {
          users: {
            defaultDelegationModel: "anthropic/claude-sonnet-4-20250514",
          },
        },
      },
    } as unknown as MoltbotConfig;
    const result = resolveDelegationOverride("default", config);
    expect(result!.model).toBe("anthropic/claude-sonnet-4-20250514");
    expect(result!.thinking).toBe("high");
  });

  it("default ignores empty string model", () => {
    const config = {
      agents: {
        defaults: {
          users: {
            defaultDelegationModel: "  ",
          },
        },
      },
    } as unknown as MoltbotConfig;
    const result = resolveDelegationOverride("default", config);
    expect(result!.model).toBeUndefined();
  });

  it("default returns undefined model when config is undefined", () => {
    const result = resolveDelegationOverride("default", undefined);
    expect(result!.model).toBeUndefined();
    expect(result!.thinking).toBe("high");
  });
});
