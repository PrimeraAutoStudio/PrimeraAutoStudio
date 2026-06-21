'use client'

import { useState, useEffect, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [hintLoading, setHintLoading] = useState(false)
  const [hintError, setHintError] = useState('')

  async function fetchHint() {
    if (!username.trim()) { setHintError('Enter your username first.'); return }
    setHintLoading(true); setHint(null); setHintError('')
    try {
      const res = await fetch('/api/auth/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (!res.ok || !data.hint) { setHintError('No hint set for this account.'); return }
      setHint(data.hint)
    } catch { setHintError('Could not fetch hint.') }
    finally { setHintLoading(false) }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Login failed'); return }
      const from = searchParams.get('from')
      const dest = (from && from !== '/login') ? from : data.redirectTo
      window.location.href = dest
    } catch { setError('Network error. Please try again.') }
    finally { setLoading(false) }
  }

  const inputStyle = { backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Username */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#888' }}>
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => { setUsername(e.target.value); setHint(null); setHintError('') }}
          autoComplete="username"
          required
          className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
          style={inputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#B8922A' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a2a' }}
          placeholder="your.username"
        />
      </div>

      {/* Password with show/hide */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#888' }}>
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-xl px-4 py-3 pr-11 text-sm text-white outline-none transition-all"
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#B8922A' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a2a' }}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: '#555' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#B8922A' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>

        {/* Hint row */}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={fetchHint}
            disabled={hintLoading}
            className="self-start text-[11px] transition-colors disabled:opacity-50"
            style={{ color: '#555' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#B8922A' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
          >
            {hintLoading ? 'Fetching hint…' : 'Need a hint?'}
          </button>
          {hint && (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'rgba(184,146,42,0.1)', color: '#EDD98A' }}>
              {hint}
            </p>
          )}
          {hintError && (
            <p className="text-[11px]" style={{ color: '#666' }}>{hintError}</p>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-xl px-4 py-3 text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-1 w-full rounded-xl py-3 text-sm font-bold text-black transition-all active:scale-95 disabled:opacity-50"
        style={{ backgroundColor: loading ? '#8a6d1e' : '#B8922A' }}
        onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
        onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}

function RoleSelect({ onSelectAdmin }: { onSelectAdmin: () => void }) {
  const [requirePassword, setRequirePassword] = useState(false)
  const [showEmpPassword, setShowEmpPassword] = useState(false)
  const [empPassword, setEmpPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [empLoading, setEmpLoading] = useState(false)
  const [empError, setEmpError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    fetch('/api/auth/employee-login').then(r => r.json()).then(d => setRequirePassword(d.requirePassword ?? false)).catch(() => {})
  }, [])

  async function doEmployeeLogin(password?: string) {
    setEmpLoading(true); setEmpError('')
    try {
      const res = await fetch('/api/auth/employee-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password ?? '' }),
      })
      const data = await res.json()
      if (!res.ok) { setEmpError(data.error ?? 'Login failed'); return }
      const from = searchParams.get('from')
      window.location.href = (from && from !== '/login') ? from : data.redirectTo
    } catch { setEmpError('Network error. Please try again.') }
    finally { setEmpLoading(false) }
  }

  function handleEmployeeClick() {
    if (requirePassword) { setShowEmpPassword(true); setEmpError('') }
    else doEmployeeLogin()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          onClick={handleEmployeeClick}
          disabled={empLoading}
          className="group flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all active:scale-95 disabled:opacity-60"
          style={{ borderColor: showEmpPassword ? '#B8922A' : '#2a2a2a', backgroundColor: '#1a1a1a' }}
          onMouseEnter={(e) => { if (!empLoading) (e.currentTarget as HTMLButtonElement).style.borderColor = '#B8922A' }}
          onMouseLeave={(e) => { if (!showEmpPassword) (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a' }}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: '#222' }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#B8922A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div>
            <p className="font-bold text-white">{empLoading ? 'Signing in…' : 'Employee'}</p>
            <p className="text-xs" style={{ color: '#666' }}>{requirePassword ? 'Password required' : 'Tap to sign in — check-in and queue access'}</p>
          </div>
        </button>

        {showEmpPassword && (
          <div className="mt-2 rounded-xl p-3" style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}>
            <div className="relative mb-2">
              <input
                type={showPw ? 'text' : 'password'}
                value={empPassword}
                onChange={(e) => setEmpPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doEmployeeLogin(empPassword)}
                placeholder="Employee password"
                autoFocus
                className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder:text-gray-600 focus:outline-none"
                style={{ backgroundColor: '#111', border: '1px solid #333' }}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showPw
                  ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                }
              </button>
            </div>
            <button
              onClick={() => doEmployeeLogin(empPassword)}
              disabled={empLoading || !empPassword}
              className="w-full rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#B8922A' }}>
              {empLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        )}
        {empError && <p className="mt-1.5 text-xs" style={{ color: '#f87171' }}>{empError}</p>}
      </div>

      <button
        onClick={onSelectAdmin}
        className="group flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition-all active:scale-95"
        style={{ borderColor: '#2a2a2a', backgroundColor: '#1a1a1a' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#B8922A' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a' }}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: '#222' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#B8922A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div>
          <p className="font-bold text-white">Admin</p>
          <p className="text-xs" style={{ color: '#666' }}>Full access — dashboard, reports, settings</p>
        </div>
      </button>
    </div>
  )
}

function LoginInner() {
  const [selectedRole, setSelectedRole] = useState<'employee' | 'admin' | null>(null)

  return (
    <div className="w-full max-w-sm rounded-2xl p-8" style={{ backgroundColor: '#111', border: '1px solid #222' }}>
      {!selectedRole ? (
        <>
          <h1 className="mb-1 text-xl font-bold text-white">Welcome</h1>
          <p className="mb-6 text-sm" style={{ color: '#666' }}>How are you signing in?</p>
          <RoleSelect onSelectAdmin={() => setSelectedRole('admin')} />
        </>
      ) : (
        <>
          <div className="mb-5 flex items-center gap-3">
            <button
              onClick={() => setSelectedRole(null)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors"
              style={{ backgroundColor: '#1a1a1a', color: '#888' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#B8922A' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#888' }}
            >
              ←
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Admin Sign In</h1>
              <p className="text-xs" style={{ color: '#666' }}>Enter your credentials</p>
            </div>
          </div>
          <LoginForm />
        </>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="mb-8 flex flex-col items-center gap-3">
        <Image src="/Full_White Grad_No BG.svg" alt="Primera Auto Studio" width={160} height={70} priority className="h-auto w-[160px]" />
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#EDD98A' }}>Primera Auto Studio</p>
      </div>
      <Suspense fallback={null}>
        <LoginInner />
      </Suspense>
      <p className="mt-8 text-[10px] uppercase tracking-widest" style={{ color: '#333' }}>Auto Studio POS · Private Access</p>
    </div>
  )
}
