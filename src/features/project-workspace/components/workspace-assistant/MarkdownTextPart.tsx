'use client'

import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TextMessagePartProps } from '@assistant-ui/react'
import type { Components } from 'react-markdown'

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="mb-1 last:mb-0">{children}</li>
  ),
  code: ({ children, className }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code className="rounded bg-[var(--glass-bg-surface)] px-1.5 py-0.5 text-xs font-mono text-[var(--glass-text-primary)]">
          {children}
        </code>
      )
    }
    return (
      <code className={className}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-xl bg-[var(--glass-bg-surface)] p-3 text-xs font-mono text-[var(--glass-text-primary)] last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-[var(--glass-accent-from)] pl-3 text-[var(--glass-text-secondary)] last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--glass-accent-from)] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 text-base font-semibold text-[var(--glass-text-primary)]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 text-sm font-semibold text-[var(--glass-text-primary)]">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 text-sm font-medium text-[var(--glass-text-primary)]">{children}</h3>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--glass-text-primary)]">{children}</strong>
  ),
  hr: () => (
    <hr className="my-3 border-[var(--glass-stroke-base)]" />
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-2 py-1 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--glass-stroke-base)] px-2 py-1">{children}</td>
  ),
}

function MarkdownTextPartImpl({ text }: TextMessagePartProps) {
  if (!text) return null

  return (
    <div className="workspace-assistant-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export const MarkdownTextPart = memo(MarkdownTextPartImpl)
