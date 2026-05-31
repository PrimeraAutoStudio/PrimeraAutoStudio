'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DateRangeSelector, {
  DateRange,
  formatRangeLabel,
  rangeForPreset,
} from '@/app/components/DateRangeSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction { date: string; price: number }

interface Expense {
  id: number; date: string; description: string; category: string
  amount: number; payment_type: string; notes: string | null
}

interface ExpenseForm {
  date: string; description: string; category: string
  amount: string; payment_type: string; notes: string
}

const CATEGORIES    = ['Food', 'Salary', 'Supplies', 'Gas', 'Equipment', 'Misc']
const PAYMENT_TYPES = ['Cash', 'Online']

const EMPTY_EXPENSE_FORM: ExpenseForm = {
  date: new Date().toISOString().split('T')[0],
  description: '', category: 'Supplies', amount: '', payment_type: 'Cash', notes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

// Build an ordered array of every date string in [from, to]
function datesBetween(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to   + 'T00:00:00')
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PnLPage() {
  const [range, setRange] = useState<DateRange>(rangeForPreset('this_month'))

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [expenses, setExpenses]         = useState<Expense[]>([])
  const [dataLoading, setDataLoading]   = useState(true)

  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState<ExpenseForm>(EMPTY_EXPENSE_FORM)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError]   = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!range.from || !range.to) return
    setDataLoading(true)
    const [{ data: tx, error: txErr }, { data: ex, error: exErr }] = await Promise.all([
      supabase.from('transactions').select('date, price')
        .gte('date', range.from).lte('date', range.to),
      supabase.from('expenses')
        .select('id, date, description, category, amount, payment_type, notes')
        .gte('date', range.from).lte('date', range.to)
        .order('date', { ascending: false }),
    ])
    if (txErr) console.error('transactions:', txErr.message)
    if (exErr) console.error('expenses:', exErr.message)
    setTransactions(tx ?? [])
    setExpenses(ex ?? [])
    setDataLoading(false)
  }, [range])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Summary stats ──────────────────────────────────────────────────────────

  const totalRevenue  = transactions.reduce((s, t) => s + t.price, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit     = totalRevenue - totalExpenses
  const totalCars     = transactions.length

  // ── Bar chart — one bar per day in range ───────────────────────────────────

  const chartDates = range.from && range.to ? datesBetween(range.from, range.to) : []
  const revenueByDate: Record<string, number> = {}
  transactions.forEach((t) => {
    revenueByDate[t.date] = (revenueByDate[t.date] ?? 0) + t.price
  })
  const chartValues  = chartDates.map((d) => revenueByDate[d] ?? 0)
  const maxDayRevenue = Math.max(...chartValues, 1)
  const todayStr      = new Date().toISOString().split('T')[0]

  // Label density — show every Nth label so they don't overlap
  const labelStep = chartDates.length <= 7 ? 1
    : chartDates.length <= 14 ? 2
    : chartDates.length <= 31 ? 5
    : 7

  // ── Expense form ───────────────────────────────────────────────────────────

  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
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
      date: form.date, description: form.description, category: form.category,
      amount: parseFloat(form.amount), payment_type: form.payment_type, notes: form.notes,
    })
    setFormSaving(false)
    if (error) { setFormError(error.message); return }
    setForm({ ...EMPTY_EXPENSE_FORM, date: form.date })
    setShowForm(false)
    fetchData()
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const inputCls =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 ' +
    'placeholder:text-gray-400 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">P&amp;L Tracker</h1>
          <p className="text-sm text-gray-500">Profit &amp; loss overview</p>
        </div>

        {/* Date range selector */}
        <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
          <DateRangeSelector value={range} onChange={setRange} />
          <p className="mt-2 text-xs text-gray-400">
            Showing: <span className="font-medium text-gray-600">{formatRangeLabel(range)}</span>
          </p>
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Total Revenue"  value={formatPHP(totalRevenue)}  color="gold" />
          <SummaryCard label="Total Expenses" value={formatPHP(totalExpenses)} color="red" />
          <SummaryCard label="Net Profit"     value={formatPHP(netProfit)}     color={netProfit >= 0 ? 'green' : 'red'} />
          <SummaryCard label="Cars"           value={String(totalCars)}        color="gray" />
        </div>

        {dataLoading ? (
          <p className="py-16 text-center text-gray-400">Loading…</p>
        ) : (
          <>
            {/* ── Bar Chart ── */}
            <section className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-gray-800">
                Daily Revenue — <span style={{ color: '#B8922A' }}>{formatRangeLabel(range)}</span>
              </h2>

              {totalRevenue === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No revenue recorded for this period.</p>
              ) : (
                <div className="flex items-end gap-[2px] overflow-x-auto pb-2" style={{ minHeight: '120px' }}>
                  {chartDates.map((dateStr, i) => {
                    const rev      = chartValues[i]
                    const isToday  = dateStr === todayStr
                    const heightPct = rev > 0 ? Math.max((rev / maxDayRevenue) * 100, 4) : 0
                    const dayNum   = parseInt(dateStr.split('-')[2], 10)
                    const showLabel = i === 0 || i === chartDates.length - 1 || (i + 1) % labelStep === 0
                    return (
                      <div key={dateStr} className="group relative flex flex-1 flex-col items-center">
                        {rev > 0 && (
                          <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-xs text-white group-hover:block">
                            {shortDate(dateStr)}: {formatPHP(rev)}
                          </div>
                        )}
                        <div className="flex w-full flex-col justify-end" style={{ height: '100px' }}>
                          <div
                            className="w-full rounded-t transition-all"
                            style={{
                              backgroundColor: rev === 0 ? '#f3f4f6' : isToday ? '#B8922A' : '#EDD98A',
                              height: rev === 0 ? '2px' : `${heightPct}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`mt-1 text-[10px] ${isToday ? 'font-bold' : 'text-gray-400'}`}
                          style={isToday ? { color: '#B8922A' } : {}}>
                          {showLabel ? dayNum : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* ── Expense Log ── */}
            <section className="rounded-2xl bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h2 className="text-base font-semibold text-gray-800">Expense Log</h2>
                <button
                  onClick={() => { setShowForm((v) => !v); setFormError('') }}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
                  style={{ backgroundColor: '#B8922A' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}
                >
                  {showForm ? 'Cancel' : '+ Log Expense'}
                </button>
              </div>

              {showForm && (
                <form onSubmit={handleExpenseSubmit} className="border-b px-6 py-5"
                  style={{ borderColor: 'rgba(184,146,42,0.2)', backgroundColor: 'rgba(184,146,42,0.05)' }}>
                  <p className="mb-4 text-sm font-semibold" style={{ color: '#B8922A' }}>New Expense</p>
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
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Amount (₱) <span className="text-red-500">*</span></label>
                      <input type="number" name="amount" value={form.amount} onChange={handleFormChange} placeholder="0.00" min="0" step="0.01" className={inputCls} required />
                    </div>
                    <div>
                      <label className={labelCls}>Payment Type</label>
                      <select name="payment_type" value={form.payment_type} onChange={handleFormChange} className={inputCls}>
                        {PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <label className={labelCls}>Notes</label>
                      <input type="text" name="notes" value={form.notes} onChange={handleFormChange} placeholder="Optional notes…" className={inputCls} />
                    </div>
                  </div>
                  {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
                  <div className="mt-4 flex gap-3">
                    <button type="submit" disabled={formSaving}
                      className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: '#B8922A' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}>
                      {formSaving ? 'Saving…' : 'Save Expense'}
                    </button>
                    <button type="button" onClick={() => { setShowForm(false); setFormError('') }}
                      className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {expenses.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">No expenses logged for this period.</p>
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
                            {new Date(ex.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-6 py-3 font-medium text-gray-800">{ex.description}</td>
                          <td className="px-6 py-3"><CategoryBadge category={ex.category} /></td>
                          <td className="whitespace-nowrap px-6 py-3 font-semibold text-gray-900">{formatPHP(ex.amount)}</td>
                          <td className="px-6 py-3 text-gray-500">{ex.payment_type}</td>
                          <td className="px-6 py-3 text-gray-400">{ex.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-100">
                        <td colSpan={3} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Total</td>
                        <td className="px-6 py-3 font-bold text-gray-900">{formatPHP(totalExpenses)}</td>
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

function SummaryCard({ label, value, color }: {
  label: string; value: string; color: 'gold' | 'red' | 'green' | 'gray'
}) {
  const colorMap = { gold: 'text-[#B8922A]', red: 'text-red-600', green: 'text-green-600', gray: 'text-gray-900' }
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colorMap[color]}`}>{value}</p>
    </div>
  )
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: 'bg-orange-100 text-orange-700', Salary: 'bg-purple-100 text-purple-700',
  Supplies: 'bg-cyan-100 text-cyan-700', Gas: 'bg-yellow-100 text-yellow-700',
  Equipment: 'bg-amber-100 text-amber-700', Misc: 'bg-gray-100 text-gray-600',
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{category}</span>
}
