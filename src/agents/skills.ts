import type { MoltbotConfig } from "../config/config.js";

export {
  hasBinary,
  isBundledSkillAllowed,
  isConfigPathTruthy,
  resolveBundledAllowlist,
  resolveConfigPath,
  resolveRuntimePlatform,
  resolveSkillConfig,
} from "./skills/config.js";
export {
  applySkillEnvOverrides,
  applySkillEnvOverridesFromSnapshot,
} from "./skills/env-overrides.js";
export { createSkillMemoryWriteTool, executeSkillMemoryWrite } from "./skills/memory-write.js";
export type { SkillMemoryContext } from "./skills/memory-write.js";
export { SkillPermissionLogger } from "./skills/permission-log.js";
export type { SkillExclusionEntry } from "./skills/permission-log.js";
export type {
  MoltbotSkillMetadata,
  SkillEligibilityContext,
  SkillCommandSpec,
  SkillEntry,
  SkillInstallSpec,
  SkillMemoryWriteEntry,
  SkillPermissions,
  SkillScope,
  SkillSnapshot,
  SkillsInstallPreferences,
} from "./skills/types.js";
export {
  buildWorkspaceSkillSnapshot,
  buildWorkspaceSkillsPrompt,
  buildWorkspaceSkillCommandSpecs,
  filterWorkspaceSkillEntries,
  loadSkillMemory,
  loadWorkspaceSkillEntries,
  resolveSkillsPromptForRun,
  sanitizeForFilename,
  syncSkillsToWorkspace,
} from "./skills/workspace.js";

export function resolveSkillsInstallPreferences(config?: MoltbotConfig) {
  const raw = config?.skills?.install;
  const preferBrew = raw?.preferBrew ?? true;
  const managerRaw = typeof raw?.nodeManager === "string" ? raw.nodeManager.trim() : "";
  const manager = managerRaw.toLowerCase();
  const nodeManager =
    manager === "pnpm" || manager === "yarn" || manager === "bun" || manager === "npm"
      ? (manager as "npm" | "pnpm" | "yarn" | "bun")
      : "npm";
  return { preferBrew, nodeManager };
}
