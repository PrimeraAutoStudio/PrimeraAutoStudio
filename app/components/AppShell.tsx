'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconQueue() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}

function IconCheckIn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function IconPnL() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M3 17l4-5 4 3 4-6 4 4" />
      <path d="M3 20h18" />
    </svg>
  )
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconPromos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M20 12v10H4V12" />
      <path d="M22 7H2v5h20V7z" />
      <path d="M12 22V7" />
      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
    </svg>
  )
}

function IconLoyalty() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const MAIN_NAV = [
  { href: '/dashboard', label: 'Dashboard',      Icon: IconDashboard },
  { href: '/checkin',   label: 'Check In',       Icon: IconCheckIn   },
  { href: '/queue',     label: 'Queue',          Icon: IconQueue     },
  { href: '/pnl',       label: 'P&L Tracker',    Icon: IconPnL       },
  { href: '/loyalty',   label: 'Primera Circle', Icon: IconLoyalty   },
  { href: '/promos',    label: 'Promos',         Icon: IconPromos    },
] as const

const BOTTOM_NAV = [
  { href: '/settings', label: 'Settings', Icon: IconSettings },
] as const

const ALL_NAV = [...MAIN_NAV, ...BOTTOM_NAV]

// Bottom tab bar — 5 most used pages
const BOTTOM_TABS = [
  { href: '/dashboard', label: 'Home',     Icon: IconDashboard },
  { href: '/checkin',   label: 'Check In', Icon: IconCheckIn   },
  { href: '/queue',     label: 'Queue',    Icon: IconQueue     },
  { href: '/pnl',       label: 'P&L',      Icon: IconPnL       },
  { href: '/settings',  label: 'Settings', Icon: IconSettings  },
]

// ─── Desktop NavLink ──────────────────────────────────────────────────────────

function NavLink({
  href, label, Icon, collapsed,
}: {
  href: string; label: string; Icon: () => React.ReactElement; collapsed: boolean
}) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className="group relative flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150"
      style={{
        gap: collapsed ? '0' : '12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        color: active ? '#B8922A' : '#888',
        backgroundColor: active ? 'rgba(184,146,42,0.08)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#D4AB4E'
          e.currentTarget.style.backgroundColor = 'rgba(212,171,78,0.06)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = '#888'
          e.currentTarget.style.backgroundColor = 'transparent'
        }
      }}
    >
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full" style={{ backgroundColor: '#B8922A' }} />
      )}
      <Icon />
      {!collapsed && label}
    </Link>
  )
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const w = collapsed ? 64 : 220
  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen flex-col transition-all duration-200"
      style={{ backgroundColor: '#0a0a0a', width: `${w}px` }}
    >
      {/* Logo */}
      <div className={`flex flex-col items-center pb-6 pt-8 transition-all duration-200 ${collapsed ? 'px-2' : 'px-6'}`}>
        {collapsed ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(184,146,42,0.15)' }}>
            <span className="text-lg font-bold" style={{ color: '#B8922A' }}>P</span>
          </div>
        ) : (
          <>
            <Image src="/Full_White Grad_No BG.svg" alt="Primera Auto Studio" width={140} height={60} priority className="h-auto w-[140px]" />
            <p className="mt-3 text-center text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#EDD98A' }}>
              Primera Auto Studio
            </p>
          </>
        )}
      </div>

      <div className="mx-3 mb-4 h-px" style={{ backgroundColor: '#1f1f1f' }} />

      <nav className="flex flex-col gap-1 px-2">
        {MAIN_NAV.map(({ href, label, Icon }) => (
          <NavLink key={href} href={href} label={label} Icon={Icon} collapsed={collapsed} />
        ))}
      </nav>

      <div className="flex-1" />

      <div className="mx-3 mb-2 h-px" style={{ backgroundColor: '#1f1f1f' }} />

      <nav className="flex flex-col gap-1 px-2 pb-2">
        {BOTTOM_NAV.map(({ href, label, Icon }) => (
          <NavLink key={href} href={href} label={label} Icon={Icon} collapsed={collapsed} />
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="mx-2 mb-4 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-colors"
        style={{ color: '#555', backgroundColor: 'rgba(255,255,255,0.04)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#B8922A'; e.currentTarget.style.backgroundColor = 'rgba(184,146,42,0.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)' }}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? (
          // Right arrow = expand
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M9 18l6-6-6-6" />
          </svg>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Collapse</span>
          </>
        )}
      </button>

      {!collapsed && (
        <p className="pb-4 text-center text-[10px] uppercase tracking-widest" style={{ color: '#333' }}>
          Auto Studio POS
        </p>
      )}
    </aside>
  )
}

// ─── Mobile Drawer ────────────────────────────────────────────────────────────

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()

  // Auto-close on navigation
  useEffect(() => { onClose() }, [pathname])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 transition-opacity duration-200 sm:hidden ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Slide-in drawer */}
      <div
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col transition-transform duration-200 sm:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ backgroundColor: '#0a0a0a' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4 pt-6">
          <div>
            <Image src="/Full_White Grad_No BG.svg" alt="Primera Auto Studio" width={110} height={48} priority className="h-auto w-[110px]" />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#EDD98A' }}>
              Primera Auto Studio
            </p>
          </div>
          <button onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#888' }}>
            <IconClose />
          </button>
        </div>

        <div className="mx-4 mb-3 h-px" style={{ backgroundColor: '#1f1f1f' }} />

        {/* All nav links */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          {ALL_NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link key={href} href={href}
                className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-colors"
                style={{
                  color: active ? '#B8922A' : '#888',
                  backgroundColor: active ? 'rgba(184,146,42,0.1)' : 'transparent',
                }}>
                <Icon />
                <span>{label}</span>
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#B8922A' }} />}
              </Link>
            )
          })}
        </nav>

        <p className="py-4 text-center text-[10px] uppercase tracking-widest" style={{ color: '#333' }}>
          Auto Studio POS
        </p>
      </div>
    </>
  )
}

// ─── Mobile Top Bar ───────────────────────────────────────────────────────────

function MobileTopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  const pathname = usePathname()
  const currentPage = ALL_NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + '/'))
  const today = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-100 bg-white/95 px-4 backdrop-blur-sm sm:hidden">
      <button onClick={onMenuOpen}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 active:scale-95">
        <IconMenu />
      </button>
      <div className="flex items-center gap-2">
        <div className="h-5 w-0.5 rounded-full" style={{ backgroundColor: '#B8922A' }} />
        <span className="text-sm font-bold text-gray-900">{currentPage?.label ?? 'Primera'}</span>
      </div>
      <span className="text-xs font-medium text-gray-400">{today}</span>
    </header>
  )
}

// ─── Mobile Bottom Tab Bar ────────────────────────────────────────────────────

function BottomTabBar() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-gray-100 bg-white sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {BOTTOM_TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link key={href} href={href}
            className="flex flex-1 flex-col items-center justify-center py-2.5 transition-colors"
            style={{ color: active ? '#B8922A' : '#9ca3af' }}>
            <Icon />
            <span className="mt-0.5 text-[10px] font-semibold leading-none">{label}</span>
            {active && <span className="mt-1 h-1 w-4 rounded-full" style={{ backgroundColor: '#B8922A' }} />}
          </Link>
        )
      })}
    </nav>
  )
}

// ─── Desktop Top Bar ──────────────────────────────────────────────────────────

function DesktopTopBar() {
  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  return (
    <header className="sticky top-0 z-30 hidden h-14 items-center justify-end border-b border-gray-100 bg-white/90 px-6 backdrop-blur-sm sm:flex">
      <span className="text-xs font-medium text-gray-400">{today}</span>
    </header>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sidebarW = collapsed ? 64 : 220

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden sm:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Main content */}
      <div
        className="flex min-h-screen flex-col bg-gray-50 transition-all duration-200"
        // On desktop: push right of sidebar. On mobile: no margin.
        style={{ marginLeft: 0 }}
      >
        {/* Desktop margin spacer */}
        <style>{`@media (min-width: 640px) { .content-area { margin-left: ${sidebarW}px; } }`}</style>
        <div className="content-area flex min-h-screen flex-col">

          {/* Mobile top bar */}
          <MobileTopBar onMenuOpen={() => setDrawerOpen(true)} />

          {/* Desktop top bar */}
          <DesktopTopBar />

          {/* Page content — extra bottom padding on mobile for tab bar */}
          <main className="flex-1 pb-20 sm:pb-0">
            {children}
          </main>

          {/* Mobile bottom tab bar */}
          <BottomTabBar />
        </div>
      </div>
    </>
  )
}