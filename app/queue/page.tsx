'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/context/AuthContext'
import AdminOverrideModal from '@/app/components/AdminOverrideModal'
import DateRangeSelector, {
  DateRange,
  formatRangeLabel,
  rangeForPreset,
} from '@/app/components/DateRangeSelector'
import ExportMenu, { ExportFormat } from '@/app/components/ExportMenu'
import { downloadCsv, downloadXlsx, downloadPdf } from '@/lib/export'

interface Transaction {
  id: string
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
  team: string | null
}

interface ServiceRow       { name: string }
interface ServicePriceRow  { service_name: string; size_category: string; price: number }
interface SizeRow          { size_category: string; base_price: number }
interface PaymentMethodRow { name: string }

interface EditState {
  plate_number: string
  size_category: string
  selectedServices: string[]
  manualPrice: string
  payment_method: string
  status: string
  notes: string
  time_in: string
  team: string
  make: string
  model: string
}

const MOTO_SIZES           = ['Motorcycle', 'Big Bike', 'Tricycle']
const MOTO_ALLOWED_SERVICES = ['Basic', 'Wax', 'Others']

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

function mapServiceName(raw: string): string[] {
  const map: Record<string, string[]> = {
    'Basic':                     ['Basic Wash'],
    'Basic + Wax':               ['Basic Wash', 'Wax'],
    'Body Wash + Wax':           ['Body Wash', 'Wax'],
    'Basic + Bac to Zero':       ['Basic Wash', 'Bac-2-Zero'],
    'Basic + Bac to Zero + Wax': ['Basic Wash', 'Bac-2-Zero', 'Wax'],
    'Body Wash':                 ['Body Wash'],
    'Others':                    ['Others'],
    'Wax Only':                  ['Wax'],
  }
  const trimmed = raw.trim()
  return map[trimmed] ?? [trimmed]
}

function parseServiceNames(s: string): string[] {
  if (!s) return []
  return s.split(',').flatMap((x) => mapServiceName(x.trim())).filter(Boolean)
}

function statusColor(status: string) {
  if (status === 'Deposited') return 'bg-green-100 text-green-700'
  if (status === 'Pending')   return 'bg-blue-100 text-blue-700'
  return 'bg-amber-100 text-amber-700'
}

export default function QueuePage() {
  const { user, adminOverride } = useAuth()
  const isEmployee = user?.role === 'employee'
  const canEditDelete = !isEmployee || adminOverride

  // Pending privileged action — run it once admin override is granted
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [overrideOpen, setOverrideOpen] = useState(false)

  function requireAdmin(action: () => void) {
    if (canEditDelete) {
      action()
    } else {
      setPendingAction(() => action)
      setOverrideOpen(true)
    }
  }

  const [range, setRange]         = useState<DateRange>(rangeForPreset('today'))
  const [rows, setRows]           = useState<Transaction[]>([])
  const [loading, setLoading]     = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({
    plate_number: '', size_category: '', selectedServices: [], manualPrice: '', payment_method: '',
    status: '', notes: '', time_in: '', team: '', make: '', model: '',
  })
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({})
  const [queueExpenses, setQueueExpenses] = useState(0)
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState('')
  const [exporting, setExporting]         = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting]           = useState(false)
  const [teams, setTeams]                 = useState<string[]>(['Team A', 'Team B', 'Team C', 'Team D'])

  // ── Bulk selection (admin only) ─────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkTeam, setBulkTeam] = useState('')
  const [bulkPanel, setBulkPanel] = useState<'status' | 'team' | 'delete' | null>(null)
  const [bulkOverrideOpen, setBulkOverrideOpen] = useState(false)
  const [bulkPendingAction, setBulkPendingAction] = useState<(() => void) | null>(null)
  const [bulkProcessing, setBulkProcessing] = useState(false)

  function requireAdminBulk(action: () => void) {
    if (canEditDelete) {
      action()
    } else {
      setBulkPendingAction(() => action)
      setBulkOverrideOpen(true)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) => prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))
  }

  async function applyBulkStatus(status: string) {
    if (!status || selected.size === 0) return
    setBulkProcessing(true)
    const ids = Array.from(selected)
    const { error } = await supabase.from('transactions').update({ status }).in('id', ids)
    setBulkProcessing(false)
    if (error) { console.error('bulk status:', error.message); return }
    setRows((prev) => prev.map((r) => selected.has(r.id) ? { ...r, status } : r))
    setSelected(new Set())
    setBulkPanel(null)
  }

  async function applyBulkTeam(team: string) {
    if (selected.size === 0) return
    setBulkProcessing(true)
    const ids = Array.from(selected)
    const { error } = await supabase.from('transactions').update({ team: team || null }).in('id', ids)
    setBulkProcessing(false)
    if (error) { console.error('bulk team:', error.message); return }
    setRows((prev) => prev.map((r) => selected.has(r.id) ? { ...r, team: team || null } : r))
    setSelected(new Set())
    setBulkPanel(null)
  }

  async function applyBulkDelete() {
    if (selected.size === 0) return
    setBulkProcessing(true)
    const ids = Array.from(selected)
    const { error } = await supabase.from('transactions').delete().in('id', ids)
    setBulkProcessing(false)
    if (error) { console.error('bulk delete:', error.message); return }
    setRows((prev) => prev.filter((r) => !selected.has(r.id)))
    setSelected(new Set())
    setBulkPanel(null)
  }

  const [payNowRow, setPayNowRow]       = useState<Transaction | null>(null)
  const [payNowMethod, setPayNowMethod] = useState('')
  const [payNowStatus, setPayNowStatus] = useState('On Hand')
  const [payNowSaving, setPayNowSaving] = useState(false)
  const [payNowError, setPayNowError]   = useState('')

  const [services, setServices]             = useState<ServiceRow[]>([])
  const [servicePrices, setServicePrices]   = useState<ServicePriceRow[]>([])
  const [sizes, setSizes]                   = useState<SizeRow[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('services').select('name').eq('is_active', true),
      supabase.from('service_prices').select('service_name, size_category, price'),
      supabase.from('price_list').select('size_category, base_price').eq('is_active', true).order('sort_order'),
      supabase.from('payment_methods').select('name').eq('is_active', true).order('sort_order'),
      supabase.from('settings').select('teams').eq('id', '1').single(),
    ]).then(([sv, sp, pl, pm, st]) => {
      if (sv.data) setServices(sv.data)
      if (sp.data) setServicePrices(sp.data)
      if (pl.data) setSizes(pl.data)
      if (pm.data) {
        setPaymentMethods(pm.data)
        if (pm.data.length > 0) setPayNowMethod(pm.data[0].name)
      }
      if (st.data?.teams) setTeams(st.data.teams)
    })
  }, [])

  const fetchRows = useCallback(async () => {
    if (!range.from || !range.to) return
    const { data, error } = await supabase
      .from('transactions')
      .select('id, date, time_in, plate_number, make, model, size_category, service_name, price, payment_method, status, notes, team')
      .gte('date', range.from).lte('date', range.to)
      .order('date', { ascending: true }).order('time_in', { ascending: true })
    if (error) console.error('queue fetch:', error.message)
    else {
      const txData = (data ?? []).map((r) => ({ ...r, id: String(r.id) }))
      setRows(txData)
      // Fetch all-time visit counts for plates visible in this period
      const plates = [...new Set(txData.map((r) => r.plate_number).filter(Boolean))]
      if (plates.length > 0) {
        const { data: vc } = await supabase
          .from('transactions')
          .select('plate_number')
          .in('plate_number', plates)
        const map: Record<string, number> = {}
        ;(vc ?? []).forEach((r: { plate_number: string }) => {
          map[r.plate_number] = (map[r.plate_number] ?? 0) + 1
        })
        setVisitCounts(map)
      }
    }
    // Fetch expenses for this date range
    const { data: expData } = await supabase
      .from('expenses').select('amount')
      .gte('date', range.from).lte('date', range.to)
      .neq('is_deleted', true)
    setQueueExpenses((expData ?? []).reduce((s: number, e: { amount: number }) => s + (e.amount ?? 0), 0))
    setLoading(false)
  }, [range])

  useEffect(() => {
    setLoading(true); fetchRows()
    if (range.preset === 'today') {
      const interval = setInterval(fetchRows, 30_000)
      return () => clearInterval(interval)
    }
  }, [fetchRows, range.preset])

  useEffect(() => {
    const channel = supabase.channel('queue-expenses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => { fetchRows() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchRows])

  const totalCars    = rows.length
  const totalRevenue = rows.reduce((s, r) => s + r.price, 0)
  const onHandTotal  = rows.filter((r) => r.status === 'On Hand').reduce((s, r) => s + r.price, 0)
  const netProfit    = totalRevenue - queueExpenses
  // kept for PDF export summary
  const depositedTotal = rows.filter((r) => r.status === 'Deposited').reduce((s, r) => s + r.price, 0)
  const pendingTotal   = rows.filter((r) => r.status === 'Pending').reduce((s, r) => s + r.price, 0)

  function priceForService(serviceName: string, sizeCategory: string): number {
    if (isOthers(serviceName)) return 0
    const match = servicePrices.find((sp) => sp.size_category === sizeCategory && sp.service_name === serviceName)
    if (match) return match.price
    const base = sizes.find((s) => s.size_category === sizeCategory)
    return base ? base.base_price : 0
  }

  const editRow        = rows.find((r) => r.id === editingId)
  const sizeForEdit    = editState.size_category
  const isMotoEdit     = MOTO_SIZES.includes(sizeForEdit)
  const visibleEditServices = isMotoEdit
    ? services.filter((s) => MOTO_ALLOWED_SERVICES.includes(s.name))
    : services
  const autoTotal      = editState.selectedServices.reduce((sum, svc) => sum + priceForService(svc, sizeForEdit), 0)
  const effectivePrice = editState.manualPrice !== '' ? parseFloat(editState.manualPrice) || 0 : autoTotal

  function toTitleCase(s: string) {
    return s.replace(/\b\w/g, (c) => c.toUpperCase())
  }

  function startEdit(row: Transaction) {
    setEditingId(row.id)
    setEditState({
      plate_number:     row.plate_number,
      size_category:    row.size_category,
      selectedServices: parseServiceNames(row.service_name),
      manualPrice: '', payment_method: row.payment_method,
      status: row.status, notes: row.notes ?? '',
      time_in: row.time_in ?? '', team: row.team ?? '',
      make: row.make ?? '', model: row.model ?? '',
    })
    setSaveError('')
  }

  function cancelEdit() { setEditingId(null); setSaveError('') }

  function handleEditSizeChange(newSize: string) {
    const newIsMoto = MOTO_SIZES.includes(newSize)
    setEditState((prev) => {
      const filtered = newIsMoto
        ? prev.selectedServices.filter((s) => MOTO_ALLOWED_SERVICES.includes(s))
        : prev.selectedServices
      return { ...prev, size_category: newSize, selectedServices: filtered, manualPrice: '' }
    })
  }

  async function deleteRow(id: string) {
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

  async function saveEdit(id: string) {
    setSaving(true); setSaveError('')
    const serviceLabel = editState.selectedServices.join(', ')
    const cleanPlate = editState.plate_number.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    const { error } = await supabase.from('transactions').update({
      plate_number: cleanPlate,
      size_category: editState.size_category, service_name: serviceLabel,
      price: effectivePrice, payment_method: editState.payment_method,
      status: editState.status, notes: editState.notes,
      time_in: editState.time_in, team: editState.team || null,
      make: editState.make || null, model: editState.model || null,
    }).eq('id', id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setRows((prev) => prev.map((r) =>
      r.id === id ? { ...r, plate_number: cleanPlate, size_category: editState.size_category,
        service_name: serviceLabel, price: effectivePrice, payment_method: editState.payment_method,
        status: editState.status, notes: editState.notes, time_in: editState.time_in,
        team: editState.team || null, make: editState.make || null, model: editState.model || null } : r
    ))
    setEditingId(null)
  }

  function openPayNow(row: Transaction) {
    setPayNowRow(row)
    setPayNowMethod(paymentMethods[0]?.name ?? 'Cash')
    setPayNowStatus('On Hand')
    setPayNowError('')
  }

  async function confirmPayNow() {
    if (!payNowRow || !payNowMethod) { setPayNowError('Please select a payment method.'); return }
    setPayNowSaving(true); setPayNowError('')
    const { error } = await supabase.from('transactions').update({
      payment_method: payNowMethod, status: payNowStatus,
    }).eq('id', payNowRow.id)
    setPayNowSaving(false)
    if (error) { setPayNowError(error.message); return }
    setRows((prev) => prev.map((r) =>
      r.id === payNowRow.id ? { ...r, payment_method: payNowMethod, status: payNowStatus } : r
    ))
    setPayNowRow(null)
  }

  async function handleExport(format: ExportFormat) {
    setExporting(true)
    const label    = rangeLabel.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase()
    const filename = `primera-queue-${label}`
    const HEADERS  = ['Date', 'Time In', 'Plate', 'Make', 'Model', 'Size', 'Service', 'Price', 'Payment', 'Status', 'Team', 'Notes']
    const dataRows = rows.map((r) => [
      r.date ?? '', r.time_in ?? '', r.plate_number, r.make ?? '', r.model ?? '',
      r.size_category, r.service_name, r.price, r.payment_method, r.status, r.team ?? '', r.notes ?? '',
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
          { label: 'Pending',       value: formatPrice(pendingTotal) },
        ],
      }], `${filename}.pdf`)
    }
    setExporting(false)
  }

  const rangeLabel  = formatRangeLabel(range)
  const isSingleDay = range.from === range.to
  const carLabel    = isSingleDay ? 'Cars' : 'Total Cars'

  const fullInputCls =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 ' +
    'focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'

  // ── Edit Panel (shared mobile + desktop) ─────────────────────────────────
  const EditPanel = editingId !== null && editRow ? (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-4 sm:px-6 sm:py-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-amber-800">
          Editing — {editRow.plate_number}
          {editRow.make || editRow.model ? ` · ${[editRow.make, editRow.model].filter(Boolean).join(' ')}` : ''}
        </p>
        <button onClick={cancelEdit} className="text-xs font-medium text-gray-500 hover:text-gray-700">✕ Cancel</button>
      </div>

      {/* Plate Number */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-gray-500">Plate Number</label>
        <input
          type="text"
          value={editState.plate_number}
          onChange={(e) => setEditState((s) => ({ ...s, plate_number: e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase() }))}
          onBlur={(e) => setEditState((s) => ({ ...s, plate_number: e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase() }))}
          placeholder="e.g. ABC1234"
          className={fullInputCls}
          maxLength={10}
        />
      </div>

      {/* Make & Model */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Make</label>
          <input type="text" value={editState.make}
            onChange={(e) => setEditState((s) => ({ ...s, make: e.target.value }))}
            onBlur={(e) => setEditState((s) => ({ ...s, make: toTitleCase(e.target.value) }))}
            placeholder="e.g. Toyota" className={fullInputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Model</label>
          <input type="text" value={editState.model}
            onChange={(e) => setEditState((s) => ({ ...s, model: e.target.value }))}
            onBlur={(e) => setEditState((s) => ({ ...s, model: toTitleCase(e.target.value) }))}
            placeholder="e.g. Fortuner" className={fullInputCls} />
        </div>
      </div>

      {/* Size */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Size Category</p>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => (
            <button key={s.size_category} type="button" onClick={() => handleEditSizeChange(s.size_category)}
              className="rounded-xl border px-3 py-2 text-xs font-semibold transition-all active:scale-95"
              style={{
                borderColor:     editState.size_category === s.size_category ? '#B8922A' : '#e5e7eb',
                backgroundColor: editState.size_category === s.size_category ? 'rgba(184,146,42,0.08)' : '#fff',
                color:           editState.size_category === s.size_category ? '#B8922A' : '#374151',
              }}>
              {s.size_category}
            </button>
          ))}
        </div>
        {isMotoEdit && (
          <p className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: 'rgba(184,146,42,0.08)', color: '#B8922A' }}>
            {editState.size_category} — Available: Basic Wash, Wax, Others
          </p>
        )}
      </div>

      {/* Services */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Services</p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {visibleEditServices.map((svc) => {
            const selected  = editState.selectedServices.includes(svc.name)
            const unitPrice = priceForService(svc.name, sizeForEdit)
            return (
              <button key={svc.name} type="button" onClick={() => toggleEditService(svc.name)}
                className="flex flex-col items-start rounded-xl border px-3 py-2.5 text-left text-xs transition-all active:scale-95"
                style={{
                  borderColor:     selected ? '#B8922A' : '#e5e7eb',
                  backgroundColor: selected ? 'rgba(184,146,42,0.08)' : '#fff',
                  color:           selected ? '#B8922A' : '#374151',
                }}>
                <span className="font-semibold">{svc.name}</span>
                {!isOthers(svc.name) && unitPrice > 0 && (
                  <span style={{ color: selected ? '#B8922A' : '#9ca3af' }}>{formatPrice(unitPrice)}</span>
                )}
                {isOthers(svc.name) && (
                  <span className="italic" style={{ color: selected ? '#B8922A' : '#9ca3af' }}>manual price</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Price breakdown */}
      {editState.selectedServices.length > 0 && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="mb-2 space-y-1">
            {editState.selectedServices.map((svc) => (
              <div key={svc} className="flex justify-between text-xs text-gray-600">
                <span>{svc}</span>
                {isOthers(svc) ? <span className="italic text-gray-400">manual</span>
                  : <span>{formatPrice(priceForService(svc, sizeForEdit))}</span>}
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-2 text-xs font-bold">
            <span className="text-gray-700">Auto Total</span>
            <span style={{ color: '#B8922A' }}>{formatPrice(autoTotal)}</span>
          </div>
          <div className="mt-2">
            <label className="mb-1 block text-xs font-medium text-gray-500">Price Override — leave blank for auto</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₱</span>
              <input type="number" inputMode="decimal" min="0" step="0.01"
                value={editState.manualPrice}
                onChange={(e) => setEditState((s) => ({ ...s, manualPrice: e.target.value }))}
                placeholder={String(autoTotal)}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-6 pr-2 text-sm text-gray-900 focus:border-[#B8922A] focus:outline-none" />
            </div>
            <p className="mt-0.5 text-xs text-gray-400">Charging: <strong style={{ color: '#B8922A' }}>{formatPrice(effectivePrice)}</strong></p>
          </div>
        </div>
      )}

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Time In</label>
          <input type="time" value={editState.time_in}
            onChange={(e) => setEditState((s) => ({ ...s, time_in: e.target.value }))}
            className={fullInputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Payment</label>
          <select value={editState.payment_method}
            onChange={(e) => setEditState((s) => ({ ...s, payment_method: e.target.value }))}
            className={fullInputCls}>
            <option value="Pending">— Pending —</option>
            {paymentMethods.map((pm) => <option key={pm.name} value={pm.name}>{pm.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select value={editState.status}
            onChange={(e) => setEditState((s) => ({ ...s, status: e.target.value }))}
            className={fullInputCls}>
            <option value="Pending">Pending</option>
            <option value="On Hand">On Hand</option>
            <option value="Deposited">Deposited</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Team</label>
          <select value={editState.team}
            onChange={(e) => setEditState((s) => ({ ...s, team: e.target.value }))}
            className={fullInputCls}>
            <option value="">— No Team —</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
          <input type="text" value={editState.notes}
            onChange={(e) => setEditState((s) => ({ ...s, notes: e.target.value }))}
            placeholder="Optional notes…" className={fullInputCls} />
        </div>
      </div>

      {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={() => saveEdit(editingId!)}
          disabled={saving || editState.selectedServices.length === 0 || !editState.size_category}
          className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60 sm:flex-none sm:px-5 sm:py-2"
          style={{ backgroundColor: '#B8922A' }}>
          {saving ? 'Saving…' : `Save — ${formatPrice(effectivePrice)}`}
        </button>
        <button onClick={cancelEdit} disabled={saving}
          className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-60 sm:py-2">
          Cancel
        </button>
      </div>
    </div>
  ) : null

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-2 sm:mb-5">
          <h1 className="text-lg font-bold text-gray-900 sm:text-2xl">
            Queue <span className="hidden sm:inline">— </span>
            <span className="text-sm font-medium sm:text-2xl sm:font-bold" style={{ color: '#B8922A' }}>
              {rangeLabel}
            </span>
          </h1>
          <div className="flex items-center gap-2">
            <ExportMenu onExport={handleExport} loading={exporting} />
            <Link href="/checkin"
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-95 sm:px-5 sm:py-3"
              style={{ backgroundColor: '#B8922A' }}>
              + Check-In
            </Link>
          </div>
        </div>

        {/* Date range */}
        <div className="mb-4 rounded-2xl bg-white p-3 shadow-sm sm:mb-5 sm:p-4">
          <DateRangeSelector value={range} onChange={(r) => { setRange(r); setEditingId(null) }} />
        </div>

        {/* Summary cards — 2 col on mobile, 4 on desktop */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 sm:grid-cols-4 sm:gap-4">
          <SummaryCard label={carLabel}      value={String(totalCars)} />
          <SummaryCard label="Revenue"       value={formatPrice(totalRevenue)} highlight />
          <SummaryCard label="On Hand"       value={formatPrice(onHandTotal)} />
          <SummaryCard label="Expenses"      value={formatPrice(queueExpenses)} />
          <div className="col-span-2 sm:col-span-1 rounded-2xl bg-white p-3 shadow-sm sm:p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 truncate">Net Profit</p>
            <p className={`mt-1 text-lg font-bold sm:text-xl ${netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {formatPrice(netProfit)}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="py-16 text-center text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white py-20 text-center shadow-sm">
            <p className="text-gray-400">No transactions found for this period.</p>
            <Link href="/checkin"
              className="mt-4 inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: '#B8922A' }}>
              Add the first one
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-white shadow-sm">
            {/* Edit panel */}
            {EditPanel}

            {/* ── MOBILE: Card list (hidden on sm+) ── */}
            <div className="divide-y divide-gray-100 sm:hidden">
              {rows.map((row) => {
                const isEditing = editingId === row.id
                const isPending = row.status === 'Pending'
                return (
                  <div key={row.id}
                    className={`px-4 py-3 ${isEditing ? 'bg-amber-50/60' : isPending ? 'bg-blue-50/40' : ''}`}>
                    {/* Top row: plate + price */}
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {!isEmployee && (
                          <input type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            className="h-4 w-4 rounded accent-[#B8922A] shrink-0"
                            onClick={(e) => e.stopPropagation()} />
                        )}
                        <span className="text-base font-bold tracking-wider text-gray-900">{row.plate_number}</span>
                        {visitCounts[row.plate_number] > 0 && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                            {visitCounts[row.plate_number]}× visit
                          </span>
                        )}
                        {(row.make || row.model) && (
                          <span className="ml-2 text-xs text-gray-500">{[row.make, row.model].filter(Boolean).join(' ')}</span>
                        )}
                      </div>
                      <span className="text-base font-bold" style={{ color: '#B8922A' }}>{formatPrice(row.price)}</span>
                    </div>
                    {/* Service + size */}
                    <p className="text-sm text-gray-700 mb-1">{row.service_name}</p>
                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mb-2">
                      <span>{formatTime(row.time_in)}</span>
                      <span>{row.size_category}</span>
                      {row.team && <span>🏷 {row.team}</span>}
                      {!isSingleDay && row.date && (
                        <span>{new Date(row.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
                      )}
                    </div>
                    {/* Status + payment */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(row.status)}`}>
                          {row.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {row.payment_method === 'Pending'
                            ? <span className="italic text-blue-400">Pending</span>
                            : row.payment_method}
                        </span>
                      </div>
                      {/* Action buttons */}
                      {isEditing ? (
                        <span className="text-xs font-semibold" style={{ color: '#B8922A' }}>Editing…</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {isPending && (
                            <button onClick={() => openPayNow(row)}
                              className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-bold text-white active:scale-95">
                              💳 Pay
                            </button>
                          )}
                          <button onClick={() => requireAdmin(() => startEdit(row))}
                            className="rounded-lg border px-3 py-1.5 text-xs font-semibold active:scale-95"
                            style={{ borderColor: '#B8922A', color: '#B8922A' }}>
                            Edit
                          </button>
                          <button onClick={() => requireAdmin(() => setConfirmDeleteId(row.id))}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-400 active:scale-95">
                            Del
                          </button>
                        </div>
                      )}
                    </div>
                    {row.notes && <p className="mt-1 text-xs text-gray-400 italic">{row.notes}</p>}
                  </div>
                )
              })}
            </div>

            {/* ── DESKTOP: Full table (hidden on mobile) ── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {!isEmployee && (
                      <th className="pl-4 py-3 w-8">
                        <input type="checkbox"
                          checked={rows.length > 0 && selected.size === rows.length}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded accent-[#B8922A]" />
                      </th>
                    )}
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Time In</th>
                    <th className="px-4 py-3">Plate</th>
                    <th className="px-4 py-3">Make & Model</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row) => {
                    const isEditing = editingId === row.id
                    const isPending = row.status === 'Pending'
                    return (
                      <tr key={row.id} className={isEditing ? 'bg-amber-50/60' : isPending ? 'bg-blue-50/40' : selected.has(row.id) ? 'bg-amber-50/40' : 'hover:bg-gray-50'}>
                        {!isEmployee && (
                          <td className="pl-4 py-3 w-8">
                            <input type="checkbox"
                              checked={selected.has(row.id)}
                              onChange={() => toggleSelect(row.id)}
                              className="h-4 w-4 rounded accent-[#B8922A]" />
                          </td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                          {!isSingleDay && row.date
                            ? new Date(row.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                            : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-700">{formatTime(row.time_in)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="font-bold tracking-wide text-gray-900">{row.plate_number}</span>
                          {visitCounts[row.plate_number] > 0 && (
                            <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                              {visitCounts[row.plate_number]}×
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{[row.make, row.model].filter(Boolean).join(' ') || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">{row.size_category}</td>
                        <td className="px-4 py-3 text-gray-700">{row.service_name}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{formatPrice(row.price)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                          {row.payment_method === 'Pending'
                            ? <span className="italic text-blue-400">Pending</span>
                            : row.payment_method}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{row.team || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{row.notes || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {isEditing ? (
                            <span className="text-xs font-semibold" style={{ color: '#B8922A' }}>Editing…</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {isPending && (
                                <button onClick={() => openPayNow(row)}
                                  className="rounded-lg bg-green-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-600 transition-colors">
                                  💳 Pay
                                </button>
                              )}
                              <button onClick={() => requireAdmin(() => startEdit(row))}
                                className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors"
                                style={{ borderColor: '#B8922A', color: '#B8922A' }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(184,146,42,0.08)' }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}>
                                Edit
                              </button>
                              <button onClick={() => requireAdmin(() => setConfirmDeleteId(row.id))}
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

      {/* Pay Now Modal — sheet on mobile */}
      {payNowRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:px-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-sm sm:rounded-2xl">
            <h3 className="mb-1 text-base font-bold text-gray-900">Mark as Paid</h3>
            <p className="mb-4 text-sm text-gray-500">
              <strong className="text-gray-900">{payNowRow.plate_number}</strong>
              {' · '}{payNowRow.service_name}
            </p>
            <p className="mb-4 text-2xl font-bold" style={{ color: '#B8922A' }}>{formatPrice(payNowRow.price)}</p>
            <div className="space-y-4 mb-5">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((pm) => (
                    <button key={pm.name} type="button" onClick={() => setPayNowMethod(pm.name)}
                      className="rounded-xl border py-3 text-sm font-semibold transition-all active:scale-95"
                      style={{
                        borderColor:     payNowMethod === pm.name ? '#B8922A' : '#e5e7eb',
                        backgroundColor: payNowMethod === pm.name ? 'rgba(184,146,42,0.08)' : '#fff',
                        color:           payNowMethod === pm.name ? '#B8922A' : '#374151',
                      }}>
                      {pm.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {['On Hand', 'Deposited'].map((s) => (
                    <button key={s} type="button" onClick={() => setPayNowStatus(s)}
                      className="rounded-xl border py-3 text-sm font-semibold transition-all active:scale-95"
                      style={{
                        borderColor:     payNowStatus === s ? '#B8922A' : '#e5e7eb',
                        backgroundColor: payNowStatus === s ? 'rgba(184,146,42,0.08)' : '#fff',
                        color:           payNowStatus === s ? '#B8922A' : '#374151',
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {payNowError && <p className="mb-3 text-sm text-red-600">{payNowError}</p>}
            <div className="flex gap-3">
              <button onClick={confirmPayNow} disabled={payNowSaving || !payNowMethod}
                className="flex-1 rounded-xl py-4 text-sm font-bold text-white disabled:opacity-60 active:scale-95"
                style={{ backgroundColor: '#B8922A' }}>
                {payNowSaving ? 'Saving…' : 'Confirm Payment'}
              </button>
              <button onClick={() => setPayNowRow(null)} disabled={payNowSaving}
                className="rounded-xl border-2 border-gray-200 px-5 py-4 text-sm font-bold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Override Modal (single row) */}
      <AdminOverrideModal
        open={overrideOpen}
        onClose={() => { setOverrideOpen(false); setPendingAction(null) }}
        onGranted={() => {
          if (pendingAction) {
            pendingAction()
            setPendingAction(null)
          }
        }}
        actionLabel="edit or delete transactions"
      />

      {/* Admin Override Modal (bulk) */}
      <AdminOverrideModal
        open={bulkOverrideOpen}
        onClose={() => { setBulkOverrideOpen(false); setBulkPendingAction(null) }}
        onGranted={() => {
          if (bulkPendingAction) {
            bulkPendingAction()
            setBulkPendingAction(null)
          }
        }}
        actionLabel="bulk actions"
      />

      {/* ── Floating Bulk Action Bar (admin only, when rows selected) ── */}
      {!isEmployee && selected.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-2xl px-4 py-3 shadow-2xl"
          style={{ backgroundColor: '#111', border: '1px solid #2a2a2a', minWidth: '320px' }}
        >
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-white">{selected.size} selected</span>
            <button onClick={() => { setSelected(new Set()); setBulkPanel(null) }} className="text-xs text-gray-500 hover:text-white">✕ Clear</button>
          </div>

          {/* Action buttons */}
          {bulkPanel === null && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setBulkStatus(''); setBulkPanel('status') }}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
                style={{ backgroundColor: '#1f1f1f', border: '1px solid #333' }}
              >
                Set Status
              </button>
              <button
                onClick={() => { setBulkTeam(''); setBulkPanel('team') }}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
                style={{ backgroundColor: '#1f1f1f', border: '1px solid #333' }}
              >
                Set Team
              </button>
              <button
                onClick={() => requireAdminBulk(() => setBulkPanel('delete'))}
                className="rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                Delete All
              </button>
            </div>
          )}

          {/* Status sub-panel */}
          {bulkPanel === 'status' && (
            <div className="flex flex-wrap gap-2">
              {['On Hand', 'Deposited', 'Pending'].map((s) => (
                <button
                  key={s}
                  onClick={() => applyBulkStatus(s)}
                  disabled={bulkProcessing}
                  className="rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: '#B8922A', color: '#000' }}
                >
                  {bulkProcessing ? '…' : s}
                </button>
              ))}
              <button onClick={() => setBulkPanel(null)} className="rounded-xl px-3 py-2 text-xs text-gray-500">Back</button>
            </div>
          )}

          {/* Team sub-panel */}
          {bulkPanel === 'team' && (
            <div className="flex flex-wrap gap-2">
              {['', ...teams].map((t) => (
                <button
                  key={t || '__none__'}
                  onClick={() => applyBulkTeam(t)}
                  disabled={bulkProcessing}
                  className="rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: '#B8922A', color: '#000' }}
                >
                  {bulkProcessing ? '…' : t || 'No Team'}
                </button>
              ))}
              <button onClick={() => setBulkPanel(null)} className="rounded-xl px-3 py-2 text-xs text-gray-500">Back</button>
            </div>
          )}

          {/* Delete confirm sub-panel */}
          {bulkPanel === 'delete' && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-400">Delete {selected.size} transactions?</span>
              <button
                onClick={applyBulkDelete}
                disabled={bulkProcessing}
                className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"
                style={{ backgroundColor: 'rgba(239,68,68,0.9)', color: '#fff' }}
              >
                {bulkProcessing ? 'Deleting…' : 'Confirm Delete'}
              </button>
              <button onClick={() => setBulkPanel(null)} className="rounded-xl px-3 py-2 text-xs text-gray-500">Back</button>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:px-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-sm sm:rounded-2xl">
            <h3 className="mb-2 text-base font-bold text-gray-900">Delete Transaction</h3>
            <p className="mb-5 text-sm text-gray-500">Are you sure? This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteRow(confirmDeleteId)} disabled={deleting}
                className="flex-1 rounded-xl bg-red-500 py-4 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60 active:scale-95">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDeleteId(null)} disabled={deleting}
                className="flex-1 rounded-xl border-2 border-gray-200 py-4 text-sm font-bold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 truncate">{label}</p>
      <p className={`mt-1 text-lg font-bold sm:text-xl ${highlight ? 'text-[#B8922A]' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}