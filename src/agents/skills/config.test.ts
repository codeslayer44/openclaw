import { describe, expect, it } from "vitest";
import { shouldIncludeSkill } from "./config.js";
import type { SkillEntry, SkillEligibilityContext, SkillPermissions } from "./types.js";

function makeSkillEntry(overrides?: { name?: string; permissions?: SkillPermissions }): SkillEntry {
  return {
    skill: {
      name: overrides?.name ?? "test-skill",
      instructions: "Test skill instructions",
      baseDir: "/tmp/test-skill",
      filePath: "/tmp/test-skill/SKILL.md",
      source: "moltbot-workspace",
    },
    frontmatter: {},
    permissions: overrides?.permissions,
  };
}

// ---------------------------------------------------------------------------
// shouldIncludeSkill — user tier scope ceiling
// ---------------------------------------------------------------------------

describe("shouldIncludeSkill — user tier filtering", () => {
  it("no userTier → no filtering (backward compatible)", () => {
    const entry = makeSkillEntry({
      permissions: { scope: "full", delegation: "opus", external: "none" },
    });
    expect(shouldIncludeSkill({ entry })).toBe(true);
  });

  it("no userTier + no permissions → included", () => {
    const entry = makeSkillEntry();
    expect(shouldIncludeSkill({ entry })).toBe(true);
  });

  it("admin user → all scopes pass", () => {
    const eligibility: SkillEligibilityContext = { userTier: "admin" };
    const scopes = [
      "conversation-only",
      "read-only",
      "workspace",
      "read-write",
      "full",
      "custom",
    ] as const;
    for (const scope of scopes) {
      const entry = makeSkillEntry({
        permissions: { scope, delegation: "opus", external: "none" },
      });
      expect(shouldIncludeSkill({ entry, eligibility })).toBe(true);
    }
  });

  it("trusted user → conversation-only through read-write pass", () => {
    const eligibility: SkillEligibilityContext = { userTier: "trusted" };
    const passing = ["conversation-only", "read-only", "workspace", "read-write"] as const;
    for (const scope of passing) {
      const entry = makeSkillEntry({
        permissions: { scope, delegation: "opus", external: "none" },
      });
      expect(shouldIncludeSkill({ entry, eligibility })).toBe(true);
    }
  });

  it("trusted user → full and custom blocked", () => {
    const eligibility: SkillEligibilityContext = { userTier: "trusted" };
    for (const scope of ["full", "custom"] as const) {
      const entry = makeSkillEntry({
        permissions: { scope, delegation: "opus", external: "none" },
      });
      expect(shouldIncludeSkill({ entry, eligibility })).toBe(false);
    }
  });

  it("default user → conversation-only through workspace pass", () => {
    const eligibility: SkillEligibilityContext = { userTier: "default" };
    const passing = ["conversation-only", "read-only", "workspace"] as const;
    for (const scope of passing) {
      const entry = makeSkillEntry({
        permissions: { scope, delegation: "opus", external: "none" },
      });
      expect(shouldIncludeSkill({ entry, eligibility })).toBe(true);
    }
  });

  it("default user → read-write, full, custom blocked", () => {
    const eligibility: SkillEligibilityContext = { userTier: "default" };
    for (const scope of ["read-write", "full", "custom"] as const) {
      const entry = makeSkillEntry({
        permissions: { scope, delegation: "opus", external: "none" },
      });
      expect(shouldIncludeSkill({ entry, eligibility })).toBe(false);
    }
  });

  it("userTier set but no permissions on skill → included (no scope to compare)", () => {
    const entry = makeSkillEntry();
    const eligibility: SkillEligibilityContext = { userTier: "default" };
    expect(shouldIncludeSkill({ entry, eligibility })).toBe(true);
  });

  it("userTier set but permissions has no scope → included", () => {
    // Edge case: permissions object exists but scope check requires scope
    const entry = makeSkillEntry({
      permissions: { scope: "conversation-only", delegation: "opus", external: "none" },
    });
    const eligibility: SkillEligibilityContext = { userTier: "default" };
    expect(shouldIncludeSkill({ entry, eligibility })).toBe(true);
  });
});
