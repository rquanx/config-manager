import {CliError} from "./errors.js";

const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export function validateName(kind: "group" | "item", value: string): void {
  if (!NAME_PATTERN.test(value)) {
    throw new CliError(
      `${kind} name "${value}" is invalid. Use only letters, numbers, "-" and "_".`,
    );
  }
}
