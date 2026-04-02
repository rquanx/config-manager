import React, {useState} from "react";
import {Box, Text, render, useInput} from "ink";
import type {PromptOption} from "../core/types.js";

function isPrintableCharacter(input: string): boolean {
  return input.length === 1 && !/[\u0000-\u001f\u007f]/.test(input);
}

function ConfirmPrompt({
  message,
  details = [],
  onSubmit,
}: {
  message: string;
  details?: string[];
  onSubmit: (value: boolean) => void;
}) {
  const [value, setValue] = useState(true);

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow || key.tab) {
      setValue((current) => !current);
      return;
    }

    if (input.toLowerCase() === "y") {
      onSubmit(true);
      return;
    }

    if (input.toLowerCase() === "n" || key.escape) {
      onSubmit(false);
      return;
    }

    if (key.return) {
      onSubmit(value);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="cyan">{message}</Text>
      {details.map((detail) => (
        <Text key={detail} color="gray">
          {detail}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text color={value ? "green" : "white"}>[Yes]</Text>
        <Text> </Text>
        <Text color={!value ? "red" : "white"}>[No]</Text>
      </Box>
      <Text color="gray">Use left/right, Y/N or Enter.</Text>
    </Box>
  );
}

function ChoicePrompt({
  message,
  options,
  onSubmit,
}: {
  message: string;
  options: PromptOption[];
  onSubmit: (value: string | null) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((current) =>
        current === 0 ? options.length - 1 : current - 1,
      );
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((current) =>
        current === options.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (key.return) {
      onSubmit(options[selectedIndex]?.value ?? null);
      return;
    }

    if (key.escape) {
      onSubmit(null);
      return;
    }

    const numericValue = Number(input);
    if (!Number.isNaN(numericValue) && numericValue >= 1 && numericValue <= options.length) {
      onSubmit(options[numericValue - 1]!.value);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="cyan">{message}</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, index) => {
          const active = index === selectedIndex;
          return (
            <Text key={option.value} color={active ? "green" : "white"}>
              {active ? ">" : " "} {index + 1}. {option.label}
            </Text>
          );
        })}
      </Box>
      <Text color="gray">Use up/down, number keys or Enter. Esc cancels.</Text>
    </Box>
  );
}

function InputPrompt({
  message,
  onSubmit,
}: {
  message: string;
  onSubmit: (value: string | null) => void;
}) {
  const [value, setValue] = useState("");

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value.trim().length > 0 ? value.trim() : null);
      return;
    }

    if (key.escape) {
      onSubmit(null);
      return;
    }

    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1));
      return;
    }

    if (isPrintableCharacter(input)) {
      setValue((current) => current + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="cyan">{message}</Text>
      <Text>
        <Text color="green">&gt; </Text>
        {value || <Text color="gray">type and press Enter</Text>}
      </Text>
      <Text color="gray">Esc cancels.</Text>
    </Box>
  );
}

function renderPrompt<T>(elementFactory: (resolve: (value: T) => void) => React.ReactElement): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const app = render(
      elementFactory((value) => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
        app.unmount();
      }),
    );
  });
}

export function promptConfirm(message: string, details?: string[]): Promise<boolean> {
  return renderPrompt<boolean>((resolve) => (
    <ConfirmPrompt message={message} details={details} onSubmit={resolve} />
  ));
}

export function promptChoice(
  message: string,
  options: PromptOption[],
): Promise<string | null> {
  return renderPrompt<string | null>((resolve) => (
    <ChoicePrompt message={message} options={options} onSubmit={resolve} />
  ));
}

export function promptText(message: string): Promise<string | null> {
  return renderPrompt<string | null>((resolve) => (
    <InputPrompt message={message} onSubmit={resolve} />
  ));
}
