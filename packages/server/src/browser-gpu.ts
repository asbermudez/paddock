/**
 * Hardware GL for the browser MCP's Chromium (#964).
 *
 * Without help, the headless Chromium that `playwright-mcp` launches renders
 * WebGL on SwiftShader — ANGLE's CPU rasterizer — even when a GPU is mapped into
 * the container. Measured on an Intel UHD 630 that is 12.7× slower and 16× more
 * CPU than the same GPU through Mesa; one WebGL page put a 12-core host at load
 * 22. Chromium will not choose the GPU on its own: it needs
 * `--use-gl=angle --use-angle=gl-egl` (NOT `--use-angle=gl`, which silently
 * lands back on SwiftShader), plus system `libEGL.so.1` + Mesa, which the devbox
 * image installs alongside {@link BROWSER_GPU_CONFIG}.
 *
 * `@playwright/mcp` has no CLI flag or env var for Chromium args — only a JSON
 * `--config` file whose `browser.launchOptions.args` are appended after
 * Playwright's own (so they win). That file is baked into the devbox image
 * rather than written here, so its presence also proves the Mesa packages it
 * depends on are installed: the two ship in the same image layer.
 *
 * The flags must be GATED, never unconditional. Measured with the flags set:
 *  - packages present, no device → on the built devbox image, NO WebGL at all:
 *    `getContext('webgl2')` and `getContext('webgl')` both return null. (A
 *    plainer Debian + Mesa image fell to llvmpipe instead: 51 fps on 6.35
 *    cores, more CPU than SwiftShader. Neither is acceptable.)
 *  - device present, no packages → silently SwiftShader, i.e. nothing gained.
 * Most hosts have no GPU, so the default path has to stay exactly as it is.
 */
import fs from "node:fs";

/** The DRM render node Mesa opens. The first GPU is always 128. */
export const BROWSER_GPU_DEVICE = "/dev/dri/renderD128";

/** The devbox image's `playwright-mcp --config` file carrying the ANGLE flags. */
export const BROWSER_GPU_CONFIG = "/etc/paddock/playwright-mcp-gpu.json";

export interface BrowserGpuProbe {
  /** The `--config` path to hand `playwright-mcp`, or undefined for defaults. */
  config?: string;
  /** One line for the boot log saying which renderer agents will get, and why. */
  reason: string;
}

/** The filesystem calls {@link probeBrowserGpu} makes — a seam for tests. */
export interface BrowserGpuFs {
  openSync(path: string, flags: string): number;
  closeSync(fd: number): void;
  statSync(path: string): { isFile(): boolean };
}

/**
 * Decide whether the browser MCP should get hardware GL. Returns the config path
 * only when BOTH hold:
 *
 *  - the render node opens read-write. A real `open()`, not `access()` or
 *    `existsSync`: the server runs as root in the image, and root passes every
 *    permission-bit check, but a container's device allowlist can still refuse
 *    the open. Mesa does exactly this open, so this is the honest test;
 *  - the image's config file exists (and with it, the Mesa/EGL packages).
 *
 * Never throws. Any failure means "leave Playwright's defaults alone".
 */
export function probeBrowserGpu(
  device: string = BROWSER_GPU_DEVICE,
  config: string = BROWSER_GPU_CONFIG,
  io: BrowserGpuFs = fs,
): BrowserGpuProbe {
  try {
    io.closeSync(io.openSync(device, "r+"));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? String(err);
    return { reason: `browser MCP: software WebGL (SwiftShader) — ${device} not openable (${code})` };
  }
  try {
    if (!io.statSync(config).isFile()) throw new Error("not a file");
  } catch {
    return {
      reason:
        `browser MCP: software WebGL (SwiftShader) — ${device} is present but ${config} is not; ` +
        `hardware GL needs the devbox image's Mesa/EGL packages`,
    };
  }
  return { config, reason: `browser MCP: hardware WebGL via ${device} (${config})` };
}
