import { iconRegistry, type AppIconName } from './registry'
import type { LucideProps } from 'lucide-react'

export interface AppIconProps extends Omit<LucideProps, 'ref'> {
  name: AppIconName
}

export function AppIcon({ name, ...props }: AppIconProps) {
  const IconComponent = iconRegistry[name]
  if (!IconComponent) {
    throw new Error(`Unknown AppIcon name: ${String(name)}`)
  }
  return <IconComponent {...props} />
}
