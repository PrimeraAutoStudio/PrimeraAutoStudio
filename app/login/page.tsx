'use client'

import { useState, FormEvent, Suspense } from 'react'
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
      if (from && from !== '/login') { router.replace(from) }
      else { router.replace(data.redirectTo) }
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
              💡 {hint}
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

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="mb-8 flex flex-col items-center gap-3">
        <Image src="/Full_White Grad_No BG.svg" alt="Primera Auto Studio" width={160} height={70} priority className="h-auto w-[160px]" />
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#EDD98A' }}>Primera Auto Studio</p>
      </div>
      <div className="w-full max-w-sm rounded-2xl p-8" style={{ backgroundColor: '#111', border: '1px solid #222' }}>
        <h1 className="mb-1 text-xl font-bold text-white">Sign in</h1>
        <p className="mb-6 text-sm" style={{ color: '#666' }}>Enter your credentials to continue</p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="mt-8 text-[10px] uppercase tracking-widest" style={{ color: '#333' }}>Auto Studio POS · Private Access</p>
    </div>
  )
}
