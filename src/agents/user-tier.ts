import type { AgentConfig } from "../config/types.agents.js";
import type { MoltbotConfig } from "../config/config.js";
import type { SkillScope } from "./skills/types.js";
import type { ToolPolicyLike } from "./tool-policy.js";

export type UserTier = "admin" | "trusted" | "default";

/**
 * Maximum skill scope each tier can activate. `null` means no ceiling.
 */
export const TIER_SCOPE_CEILING: Record<UserTier, SkillScope | null> = {
  admin: null,
  trusted: "read-write",
  default: "workspace",
};

/**
 * Numeric ordering for scope comparison. Higher = more privileged.
 * `custom` is treated as `full` for ceiling comparison.
 */
export const SCOPE_ORDER: Record<SkillScope, number> = {
  "conversation-only": 0,
  "read-only": 1,
  workspace: 2,
  "read-write": 3,
  full: 4,
  custom: 4,
};

/**
 * Resolve a messaging platform user to a permission tier.
 *
 * Identity format: `{channel}_{senderId}` (e.g. `telegram_7338489031`).
 * If channel or senderId is missing, returns `undefined` — no tier
 * restrictions apply. This covers cron, heartbeat, API, and inter-agent
 * sessions that have no messaging platform sender.
 */
export function resolveUserTier(
  agentConfig: Pick<AgentConfig, "users"> | undefined,
  channel: string | undefined,
  senderId: string | undefined,
): UserTier | undefined {
  if (!channel || !senderId) return undefined;
  const userId = `${channel}_${senderId}`;
  const users = agentConfig?.users;
  if (!users) return "default";
  if (users.admins?.includes(userId)) return "admin";
  if (users.trusted?.includes(userId)) return "trusted";
  return "default";
}

/**
 * Check whether a skill scope falls within a tier's ceiling.
 *
 * A `null` ceiling (admin tier) permits any scope.
 */
export function isScopeWithinCeiling(scope: SkillScope, ceiling: SkillScope | null): boolean {
  if (ceiling === null) return true;
  return SCOPE_ORDER[scope] <= SCOPE_ORDER[ceiling];
}

/**
 * Resolve a tool policy for a user tier. The policy restricts which tools
 * are available based on the user's trust level.
 *
 * - `admin` → no restriction (returns `undefined`)
 * - `trusted` → fs, memory, web, image, sessions_spawn, skill_memory_write
 * - `default` → fs (workspace-sandboxed), web, image, sessions_spawn, skill_memory_write
 *
 * Note: `sessions_spawn` is included for default users because delegation
 * is part of the core skill arc. The model override (C10) ensures it spawns
 * a Sonnet-high worker, not Opus.
 */
export function resolveUserTierToolPolicy(userTier: UserTier): ToolPolicyLike | undefined {
  if (userTier === "admin") return undefined;
  if (userTier === "trusted") {
    return {
      allow: [
        "group:fs",
        "group:memory",
        "group:web",
        "image",
        "sessions_spawn",
        "skill_memory_write",
      ],
    };
  }
  // default tier: no memory tools, no runtime, no system tools
  return {
    allow: ["group:fs", "group:web", "image", "sessions_spawn", "skill_memory_write"],
  };
}

/**
 * Resolve delegation model/thinking overrides for a user tier.
 *
 * Default users get Sonnet with high thinking instead of Opus.
 * Admin and trusted users get no override (use skill-configured model).
 *
 * The Sonnet model can be configured via `agents.defaults.users.defaultDelegationModel`.
 * If not configured, only the thinking level is overridden (the model
 * falls through to the normal resolution chain, which typically picks
 * the subagent default model).
 */
export function resolveDelegationOverride(
  userTier: UserTier,
  config?: MoltbotConfig,
): { model?: string; thinking?: string } | undefined {
  if (userTier !== "default") return undefined;
  const sonnetModel = config?.agents?.defaults?.users?.defaultDelegationModel;
  return {
    model: typeof sonnetModel === "string" && sonnetModel.trim() ? sonnetModel.trim() : undefined,
    thinking: "high",
  };
}
