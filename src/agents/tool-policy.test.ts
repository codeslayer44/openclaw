import { describe, expect, it } from "vitest";
import {
  expandToolGroups,
  intersectToolPolicies,
  resolveSkillToolPolicy,
  resolveToolProfilePolicy,
  SKILL_SCOPE_TOOL_GROUPS,
  TOOL_GROUPS,
} from "./tool-policy.js";

describe("tool-policy", () => {
  it("expands groups and normalizes aliases", () => {
    const expanded = expandToolGroups(["group:runtime", "BASH", "apply-patch", "group:fs"]);
    const set = new Set(expanded);
    expect(set.has("exec")).toBe(true);
    expect(set.has("process")).toBe(true);
    expect(set.has("bash")).toBe(false);
    expect(set.has("apply_patch")).toBe(true);
    expect(set.has("read")).toBe(true);
    expect(set.has("write")).toBe(true);
    expect(set.has("edit")).toBe(true);
  });

  it("resolves known profiles and ignores unknown ones", () => {
    const coding = resolveToolProfilePolicy("coding");
    expect(coding?.allow).toContain("group:fs");
    expect(resolveToolProfilePolicy("nope")).toBeUndefined();
  });

  it("includes core tool groups in group:moltbot", () => {
    const group = TOOL_GROUPS["group:moltbot"];
    expect(group).toContain("browser");
    expect(group).toContain("message");
    expect(group).toContain("session_status");
  });
});

describe("SKILL_SCOPE_TOOL_GROUPS", () => {
  it("conversation-only maps to empty array", () => {
    expect(SKILL_SCOPE_TOOL_GROUPS["conversation-only"]).toEqual([]);
  });

  it("read-only maps to memory and web groups", () => {
    expect(SKILL_SCOPE_TOOL_GROUPS["read-only"]).toEqual(["group:memory", "group:web"]);
  });

  it("workspace maps to fs, web, and image", () => {
    expect(SKILL_SCOPE_TOOL_GROUPS["workspace"]).toEqual(["group:fs", "group:web", "image"]);
  });

  it("read-write maps to fs, memory, web, and image", () => {
    expect(SKILL_SCOPE_TOOL_GROUPS["read-write"]).toEqual([
      "group:fs",
      "group:memory",
      "group:web",
      "image",
    ]);
  });

  it("full maps to null (no restriction)", () => {
    expect(SKILL_SCOPE_TOOL_GROUPS["full"]).toBeNull();
  });

  it("custom maps to null", () => {
    expect(SKILL_SCOPE_TOOL_GROUPS["custom"]).toBeNull();
  });
});

describe("resolveSkillToolPolicy", () => {
  it("conversation-only with delegation returns sessions_spawn and skill_memory_write", () => {
    const policy = resolveSkillToolPolicy({
      scope: "conversation-only",
      delegation: "opus",
      external: "none",
    });
    expect(policy!.allow).toContain("sessions_spawn");
    expect(policy!.allow).toContain("skill_memory_write");
    expect(policy!.allow).toHaveLength(2);
  });

  it("conversation-only with delegation: none returns skill_memory_write only", () => {
    const policy = resolveSkillToolPolicy({
      scope: "conversation-only",
      delegation: "none",
      external: "none",
    });
    expect(policy!.allow).toContain("skill_memory_write");
    expect(policy!.allow).toHaveLength(1);
    expect(policy!.deny).toBeUndefined();
  });

  it("read-only includes memory, web groups, sessions_spawn, and skill_memory_write", () => {
    const policy = resolveSkillToolPolicy({
      scope: "read-only",
      delegation: "opus",
      external: "none",
    });
    expect(policy).toBeDefined();
    expect(policy!.allow).toContain("group:memory");
    expect(policy!.allow).toContain("group:web");
    expect(policy!.allow).toContain("sessions_spawn");
    expect(policy!.allow).toContain("skill_memory_write");
    expect(policy!.deny).toBeUndefined();
  });

  it("workspace includes fs, web, image, and sessions_spawn", () => {
    const policy = resolveSkillToolPolicy({
      scope: "workspace",
      delegation: "opus",
      external: "none",
    });
    expect(policy).toBeDefined();
    expect(policy!.allow).toContain("group:fs");
    expect(policy!.allow).toContain("group:web");
    expect(policy!.allow).toContain("image");
    expect(policy!.allow).toContain("sessions_spawn");
  });

  it("read-write includes fs, memory, web, image, and sessions_spawn", () => {
    const policy = resolveSkillToolPolicy({
      scope: "read-write",
      delegation: "opus",
      external: "none",
    });
    expect(policy).toBeDefined();
    expect(policy!.allow).toContain("group:fs");
    expect(policy!.allow).toContain("group:memory");
    expect(policy!.allow).toContain("group:web");
    expect(policy!.allow).toContain("image");
    expect(policy!.allow).toContain("sessions_spawn");
  });

  it("full scope returns undefined", () => {
    const policy = resolveSkillToolPolicy({
      scope: "full",
      delegation: "opus",
      external: "none",
    });
    expect(policy).toBeUndefined();
  });

  it("full scope with explicit deny returns deny only", () => {
    const policy = resolveSkillToolPolicy({
      scope: "full",
      delegation: "opus",
      external: "none",
      tools: { deny: ["exec", "deploy"] },
    });
    expect(policy).toEqual({ deny: ["exec", "deploy"] });
  });

  it("custom scope with explicit allow uses the allow list", () => {
    const policy = resolveSkillToolPolicy({
      scope: "custom",
      delegation: "opus",
      external: "read",
      tools: { allow: ["read", "hostkit_state", "web_fetch"] },
    });
    expect(policy!.allow).toContain("read");
    expect(policy!.allow).toContain("hostkit_state");
    expect(policy!.allow).toContain("web_fetch");
    expect(policy!.allow).toContain("sessions_spawn");
  });

  it("custom scope without explicit allow returns undefined", () => {
    const policy = resolveSkillToolPolicy({
      scope: "custom",
      delegation: "opus",
      external: "full",
    });
    expect(policy).toBeUndefined();
  });

  it("explicit tools.allow overrides scope defaults", () => {
    const policy = resolveSkillToolPolicy({
      scope: "read-only",
      delegation: "opus",
      external: "none",
      tools: { allow: ["web_fetch"] },
    });
    expect(policy!.allow).toContain("web_fetch");
    expect(policy!.allow).toContain("sessions_spawn");
    // Scope defaults replaced
    expect(policy!.allow).not.toContain("group:memory");
    expect(policy!.allow).not.toContain("group:web");
  });

  it("deny list applied on top of scope defaults", () => {
    const policy = resolveSkillToolPolicy({
      scope: "read-write",
      delegation: "opus",
      external: "none",
      tools: { deny: ["exec", "deploy"] },
    });
    expect(policy!.allow).toContain("group:fs");
    expect(policy!.deny).toEqual(["exec", "deploy"]);
  });

  it("delegation: any also includes sessions_spawn and skill_memory_write", () => {
    const policy = resolveSkillToolPolicy({
      scope: "conversation-only",
      delegation: "any",
      external: "none",
    });
    expect(policy!.allow).toContain("sessions_spawn");
    expect(policy!.allow).toContain("skill_memory_write");
    expect(policy!.allow).toHaveLength(2);
  });
});

describe("intersectToolPolicies", () => {
  it("returns empty object for no policies", () => {
    expect(intersectToolPolicies([])).toEqual({});
  });

  it("returns empty object for all-undefined entries", () => {
    expect(intersectToolPolicies([undefined, undefined])).toEqual({});
  });

  it("passes through a single policy unchanged", () => {
    const result = intersectToolPolicies([{ allow: ["read", "write"], deny: ["exec"] }]);
    expect(result.allow).toContain("read");
    expect(result.allow).toContain("write");
    expect(result.deny).toEqual(["exec"]);
  });

  it("intersects allow lists from two layers", () => {
    const result = intersectToolPolicies([
      { allow: ["read", "write", "exec"] },
      { allow: ["read", "exec", "web_fetch"] },
    ]);
    expect(result.allow).toContain("read");
    expect(result.allow).toContain("exec");
    expect(result.allow).not.toContain("write");
    expect(result.allow).not.toContain("web_fetch");
  });

  it("unions deny lists from two layers", () => {
    const result = intersectToolPolicies([{ deny: ["exec"] }, { deny: ["deploy", "gateway"] }]);
    expect(result.deny).toContain("exec");
    expect(result.deny).toContain("deploy");
    expect(result.deny).toContain("gateway");
    expect(result.allow).toBeUndefined();
  });

  it("pass-through layer does not restrict intersection", () => {
    const result = intersectToolPolicies([
      undefined,
      { allow: ["read", "write"] },
      { deny: ["exec"] },
    ]);
    expect(result.allow).toContain("read");
    expect(result.allow).toContain("write");
    expect(result.deny).toEqual(["exec"]);
  });

  it("expands group references before intersecting", () => {
    const result = intersectToolPolicies([
      { allow: ["group:fs", "group:web"] },
      { allow: ["read", "write", "web_search"] },
    ]);
    // group:fs = [read, write, edit, apply_patch]
    // group:web = [web_search, web_fetch]
    // Intersection with [read, write, web_search]:
    expect(result.allow).toContain("read");
    expect(result.allow).toContain("write");
    expect(result.allow).toContain("web_search");
    expect(result.allow).not.toContain("edit");
    expect(result.allow).not.toContain("apply_patch");
    expect(result.allow).not.toContain("web_fetch");
  });

  it("empty allow list intersected with populated list yields empty", () => {
    const result = intersectToolPolicies([{ allow: [] }, { allow: ["read", "write"] }]);
    expect(result.allow).toEqual([]);
  });

  it("combines allow intersection with deny union", () => {
    const result = intersectToolPolicies([
      { allow: ["read", "write", "exec"], deny: ["deploy"] },
      { allow: ["read", "exec"], deny: ["gateway"] },
    ]);
    expect(result.allow).toContain("read");
    expect(result.allow).toContain("exec");
    expect(result.allow).not.toContain("write");
    expect(result.deny).toContain("deploy");
    expect(result.deny).toContain("gateway");
  });

  it("deduplicates deny entries", () => {
    const result = intersectToolPolicies([
      { deny: ["exec", "deploy"] },
      { deny: ["exec", "gateway"] },
    ]);
    expect(result.deny).toEqual(expect.arrayContaining(["exec", "deploy", "gateway"]));
    const execCount = result.deny!.filter((d) => d === "exec").length;
    expect(execCount).toBe(1);
  });
});
