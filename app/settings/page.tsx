'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceRow        { id: number; size_category: string; base_price: number }
interface ServiceRow      { id: number; name: string; is_active: boolean }
interface ServicePriceRow { service_name: string; size_category: string; price: number }
interface PaymentRow      { id: number; name: string; default_status: string; is_active: boolean }
interface EmployeeRow {
  id: number; full_name: string; last_name: string | null; position: string
  rest_day: string; shirt_size: string; boots_size: string; is_active: boolean
}
interface PayableRow { id: number; name: string; amount: number; due_day: number | null; category: string }
interface ProfileRow {
  id: string; business_name: string; branch: string; address: string
  contact: string; email: string; gcash_merchant: string; maya_merchant: string; bpi_account: string
}

type Section = 'price_list' | 'services' | 'payment_methods' | 'employees' | 'payables' | 'profile' | 'teams' | 'backup'

// ─── Shared UI helpers ────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'

const btnPrimary =
  'rounded-lg bg-[#B8922A] px-4 py-2.5 text-sm font-semibold text-white ' +
  'hover:bg-[#D4AB4E] transition-colors disabled:opacity-50 active:scale-95'

const btnSecondary =
  'rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 ' +
  'hover:bg-gray-50 transition-colors active:scale-95'

function SaveBar({ saving, saved, error, onSave }: {
  saving: boolean; saved: boolean; error: string; onSave: () => void
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button onClick={onSave} disabled={saving} className={btnPrimary}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
      {saved && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
      {error && <span className="text-sm text-red-500">{error}</span>}
    </div>
  )
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-5 text-lg font-bold text-gray-900">{children}</h2>
}

function ConfirmModal({ title, message, note, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }: {
  title: string; message: React.ReactNode; note?: string
  confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 sm:items-center sm:px-4">
      <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-sm sm:rounded-2xl">
        <h3 className="mb-2 text-base font-bold text-gray-900">{title}</h3>
        <p className="mb-2 text-sm text-gray-500">{message}</p>
        {note && <p className="mb-5 text-xs text-gray-400">{note}</p>}
        {!note && <div className="mb-5" />}
        <div className="flex gap-3">
          <button onClick={onConfirm}
            className={`flex-1 rounded-xl py-3.5 text-sm font-semibold text-white ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-[#B8922A] hover:bg-[#D4AB4E]'}`}>
            {confirmLabel}
          </button>
          <button onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Panel: Price List ────────────────────────────────────────────────────────

function PriceListPanel({ onDirty }: { onDirty: () => void }) {
  const [rows, setRows]     = useState<PriceRow[]>([])
  const [prices, setPrices] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    supabase.from('price_list').select('id, size_category, base_price').order('sort_order')
      .then(({ data }) => {
        if (data) {
          setRows(data)
          const map: Record<number, string> = {}
          data.forEach((r) => { map[r.id] = String(r.base_price) })
          setPrices(map)
        }
      })
  }, [])

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    for (const row of rows) {
      const val = parseFloat(prices[row.id])
      if (isNaN(val)) continue
      const { error: e } = await supabase.from('price_list').update({ base_price: val }).eq('id', row.id)
      if (e) { setError(e.message); setSaving(false); return }
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div>
      <PanelTitle>Price List</PanelTitle>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm font-medium text-gray-700">{row.size_category}</span>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
              <input type="number" inputMode="decimal" min="0" step="0.01"
                value={prices[row.id] ?? ''}
                onChange={(e) => { setPrices((p) => ({ ...p, [row.id]: e.target.value })); onDirty() }}
                className={`${inputCls} pl-7`} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6"><SaveBar saving={saving} saved={saved} error={error} onSave={save} /></div>
    </div>
  )
}

// ─── Panel: Services ─────────────────────────────────────────────────────────

function ServicesPanel({ onDirty }: { onDirty: () => void }) {
  const [rows, setRows]                     = useState<ServiceRow[]>([])
  const [sizeCategories, setSizeCategories] = useState<string[]>([])
  const [allServicePrices, setAllServicePrices] = useState<ServicePriceRow[]>([])
  const [expandedId, setExpandedId]         = useState<number | null>(null)
  const [editPrices, setEditPrices]         = useState<Record<string, string>>({})
  const [matrixSaving, setMatrixSaving]     = useState(false)
  const [matrixError, setMatrixError]       = useState('')
  const [matrixSaved, setMatrixSaved]       = useState(false)
  const [newName, setNewName]               = useState('')
  const [adding, setAdding]                 = useState(false)
  const [addError, setAddError]             = useState('')
  const [confirmDelete, setConfirmDelete]   = useState<ServiceRow | null>(null)

  const loadData = useCallback(async () => {
    const [{ data: svData }, { data: plData }, { data: spData }] = await Promise.all([
      supabase.from('services').select('id, name, is_active').order('id'),
      supabase.from('price_list').select('size_category').eq('is_active', true).order('sort_order'),
      supabase.from('service_prices').select('service_name, size_category, price'),
    ])
    if (svData) setRows(svData)
    if (plData) setSizeCategories(plData.map((r) => r.size_category))
    if (spData) setAllServicePrices(spData)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function openMatrix(row: ServiceRow) {
    if (expandedId === row.id) { setExpandedId(null); return }
    setExpandedId(row.id); setMatrixError(''); setMatrixSaved(false)
    const seed: Record<string, string> = {}
    sizeCategories.forEach((sz) => {
      const match = allServicePrices.find((sp) => sp.service_name === row.name && sp.size_category === sz)
      seed[sz] = match ? String(match.price) : ''
    })
    setEditPrices(seed)
  }

  async function saveMatrix(row: ServiceRow) {
    setMatrixSaving(true); setMatrixError(''); setMatrixSaved(false)
    for (const sz of sizeCategories) {
      const val = parseFloat(editPrices[sz])
      if (isNaN(val)) continue
      const exists = allServicePrices.some((sp) => sp.service_name === row.name && sp.size_category === sz)
      const { error: e } = exists
        ? await supabase.from('service_prices').update({ price: val }).eq('service_name', row.name).eq('size_category', sz)
        : await supabase.from('service_prices').insert({ service_name: row.name, size_category: sz, price: val })
      if (e) { setMatrixError(e.message); setMatrixSaving(false); return }
    }
    setMatrixSaving(false); setMatrixSaved(true); setTimeout(() => setMatrixSaved(false), 3000); loadData()
  }

  async function toggle(row: ServiceRow) {
    const updated = !row.is_active
    setRows((r) => r.map((s) => s.id === row.id ? { ...s, is_active: updated } : s))
    await supabase.from('services').update({ is_active: updated }).eq('id', row.id)
  }

  async function deleteService(row: ServiceRow) {
    await supabase.from('services').delete().eq('id', row.id)
    setConfirmDelete(null); loadData()
  }

  async function addService() {
    if (!newName.trim()) return
    setAdding(true); setAddError('')
    const { error: e } = await supabase.from('services').insert({ name: newName.trim(), is_active: true })
    setAdding(false)
    if (e) { setAddError(e.message); return }
    setNewName(''); loadData()
  }

  const isOthers = (name: string) => name.trim().toLowerCase() === 'others'

  return (
    <div>
      <PanelTitle>Services</PanelTitle>
      {confirmDelete && (
        <ConfirmModal title="Delete Service"
          message={<>Delete <strong>{confirmDelete.name}</strong>? This cannot be undone.</>}
          confirmLabel="Delete" onConfirm={() => deleteService(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-gray-100 bg-white">
            <div className="flex items-center justify-between px-4 py-3">
              <span className={`text-sm font-medium ${row.is_active ? 'text-gray-800' : 'text-gray-400'}`}>{row.name}</span>
              <div className="flex items-center gap-3">
                {!isOthers(row.name) ? (
                  <button onClick={() => { openMatrix(row); onDirty() }}
                    className="text-xs font-medium text-[#B8922A]">
                    {expandedId === row.id ? 'Hide' : 'Prices'}
                  </button>
                ) : <span className="text-xs italic text-gray-400">–</span>}
                <button onClick={() => toggle(row)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${row.is_active ? 'bg-[#B8922A]' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${row.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <button onClick={() => setConfirmDelete(row)} className="text-xs font-medium text-red-400">Del</button>
              </div>
            </div>
            {expandedId === row.id && !isOthers(row.name) && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Price per Size</p>
                <div className="grid grid-cols-2 gap-3">
                  {sizeCategories.map((sz) => (
                    <div key={sz}>
                      <label className="mb-1 block text-xs font-medium text-gray-500">{sz}</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₱</span>
                        <input type="number" inputMode="decimal" min="0" step="0.01"
                          value={editPrices[sz] ?? ''}
                          onChange={(e) => { setEditPrices((p) => ({ ...p, [sz]: e.target.value })); onDirty() }}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-6 pr-2 text-sm focus:border-[#B8922A] focus:outline-none" />
                      </div>
                    </div>
                  ))}
                </div>
                {matrixError && <p className="mt-2 text-sm text-red-500">{matrixError}</p>}
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={() => saveMatrix(row)} disabled={matrixSaving} className={btnPrimary}>
                    {matrixSaving ? 'Saving…' : 'Save Prices'}
                  </button>
                  {matrixSaved && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
                  <button onClick={() => setExpandedId(null)} className={btnSecondary}>Close</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <input type="text" placeholder="New service name…" value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addService()} className={inputCls} />
        <button onClick={addService} disabled={adding || !newName.trim()} className={`${btnPrimary} shrink-0`}>Add</button>
      </div>
      {addError && <p className="mt-2 text-sm text-red-500">{addError}</p>}
    </div>
  )
}

// ─── Panel: Payment Methods ───────────────────────────────────────────────────

function PaymentMethodsPanel() {
  const [rows, setRows]         = useState<PaymentRow[]>([])
  const [statuses, setStatuses] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    const { data } = await supabase.from('payment_methods').select('id, name, default_status, is_active').order('sort_order')
    if (data) {
      setRows(data)
      const map: Record<number, string> = {}
      data.forEach((r) => { map[r.id] = r.default_status })
      setStatuses(map)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(row: PaymentRow) {
    const updated = !row.is_active
    setRows((r) => r.map((m) => m.id === row.id ? { ...m, is_active: updated } : m))
    await supabase.from('payment_methods').update({ is_active: updated }).eq('id', row.id)
  }

  async function saveStatus(row: PaymentRow) {
    await supabase.from('payment_methods').update({ default_status: statuses[row.id] }).eq('id', row.id)
  }

  return (
    <div>
      <PanelTitle>Payment Methods</PanelTitle>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
            <span className={`w-16 shrink-0 text-sm font-semibold ${row.is_active ? 'text-gray-800' : 'text-gray-400'}`}>{row.name}</span>
            <select value={statuses[row.id] ?? row.default_status}
              onChange={(e) => setStatuses((s) => ({ ...s, [row.id]: e.target.value }))}
              onBlur={() => saveStatus(row)}
              className="rounded-lg border border-gray-200 px-2 py-2 text-sm focus:outline-none">
              <option value="On Hand">On Hand</option>
              <option value="Deposited">Deposited</option>
            </select>
            <span className="ml-auto text-xs text-gray-400">Active</span>
            <button onClick={() => toggleActive(row)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${row.is_active ? 'bg-[#B8922A]' : 'bg-gray-200'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${row.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-400">Default status saves automatically on change.</p>
    </div>
  )
}

// ─── Panel: Employees ─────────────────────────────────────────────────────────

const EMPTY_EMP = { full_name: '', last_name: '', position: '', rest_day: '', shirt_size: '', boots_size: '', is_active: true }

function EmployeesPanel({ onDirty }: { onDirty: () => void }) {
  const [rows, setRows]     = useState<EmployeeRow[]>([])
  const [editId, setEditId] = useState<number | 'new' | null>(null)
  const [form, setForm]     = useState(EMPTY_EMP)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState<EmployeeRow | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('employees')
      .select('id, full_name, last_name, position, rest_day, shirt_size, boots_size, is_active').order('full_name')
    if (data) setRows(data)
  }, [])

  useEffect(() => { load() }, [load])

  function startEdit(row: EmployeeRow) {
    setEditId(row.id)
    setForm({ full_name: row.full_name, last_name: row.last_name ?? '', position: row.position,
      rest_day: row.rest_day, shirt_size: row.shirt_size, boots_size: row.boots_size, is_active: row.is_active })
    setError('')
  }

  async function deactivateEmployee(row: EmployeeRow) {
    await supabase.from('employees').update({ is_active: false }).eq('id', row.id)
    setConfirmDeactivate(null); load()
  }

  async function saveEmployee() {
    if (!form.full_name.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')
    const { error: e } = editId === 'new'
      ? await supabase.from('employees').insert(form)
      : await supabase.from('employees').update(form).eq('id', editId)
    setSaving(false)
    if (e) { setError(e.message); return }
    setEditId(null); load()
  }

  const EmpForm = (
    <div className="rounded-xl border border-[#B8922A]/30 bg-amber-50/40 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">First Name *</label>
          <input value={form.full_name} onChange={(e) => { setForm((f) => ({ ...f, full_name: e.target.value })); onDirty() }} className={inputCls} placeholder="Allen" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Last Name</label>
          <input value={form.last_name ?? ''} onChange={(e) => { setForm((f) => ({ ...f, last_name: e.target.value })); onDirty() }} className={inputCls} placeholder="Flores" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Position</label>
          <input value={form.position} onChange={(e) => { setForm((f) => ({ ...f, position: e.target.value })); onDirty() }} className={inputCls} placeholder="Washer" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Rest Day</label>
          <input value={form.rest_day} onChange={(e) => { setForm((f) => ({ ...f, rest_day: e.target.value })); onDirty() }} className={inputCls} placeholder="Sunday" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Shirt Size</label>
          <input value={form.shirt_size} onChange={(e) => { setForm((f) => ({ ...f, shirt_size: e.target.value })); onDirty() }} className={inputCls} placeholder="M" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Boots Size</label>
          <input value={form.boots_size} onChange={(e) => { setForm((f) => ({ ...f, boots_size: e.target.value })); onDirty() }} className={inputCls} placeholder="42" />
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={saveEmployee} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={() => setEditId(null)} className={btnSecondary}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div>
      {confirmDeactivate && (
        <ConfirmModal title="Remove Employee"
          message={<>Delete <strong>{confirmDeactivate.full_name}</strong>?</>}
          note="Kept for historical records but marked as inactive."
          confirmLabel="Remove" onConfirm={() => deactivateEmployee(confirmDeactivate)} onCancel={() => setConfirmDeactivate(null)} />
      )}
      <div className="mb-5 flex items-center justify-between">
        <PanelTitle>Employees</PanelTitle>
        {editId !== 'new' && (
          <button onClick={() => { setEditId('new'); setForm(EMPTY_EMP); setError('') }} className={btnPrimary}>+ Add</button>
        )}
      </div>
      {editId === 'new' && <div className="mb-5">{EmpForm}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id} className={`rounded-xl border bg-white p-4 ${row.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'}`}>
            {editId === row.id ? EmpForm : (
              <>
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{row.full_name}</p>
                      {!row.is_active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">Inactive</span>}
                    </div>
                    <p className="text-xs text-gray-400">{row.position}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(row)} className="text-xs font-medium text-[#B8922A]">Edit</button>
                    {row.is_active && <button onClick={() => setConfirmDeactivate(row)} className="text-xs font-medium text-red-400">Del</button>}
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>🗓 {row.rest_day || '—'}</span>
                  <span>👕 {row.shirt_size || '—'}</span>
                  <span>🥾 {row.boots_size || '—'}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Panel: Payables ──────────────────────────────────────────────────────────

const EMPTY_PAYABLE = { name: '', amount: '', due_day: '', category: 'Utilities' }
const PAYABLE_CATEGORIES = ['Utilities', 'Rent', 'Salary', 'Supplies', 'Equipment', 'Misc']

function PayablesPanel({ onDirty }: { onDirty: () => void }) {
  const [rows, setRows]     = useState<PayableRow[]>([])
  const [editId, setEditId] = useState<number | 'new' | null>(null)
  const [form, setForm]     = useState(EMPTY_PAYABLE)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('payables').select('id, name, amount, due_day, category').order('name')
    if (data) setRows(data)
  }, [])

  useEffect(() => { load() }, [load])

  function startEdit(row: PayableRow) {
    setEditId(row.id)
    setForm({ name: row.name, amount: String(row.amount), due_day: row.due_day != null ? String(row.due_day) : '', category: row.category })
    setError('')
  }

  async function savePayable() {
    if (!form.name.trim() || !form.amount) { setError('Name and amount are required.'); return }
    setSaving(true); setError('')
    const payload = { name: form.name.trim(), amount: parseFloat(form.amount), due_day: form.due_day ? parseInt(form.due_day) : null, category: form.category }
    const { error: e } = editId === 'new'
      ? await supabase.from('payables').insert(payload)
      : await supabase.from('payables').update(payload).eq('id', editId)
    setSaving(false)
    if (e) { setError(e.message); return }
    setEditId(null); load()
  }

  const total = rows.reduce((s, r) => s + r.amount, 0)

  const PayableForm = (
    <div className="rounded-xl border border-[#B8922A]/30 bg-amber-50/40 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Name *</label>
          <input value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); onDirty() }} className={inputCls} placeholder="Electric Bill" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Amount (₱) *</label>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={form.amount}
            onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); onDirty() }} className={inputCls} placeholder="0.00" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Due Day</label>
          <input type="number" inputMode="numeric" min="1" max="31" value={form.due_day}
            onChange={(e) => setForm((f) => ({ ...f, due_day: e.target.value }))} className={inputCls} placeholder="1–31" />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
          <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputCls}>
            {PAYABLE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={savePayable} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={() => setEditId(null)} className={btnSecondary}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <PanelTitle>Payables</PanelTitle>
        {editId !== 'new' && <button onClick={() => { setEditId('new'); setForm(EMPTY_PAYABLE); setError('') }} className={btnPrimary}>+ Add</button>}
      </div>
      {editId === 'new' && <div className="mb-5">{PayableForm}</div>}
      {/* Card list on mobile instead of table */}
      <div className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <React.Fragment key={row.id}>
            <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{row.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{row.category} {row.due_day ? `· Due day ${row.due_day}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900 text-sm">₱{row.amount.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                  <button onClick={() => startEdit(row)} className="text-xs font-medium text-[#B8922A]">Edit</button>
                </div>
              </div>
            </div>
            {editId === row.id && <div className="px-1">{PayableForm}</div>}
          </React.Fragment>
        ))}
        <div className="rounded-xl border-t-2 border-gray-200 px-4 py-3 flex justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Monthly Total</span>
          <span className="font-bold text-gray-900">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
      {/* Full table on desktop */}
      <div className="hidden sm:block max-w-xl overflow-hidden rounded-xl border border-gray-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Due Day</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{row.name}</td>
                  <td className="px-4 py-3 text-gray-500">{row.category}</td>
                  <td className="px-4 py-3 text-gray-500">{row.due_day ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">₱{row.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => startEdit(row)} className="text-xs font-medium text-[#B8922A]">Edit</button></td>
                </tr>
                {editId === row.id && <tr><td colSpan={5} className="px-4 py-3">{PayableForm}</td></tr>}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-100">
              <td colSpan={3} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Total Monthly</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Panel: Business Profile ──────────────────────────────────────────────────

const PROFILE_FIELDS: { key: keyof ProfileRow; label: string; placeholder: string }[] = [
  { key: 'business_name',  label: 'Business Name',      placeholder: 'Primera Auto Studio' },
  { key: 'branch',         label: 'Branch',             placeholder: 'e.g. Main Branch' },
  { key: 'address',        label: 'Address',            placeholder: 'Full address' },
  { key: 'contact',        label: 'Contact Number',     placeholder: 'e.g. 09XX XXX XXXX' },
  { key: 'email',          label: 'Email',              placeholder: 'email@example.com' },
  { key: 'gcash_merchant', label: 'GCash Merchant No.', placeholder: 'GCash number' },
  { key: 'maya_merchant',  label: 'Maya Merchant No.',  placeholder: 'Maya number' },
  { key: 'bpi_account',    label: 'BPI Account No.',    placeholder: 'BPI account number' },
]

const EMPTY_PROFILE: ProfileRow = {
  id: '1', business_name: '', branch: '', address: '',
  contact: '', email: '', gcash_merchant: '', maya_merchant: '', bpi_account: '',
}

function BusinessProfilePanel({ onDirty }: { onDirty: () => void }) {
  const [profile, setProfile] = useState<ProfileRow>(EMPTY_PROFILE)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', '1').single().then(({ data }) => { if (data) setProfile(data) })
  }, [])

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    const { error: e } = await supabase.from('settings').update(profile).eq('id', '1')
    setSaving(false)
    if (e) { setError(e.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div>
      <PanelTitle>Business Profile</PanelTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PROFILE_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className={key === 'address' ? 'sm:col-span-2' : ''}>
            <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
            <input type="text" value={(profile[key] as string) ?? ''}
              onChange={(e) => { setProfile((p) => ({ ...p, [key]: e.target.value })); onDirty() }}
              placeholder={placeholder} className={inputCls} />
          </div>
        ))}
      </div>
      <div className="mt-6"><SaveBar saving={saving} saved={saved} error={error} onSave={save} /></div>
    </div>
  )
}

// ─── Panel: Teams ─────────────────────────────────────────────────────────────

function TeamsPanel() {
  const [draft, setDraft]   = useState<string[]>(['Team A', 'Team B', 'Team C', 'Team D'])
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    supabase.from('settings').select('teams').eq('id', '1').single()
      .then(({ data }) => { if (data?.teams) setDraft(data.teams) })
  }, [])

  function updateTeam(i: number, val: string) { setDraft((d) => d.map((t, idx) => idx === i ? val : t)) }
  function addTeam() { setDraft((d) => [...d, `Team ${String.fromCharCode(65 + d.length)}`]) }
  function removeTeam(i: number) { if (draft.length <= 1) return; setDraft((d) => d.filter((_, idx) => idx !== i)) }

  async function save() {
    const clean = draft.map((t) => t.trim()).filter(Boolean)
    if (clean.length === 0) { setError('At least one team is required.'); return }
    setSaving(true); setError('')
    const { error: e } = await supabase.from('settings').update({ teams: clean }).eq('id', '1')
    setSaving(false)
    if (e) { setError(e.message); return }
    setDraft(clean); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div>
      <PanelTitle>Teams</PanelTitle>
      <p className="mb-5 text-sm text-gray-500">
        Configure team names for the competition tracker. Appears in Check-In and the Dashboard leaderboard.
      </p>
      <div className="space-y-3">
        {draft.map((team, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: ['#B8922A', '#D4AB4E', '#7C5C1E', '#A0845C', '#6B4F2A'][i % 5] }}>
              {i + 1}
            </div>
            <input type="text" value={team} onChange={(e) => updateTeam(i, e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20"
              placeholder={`Team ${String.fromCharCode(65 + i)}`} />
            <button onClick={() => removeTeam(i)} disabled={draft.length <= 1}
              className="text-sm font-medium text-red-400 hover:text-red-600 disabled:opacity-30 px-1">✕</button>
          </div>
        ))}
        <button onClick={addTeam}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-[#B8922A] hover:text-[#B8922A] transition-colors">
          + Add Team
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs font-semibold text-gray-600 mb-1">How teams work</p>
        <p className="text-xs text-gray-500">Assign a team per car during check-in. Leaderboard tracks carwashes, add-ons, and revenue per team.</p>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save Teams'}</button>
        {saved && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
      </div>
    </div>
  )
}

// ─── Panel: Backup ────────────────────────────────────────────────────────────

function BackupPanel() {
  const [loading, setLoading]       = useState(false)
  const [status, setStatus]         = useState('')
  const [error, setError]           = useState('')
  const [lastBackup, setLastBackup] = useState<string | null>(null)

  const TABLES = ['transactions', 'expenses', 'employees', 'payables', 'services', 'price_list', 'service_prices', 'payment_methods', 'loyalty_cards', 'settings']

  function toCSV(data: Record<string, unknown>[]): string {
    if (!data.length) return ''
    const headers = Object.keys(data[0])
    const rows = data.map((row) =>
      headers.map((h) => {
        const val = row[h]
        if (val === null || val === undefined) return ''
        const str = String(val)
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str
      }).join(',')
    )
    return [headers.join(','), ...rows].join('\n')
  }

  async function downloadBackup(format: 'xlsx' | 'csv') {
    setLoading(true); setStatus('Fetching data…'); setError('')
    try {
      const results: Record<string, Record<string, unknown>[]> = {}
      for (const table of TABLES) {
        setStatus(`Fetching ${table}…`)
        const { data, error: e } = await supabase.from(table).select('*')
        if (e) throw new Error(`Failed to fetch ${table}: ${e.message}`)
        results[table] = data ?? []
      }
      const now = new Date()
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const filename = `primera-backup-${dateStr}`
      if (format === 'csv') {
        setStatus('Generating CSV files…')
        for (const table of TABLES) {
          const csv = toCSV(results[table])
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url; link.download = `${filename}-${table}.csv`
          document.body.appendChild(link); link.click()
          document.body.removeChild(link); URL.revokeObjectURL(url)
        }
      } else {
        setStatus('Generating Excel file…')
        const XLSX = await import('xlsx')
        const wb = XLSX.utils.book_new()
        for (const table of TABLES) {
          const ws = XLSX.utils.json_to_sheet(results[table])
          XLSX.utils.book_append_sheet(wb, ws, table)
        }
        XLSX.writeFile(wb, `${filename}.xlsx`)
      }
      setLastBackup(new Date().toLocaleString('en-PH')); setStatus('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Backup failed'); setStatus('')
    }
    setLoading(false)
  }

  return (
    <div>
      <PanelTitle>Data Backup</PanelTitle>
      <div className="space-y-5">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-800">What gets backed up</p>
          <p className="mt-1 text-xs text-blue-600">All 10 tables — transactions, expenses, employees, payables, services, prices, payment methods, loyalty cards, and settings.</p>
          <p className="mt-2 text-xs text-blue-500">Recommend: back up monthly and store in Google Drive.</p>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">Download as:</p>
          <button onClick={() => downloadBackup('xlsx')} disabled={loading} className={`${btnPrimary} w-full flex items-center justify-center gap-2`}>
            {loading ? <span className="animate-pulse">{status || 'Working…'}</span> : <>📊 Excel (.xlsx) — All tables in one file</>}
          </button>
          <button onClick={() => downloadBackup('csv')} disabled={loading} className={`${btnSecondary} w-full flex items-center justify-center gap-2`}>
            {loading ? '…' : '📄 CSV — Separate file per table'}
          </button>
        </div>
        {status && !error && <div className="flex items-center gap-2 text-sm text-[#B8922A]"><span className="animate-spin">⟳</span><span>{status}</span></div>}
        {error && <p className="text-sm text-red-500">⚠ {error}</p>}
        {lastBackup && !loading && <p className="text-xs text-green-600">✓ Last backup: {lastBackup}</p>}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-semibold text-gray-600">Also recommended</p>
          <p className="mt-1 text-xs text-gray-500">Supabase → Settings → Backups for a full database backup.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const SECTIONS: { id: Section; label: string; short: string }[] = [
  { id: 'price_list',      label: 'Price List',       short: 'Prices'   },
  { id: 'services',        label: 'Services',          short: 'Services' },
  { id: 'payment_methods', label: 'Payment Methods',   short: 'Payments' },
  { id: 'employees',       label: 'Employees',         short: 'Staff'    },
  { id: 'payables',        label: 'Payables',          short: 'Payables' },
  { id: 'profile',         label: 'Business Profile',  short: 'Profile'  },
  { id: 'teams',           label: '🏆 Teams',          short: 'Teams'    },
  { id: 'backup',          label: '⬇ Backup',          short: 'Backup'   },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive]             = useState<Section>('price_list')
  const [isDirty, setIsDirty]           = useState(false)
  const [pendingSection, setPendingSection] = useState<Section | null>(null)
  const [showLeaveWarning, setShowLeaveWarning] = useState(false)
  const tabsRef = useRef<HTMLDivElement>(null)

  const markDirty = useCallback(() => setIsDirty(true), [])

  function handleNavClick(id: Section) {
    if (id === active) return
    if (isDirty) { setPendingSection(id); setShowLeaveWarning(true) }
    else setActive(id)
  }

  function confirmLeave() {
    if (pendingSection) setActive(pendingSection)
    setPendingSection(null); setShowLeaveWarning(false); setIsDirty(false)
  }

  function cancelLeave() { setPendingSection(null); setShowLeaveWarning(false) }

  // Auto-scroll active tab into view on mobile
  useEffect(() => {
    if (!tabsRef.current) return
    const activeBtn = tabsRef.current.querySelector('[data-active="true"]') as HTMLElement
    if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [active])

  return (
    <div className="px-3 py-4 pb-28 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl">
        {showLeaveWarning && (
          <ConfirmModal title="Unsaved Changes"
            message="You have unsaved changes. Leave without saving?"
            confirmLabel="Leave Without Saving" danger={false}
            onConfirm={confirmLeave} onCancel={cancelLeave} />
        )}

        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Settings</h1>
          <p className="text-sm text-gray-400">Manage pricing, staff, and business details</p>
        </div>

        {/* ── MOBILE: Horizontal scrollable pill tabs ── */}
        <div ref={tabsRef}
          className="mb-4 flex gap-2 overflow-x-auto pb-2 sm:hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {SECTIONS.map(({ id, short }) => {
            const isActive = active === id
            return (
              <button key={id}
                data-active={isActive}
                onClick={() => handleNavClick(id)}
                className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: isActive ? '#B8922A' : '#f3f4f6',
                  color:           isActive ? '#fff' : '#6b7280',
                }}>
                {short}
              </button>
            )
          })}
        </div>

        {/* ── DESKTOP: Side nav + panel ── */}
        <div className="flex gap-6">
          {/* Left nav — desktop only */}
          <nav className="hidden w-48 shrink-0 sm:block">
            <ul className="space-y-0.5">
              {SECTIONS.map(({ id, label }) => {
                const isActive = active === id
                return (
                  <li key={id}>
                    {id === 'teams'  && <div className="my-2 border-t border-gray-100" />}
                    {id === 'backup' && <div className="my-1" />}
                    <button onClick={() => handleNavClick(id)}
                      className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors"
                      style={{
                        color:           isActive ? '#B8922A' : '#6b7280',
                        backgroundColor: isActive ? 'rgba(184,146,42,0.08)' : 'transparent',
                        borderLeft:      isActive ? '2px solid #B8922A' : '2px solid transparent',
                      }}>
                      {label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Panel — full width on mobile, right side on desktop */}
          <div className="min-w-0 flex-1 rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            {active === 'price_list'      && <PriceListPanel      onDirty={markDirty} />}
            {active === 'services'        && <ServicesPanel        onDirty={markDirty} />}
            {active === 'payment_methods' && <PaymentMethodsPanel />}
            {active === 'employees'       && <EmployeesPanel       onDirty={markDirty} />}
            {active === 'payables'        && <PayablesPanel        onDirty={markDirty} />}
            {active === 'profile'         && <BusinessProfilePanel onDirty={markDirty} />}
            {active === 'teams'           && <TeamsPanel />}
            {active === 'backup'          && <BackupPanel />}
          </div>
        </div>
      </div>

      {/* Unsaved changes banner — full width on mobile */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between border-t border-amber-200 bg-amber-50 px-4 py-3 shadow-lg sm:left-[220px] sm:px-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-sm font-medium text-amber-800">Unsaved changes</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsDirty(false)} className="text-xs text-amber-600 hover:text-amber-800 underline">Discard</button>
            <span className="hidden text-xs text-amber-400 sm:inline">Use Save button in panel</span>
          </div>
        </div>
      )}
    </div>
  )
}