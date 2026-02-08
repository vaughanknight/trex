/**
 * AuthButton - Login/user menu for the sidebar.
 *
 * When not authenticated: Shows "Login with GitHub" button.
 * When authenticated: Shows avatar + username with logout option.
 * When auth disabled: Hidden entirely.
 */
import { LogIn, LogOut } from 'lucide-react'
import {
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { useAuthStore, selectUser, selectAuthEnabled, selectAuthLoading } from '@/stores/auth'

export function AuthButton() {
  const authEnabled = useAuthStore(selectAuthEnabled)
  const user = useAuthStore(selectUser)
  const loading = useAuthStore(selectAuthLoading)
  const logout = useAuthStore(state => state.logout)

  // Don't show anything if auth is disabled or still loading initial check
  if (!authEnabled || loading) {
    return null
  }

  // Not authenticated — show login button
  if (!user) {
    return (
      <SidebarMenuButton
        onClick={() => { window.location.href = '/auth/github' }}
        tooltip="Login with GitHub"
      >
        <LogIn className="size-4" />
        <span>Login with GitHub</span>
      </SidebarMenuButton>
    )
  }

  // Authenticated — show user info + logout
  return (
    <SidebarMenuButton
      onClick={() => logout()}
      tooltip={`Logged in as ${user.username} — click to logout`}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.username}
          className="size-4 rounded-full"
        />
      ) : (
        <LogOut className="size-4" />
      )}
      <span>{user.username}</span>
    </SidebarMenuButton>
  )
}
