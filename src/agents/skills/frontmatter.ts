import JSON5 from "json5";
import type { Skill } from "@mariozechner/pi-coding-agent";

import { LEGACY_MANIFEST_KEY } from "../../compat/legacy-names.js";
import { parseFrontmatterBlock } from "../../markdown/frontmatter.js";
import { parseBooleanValue } from "../../utils/boolean.js";
import type {
  MoltbotSkillMetadata,
  ParsedSkillFrontmatter,
  SkillEntry,
  SkillInstallSpec,
  SkillInvocationPolicy,
  SkillPermissions,
  SkillScope,
} from "./types.js";

export function parseFrontmatter(content: string): ParsedSkillFrontmatter {
  return parseFrontmatterBlock(content);
}

function normalizeStringList(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((value) => String(value).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

function parseInstallSpec(input: unknown): SkillInstallSpec | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Record<string, unknown>;
  const kindRaw =
    typeof raw.kind === "string" ? raw.kind : typeof raw.type === "string" ? raw.type : "";
  const kind = kindRaw.trim().toLowerCase();
  if (kind !== "brew" && kind !== "node" && kind !== "go" && kind !== "uv" && kind !== "download") {
    return undefined;
  }

  const spec: SkillInstallSpec = {
    kind: kind as SkillInstallSpec["kind"],
  };

  if (typeof raw.id === "string") spec.id = raw.id;
  if (typeof raw.label === "string") spec.label = raw.label;
  const bins = normalizeStringList(raw.bins);
  if (bins.length > 0) spec.bins = bins;
  const osList = normalizeStringList(raw.os);
  if (osList.length > 0) spec.os = osList;
  if (typeof raw.formula === "string") spec.formula = raw.formula;
  if (typeof raw.package === "string") spec.package = raw.package;
  if (typeof raw.module === "string") spec.module = raw.module;
  if (typeof raw.url === "string") spec.url = raw.url;
  if (typeof raw.archive === "string") spec.archive = raw.archive;
  if (typeof raw.extract === "boolean") spec.extract = raw.extract;
  if (typeof raw.stripComponents === "number") spec.stripComponents = raw.stripComponents;
  if (typeof raw.targetDir === "string") spec.targetDir = raw.targetDir;

  return spec;
}

function getFrontmatterValue(frontmatter: ParsedSkillFrontmatter, key: string): string | undefined {
  const raw = frontmatter[key];
  return typeof raw === "string" ? raw : undefined;
}

function parseFrontmatterBool(value: string | undefined, fallback: boolean): boolean {
  const parsed = parseBooleanValue(value);
  return parsed === undefined ? fallback : parsed;
}

export function resolveMoltbotMetadata(
  frontmatter: ParsedSkillFrontmatter,
): MoltbotSkillMetadata | undefined {
  const raw = getFrontmatterValue(frontmatter, "metadata");
  if (!raw) return undefined;
  try {
    const parsed = JSON5.parse(raw) as { moltbot?: unknown } & Partial<
      Record<typeof LEGACY_MANIFEST_KEY, unknown>
    >;
    if (!parsed || typeof parsed !== "object") return undefined;
    const metadataRaw = parsed.moltbot ?? parsed[LEGACY_MANIFEST_KEY];
    if (!metadataRaw || typeof metadataRaw !== "object") return undefined;
    const metadataObj = metadataRaw as Record<string, unknown>;
    const requiresRaw =
      typeof metadataObj.requires === "object" && metadataObj.requires !== null
        ? (metadataObj.requires as Record<string, unknown>)
        : undefined;
    const installRaw = Array.isArray(metadataObj.install) ? (metadataObj.install as unknown[]) : [];
    const install = installRaw
      .map((entry) => parseInstallSpec(entry))
      .filter((entry): entry is SkillInstallSpec => Boolean(entry));
    const osRaw = normalizeStringList(metadataObj.os);
    return {
      always: typeof metadataObj.always === "boolean" ? metadataObj.always : undefined,
      emoji: typeof metadataObj.emoji === "string" ? metadataObj.emoji : undefined,
      homepage: typeof metadataObj.homepage === "string" ? metadataObj.homepage : undefined,
      skillKey: typeof metadataObj.skillKey === "string" ? metadataObj.skillKey : undefined,
      primaryEnv: typeof metadataObj.primaryEnv === "string" ? metadataObj.primaryEnv : undefined,
      os: osRaw.length > 0 ? osRaw : undefined,
      requires: requiresRaw
        ? {
            bins: normalizeStringList(requiresRaw.bins),
            anyBins: normalizeStringList(requiresRaw.anyBins),
            env: normalizeStringList(requiresRaw.env),
            config: normalizeStringList(requiresRaw.config),
          }
        : undefined,
      install: install.length > 0 ? install : undefined,
    };
  } catch {
    return undefined;
  }
}

export function resolveSkillInvocationPolicy(
  frontmatter: ParsedSkillFrontmatter,
): SkillInvocationPolicy {
  return {
    userInvocable: parseFrontmatterBool(getFrontmatterValue(frontmatter, "user-invocable"), true),
    disableModelInvocation: parseFrontmatterBool(
      getFrontmatterValue(frontmatter, "disable-model-invocation"),
      false,
    ),
  };
}

export function resolveSkillKey(skill: Skill, entry?: SkillEntry): string {
  return entry?.metadata?.skillKey ?? skill.name;
}

const VALID_SCOPES = new Set<SkillScope>([
  "conversation-only",
  "read-only",
  "workspace",
  "read-write",
  "full",
  "custom",
]);

const VALID_DELEGATION = new Set(["opus", "none", "any"]);
const VALID_EXTERNAL = new Set(["none", "read", "full"]);

const DEFAULT_SKILL_PERMISSIONS: SkillPermissions = {
  scope: "conversation-only",
  delegation: "opus",
  external: "none",
};

/**
 * Parse a bracket-delimited list like `[read, write, group:web]` into an array of strings.
 * Returns undefined if the input is empty or not a bracket list.
 */
function parseBracketList(raw: string): string[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return undefined;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return undefined;
  return inner
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extract the `## Permissions` section from SKILL.md content and return the lines
 * between the heading and the next `##` heading (or EOF).
 */
function extractPermissionsSection(content: string): string | undefined {
  const lines = content.split("\n");
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+permissions\s*$/i.test(lines[i].trim())) {
      startIndex = i + 1;
      break;
    }
  }
  if (startIndex === -1) return undefined;

  let endIndex = lines.length;
  for (let i = startIndex; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      endIndex = i;
      break;
    }
  }

  const section = lines.slice(startIndex, endIndex).join("\n").trim();
  return section || undefined;
}

/**
 * Parse the `## Permissions` section from a SKILL.md file into a structured object.
 *
 * Format:
 * ```markdown
 * ## Permissions
 *
 * scope: workspace
 * tools:
 *   allow: [read, write, web_fetch]
 *   deny: [exec, deploy]
 * delegation: opus
 * external: read
 * ```
 *
 * Returns the default permissions if no `## Permissions` section exists.
 */
export function parseSkillPermissions(content: string): SkillPermissions {
  const section = extractPermissionsSection(content);
  if (!section) return { ...DEFAULT_SKILL_PERMISSIONS };

  const lines = section.split("\n");
  let scope: SkillScope = "conversation-only";
  let delegation: SkillPermissions["delegation"] = "opus";
  let external: SkillPermissions["external"] = "none";
  let toolsAllow: string[] | undefined;
  let toolsDeny: string[] | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!match) {
      // Check for indented tools sub-keys (allow: / deny:)
      const subMatch = line.match(/^\s+(allow|deny):\s*(.*)$/);
      if (subMatch) {
        const key = subMatch[1];
        const value = subMatch[2].trim();
        const list = parseBracketList(value);
        if (key === "allow" && list) toolsAllow = list;
        if (key === "deny" && list) toolsDeny = list;
      }
      continue;
    }

    const key = match[1].toLowerCase();
    const value = match[2].trim();

    if (key === "scope") {
      const normalized = value.toLowerCase() as SkillScope;
      scope = VALID_SCOPES.has(normalized) ? normalized : "conversation-only";
    } else if (key === "delegation") {
      const normalized = value.toLowerCase();
      delegation = VALID_DELEGATION.has(normalized)
        ? (normalized as SkillPermissions["delegation"])
        : "opus";
    } else if (key === "external") {
      const normalized = value.toLowerCase();
      external = VALID_EXTERNAL.has(normalized)
        ? (normalized as SkillPermissions["external"])
        : "none";
    }
    // "tools:" key is handled implicitly — its sub-keys are parsed above
  }

  const result: SkillPermissions = { scope, delegation, external };
  if (toolsAllow || toolsDeny) {
    result.tools = {};
    if (toolsAllow) result.tools.allow = toolsAllow;
    if (toolsDeny) result.tools.deny = toolsDeny;
  }
  return result;
}
