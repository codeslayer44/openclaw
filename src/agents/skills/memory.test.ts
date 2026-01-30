import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadSkillMemory, sanitizeForFilename } from "./workspace.js";

describe("sanitizeForFilename", () => {
  it("preserves alphanumeric characters", () => {
    expect(sanitizeForFilename("telegram_7338489031")).toBe("telegram_7338489031");
  });

  it("preserves E.164 phone numbers with +", () => {
    expect(sanitizeForFilename("whatsapp_+15551234567")).toBe("whatsapp_+15551234567");
  });

  it("preserves email-style handles with @ and .", () => {
    expect(sanitizeForFilename("imessage_user@icloud.com")).toBe("imessage_user@icloud.com");
  });

  it("preserves hyphens", () => {
    expect(sanitizeForFilename("discord_some-user-id")).toBe("discord_some-user-id");
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeForFilename("signal_John Doe")).toBe("signal_John_Doe");
  });

  it("replaces @ in JID-style identifiers (whatsapp s.whatsapp.net is ok)", () => {
    // The @ is preserved so this stays as-is
    expect(sanitizeForFilename("whatsapp_123456@s.whatsapp.net")).toBe(
      "whatsapp_123456@s.whatsapp.net",
    );
  });

  it("replaces slashes and other special characters", () => {
    expect(sanitizeForFilename("foo/bar:baz?qux")).toBe("foo_bar_baz_qux");
  });

  it("handles empty string", () => {
    expect(sanitizeForFilename("")).toBe("");
  });
});

describe("loadSkillMemory", () => {
  let tmpDir: string;
  let skillDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-memory-test-"));
    skillDir = path.join(tmpDir, "test-skill");
    fs.mkdirSync(path.join(skillDir, "memory", "users"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty string when no memory files exist", () => {
    const result = loadSkillMemory(skillDir, {
      channel: "telegram",
      senderId: "123",
    });
    expect(result).toBe("");
  });

  it("returns empty string when no delivery context provided", () => {
    fs.writeFileSync(path.join(skillDir, "memory", "defaults.md"), "- Metric measurements");
    const result = loadSkillMemory(skillDir);
    // defaults.md should still load even without delivery context
    expect(result).toContain("Skill Defaults");
    expect(result).toContain("Metric measurements");
  });

  it("loads only defaults.md when no user file exists", () => {
    fs.writeFileSync(
      path.join(skillDir, "memory", "defaults.md"),
      "- Metric measurements\n- 2 servings default",
    );
    const result = loadSkillMemory(skillDir, {
      channel: "telegram",
      senderId: "999",
    });
    expect(result).toContain("## Skill Defaults");
    expect(result).toContain("Metric measurements");
    expect(result).not.toContain("User Memory");
  });

  it("loads only user file when no defaults exist", () => {
    fs.writeFileSync(
      path.join(skillDir, "memory", "users", "telegram_123.md"),
      "# User: telegram_123\n\n## Preferences\n- dietary: vegetarian",
    );
    const result = loadSkillMemory(skillDir, {
      channel: "telegram",
      senderId: "123",
    });
    expect(result).not.toContain("Skill Defaults");
    expect(result).toContain("## User Memory");
    expect(result).toContain("dietary: vegetarian");
  });

  it("loads both defaults and user file", () => {
    fs.writeFileSync(path.join(skillDir, "memory", "defaults.md"), "- Metric measurements");
    fs.writeFileSync(
      path.join(skillDir, "memory", "users", "telegram_123.md"),
      "## Preferences\n- dietary: vegetarian",
    );
    const result = loadSkillMemory(skillDir, {
      channel: "telegram",
      senderId: "123",
    });
    expect(result).toContain("## Skill Defaults");
    expect(result).toContain("Metric measurements");
    expect(result).toContain("## User Memory");
    expect(result).toContain("dietary: vegetarian");
  });

  it("sanitizes user ID for filesystem safety", () => {
    fs.writeFileSync(
      path.join(skillDir, "memory", "users", "whatsapp_+15551234567.md"),
      "## Preferences\n- language: English",
    );
    const result = loadSkillMemory(skillDir, {
      channel: "whatsapp",
      senderId: "+15551234567",
    });
    expect(result).toContain("## User Memory");
    expect(result).toContain("language: English");
  });

  it("returns empty string when memory directory does not exist", () => {
    const noMemoryDir = path.join(tmpDir, "no-memory-skill");
    fs.mkdirSync(noMemoryDir, { recursive: true });
    const result = loadSkillMemory(noMemoryDir, {
      channel: "telegram",
      senderId: "123",
    });
    expect(result).toBe("");
  });

  it("skips empty defaults.md", () => {
    fs.writeFileSync(path.join(skillDir, "memory", "defaults.md"), "   \n\n  ");
    const result = loadSkillMemory(skillDir, {
      channel: "telegram",
      senderId: "123",
    });
    expect(result).toBe("");
  });

  it("skips empty user file", () => {
    fs.writeFileSync(path.join(skillDir, "memory", "users", "telegram_123.md"), "  \n  ");
    const result = loadSkillMemory(skillDir, {
      channel: "telegram",
      senderId: "123",
    });
    expect(result).toBe("");
  });

  it("does not load user memory when senderId is missing", () => {
    fs.writeFileSync(path.join(skillDir, "memory", "defaults.md"), "- Defaults here");
    fs.writeFileSync(path.join(skillDir, "memory", "users", "telegram_123.md"), "- User prefs");
    const result = loadSkillMemory(skillDir, {
      channel: "telegram",
    });
    expect(result).toContain("Skill Defaults");
    expect(result).not.toContain("User Memory");
  });

  it("does not load user memory when channel is missing", () => {
    fs.writeFileSync(path.join(skillDir, "memory", "defaults.md"), "- Defaults here");
    fs.writeFileSync(path.join(skillDir, "memory", "users", "telegram_123.md"), "- User prefs");
    const result = loadSkillMemory(skillDir, {
      senderId: "123",
    });
    expect(result).toContain("Skill Defaults");
    expect(result).not.toContain("User Memory");
  });
});
