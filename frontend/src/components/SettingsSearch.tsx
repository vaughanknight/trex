/**
 * SettingsSearch — Search input for filtering settings groups.
 */

import { Search, X } from 'lucide-react'

interface SettingsSearchProps {
  value: string
  onChange: (value: string) => void
}

export function SettingsSearch({ value, onChange }: SettingsSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search settings..."
        className="w-full h-8 pl-9 pr-8 text-sm bg-muted/50 border border-border/50 rounded-md outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50 transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent"
        >
          <X className="size-3 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}
