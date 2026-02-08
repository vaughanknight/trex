/**
 * ConfirmSessionsDialog - Confirmation dialog for URL-driven session creation.
 *
 * Shows when URL params request session creation and user settings require
 * confirmation (either "always ask" or session count exceeds threshold).
 *
 * Per Plan 009: URL Routing (T004)
 */

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmSessionsDialogProps {
  open: boolean
  sessionCount: number
  onConfirm: () => void
  onCancel: () => void
  onDisablePrompt: () => void
}

export function ConfirmSessionsDialog({
  open,
  sessionCount,
  onConfirm,
  onCancel,
  onDisablePrompt,
}: ConfirmSessionsDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false)

  const handleConfirm = () => {
    if (dontAskAgain) {
      onDisablePrompt()
    }
    onConfirm()
    setDontAskAgain(false)
  }

  const handleCancel = () => {
    onCancel()
    setDontAskAgain(false)
  }

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Open {sessionCount} session{sessionCount !== 1 ? 's' : ''}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This URL wants to open {sessionCount} terminal session{sessionCount !== 1 ? 's' : ''}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <div className="flex w-full items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                className="rounded border-input"
              />
              Don't ask again
            </label>
            <div className="flex gap-2">
              <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm}>Create</AlertDialogAction>
            </div>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
