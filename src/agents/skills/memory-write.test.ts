import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendToSection,
  createSkillMemoryWriteTool,
  executeSkillMemoryWrite,
} from "./memory-write.js";

describe("appendToSection", () => {
  it("creates a new section when none exists in empty content", () => {
    const result = appendToSection("", "Preferences", "- dietary: vegetarian");
    expect(result).toBe("## Preferences\n- dietary: vegetarian\n");
  });

  it("creates a new section at the end when not found", () => {
    const content = "# User: telegram_123\n\n## Notes\n- Some notes";
    const result = appendToSection(content, "Preferences", "- dietary: vegetarian");
    expect(result).toContain("## Notes\n- Some notes");
    expect(result).toContain("## Preferences\n- dietary: vegetarian\n");
  });

  it("appends to an existing section", () => {
    const content = "## Preferences\n- dietary: vegetarian\n\n## Notes\n- Some notes";
    const result = appendToSection(content, "Preferences", "- dislikes: blue cheese");
    expect(result).toContain("- dietary: vegetarian\n- dislikes: blue cheese");
    expect(result).toContain("## Notes\n- Some notes");
  });

  it("appends to the last section (no next heading)", () => {
    const content = "## History\n- 2026-01-15: First interaction";
    const result = appendToSection(content, "History", "- 2026-01-22: Learned about allergy");
    expect(result).toContain(
      "- 2026-01-15: First interaction\n- 2026-01-22: Learned about allergy",
    );
  });

  it("matches section heading case-insensitively", () => {
    const content = "## preferences\n- dietary: vegetarian";
    const result = appendToSection(content, "Preferences", "- cuisine: Italian");
    expect(result).toContain("- dietary: vegetarian\n- cuisine: Italian");
    // Should not create a duplicate section
    expect(result.match(/## /g)?.length).toBe(1);
  });

  it("handles sections with trailing blank lines", () => {
    const content = "## Preferences\n- dietary: vegetarian\n\n\n## Notes\n- notes here";
    const result = appendToSection(content, "Preferences", "- dislikes: cilantro");
    // New line should be inserted after last content line, before blanks
    expect(result).toContain("- dietary: vegetarian\n- dislikes: cilantro");
    expect(result).toContain("## Notes");
  });

  it("preserves content before and after the section", () => {
    const content =
      "# User: telegram_123\n\n## Preferences\n- dietary: vegetarian\n\n## Notes\n- some notes\n\n## History\n- first";
    const result = appendToSection(content, "Notes", "- new note");
    expect(result).toContain("# User: telegram_123");
    expect(result).toContain("## Preferences\n- dietary: vegetarian");
    expect(result).toContain("- some notes\n- new note");
    expect(result).toContain("## History\n- first");
  });

  it("handles section heading with extra whitespace", () => {
    const content = "##   Preferences  \n- dietary: vegetarian";
    const result = appendToSection(content, "Preferences", "- new item");
    expect(result).toContain("- dietary: vegetarian\n- new item");
    expect(result.match(/## /g)?.length).toBe(1);
  });
});

describe("executeSkillMemoryWrite", () => {
  let tmpDir: string;
  let skillDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-memory-write-test-"));
    skillDir = path.join(tmpDir, "test-skill");
    fs.mkdirSync(skillDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates directories and file on first write", async () => {
    const result = await executeSkillMemoryWrite({
      skillName: "chef",
      skillBaseDir: skillDir,
      userId: "telegram_123",
      entries: [{ key: "Preferences", append: "- dietary: vegetarian" }],
    });
    expect(result).toEqual({ ok: true });

    const filePath = path.join(skillDir, "memory", "users", "telegram_123.md");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("## Preferences");
    expect(content).toContain("- dietary: vegetarian");
  });

  it("appends to existing sections", async () => {
    const userDir = path.join(skillDir, "memory", "users");
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDir, "telegram_123.md"),
      "## Preferences\n- dietary: vegetarian\n",
    );

    const result = await executeSkillMemoryWrite({
      skillName: "chef",
      skillBaseDir: skillDir,
      userId: "telegram_123",
      entries: [{ key: "Preferences", append: "- dislikes: blue cheese" }],
    });
    expect(result).toEqual({ ok: true });

    const content = fs.readFileSync(path.join(userDir, "telegram_123.md"), "utf-8");
    expect(content).toContain("- dietary: vegetarian");
    expect(content).toContain("- dislikes: blue cheese");
  });

  it("creates new sections for unknown keys", async () => {
    const userDir = path.join(skillDir, "memory", "users");
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDir, "telegram_123.md"),
      "## Preferences\n- dietary: vegetarian\n",
    );

    const result = await executeSkillMemoryWrite({
      skillName: "chef",
      skillBaseDir: skillDir,
      userId: "telegram_123",
      entries: [{ key: "History", append: "- 2026-01-15: First interaction" }],
    });
    expect(result).toEqual({ ok: true });

    const content = fs.readFileSync(path.join(userDir, "telegram_123.md"), "utf-8");
    expect(content).toContain("## Preferences");
    expect(content).toContain("## History");
    expect(content).toContain("- 2026-01-15: First interaction");
  });

  it("handles multiple entries in one call", async () => {
    const result = await executeSkillMemoryWrite({
      skillName: "chef",
      skillBaseDir: skillDir,
      userId: "telegram_123",
      entries: [
        { key: "Preferences", append: "- dietary: vegetarian" },
        { key: "Notes", append: "- Has a cast iron skillet" },
        { key: "History", append: "- 2026-01-15: First interaction" },
      ],
    });
    expect(result).toEqual({ ok: true });

    const content = fs.readFileSync(
      path.join(skillDir, "memory", "users", "telegram_123.md"),
      "utf-8",
    );
    expect(content).toContain("## Preferences");
    expect(content).toContain("## Notes");
    expect(content).toContain("## History");
  });

  it("returns warning when file exceeds 100 lines", async () => {
    const userDir = path.join(skillDir, "memory", "users");
    fs.mkdirSync(userDir, { recursive: true });

    // Create a file with 99 lines
    const lines = Array.from({ length: 99 }, (_, i) => `line ${i + 1}`);
    fs.writeFileSync(path.join(userDir, "telegram_123.md"), lines.join("\n"));

    // Adding more should push it over 100
    const result = await executeSkillMemoryWrite({
      skillName: "chef",
      skillBaseDir: skillDir,
      userId: "telegram_123",
      entries: [
        { key: "Overflow", append: "- extra line 1" },
        { key: "Overflow", append: "- extra line 2" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.warning).toBe("pruning_needed");
  });

  it("returns ok with no entries", async () => {
    const result = await executeSkillMemoryWrite({
      skillName: "chef",
      skillBaseDir: skillDir,
      userId: "telegram_123",
      entries: [],
    });
    expect(result).toEqual({ ok: true });
    // No file should be created
    expect(fs.existsSync(path.join(skillDir, "memory", "users", "telegram_123.md"))).toBe(false);
  });

  it("serializes concurrent writes to the same file", async () => {
    // Launch multiple writes concurrently
    const writes = Array.from({ length: 5 }, (_, i) =>
      executeSkillMemoryWrite({
        skillName: "chef",
        skillBaseDir: skillDir,
        userId: "telegram_123",
        entries: [{ key: "History", append: `- entry ${i}` }],
      }),
    );

    const results = await Promise.all(writes);
    for (const result of results) {
      expect(result.ok).toBe(true);
    }

    // All 5 entries should be in the file (serialized, no corruption)
    const content = fs.readFileSync(
      path.join(skillDir, "memory", "users", "telegram_123.md"),
      "utf-8",
    );
    for (let i = 0; i < 5; i++) {
      expect(content).toContain(`- entry ${i}`);
    }
  });
});

describe("createSkillMemoryWriteTool", () => {
  let tmpDir: string;
  let skillDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-memory-tool-test-"));
    skillDir = path.join(tmpDir, "test-skill");
    fs.mkdirSync(skillDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates a tool with correct name and schema", () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
    });
    expect(tool.name).toBe("skill_memory_write");
    expect(tool.parameters).toBeDefined();
    expect(tool.execute).toBeTypeOf("function");
  });

  it("executes a write through the tool interface", async () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
    });

    const result = await tool.execute("call-1", {
      skill: "chef",
      entries: [{ key: "Preferences", append: "- dietary: vegetarian" }],
    });

    expect(result).toBeDefined();
    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text?: string })?.text
        : undefined;
    expect(text).toBeDefined();
    const parsed = JSON.parse(text!);
    expect(parsed.ok).toBe(true);

    // Verify file was written
    const filePath = path.join(skillDir, "memory", "users", "telegram_123.md");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("- dietary: vegetarian");
  });

  it("returns error for unknown skill name", async () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
    });

    const result = await tool.execute("call-1", {
      skill: "unknown-skill",
      entries: [{ key: "Preferences", append: "- test" }],
    });

    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text?: string })?.text
        : undefined;
    const parsed = JSON.parse(text!);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Unknown skill");
  });

  it("returns error for missing skill name", async () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
    });

    const result = await tool.execute("call-1", {
      skill: "",
      entries: [{ key: "Preferences", append: "- test" }],
    });

    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text?: string })?.text
        : undefined;
    const parsed = JSON.parse(text!);
    expect(parsed.ok).toBe(false);
  });

  it("returns error for empty entries", async () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
    });

    const result = await tool.execute("call-1", {
      skill: "chef",
      entries: [],
    });

    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text?: string })?.text
        : undefined;
    const parsed = JSON.parse(text!);
    expect(parsed.ok).toBe(false);
  });

  it("filters out invalid entries", async () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
    });

    const result = await tool.execute("call-1", {
      skill: "chef",
      entries: [
        { key: "", append: "- empty key" }, // invalid: empty key
        { key: "Notes", append: "" }, // invalid: empty append
        { key: "Notes", append: "- valid entry" }, // valid
        "not an object", // invalid: not an object
      ],
    });

    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text?: string })?.text
        : undefined;
    const parsed = JSON.parse(text!);
    expect(parsed.ok).toBe(true);

    const content = fs.readFileSync(
      path.join(skillDir, "memory", "users", "telegram_123.md"),
      "utf-8",
    );
    expect(content).toContain("- valid entry");
    expect(content).not.toContain("- empty key");
  });

  it("blocks writes for default-tier users with memory_not_available reason", async () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
      userTier: "default",
    });

    const result = await tool.execute("call-1", {
      skill: "chef",
      entries: [{ key: "Preferences", append: "- dietary: vegetarian" }],
    });

    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text?: string })?.text
        : undefined;
    const parsed = JSON.parse(text!);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe("memory_not_available");

    // No file should be created
    expect(fs.existsSync(path.join(skillDir, "memory", "users", "telegram_123.md"))).toBe(false);
  });

  it("allows writes for admin-tier users", async () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
      userTier: "admin",
    });

    const result = await tool.execute("call-1", {
      skill: "chef",
      entries: [{ key: "Preferences", append: "- dietary: vegetarian" }],
    });

    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text?: string })?.text
        : undefined;
    const parsed = JSON.parse(text!);
    expect(parsed.ok).toBe(true);
  });

  it("allows writes for trusted-tier users", async () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
      userTier: "trusted",
    });

    const result = await tool.execute("call-1", {
      skill: "chef",
      entries: [{ key: "Preferences", append: "- dietary: vegetarian" }],
    });

    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text?: string })?.text
        : undefined;
    const parsed = JSON.parse(text!);
    expect(parsed.ok).toBe(true);
  });

  it("allows writes when userTier is not set (backward compatible)", async () => {
    const tool = createSkillMemoryWriteTool({
      skills: [{ name: "chef", baseDir: skillDir }],
      userId: "telegram_123",
      // no userTier
    });

    const result = await tool.execute("call-1", {
      skill: "chef",
      entries: [{ key: "Preferences", append: "- dietary: vegetarian" }],
    });

    const text =
      result.content && Array.isArray(result.content)
        ? (result.content[0] as { text?: string })?.text
        : undefined;
    const parsed = JSON.parse(text!);
    expect(parsed.ok).toBe(true);
  });
});
