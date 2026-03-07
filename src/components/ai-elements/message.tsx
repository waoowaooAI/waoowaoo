"use client";

import type { UIMessage } from "ai";
import type { HTMLAttributes } from "react";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

function joinClassName(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={joinClassName(
      "group flex w-full flex-col gap-2",
      from === "user" ? "is-user items-end" : "is-assistant items-start",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={joinClassName(
      "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageResponseProps = HTMLAttributes<HTMLDivElement>;

export const MessageResponse = ({
  className,
  ...props
}: MessageResponseProps) => (
  <div
    className={joinClassName("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
    {...props}
  />
);
