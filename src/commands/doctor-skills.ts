import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadWorkspaceSkillEntries } from "../agents/skills/workspace.js";
import type { MoltbotConfig } from "../config/config.js";
import { note } from "../terminal/note.js";

/**
 * Check skills for missing frontmatter blocks. Skills created manually
 * (by agents or users writing files directly) can silently lack the
 * YAML frontmatter delimiters, causing them to be missing description,
 * metadata, and invocation policy.
 */
export function noteSkillFrontmatterHealth(cfg: MoltbotConfig) {
  const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
  const entries = loadWorkspaceSkillEntries(workspaceDir, { config: cfg });

  const missingFrontmatter = entries.filter((entry) => Object.keys(entry.frontmatter).length === 0);
  if (missingFrontmatter.length === 0) return;

  const lines = missingFrontmatter.map(
    (entry) => `- ${entry.skill.name} (${entry.skill.filePath})`,
  );
  note(
    [
      `${missingFrontmatter.length} skill(s) missing frontmatter block:`,
      ...lines,
      "",
      "Add a YAML frontmatter block (--- delimiters) with at least",
      '"description" for proper skill indexing and invocation.',
    ].join("\n"),
    "Skills frontmatter",
  );
}
