import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillPermissionLogger, type SkillExclusionEntry } from "./permission-log.js";

describe("SkillPermissionLogger", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "perm-log-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeEntry(overrides?: Partial<SkillExclusionEntry>): SkillExclusionEntry {
    return {
      skillName: "chef",
      skillBaseDir: tmpDir,
      toolName: "exec",
      scope: "conversation-only",
      bypassed: false,
      ...overrides,
    };
  }

  describe("logExclusion", () => {
    it("increments count on each call", () => {
      const logger = new SkillPermissionLogger();
      logger.logExclusion(makeEntry());
      expect(logger.getCount("chef", "exec")).toBe(1);
      logger.logExclusion(makeEntry());
      expect(logger.getCount("chef", "exec")).toBe(2);
    });

    it("tracks different tools independently", () => {
      const logger = new SkillPermissionLogger();
      logger.logExclusion(makeEntry({ toolName: "exec" }));
      logger.logExclusion(makeEntry({ toolName: "write" }));
      logger.logExclusion(makeEntry({ toolName: "exec" }));
      expect(logger.getCount("chef", "exec")).toBe(2);
      expect(logger.getCount("chef", "write")).toBe(1);
    });

    it("tracks different skills independently", () => {
      const logger = new SkillPermissionLogger();
      logger.logExclusion(makeEntry({ skillName: "chef", toolName: "exec" }));
      logger.logExclusion(makeEntry({ skillName: "deploy", toolName: "exec" }));
      expect(logger.getCount("chef", "exec")).toBe(1);
      expect(logger.getCount("deploy", "exec")).toBe(1);
    });

    it("returns 0 for untracked combinations", () => {
      const logger = new SkillPermissionLogger();
      expect(logger.getCount("nonexistent", "tool")).toBe(0);
    });
  });

  describe("logExclusions (batch)", () => {
    it("logs multiple entries at once", () => {
      const logger = new SkillPermissionLogger();
      logger.logExclusions([
        makeEntry({ toolName: "exec" }),
        makeEntry({ toolName: "write" }),
        makeEntry({ toolName: "process" }),
      ]);
      expect(logger.getCount("chef", "exec")).toBe(1);
      expect(logger.getCount("chef", "write")).toBe(1);
      expect(logger.getCount("chef", "process")).toBe(1);
    });
  });

  describe("learnings.md flush", () => {
    it("writes to learnings.md when threshold (3) is reached", async () => {
      const logger = new SkillPermissionLogger();
      // Log 3 times to hit threshold
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());

      // Wait for async write to complete
      await vi.waitFor(() => {
        const learningsPath = path.join(tmpDir, "learnings.md");
        expect(fs.existsSync(learningsPath)).toBe(true);
      });

      const content = fs.readFileSync(path.join(tmpDir, "learnings.md"), "utf-8");
      expect(content).toContain("## Permission Exclusions");
      expect(content).toContain('Skill "chef" excluded tool "exec" x3');
      expect(content).toContain("[auto-logged]");
      expect(content).toContain("conversation-only");
    });

    it("does NOT write to learnings.md below threshold", async () => {
      const logger = new SkillPermissionLogger();
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());

      // Give async a chance to fire
      await new Promise((r) => setTimeout(r, 50));

      const learningsPath = path.join(tmpDir, "learnings.md");
      expect(fs.existsSync(learningsPath)).toBe(false);
    });

    it("does NOT write to learnings.md during bypass", async () => {
      const logger = new SkillPermissionLogger();
      const bypassed = makeEntry({ bypassed: true });
      logger.logExclusion(bypassed);
      logger.logExclusion(bypassed);
      logger.logExclusion(bypassed);

      // Give async a chance to fire
      await new Promise((r) => setTimeout(r, 50));

      const learningsPath = path.join(tmpDir, "learnings.md");
      expect(fs.existsSync(learningsPath)).toBe(false);
    });

    it("appends to existing learnings.md content", async () => {
      const learningsPath = path.join(tmpDir, "learnings.md");
      fs.writeFileSync(learningsPath, "# Learnings\n\nSome existing content.\n");

      const logger = new SkillPermissionLogger();
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());

      await vi.waitFor(() => {
        const content = fs.readFileSync(learningsPath, "utf-8");
        expect(content).toContain("## Permission Exclusions");
      });

      const content = fs.readFileSync(learningsPath, "utf-8");
      expect(content).toContain("# Learnings");
      expect(content).toContain("Some existing content.");
      expect(content).toContain("## Permission Exclusions");
      expect(content).toContain('Skill "chef" excluded tool "exec"');
    });

    it("appends under existing Permission Exclusions section", async () => {
      const learningsPath = path.join(tmpDir, "learnings.md");
      fs.writeFileSync(learningsPath, "## Permission Exclusions\n- old entry\n");

      const logger = new SkillPermissionLogger();
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());

      await vi.waitFor(() => {
        const content = fs.readFileSync(learningsPath, "utf-8");
        expect(content).toContain('Skill "chef"');
      });

      const content = fs.readFileSync(learningsPath, "utf-8");
      // Should only have one section header
      const headerCount = (content.match(/## Permission Exclusions/g) ?? []).length;
      expect(headerCount).toBe(1);
      expect(content).toContain("- old entry");
    });

    it("avoids duplicate entries for same date/skill/tool", async () => {
      const logger = new SkillPermissionLogger();
      // First batch hits threshold
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());

      await vi.waitFor(() => {
        expect(fs.existsSync(path.join(tmpDir, "learnings.md"))).toBe(true);
      });

      // Second batch would also hit threshold (count is now 6)
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());

      // Wait for any additional writes
      await new Promise((r) => setTimeout(r, 100));

      const content = fs.readFileSync(path.join(tmpDir, "learnings.md"), "utf-8");
      // Should only have one entry for today
      const entryCount = (content.match(/excluded tool "exec"/g) ?? []).length;
      expect(entryCount).toBe(1);
    });

    it("includes scope upgrade suggestion for exec tool", async () => {
      const logger = new SkillPermissionLogger();
      logger.logExclusion(makeEntry({ toolName: "exec", scope: "read-only" }));
      logger.logExclusion(makeEntry({ toolName: "exec", scope: "read-only" }));
      logger.logExclusion(makeEntry({ toolName: "exec", scope: "read-only" }));

      await vi.waitFor(() => {
        expect(fs.existsSync(path.join(tmpDir, "learnings.md"))).toBe(true);
      });

      const content = fs.readFileSync(path.join(tmpDir, "learnings.md"), "utf-8");
      expect(content).toContain("Consider upgrading to `full`");
    });

    it("includes scope upgrade suggestion for write tool", async () => {
      const logger = new SkillPermissionLogger();
      const entry = makeEntry({ toolName: "write", scope: "read-only" });
      logger.logExclusion(entry);
      logger.logExclusion(entry);
      logger.logExclusion(entry);

      await vi.waitFor(() => {
        expect(fs.existsSync(path.join(tmpDir, "learnings.md"))).toBe(true);
      });

      const content = fs.readFileSync(path.join(tmpDir, "learnings.md"), "utf-8");
      expect(content).toContain("Consider upgrading to `workspace`");
    });
  });

  describe("flushToLearnings", () => {
    it("writes remaining entries above threshold", async () => {
      const logger = new SkillPermissionLogger();
      // Manually set count to threshold without triggering auto-flush
      // (logExclusion auto-flushes at exactly 3, so we'll use 4 to ensure
      // the flush path catches it too)
      logger.logExclusion(makeEntry({ toolName: "read" }));
      logger.logExclusion(makeEntry({ toolName: "read" }));
      logger.logExclusion(makeEntry({ toolName: "read" }));

      // Wait for auto-flush
      await vi.waitFor(() => {
        expect(fs.existsSync(path.join(tmpDir, "learnings.md"))).toBe(true);
      });

      // Now flush again — should not duplicate
      await logger.flushToLearnings();

      const content = fs.readFileSync(path.join(tmpDir, "learnings.md"), "utf-8");
      const entryCount = (content.match(/excluded tool "read"/g) ?? []).length;
      expect(entryCount).toBe(1);
    });

    it("skips bypassed entries during flush", async () => {
      const logger = new SkillPermissionLogger();
      const bypassed = makeEntry({ bypassed: true });
      logger.logExclusion(bypassed);
      logger.logExclusion(bypassed);
      logger.logExclusion(bypassed);
      logger.logExclusion(bypassed);

      await logger.flushToLearnings();

      expect(fs.existsSync(path.join(tmpDir, "learnings.md"))).toBe(false);
    });

    it("skips entries below threshold during flush", async () => {
      const logger = new SkillPermissionLogger();
      logger.logExclusion(makeEntry());
      logger.logExclusion(makeEntry());

      await logger.flushToLearnings();

      expect(fs.existsSync(path.join(tmpDir, "learnings.md"))).toBe(false);
    });
  });
});
