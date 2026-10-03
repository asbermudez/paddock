/**
 * Hardware GL for the browser MCP (#964). Two things are pinned here: the GATE
 * (a GPU-less host must keep Playwright's defaults byte-for-byte, because on the
 * devbox image the flags without a device leave Chromium with no WebGL at all) and the
 * image contract (the `--config` path Paddock passes is the one the devbox image
 * actually writes, carrying `gl-egl` — `--use-angle=gl` silently stays on
 * SwiftShader).
 *
 * The device probe is exercised through its fs seam: CI has no GPU, and the
 * failure that matters most — a node that exists but whose open() the
 * container's device policy refuses — cannot be staged on a real filesystem.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  probeBrowserGpu,
  BROWSER_GPU_CONFIG,
  BROWSER_GPU_DEVICE,
  type BrowserGpuFs,
} from "../../src/browser-gpu.js";
import { browserMcpServers } from "../../src/herdctl-agent-names.js";
import { buildAgentConfig, buildTriggerConfig } from "../../src/herdctl-agent-config.js";
import { EMPTY_MCP_SOURCES } from "../../src/claude-mcp.js";
import { EMPTY_HOST_PLUGINS } from "../../src/claude-plugins.js";
import type { PaddockConfig } from "../../src/config.js";
import type { Project } from "../../src/projects.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const errno = (code: string) => Object.assign(new Error(code), { code });

/** A fake fs: `device` is the open() outcome, `config` the stat() outcome. */
function fakeFs(device: "ok" | string, config: "file" | "dir" | "missing") {
  const opened: Array<{ path: string; flags: string }> = [];
  const closed: number[] = [];
  const io: BrowserGpuFs = {
    openSync(p, flags) {
      opened.push({ path: p, flags });
      if (device !== "ok") throw errno(device);
      return 42;
    },
    closeSync(fd) {
      closed.push(fd);
    },
    statSync() {
      if (config === "missing") throw errno("ENOENT");
      return { isFile: () => config === "file" };
    },
  };
  return { io, opened, closed };
}

describe("probeBrowserGpu (#964)", () => {
  it("enables hardware GL only when the device opens AND the image config exists", () => {
    const { io, opened, closed } = fakeFs("ok", "file");
    const probe = probeBrowserGpu(BROWSER_GPU_DEVICE, BROWSER_GPU_CONFIG, io);
    expect(probe.config).toBe(BROWSER_GPU_CONFIG);
    expect(probe.reason).toMatch(/hardware WebGL/);
    // Read-write, as Mesa opens it — and the fd is not leaked.
    expect(opened).toEqual([{ path: BROWSER_GPU_DEVICE, flags: "r+" }]);
    expect(closed).toEqual([42]);
  });

  it("keeps defaults on a host with no GPU", () => {
    const probe = probeBrowserGpu(undefined, undefined, fakeFs("ENOENT", "file").io);
    expect(probe.config).toBeUndefined();
    expect(probe.reason).toMatch(/SwiftShader.*ENOENT/);
  });

  /**
   * The case `existsSync`/`access()` gets wrong. The server runs as root in the
   * image, root passes every permission-bit check, and a container's device
   * allowlist can still refuse the open — so only a real open() is honest.
   */
  it("keeps defaults when the node exists but the container refuses to open it", () => {
    for (const code of ["EPERM", "EACCES"]) {
      const probe = probeBrowserGpu(undefined, undefined, fakeFs(code, "file").io);
      expect(probe.config).toBeUndefined();
      expect(probe.reason).toContain(code);
    }
  });

  it("keeps defaults when the device is present but the image lacks the Mesa packages", () => {
    for (const config of ["missing", "dir"] as const) {
      const probe = probeBrowserGpu(undefined, undefined, fakeFs("ok", config).io);
      expect(probe.config).toBeUndefined();
      expect(probe.reason).toMatch(/is present but/);
    }
  });
});

const cfg = (browserMcp: boolean) =>
  ({ nativeSystemPrompt: true, browserMcp, dataDir: "/tmp/paddock-fixture" }) as unknown as PaddockConfig;

const project = (docker = false) =>
  ({ slug: "api", name: "API", dir: "/w/api", workingDir: "/w/api", docker }) as unknown as Project;

const trigger = {
  trigger: { type: "schedule", cron: "0 3 * * *" },
  run: {},
} as unknown as Parameters<typeof buildTriggerConfig>[3];

const DEFAULT_ARGS = ["--headless", "--no-sandbox", "--isolated", "--browser", "chromium"];

const playwrightArgs = (config: Record<string, unknown>) =>
  (config.mcp_servers as Record<string, { args: string[] }> | undefined)?.playwright.args;

describe("browserMcpServers + the agent builders (#964)", () => {
  it("leaves the args byte-identical to before when there is no GPU config", () => {
    expect(browserMcpServers(true)).toEqual({
      playwright: { command: "playwright-mcp", args: DEFAULT_ARGS },
    });
    expect(browserMcpServers(false, BROWSER_GPU_CONFIG)).toBeUndefined();
  });

  it("appends --config for the keeper and for triggers", () => {
    const want = [...DEFAULT_ARGS, "--config", BROWSER_GPU_CONFIG];
    const keeper = buildAgentConfig(
      cfg(true), project(), undefined, EMPTY_MCP_SOURCES, EMPTY_HOST_PLUGINS, BROWSER_GPU_CONFIG,
    );
    expect(playwrightArgs(keeper)).toEqual(want);
    expect(playwrightArgs(buildTriggerConfig(cfg(true), project(), "n", trigger, BROWSER_GPU_CONFIG)))
      .toEqual(want);
  });

  /**
   * A `docker: true` project's browser runs inside herdctl's container, not on
   * this host: the probe says nothing about its device, and a `--config` naming
   * a file missing there stops the MCP server starting at all.
   */
  it("never passes it to a docker: true project", () => {
    const keeper = buildAgentConfig(
      cfg(true), project(true), undefined, EMPTY_MCP_SOURCES, EMPTY_HOST_PLUGINS, BROWSER_GPU_CONFIG,
    );
    expect(playwrightArgs(keeper)).toEqual(DEFAULT_ARGS);
    expect(playwrightArgs(buildTriggerConfig(cfg(true), project(true), "n", trigger, BROWSER_GPU_CONFIG)))
      .toEqual(DEFAULT_ARGS);
  });
});

describe("the devbox image contract (#964)", () => {
  const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

  it("ships the config file at the path Paddock passes", () => {
    const copy = dockerfile.match(/^COPY scripts\/devbox\/playwright-mcp-gpu\.json (\S+)$/m);
    expect(copy?.[1]).toBe(BROWSER_GPU_CONFIG);
  });

  it("installs the EGL/Vulkan packages hardware GL needs", () => {
    for (const pkg of ["libegl1", "libegl-mesa0", "mesa-vulkan-drivers", "libvulkan1"]) {
      expect(dockerfile).toMatch(new RegExp(`\\b${pkg}\\b`));
    }
  });

  /** `--use-angle=gl` is the trap: same family, no error, silently SwiftShader. */
  it("selects ANGLE's gl-egl backend", () => {
    const file = JSON.parse(
      readFileSync(path.join(repoRoot, "scripts/devbox/playwright-mcp-gpu.json"), "utf8"),
    );
    expect(file).toEqual({
      browser: { launchOptions: { args: ["--use-gl=angle", "--use-angle=gl-egl"] } },
    });
  });
});
