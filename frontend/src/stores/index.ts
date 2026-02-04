/**
 * Store exports for the application.
 *
 * Three isolated stores per plan architecture:
 * - useUIStore: UI state (partial persist)
 * - useSettingsStore: User settings (full persist)
 * - useSessionStore: Session state (no persist)
 */

export { useUIStore, selectActiveSessionId, selectSidebarCollapsed, selectSidebarPinned, selectSettingsPanelOpen } from './ui'
export type { UIStore, UIState, UIActions } from './ui'

export { useSettingsStore, selectTheme, selectFontSize, selectFontFamily, selectAutoOpenTerminal, BUNDLED_FONTS, FALLBACK_FONTS } from './settings'
export type { SettingsStore, SettingsState, SettingsActions, TerminalTheme } from './settings'

export { useSessionStore, selectSession, selectSessionList, selectSessionCount, selectActiveSessionCount, selectSessionIds, selectHasSession } from './sessions'
export type { SessionsStore, SessionsState, SessionsActions, Session, SessionStatus } from './sessions'
