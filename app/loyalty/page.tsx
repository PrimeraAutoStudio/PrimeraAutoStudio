'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoyaltyCard {
  id: number
  plate_number: string
  wash_count: number
  last_redeemed: string | null
  created_at: string
}

const LOYALTY_THRESHOLD = 10

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function WashProgress({ count }: { count: number }) {
  const pips = Array.from({ length: LOYALTY_THRESHOLD })
  return (
    <div className="flex gap-1">
      {pips.map((_, i) => (
        <div key={i}
          className="h-2.5 flex-1 rounded-full transition-colors"
          style={{ backgroundColor: i < count ? '#B8922A' : '#e5e7eb' }}
        />
      ))}
    </div>
  )
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({ card }: { card: LoyaltyCard }) {
  const due = card.wash_count >= LOYALTY_THRESHOLD
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm"
      style={{ borderColor: due ? '#B8922A' : '#f3f4f6' }}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-lg font-bold tracking-wide text-gray-900">{card.plate_number}</p>
          <p className="text-xs text-gray-400">Member since {fmtDate(card.created_at.split('T')[0])}</p>
        </div>
        {due ? (
          <span className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ backgroundColor: 'rgba(184,146,42,0.12)', color: '#B8922A' }}>
            Due for Reward
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
            Active
          </span>
        )}
      </div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-gray-500">Wash progress</span>
        <span className="font-bold" style={{ color: '#B8922A' }}>
          {card.wash_count} / {LOYALTY_THRESHOLD}
        </span>
      </div>
      <WashProgress count={card.wash_count} />
      {card.last_redeemed && (
        <p className="mt-2 text-xs text-gray-400">Last redeemed: {fmtDate(card.last_redeemed)}</p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const [cards, setCards]       = useState<LoyaltyCard[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [searchResult, setSearchResult] = useState<LoyaltyCard | null | 'not_found' | 'idle'>('idle')
  const [searching, setSearching] = useState(false)

  // New member form
  const [showNewForm, setShowNewForm]     = useState(false)
  const [newPlate, setNewPlate]           = useState('')
  const [newEnrolling, setNewEnrolling]   = useState(false)
  const [newError, setNewError]           = useState('')

  // Redeem confirmation
  const [redeemTarget, setRedeemTarget]   = useState<LoyaltyCard | null>(null)
  const [redeeming, setRedeeming]         = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('loyalty_cards')
      .select('id, plate_number, wash_count, last_redeemed, created_at')
      .order('wash_count', { ascending: false })
    setCards(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Plate search ──────────────────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const plate = search.trim().toUpperCase()
    if (!plate) return
    setSearching(true)
    const { data } = await supabase
      .from('loyalty_cards')
      .select('id, plate_number, wash_count, last_redeemed, created_at')
      .eq('plate_number', plate)
      .maybeSingle()
    setSearchResult(data ?? 'not_found')
    setSearching(false)
  }

  // ── Redeem ────────────────────────────────────────────────────────────────

  async function handleRedeem(card: LoyaltyCard) {
    setRedeeming(true)
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('loyalty_cards').update({
      wash_count: 0,
      last_redeemed: today,
    }).eq('id', card.id)
    setRedeemTarget(null)
    setRedeeming(false)
    // If the redeemed card was in search result, refresh it
    if (searchResult !== 'idle' && searchResult !== 'not_found' &&
      (searchResult as LoyaltyCard).id === card.id) {
      const { data } = await supabase.from('loyalty_cards')
        .select('id, plate_number, wash_count, last_redeemed, created_at')
        .eq('id', card.id).single()
      if (data) setSearchResult(data)
    }
    load()
  }

  // ── Enroll new member ──────────────────────────────────────────────────────

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault()
    const plate = newPlate.trim().toUpperCase()
    if (!plate) return
    setNewError('')
    setNewEnrolling(true)
    const { error } = await supabase.from('loyalty_cards').insert({
      plate_number: plate,
      wash_count: 0,
    })
    setNewEnrolling(false)
    if (error) { setNewError(error.message); return }
    setNewPlate(''); setShowNewForm(false); load()
  }

  // ── Filtered table ────────────────────────────────────────────────────────

  const tableCards = cards  // all members, sorted by wash_count desc from query

  const dueCards   = cards.filter((c) => c.wash_count >= LOYALTY_THRESHOLD)
  const totalCards = cards.length

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Primera Circle</h1>
            <p className="text-sm text-gray-400">Loyalty reward program · {totalCards} members · {dueCards.length} due for reward</p>
          </div>
          <button onClick={() => { setShowNewForm((v) => !v); setNewError('') }}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
            style={{ backgroundColor: '#B8922A' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}>
            {showNewForm ? 'Cancel' : '+ New Member'}
          </button>
        </div>

        {/* New member form */}
        {showNewForm && (
          <form onSubmit={handleEnroll}
            className="mb-6 flex items-end gap-3 rounded-2xl border border-[#B8922A]/30 bg-amber-50/40 p-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">Plate Number</label>
              <input type="text" value={newPlate}
                onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                placeholder="e.g. ABC 1234"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm uppercase focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20"
                required />
              {newError && <p className="mt-1 text-xs text-red-500">{newError}</p>}
            </div>
            <button type="submit" disabled={newEnrolling}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: '#B8922A' }}>
              {newEnrolling ? 'Enrolling…' : 'Enroll'}
            </button>
          </form>
        )}

        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-6 flex gap-3">
          <input type="text" value={search}
            onChange={(e) => { setSearch(e.target.value.toUpperCase()); if (!e.target.value) setSearchResult('idle') }}
            placeholder="Search plate number…"
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm uppercase focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20" />
          <button type="submit" disabled={searching}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: '#B8922A' }}>
            {searching ? '…' : 'Search'}
          </button>
        </form>

        {/* Search result */}
        {searchResult !== 'idle' && (
          <div className="mb-8">
            {searchResult === 'not_found' ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-400">
                No loyalty card found for <strong className="text-gray-600">{search}</strong>.
              </div>
            ) : (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Search Result</p>
                <MemberCard card={searchResult as LoyaltyCard} />
                {(searchResult as LoyaltyCard).wash_count >= LOYALTY_THRESHOLD && (
                  <button onClick={() => setRedeemTarget(searchResult as LoyaltyCard)}
                    className="mt-3 w-full rounded-xl py-3 text-sm font-semibold text-white"
                    style={{ backgroundColor: '#B8922A' }}>
                    Mark as Redeemed
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Members table */}
        {loading ? (
          <p className="py-16 text-center text-gray-400">Loading…</p>
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400">
            No members yet. Add the first one above.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-3">Plate</th>
                  <th className="px-5 py-3">Progress</th>
                  <th className="px-5 py-3">Washes</th>
                  <th className="px-5 py-3">Last Redeemed</th>
                  <th className="px-5 py-3">Member Since</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tableCards.map((card) => {
                  const due = card.wash_count >= LOYALTY_THRESHOLD
                  return (
                    <tr key={card.id}
                      className="transition-colors"
                      style={{ backgroundColor: due ? 'rgba(184,146,42,0.05)' : undefined }}>
                      <td className="px-5 py-3 font-bold tracking-wide text-gray-900">
                        {card.plate_number}
                      </td>
                      <td className="px-5 py-3 min-w-[120px]">
                        <WashProgress count={card.wash_count} />
                      </td>
                      <td className="px-5 py-3 font-semibold"
                        style={{ color: due ? '#B8922A' : '#374151' }}>
                        {card.wash_count} / {LOYALTY_THRESHOLD}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(card.last_redeemed)}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(card.created_at.split('T')[0])}</td>
                      <td className="px-5 py-3">
                        {due ? (
                          <span className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                            style={{ backgroundColor: 'rgba(184,146,42,0.12)', color: '#B8922A' }}>
                            Due for Reward
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {due && (
                          <button onClick={() => setRedeemTarget(card)}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                            style={{ backgroundColor: '#B8922A' }}>
                            Redeem
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Redeem confirmation modal */}
        {redeemTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="mb-2 text-base font-bold text-gray-900">Mark as Redeemed</h3>
              <p className="mb-2 text-sm text-gray-500">
                Confirm free wash redemption for <strong>{redeemTarget.plate_number}</strong>?
              </p>
              <p className="mb-5 text-xs text-gray-400">
                Wash count will reset to 0 and today's date will be recorded as the last redeemed date.
              </p>
              <div className="flex gap-3">
                <button onClick={() => handleRedeem(redeemTarget)} disabled={redeeming}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: '#B8922A' }}>
                  {redeeming ? 'Saving…' : 'Confirm Redemption'}
                </button>
                <button onClick={() => setRedeemTarget(null)}
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
