'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Transaction {
  id: number
  time_in: string
  plate_number: string
  make: string | null
  model: string | null
  size_category: string
  service_name: string
  price: number
  payment_method: string
  status: string
  notes: string | null
}

interface EditState {
  status: string
  notes: string
}

const TODAY = new Date().toISOString().split('T')[0]

const LONG_DATE = new Date().toLocaleDateString('en-PH', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

function formatTime(timeStr: string | null) {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

function formatPrice(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

export default function QueuePage() {
  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editState, setEditState] = useState<EditState>({ status: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id, time_in, plate_number, make, model, size_category, service_name, price, payment_method, status, notes'
      )
      .eq('date', TODAY)
      .order('time_in', { ascending: true })

    if (error) {
      console.error('queue fetch:', error.message)
    } else {
      setRows(data ?? [])
    }
    setLoading(false)
  }, [])

  // Initial load + 30-second auto-refresh
  useEffect(() => {
    fetchRows()
    const interval = setInterval(fetchRows, 30_000)
    return () => clearInterval(interval)
  }, [fetchRows])

  // Summary stats
  const totalCars = rows.length
  const totalRevenue = rows.reduce((sum, r) => sum + r.price, 0)
  const onHandTotal = rows
    .filter((r) => r.status === 'On Hand')
    .reduce((sum, r) => sum + r.price, 0)
  const depositedTotal = rows
    .filter((r) => r.status === 'Deposited')
    .reduce((sum, r) => sum + r.price, 0)

  function startEdit(row: Transaction) {
    setEditingId(row.id)
    setEditState({ status: row.status, notes: row.notes ?? '' })
    setSaveError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setSaveError('')
  }

  async function saveEdit(id: number) {
    setSaving(true)
    setSaveError('')
    const { error } = await supabase
      .from('transactions')
      .update({ status: editState.status, notes: editState.notes })
      .eq('id', id)
    setSaving(false)

    if (error) {
      setSaveError(error.message)
      return
    }

    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: editState.status, notes: editState.notes } : r
      )
    )
    setEditingId(null)
  }

  const inputCls =
    'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200'

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-6xl">

        {/* Header row */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Today's Queue</h1>
            <p className="text-sm text-gray-500">{LONG_DATE}</p>
          </div>
          <Link
            href="/checkin"
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
          >
            + New Check-In
          </Link>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Cars Today" value={String(totalCars)} />
          <SummaryCard label="Total Revenue" value={formatPrice(totalRevenue)} highlight />
          <SummaryCard label="On Hand" value={formatPrice(onHandTotal)} />
          <SummaryCard label="Deposited" value={formatPrice(depositedTotal)} />
        </div>

        {/* Table */}
        {loading ? (
          <p className="py-16 text-center text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white py-20 text-center shadow-sm">
            <p className="text-gray-400">No cars checked in yet today.</p>
            <Link
              href="/checkin"
              className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Add the first one
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3">Time In</th>
                  <th className="px-4 py-3">Plate</th>
                  <th className="px-4 py-3">Make & Model</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => {
                  const isEditing = editingId === row.id
                  return (
                    <tr
                      key={row.id}
                      className={isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-700">
                        {formatTime(row.time_in)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold tracking-wide text-gray-900">
                        {row.plate_number}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {[row.make, row.model].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {row.size_category}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.service_name}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                        {formatPrice(row.price)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {row.payment_method}
                      </td>

                      {/* Status — editable */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editState.status}
                            onChange={(e) =>
                              setEditState((s) => ({ ...s, status: e.target.value }))
                            }
                            className={inputCls}
                          >
                            <option value="On Hand">On Hand</option>
                            <option value="Deposited">Deposited</option>
                          </select>
                        ) : (
                          <StatusBadge status={row.status} />
                        )}
                      </td>

                      {/* Notes — editable */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editState.notes}
                            onChange={(e) =>
                              setEditState((s) => ({ ...s, notes: e.target.value }))
                            }
                            placeholder="Notes…"
                            className={`${inputCls} w-40`}
                          />
                        ) : (
                          <span className="text-gray-500">{row.notes || '—'}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveEdit(row.id)}
                              disabled={saving}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(row)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-300 hover:text-blue-600"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Inline save error */}
            {saveError && (
              <p className="border-t border-gray-100 px-4 py-3 text-sm text-red-600">
                {saveError}
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-gray-400">
          Auto-refreshes every 30 seconds
        </p>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${
          highlight ? 'text-blue-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const isDeposited = status === 'Deposited'
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isDeposited
          ? 'bg-green-100 text-green-700'
          : 'bg-amber-100 text-amber-700'
      }`}
    >
      {status}
    </span>
  )
}
