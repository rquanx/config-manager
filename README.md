# @rquanx/config-manager

A local CLI for managing multiple configuration snapshots across files and folders.

## Install

```bash
pnpm add -g @rquanx/config-manager
```

Or run it locally from the repo:

```bash
pnpm install
pnpm build
node dist/index.js --help
node dist/index.js --version
```

## What It Does

`config-manager` lets you define a named `group` of paths, then save multiple `item` snapshots for that group and switch between them later.

Example use cases:

- switch between multiple proxy configs
- keep several app profile directories
- store local machine-specific config variants

All metadata and snapshots are stored under the current user's home directory in `~/.config-manager/`.

## Concepts

- `group`: a named set of managed paths
- `item`: a snapshot for one group
- `active item`: the snapshot currently considered active for that group

When you create a group, the CLI automatically creates a default snapshot named `default`.

## Commands

### Create a group

```bash
config-manager create <group-name> <path1> <path2> ...
```

Notes:

- relative paths are resolved from the current working directory
- paths are stored internally as absolute paths
- missing paths require confirmation, or `--force` in non-interactive usage
- overlapping paths with another group require confirmation

Example:

```bash
config-manager create quanx ~/.config/quanx/profile.conf ~/.config/quanx/rules
```

### Add or overwrite a snapshot

```bash
config-manager group add <group-name> <item-name>
```

If the item already exists, the CLI asks for confirmation before overwriting it.

### Delete a group

```bash
config-manager group delete <group-name>
config-manager group delete <group-name> --force
```

This removes the group metadata and all stored snapshots.

### Delete one item

```bash
config-manager group delete <group-name> <item-name>
config-manager group delete <group-name> <item-name> --force
```

If the deleted item is currently active, the CLI automatically switches the group to the first remaining item. Empty groups are allowed.

### Switch to another item

```bash
config-manager switch <group-name> <item-name>
config-manager switch <group-name> <item-name> --force
```

Behavior:

- only the paths configured in the group are restored
- files and directories are overwritten from the target snapshot
- extra unmanaged files are left untouched
- if current files differ from the active item, the CLI asks whether to overwrite the current item, save a new item, or ignore current changes and switch anyway
- `--force` skips that prompt and switches immediately

### Show all groups with active item

```bash
config-manager list
```

### Show the active item for one group

```bash
config-manager current <group-name>
```

### List groups or items

```bash
config-manager group list
config-manager group list <group-name>
```

Behavior:

- without a name, lists all groups
- with a group name, lists all items in that group and marks the active item with `*`

## Snapshot Rules

- supports files and directories
- directories are saved recursively
- hidden files are included
- empty directories are ignored
- symlinks are stored and restored as symlinks, not as copied target content

## Naming Rules

`group` and `item` names may only contain:

- letters
- numbers
- `-`
- `_`

## Non-Interactive Usage

If an operation needs confirmation and the CLI is running without a TTY, it fails with a message asking you to rerun with `--force`.

## Development

```bash
pnpm install
pnpm lint
pnpm build
pnpm test
pnpm pack:check
```

## Release

This repository publishes to npm automatically through GitHub Actions when a version tag is pushed.

Before the first release, add `NPM_TOKEN` to the repository's GitHub Actions secrets.

Release flow:

```bash
# 1. update package.json version and changelog
git add package.json CHANGELOG.md
git commit -m "release: v0.1.1"

# 2. push the release commit
git push origin master

# 3. create and push the matching tag
git tag v0.1.1
git push origin v0.1.1
```

The workflow will install dependencies, run tests, verify that the tag matches `package.json`, and then publish the package to npm.
