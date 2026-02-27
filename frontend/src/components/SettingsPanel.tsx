/**
 * SettingsPanel — Organized settings with accordion groups and search.
 *
 * Groups: Appearance, Terminal, Layout, Integrations, Theme Bundles
 * Search: real-time filtering by keyword
 * Mobile: full-screen overlay with smooth touch scrolling
 */

import { useState } from 'react'
import { X, Palette, TerminalSquare, LayoutGrid, Plug, Sparkles } from 'lucide-react'
import { ThemeSelector } from './ThemeSelector'
import { FontSelector } from './FontSelector'
import { FontSizeSlider } from './FontSizeSlider'
import { IdleThresholdSettings } from './IdleThresholdSettings'
import { LayoutIconSettings } from './LayoutIconSettings'
import { URLSessionSettings } from './URLSessionSettings'
import { TmuxSettings } from './TmuxSettings'
import { RetroSettings } from './RetroSettings'
import { TitleBarSettings } from './TitleBarSettings'
import { OutputIntervalSlider } from './OutputIntervalSlider'
import { LinkDetectionSettings } from './LinkDetectionSettings'
import { SettingsGroup } from './SettingsGroup'
import { SettingsSearch } from './SettingsSearch'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

const GROUP_KEYWORDS: Record<string, string[]> = {
  appearance: ['theme', 'font', 'size', 'color', 'dark', 'light', 'dracula', 'monokai', 'commodore', 'apple', 'street fighter'],
  terminal: ['title', 'bar', 'idle', 'indicator', 'opacity', 'translucent', 'refresh', 'unfocused', 'output', 'interval'],
  layout: ['icon', 'layout', 'pane', 'split', 'url', 'session', 'confirm'],
  integrations: ['link', 'click', 'tmux', 'detection', 'pattern', 'socket', 'plugin', 'poll'],
  bundles: ['retro', 'crt', 'border', 'bundle', 'auto', 'apply'],
}

function matchesSearch(groupKey: string, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return GROUP_KEYWORDS[groupKey]?.some(kw => kw.includes(q)) ?? false
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [search, setSearch] = useState('')

  if (!open) return null

  const showAppearance = matchesSearch('appearance', search)
  const showTerminal = matchesSearch('terminal', search)
  const showLayout = matchesSearch('layout', search)
  const showIntegrations = matchesSearch('integrations', search)
  const showBundles = matchesSearch('bundles', search)
  const hasSearch = search.length > 0

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 bg-black/50 z-[60] md:hidden"
        onClick={onClose}
      />
      <div
        className="bg-sidebar border-r w-full md:w-80 flex-shrink-0 fixed md:relative z-[60] md:z-auto top-0 left-0 bottom-0 md:top-auto md:left-auto md:bottom-auto md:h-svh"
        style={{ display: 'flex', flexDirection: 'column', touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        {/* Header */}
        <div className="shrink-0 border-b bg-sidebar">
          <div className="flex items-center justify-between p-4 pb-2">
            <div>
              <h2 className="font-semibold text-foreground">Settings</h2>
              <p className="text-xs text-muted-foreground">Customize your terminal</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-sm opacity-70 hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-none"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="px-4 pb-3">
            <SettingsSearch value={search} onChange={setSearch} />
          </div>
        </div>

        {/* Grouped settings */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          {showAppearance && (
            <SettingsGroup icon={Palette} label="Appearance" defaultOpen={!hasSearch} forceOpen={hasSearch}>
              <ThemeSelector />
              <FontSelector />
              <FontSizeSlider />
            </SettingsGroup>
          )}

          {showTerminal && (
            <SettingsGroup icon={TerminalSquare} label="Terminal" forceOpen={hasSearch}>
              <TitleBarSettings />
              <IdleThresholdSettings />
              <OutputIntervalSlider />
            </SettingsGroup>
          )}

          {showLayout && (
            <SettingsGroup icon={LayoutGrid} label="Layout" forceOpen={hasSearch}>
              <LayoutIconSettings />
              <URLSessionSettings />
            </SettingsGroup>
          )}

          {showIntegrations && (
            <SettingsGroup icon={Plug} label="Integrations" forceOpen={hasSearch}>
              <LinkDetectionSettings />
              <TmuxSettings />
            </SettingsGroup>
          )}

          {showBundles && (
            <SettingsGroup icon={Sparkles} label="Theme Bundles" forceOpen={hasSearch}>
              <RetroSettings />
            </SettingsGroup>
          )}

          {!showAppearance && !showTerminal && !showLayout && !showIntegrations && !showBundles && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No settings match &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
      </div>
    </>
  )
}
