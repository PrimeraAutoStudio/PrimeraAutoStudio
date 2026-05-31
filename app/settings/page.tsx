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
interface PayableRow {
  id: number; name: string; amount: number; due_day: number | null; category: string
}
interface ProfileRow {
  id: string; business_name: string; branch: string; address: string
  contact: string; email: string; gcash_merchant: string
  maya_merchant: string; bpi_account: string
}

type Section = 'price_list' | 'services' | 'payment_methods' | 'employees' | 'payables' | 'profile'

// ─── Shared UI helpers ────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'

const btnPrimary =
  'rounded-lg bg-[#B8922A] px-4 py-2 text-sm font-semibold text-white ' +
  'hover:bg-[#D4AB4E] transition-colors disabled:opacity-50'

const btnSecondary =
  'rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 ' +
  'hover:bg-gray-50 transition-colors'

function SaveBar({ saving, saved, error, onSave }: {
  saving: boolean; saved: boolean; error: string; onSave: () => void
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button onClick={onSave} disabled={saving} className={btnPrimary}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
      {saved  && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
      {error  && <span className="text-sm text-red-500">{error}</span>}
    </div>
  )
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-6 text-lg font-bold text-gray-900">{children}</h2>
}

// Inline confirmation dialog
function ConfirmModal({ title, message, note, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }: {
  title: string; message: React.ReactNode; note?: string
  confirmLabel?: string; danger?: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-2 text-base font-bold text-gray-900">{title}</h3>
        <p className="mb-2 text-sm text-gray-500">{message}</p>
        {note && <p className="mb-5 text-xs text-gray-400">{note}</p>}
        {!note && <div className="mb-5" />}
        <div className="flex gap-3">
          <button onClick={onConfirm}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-[#B8922A] hover:bg-[#D4AB4E]'}`}>
            {confirmLabel}
          </button>
          <button onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
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
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div>
      <PanelTitle>Price List</PanelTitle>
      <div className="max-w-sm space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-4">
            <span className="w-36 shrink-0 text-sm font-medium text-gray-700">{row.size_category}</span>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
              <input type="number" min="0" step="0.01"
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

// ─── Panel: Services (with price matrix) ─────────────────────────────────────

const NO_PRICE_SERVICE = 'Others'

function ServicesPanel({ onDirty }: { onDirty: () => void }) {
  const [rows, setRows]               = useState<ServiceRow[]>([])
  const [sizeCategories, setSizeCategories] = useState<string[]>([])
  const [allServicePrices, setAllServicePrices] = useState<ServicePriceRow[]>([])
  // expandedId: which service's price matrix is open
  const [expandedId, setExpandedId]   = useState<number | null>(null)
  // editPrices: local edits for the expanded service, keyed by size_category
  const [editPrices, setEditPrices]   = useState<Record<string, string>>({})
  const [matrixSaving, setMatrixSaving] = useState(false)
  const [matrixError, setMatrixError]   = useState('')
  const [matrixSaved, setMatrixSaved]   = useState(false)

  const [newName, setNewName]   = useState('')
  const [adding, setAdding]     = useState(false)
  const [addError, setAddError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<ServiceRow | null>(null)

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
    setExpandedId(row.id)
    setMatrixError(''); setMatrixSaved(false)
    // seed edit prices from loaded service_prices
    const seed: Record<string, string> = {}
    sizeCategories.forEach((sz) => {
      const match = allServicePrices.find(
        (sp) => sp.service_name === row.name && sp.size_category === sz
      )
      seed[sz] = match ? String(match.price) : ''
    })
    setEditPrices(seed)
  }

  async function saveMatrix(row: ServiceRow) {
    setMatrixSaving(true); setMatrixError(''); setMatrixSaved(false)
    for (const sz of sizeCategories) {
      const val = parseFloat(editPrices[sz])
      if (isNaN(val)) continue
      const exists = allServicePrices.some(
        (sp) => sp.service_name === row.name && sp.size_category === sz
      )
      const { error: e } = exists
        ? await supabase.from('service_prices')
            .update({ price: val })
            .eq('service_name', row.name).eq('size_category', sz)
        : await supabase.from('service_prices')
            .insert({ service_name: row.name, size_category: sz, price: val })
      if (e) { setMatrixError(e.message); setMatrixSaving(false); return }
    }
    setMatrixSaving(false); setMatrixSaved(true)
    setTimeout(() => setMatrixSaved(false), 3000)
    loadData()
  }

  async function toggle(row: ServiceRow) {
    const updated = !row.is_active
    setRows((r) => r.map((s) => s.id === row.id ? { ...s, is_active: updated } : s))
    await supabase.from('services').update({ is_active: updated }).eq('id', row.id)
  }

  async function deleteService(row: ServiceRow) {
    await supabase.from('services').delete().eq('id', row.id)
    setConfirmDelete(null)
    loadData()
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
        <ConfirmModal
          title="Delete Service"
          message={<>Are you sure you want to delete <strong>{confirmDelete.name}</strong>? This cannot be undone.</>}
          confirmLabel="Delete"
          onConfirm={() => deleteService(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="max-w-lg space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-gray-100 bg-white">
            {/* Row header */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className={`text-sm font-medium ${row.is_active ? 'text-gray-800' : 'text-gray-400'}`}>
                {row.name}
              </span>
              <div className="flex items-center gap-3">
                {/* Price matrix toggle — hide for Others */}
                {!isOthers(row.name) ? (
                  <button
                    onClick={() => { openMatrix(row); onDirty() }}
                    className="text-xs font-medium text-[#B8922A] hover:text-[#D4AB4E]"
                  >
                    {expandedId === row.id ? 'Hide Prices' : 'Edit Prices'}
                  </button>
                ) : (
                  <span className="text-xs italic text-gray-400">No fixed price</span>
                )}
                {/* Active toggle */}
                <button
                  onClick={() => toggle(row)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    row.is_active ? 'bg-[#B8922A]' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    row.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                {/* Delete */}
                <button onClick={() => setConfirmDelete(row)}
                  className="text-xs font-medium text-red-400 hover:text-red-600">
                  Delete
                </button>
              </div>
            </div>

            {/* Expanded price matrix */}
            {expandedId === row.id && !isOthers(row.name) && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Price per Size Category
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {sizeCategories.map((sz) => (
                    <div key={sz}>
                      <label className="mb-1 block text-xs font-medium text-gray-500">{sz}</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₱</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={editPrices[sz] ?? ''}
                          onChange={(e) => {
                            setEditPrices((p) => ({ ...p, [sz]: e.target.value }))
                            onDirty()
                          }}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-6 pr-2 text-sm focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20"
                        />
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

      {/* Add new service */}
      <div className="mt-6 flex max-w-md items-center gap-3">
        <input type="text" placeholder="New service name…"
          value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addService()}
          className={inputCls} />
        <button onClick={addService} disabled={adding || !newName.trim()} className={`${btnPrimary} shrink-0`}>
          Add
        </button>
      </div>
      {addError && <p className="mt-2 text-sm text-red-500">{addError}</p>}
    </div>
  )
}

// ─── Panel: Payment Methods ───────────────────────────────────────────────────

function PaymentMethodsPanel() {
  const [rows, setRows]       = useState<PaymentRow[]>([])
  const [statuses, setStatuses] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('payment_methods').select('id, name, default_status, is_active').order('sort_order')
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
      <div className="max-w-lg space-y-3">
        {rows.map((row) => (
          <div key={row.id}
            className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3">
            <span className={`w-20 shrink-0 text-sm font-semibold ${row.is_active ? 'text-gray-800' : 'text-gray-400'}`}>
              {row.name}
            </span>
            <select
              value={statuses[row.id] ?? row.default_status}
              onChange={(e) => setStatuses((s) => ({ ...s, [row.id]: e.target.value }))}
              onBlur={() => saveStatus(row)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
            >
              <option value="On Hand">On Hand</option>
              <option value="Deposited">Deposited</option>
            </select>
            <span className="ml-auto text-xs text-gray-400">Active</span>
            <button onClick={() => toggleActive(row)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                row.is_active ? 'bg-[#B8922A]' : 'bg-gray-200'
              }`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                row.is_active ? 'translate-x-6' : 'translate-x-1'
              }`} />
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
  const [rows, setRows]   = useState<EmployeeRow[]>([])
  const [editId, setEditId] = useState<number | 'new' | null>(null)
  const [form, setForm]   = useState(EMPTY_EMP)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState<EmployeeRow | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('employees')
      .select('id, full_name, last_name, position, rest_day, shirt_size, boots_size, is_active')
      .order('full_name')
    console.log('[Employees] data:', data, 'error:', err)
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
    <div className="rounded-xl border border-[#B8922A]/30 bg-amber-50/40 p-4 space-y-3 max-w-md">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">First Name *</label>
          <input value={form.full_name}
            onChange={(e) => { setForm((f) => ({ ...f, full_name: e.target.value })); onDirty() }}
            className={inputCls} placeholder="e.g. Allen" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Last Name</label>
          <input value={form.last_name ?? ''}
            onChange={(e) => { setForm((f) => ({ ...f, last_name: e.target.value })); onDirty() }}
            className={inputCls} placeholder="e.g. Flores" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Position</label>
          <input value={form.position}
            onChange={(e) => { setForm((f) => ({ ...f, position: e.target.value })); onDirty() }}
            className={inputCls} placeholder="e.g. Washer" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Rest Day</label>
          <input value={form.rest_day}
            onChange={(e) => { setForm((f) => ({ ...f, rest_day: e.target.value })); onDirty() }}
            className={inputCls} placeholder="e.g. Sunday" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Shirt Size</label>
          <input value={form.shirt_size}
            onChange={(e) => { setForm((f) => ({ ...f, shirt_size: e.target.value })); onDirty() }}
            className={inputCls} placeholder="e.g. M" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Boots Size</label>
          <input value={form.boots_size}
            onChange={(e) => { setForm((f) => ({ ...f, boots_size: e.target.value })); onDirty() }}
            className={inputCls} placeholder="e.g. 42" />
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={saveEmployee} disabled={saving} className={btnPrimary}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditId(null)} className={btnSecondary}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div>
      {confirmDeactivate && (
        <ConfirmModal
          title="Remove Employee"
          message={<>Are you sure you want to delete <strong>{confirmDeactivate.full_name}</strong>? This cannot be undone.</>}
          note="The employee record will be kept for historical records but marked as inactive."
          confirmLabel="Remove"
          onConfirm={() => deactivateEmployee(confirmDeactivate)}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}

      <div className="mb-6 flex items-center justify-between">
        <PanelTitle>Employees</PanelTitle>
        {editId !== 'new' && (
          <button onClick={() => { setEditId('new'); setForm(EMPTY_EMP); setError('') }} className={btnPrimary}>
            + Add Employee
          </button>
        )}
      </div>
      {editId === 'new' && <div className="mb-6">{EmpForm}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id}
            className={`rounded-xl border bg-white p-4 ${row.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'}`}>
            {editId === row.id ? EmpForm : (
              <>
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{row.full_name}</p>
                      {!row.is_active && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{row.position}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(row)}
                      className="text-xs font-medium text-[#B8922A] hover:text-[#D4AB4E]">Edit</button>
                    {row.is_active && (
                      <button onClick={() => setConfirmDeactivate(row)}
                        className="text-xs font-medium text-red-400 hover:text-red-600">Delete</button>
                    )}
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
    setForm({ name: row.name, amount: String(row.amount),
      due_day: row.due_day != null ? String(row.due_day) : '', category: row.category })
    setError('')
  }

  async function savePayable() {
    if (!form.name.trim() || !form.amount) { setError('Name and amount are required.'); return }
    setSaving(true); setError('')
    const payload = {
      name: form.name.trim(), amount: parseFloat(form.amount),
      due_day: form.due_day ? parseInt(form.due_day) : null, category: form.category,
    }
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
          <input value={form.name}
            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); onDirty() }}
            className={inputCls} placeholder="e.g. Electric Bill" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Amount (₱) *</label>
          <input type="number" min="0" step="0.01" value={form.amount}
            onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); onDirty() }}
            className={inputCls} placeholder="0.00" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Due Day</label>
          <input type="number" min="1" max="31" value={form.due_day}
            onChange={(e) => setForm((f) => ({ ...f, due_day: e.target.value }))}
            className={inputCls} placeholder="Day of month" />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
          <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className={inputCls}>
            {PAYABLE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={savePayable} disabled={saving} className={btnPrimary}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => setEditId(null)} className={btnSecondary}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <PanelTitle>Payables</PanelTitle>
        {editId !== 'new' && (
          <button onClick={() => { setEditId('new'); setForm(EMPTY_PAYABLE); setError('') }} className={btnPrimary}>
            + Add Payable
          </button>
        )}
      </div>
      {editId === 'new' && <div className="mb-6 max-w-md">{PayableForm}</div>}
      <div className="max-w-xl overflow-hidden rounded-xl border border-gray-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Due Day</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => (
              <React.Fragment key={row.id}>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{row.name}</td>
                  <td className="px-4 py-3 text-gray-500">{row.category}</td>
                  <td className="px-4 py-3 text-gray-500">{row.due_day ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    ₱{row.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(row)}
                      className="text-xs font-medium text-[#B8922A] hover:text-[#D4AB4E]">Edit</button>
                  </td>
                </tr>
                {editId === row.id && (
                  <tr><td colSpan={5} className="px-4 py-3">{PayableForm}</td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-100">
              <td colSpan={3} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Total Monthly Fixed Costs
              </td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">
                ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </td>
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
    supabase.from('settings').select('*').eq('id', '1').single()
      .then(({ data }) => { if (data) setProfile(data) })
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
      <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
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

// ─── Nav config ───────────────────────────────────────────────────────────────

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'price_list',      label: 'Price List' },
  { id: 'services',        label: 'Services' },
  { id: 'payment_methods', label: 'Payment Methods' },
  { id: 'employees',       label: 'Employees' },
  { id: 'payables',        label: 'Payables' },
  { id: 'profile',         label: 'Business Profile' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive]     = useState<Section>('price_list')
  const [isDirty, setIsDirty]   = useState(false)
  const [pendingSection, setPendingSection] = useState<Section | null>(null)
  const [showLeaveWarning, setShowLeaveWarning] = useState(false)

  const markDirty = useCallback(() => setIsDirty(true), [])

  function handleNavClick(id: Section) {
    if (id === active) return
    if (isDirty) {
      setPendingSection(id)
      setShowLeaveWarning(true)
    } else {
      setActive(id)
    }
  }

  function confirmLeave() {
    if (pendingSection) setActive(pendingSection)
    setPendingSection(null)
    setShowLeaveWarning(false)
    setIsDirty(false)
  }

  function cancelLeave() {
    setPendingSection(null)
    setShowLeaveWarning(false)
  }

  function handleSaved() {
    setIsDirty(false)
  }

  return (
    <div className="px-6 py-6 pb-28">
      <div className="mx-auto max-w-5xl">

        {/* Leave-without-saving confirmation */}
        {showLeaveWarning && (
          <ConfirmModal
            title="Unsaved Changes"
            message="You have unsaved changes. Are you sure you want to leave without saving?"
            confirmLabel="Leave Without Saving"
            danger={false}
            onConfirm={confirmLeave}
            onCancel={cancelLeave}
          />
        )}

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-400">Manage pricing, staff, and business details</p>
        </div>

        <div className="flex gap-6">
          {/* Left sub-nav */}
          <nav className="w-44 shrink-0">
            <ul className="space-y-0.5">
              {SECTIONS.map(({ id, label }) => {
                const isActive = active === id
                return (
                  <li key={id}>
                    <button
                      onClick={() => handleNavClick(id)}
                      className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors"
                      style={{
                        color: isActive ? '#B8922A' : '#6b7280',
                        backgroundColor: isActive ? 'rgba(184,146,42,0.08)' : 'transparent',
                        borderLeft: isActive ? '2px solid #B8922A' : '2px solid transparent',
                      }}
                    >
                      {label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* Panel area */}
          <div className="min-w-0 flex-1 rounded-2xl bg-white p-6 shadow-sm">
            {active === 'price_list'      && <PriceListPanel      onDirty={markDirty} />}
            {active === 'services'        && <ServicesPanel        onDirty={markDirty} />}
            {active === 'payment_methods' && <PaymentMethodsPanel />}
            {active === 'employees'       && <EmployeesPanel       onDirty={markDirty} />}
            {active === 'payables'        && <PayablesPanel        onDirty={markDirty} />}
            {active === 'profile'         && <BusinessProfilePanel onDirty={markDirty} />}
          </div>
        </div>
      </div>

      {/* Floating unsaved-changes banner */}
      {isDirty && (
        <div className="fixed bottom-0 left-[220px] right-0 z-30 flex items-center justify-between border-t border-amber-200 bg-amber-50 px-6 py-3 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-sm font-medium text-amber-800">You have unsaved changes</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDirty(false)}
              className="text-xs text-amber-600 hover:text-amber-800 underline"
            >
              Discard
            </button>
            <span className="text-xs text-amber-400">
              Use the Save button inside each panel to save
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
