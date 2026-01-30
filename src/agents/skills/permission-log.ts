import fs from "node:fs";
import path from "node:path";

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { serializeByKey } from "./serialize.js";
import type { SkillScope } from "./types.js";

const logger = createSubsystemLogger("skills");

/**
 * Threshold: when a tool exclusion count reaches this value within a session,
 * an entry is written to the skill's `learnings.md`.
 *
 * With creation-time filtering, this represents the number of sessions where
 * the same tool was excluded by the skill's scope. Each call to
 * `logExclusion()` counts as one occurrence.
 */
const LEARNINGS_THRESHOLD = 3;

export type SkillExclusionEntry = {
  skillName: string;
  skillBaseDir: string;
  toolName: string;
  scope: SkillScope;
  bypassed: boolean;
};

/**
 * Per-session permission logger that tracks tool exclusions caused by skill
 * permissions.
 *
 * - Logs every exclusion to the gateway `skills` subsystem logger at `warn` level.
 * - Tracks per `(skillName, toolName)` counts.
 * - When the count for a specific tool reaches the threshold, appends an entry
 *   to the skill's `learnings.md`.
 * - During bypass mode, logs with `[bypassed]` tag and skips learnings.md writes.
 */
export class SkillPermissionLogger {
  private counts = new Map<string, number>();
  private entries = new Map<string, SkillExclusionEntry>();

  private makeKey(skillName: string, toolName: string): string {
    return `${skillName}:${toolName}`;
  }

  /**
   * Record a tool exclusion. Called when a tool is filtered out by skill
   * permission enforcement.
   */
  logExclusion(entry: SkillExclusionEntry): void {
    const key = this.makeKey(entry.skillName, entry.toolName);
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    this.entries.set(key, entry);

    const tag = entry.bypassed ? " [bypassed]" : "";
    logger.warn(
      `skill permission: tool "${entry.toolName}" excluded by skill "${entry.skillName}" (scope: ${entry.scope})${tag}`,
      {
        skillName: entry.skillName,
        toolName: entry.toolName,
        scope: entry.scope,
        bypassed: entry.bypassed,
        count,
      },
    );

    // Flush to learnings.md at threshold — skip during bypass
    if (count === LEARNINGS_THRESHOLD && !entry.bypassed) {
      void this.appendToLearnings(entry, count);
    }
  }

  /**
   * Log multiple exclusions at once (convenience for creation-time filtering).
   */
  logExclusions(entries: SkillExclusionEntry[]): void {
    for (const entry of entries) {
      this.logExclusion(entry);
    }
  }

  /**
   * Get the current exclusion count for a specific skill + tool combination.
   */
  getCount(skillName: string, toolName: string): number {
    return this.counts.get(this.makeKey(skillName, toolName)) ?? 0;
  }

  /**
   * Force-flush all entries that have reached the threshold to learnings.md.
   * Called at session end to catch any remaining entries.
   */
  async flushToLearnings(): Promise<void> {
    for (const [key, count] of this.counts) {
      if (count < LEARNINGS_THRESHOLD) continue;
      const entry = this.entries.get(key);
      if (!entry || entry.bypassed) continue;
      await this.appendToLearnings(entry, count);
    }
  }

  /**
   * Append a violation summary to the skill's `learnings.md` file.
   */
  private async appendToLearnings(entry: SkillExclusionEntry, count: number): Promise<void> {
    const learningsPath = path.join(entry.skillBaseDir, "learnings.md");
    const date = new Date().toISOString().slice(0, 10);

    // Suggest a scope upgrade based on the excluded tool
    const suggestedScope = suggestScopeForTool(entry.toolName, entry.scope);
    const suggestion = suggestedScope
      ? ` Consider upgrading to \`${suggestedScope}\` if this tool is needed.`
      : "";

    const line = `- ${date}: Skill "${entry.skillName}" excluded tool "${entry.toolName}" x${count} across sessions. Current scope: \`${entry.scope}\`.${suggestion} [auto-logged]\n`;

    try {
      await serializeByKey(`learnings:${learningsPath}`, async () => {
        // Read existing content to check for duplicates and section header
        let existing = "";
        try {
          existing = await fs.promises.readFile(learningsPath, "utf-8");
        } catch {
          // File doesn't exist yet
        }

        // Avoid duplicate entries for the same date + skill + tool
        const duplicateKey = `${date}: Skill "${entry.skillName}" excluded tool "${entry.toolName}"`;
        if (existing.includes(duplicateKey)) return;

        // Ensure the section header exists
        const sectionHeader = "## Permission Exclusions";
        let content: string;
        if (existing.includes(sectionHeader)) {
          // Append under existing section
          const insertPos = existing.indexOf(sectionHeader) + sectionHeader.length;
          const afterHeader = existing.slice(insertPos);
          const beforeHeader = existing.slice(0, insertPos);
          content = `${beforeHeader}\n${line}${afterHeader}`;
        } else {
          // Add new section at end
          const separator = existing.trim() ? "\n\n" : "";
          content = `${existing.trimEnd()}${separator}${sectionHeader}\n${line}`;
        }

        await fs.promises.writeFile(learningsPath, content, "utf-8");
      });
    } catch (err) {
      logger.warn(
        `Failed to write skill permission exclusion to learnings.md: ${err instanceof Error ? err.message : String(err)}`,
        { learningsPath, skillName: entry.skillName },
      );
    }
  }
}

/**
 * Suggest a scope upgrade based on the excluded tool name.
 * Returns the minimum scope that would allow the tool, or undefined.
 */
function suggestScopeForTool(toolName: string, currentScope: SkillScope): SkillScope | undefined {
  const normalized = toolName.toLowerCase();

  // Memory tools → read-only or read-write
  if (normalized.includes("memory")) {
    return currentScope === "conversation-only" ? "read-only" : "read-write";
  }

  // FS tools → workspace
  if (["read", "write", "edit", "apply_patch"].includes(normalized)) {
    return "workspace";
  }

  // Web tools → read-only
  if (normalized.includes("web")) {
    return "read-only";
  }

  // Exec/process/system → full
  if (["exec", "process", "cron", "gateway"].some((t) => normalized.includes(t))) {
    return "full";
  }

  return undefined;
}
