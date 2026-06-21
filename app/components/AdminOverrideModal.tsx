'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import { useAuth } from '@/app/context/AuthContext'

interface Props {
  open: boolean
  onClose: () => void
  onGranted: () => void
  actionLabel?: string
}

export default function AdminOverrideModal({ open, onClose, onGranted, actionLabel = 'this action' }: Props) {
  const { setAdminOverride } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPassword('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/admin-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Incorrect password')
        return
      }
      setAdminOverride(true)
      onGranted()
      onClose()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: '#111', border: '1px solid #2a2a2a' }}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(184,146,42,0.15)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#B8922A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Admin Override Required</h2>
            <p className="text-xs" style={{ color: '#666' }}>Enter admin password to perform {actionLabel}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            required
            className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#B8922A' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a2a' }}
          />

          {error && (
            <p className="rounded-xl px-4 py-2.5 text-sm font-medium" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors"
              style={{ backgroundColor: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-black transition-all disabled:opacity-50"
              style={{ backgroundColor: '#B8922A' }}
            >
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
