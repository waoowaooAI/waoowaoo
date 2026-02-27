import type { ReactNode } from 'react'
import type { VoiceCreationRuntime } from './hooks/useVoiceCreation'
import { AppIcon } from '@/components/ui/icons'

interface VoiceCreationFormProps {
  runtime: VoiceCreationRuntime
  children: ReactNode
}

export default function VoiceCreationForm({ runtime, children }: VoiceCreationFormProps) {
  const {
    mode,
    voiceName,
    tHub,
    tvCreate,
    setVoiceName,
    handleClose,
    handleModeChange,
  } = runtime

  return (
    <div
      className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 glass-surface-modal w-full max-w-xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)]">
        <div className="flex items-center gap-2">
          <AppIcon name="mic" className="w-5 h-5 text-[var(--glass-tone-info-fg)]" />
          <h2 className="font-semibold text-[var(--glass-text-primary)]">{tHub('addVoice')}</h2>
        </div>
        <button onClick={handleClose} className="glass-btn-base glass-btn-soft p-1 text-[var(--glass-text-tertiary)]">
          <AppIcon name="close" className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-[var(--glass-stroke-base)]">
        {(() => {
          const tabs = [
            { id: 'design' as const, label: tvCreate('aiDesignMode') },
            { id: 'upload' as const, label: tvCreate('uploadMode') },
          ]
          const activeIdx = tabs.findIndex(t => t.id === mode)
          return (
            <div className="flex-1 px-5 py-2.5">
              <div className="rounded-lg p-0.5" style={{ background: 'rgba(0,0,0,0.04)' }}>
                <div className="relative grid grid-cols-2 gap-1">
                  <div
                    className="absolute bottom-0.5 top-0.5 rounded-md bg-white transition-transform duration-200"
                    style={{
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06)',
                      width: '50%',
                      transform: `translateX(${Math.max(0, activeIdx) * 100}%)`,
                    }}
                  />
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => handleModeChange(tab.id)}
                      className={`relative z-[1] px-4 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${mode === tab.id
                        ? 'text-[var(--glass-text-primary)] font-medium'
                        : 'text-[var(--glass-text-tertiary)] hover:text-[var(--glass-text-secondary)]'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <div>
          <label className="glass-field-label mb-1 block">{tHub('voiceName')}</label>
          <input
            type="text"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder={tHub('voiceNamePlaceholder')}
            className="glass-input-base w-full px-3 py-2 text-sm"
          />
        </div>

        {children}
      </div>
    </div>
  )
}
