interface ScrollLockTarget {
  style: {
    overflow: string
  }
}

interface ScrollLockDocumentLike {
  body: ScrollLockTarget
  documentElement: ScrollLockTarget
}

export function lockModalPageScroll(doc: ScrollLockDocumentLike): () => void {
  const previousBodyOverflow = doc.body.style.overflow
  const previousHtmlOverflow = doc.documentElement.style.overflow

  doc.body.style.overflow = 'hidden'
  doc.documentElement.style.overflow = 'hidden'

  return () => {
    doc.body.style.overflow = previousBodyOverflow
    doc.documentElement.style.overflow = previousHtmlOverflow
  }
}
