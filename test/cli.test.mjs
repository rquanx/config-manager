import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "dist", "index.js");

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "config-manager-test-"));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(home, {recursive: true});
  fs.mkdirSync(workspace, {recursive: true});
  return {root, home, workspace};
}

function cleanupSandbox(sandbox) {
  fs.rmSync(sandbox.root, {recursive: true, force: true});
}

function runCli(sandbox, args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: sandbox.workspace,
    env: {
      ...process.env,
      HOME: sandbox.home,
      USERPROFILE: sandbox.home,
    },
    encoding: "utf8",
    ...options,
  });
}

function canCreateSymlink(sandbox) {
  const target = path.join(sandbox.workspace, "symlink-target.txt");
  const link = path.join(sandbox.workspace, "symlink-check.txt");

  try {
    fs.writeFileSync(target, "target\n");
    fs.symlinkSync(target, link, "file");
    fs.unlinkSync(link);
    fs.rmSync(target, {force: true});
    return true;
  } catch {
    fs.rmSync(link, {force: true});
    fs.rmSync(target, {force: true});
    return false;
  }
}

test("create, list, current, and group list work together", () => {
  const sandbox = makeSandbox();

  try {
    const configFile = path.join(sandbox.workspace, "app.conf");
    const configDir = path.join(sandbox.workspace, "profile");
    fs.writeFileSync(configFile, "alpha\n");
    fs.mkdirSync(configDir, {recursive: true});
    fs.writeFileSync(path.join(configDir, "nested.txt"), "one\n");

    let result = runCli(sandbox, ["create", "demo", configFile, configDir, "--force"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Created group "demo" with default item\./);

    result = runCli(sandbox, ["list"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "demo (active: default)");

    result = runCli(sandbox, ["group", "list"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "demo");

    result = runCli(sandbox, ["group", "list", "demo"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "* default");

    result = runCli(sandbox, ["current", "demo"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "default");
  } finally {
    cleanupSandbox(sandbox);
  }
});

test("version flag prints the package version", () => {
  const sandbox = makeSandbox();

  try {
    const result = runCli(sandbox, ["--version"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "0.1.0");
  } finally {
    cleanupSandbox(sandbox);
  }
});

test("switch restores file and directory contents and deleting active item moves active pointer", () => {
  const sandbox = makeSandbox();

  try {
    const configFile = path.join(sandbox.workspace, "app.conf");
    const configDir = path.join(sandbox.workspace, "profile");
    const nestedFile = path.join(configDir, "nested.txt");
    fs.writeFileSync(configFile, "alpha\n");
    fs.mkdirSync(configDir, {recursive: true});
    fs.writeFileSync(nestedFile, "one\n");

    let result = runCli(sandbox, ["create", "demo", configFile, configDir, "--force"]);
    assert.equal(result.status, 0, result.stderr);

    fs.writeFileSync(configFile, "beta\n");
    fs.writeFileSync(nestedFile, "two\n");
    result = runCli(sandbox, ["group", "add", "demo", "second", "--force"]);
    assert.equal(result.status, 0, result.stderr);

    fs.writeFileSync(configFile, "gamma\n");
    fs.writeFileSync(nestedFile, "three\n");
    result = runCli(sandbox, ["switch", "demo", "default", "--force"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(configFile, "utf8"), "alpha\n");
    assert.equal(fs.readFileSync(nestedFile, "utf8"), "one\n");

    result = runCli(sandbox, ["switch", "demo", "second", "--force"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(configFile, "utf8"), "beta\n");
    assert.equal(fs.readFileSync(nestedFile, "utf8"), "two\n");

    result = runCli(sandbox, ["group", "delete", "demo", "second", "--force"]);
    assert.equal(result.status, 0, result.stderr);

    result = runCli(sandbox, ["current", "demo"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "default");
  } finally {
    cleanupSandbox(sandbox);
  }
});

test("non-interactive confirmation paths require --force", () => {
  const sandbox = makeSandbox();

  try {
    const missingPath = path.join(sandbox.workspace, "missing.conf");
    let result = runCli(sandbox, ["create", "demo", missingPath]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Run again with --force\./);

    const configFile = path.join(sandbox.workspace, "app.conf");
    fs.writeFileSync(configFile, "alpha\n");
    result = runCli(sandbox, ["create", "demo2", configFile, "--force"]);
    assert.equal(result.status, 0, result.stderr);

    fs.writeFileSync(configFile, "beta\n");
    result = runCli(sandbox, ["group", "add", "demo2", "second", "--force"]);
    assert.equal(result.status, 0, result.stderr);

    fs.writeFileSync(configFile, "changed-locally\n");
    result = runCli(sandbox, ["switch", "demo2", "second"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Run again with --force\./);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test("nested empty directories are ignored during restore", () => {
  const sandbox = makeSandbox();

  try {
    const configDir = path.join(sandbox.workspace, "profile");
    const nestedFile = path.join(configDir, "nested.txt");
    const emptyDir = path.join(configDir, "empty");
    fs.mkdirSync(emptyDir, {recursive: true});
    fs.writeFileSync(nestedFile, "one\n");

    let result = runCli(sandbox, ["create", "demo", configDir, "--force"]);
    assert.equal(result.status, 0, result.stderr);

    fs.rmSync(configDir, {recursive: true, force: true});
    result = runCli(sandbox, ["switch", "demo", "default", "--force"]);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(fs.readFileSync(nestedFile, "utf8"), "one\n");
    assert.equal(fs.existsSync(emptyDir), false);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test("symlink snapshots restore the link itself when the platform allows it", (t) => {
  const sandbox = makeSandbox();

  try {
    if (!canCreateSymlink(sandbox)) {
      t.skip("symlink creation is not available in this environment");
      return;
    }

    const firstTarget = path.join(sandbox.workspace, "target-one.txt");
    const secondTarget = path.join(sandbox.workspace, "target-two.txt");
    const thirdTarget = path.join(sandbox.workspace, "target-three.txt");
    const linkPath = path.join(sandbox.workspace, "current-link.txt");

    fs.writeFileSync(firstTarget, "one\n");
    fs.writeFileSync(secondTarget, "two\n");
    fs.writeFileSync(thirdTarget, "three\n");
    fs.symlinkSync(firstTarget, linkPath, "file");

    let result = runCli(sandbox, ["create", "demo", linkPath, "--force"]);
    assert.equal(result.status, 0, result.stderr);

    fs.rmSync(linkPath, {force: true});
    fs.symlinkSync(secondTarget, linkPath, "file");
    result = runCli(sandbox, ["group", "add", "demo", "second", "--force"]);
    assert.equal(result.status, 0, result.stderr);

    fs.rmSync(linkPath, {force: true});
    fs.symlinkSync(thirdTarget, linkPath, "file");

    result = runCli(sandbox, ["switch", "demo", "default", "--force"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(linkPath), firstTarget);

    result = runCli(sandbox, ["switch", "demo", "second", "--force"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(linkPath), secondTarget);
  } finally {
    cleanupSandbox(sandbox);
  }
});
