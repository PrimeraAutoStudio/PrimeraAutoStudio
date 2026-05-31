'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DateRangeSelector, {
  DateRange,
  formatRangeLabel,
  rangeForPreset,
} from '@/app/components/DateRangeSelector'
import ExportMenu, { ExportFormat } from '@/app/components/ExportMenu'
import { downloadCsv, downloadXlsx, downloadPdf } from '@/lib/export'

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface EditState { status: string; notes: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t: string | null) {
  if (!t) return '—'
  const [h, m] = t.split(':')
  const hr = parseInt(h, 10)
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

function formatPrice(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const [range, setRange] = useState<DateRange>(rangeForPreset('today'))
  const [rows, setRows]   = useState<Transaction[]>([])
  const [loading, setLoading]   = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editState, setEditState] = useState<EditState>({ status: '', notes: '' })
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [exporting, setExporting]   = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchRows = useCallback(async () => {
    if (!range.from || !range.to) return
    const { data, error } = await supabase
      .from('transactions')
      .select('id, time_in, plate_number, make, model, size_category, service_name, price, payment_method, status, notes')
      .gte('date', range.from)
      .lte('date', range.to)
      .order('date', { ascending: true })
      .order('time_in', { ascending: true })

    if (error) console.error('queue fetch:', error.message)
    else setRows(data ?? [])
    setLoading(false)
  }, [range])

  useEffect(() => {
    setLoading(true)
    fetchRows()
    // Auto-refresh only when showing today
    if (range.preset === 'today') {
      const interval = setInterval(fetchRows, 30_000)
      return () => clearInterval(interval)
    }
  }, [fetchRows, range.preset])

  // ── Summary stats ──────────────────────────────────────────────────────────

  const totalCars     = rows.length
  const totalRevenue  = rows.reduce((s, r) => s + r.price, 0)
  const onHandTotal   = rows.filter((r) => r.status === 'On Hand').reduce((s, r) => s + r.price, 0)
  const depositedTotal = rows.filter((r) => r.status === 'Deposited').reduce((s, r) => s + r.price, 0)

  // ── Inline edit ────────────────────────────────────────────────────────────

  function startEdit(row: Transaction) {
    setEditingId(row.id)
    setEditState({ status: row.status, notes: row.notes ?? '' })
    setSaveError('')
  }

  function cancelEdit() { setEditingId(null); setSaveError('') }

  async function saveEdit(id: number) {
    setSaving(true); setSaveError('')
    const { error } = await supabase
      .from('transactions')
      .update({ status: editState.status, notes: editState.notes })
      .eq('id', id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setRows((prev) => prev.map((r) =>
      r.id === id ? { ...r, status: editState.status, notes: editState.notes } : r
    ))
    setEditingId(null)
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport(format: ExportFormat) {
    setExporting(true)
    const label    = rangeLabel.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase()
    const filename = `primera-queue-${label}`

    const HEADERS  = ['Date', 'Time In', 'Plate', 'Make', 'Model', 'Size', 'Service', 'Price', 'Payment', 'Status', 'Notes']
    const dataRows = rows.map((r) => [
      (r as unknown as { date?: string }).date ?? '',
      r.time_in ?? '',
      r.plate_number,
      r.make ?? '',
      r.model ?? '',
      r.size_category,
      r.service_name,
      r.price,
      r.payment_method,
      r.status,
      r.notes ?? '',
    ])

    if (format === 'csv') {
      downloadCsv([HEADERS, ...dataRows], `${filename}.csv`)
    } else if (format === 'xlsx') {
      await downloadXlsx([{ name: 'Queue', rows: [HEADERS, ...dataRows] }], `${filename}.xlsx`)
    } else {
      await downloadPdf(
        'Queue Report',
        rangeLabel,
        [{
          title:   `Transactions — ${rangeLabel}`,
          head:    HEADERS,
          rows:    dataRows,
          summary: [
            { label: 'Total Cars',    value: String(totalCars) },
            { label: 'Total Revenue', value: formatPrice(totalRevenue) },
            { label: 'On Hand',       value: formatPrice(onHandTotal) },
            { label: 'Deposited',     value: formatPrice(depositedTotal) },
          ],
        }],
        `${filename}.pdf`
      )
    }
    setExporting(false)
  }

  // ── Derived labels ─────────────────────────────────────────────────────────

  const rangeLabel = formatRangeLabel(range)
  const isSingleDay = range.from === range.to
  const carLabel    = isSingleDay ? 'Cars' : 'Total Cars'

  const inputCls =
    'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 ' +
    'focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Queue — <span style={{ color: '#B8922A' }}>{rangeLabel}</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu onExport={handleExport} loading={exporting} />
            <Link
              href="/checkin"
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-95"
              style={{ backgroundColor: '#B8922A' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#D4AB4E' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#B8922A' }}
            >
              + New Check-In
            </Link>
          </div>
        </div>

        {/* Date range selector */}
        <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm">
          <DateRangeSelector value={range} onChange={(r) => { setRange(r); setEditingId(null) }} />
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label={carLabel}       value={String(totalCars)} />
          <SummaryCard label="Total Revenue"  value={formatPrice(totalRevenue)} highlight />
          <SummaryCard label="On Hand"        value={formatPrice(onHandTotal)} />
          <SummaryCard label="Deposited"      value={formatPrice(depositedTotal)} />
        </div>

        {/* Table */}
        {loading ? (
          <p className="py-16 text-center text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white py-20 text-center shadow-sm">
            <p className="text-gray-400">No transactions found for this period.</p>
            <Link
              href="/checkin"
              className="mt-4 inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white transition"
              style={{ backgroundColor: '#B8922A' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#D4AB4E' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#B8922A' }}
            >
              Add the first one
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Time In</th>
                  <th className="px-4 py-3">Plate</th>
                  <th className="px-4 py-3">Make & Model</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => {
                  const isEditing = editingId === row.id
                  return (
                    <tr key={row.id} className={isEditing ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500 text-xs">
                        {/* Only show date column when range spans multiple days */}
                        {!isSingleDay
                          ? new Date((row as unknown as { date?: string }).date + 'T00:00:00')
                              .toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-700">
                        {formatTime(row.time_in)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold tracking-wide text-gray-900">
                        {row.plate_number}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {[row.make, row.model].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.size_category}</td>
                      <td className="px-4 py-3 text-gray-700">{row.service_name}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                        {formatPrice(row.price)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.payment_method}</td>

                      {/* Status */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {isEditing ? (
                          <select value={editState.status}
                            onChange={(e) => setEditState((s) => ({ ...s, status: e.target.value }))}
                            className={inputCls}>
                            <option value="On Hand">On Hand</option>
                            <option value="Deposited">Deposited</option>
                          </select>
                        ) : (
                          <StatusBadge status={row.status} />
                        )}
                      </td>

                      {/* Notes */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input type="text" value={editState.notes}
                            onChange={(e) => setEditState((s) => ({ ...s, notes: e.target.value }))}
                            placeholder="Notes…" className={`${inputCls} w-40`} />
                        ) : (
                          <span className="text-gray-500">{row.notes || '—'}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveEdit(row.id)} disabled={saving}
                              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                              style={{ backgroundColor: '#B8922A' }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}>
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={cancelEdit} disabled={saving}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-60">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(row)}
                            className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                            style={{ borderColor: '#B8922A', color: '#B8922A' }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(184,146,42,0.08)' }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}>
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {saveError && (
              <p className="border-t border-gray-100 px-4 py-3 text-sm text-red-600">{saveError}</p>
            )}
          </div>
        )}

        {range.preset === 'today' && (
          <p className="mt-4 text-center text-xs text-gray-400">Auto-refreshes every 30 seconds</p>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, highlight = false }: {
  label: string; value: string; highlight?: boolean
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${highlight ? 'text-[#B8922A]' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      status === 'Deposited' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
    }`}>
      {status}
    </span>
  )
}
