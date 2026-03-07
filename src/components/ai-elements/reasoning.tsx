"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface ReasoningContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isStreaming: boolean;
  duration?: number;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext(): ReasoningContextValue {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
}

export type ReasoningProps = HTMLAttributes<HTMLDivElement> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

function joinClassName(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export const Reasoning = ({
  className,
  isStreaming = false,
  open,
  defaultOpen = false,
  onOpenChange,
  duration,
  children,
  ...props
}: ReasoningProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;

  const setIsOpen = useCallback((next: boolean): void => {
    if (open === undefined) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  }, [onOpenChange, open]);

  const value = useMemo<ReasoningContextValue>(() => ({
    isOpen,
    setIsOpen,
    isStreaming,
    duration,
  }), [duration, isOpen, isStreaming, setIsOpen]);

  return (
    <ReasoningContext.Provider value={value}>
      <div className={joinClassName("space-y-2", className)} {...props}>
        {children}
      </div>
    </ReasoningContext.Provider>
  );
};

export type ReasoningTriggerProps = HTMLAttributes<HTMLButtonElement> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number): ReactNode => {
  if (isStreaming || duration === 0) return "Thinking...";
  if (duration === undefined) return "Thought for a few seconds";
  return `Thought for ${duration} seconds`;
};

export const ReasoningTrigger = ({
  className,
  children,
  getThinkingMessage = defaultGetThinkingMessage,
  ...props
}: ReasoningTriggerProps) => {
  const { isOpen, setIsOpen, isStreaming, duration } = useReasoningContext();
  return (
    <button
      type="button"
      className={joinClassName(
        "inline-flex items-center gap-1 text-left text-xs text-[var(--glass-text-secondary)]",
        className,
      )}
      onClick={() => setIsOpen(!isOpen)}
      aria-expanded={isOpen}
      {...props}
    >
      <span aria-hidden>{isOpen ? "▾" : "▸"}</span>
      {children ?? getThinkingMessage(isStreaming, duration)}
    </button>
  );
};

export type ReasoningContentProps = HTMLAttributes<HTMLDivElement> & {
  children: string;
};

export const ReasoningContent = ({
  className,
  children,
  ...props
}: ReasoningContentProps) => {
  const { isOpen } = useReasoningContext();
  if (!isOpen) return null;
  return (
    <div className={joinClassName("whitespace-pre-wrap break-words text-xs leading-relaxed", className)} {...props}>
      {children}
    </div>
  );
};
