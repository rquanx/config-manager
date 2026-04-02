#!/usr/bin/env node
import process from "node:process";
import packageJson from "../package.json" with {type: "json"};
import {CliError} from "./core/errors.js";
import {
  handleCreate,
  handleCurrent,
  handleGroupAdd,
  handleGroupDelete,
  handleGroupList,
  handleHelp,
  handleList,
  handleSwitch,
} from "./core/service.js";

interface ParsedArgs {
  positional: string[];
  force: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  let force = false;

  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }

    positional.push(arg);
  }

  return {positional, force};
}

async function main(): Promise<void> {
  const {positional, force} = parseArgs(process.argv.slice(2));
  const [command, ...rest] = positional;
  const context = {
    force,
    isInteractive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  };

  if (!command || command === "--help" || command === "-h" || command === "help") {
    await handleHelp();
    return;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    console.log(packageJson.version);
    return;
  }

  switch (command) {
    case "create": {
      const [groupName, ...paths] = rest;
      if (!groupName) {
        throw new CliError("create requires a group name.");
      }

      await handleCreate(groupName, paths, context);
      return;
    }
    case "group": {
      const [subcommand, ...subRest] = rest;
      switch (subcommand) {
        case "add": {
          const [groupName, itemName] = subRest;
          if (!groupName || !itemName) {
            throw new CliError("group add requires a group name and item name.");
          }

          await handleGroupAdd(groupName, itemName, context);
          return;
        }
        case "delete": {
          const [groupName, itemName] = subRest;
          if (!groupName) {
            throw new CliError("group delete requires a group name.");
          }

          await handleGroupDelete(groupName, itemName, context);
          return;
        }
        case "list":
          await handleGroupList(subRest[0]);
          return;
        default:
          throw new CliError(`unknown group subcommand "${subcommand ?? ""}".`);
      }
    }
    case "switch": {
      const [groupName, itemName] = rest;
      if (!groupName || !itemName) {
        throw new CliError("switch requires a group name and item name.");
      }

      await handleSwitch(groupName, itemName, context);
      return;
    }
    case "list":
      await handleList();
      return;
    case "current": {
      const [groupName] = rest;
      if (!groupName) {
        throw new CliError("current requires a group name.");
      }

      await handleCurrent(groupName);
      return;
    }
    default:
      throw new CliError(`unknown command "${command}".`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof CliError) {
    if (error.message) {
      console.error(error.message);
    }
    process.exit(error.exitCode);
  }

  console.error(error);
  process.exit(1);
});
