# shadcn/ui Implementation for Terminal Application

**Research Date**: 2026-02-04
**Query**: shadcn/ui sidebar, settings, layout for terminal app

---

## Executive Summary

shadcn/ui provides excellent components for building a terminal session management UI:
1. **Sidebar Component** - Composable, collapsible, with icon mode for hover-reveal
2. **Tailwind CSS Required** - Must install Tailwind for shadcn/ui to work
3. **Dark Mode Built-in** - Class-based dark mode with CSS variables
4. **Form Components** - React Hook Form + Zod integration for settings

---

## Installation with Vite + React 19

### Step 1: Create Vite Project
```bash
npm create vite@latest trex-ui -- --template react-ts
cd trex-ui
```

### Step 2: Install Tailwind CSS
Replace `src/index.css` with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Step 3: Configure TypeScript Paths
In `tsconfig.json` and `tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

In `vite.config.ts`:
```typescript
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

### Step 4: Initialize shadcn/ui
```bash
npx shadcn@latest init
```

Select:
- Style: Default
- Base color: Neutral (for terminal aesthetic)
- CSS variables: Yes
- Import alias: @/components

---

## Sidebar Component Architecture

### Key Components

| Component | Purpose |
|-----------|---------|
| `SidebarProvider` | Context for sidebar state |
| `Sidebar` | Main container |
| `SidebarHeader` | Logo/branding area |
| `SidebarContent` | Scrollable content area |
| `SidebarFooter` | Settings/user area |
| `SidebarMenu` | Navigation menu container |
| `SidebarMenuItem` | Individual menu item |
| `SidebarMenuButton` | Clickable trigger |
| `SidebarMenuBadge` | Status indicators |
| `SidebarMenuAction` | Hover-revealed actions |
| `SidebarMenuSub` | Nested submenu items |

### Sidebar Variants

| Variant | Behavior | Best For |
|---------|----------|----------|
| `sidebar` | Persistent, pushes content | Standard apps |
| `floating` | Overlays content | Terminal apps |
| `inset` | Content inset layout | Dashboards |

### Collapsible Modes

| Mode | Behavior |
|------|----------|
| `offcanvas` | Drawer on mobile |
| `icon` | Collapse to icons, expand on hover |
| `none` | Always visible |

**Recommended for terminal app**: `icon` mode with `floating` variant

---

## Implementation: Collapsible Session Sidebar

```tsx
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar"

function SessionSidebar({ sessions }) {
  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarMenu>
            {sessions.map((session) => (
              <SidebarMenuItem key={session.id}>
                <SidebarMenuButton
                  isActive={session.isActive}
                  tooltip={session.name}
                >
                  <TerminalIcon />
                  <span>{session.name}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>
                  {session.status === 'running' ? '●' : '○'}
                </SidebarMenuBadge>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
```

---

## Settings Page Components

### Recommended Structure

```tsx
<Tabs defaultValue="appearance">
  <TabsList>
    <TabsTrigger value="appearance">Appearance</TabsTrigger>
    <TabsTrigger value="terminal">Terminal</TabsTrigger>
    <TabsTrigger value="keyboard">Keyboard</TabsTrigger>
  </TabsList>

  <TabsContent value="appearance">
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
      </CardHeader>
      <CardContent>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  </TabsContent>
</Tabs>
```

### Components to Use

| Setting Type | Component |
|--------------|-----------|
| Theme selection | `Select` or `RadioGroup` |
| Font family | `Select` |
| Font size | `Input` (number) or `Slider` |
| Boolean toggles | `Switch` |
| Keybindings | Custom `Input` with key capture |

---

## Dark Mode Setup

### Configure Tailwind
```typescript
// tailwind.config.ts
export default {
  darkMode: "class",
  // ...
}
```

### CSS Variables for Terminal Theme
```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
}

.dark {
  --background: 0 0% 7%;
  --foreground: 0 0% 95%;
  --terminal-bg: 0 0% 12%;
  --terminal-fg: 0 0% 85%;
}
```

### Dark Mode Toggle
```tsx
function ThemeToggle() {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="dark">Dark</SelectItem>
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="system">System</SelectItem>
      </SelectContent>
    </Select>
  )
}
```

---

## Layout Pattern: Sidebar + Main Content

```tsx
function AppLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <SessionSidebar />
        <main className="flex-1 overflow-hidden">
          <div className="h-full flex flex-col">
            <TerminalTabs />
            <div className="flex-1 min-h-0">
              <Terminal />
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
```

### CSS Variables for Layout
```css
:root {
  --sidebar-width: 250px;
  --sidebar-width-mobile: 280px;
  --sidebar-width-icon: 48px;
}
```

---

## Responsive Behavior

```tsx
function ResponsiveSidebar() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar()

  if (isMobile) {
    return (
      <>
        <Button onClick={() => setOpenMobile(true)}>
          <MenuIcon />
        </Button>
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent side="left">
            <SessionSidebar />
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return <SessionSidebar />
}
```

---

## Form Validation with React Hook Form + Zod

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

const settingsSchema = z.object({
  theme: z.enum(["dark", "light", "system"]),
  fontFamily: z.string(),
  fontSize: z.number().min(8).max(24),
})

function SettingsForm() {
  const form = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      theme: "dark",
      fontFamily: "Menlo",
      fontSize: 14,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="fontSize"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Font Size</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
```

---

## Components to Install

```bash
# Core layout
npx shadcn@latest add sidebar
npx shadcn@latest add sheet

# Settings page
npx shadcn@latest add tabs
npx shadcn@latest add card
npx shadcn@latest add select
npx shadcn@latest add input
npx shadcn@latest add switch
npx shadcn@latest add slider
npx shadcn@latest add form

# Utilities
npx shadcn@latest add button
npx shadcn@latest add tooltip
npx shadcn@latest add badge
npx shadcn@latest add collapsible
```

---

## Sources

- shadcn/ui documentation: sidebar, installation/vite
- shadcn/ui blocks: sidebar examples
- Tailwind CSS dark mode documentation
- React Hook Form + Zod integration guide
