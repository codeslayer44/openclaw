import fs from "node:fs/promises";
import path from "node:path";

import { Type } from "@sinclair/typebox";

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { jsonResult } from "../tools/common.js";
import type { AnyAgentTool } from "../pi-tools.types.js";
import type { SkillMemoryWriteEntry } from "./types.js";
import { serializeByKey } from "./serialize.js";

const skillsLogger = createSubsystemLogger("skills");

const MEMORY_FILE_MAX_LINES = 100;

/**
 * Append a line to a named section in a markdown-style document.
 * If the section doesn't exist, it's created at the end.
 * Sections are identified by `## SectionKey` headings (case-insensitive match).
 */
export function appendToSection(content: string, sectionKey: string, line: string): string {
  const lines = content.split("\n");
  const keyLower = sectionKey.trim().toLowerCase();

  // Find the section heading index
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("## ") && trimmed.slice(3).trim().toLowerCase() === keyLower) {
      headingIdx = i;
      break;
    }
  }

  if (headingIdx === -1) {
    // Section not found — append new section at end
    const trimmed = content.trimEnd();
    return trimmed ? `${trimmed}\n\n## ${sectionKey}\n${line}\n` : `## ${sectionKey}\n${line}\n`;
  }

  // Find the end of this section (next ## heading or end of file)
  let nextHeadingIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("## ")) {
      nextHeadingIdx = i;
      break;
    }
  }

  // Find the last non-empty line in this section to insert after
  let insertIdx = nextHeadingIdx;
  while (insertIdx > headingIdx + 1 && lines[insertIdx - 1].trim() === "") {
    insertIdx--;
  }

  const result = [...lines.slice(0, insertIdx), line, ...lines.slice(insertIdx)];
  return result.join("\n");
}

/**
 * Execute a skill memory write: append entries to the per-user memory file.
 *
 * Writes are serialized per skill+user to prevent file corruption from
 * concurrent sessions. Directory creation is handled automatically.
 */
export async function executeSkillMemoryWrite(params: {
  skillName: string;
  skillBaseDir: string;
  userId: string;
  entries: SkillMemoryWriteEntry[];
}): Promise<{ ok: boolean; warning?: string }> {
  const { skillName, skillBaseDir, userId, entries } = params;
  if (entries.length === 0) return { ok: true };

  const userDir = path.join(skillBaseDir, "memory", "users");
  const userFile = path.join(userDir, `${userId}.md`);

  return await serializeByKey(`skillMemory:${skillName}:${userId}`, async () => {
    // Ensure directory exists on first write
    await fs.mkdir(userDir, { recursive: true });

    // Read current content (empty string if file doesn't exist)
    let content = "";
    try {
      content = await fs.readFile(userFile, "utf-8");
    } catch {
      // File doesn't exist yet — start fresh
    }

    // Apply each entry
    for (const entry of entries) {
      content = appendToSection(content, entry.key, entry.append);
    }

    // Check line count
    const lineCount = content.split("\n").length;
    const warning = lineCount > MEMORY_FILE_MAX_LINES ? "pruning_needed" : undefined;

    // Write file
    await fs.writeFile(userFile, content, "utf-8");

    skillsLogger.debug(
      `skill memory write: skill=${skillName} user=${userId} entries=${entries.length} lines=${lineCount}`,
    );

    return { ok: true, warning };
  });
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const SkillMemoryWriteSchema = Type.Object({
  skill: Type.String({ description: "Name of the active skill to write memory for." }),
  entries: Type.Array(
    Type.Object({
      key: Type.String({
        description: "Section name (e.g. 'Preferences', 'Notes', 'History').",
      }),
      append: Type.String({ description: "Line to append to the section." }),
    }),
    { description: "Memory entries to append to the user's skill memory file." },
  ),
});

export type SkillMemoryContext = {
  skills: Array<{ name: string; baseDir: string }>;
  userId: string;
};

/**
 * Create the `skill_memory_write` tool for persisting user preferences
 * during skill-activated sessions.
 *
 * The tool derives userId from the session delivery context (captured in
 * the context at creation time) — LLM cannot write to another user's file.
 */
export function createSkillMemoryWriteTool(context: SkillMemoryContext): AnyAgentTool {
  const skillMap = new Map(context.skills.map((s) => [s.name, s.baseDir]));

  return {
    label: "Skill Memory Write",
    name: "skill_memory_write",
    description:
      "Persist durable user preferences to skill memory. Use when a user reveals a lasting preference (dietary needs, style preferences, etc.) that should be remembered across sessions. Do not store transient context.",
    parameters: SkillMemoryWriteSchema,
    execute: async (_toolCallId, args) => {
      const params = args as { skill?: string; entries?: unknown };
      const skillName = typeof params.skill === "string" ? params.skill.trim() : "";
      if (!skillName) {
        return jsonResult({ ok: false, error: "skill name required" });
      }

      const skillBaseDir = skillMap.get(skillName);
      if (!skillBaseDir) {
        return jsonResult({
          ok: false,
          error: `Unknown skill "${skillName}". Available: ${[...skillMap.keys()].join(", ")}`,
        });
      }

      const entries: SkillMemoryWriteEntry[] = [];
      if (Array.isArray(params.entries)) {
        for (const entry of params.entries) {
          if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as Record<string, unknown>).key === "string" &&
            typeof (entry as Record<string, unknown>).append === "string"
          ) {
            const key = ((entry as Record<string, unknown>).key as string).trim();
            const append = ((entry as Record<string, unknown>).append as string).trim();
            if (key && append) {
              entries.push({ key, append });
            }
          }
        }
      }

      if (entries.length === 0) {
        return jsonResult({ ok: false, error: "No valid entries provided." });
      }

      try {
        const result = await executeSkillMemoryWrite({
          skillName,
          skillBaseDir,
          userId: context.userId,
          entries,
        });
        return jsonResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skillsLogger.warn(`skill_memory_write failed: skill=${skillName} error=${message}`);
        return jsonResult({ ok: false, error: "Memory write failed. Will retry next session." });
      }
    },
  };
}
