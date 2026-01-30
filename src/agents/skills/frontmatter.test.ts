import { describe, expect, it } from "vitest";

import { parseSkillPermissions, resolveSkillInvocationPolicy } from "./frontmatter.js";

describe("resolveSkillInvocationPolicy", () => {
  it("defaults to enabled behaviors", () => {
    const policy = resolveSkillInvocationPolicy({});
    expect(policy.userInvocable).toBe(true);
    expect(policy.disableModelInvocation).toBe(false);
  });

  it("parses frontmatter boolean strings", () => {
    const policy = resolveSkillInvocationPolicy({
      "user-invocable": "no",
      "disable-model-invocation": "yes",
    });
    expect(policy.userInvocable).toBe(false);
    expect(policy.disableModelInvocation).toBe(true);
  });
});

describe("parseSkillPermissions", () => {
  it("returns undefined when no ## Permissions section exists", () => {
    const content = `---
name: test-skill
description: A test skill
---

# Test Skill

Some content here.
`;
    const result = parseSkillPermissions(content);
    expect(result).toBeUndefined();
  });

  it("parses scope: conversation-only", () => {
    const content = `---
name: chef
description: A chef skill
---

# Chef

## Permissions

scope: conversation-only
delegation: opus
`;
    const result = parseSkillPermissions(content);
    expect(result.scope).toBe("conversation-only");
    expect(result.delegation).toBe("opus");
    expect(result.external).toBe("none");
    expect(result.tools).toBeUndefined();
  });

  it("parses scope: full", () => {
    const content = `## Permissions

scope: full
`;
    const result = parseSkillPermissions(content);
    expect(result.scope).toBe("full");
    expect(result.delegation).toBe("opus");
    expect(result.external).toBe("none");
  });

  it("parses scope: workspace with delegation and external", () => {
    const content = `## Permissions

scope: workspace
delegation: opus
external: read
`;
    const result = parseSkillPermissions(content);
    expect(result).toEqual({
      scope: "workspace",
      delegation: "opus",
      external: "read",
    });
  });

  it("parses scope: read-only", () => {
    const content = `## Permissions

scope: read-only
delegation: opus
`;
    const result = parseSkillPermissions(content);
    expect(result.scope).toBe("read-only");
  });

  it("parses scope: read-write", () => {
    const content = `## Permissions

scope: read-write
`;
    const result = parseSkillPermissions(content);
    expect(result.scope).toBe("read-write");
  });

  it("parses scope: custom with tools allow and deny lists", () => {
    const content = `## Permissions

scope: custom
tools:
  allow: [read, write, web_fetch, group:web]
  deny: [exec, deploy]
delegation: opus
external: read
`;
    const result = parseSkillPermissions(content);
    expect(result).toEqual({
      scope: "custom",
      tools: {
        allow: ["read", "write", "web_fetch", "group:web"],
        deny: ["exec", "deploy"],
      },
      delegation: "opus",
      external: "read",
    });
  });

  it("parses tools block with only allow", () => {
    const content = `## Permissions

scope: custom
tools:
  allow: [read_file, search_files, web_fetch]
delegation: opus
external: read
`;
    const result = parseSkillPermissions(content);
    expect(result.tools).toEqual({
      allow: ["read_file", "search_files", "web_fetch"],
    });
  });

  it("parses tools block with only deny", () => {
    const content = `## Permissions

scope: read-write
tools:
  deny: [exec, deploy]
`;
    const result = parseSkillPermissions(content);
    expect(result.tools).toEqual({
      deny: ["exec", "deploy"],
    });
  });

  it("falls back to conversation-only for invalid scope value", () => {
    const content = `## Permissions

scope: bogus-scope
delegation: opus
`;
    const result = parseSkillPermissions(content);
    expect(result.scope).toBe("conversation-only");
  });

  it("falls back to opus for invalid delegation value", () => {
    const content = `## Permissions

scope: full
delegation: invalid
`;
    const result = parseSkillPermissions(content);
    expect(result.delegation).toBe("opus");
  });

  it("falls back to none for invalid external value", () => {
    const content = `## Permissions

scope: full
external: invalid
`;
    const result = parseSkillPermissions(content);
    expect(result.external).toBe("none");
  });

  it("preserves group references in allow list (expansion happens later)", () => {
    const content = `## Permissions

scope: custom
tools:
  allow: [group:fs, group:web, group:memory]
`;
    const result = parseSkillPermissions(content);
    expect(result.tools?.allow).toEqual(["group:fs", "group:web", "group:memory"]);
  });

  it("handles Permissions section followed by another ## section", () => {
    const content = `# My Skill

## Permissions

scope: read-only
delegation: none

## Rules

- Do something useful.
`;
    const result = parseSkillPermissions(content);
    expect(result.scope).toBe("read-only");
    expect(result.delegation).toBe("none");
  });

  it("handles case-insensitive heading match", () => {
    const content = `## permissions

scope: workspace
`;
    const result = parseSkillPermissions(content);
    expect(result.scope).toBe("workspace");
  });

  it("handles delegation: none", () => {
    const content = `## Permissions

scope: conversation-only
delegation: none
`;
    const result = parseSkillPermissions(content);
    expect(result.delegation).toBe("none");
  });

  it("handles delegation: any", () => {
    const content = `## Permissions

scope: full
delegation: any
`;
    const result = parseSkillPermissions(content);
    expect(result.delegation).toBe("any");
  });

  it("handles external: full", () => {
    const content = `## Permissions

scope: full
external: full
`;
    const result = parseSkillPermissions(content);
    expect(result.external).toBe("full");
  });

  it("handles empty Permissions section", () => {
    const content = `## Permissions

## Next Section
`;
    const result = parseSkillPermissions(content);
    expect(result).toEqual({
      scope: "conversation-only",
      delegation: "opus",
      external: "none",
    });
  });

  it("handles a realistic chef prototype SKILL.md", () => {
    const content = `---
name: chef-prototype
description: Personal cooking assistant with taste memory
---

# Chef Prototype

A personal cooking assistant.

## Permissions

scope: conversation-only
delegation: opus

## Conversation Design

The chef converses naturally about cooking.

## Rules

- Always respect dietary restrictions.
`;
    const result = parseSkillPermissions(content);
    expect(result).toEqual({
      scope: "conversation-only",
      delegation: "opus",
      external: "none",
    });
  });

  it("handles a realistic deployment skill SKILL.md", () => {
    const content = `---
name: hostkit-deploy
description: Deploy services via HostKit
---

# HostKit Deploy

## Permissions

scope: custom
tools:
  allow: [read, hostkit_state, hostkit_search, hostkit_db_query]
delegation: opus
external: read

## Rules

- Always confirm before deploying.
`;
    const result = parseSkillPermissions(content);
    expect(result).toEqual({
      scope: "custom",
      tools: {
        allow: ["read", "hostkit_state", "hostkit_search", "hostkit_db_query"],
      },
      delegation: "opus",
      external: "read",
    });
  });

  it("ignores scope value case", () => {
    const content = `## Permissions

scope: Read-Only
`;
    const result = parseSkillPermissions(content);
    expect(result.scope).toBe("read-only");
  });
});
