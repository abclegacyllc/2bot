/**
 * Plugin FS Prelude Tests (Phase 5.2)
 *
 * Spawns isolated Node child processes with the prelude loaded via
 * --require, and asserts the per-plugin filesystem boundary is
 * enforced (cross-plugin access denied, own-dir access allowed).
 *
 * @module __tests__/plugin-fs-prelude.test
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PRELUDE = path.resolve(__dirname, "../../docker/workspace/bridge-agent/plugin-fs-prelude.js");

let workspaceDir: string;
let pluginADir: string;
let pluginBDir: string;
let bridgeInternalFile: string;

beforeAll(() => {
  workspaceDir = mkdtempSync(path.join(tmpdir(), "ws-prelude-"));
  pluginADir = path.join(workspaceDir, "plugins", "plugin-a");
  pluginBDir = path.join(workspaceDir, "plugins", "plugin-b");
  mkdirSync(pluginADir, { recursive: true });
  mkdirSync(pluginBDir, { recursive: true });
  mkdirSync(path.join(workspaceDir, ".2bot"), { recursive: true });

  writeFileSync(path.join(pluginADir, "own.txt"), "own-data");
  writeFileSync(path.join(pluginBDir, "secret.txt"), "plugin-b-secret");
  bridgeInternalFile = path.join(workspaceDir, ".2bot", "storage.db");
  writeFileSync(bridgeInternalFile, "internal");
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

/**
 * Run a snippet of Node code with the prelude active, scoped to plugin-a.
 * Returns { code, stdout, stderr }.
 */
function runWithPrelude(snippet: string, extraEnv: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ["--require", PRELUDE, "-e", snippet],
    {
      env: {
        PATH: process.env.PATH ?? "",
        WORKSPACE_DIR: workspaceDir,
        PLUGIN_DIR: pluginADir,
        PLUGIN_SLUG: "plugin-a",
        ...extraEnv,
      } as unknown as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe("plugin-fs-prelude", () => {
  it("allows reads inside the plugin's own directory", () => {
    const res = runWithPrelude(
      `const fs = require('fs'); console.log(fs.readFileSync(${JSON.stringify(path.join(pluginADir, "own.txt"))}, 'utf8'));`,
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("own-data");
  });

  it("denies sync reads of another plugin's directory", () => {
    const res = runWithPrelude(
      `const fs = require('fs'); try { fs.readFileSync(${JSON.stringify(path.join(pluginBDir, "secret.txt"))}, 'utf8'); console.log('LEAKED'); } catch (e) { console.log('BLOCKED:' + e.code); }`,
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("BLOCKED:EACCES");
  });

  it("denies async-callback reads of another plugin's directory", () => {
    const res = runWithPrelude(
      `const fs = require('fs'); fs.readFile(${JSON.stringify(path.join(pluginBDir, "secret.txt"))}, 'utf8', (err, data) => { console.log(err ? 'BLOCKED:' + err.code : 'LEAKED:' + data); });`,
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("BLOCKED:EACCES");
  });

  it("denies fs.promises reads of another plugin's directory", () => {
    const res = runWithPrelude(
      `const fsp = require('fs').promises; fsp.readFile(${JSON.stringify(path.join(pluginBDir, "secret.txt"))}, 'utf8').then(d => console.log('LEAKED:' + d), e => console.log('BLOCKED:' + e.code));`,
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("BLOCKED:EACCES");
  });

  it("denies writes into another plugin's directory", () => {
    const res = runWithPrelude(
      `const fs = require('fs'); try { fs.writeFileSync(${JSON.stringify(path.join(pluginBDir, "injected.txt"))}, 'pwn'); console.log('LEAKED'); } catch (e) { console.log('BLOCKED:' + e.code); }`,
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("BLOCKED:EACCES");
  });

  it("denies access to the .2bot bridge internal directory", () => {
    const res = runWithPrelude(
      `const fs = require('fs'); try { fs.readFileSync(${JSON.stringify(bridgeInternalFile)}, 'utf8'); console.log('LEAKED'); } catch (e) { console.log('BLOCKED:' + e.code); }`,
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("BLOCKED:EACCES");
  });

  it("allows access to system paths (e.g. /etc/hostname) — only cross-plugin/.2bot are blocked", () => {
    const res = runWithPrelude(
      `const fs = require('fs'); try { fs.statSync('/etc'); console.log('OK'); } catch (e) { console.log('UNEXPECTED:' + e.code); }`,
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("OK");
  });

  it("denies stat on another plugin's directory", () => {
    const res = runWithPrelude(
      `const fs = require('fs'); try { fs.statSync(${JSON.stringify(pluginBDir)}); console.log('LEAKED'); } catch (e) { console.log('BLOCKED:' + e.code); }`,
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("BLOCKED:EACCES");
  });

  it("denies readdir on the plugins root (would reveal sibling plugins)", () => {
    const res = runWithPrelude(
      `const fs = require('fs'); try { console.log('LEAKED:' + fs.readdirSync(${JSON.stringify(path.join(workspaceDir, "plugins"))}).join(',')); } catch (e) { console.log('BLOCKED:' + e.code); }`,
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("BLOCKED:EACCES");
  });

  it("can be disabled via PLUGIN_FS_PRELUDE_ENABLED=false (escape hatch for ops)", () => {
    const res = runWithPrelude(
      `const fs = require('fs'); console.log(fs.readFileSync(${JSON.stringify(path.join(pluginBDir, "secret.txt"))}, 'utf8'));`,
      { PLUGIN_FS_PRELUDE_ENABLED: "false" },
    );
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe("plugin-b-secret");
  });

  it("does nothing when PLUGIN_DIR is unset (e.g. running outside plugin-runner)", () => {
    const res = spawnSync(
      process.execPath,
      ["--require", PRELUDE, "-e",
        `const fs = require('fs'); console.log(fs.readFileSync(${JSON.stringify(path.join(pluginBDir, "secret.txt"))}, 'utf8'));`,
      ],
      {
        env: { PATH: process.env.PATH ?? "", WORKSPACE_DIR: workspaceDir } as unknown as NodeJS.ProcessEnv,
        encoding: "utf8",
        timeout: 10_000,
      },
    );
    expect(res.status ?? -1).toBe(0);
    expect(res.stdout.trim()).toBe("plugin-b-secret");
  });
});
