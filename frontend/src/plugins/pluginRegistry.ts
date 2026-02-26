/**
 * pluginRegistry.ts — Frontend plugin registration and discovery.
 *
 * Plugins register via registerPlugin() with their ID, process match patterns,
 * rendering components, and store. The platform queries enabled plugins to
 * render widgets in title bar, sidebar, and detail panel.
 *
 * @see /docs/plans/025-visualisation-plugins/visualisation-plugins-plan.md
 */

import type { ComponentType } from 'react'
import type { StoreApi, UseBoundStore } from 'zustand'

/** Props passed to all plugin widget components */
export interface PluginWidgetProps {
  sessionId: string
  paneId: string
}

/** Plugin data store shape (per-plugin Zustand store) */
export interface PluginDataState {
  /** Plugin data keyed by sessionId */
  data: Map<string, unknown>
  /** Update data for a session */
  updateData: (sessionId: string, data: unknown) => void
  /** Clear data for a session */
  clearData: (sessionId: string) => void
  /** Clear all data */
  clearAll: () => void
}

/** A registered visualisation plugin */
export interface VisualisationPlugin {
  /** Unique plugin identifier (e.g., 'copilot-todos') */
  id: string
  /** Display name (e.g., 'Copilot Todo Tracker') */
  name: string
  /** Process names that trigger this plugin (matched against process tree) */
  processMatch: string[]
  /** Compact widget for the pane title bar */
  TitleBarWidget: ComponentType<PluginWidgetProps>
  /** Compact widget for the sidebar item */
  SidebarWidget: ComponentType<PluginWidgetProps>
  /** Full detail view for the expandable panel */
  PanelWidget: ComponentType<PluginWidgetProps>
  /** Plugin's isolated Zustand store */
  useStore: UseBoundStore<StoreApi<PluginDataState>>
}

// Plugin registry — simple Map, plugins register on import
const registry = new Map<string, VisualisationPlugin>()

/** Register a plugin. Overwrites if same ID already registered. */
export function registerPlugin(plugin: VisualisationPlugin): void {
  registry.set(plugin.id, plugin)
}

/** Get a plugin by ID. */
export function getPlugin(id: string): VisualisationPlugin | undefined {
  return registry.get(id)
}

/** Get all registered plugins. */
export function getAllPlugins(): VisualisationPlugin[] {
  return Array.from(registry.values())
}

/** Get all registered plugin IDs. */
export function getPluginIds(): string[] {
  return Array.from(registry.keys())
}
