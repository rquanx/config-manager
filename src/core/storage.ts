import {mkdir, readdir, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {CliError} from "./errors.js";
import type {GroupMeta, SnapshotManifest} from "./types.js";

const STORAGE_DIRNAME = ".config-manager";

export interface StoragePaths {
  root: string;
  groupsDir: string;
  snapshotsDir: string;
}

function getStoragePaths(): StoragePaths {
  const root = path.join(os.homedir(), STORAGE_DIRNAME);
  return {
    root,
    groupsDir: path.join(root, "groups"),
    snapshotsDir: path.join(root, "snapshots"),
  };
}

export async function ensureStorage(): Promise<StoragePaths> {
  const paths = getStoragePaths();
  await mkdir(paths.groupsDir, {recursive: true});
  await mkdir(paths.snapshotsDir, {recursive: true});
  return paths;
}

export function getGroupMetaPath(groupName: string): string {
  const paths = getStoragePaths();
  return path.join(paths.groupsDir, `${groupName}.json`);
}

export function getSnapshotDir(groupName: string, itemName: string): string {
  const paths = getStoragePaths();
  return path.join(paths.snapshotsDir, groupName, itemName);
}

export async function readGroup(groupName: string): Promise<GroupMeta> {
  const filePath = getGroupMetaPath(groupName);

  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as GroupMeta;
  } catch {
    throw new CliError(`group "${groupName}" does not exist.`);
  }
}

export async function writeGroup(meta: GroupMeta): Promise<void> {
  await ensureStorage();
  await writeFile(
    getGroupMetaPath(meta.name),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
}

export async function deleteGroupStorage(groupName: string): Promise<void> {
  const filePath = getGroupMetaPath(groupName);
  await rm(filePath, {force: true});
  await rm(path.join(getStoragePaths().snapshotsDir, groupName), {
    force: true,
    recursive: true,
  });
}

export async function listGroups(): Promise<GroupMeta[]> {
  await ensureStorage();
  const entries = await readdir(getStoragePaths().groupsDir, {withFileTypes: true});
  const groups: GroupMeta[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const name = entry.name.slice(0, -5);
    groups.push(await readGroup(name));
  }

  return groups.sort((left, right) => left.name.localeCompare(right.name));
}

export async function writeSnapshotManifest(
  groupName: string,
  itemName: string,
  manifest: SnapshotManifest,
): Promise<void> {
  const snapshotDir = getSnapshotDir(groupName, itemName);
  await mkdir(snapshotDir, {recursive: true});
  await writeFile(
    path.join(snapshotDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

export async function readSnapshotManifest(
  groupName: string,
  itemName: string,
): Promise<SnapshotManifest> {
  const filePath = path.join(getSnapshotDir(groupName, itemName), "manifest.json");

  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as SnapshotManifest;
  } catch {
    throw new CliError(`item "${itemName}" does not exist in group "${groupName}".`);
  }
}
