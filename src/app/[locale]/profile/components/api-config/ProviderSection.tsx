'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Provider, PRESET_PROVIDERS } from './types'
import { AppIcon } from '@/components/ui/icons'

interface ProviderSectionProps {
    title: string
    icon: React.ReactNode
    type: 'audio' | 'lipsync'
    providers: Provider[]
    onUpdateApiKey: (providerId: string, apiKey: string) => void
    onUpdateInfo?: (providerId: string, name: string, baseUrl?: string) => void
    onDelete?: (providerId: string) => void
    onAdd?: (provider: Omit<Provider, 'hasApiKey'>) => void
    showBaseUrl?: boolean
    showAddButton?: boolean
}

export function ProviderSection({
    title,
    icon,
    providers,
    onUpdateApiKey,
    onUpdateInfo,
    onDelete,
    onAdd,
    showBaseUrl = false,
    showAddButton = false
}: ProviderSectionProps) {
    const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({})
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editData, setEditData] = useState({ name: '', baseUrl: '' })
    const [showAddForm, setShowAddForm] = useState(false)
    const [newProvider, setNewProvider] = useState({ name: '', baseUrl: '', apiKey: '' })
    const t = useTranslations('providerSection')
    const tc = useTranslations('common')

    const isPreset = (id: string) => PRESET_PROVIDERS.some(p => p.id === id)

    const handleSaveEdit = (provider: Provider) => {
        onUpdateInfo?.(provider.id, editData.name, editData.baseUrl || undefined)
        setEditingId(null)
    }

    const handleAdd = () => {
        if (!newProvider.name) {
            alert(t('fillRequired'))
            return
        }
        onAdd?.({
            id: `custom-${Date.now()}`,
            name: newProvider.name,
            baseUrl: newProvider.baseUrl || undefined,
            apiKey: newProvider.apiKey
        })
        setNewProvider({ name: '', baseUrl: '', apiKey: '' })
        setShowAddForm(false)
    }

    return (
        <div className="glass-surface mb-5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--glass-text-primary)]">
                    {icon}
                    {title}
                </h3>
                {showAddButton && (
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="glass-btn-base glass-btn-tone-info cursor-pointer px-2 py-1 text-xs font-medium"
                    >
                        {t('addProvider')}
                    </button>
                )}
            </div>

            {/* 添加表单 */}
            {showAddForm && (
                <div className="glass-surface-soft mb-4 flex items-center gap-2 rounded-xl p-3">
                    <input
                        type="text"
                        value={newProvider.name}
                        onChange={e => setNewProvider({ ...newProvider, name: e.target.value })}
                        placeholder={t('name')}
                        className="glass-input-base w-24 px-2 py-1.5 text-sm"
                    />
                    {showBaseUrl && (
                        <input
                            type="text"
                            value={newProvider.baseUrl}
                            onChange={e => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                            placeholder="Base URL"
                            className="glass-input-base flex-1 px-2 py-1.5 text-sm font-mono"
                        />
                    )}
                    <input
                        type="password"
                        value={newProvider.apiKey}
                        onChange={e => setNewProvider({ ...newProvider, apiKey: e.target.value })}
                        placeholder="API Key"
                        className="glass-input-base w-40 px-2 py-1.5 text-sm"
                    />
                    <button onClick={handleAdd} className="glass-btn-base glass-btn-primary rounded-lg px-3 py-1.5 text-sm">
                        {t('add')}
                    </button>
                    <button onClick={() => setShowAddForm(false)} className="glass-btn-base glass-btn-secondary px-2 py-1.5 text-sm">
                        {tc('cancel')}
                    </button>
                </div>
            )}

            {/* 提供商列表 */}
            <div className="space-y-2">
                {providers.map(provider => {
                    const isEditing = editingId === provider.id
                    const isVisible = showApiKeys[provider.id]

                    if (isEditing && showBaseUrl) {
                        return (
                            <div key={provider.id} className="glass-surface-soft flex items-center gap-3 rounded-xl px-3 py-2.5">
                                <input
                                    type="text"
                                    value={editData.name}
                                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                                    className="glass-input-base w-28 px-2 py-1.5 text-sm"
                                />
                                <input
                                    type="text"
                                    value={editData.baseUrl}
                                    onChange={e => setEditData({ ...editData, baseUrl: e.target.value })}
                                    className="glass-input-base flex-1 px-2 py-1.5 text-sm font-mono"
                                />
                                <button onClick={() => handleSaveEdit(provider)} className="glass-btn-base glass-btn-primary rounded-lg px-3 py-1 text-sm">{t('save')}</button>
                                <button onClick={() => setEditingId(null)} className="glass-btn-base glass-btn-secondary rounded-lg px-2 py-1 text-sm">{tc('cancel')}</button>
                            </div>
                        )
                    }

                    return (
                        <div key={provider.id} className="glass-surface-soft group flex items-center gap-3 rounded-xl px-3 py-2.5">
                            {showBaseUrl && (
                                <button
                                    onClick={() => {
                                        setEditingId(provider.id)
                                        setEditData({ name: provider.name, baseUrl: provider.baseUrl || '' })
                                    }}
                                    className="glass-btn-base glass-btn-tone-info cursor-pointer rounded-lg p-1.5"
                                >
                                    <AppIcon name="edit" className="w-4 h-4" />
                                </button>
                            )}
                            <span className="w-28 truncate text-sm font-medium text-[var(--glass-text-primary)]">{provider.name}</span>
                            {showBaseUrl && (
                                <span className="w-64 truncate font-mono text-xs text-[var(--glass-text-tertiary)]">{provider.baseUrl}</span>
                            )}
                            <div className="relative flex-1">
                                <input
                                    type={isVisible ? 'text' : 'password'}
                                    value={provider.apiKey || ''}
                                    onChange={e => onUpdateApiKey(provider.id, e.target.value)}
                                    placeholder="API Key"
                                    className="glass-input-base w-full px-3 py-1.5 pr-9 text-sm"
                                />
                                <button
                                    onClick={() => setShowApiKeys({ ...showApiKeys, [provider.id]: !isVisible })}
                                    className="glass-btn-base glass-btn-soft absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1"
                                >
                                    {isVisible ? (
                                        <AppIcon name="eye" className="w-4 h-4" />
                                    ) : (
                                        <AppIcon name="eyeOff" className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                            {provider.apiKey && (
                                <span className="glass-chip glass-chip-success px-1.5 py-0.5">
                                    <AppIcon name="checkDot" className="h-3 w-3" />
                                </span>
                            )}
                            {!isPreset(provider.id) && onDelete && (
                                <button
                                    onClick={() => onDelete(provider.id)}
                                    className="glass-btn-base glass-btn-tone-danger cursor-pointer rounded-lg p-1.5"
                                >
                                    <AppIcon name="trash" className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
