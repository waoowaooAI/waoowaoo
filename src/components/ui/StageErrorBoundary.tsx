'use client'

import { Component, type ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'

interface StageErrorBoundaryProps {
  stageName?: string
  children: ReactNode
  onRetry?: () => void
}

interface StageErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class StageErrorBoundary extends Component<StageErrorBoundaryProps, StageErrorBoundaryState> {
  constructor(props: StageErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): StageErrorBoundaryState {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center" role="alert">
          <div className="glass-surface rounded-2xl p-8 max-w-md w-full space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-[var(--glass-tone-danger-bg)] flex items-center justify-center">
              <AppIcon name="alertTriangle" className="w-6 h-6 text-[var(--glass-tone-danger-fg)]" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
              {this.props.stageName
                ? `Đã xảy ra lỗi tại ${this.props.stageName}`
                : 'Đã xảy ra lỗi'}
            </h3>
            <p className="text-sm text-[var(--glass-text-tertiary)]">
              {this.state.error?.message || 'Một lỗi không mong muốn đã xảy ra.'}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="glass-btn-base glass-btn-primary rounded-lg px-4 py-2 text-sm"
            >
              Thử lại
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
