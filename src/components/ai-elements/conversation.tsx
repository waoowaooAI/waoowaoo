"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";

const BOTTOM_THRESHOLD_PX = 24;

interface ConversationContextValue {
  viewport: HTMLDivElement | null;
  setViewport: (node: HTMLDivElement | null) => void;
  isAtBottom: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

function useConversationContext(): ConversationContextValue {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("Conversation components must be used within Conversation");
  }
  return context;
}

function joinClassName(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

function computeIsAtBottom(element: HTMLDivElement): boolean {
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
  return remaining <= BOTTOM_THRESHOLD_PX;
}

export type ConversationProps = HTMLAttributes<HTMLDivElement>;

export const Conversation = ({
  className,
  children,
  ...props
}: ConversationProps) => {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const syncAtBottom = useCallback(() => {
    if (!viewport) return;
    setIsAtBottom(computeIsAtBottom(viewport));
  }, [viewport]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth"): void => {
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    });
  }, [viewport]);

  useEffect(() => {
    if (!viewport) return;
    const onScroll = (): void => syncAtBottom();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    syncAtBottom();
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [syncAtBottom, viewport]);

  const contextValue = useMemo<ConversationContextValue>(() => ({
    viewport,
    setViewport,
    isAtBottom,
    scrollToBottom,
  }), [isAtBottom, scrollToBottom, viewport]);

  return (
    <ConversationContext.Provider value={contextValue}>
      <div className={joinClassName("relative flex h-full min-h-0 flex-col", className)} {...props}>
        {children}
      </div>
    </ConversationContext.Provider>
  );
};

export type ConversationContentProps = HTMLAttributes<HTMLDivElement>;

export const ConversationContent = ({
  className,
  children,
  ...props
}: ConversationContentProps) => {
  const { viewport, setViewport, isAtBottom, scrollToBottom } = useConversationContext();
  const scrollFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!viewport || !isAtBottom) return;
    if (scrollFrameIdRef.current !== null) cancelAnimationFrame(scrollFrameIdRef.current);
    scrollFrameIdRef.current = requestAnimationFrame(() => {
      scrollFrameIdRef.current = null;
      scrollToBottom("auto");
    });
    return () => {
      if (scrollFrameIdRef.current !== null) {
        cancelAnimationFrame(scrollFrameIdRef.current);
        scrollFrameIdRef.current = null;
      }
    };
  }, [children, isAtBottom, scrollToBottom, viewport]);

  return (
    <div
      ref={setViewport}
      className={joinClassName("h-full min-h-0 overflow-y-auto overscroll-contain", className)}
      {...props}
    >
      {children}
    </div>
  );
};

export type ConversationScrollButtonProps = HTMLAttributes<HTMLButtonElement>;

export const ConversationScrollButton = ({
  className,
  onClick,
  children,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useConversationContext();
  if (isAtBottom) return null;
  return (
    <button
      type="button"
      className={joinClassName(
        "absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-1 text-xs text-[var(--glass-text-secondary)] shadow-sm backdrop-blur",
        "hover:bg-[var(--glass-bg-soft)]",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        scrollToBottom("smooth");
      }}
      {...props}
    >
      {children ?? "跳到底部"}
    </button>
  );
};
