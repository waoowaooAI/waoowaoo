"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { HTMLAttributes } from "react";
import { createContext, useContext, useMemo, useState } from "react";

export type ToolPart = ToolUIPart | DynamicToolUIPart;

interface ToolContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const ToolContext = createContext<ToolContextValue | null>(null);

function useToolContext(): ToolContextValue {
  const context = useContext(ToolContext);
  if (!context) throw new Error("Tool components must be used within Tool");
  return context;
}

function joinClassName(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export type ToolProps = HTMLAttributes<HTMLDivElement> & {
  defaultOpen?: boolean;
};

export const Tool = ({
  className,
  defaultOpen = false,
  children,
  ...props
}: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const value = useMemo<ToolContextValue>(() => ({ isOpen, setIsOpen }), [isOpen]);
  return (
    <ToolContext.Provider value={value}>
      <div className={joinClassName("rounded-xl border", className)} {...props}>
        {children}
      </div>
    </ToolContext.Provider>
  );
};

export type ToolHeaderProps = HTMLAttributes<HTMLButtonElement> & {
  title?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
    type: DynamicToolUIPart["type"];
    state: DynamicToolUIPart["state"];
    toolName: string;
  }
);

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const { isOpen, setIsOpen } = useToolContext();
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  const headerTitle = title ?? `${derivedName} (${state})`;
  return (
    <button
      type="button"
      className={joinClassName(
        "flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-[var(--glass-text-secondary)]",
        className,
      )}
      onClick={() => setIsOpen(!isOpen)}
      aria-expanded={isOpen}
      {...props}
    >
      <span>{headerTitle}</span>
      <span aria-hidden>{isOpen ? "▾" : "▸"}</span>
    </button>
  );
};

export type ToolContentProps = HTMLAttributes<HTMLDivElement>;

export const ToolContent = ({
  className,
  children,
  ...props
}: ToolContentProps) => {
  const { isOpen } = useToolContext();
  if (!isOpen) return null;
  return (
    <div className={joinClassName("space-y-2 border-t px-3 py-2", className)} {...props}>
      {children}
    </div>
  );
};

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export type ToolInputProps = HTMLAttributes<HTMLDivElement> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={joinClassName("space-y-1", className)} {...props}>
    <div className="mb-1 text-xs text-[var(--glass-text-tertiary)]">Parameters</div>
    <pre className="max-h-56 overflow-x-auto overflow-y-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
      {formatJson(input)}
    </pre>
  </div>
);

export type ToolOutputProps = HTMLAttributes<HTMLDivElement> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) return null;
  return (
    <div className={joinClassName("space-y-1", className)} {...props}>
      <div className="mb-1 text-xs text-[var(--glass-text-tertiary)]">
        {errorText ? "Error" : "Result"}
      </div>
      <div className={errorText ? "text-red-500" : undefined}>
        {errorText && (
          <div className="mb-2 whitespace-pre-wrap break-words text-xs leading-relaxed">
            {errorText}
          </div>
        )}
        <pre className="max-h-56 overflow-x-auto overflow-y-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
          {typeof output === "string" ? output : formatJson(output)}
        </pre>
      </div>
    </div>
  );
};
