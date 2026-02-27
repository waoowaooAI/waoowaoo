'use client'

import type { ProviderCardProps, ProviderCardTranslator } from './types'
import type { UseProviderCardStateResult } from './hooks/useProviderCardState'
import { AppIcon } from '@/components/ui/icons'

interface ProviderBaseFieldsProps {
  provider: ProviderCardProps['provider']
  t: ProviderCardTranslator
  state: UseProviderCardStateResult
}

export function ProviderBaseFields({ provider, t, state }: ProviderBaseFieldsProps) {
  const baseUrlPlaceholder = (() => {
    switch (state.providerKey) {
      case 'gemini-compatible':
        return 'https://your-api-domain.com'
      case 'openai-compatible':
        return 'https://api.openai.com/v1'
      default:
        return 'http://localhost:8000'
    }
  })()

  return (
    <>
      <div className="px-3.5 pt-2.5">
        <div className="glass-surface-soft flex items-center gap-2.5 rounded-xl px-3 py-2">
          <span className="w-[64px] shrink-0 whitespace-nowrap text-[12px] font-semibold text-[var(--glass-text-primary)]">
            {t('apiKeyLabel')}
          </span>
          {state.isEditing ? (
            <div className="flex flex-1 items-center gap-2">
              <input
                type="text"
                value={state.tempKey}
                onChange={(event) => state.setTempKey(event.target.value)}
                placeholder={t('enterApiKey')}
                className="glass-input-base flex-1 px-3 py-1.5 text-[12px]"
                autoFocus
              />
              <button
                onClick={state.handleSaveKey}
                className="glass-icon-btn-sm"
                title={t('save')}
              >
                <AppIcon name="check" className="h-4 w-4" />
              </button>
              <button
                onClick={state.handleCancelEdit}
                className="glass-icon-btn-sm"
                title={t('cancel')}
              >
                <AppIcon name="close" className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {provider.hasApiKey ? (
                <>
                  <span className="min-w-0 max-w-[220px] flex-1 truncate rounded-lg bg-[var(--glass-bg-surface)] px-3 py-1.5 font-mono text-[12px] text-[var(--glass-text-secondary)]">
                    {state.showKey ? provider.apiKey : state.maskedKey}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => state.setShowKey(!state.showKey)}
                      className="glass-icon-btn-sm"
                      title={state.showKey ? t('hide') : t('show')}
                    >
                      {state.showKey ? (
                        <AppIcon name="eye" className="h-4 w-4" />
                      ) : (
                        <AppIcon name="eyeOff" className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={state.startEditKey}
                      className="glass-icon-btn-sm"
                      title={t('configure')}
                    >
                      <AppIcon name="edit" className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={state.startEditKey}
                  className="glass-btn-base glass-btn-tone-info h-7 px-2.5 text-[12px] font-semibold"
                >
                  <AppIcon name="plus" className="h-3.5 w-3.5" />
                  <span>{t('connect')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {state.showBaseUrlEdit && (
        <div className="px-3.5 pb-2.5 pt-2">
          <div className="glass-surface-soft flex items-center gap-2.5 rounded-xl px-3 py-2">
            <div className="flex w-full items-center gap-2">
              <span className="w-[64px] shrink-0 whitespace-nowrap text-[12px] font-semibold text-[var(--glass-text-tertiary)]">
                {t('baseUrl')}
              </span>
              {state.isEditingUrl ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={state.tempUrl}
                    onChange={(event) => state.setTempUrl(event.target.value)}
                    placeholder={baseUrlPlaceholder}
                    className="glass-input-base flex-1 px-3 py-1.5 text-[12px] font-mono"
                    autoFocus
                  />
                  <button
                    onClick={state.handleSaveUrl}
                    className="glass-icon-btn-sm"
                    title={t('save')}
                  >
                    <AppIcon name="check" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={state.handleCancelUrlEdit}
                    className="glass-icon-btn-sm"
                    title={t('cancel')}
                  >
                    <AppIcon name="close" className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {provider.baseUrl ? (
                    <span className="min-w-0 flex-1 truncate rounded-lg bg-[var(--glass-bg-surface)] px-3 py-1.5 font-mono text-[12px] text-[var(--glass-text-secondary)]">
                      {provider.baseUrl}
                    </span>
                  ) : (
                    <button
                      onClick={state.startEditUrl}
                      className="glass-btn-base glass-btn-tone-info h-7 px-2.5 text-[12px] font-semibold"
                    >
                      <AppIcon name="plus" className="h-3.5 w-3.5" />
                      <span>{t('configureBaseUrl')}</span>
                    </button>
                  )}
                  {provider.baseUrl && (
                    <button
                      onClick={state.startEditUrl}
                      className="glass-icon-btn-sm shrink-0"
                      title={t('configure')}
                    >
                      <AppIcon name="edit" className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
