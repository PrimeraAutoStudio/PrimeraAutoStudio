'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ─── Brand tokens ─────────────────────────────────────────────────────────────
// #0a0a0a  Obsidian (sidebar bg)
// #B8922A  Burnished Gold (active)
// #D4AB4E  Gold Light (hover)
// #EDD98A  Champagne (accent / sub-text)
// #888     Muted (inactive)

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconQueue() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="h-5 w-5 shrink-0">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}

function IconCheckIn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function IconPnL() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="h-5 w-5 shrink-0">
      <path d="M3 17l4-5 4 3 4-6 4 4" />
      <path d="M3 20h18" />
    </svg>
  )
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="h-5 w-5 shrink-0">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconPromos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="h-5 w-5 shrink-0">
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="h-5 w-5 shrink-0">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className="h-5 w-5 shrink-0">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const MAIN_NAV = [
  { href: '/dashboard', label: 'Dashboard',     Icon: IconDashboard },
  { href: '/checkin',   label: 'Check In',      Icon: IconCheckIn   },
  { href: '/queue',     label: 'Queue',         Icon: IconQueue     },
  { href: '/pnl',       label: 'P&L',           Icon: IconPnL       },
  { href: '/loyalty',   label: 'Primera Circle', Icon: IconLoyalty  },
  { href: '/promos',    label: 'Promos',         Icon: IconPromos   },
] as const

const BOTTOM_NAV = [
  { href: '/settings',  label: 'Settings',      Icon: IconSettings  },
] as const

// ─── NavLink ──────────────────────────────────────────────────────────────────

function NavLink({
  href, label, Icon, pathname,
}: {
  href: string; label: string; Icon: () => React.ReactElement; pathname: string
}) {
  const active = pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150"
      style={{
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
      {active && (
        <span
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: '#B8922A' }}
        />
      )}
      <Icon />
      {label}
    </Link>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen w-[220px] flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      {/* Logo + brand name */}
      <div className="flex flex-col items-center px-6 pb-6 pt-8">
        <Image
          src="/Full_White Grad_No BG.svg"
          alt="Primera Auto Studio"
          width={140}
          height={60}
          priority
          className="h-auto w-[140px]"
        />
        <p
          className="mt-3 text-center text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: '#EDD98A' }}
        >
          Primera Auto Studio
        </p>
      </div>

      {/* Divider */}
      <div className="mx-6 mb-4 h-px" style={{ backgroundColor: '#1f1f1f' }} />

      {/* Main nav links */}
      <nav className="flex flex-col gap-1 px-3">
        {MAIN_NAV.map(({ href, label, Icon }) => (
          <NavLink key={href} href={href} label={label} Icon={Icon} pathname={pathname} />
        ))}
      </nav>

      {/* Spacer pushes settings to the bottom */}
      <div className="flex-1" />

      {/* Divider + Settings */}
      <div className="mx-3 mb-2 h-px" style={{ backgroundColor: '#1f1f1f' }} />
      <nav className="flex flex-col gap-1 px-3 pb-4">
        {BOTTOM_NAV.map(({ href, label, Icon }) => (
          <NavLink key={href} href={href} label={label} Icon={Icon} pathname={pathname} />
        ))}
      </nav>

      {/* Bottom tag */}
      <p
        className="pb-4 text-center text-[10px] uppercase tracking-widest"
        style={{ color: '#333' }}
      >
        Auto Studio POS
      </p>
    </aside>
  )
}

// ─── Top bar (content area header) ───────────────────────────────────────────

function TopBar() {
  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end border-b border-gray-100 bg-white/90 px-6 backdrop-blur-sm">
      <span className="text-xs font-medium text-gray-400">{today}</span>
    </header>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* Offset content by sidebar width */}
      <div className="ml-[220px] flex min-h-screen flex-1 flex-col bg-gray-50">
        <TopBar />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
