'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/app/context/AuthContext'
import AdminOverrideModal from '@/app/components/AdminOverrideModal'
import DateRangeSelector, { type DateRange } from '@/app/components/DateRangeSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string; name: string; category: string; unit: string
  current_stock: number; low_stock_threshold: number | null
  reorder_quantity: number | null; cost_per_unit?: number; is_active: boolean
}

interface CheckRecord {
  item_id: string; check_type: 'opening' | 'closing'
  counted_quantity: number; checker_name: string; created_at: string; date: string
}

interface AuditLog {
  id: string; item_id: string; action_type: string
  previous_value: number | null; new_value: number | null
  field_changed: string | null; reason: string | null
  performed_by: string; is_admin_override: boolean; created_at: string
  inventory_items: { name: string; unit: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Waiting Area', 'Carwash', 'Office', 'Toilet & Bath',
  'Kitchen', "Attendant's Room", 'Detailing',
]

const UNITS = ['pcs', 'bottle', 'sack', 'roll', 'tank', 'box', 'pack', 'kg', 'liter']

const ACTION_TYPES = [
  'all', 'daily_count', 'restock', 'manual_correction',
  'item_created', 'item_edited', 'item_deactivated',
]

function localToday() {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function stockStatus(item: InventoryItem): 'ok' | 'low' | 'empty' {
  if (item.current_stock === 0) return 'empty'
  if (item.low_stock_threshold != null && item.current_stock <= item.low_stock_threshold) return 'low'
  return 'ok'
}

// ─── Small shared pieces ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'ok' | 'low' | 'empty' }) {
  const map = {
    ok:    { cls: 'bg-green-100 text-green-700',  label: 'OK' },
    low:   { cls: 'bg-amber-100 text-amber-700',  label: 'Low' },
    empty: { cls: 'bg-red-100 text-red-700',      label: 'Empty' },
  }
  const { cls, label } = map[status]
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300'
const labelCls = 'mb-1 block text-xs font-medium text-gray-500'

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const today   = localToday()

  // Core data
  const [items, setItems]             = useState<InventoryItem[]>([])
  const [todayChecks, setTodayChecks] = useState<Record<string, { opening: CheckRecord | null; closing: CheckRecord | null }>>({})
  const [loading, setLoading]         = useState(true)

  // UI state
  const [activeTab, setActiveTab]     = useState<'items' | 'log' | 'audit'>('items')
  const [collapsed, setCollapsed]     = useState<Record<string, boolean>>({})
  const [range, setRange]             = useState<DateRange>({ preset: 'today', from: today, to: today })

  // Count flow
  const [countMode, setCountMode]     = useState<'opening' | 'closing' | null>(null)
  const [checkerName, setCheckerName] = useState(user?.fullName ?? '')
  const [counts, setCounts]           = useState<Record<string, string>>({})
  const [countSaving, setCountSaving] = useState(false)
  const [countError, setCountError]   = useState('')

  // Restock (admin)
  const [showRestock, setShowRestock]         = useState(false)
  const [restockItemId, setRestockItemId]     = useState('')
  const [restockQty, setRestockQty]           = useState('')
  const [restockCpu, setRestockCpu]           = useState('')
  const [restockDate, setRestockDate]         = useState(today)
  const [restockPayment, setRestockPayment]   = useState('Cash')
  const [restockNotes, setRestockNotes]       = useState('')
  const [restockSaving, setRestockSaving]     = useState(false)
  const [restockError, setRestockError]       = useState('')

  // Item form (admin)
  const [showItemForm, setShowItemForm]         = useState(false)
  const [editingItem, setEditingItem]           = useState<InventoryItem | null>(null)
  const [itemName, setItemName]                 = useState('')
  const [itemCategory, setItemCategory]         = useState(CATEGORIES[0])
  const [itemUnit, setItemUnit]                 = useState('pcs')
  const [itemThreshold, setItemThreshold]       = useState('')
  const [itemReorder, setItemReorder]           = useState('')
  const [itemCpu, setItemCpu]                   = useState('')
  const [itemSaving, setItemSaving]             = useState(false)
  const [itemError, setItemError]               = useState('')

  // Audit (admin)
  const [auditLogs, setAuditLogs]       = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditItemId, setAuditItemId]   = useState('')
  const [auditAction, setAuditAction]   = useState('all')

  // Check log
  const [checkLogs, setCheckLogs]       = useState<CheckRecord[]>([])
  const [checkLoading, setCheckLoading] = useState(false)

  // Admin override
  const [overrideOpen, setOverrideOpen]   = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  // ─── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/inventory/items')
    if (res.ok) setItems((await res.json()).items ?? [])
    setLoading(false)
  }, [])

  const fetchTodayChecks = useCallback(async () => {
    const res = await fetch(`/api/inventory/checks?date=${today}`)
    if (!res.ok) return
    const map: Record<string, { opening: CheckRecord | null; closing: CheckRecord | null }> = {}
    for (const c of (await res.json()).checks as CheckRecord[]) {
      if (!map[c.item_id]) map[c.item_id] = { opening: null, closing: null }
      map[c.item_id][c.check_type] = c
    }
    setTodayChecks(map)
  }, [today])

  const fetchCheckLogs = useCallback(async () => {
    if (!range.from || !range.to) return
    setCheckLoading(true)
    const res = await fetch(`/api/inventory/checks?date=${range.from}&to=${range.to}`)
    if (res.ok) setCheckLogs((await res.json()).checks ?? [])
    setCheckLoading(false)
  }, [range])

  const fetchAudit = useCallback(async () => {
    if (!isAdmin) return
    setAuditLoading(true)
    const p = new URLSearchParams()
    if (range.from) p.set('from', range.from)
    if (range.to)   p.set('to', range.to)
    if (auditItemId) p.set('item_id', auditItemId)
    if (auditAction !== 'all') p.set('action_type', auditAction)
    const res = await fetch(`/api/inventory/audit?${p}`)
    if (res.ok) setAuditLogs((await res.json()).logs ?? [])
    setAuditLoading(false)
  }, [isAdmin, range, auditItemId, auditAction])

  useEffect(() => { fetchItems(); fetchTodayChecks() }, [fetchItems, fetchTodayChecks])
  useEffect(() => { if (activeTab === 'log')   fetchCheckLogs() }, [activeTab, fetchCheckLogs])
  useEffect(() => { if (activeTab === 'audit') fetchAudit()     }, [activeTab, fetchAudit])

  // ─── Derived ────────────────────────────────────────────────────────────────

  const activeItems   = items.filter((i) => i.is_active)
  const totalItems    = activeItems.length
  const lowStockCnt   = activeItems.filter((i) => stockStatus(i) === 'low').length
  const emptyCnt      = activeItems.filter((i) => stockStatus(i) === 'empty').length
  const fullyCnt      = activeItems.filter((i) => stockStatus(i) === 'ok').length

  const openingDone = Object.values(todayChecks).some((c) => c.opening !== null)
  const closingDone = Object.values(todayChecks).some((c) => c.closing !== null)

  function checkTime(type: 'opening' | 'closing') {
    const ts = Object.values(todayChecks)
      .filter((c) => c[type] !== null)
      .map((c) => c[type]!.created_at)
      .sort()[0]
    return ts ? new Date(ts).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true }) : null
  }

  const byCategory: Record<string, InventoryItem[]> = {}
  for (const cat of CATEGORIES) byCategory[cat] = []
  for (const item of activeItems) {
    if (!byCategory[item.category]) byCategory[item.category] = []
    byCategory[item.category].push(item)
  }

  // ─── Count flow ─────────────────────────────────────────────────────────────

  function openCount(type: 'opening' | 'closing') {
    const prefill: Record<string, string> = {}
    for (const item of activeItems) {
      const existing = todayChecks[item.id]?.[type]
      if (existing) prefill[item.id] = String(existing.counted_quantity)
    }
    setCounts(prefill)
    setCountMode(type)
    setCountError('')
  }

  async function submitCount() {
    if (!checkerName.trim()) { setCountError('Enter checker name'); return }
    const checkList = activeItems.map((i) => ({
      item_id: i.id,
      counted_quantity: parseFloat(counts[i.id] ?? '') || 0,
    }))
    setCountSaving(true)
    const res = await fetch('/api/inventory/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checks: checkList, date: today, check_type: countMode, checker_name: checkerName.trim() }),
    })
    setCountSaving(false)
    if (!res.ok) { const d = await res.json(); setCountError(d.error ?? 'Failed'); return }
    setCountMode(null)
    fetchItems()
    fetchTodayChecks()
  }

  // ─── Restock ────────────────────────────────────────────────────────────────

  function openRestock(itemId?: string) {
    setRestockItemId(itemId ?? '')
    const found = itemId ? items.find((i) => i.id === itemId) : undefined
    setRestockCpu(found?.cost_per_unit !== undefined ? String(found.cost_per_unit) : '')
    setRestockQty(''); setRestockDate(today); setRestockNotes(''); setRestockError('')
    setShowRestock(true)
  }

  async function submitRestock() {
    if (!restockItemId)                         { setRestockError('Select an item'); return }
    if (!restockQty || Number(restockQty) <= 0) { setRestockError('Enter a valid quantity'); return }
    setRestockSaving(true)
    const res = await fetch('/api/inventory/restock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: restockItemId, quantity: Number(restockQty),
        cost_per_unit: Number(restockCpu) || 0, date: restockDate,
        payment_type: restockPayment, notes: restockNotes,
      }),
    })
    setRestockSaving(false)
    if (!res.ok) { const d = await res.json(); setRestockError(d.error ?? 'Failed'); return }
    setShowRestock(false)
    fetchItems()
  }

  // ─── Item management ────────────────────────────────────────────────────────

  function openItemForm(item?: InventoryItem) {
    setEditingItem(item ?? null)
    setItemName(item?.name ?? ''); setItemCategory(item?.category ?? CATEGORIES[0])
    setItemUnit(item?.unit ?? 'pcs')
    setItemThreshold(item?.low_stock_threshold != null ? String(item.low_stock_threshold) : '')
    setItemReorder(item?.reorder_quantity != null ? String(item.reorder_quantity) : '')
    setItemCpu(item?.cost_per_unit !== undefined ? String(item.cost_per_unit) : '')
    setItemError(''); setShowItemForm(true)
  }

  async function submitItemForm() {
    if (!itemName.trim()) { setItemError('Name required'); return }
    setItemSaving(true)
    const body = {
      name: itemName.trim(), category: itemCategory, unit: itemUnit,
      low_stock_threshold: itemThreshold ? Number(itemThreshold) : null,
      reorder_quantity:    itemReorder   ? Number(itemReorder)   : null,
      cost_per_unit: Number(itemCpu) || 0,
    }
    const res = editingItem
      ? await fetch(`/api/inventory/items/${editingItem.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/inventory/items',                   { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setItemSaving(false)
    if (!res.ok) { const d = await res.json(); setItemError(d.error ?? 'Failed'); return }
    setShowItemForm(false)
    fetchItems()
  }

  async function deactivateItem(id: string) {
    await fetch(`/api/inventory/items/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    })
    setShowItemForm(false)
    fetchItems()
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Inventory</h1>
          {isAdmin && (
            <div className="flex gap-2">
              <button onClick={() => openItemForm()}
                className="rounded-xl border px-3 py-2 text-xs font-semibold"
                style={{ borderColor: '#B8922A', color: '#B8922A' }}>
                + Add Item
              </button>
              <button onClick={() => openRestock()}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
                style={{ backgroundColor: '#B8922A' }}>
                Restock
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="py-12 text-center text-gray-400">Loading inventory…</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total Items',       value: totalItems,  color: 'text-gray-900' },
                { label: 'Low Stock',          value: lowStockCnt, color: 'text-amber-600' },
                { label: 'Need to Purchase',   value: emptyCnt,    color: 'text-red-600' },
                { label: 'Fully Stocked',      value: fullyCnt,    color: 'text-green-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
                  <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Today's check status + action buttons */}
            <div className="grid grid-cols-2 gap-3">
              {(['opening', 'closing'] as const).map((type) => {
                const done = type === 'opening' ? openingDone : closingDone
                const time = checkTime(type)
                return (
                  <div key={type}
                    className={`flex items-center justify-between rounded-2xl p-3 sm:p-4 ${done ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {type === 'opening' ? 'Opening Count' : 'Closing Count'}
                      </p>
                      {done && time
                        ? <p className="mt-0.5 text-xs font-bold text-green-600">✓ Done {time}</p>
                        : <p className="mt-0.5 text-xs text-gray-400">○ Not yet done</p>}
                    </div>
                    <button onClick={() => openCount(type)}
                      className="ml-3 shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: '#B8922A' }}>
                      {done ? 'Update' : 'Start'}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 rounded-2xl bg-white p-1 shadow-sm">
              {([
                { key: 'items', label: 'Items' },
                { key: 'log',   label: 'Count Log' },
                ...(isAdmin ? [{ key: 'audit', label: 'Audit Log' }] : []),
              ] as { key: typeof activeTab; label: string }[]).map(({ key, label }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className="flex-1 rounded-xl py-2 text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: activeTab === key ? '#B8922A' : 'transparent',
                    color: activeTab === key ? '#fff' : '#9ca3af',
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Items tab ── */}
            {activeTab === 'items' && (
              <div className="space-y-3">
                {CATEGORIES.map((cat) => {
                  const catItems = byCategory[cat] ?? []
                  if (catItems.length === 0) return null
                  const isOpen = collapsed[cat] !== true
                  const emptyCount = catItems.filter((i) => stockStatus(i) === 'empty').length
                  const lowCount  = catItems.filter((i) => stockStatus(i) === 'low').length

                  return (
                    <div key={cat} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                      <button
                        onClick={() => setCollapsed((p) => ({ ...p, [cat]: !p[cat] }))}
                        className="flex w-full items-center justify-between px-4 py-3 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">{cat}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{catItems.length}</span>
                          {emptyCount > 0 && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">{emptyCount} empty</span>
                          )}
                          {lowCount > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-600">{lowCount} low</span>
                          )}
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                          className="ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform"
                          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="border-t border-gray-50">
                          {/* Desktop table */}
                          <table className="hidden w-full sm:table">
                            <thead>
                              <tr className="border-b border-gray-50 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                                <th className="px-4 py-2 pl-5">Item</th>
                                <th className="px-4 py-2">Stock</th>
                                <th className="px-4 py-2">Threshold</th>
                                <th className="px-4 py-2">Status</th>
                                {isAdmin && <th className="px-4 py-2">Cost/Unit</th>}
                                <th className="px-4 py-2">Today</th>
                                {isAdmin && <th className="px-4 py-2" />}
                              </tr>
                            </thead>
                            <tbody>
                              {catItems.map((item) => {
                                const status = stockStatus(item)
                                const check  = todayChecks[item.id]
                                return (
                                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="px-4 py-3 pl-5 text-sm font-medium text-gray-900">{item.name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-700">
                                      {item.current_stock}
                                      <span className="ml-1 text-xs text-gray-400">{item.unit}</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {item.low_stock_threshold ?? '—'}
                                    </td>
                                    <td className="px-4 py-3"><StatusBadge status={status} /></td>
                                    {isAdmin && (
                                      <td className="px-4 py-3 text-sm text-gray-500">
                                        {item.cost_per_unit !== undefined ? formatPHP(item.cost_per_unit) : '—'}
                                      </td>
                                    )}
                                    <td className="px-4 py-3 text-xs text-gray-500">
                                      {check?.opening && (
                                        <span className="mr-2 font-semibold text-blue-600">O:{check.opening.counted_quantity}</span>
                                      )}
                                      {check?.closing && (
                                        <span className="font-semibold text-green-600">C:{check.closing.counted_quantity}</span>
                                      )}
                                      {check?.opening && check?.closing && (
                                        <span className="ml-2 text-gray-400">
                                          (used:{' '}
                                          {Number(check.opening.counted_quantity) - Number(check.closing.counted_quantity)})
                                        </span>
                                      )}
                                      {!check?.opening && !check?.closing && <span className="text-gray-300">—</span>}
                                    </td>
                                    {isAdmin && (
                                      <td className="px-4 py-3 pr-5">
                                        <div className="flex justify-end gap-1.5">
                                          <button onClick={() => openRestock(item.id)}
                                            className="rounded-lg px-2 py-1 text-xs font-semibold"
                                            style={{ backgroundColor: 'rgba(184,146,42,0.1)', color: '#B8922A' }}>
                                            Restock
                                          </button>
                                          <button onClick={() => openItemForm(item)}
                                            className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-200">
                                            Edit
                                          </button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>

                          {/* Mobile cards */}
                          <div className="divide-y divide-gray-50 sm:hidden">
                            {catItems.map((item) => {
                              const status = stockStatus(item)
                              const check  = todayChecks[item.id]
                              return (
                                <div key={item.id} className="px-4 py-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                                      <p className="mt-0.5 text-xs text-gray-500">
                                        {item.current_stock} {item.unit}
                                        {item.low_stock_threshold != null && ` · min: ${item.low_stock_threshold}`}
                                      </p>
                                      {(check?.opening || check?.closing) && (
                                        <p className="mt-0.5 text-xs text-gray-400">
                                          {check?.opening && `O:${check.opening.counted_quantity} `}
                                          {check?.closing && `C:${check.closing.counted_quantity}`}
                                          {check?.opening && check?.closing && (
                                            ` (used:${Number(check.opening.counted_quantity) - Number(check.closing.counted_quantity)})`
                                          )}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                                      <StatusBadge status={status} />
                                      {isAdmin && (
                                        <div className="flex gap-1">
                                          <button onClick={() => openRestock(item.id)}
                                            className="rounded-lg px-2 py-1 text-[10px] font-semibold"
                                            style={{ backgroundColor: 'rgba(184,146,42,0.1)', color: '#B8922A' }}>
                                            Restock
                                          </button>
                                          <button onClick={() => openItemForm(item)}
                                            className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600">
                                            Edit
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Count Log tab ── */}
            {activeTab === 'log' && (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="border-b border-gray-100 px-4 py-3">
                  <DateRangeSelector value={range} onChange={(r) => { setRange(r); setCheckLogs([]) }} />
                  <button onClick={fetchCheckLogs}
                    className="mt-3 w-full rounded-xl py-2 text-sm font-semibold text-white"
                    style={{ backgroundColor: '#B8922A' }}>
                    Load
                  </button>
                </div>
                {checkLoading ? (
                  <p className="py-8 text-center text-gray-400">Loading…</p>
                ) : checkLogs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No count records for this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-50 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                          <th className="px-4 py-2">Date</th>
                          <th className="px-4 py-2">Type</th>
                          <th className="px-4 py-2">Item</th>
                          <th className="px-4 py-2">Count</th>
                          <th className="px-4 py-2">Checker</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checkLogs.map((log, i) => {
                          const item = items.find((it) => it.id === log.item_id)
                          return (
                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{log.date}</td>
                              <td className="px-4 py-2.5">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  log.check_type === 'opening' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                }`}>
                                  {log.check_type}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs font-medium text-gray-800">{item?.name ?? '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-600">{log.counted_quantity} {item?.unit ?? ''}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">{log.checker_name}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Audit Log tab (admin) ── */}
            {activeTab === 'audit' && isAdmin && (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="space-y-3 border-b border-gray-100 px-4 py-3">
                  <DateRangeSelector value={range} onChange={(r) => { setRange(r); setAuditLogs([]) }} />
                  <div className="flex flex-wrap gap-2">
                    <select value={auditItemId} onChange={(e) => setAuditItemId(e.target.value)}
                      className={inputCls + ' flex-1 min-w-[160px]'}>
                      <option value="">All items</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <select value={auditAction} onChange={(e) => setAuditAction(e.target.value)}
                      className={inputCls + ' flex-1 min-w-[160px]'}>
                      {ACTION_TYPES.map((a) => (
                        <option key={a} value={a}>{a === 'all' ? 'All actions' : a.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                    <button onClick={fetchAudit}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                      style={{ backgroundColor: '#B8922A' }}>
                      Filter
                    </button>
                  </div>
                </div>
                {auditLoading ? (
                  <p className="py-8 text-center text-gray-400">Loading…</p>
                ) : auditLogs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">No audit records. Press Filter to load.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-50 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                          <th className="px-4 py-2">Time</th>
                          <th className="px-4 py-2">Item</th>
                          <th className="px-4 py-2">Action</th>
                          <th className="px-4 py-2">Field</th>
                          <th className="px-4 py-2">Change</th>
                          <th className="px-4 py-2">By</th>
                          <th className="px-4 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id} className={`border-b border-gray-50 hover:bg-gray-50 ${log.is_admin_override ? 'bg-amber-50/60' : ''}`}>
                            <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                              {new Date(log.created_at).toLocaleString('en-PH', {
                                month: 'short', day: 'numeric',
                                hour: 'numeric', minute: '2-digit', hour12: true,
                              })}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-medium text-gray-800">{log.inventory_items?.name ?? '—'}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                log.action_type === 'restock'           ? 'bg-blue-100 text-blue-700' :
                                log.action_type === 'manual_correction' ? 'bg-amber-100 text-amber-700' :
                                log.action_type === 'item_deactivated'  ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                                {log.action_type.replace(/_/g, ' ')}{log.is_admin_override ? ' ★' : ''}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{log.field_changed ?? '—'}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">
                              {log.previous_value != null && log.new_value != null
                                ? `${log.previous_value} → ${log.new_value}`
                                : log.new_value != null ? `→ ${log.new_value}` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{log.performed_by}</td>
                            <td className="px-4 py-2.5 text-xs italic text-gray-400">{log.reason ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Count Modal ── */}
        {countMode && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:px-4">
            <div className="flex w-full max-w-2xl flex-col rounded-t-3xl bg-white sm:rounded-3xl" style={{ maxHeight: '92vh' }}>
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {countMode === 'opening' ? '🌅 Opening Count' : '🌙 Closing Count'}
                  </h3>
                  <p className="text-xs text-gray-400">Enter current quantities for all items</p>
                </div>
                <CloseBtn onClick={() => setCountMode(null)} />
              </div>
              <div className="shrink-0 border-b border-gray-100 px-5 py-3">
                <label className={labelCls}>Checker Name</label>
                <input value={checkerName} onChange={(e) => setCheckerName(e.target.value)}
                  className={inputCls} placeholder="Your name" />
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {CATEGORIES.map((cat) => {
                  const catItems = (byCategory[cat] ?? []).filter((i) => i.is_active)
                  if (catItems.length === 0) return null
                  return (
                    <div key={cat} className="mb-5">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{cat}</p>
                      <div className="space-y-1.5">
                        {catItems.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                              <p className="text-[10px] text-gray-400">
                                Current: {item.current_stock} {item.unit}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <input
                                type="number" inputMode="decimal" min="0" step="0.1"
                                value={counts[item.id] ?? ''}
                                onChange={(e) => setCounts((p) => ({ ...p, [item.id]: e.target.value }))}
                                className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-right text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300"
                                placeholder="0"
                              />
                              <span className="w-8 shrink-0 text-xs text-gray-400">{item.unit}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {countError && <p className="shrink-0 px-5 py-2 text-sm text-red-600">{countError}</p>}
              <div className="shrink-0 border-t border-gray-100 px-5 py-4">
                <button onClick={submitCount} disabled={countSaving}
                  className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
                  style={{ backgroundColor: '#B8922A' }}>
                  {countSaving ? 'Saving…' : `Submit ${countMode === 'opening' ? 'Opening' : 'Closing'} Count`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Restock Modal (admin) ── */}
        {showRestock && isAdmin && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:px-4">
            <div className="w-full max-w-md rounded-t-3xl bg-white sm:rounded-3xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <h3 className="text-base font-bold text-gray-900">Restock Item</h3>
                <CloseBtn onClick={() => setShowRestock(false)} />
              </div>
              <div className="space-y-3 px-5 py-4">
                <div>
                  <label className={labelCls}>Item</label>
                  <select value={restockItemId}
                    onChange={(e) => {
                      setRestockItemId(e.target.value)
                      const it = items.find((i) => i.id === e.target.value)
                      if (it?.cost_per_unit !== undefined) setRestockCpu(String(it.cost_per_unit))
                    }}
                    className={inputCls}>
                    <option value="">— Select item —</option>
                    {CATEGORIES.map((cat) => (
                      <optgroup key={cat} label={cat}>
                        {(byCategory[cat] ?? []).map((i) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Quantity</label>
                    <input type="number" inputMode="decimal" min="0" value={restockQty}
                      onChange={(e) => setRestockQty(e.target.value)} className={inputCls} placeholder="0" />
                  </div>
                  <div>
                    <label className={labelCls}>Cost/Unit (₱)</label>
                    <input type="number" inputMode="decimal" min="0" value={restockCpu}
                      onChange={(e) => setRestockCpu(e.target.value)} className={inputCls} placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Date</label>
                    <input type="date" value={restockDate} onChange={(e) => setRestockDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Payment</label>
                    <select value={restockPayment} onChange={(e) => setRestockPayment(e.target.value)} className={inputCls}>
                      {['Cash', 'GCash', 'Card', 'Transfer'].map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Notes (optional)</label>
                  <input type="text" value={restockNotes} onChange={(e) => setRestockNotes(e.target.value)}
                    className={inputCls} placeholder="Supplier, batch, etc." />
                </div>
                {restockItemId && restockQty && restockCpu && (
                  <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-gray-600">
                    Total: <span className="font-bold text-gray-900">{formatPHP(Number(restockQty) * Number(restockCpu))}</span>
                    {' — will be logged as a Supplies expense'}
                  </div>
                )}
                {restockError && <p className="text-sm text-red-600">{restockError}</p>}
                <button onClick={submitRestock} disabled={restockSaving}
                  className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
                  style={{ backgroundColor: '#B8922A' }}>
                  {restockSaving ? 'Saving…' : 'Confirm Restock'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Item Form Modal (admin) ── */}
        {showItemForm && isAdmin && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:px-4">
            <div className="w-full max-w-md rounded-t-3xl bg-white sm:rounded-3xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <h3 className="text-base font-bold text-gray-900">{editingItem ? 'Edit Item' : 'Add Item'}</h3>
                <CloseBtn onClick={() => setShowItemForm(false)} />
              </div>
              <div className="space-y-3 px-5 py-4">
                <div>
                  <label className={labelCls}>Name</label>
                  <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)}
                    className={inputCls} placeholder="Item name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Category</label>
                    <select value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} className={inputCls}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Unit</label>
                    <select value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} className={inputCls}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Low Stock Threshold</label>
                    <input type="number" min="0" value={itemThreshold}
                      onChange={(e) => setItemThreshold(e.target.value)} className={inputCls} placeholder="e.g. 5" />
                  </div>
                  <div>
                    <label className={labelCls}>Reorder Qty</label>
                    <input type="number" min="0" value={itemReorder}
                      onChange={(e) => setItemReorder(e.target.value)} className={inputCls} placeholder="e.g. 10" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Cost per Unit (₱)</label>
                  <input type="number" inputMode="decimal" min="0" value={itemCpu}
                    onChange={(e) => setItemCpu(e.target.value)} className={inputCls} placeholder="0.00" />
                </div>
                {itemError && <p className="text-sm text-red-600">{itemError}</p>}
                <div className="flex gap-2">
                  <button onClick={submitItemForm} disabled={itemSaving}
                    className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-60"
                    style={{ backgroundColor: '#B8922A' }}>
                    {itemSaving ? 'Saving…' : editingItem ? 'Update' : 'Add Item'}
                  </button>
                  {editingItem && (
                    <button onClick={() => deactivateItem(editingItem.id)}
                      className="rounded-xl border border-red-200 px-4 py-3 text-xs font-semibold text-red-500 hover:bg-red-50">
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admin override modal (past-day corrections) */}
        <AdminOverrideModal
          open={overrideOpen}
          onClose={() => { setOverrideOpen(false); setPendingAction(null) }}
          onGranted={() => { pendingAction?.(); setPendingAction(null) }}
          actionLabel="Submit past-day correction"
        />

      </div>
    </div>
  )
}
