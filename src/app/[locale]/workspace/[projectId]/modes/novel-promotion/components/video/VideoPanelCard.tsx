'use client'

import React from 'react'
import VideoPanelCardShell, { type VideoPanelCardShellProps } from './panel-card/VideoPanelCardShell'

export type { VideoPanelCardShellProps as VideoPanelCardProps } from './panel-card/VideoPanelCardShell'

function VideoPanelCard(props: VideoPanelCardShellProps) {
  return <VideoPanelCardShell {...props} />
}

export default React.memo(VideoPanelCard)
