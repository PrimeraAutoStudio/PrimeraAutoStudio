'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

      if (!res.ok) {
        setError(data.error ?? 'Login failed')
        return
      }

      const from = searchParams.get('from')
      if (from && from !== '/login') {
        router.replace(from)
      } else {
        router.replace(data.redirectTo)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#888' }}>
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#B8922A' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a2a' }}
          placeholder="your.username"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#888' }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#B8922A' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a2a' }}
          placeholder="••••••••"
        />
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
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#D4AB4E' }}
        onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#B8922A' }}
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <Image
          src="/Full_White Grad_No BG.svg"
          alt="Primera Auto Studio"
          width={160}
          height={70}
          priority
          className="h-auto w-[160px]"
        />
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#EDD98A' }}>
          Primera Auto Studio
        </p>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ backgroundColor: '#111', border: '1px solid #222' }}
      >
        <h1 className="mb-1 text-xl font-bold text-white">Sign in</h1>
        <p className="mb-6 text-sm" style={{ color: '#666' }}>Enter your credentials to continue</p>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>

      <p className="mt-8 text-[10px] uppercase tracking-widest" style={{ color: '#333' }}>
        Auto Studio POS · Private Access
      </p>
    </div>
  )
}
