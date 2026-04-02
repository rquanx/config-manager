import crypto from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {getSnapshotDir, readSnapshotManifest, writeSnapshotManifest} from "./storage.js";
import type {GroupMeta, SnapshotManifest, SnapshotPathRecord} from "./types.js";

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureCleanDir(targetPath: string): Promise<void> {
  await rm(targetPath, {force: true, recursive: true});
  await mkdir(targetPath, {recursive: true});
}

async function hashFile(targetPath: string): Promise<string> {
  const buffer = await readFile(targetPath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function removePathIfExists(targetPath: string): Promise<void> {
  if (!(await pathExists(targetPath))) {
    return;
  }

  const info = await lstat(targetPath);
  if (info.isDirectory() && !info.isSymbolicLink()) {
    await rm(targetPath, {recursive: true, force: true});
    return;
  }

  await unlink(targetPath);
}

async function detectLinkType(sourcePath: string): Promise<"file" | "dir" | "junction"> {
  try {
    const info = await stat(sourcePath);
    return info.isDirectory() ? "dir" : "file";
  } catch {
    return "file";
  }
}

async function copyEntryPreservingType(
  sourcePath: string,
  destinationPath: string,
): Promise<boolean> {
  const info = await lstat(sourcePath);

  if (info.isSymbolicLink()) {
    const linkTarget = await readlink(sourcePath);
    const linkType = await detectLinkType(sourcePath);
    await mkdir(path.dirname(destinationPath), {recursive: true});
    await symlink(linkTarget, destinationPath, linkType);
    return true;
  }

  if (info.isDirectory()) {
    const children = await readdir(sourcePath);
    let hasCopiedChildren = false;

    for (const child of children) {
      const copied = await copyEntryPreservingType(
        path.join(sourcePath, child),
        path.join(destinationPath, child),
      );
      hasCopiedChildren = hasCopiedChildren || copied;
    }

    return hasCopiedChildren;
  }

  await mkdir(path.dirname(destinationPath), {recursive: true});
  await copyFile(sourcePath, destinationPath);
  return true;
}

async function snapshotConfiguredPath(
  groupName: string,
  itemName: string,
  sourcePath: string,
  index: number,
): Promise<SnapshotPathRecord> {
  const snapshotDir = getSnapshotDir(groupName, itemName);
  const payloadRelativeBase = path.join("entries", String(index));

  try {
    const info = await lstat(sourcePath);

    if (info.isSymbolicLink()) {
      return {
        sourcePath,
        kind: "symlink",
        linkTarget: await readlink(sourcePath),
        linkType: await detectLinkType(sourcePath),
      };
    }

    if (info.isDirectory()) {
      const payloadRelativePath = path.join(payloadRelativeBase, "directory");
      await mkdir(path.join(snapshotDir, payloadRelativePath), {recursive: true});
      const children = await readdir(sourcePath);

      for (const child of children) {
        await copyEntryPreservingType(
          path.join(sourcePath, child),
          path.join(snapshotDir, payloadRelativePath, child),
        );
      }

      return {
        sourcePath,
        kind: "directory",
        payloadRelativePath,
      };
    }

    const payloadRelativePath = path.join(payloadRelativeBase, "file");
    await mkdir(path.dirname(path.join(snapshotDir, payloadRelativePath)), {
      recursive: true,
    });
    await copyFile(sourcePath, path.join(snapshotDir, payloadRelativePath));
    return {
      sourcePath,
      kind: "file",
      payloadRelativePath,
    };
  } catch {
    return {
      sourcePath,
      kind: "missing",
    };
  }
}

async function compareDirectories(
  snapshotPath: string,
  currentPath: string,
): Promise<boolean> {
  try {
    const currentInfo = await lstat(currentPath);
    if (!currentInfo.isDirectory() || currentInfo.isSymbolicLink()) {
      return false;
    }
  } catch {
    return false;
  }

  const snapshotEntries = await readdir(snapshotPath, {withFileTypes: true});
  const currentEntries = await readdir(currentPath, {withFileTypes: true});

  if (snapshotEntries.length !== currentEntries.length) {
    return false;
  }

  for (const snapshotEntry of snapshotEntries) {
    const currentEntry = currentEntries.find((entry) => entry.name === snapshotEntry.name);
    if (!currentEntry) {
      return false;
    }

    const snapshotEntryPath = path.join(snapshotPath, snapshotEntry.name);
    const currentEntryPath = path.join(currentPath, currentEntry.name);
    const snapshotInfo = await lstat(snapshotEntryPath);

    if (snapshotInfo.isSymbolicLink()) {
      const currentInfo = await lstat(currentEntryPath);
      if (!currentInfo.isSymbolicLink()) {
        return false;
      }

      if ((await readlink(snapshotEntryPath)) !== (await readlink(currentEntryPath))) {
        return false;
      }

      continue;
    }

    if (snapshotInfo.isDirectory()) {
      if (!(await compareDirectories(snapshotEntryPath, currentEntryPath))) {
        return false;
      }
      continue;
    }

    if ((await hashFile(snapshotEntryPath)) !== (await hashFile(currentEntryPath))) {
      return false;
    }
  }

  return true;
}

async function compareSnapshotRecord(
  record: SnapshotPathRecord,
  snapshotBaseDir: string,
  currentPath: string,
): Promise<boolean> {
  switch (record.kind) {
    case "missing":
      return !(await pathExists(currentPath));
    case "symlink": {
      try {
        const info = await lstat(currentPath);
        if (!info.isSymbolicLink()) {
          return false;
        }

        return (await readlink(currentPath)) === record.linkTarget;
      } catch {
        return false;
      }
    }
    case "file": {
      try {
        const info = await lstat(currentPath);
        if (!info.isFile()) {
          return false;
        }

        const snapshotPath = path.join(snapshotBaseDir, record.payloadRelativePath!);
        return (await hashFile(currentPath)) === (await hashFile(snapshotPath));
      } catch {
        return false;
      }
    }
    case "directory":
      return compareDirectories(
        path.join(snapshotBaseDir, record.payloadRelativePath!),
        currentPath,
      );
  }
}

async function restoreDirectoryContents(
  snapshotPath: string,
  targetPath: string,
): Promise<void> {
  await mkdir(targetPath, {recursive: true});
  const entries = await readdir(snapshotPath, {withFileTypes: true});

  for (const entry of entries) {
    const snapshotEntryPath = path.join(snapshotPath, entry.name);
    const targetEntryPath = path.join(targetPath, entry.name);

    if (entry.isSymbolicLink()) {
      await removePathIfExists(targetEntryPath);
      const linkTarget = await readlink(snapshotEntryPath);
      const linkType = await detectLinkType(snapshotEntryPath);
      await symlink(linkTarget, targetEntryPath, linkType);
      continue;
    }

    if (entry.isDirectory()) {
      if (await pathExists(targetEntryPath)) {
        const targetInfo = await lstat(targetEntryPath);
        if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink()) {
          await removePathIfExists(targetEntryPath);
        }
      }

      await mkdir(targetEntryPath, {recursive: true});
      await restoreDirectoryContents(snapshotEntryPath, targetEntryPath);
      continue;
    }

    if (await pathExists(targetEntryPath)) {
      const targetInfo = await lstat(targetEntryPath);
      if (!targetInfo.isFile()) {
        await removePathIfExists(targetEntryPath);
      }
    }

    await mkdir(path.dirname(targetEntryPath), {recursive: true});
    await copyFile(snapshotEntryPath, targetEntryPath);
  }
}

async function restoreSnapshotRecord(
  record: SnapshotPathRecord,
  snapshotBaseDir: string,
): Promise<void> {
  switch (record.kind) {
    case "missing":
      await removePathIfExists(record.sourcePath);
      return;
    case "symlink":
      await removePathIfExists(record.sourcePath);
      await mkdir(path.dirname(record.sourcePath), {recursive: true});
      await symlink(record.linkTarget!, record.sourcePath, record.linkType);
      return;
    case "file":
      await removePathIfExists(record.sourcePath);
      await mkdir(path.dirname(record.sourcePath), {recursive: true});
      await copyFile(
        path.join(snapshotBaseDir, record.payloadRelativePath!),
        record.sourcePath,
      );
      return;
    case "directory":
      if (await pathExists(record.sourcePath)) {
        const targetInfo = await lstat(record.sourcePath);
        if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink()) {
          await removePathIfExists(record.sourcePath);
        }
      }

      await mkdir(record.sourcePath, {recursive: true});
      await restoreDirectoryContents(
        path.join(snapshotBaseDir, record.payloadRelativePath!),
        record.sourcePath,
      );
      return;
  }
}

export async function createSnapshot(
  group: GroupMeta,
  itemName: string,
): Promise<SnapshotManifest> {
  const snapshotDir = getSnapshotDir(group.name, itemName);
  await ensureCleanDir(snapshotDir);

  const manifest: SnapshotManifest = {
    groupName: group.name,
    itemName,
    createdAt: new Date().toISOString(),
    paths: [],
  };

  for (const [index, sourcePath] of group.paths.entries()) {
    manifest.paths.push(
      await snapshotConfiguredPath(group.name, itemName, sourcePath, index),
    );
  }

  await writeSnapshotManifest(group.name, itemName, manifest);
  return manifest;
}

export async function hasActiveItemChanges(group: GroupMeta): Promise<boolean> {
  if (!group.activeItem) {
    return false;
  }

  const manifest = await readSnapshotManifest(group.name, group.activeItem);
  const snapshotBaseDir = getSnapshotDir(group.name, group.activeItem);

  for (const record of manifest.paths) {
    if (!(await compareSnapshotRecord(record, snapshotBaseDir, record.sourcePath))) {
      return true;
    }
  }

  return false;
}

export async function restoreSnapshot(groupName: string, itemName: string): Promise<void> {
  const manifest = await readSnapshotManifest(groupName, itemName);
  const snapshotBaseDir = getSnapshotDir(groupName, itemName);

  for (const record of manifest.paths) {
    await restoreSnapshotRecord(record, snapshotBaseDir);
  }
}

export async function deleteSnapshot(groupName: string, itemName: string): Promise<void> {
  await rm(getSnapshotDir(groupName, itemName), {recursive: true, force: true});
}
