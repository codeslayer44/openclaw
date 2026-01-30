import type { Skill } from "@mariozechner/pi-coding-agent";

export type SkillInstallSpec = {
  id?: string;
  kind: "brew" | "node" | "go" | "uv" | "download";
  label?: string;
  bins?: string[];
  os?: string[];
  formula?: string;
  package?: string;
  module?: string;
  url?: string;
  archive?: string;
  extract?: boolean;
  stripComponents?: number;
  targetDir?: string;
};

export type MoltbotSkillMetadata = {
  always?: boolean;
  skillKey?: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  os?: string[];
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  install?: SkillInstallSpec[];
};

export type SkillInvocationPolicy = {
  userInvocable: boolean;
  disableModelInvocation: boolean;
};

export type SkillCommandDispatchSpec = {
  kind: "tool";
  /** Name of the tool to invoke (AnyAgentTool.name). */
  toolName: string;
  /**
   * How to forward user-provided args to the tool.
   * - raw: forward the raw args string (no core parsing).
   */
  argMode?: "raw";
};

export type SkillCommandSpec = {
  name: string;
  skillName: string;
  description: string;
  /** Optional deterministic dispatch behavior for this command. */
  dispatch?: SkillCommandDispatchSpec;
};

export type SkillsInstallPreferences = {
  preferBrew: boolean;
  nodeManager: "npm" | "pnpm" | "yarn" | "bun";
};

export type ParsedSkillFrontmatter = Record<string, string>;

export type SkillMemoryWriteEntry = {
  key: string;
  append: string;
};

export type SkillScope =
  | "conversation-only"
  | "read-only"
  | "workspace"
  | "read-write"
  | "full"
  | "custom";

export type SkillPermissions = {
  scope: SkillScope;
  tools?: { allow?: string[]; deny?: string[] };
  delegation: "opus" | "none" | "any";
  external: "none" | "read" | "full";
};

export type SkillEntry = {
  skill: Skill;
  frontmatter: ParsedSkillFrontmatter;
  metadata?: MoltbotSkillMetadata;
  invocation?: SkillInvocationPolicy;
  permissions?: SkillPermissions;
};

export type SkillEligibilityContext = {
  remote?: {
    platforms: string[];
    hasBin: (bin: string) => boolean;
    hasAnyBin: (bins: string[]) => boolean;
    note?: string;
  };
  userTier?: import("../user-tier.js").UserTier;
};

export type SkillSnapshot = {
  prompt: string;
  skills: Array<{ name: string; primaryEnv?: string }>;
  resolvedSkills?: Skill[];
  version?: number;
  /** Effective skill permissions (most restrictive of all loaded skills). */
  activePermissions?: SkillPermissions;
  /** Concatenated skill memory content (defaults + per-user) loaded at prompt resolution. */
  memoryPrompt?: string;
};
