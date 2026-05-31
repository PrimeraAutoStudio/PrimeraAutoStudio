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
  date?: string
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

interface ServiceRow       { name: string }
interface ServicePriceRow  { service_name: string; size_category: string; price: number }
interface SizeRow          { size_category: string; base_price: number }
interface PaymentMethodRow { name: string }

interface EditState {
  selectedServices: string[]
  servicePriceOverrides: Record<string, string>  // keyed by service name
  payment_method:   string
  status:           string
  notes:            string
}

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

const isOthers = (name: string) => name.trim().toLowerCase() === 'others'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const [range, setRange] = useState<DateRange>(rangeForPreset('today'))
  const [rows, setRows]   = useState<Transaction[]>([])
  const [loading, setLoading]     = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editState, setEditState] = useState<EditState>({
    selectedServices: [], servicePriceOverrides: {}, payment_method: '', status: '', notes: '',
  })
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [exporting, setExporting]     = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting]       = useState(false)

  // ── Dropdown data for edit form ────────────────────────────────────────────

  const [services, setServices]           = useState<ServiceRow[]>([])
  const [servicePrices, setServicePrices] = useState<ServicePriceRow[]>([])
  const [sizes, setSizes]                 = useState<SizeRow[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('services').select('name').eq('is_active', true),
      supabase.from('service_prices').select('service_name, size_category, price'),
      supabase.from('price_list').select('size_category, base_price').eq('is_active', true).order('sort_order'),
      supabase.from('payment_methods').select('name').eq('is_active', true).order('sort_order'),
    ]).then(([sv, sp, pl, pm]) => {
      if (sv.data) setServices(sv.data)
      if (sp.data) setServicePrices(sp.data)
      if (pl.data) setSizes(pl.data)
      if (pm.data) setPaymentMethods(pm.data)
    })
  }, [])

  // ── Fetch transactions ─────────────────────────────────────────────────────

  const fetchRows = useCallback(async () => {
    if (!range.from || !range.to) return
    const { data, error } = await supabase
      .from('transactions')
      .select('id, date, time_in, plate_number, make, model, size_category, service_name, price, payment_method, status, notes')
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
    if (range.preset === 'today') {
      const interval = setInterval(fetchRows, 30_000)
      return () => clearInterval(interval)
    }
  }, [fetchRows, range.preset])

  // ── Summary stats ──────────────────────────────────────────────────────────

  const totalCars      = rows.length
  const totalRevenue   = rows.reduce((s, r) => s + r.price, 0)
  const onHandTotal    = rows.filter((r) => r.status === 'On Hand').reduce((s, r) => s + r.price, 0)
  const depositedTotal = rows.filter((r) => r.status === 'Deposited').reduce((s, r) => s + r.price, 0)

  // ── Price helpers ─────────────────────────────────────────────────────────

  function priceForService(serviceName: string, sizeCategory: string): number {
    if (isOthers(serviceName)) return 0
    const match = servicePrices.find(
      (sp) => sp.size_category === sizeCategory && sp.service_name === serviceName
    )
    if (match) return match.price
    const base = sizes.find((s) => s.size_category === sizeCategory)
    return base ? base.base_price : 0
  }

  // Computed totals for the currently-open edit row
  const editRow     = rows.find((r) => r.id === editingId)
  const sizeForEdit = editRow?.size_category ?? ''

  // Resolve the price for a service: use the per-row override if set, else look up from tables
  function resolvedPrice(svcName: string): number {
    const ov = editState.servicePriceOverrides[svcName]
    if (ov !== undefined && ov !== '') return parseFloat(ov) || 0
    return priceForService(svcName, sizeForEdit)
  }

  const effectivePrice = editState.selectedServices.reduce(
    (sum, svc) => sum + resolvedPrice(svc), 0
  )

  // ── Inline edit ────────────────────────────────────────────────────────────

  function startEdit(row: Transaction) {
    const seeded = row.service_name
      ? row.service_name.split(',').map((s) => s.trim()).filter(Boolean)
      : []

    // Seed per-service overrides: if there's only one service, put the full saved
    // price on it so staff immediately see what was charged. For multiple services
    // leave the overrides blank so the lookup values show as the default.
    const overrides: Record<string, string> = {}
    if (seeded.length === 1) {
      overrides[seeded[0]] = String(row.price)
    }

    setEditingId(row.id)
    setEditState({
      selectedServices:      seeded,
      servicePriceOverrides: overrides,
      payment_method:        row.payment_method,
      status:                row.status,
      notes:                 row.notes ?? '',
    })
    setSaveError('')
  }

  function cancelEdit() { setEditingId(null); setSaveError('') }

  async function deleteRow(id: number) {
    setDeleting(true)
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    setDeleting(false)
    if (error) { console.error('delete error:', error.message); return }
    setRows((prev) => prev.filter((r) => r.id !== id))
    setConfirmDeleteId(null)
    if (editingId === id) setEditingId(null)
  }

  function toggleEditService(name: string) {
    setEditState((prev) => {
      const next = prev.selectedServices.includes(name)
        ? prev.selectedServices.filter((s) => s !== name)
        : [...prev.selectedServices, name]
      return { ...prev, selectedServices: next, manualPrice: '' }
    })
  }

  async function saveEdit(id: number) {
    setSaving(true); setSaveError('')
    const serviceLabel = editState.selectedServices.join(', ')
    const { error } = await supabase
      .from('transactions')
      .update({
        service_name:   serviceLabel,
        price:          effectivePrice,
        payment_method: editState.payment_method,
        status:         editState.status,
        notes:          editState.notes,
      })
      .eq('id', id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setRows((prev) => prev.map((r) =>
      r.id === id
        ? { ...r, service_name: serviceLabel, price: effectivePrice,
            payment_method: editState.payment_method,
            status: editState.status, notes: editState.notes }
        : r
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
      r.date ?? '', r.time_in ?? '', r.plate_number,
      r.make ?? '', r.model ?? '', r.size_category,
      r.service_name, r.price, r.payment_method, r.status, r.notes ?? '',
    ])
    if (format === 'csv') {
      downloadCsv([HEADERS, ...dataRows], `${filename}.csv`)
    } else if (format === 'xlsx') {
      await downloadXlsx([{ name: 'Queue', rows: [HEADERS, ...dataRows] }], `${filename}.xlsx`)
    } else {
      await downloadPdf('Queue Report', rangeLabel, [{
        title: `Transactions — ${rangeLabel}`, head: HEADERS, rows: dataRows,
        summary: [
          { label: 'Total Cars',    value: String(totalCars) },
          { label: 'Total Revenue', value: formatPrice(totalRevenue) },
          { label: 'On Hand',       value: formatPrice(onHandTotal) },
          { label: 'Deposited',     value: formatPrice(depositedTotal) },
        ],
      }], `${filename}.pdf`)
    }
    setExporting(false)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const rangeLabel  = formatRangeLabel(range)
  const isSingleDay = range.from === range.to
  const carLabel    = isSingleDay ? 'Cars' : 'Total Cars'

  const inputCls =
    'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 ' +
    'focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'

  const fullInputCls =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 ' +
    'focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Queue — <span style={{ color: '#B8922A' }}>{rangeLabel}</span>
          </h1>
          <div className="flex items-center gap-2">
            <ExportMenu onExport={handleExport} loading={exporting} />
            <Link href="/checkin"
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-95"
              style={{ backgroundColor: '#B8922A' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#D4AB4E' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#B8922A' }}>
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
          <SummaryCard label={carLabel}      value={String(totalCars)} />
          <SummaryCard label="Total Revenue" value={formatPrice(totalRevenue)} highlight />
          <SummaryCard label="On Hand"       value={formatPrice(onHandTotal)} />
          <SummaryCard label="Deposited"     value={formatPrice(depositedTotal)} />
        </div>

        {/* Table */}
        {loading ? (
          <p className="py-16 text-center text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white py-20 text-center shadow-sm">
            <p className="text-gray-400">No transactions found for this period.</p>
            <Link href="/checkin"
              className="mt-4 inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white transition"
              style={{ backgroundColor: '#B8922A' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#D4AB4E' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#B8922A' }}>
              Add the first one
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-white shadow-sm">
            {/* ── Edit panel (shown above the table when editing) ── */}
            {editingId !== null && editRow && (
              <div className="border-b border-amber-200 bg-amber-50 px-6 py-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-bold text-amber-800">
                    Editing — {editRow.plate_number}
                    {editRow.make || editRow.model
                      ? ` · ${[editRow.make, editRow.model].filter(Boolean).join(' ')}`
                      : ''}
                    {' '}· {editRow.size_category}
                  </p>
                  <button onClick={cancelEdit}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700">
                    ✕ Cancel
                  </button>
                </div>

                {/* Services */}
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Services</p>
                  <div className="flex flex-wrap gap-2">
                    {services.map((svc) => {
                      const selected  = editState.selectedServices.includes(svc.name)
                      const unitPrice = priceForService(svc.name, sizeForEdit)
                      return (
                        <button key={svc.name} type="button"
                          onClick={() => toggleEditService(svc.name)}
                          className="flex flex-col items-start rounded-xl border px-3 py-2 text-left text-xs transition-all"
                          style={{
                            borderColor:     selected ? '#B8922A' : '#e5e7eb',
                            backgroundColor: selected ? 'rgba(184,146,42,0.08)' : '#fff',
                            color:           selected ? '#B8922A' : '#374151',
                          }}>
                          <span className="font-semibold">{svc.name}</span>
                          {!isOthers(svc.name) && unitPrice > 0 && (
                            <span style={{ color: selected ? '#B8922A' : '#9ca3af' }}>
                              {formatPrice(unitPrice)}
                            </span>
                          )}
                          {isOthers(svc.name) && (
                            <span className="italic" style={{ color: selected ? '#B8922A' : '#9ca3af' }}>
                              manual price
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Price breakdown + override */}
                {editState.selectedServices.length > 0 && (
                  <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div className="mb-2 space-y-1">
                      {editState.selectedServices.map((svc) => (
                        <div key={svc} className="flex justify-between text-xs text-gray-600">
                          <span>{svc}</span>
                          {isOthers(svc)
                            ? <span className="italic text-gray-400">manual</span>
                            : <span>{formatPrice(priceForService(svc, sizeForEdit))}</span>}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-2 text-xs font-bold">
                      <span className="text-gray-700">Auto Total</span>
                      <span style={{ color: '#B8922A' }}>{formatPrice(autoTotal)}</span>
                    </div>
                    <div className="mt-2">
                      <label className="mb-1 block text-xs font-medium text-gray-500">
                        Price Override — leave blank to use auto total
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₱</span>
                        <input type="number" min="0" step="0.01"
                          value={editState.manualPrice}
                          onChange={(e) => setEditState((s) => ({ ...s, manualPrice: e.target.value }))}
                          placeholder={String(autoTotal)}
                          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-6 pr-2 text-sm text-gray-900 focus:border-[#B8922A] focus:outline-none" />
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        Charging: <strong style={{ color: '#B8922A' }}>{formatPrice(effectivePrice)}</strong>
                      </p>
                    </div>
                  </div>
                )}

                {/* Payment, Status, Notes */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Payment Method</label>
                    <select value={editState.payment_method}
                      onChange={(e) => setEditState((s) => ({ ...s, payment_method: e.target.value }))}
                      className={fullInputCls}>
                      {paymentMethods.map((pm) => (
                        <option key={pm.name} value={pm.name}>{pm.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
                    <select value={editState.status}
                      onChange={(e) => setEditState((s) => ({ ...s, status: e.target.value }))}
                      className={fullInputCls}>
                      <option value="On Hand">On Hand</option>
                      <option value="Deposited">Deposited</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
                    <input type="text" value={editState.notes}
                      onChange={(e) => setEditState((s) => ({ ...s, notes: e.target.value }))}
                      placeholder="Optional notes…" className={fullInputCls} />
                  </div>
                </div>

                {/* Save / error */}
                {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
                <div className="mt-4 flex gap-2">
                  <button onClick={() => saveEdit(editingId)} disabled={saving || editState.selectedServices.length === 0}
                    className="rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    style={{ backgroundColor: '#B8922A' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}>
                    {saving ? 'Saving…' : `Save — ${formatPrice(effectivePrice)}`}
                  </button>
                  <button onClick={cancelEdit} disabled={saving}
                    className="rounded-xl border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-60">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Transactions table ── */}
            <div className="overflow-x-auto">
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
                      <tr key={row.id}
                        className={isEditing ? 'bg-amber-50/60' : 'hover:bg-gray-50'}>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                          {!isSingleDay && row.date
                            ? new Date(row.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
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
                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-500">{row.notes || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {isEditing ? (
                            <span className="text-xs font-semibold" style={{ color: '#B8922A' }}>Editing…</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => startEdit(row)}
                                className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors"
                                style={{ borderColor: '#B8922A', color: '#B8922A' }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(184,146,42,0.08)' }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}>
                                Edit
                              </button>
                              <button onClick={() => setConfirmDeleteId(row.id)}
                                className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:border-red-400 hover:text-red-600 hover:bg-red-50">
                                Del
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {range.preset === 'today' && (
          <p className="mt-4 text-center text-xs text-gray-400">Auto-refreshes every 30 seconds</p>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-base font-bold text-gray-900">Delete Transaction</h3>
            <p className="mb-5 text-sm text-gray-500">
              Are you sure you want to delete this transaction? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => deleteRow(confirmDeleteId)} disabled={deleting}
                className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDeleteId(null)} disabled={deleting}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
