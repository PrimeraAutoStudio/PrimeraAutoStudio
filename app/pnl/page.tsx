'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  date: string
  price: number
}

interface Expense {
  id: number
  date: string
  description: string
  category: string
  amount: number
  payment_type: string
  notes: string | null
}

interface ExpenseForm {
  date: string
  description: string
  category: string
  amount: string
  payment_type: string
  notes: string
}

const CATEGORIES = ['Food', 'Salary', 'Supplies', 'Gas', 'Equipment', 'Misc']
const PAYMENT_TYPES = ['Cash', 'Online']

const EMPTY_EXPENSE_FORM: ExpenseForm = {
  date: new Date().toISOString().split('T')[0],
  description: '',
  category: 'Supplies',
  amount: '',
  payment_type: 'Cash',
  notes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  })
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PnLPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-based

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ExpenseForm>(EMPTY_EXPENSE_FORM)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Month string prefix for Supabase range queries  e.g. "2025-05"
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const firstDay = `${monthPrefix}-01`
  const lastDay = `${monthPrefix}-${String(daysInMonth(year, month)).padStart(2, '0')}`

  const fetchData = useCallback(async () => {
    setDataLoading(true)
    const [{ data: tx, error: txErr }, { data: ex, error: exErr }] = await Promise.all([
      supabase
        .from('transactions')
        .select('date, price')
        .gte('date', firstDay)
        .lte('date', lastDay),
      supabase
        .from('expenses')
        .select('id, date, description, category, amount, payment_type, notes')
        .gte('date', firstDay)
        .lte('date', lastDay)
        .order('date', { ascending: false }),
    ])
    if (txErr) console.error('transactions:', txErr.message)
    if (exErr) console.error('expenses:', exErr.message)
    setTransactions(tx ?? [])
    setExpenses(ex ?? [])
    setDataLoading(false)
  }, [firstDay, lastDay])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalRevenue = transactions.reduce((s, t) => s + t.price, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit = totalRevenue - totalExpenses
  const totalCars = transactions.length

  // ── Daily revenue for bar chart ────────────────────────────────────────────
  const days = daysInMonth(year, month)
  const revenueByDay: number[] = Array(days).fill(0)
  transactions.forEach((t) => {
    const d = parseInt(t.date.split('-')[2], 10) - 1
    if (d >= 0 && d < days) revenueByDay[d] += t.price
  })
  const maxDayRevenue = Math.max(...revenueByDay, 1)

  // ── Month navigation ───────────────────────────────────────────────────────
  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    const n = new Date(); const cy = n.getFullYear(); const cm = n.getMonth() + 1
    if (year === cy && month === cm) return // don't go beyond current month
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  // ── Expense form ───────────────────────────────────────────────────────────
  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.description || !form.amount || !form.date) {
      setFormError('Date, description, and amount are required.')
      return
    }
    setFormSaving(true)
    const { error } = await supabase.from('expenses').insert({
      date: form.date,
      description: form.description,
      category: form.category,
      amount: parseFloat(form.amount),
      payment_type: form.payment_type,
      notes: form.notes,
    })
    setFormSaving(false)
    if (error) { setFormError(error.message); return }
    setForm({ ...EMPTY_EXPENSE_FORM, date: form.date }) // keep same date for quick multi-entry
    setShowForm(false)
    fetchData()
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const inputCls =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm ' +
    'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-5xl">

        {/* ── Page header ── */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">P&amp;L Tracker</h1>
            <p className="text-sm text-gray-500">Monthly profit &amp; loss overview</p>
          </div>

          {/* Month selector */}
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-sm">
            <button
              onClick={prevMonth}
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="min-w-[140px] text-center text-sm font-semibold text-gray-800">
              {monthLabel(year, month)}
            </span>
            <button
              onClick={nextMonth}
              disabled={isCurrentMonth}
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Total Revenue" value={formatPHP(totalRevenue)} color="blue" />
          <SummaryCard label="Total Expenses" value={formatPHP(totalExpenses)} color="red" />
          <SummaryCard
            label="Net Profit"
            value={formatPHP(netProfit)}
            color={netProfit >= 0 ? 'green' : 'red'}
          />
          <SummaryCard label="Cars This Month" value={String(totalCars)} color="gray" />
        </div>

        {dataLoading ? (
          <p className="py-16 text-center text-gray-400">Loading…</p>
        ) : (
          <>
            {/* ── Section 1: Daily Revenue Chart ── */}
            <section className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-gray-800">
                Daily Revenue — {monthLabel(year, month)}
              </h2>

              {totalRevenue === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No revenue recorded this month.</p>
              ) : (
                <div className="flex items-end gap-[3px] overflow-x-auto pb-2" style={{ minHeight: '120px' }}>
                  {revenueByDay.map((rev, i) => {
                    const heightPct = rev > 0 ? Math.max((rev / maxDayRevenue) * 100, 4) : 0
                    const dayNum = i + 1
                    const isToday =
                      isCurrentMonth && dayNum === now.getDate()
                    return (
                      <div key={dayNum} className="group relative flex flex-1 flex-col items-center">
                        {/* Tooltip */}
                        {rev > 0 && (
                          <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-xs text-white group-hover:block">
                            Day {dayNum}: {formatPHP(rev)}
                          </div>
                        )}
                        {/* Bar */}
                        <div className="flex w-full flex-col justify-end" style={{ height: '100px' }}>
                          <div
                            className={`w-full rounded-t transition-all ${
                              rev === 0
                                ? 'bg-gray-100'
                                : isToday
                                ? 'bg-blue-500'
                                : 'bg-blue-300 group-hover:bg-blue-400'
                            }`}
                            style={{ height: rev === 0 ? '2px' : `${heightPct}%` }}
                          />
                        </div>
                        {/* Day label — show every 5th + day 1 */}
                        <span className={`mt-1 text-[10px] ${isToday ? 'font-bold text-blue-600' : 'text-gray-400'}`}>
                          {dayNum === 1 || dayNum % 5 === 0 ? dayNum : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* ── Section 2: Expense Log ── */}
            <section className="rounded-2xl bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h2 className="text-base font-semibold text-gray-800">Expense Log</h2>
                <button
                  onClick={() => { setShowForm(v => !v); setFormError('') }}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95"
                >
                  {showForm ? 'Cancel' : '+ Log Expense'}
                </button>
              </div>

              {/* Inline expense form */}
              {showForm && (
                <form onSubmit={handleExpenseSubmit} className="border-b border-blue-100 bg-blue-50 px-6 py-5">
                  <p className="mb-4 text-sm font-semibold text-blue-800">New Expense</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                      <input type="date" name="date" value={form.date} onChange={handleFormChange} className={inputCls} required />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Description <span className="text-red-500">*</span></label>
                      <input type="text" name="description" value={form.description} onChange={handleFormChange} placeholder="e.g. Cleaning supplies" className={inputCls} required />
                    </div>
                    <div>
                      <label className={labelCls}>Category</label>
                      <select name="category" value={form.category} onChange={handleFormChange} className={inputCls}>
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Amount (₱) <span className="text-red-500">*</span></label>
                      <input type="number" name="amount" value={form.amount} onChange={handleFormChange} placeholder="0.00" min="0" step="0.01" className={inputCls} required />
                    </div>
                    <div>
                      <label className={labelCls}>Payment Type</label>
                      <select name="payment_type" value={form.payment_type} onChange={handleFormChange} className={inputCls}>
                        {PAYMENT_TYPES.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <label className={labelCls}>Notes</label>
                      <input type="text" name="notes" value={form.notes} onChange={handleFormChange} placeholder="Optional notes…" className={inputCls} />
                    </div>
                  </div>
                  {formError && (
                    <p className="mt-3 text-sm text-red-600">{formError}</p>
                  )}
                  <div className="mt-4 flex gap-3">
                    <button
                      type="submit"
                      disabled={formSaving}
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {formSaving ? 'Saving…' : 'Save Expense'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowForm(false); setFormError('') }}
                      className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Expenses table */}
              {expenses.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">No expenses logged this month.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Description</th>
                        <th className="px-6 py-3">Category</th>
                        <th className="px-6 py-3">Amount</th>
                        <th className="px-6 py-3">Payment Type</th>
                        <th className="px-6 py-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {expenses.map((ex) => (
                        <tr key={ex.id} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-6 py-3 text-gray-500">
                            {new Date(ex.date + 'T00:00:00').toLocaleDateString('en-PH', {
                              month: 'short', day: 'numeric'
                            })}
                          </td>
                          <td className="px-6 py-3 font-medium text-gray-800">{ex.description}</td>
                          <td className="px-6 py-3">
                            <CategoryBadge category={ex.category} />
                          </td>
                          <td className="whitespace-nowrap px-6 py-3 font-semibold text-gray-900">
                            {formatPHP(ex.amount)}
                          </td>
                          <td className="px-6 py-3 text-gray-500">{ex.payment_type}</td>
                          <td className="px-6 py-3 text-gray-400">{ex.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-100">
                        <td colSpan={3} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Total
                        </td>
                        <td className="px-6 py-3 font-bold text-gray-900">
                          {formatPHP(totalExpenses)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: 'blue' | 'red' | 'green' | 'gray'
}) {
  const colorMap = {
    blue: 'text-blue-600',
    red: 'text-red-600',
    green: 'text-green-600',
    gray: 'text-gray-900',
  }
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colorMap[color]}`}>{value}</p>
    </div>
  )
}

const CATEGORY_COLORS: Record<string, string> = {
  Food:      'bg-orange-100 text-orange-700',
  Salary:    'bg-purple-100 text-purple-700',
  Supplies:  'bg-cyan-100 text-cyan-700',
  Gas:       'bg-yellow-100 text-yellow-700',
  Equipment: 'bg-blue-100 text-blue-700',
  Misc:      'bg-gray-100 text-gray-600',
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {category}
    </span>
  )
}
