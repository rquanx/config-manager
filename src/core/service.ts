import {existsSync} from "node:fs";
import path from "node:path";
import {CliError} from "./errors.js";
import {
  createSnapshot,
  deleteSnapshot,
  hasActiveItemChanges,
  restoreSnapshot,
} from "./snapshot.js";
import {
  deleteGroupStorage,
  ensureStorage,
  listGroups,
  readGroup,
  writeGroup,
} from "./storage.js";
import type {GroupItemMeta, GroupMeta, PromptOption} from "./types.js";
import {validateName} from "./validation.js";
import {promptChoice, promptConfirm, promptText} from "../ui/prompt.js";

export interface CommandContext {
  force: boolean;
  isInteractive: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeAbsolutePath(rawPath: string): string {
  return path.resolve(rawPath);
}

function findItem(group: GroupMeta, itemName: string): GroupItemMeta | undefined {
  return group.items.find((item) => item.name === itemName);
}

function getNextActiveItem(group: GroupMeta, deletedItemName: string): string | null {
  return group.items.find((item) => item.name !== deletedItemName)?.name ?? null;
}

function pathOverlaps(leftPath: string, rightPath: string): boolean {
  const relativeLeft = path.relative(leftPath, rightPath);
  const relativeRight = path.relative(rightPath, leftPath);

  return (
    relativeLeft === "" ||
    relativeRight === "" ||
    (!relativeLeft.startsWith("..") && !path.isAbsolute(relativeLeft)) ||
    (!relativeRight.startsWith("..") && !path.isAbsolute(relativeRight))
  );
}

async function confirmOrThrow(
  context: CommandContext,
  message: string,
  details?: string[],
): Promise<void> {
  if (context.force) {
    return;
  }

  if (!context.isInteractive) {
    throw new CliError(`${message} Run again with --force.`);
  }

  if (!(await promptConfirm(message, details))) {
    throw new CliError("operation cancelled.", 0);
  }
}

async function chooseOrThrow(
  context: CommandContext,
  message: string,
  options: PromptOption[],
): Promise<string> {
  if (!context.isInteractive) {
    throw new CliError(`${message} Run again with --force.`);
  }

  const choice = await promptChoice(message, options);
  if (!choice || choice === "cancel") {
    throw new CliError("operation cancelled.", 0);
  }

  return choice;
}

async function askForNewItemName(context: CommandContext): Promise<string> {
  if (!context.isInteractive) {
    throw new CliError("a new item name is required. Run again in an interactive terminal.");
  }

  const value = await promptText("Enter the new item name:");
  if (!value) {
    throw new CliError("operation cancelled.", 0);
  }

  validateName("item", value);
  return value;
}

function printGroupSummary(group: GroupMeta): void {
  console.log(`${group.name}${group.activeItem ? ` (active: ${group.activeItem})` : ""}`);
}

function printGroupName(group: GroupMeta): void {
  console.log(group.name);
}

export async function handleCreate(
  groupName: string,
  rawPaths: string[],
  context: CommandContext,
): Promise<void> {
  validateName("group", groupName);
  if (rawPaths.length === 0) {
    throw new CliError("create requires at least one path.");
  }

  await ensureStorage();

  const existingGroups = await listGroups();
  if (existingGroups.some((group) => group.name === groupName)) {
    throw new CliError(`group "${groupName}" already exists.`);
  }

  const paths = rawPaths.map(normalizeAbsolutePath);

  const missingPaths = paths.filter((targetPath) => !existsSync(targetPath));
  if (missingPaths.length > 0) {
    await confirmOrThrow(context, "Some configured paths do not exist yet.", missingPaths);
  }

  const conflictingDetails: string[] = [];
  for (const existingGroup of existingGroups) {
    for (const existingPath of existingGroup.paths) {
      for (const nextPath of paths) {
        if (pathOverlaps(existingPath, nextPath)) {
          conflictingDetails.push(
            `${nextPath} conflicts with group "${existingGroup.name}" path ${existingPath}`,
          );
        }
      }
    }
  }

  if (conflictingDetails.length > 0) {
    await confirmOrThrow(
      context,
      "Configured paths overlap with existing groups.",
      conflictingDetails,
    );
  }

  const timestamp = nowIso();
  const group: GroupMeta = {
    name: groupName,
    paths,
    createdAt: timestamp,
    updatedAt: timestamp,
    activeItem: "default",
    items: [
      {
        name: "default",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };

  await createSnapshot(group, "default");
  await writeGroup(group);
  console.log(`Created group "${groupName}" with default item.`);
}

export async function handleGroupAdd(
  groupName: string,
  itemName: string,
  context: CommandContext,
): Promise<void> {
  validateName("group", groupName);
  validateName("item", itemName);

  const group = await readGroup(groupName);
  const existingItem = findItem(group, itemName);
  if (existingItem) {
    await confirmOrThrow(
      context,
      `item "${itemName}" already exists in group "${groupName}". Overwrite it?`,
    );
  }

  await createSnapshot(group, itemName);

  const timestamp = nowIso();
  group.items = group.items.filter((item) => item.name !== itemName);
  group.items.push({
    name: itemName,
    createdAt: existingItem?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
  group.items.sort((left, right) => left.name.localeCompare(right.name));
  group.updatedAt = timestamp;
  await writeGroup(group);

  console.log(`Saved snapshot "${itemName}" in group "${groupName}".`);
}

export async function handleGroupDelete(
  groupName: string,
  itemName: string | undefined,
  context: CommandContext,
): Promise<void> {
  validateName("group", groupName);
  const group = await readGroup(groupName);

  if (!itemName) {
    await confirmOrThrow(context, `Delete group "${groupName}" and all its snapshots?`);
    await deleteGroupStorage(groupName);
    console.log(`Deleted group "${groupName}".`);
    return;
  }

  validateName("item", itemName);
  if (!findItem(group, itemName)) {
    throw new CliError(`item "${itemName}" does not exist in group "${groupName}".`);
  }

  await confirmOrThrow(context, `Delete item "${itemName}" from group "${groupName}"?`);
  await deleteSnapshot(groupName, itemName);
  group.items = group.items.filter((entry) => entry.name !== itemName);
  if (group.activeItem === itemName) {
    group.activeItem = getNextActiveItem(group, itemName);
  }
  group.updatedAt = nowIso();
  await writeGroup(group);
  console.log(`Deleted item "${itemName}" from group "${groupName}".`);
}

async function saveCurrentChangesBeforeSwitch(
  group: GroupMeta,
  context: CommandContext,
): Promise<void> {
  const choice = await chooseOrThrow(context, "Current files differ from the active item.", [
    {label: `Overwrite current item "${group.activeItem}"`, value: "overwrite"},
    {label: "Save as a new item", value: "new"},
    {label: "Cancel", value: "cancel"},
  ]);

  if (choice === "overwrite") {
    await createSnapshot(group, group.activeItem!);
    const currentItem = findItem(group, group.activeItem!);
    if (currentItem) {
      currentItem.updatedAt = nowIso();
    }
    group.updatedAt = nowIso();
    await writeGroup(group);
    return;
  }

  const nextItemName = await askForNewItemName(context);
  if (findItem(group, nextItemName)) {
    throw new CliError(`item "${nextItemName}" already exists in group "${group.name}".`);
  }

  const timestamp = nowIso();
  await createSnapshot(group, nextItemName);
  group.items.push({
    name: nextItemName,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  group.items.sort((left, right) => left.name.localeCompare(right.name));
  group.updatedAt = timestamp;
  await writeGroup(group);
}

export async function handleSwitch(
  groupName: string,
  itemName: string,
  context: CommandContext,
): Promise<void> {
  validateName("group", groupName);
  validateName("item", itemName);

  const group = await readGroup(groupName);
  if (!findItem(group, itemName)) {
    throw new CliError(`item "${itemName}" does not exist in group "${groupName}".`);
  }

  if (!context.force && group.activeItem && (await hasActiveItemChanges(group))) {
    await saveCurrentChangesBeforeSwitch(group, context);
  }

  await restoreSnapshot(groupName, itemName);
  group.activeItem = itemName;
  group.updatedAt = nowIso();
  await writeGroup(group);
  console.log(`Switched group "${groupName}" to item "${itemName}".`);
}

export async function handleList(): Promise<void> {
  const groups = await listGroups();
  if (groups.length === 0) {
    console.log("No groups found.");
    return;
  }

  for (const group of groups) {
    printGroupSummary(group);
  }
}

export async function handleCurrent(groupName: string): Promise<void> {
  validateName("group", groupName);
  const group = await readGroup(groupName);
  console.log(group.activeItem ?? "(none)");
}

export async function handleGroupList(groupName?: string): Promise<void> {
  if (!groupName) {
    const groups = await listGroups();
    if (groups.length === 0) {
      console.log("No groups found.");
      return;
    }

    for (const group of groups) {
      printGroupName(group);
    }

    return;
  }

  validateName("group", groupName);
  const group = await readGroup(groupName);
  if (group.items.length === 0) {
    console.log(`Group "${groupName}" has no items.`);
    return;
  }

  const items = [...group.items].sort((left, right) => left.name.localeCompare(right.name));
  for (const item of items) {
    const activeMark = group.activeItem === item.name ? "*" : " ";
    console.log(`${activeMark} ${item.name}`);
  }
}

export async function handleHelp(): Promise<void> {
  console.log(`config-manager

Commands:
  config-manager create <group-name> <path1> <path2> ...
  config-manager group add <group-name> <item-name>
  config-manager group delete <group-name> [item-name] [--force]
  config-manager group list [group-name]
  config-manager switch <group-name> <item-name> [--force]
  config-manager list
  config-manager current <group-name>`);
}
