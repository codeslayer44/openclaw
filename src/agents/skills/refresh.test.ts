import { describe, expect, it, vi } from "vitest";

const watchMock = vi.fn(() => ({
  on: vi.fn(),
  close: vi.fn(async () => undefined),
}));

vi.mock("chokidar", () => {
  return {
    default: { watch: watchMock },
  };
});

describe("ensureSkillsWatcher", () => {
  it("ignores node_modules, dist, and .git by default", async () => {
    const mod = await import("./refresh.js");
    mod.ensureSkillsWatcher({ workspaceDir: "/tmp/workspace" });

    expect(watchMock).toHaveBeenCalledTimes(1);
    const opts = watchMock.mock.calls[0]?.[1] as { ignored?: unknown };

    expect(opts.ignored).toBe(mod.DEFAULT_SKILLS_WATCH_IGNORED);
    const ignored = mod.DEFAULT_SKILLS_WATCH_IGNORED;
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/node_modules/pkg/index.js"))).toBe(
      true,
    );
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/dist/index.js"))).toBe(true);
    expect(ignored.some((re) => re.test("/tmp/workspace/skills/.git/config"))).toBe(true);
    expect(ignored.some((re) => re.test("/tmp/.hidden/skills/index.md"))).toBe(false);
  });

  it("bumps snapshot version on watcher creation (startup)", async () => {
    const mod = await import("./refresh.js");
    const workspaceDir = "/tmp/workspace-startup-test";

    // Before creating a watcher, version should be 0
    expect(mod.getSkillsSnapshotVersion(workspaceDir)).toBe(0);

    mod.ensureSkillsWatcher({ workspaceDir });

    // After creating the watcher, version should be > 0
    const version = mod.getSkillsSnapshotVersion(workspaceDir);
    expect(version).toBeGreaterThan(0);
  });

  it("does not re-bump version when watcher already exists", async () => {
    const mod = await import("./refresh.js");
    const workspaceDir = "/tmp/workspace-no-rebump-test";

    mod.ensureSkillsWatcher({ workspaceDir });
    const firstVersion = mod.getSkillsSnapshotVersion(workspaceDir);

    // Second call with same config should not bump again
    mod.ensureSkillsWatcher({ workspaceDir });
    const secondVersion = mod.getSkillsSnapshotVersion(workspaceDir);

    expect(secondVersion).toBe(firstVersion);
  });
});
