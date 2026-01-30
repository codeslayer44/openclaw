import { describe, expect, it } from "vitest";
import {
  expandToolGroups,
  intersectToolPolicies,
  resolveToolProfilePolicy,
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
