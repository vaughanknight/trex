/**
 * SettingsGroup — Collapsible accordion section for settings.
 *
 * Beautiful design with icon, label, chevron, smooth height animation.
 * Used to organize settings into logical groups.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface SettingsGroupProps {
  icon: LucideIcon
  label: string
  children: ReactNode
  defaultOpen?: boolean
  forceOpen?: boolean
}

export function SettingsGroup({ icon: Icon, label, children, defaultOpen = false, forceOpen }: SettingsGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0)

  // Force open when search matches
  useEffect(() => {
    if (forceOpen) setIsOpen(true)
  }, [forceOpen])

  // Measure content height for smooth animation
  useEffect(() => {
    if (!contentRef.current) return
    if (isOpen) {
      const h = contentRef.current.scrollHeight
      setHeight(h)
      // After animation, set to auto so content can resize
      const timer = setTimeout(() => setHeight(undefined), 200)
      return () => clearTimeout(timer)
    } else {
      // First set explicit height for transition start
      setHeight(contentRef.current.scrollHeight)
      // Then trigger collapse on next frame
      requestAnimationFrame(() => setHeight(0))
    }
  }, [isOpen])

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <Icon className="size-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-medium">{label}</span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-[height] duration-200 ease-in-out"
        style={{ height: height !== undefined ? `${height}px` : 'auto' }}
      >
        <div className="px-4 pb-4 space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}
