'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminOverrideModal from '@/app/components/AdminOverrideModal'
import DateRangeSelector, {
  DateRange,
  formatRangeLabel,
  rangeForPreset,
} from '@/app/components/DateRangeSelector'
import ExportMenu, { ExportFormat } from '@/app/components/ExportMenu'
import { downloadCsv, downloadXlsx, downloadPdf } from '@/lib/export'

interface Transaction {
  date: string; price: number
  service_name?: string; payment_method?: string; status?: string
}

interface Expense {
  id: string; date: string; assignee: string | null; description: string; category: string
  amount: number; payment_type: string; notes: string | null; payable_id: string | null
}

interface ExpenseForm {
  date: string; assignee: string; description: string; category: string
  amount: string; payment_type: string; notes: string; payable_id: string
}

interface EditExpenseState {
  assignee: string; description: string; category: string
  amount: string; payment_type: string; notes: string
}

interface EmployeeOption { id: string; full_name: string; last_name: string | null }
interface Payable { id: string; name: string; amount: number; due_day: number | null }

interface KpiTargets {
  revenue_target: number; car_count_target: number; expense_budget: number; kpi_label: string
  net_profit_target: number; kpi_period_days: number
}

function isPastMonth(dateStr: string): boolean {
  const now = new Date()
  const d = new Date(dateStr + 'T00:00:00')
  return d.getFullYear() < now.getFullYear() ||
    (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth())
}

const CATEGORIES    = ['Food', 'Salary', 'Supplies', 'Gas', 'Equipment', 'Misc']
const PAYMENT_TYPES = ['Cash', 'Online']
const DAILY_QUOTA   = 9.5

const CAT_COLORS: Record<string, string> = {
  Food: '#B8922A', Salary: '#7C5C1E', Supplies: '#D4AB4E',
  Gas: '#A0845C', Equipment: '#6B4F2A', Misc: '#C4A882', Utilities: '#E8D5A3',
}

const CAT_BADGE: Record<string, string> = {
  Food: 'bg-orange-100 text-orange-700', Salary: 'bg-purple-100 text-purple-700',
  Supplies: 'bg-cyan-100 text-cyan-700', Gas: 'bg-yellow-100 text-yellow-700',
  Equipment: 'bg-amber-100 text-amber-700', Misc: 'bg-gray-100 text-gray-600',
  Utilities: 'bg-lime-100 text-lime-700',
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_EXPENSE_FORM: ExpenseForm = {
  date: localToday(), assignee: '', description: '', category: 'Supplies', amount: '', payment_type: 'Cash', notes: '', payable_id: '',
}

const DEFAULT_KPI: KpiTargets = { revenue_target: 0, car_count_target: 0, expense_budget: 0, kpi_label: '', net_profit_target: 0, kpi_period_days: 0 }

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (cur <= end) { dates.push(localIso(cur)); cur.setDate(cur.getDate() + 1) }
  return dates
}

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function daysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate() }

function monthBoundsFromDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const year = d.getFullYear(); const month = d.getMonth() + 1
  const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01`
  const lastOfMonth  = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`
  return { firstOfMonth, lastOfMonth, year, month }
}

function groupByWeek(dates: string[]): { label: string; dates: string[] }[] {
  if (!dates.length) return []
  const weeks: { label: string; dates: string[] }[] = []
  let cur: string[] = []
  dates.forEach((d, i) => {
    cur.push(d)
    const dow = new Date(d + 'T00:00:00').getDay()
    const isWeekEnd = dow === 0 || i === dates.length - 1
    if (isWeekEnd && cur.length) { weeks.push({ label: shortDate(cur[0]), dates: cur }); cur = [] }
  })
  if (cur.length) weeks.push({ label: shortDate(cur[0]), dates: cur })
  return weeks
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: 'gold' | 'red' | 'green' | 'gray' }) {
  const colorMap = { gold: 'text-[#B8922A]', red: 'text-red-600', green: 'text-green-600', gray: 'text-gray-900' }
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 truncate">{label}</p>
      <p className={`mt-1 text-lg font-bold sm:text-xl ${colorMap[color]}`}>{value}</p>
    </div>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CAT_BADGE[category] ?? 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{category}</span>
}

function RevBarChart({ chartDates, chartValues, maxDayRevenue, todayStr, labelStep }: {
  chartDates: string[]; chartValues: number[]; maxDayRevenue: number; todayStr: string; labelStep: number
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  if (chartDates.length === 0) return null
  const BAR_H = 140; const LABEL_H = 24; const TOP_PAD = 36
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-[2px]" style={{ height: BAR_H + TOP_PAD + LABEL_H, paddingTop: TOP_PAD, minWidth: chartDates.length > 14 ? `${chartDates.length * 18}px` : 'auto' }}>
        {chartDates.map((dateStr, i) => {
          const rev = chartValues[i]; const isToday = dateStr === todayStr
          const barHeight = rev > 0 ? Math.max((rev / maxDayRevenue) * BAR_H, 6) : 2
          const dayNum = parseInt(dateStr.split('-')[2], 10)
          const showDay = i === 0 || i === chartDates.length - 1 || i % labelStep === 0
          const isHovered = hoveredIdx === i
          return (
            <div key={dateStr} className="relative flex flex-1 flex-col items-center" style={{ height: BAR_H + LABEL_H }}
              onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
              {isHovered && (
                <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg"
                  style={{ bottom: LABEL_H + barHeight + 22, left: '50%', transform: 'translateX(-50%)' }}>
                  {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
              )}
              {rev > 0 && (
                <span className="absolute text-[9px] font-semibold text-center leading-none whitespace-nowrap"
                  style={{ bottom: LABEL_H + barHeight + 3, left: '50%', transform: 'translateX(-50%)', color: '#0a0a0a' }}>
                  {'₱' + Math.round(rev).toLocaleString('en-PH')}
                </span>
              )}
              <div className="absolute w-full rounded-t transition-opacity duration-100"
                style={{ bottom: LABEL_H, height: barHeight, backgroundColor: rev === 0 ? '#f3f4f6' : isToday ? '#B8922A' : '#EDD98A', opacity: isHovered ? 0.8 : 1 }} />
              <span className="absolute bottom-0 text-[10px]" style={{ color: isToday ? '#B8922A' : '#9ca3af', fontWeight: isToday ? 700 : 400 }}>
                {showDay ? dayNum : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DonutChart({ expenses }: { expenses: Expense[] }) {
  const [hovered, setHovered] = useState<string | null>(null)
  if (expenses.length === 0) return <p className="py-8 text-center text-sm text-gray-400">No expenses for this period.</p>
  const totals: Record<string, number> = {}
  expenses.forEach((e) => { totals[e.category] = (totals[e.category] ?? 0) + e.amount })
  const total = Object.values(totals).reduce((s, v) => s + v, 0)
  const slices = Object.entries(totals).sort((a, b) => b[1] - a[1])
  const CX = 80, CY = 80, R = 64, INNER = 38
  let cumAngle = -Math.PI / 2
  function polar(cx: number, cy: number, r: number, angle: number) { return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) } }
  const paths = slices.map(([cat, amt]) => {
    const angle = (amt / total) * 2 * Math.PI
    const startAngle = cumAngle; cumAngle += angle; const endAngle = cumAngle
    const large = angle > Math.PI ? 1 : 0
    const os = polar(CX, CY, R, startAngle); const oe = polar(CX, CY, R, endAngle)
    const is = polar(CX, CY, INNER, endAngle); const ie = polar(CX, CY, INNER, startAngle)
    const d = [`M ${os.x} ${os.y}`, `A ${R} ${R} 0 ${large} 1 ${oe.x} ${oe.y}`, `L ${is.x} ${is.y}`, `A ${INNER} ${INNER} 0 ${large} 0 ${ie.x} ${ie.y}`, 'Z'].join(' ')
    return { cat, amt, d, color: CAT_COLORS[cat] ?? '#9ca3af' }
  })
  const hoveredAmt = hovered ? (totals[hovered] ?? 0) : total
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="relative shrink-0">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {paths.map(({ cat, d, color }) => (
            <path key={cat} d={d} fill={color} opacity={hovered && hovered !== cat ? 0.35 : 1}
              className="cursor-pointer transition-opacity duration-150"
              onMouseEnter={() => setHovered(cat)} onMouseLeave={() => setHovered(null)} />
          ))}
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="600">{hovered ?? 'Total'}</text>
          <text x={CX} y={CY + 8} textAnchor="middle" fontSize="10" fill="#111827" fontWeight="700">{formatPHP(hoveredAmt)}</text>
          {hovered && <text x={CX} y={CY + 20} textAnchor="middle" fontSize="8" fill="#B8922A">{((hoveredAmt / total) * 100).toFixed(1)}%</text>}
        </svg>
      </div>
      <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2">
        {slices.map(([cat, amt]) => (
          <div key={cat} className="flex cursor-pointer items-center gap-2 text-xs sm:text-sm"
            onMouseEnter={() => setHovered(cat)} onMouseLeave={() => setHovered(null)}
            style={{ opacity: hovered && hovered !== cat ? 0.4 : 1 }}>
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: CAT_COLORS[cat] ?? '#9ca3af' }} />
            <span className="font-medium text-gray-700">{cat}</span>
            <span className="text-gray-400">{formatPHP(amt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryTracker({ expenses, chartDates, rangeLen }: { expenses: Expense[]; chartDates: string[]; rangeLen: number }) {
  const [selected, setSelected] = useState('All')
  const allCats = ['All', ...CATEGORIES.filter((c) => expenses.some((e) => e.category === c))]
  const byWeek = rangeLen > 31
  const buckets = byWeek ? groupByWeek(chartDates) : chartDates.map((d) => ({ label: shortDate(d), dates: [d] }))
  function sumFor(cat: string, dates: string[]) {
    return expenses.filter((e) => dates.includes(e.date) && (cat === 'All' || e.category === cat)).reduce((s, e) => s + e.amount, 0)
  }
  const cats = selected === 'All' ? CATEGORIES.filter((c) => expenses.some((e) => e.category === c)) : [selected]
  const bucketData = buckets.map((b) => ({ label: b.label, values: cats.map((c) => sumFor(c, b.dates)) }))
  const maxVal = Math.max(...bucketData.flatMap((b) => b.values), 1)
  const BAR_H = 100
  const [tooltip, setTooltip] = useState<{ label: string; lines: string[] } | null>(null)
  const [tooltipX, setTooltipX] = useState(0)
  const trackerRef = useRef<HTMLDivElement>(null)
  if (buckets.length === 0) return <p className="py-8 text-center text-sm text-gray-400">No expense data for this period.</p>
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {allCats.map((c) => (
          <button key={c} type="button" onClick={() => setSelected(c)}
            className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
            style={{ backgroundColor: selected === c ? (CAT_COLORS[c] ?? '#B8922A') : '#f3f4f6', color: selected === c ? '#fff' : '#6b7280' }}>
            {c}
          </button>
        ))}
      </div>
      <div ref={trackerRef} className="relative overflow-x-auto">
        {tooltip && (
          <div className="pointer-events-none absolute z-10 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: tooltipX, top: 0, transform: 'translateX(-50%)' }}>
            <div className="mb-1 font-semibold text-gray-300">{tooltip.label}</div>
            {tooltip.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        <div className="flex items-end gap-1" style={{ height: BAR_H + 28, paddingTop: 8 }}>
          {bucketData.map((b, bi) => (
            <div key={bi} className="group flex flex-1 flex-col items-center" style={{ height: BAR_H + 28 }}
              onMouseEnter={(e) => {
                const rect = trackerRef.current?.getBoundingClientRect()
                const bRect = e.currentTarget.getBoundingClientRect()
                if (rect) setTooltipX(bRect.left - rect.left + bRect.width / 2)
                setTooltip({ label: b.label, lines: cats.map((c, ci) => `${c}: ${formatPHP(b.values[ci])}`) })
              }}
              onMouseLeave={() => setTooltip(null)}>
              <div className="relative bottom-0 flex w-full items-end justify-center gap-[1px]" style={{ height: BAR_H }}>
                {selected === 'All' ? (
                  <div className="relative flex w-3/4 flex-col-reverse overflow-hidden rounded-t">
                    {cats.map((c, ci) => {
                      const pct = b.values[ci] > 0 ? Math.max((b.values[ci] / maxVal) * BAR_H, 2) : 0
                      return <div key={c} style={{ height: pct, backgroundColor: CAT_COLORS[c] ?? '#9ca3af' }} />
                    })}
                  </div>
                ) : (
                  <div className="w-3/4 rounded-t"
                    style={{ height: Math.max((b.values[0] / maxVal) * BAR_H, b.values[0] > 0 ? 3 : 0), backgroundColor: CAT_COLORS[selected] ?? '#B8922A' }} />
                )}
              </div>
              <span className="mt-1 text-[9px] text-gray-400 text-center leading-tight">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
      {selected === 'All' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {cats.map((c) => (
            <div key={c} className="flex items-center gap-1 text-xs text-gray-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CAT_COLORS[c] ?? '#9ca3af' }} />
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function KpiRow({ label, target, actual, isCurrency = true, higherIsBetter = true }: {
  label: string; target: number; actual: number; isCurrency?: boolean; higherIsBetter?: boolean
}) {
  if (target <= 0) return null
  const pct = Math.min((actual / target) * 100, 100)
  const variance = actual - target
  const isGood = higherIsBetter ? actual >= target : actual <= target
  const fmt = (n: number) => isCurrency ? formatPHP(n) : n.toLocaleString('en-PH')
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isGood ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
          {variance >= 0 ? '+' : ''}{fmt(variance)}
        </span>
      </div>
      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: isGood ? '#22c55e' : '#ef4444' }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>Actual: <strong className="text-gray-800">{fmt(actual)}</strong></span>
        <span className="hidden sm:inline">{pct.toFixed(1)}% of target</span>
        <span>Target: <strong className="text-gray-800">{fmt(target)}</strong></span>
      </div>
    </div>
  )
}

export default function PnLPage() {
  const [range, setRange] = useState<DateRange>(rangeForPreset('this_month'))
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [expenses, setExpenses]         = useState<Expense[]>([])
  const [payables, setPayables]         = useState<Payable[]>([])
  const [txMonth, setTxMonth]           = useState<Transaction[]>([])
  const [dataLoading, setDataLoading]   = useState(true)
  const [employees, setEmployees]       = useState<EmployeeOption[]>([])
  const [exporting, setExporting]       = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [form, setForm]                 = useState<ExpenseForm>(EMPTY_EXPENSE_FORM)
  const [formSaving, setFormSaving]     = useState(false)
  const [formError, setFormError]       = useState('')
  const [varExpMonth, setVarExpMonth]       = useState<number>(0)
  const [paidPayablesMonth, setPaidPayablesMonth] = useState<{ payable_id: string; date: string }[]>([])
  const [kpiTargets, setKpiTargets]     = useState<KpiTargets>(DEFAULT_KPI)
  const [kpiEditing, setKpiEditing]     = useState(false)
  const [kpiDraft, setKpiDraft]         = useState<KpiTargets>(DEFAULT_KPI)
  const [kpiSaving, setKpiSaving]       = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editExpense, setEditExpense] = useState<EditExpenseState>({ assignee: '', description: '', category: '', amount: '', payment_type: '', notes: '' })
  const [editSaving, setEditSaving]   = useState(false)
  const [editError, setEditError]     = useState('')
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<string | null>(null)
  const [deletingExpense, setDeletingExpense] = useState(false)
  const [deleteOverrideOpen, setDeleteOverrideOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const fetchData = useCallback(async () => {
    if (!range.from || !range.to) return
    setDataLoading(true)
    const { firstOfMonth, lastOfMonth } = monthBoundsFromDate(range.from)
    const [{ data: tx }, { data: ex }, { data: em }, { data: pa }, { data: txM }, { data: st }, { data: exM }, { data: paidExp }] = await Promise.all([
      supabase.from('transactions').select('date, price, service_name, payment_method, status').gte('date', range.from).lte('date', range.to).order('date', { ascending: false }),
      supabase.from('expenses').select('id, date, assignee, description, category, amount, payment_type, notes, is_deleted, payable_id').gte('date', range.from).lte('date', range.to).order('date', { ascending: false }),
      supabase.from('employees').select('id, full_name, last_name').eq('is_active', true).order('full_name'),
      supabase.from('payables').select('id, name, amount, due_day').order('name'),
      supabase.from('transactions').select('date, price').gte('date', firstOfMonth).lte('date', lastOfMonth),
      supabase.from('settings').select('revenue_target, car_count_target, expense_budget, kpi_label, net_profit_target, kpi_period_days').eq('id', '1').single(),
      // Variable expenses (payable_id IS NULL) for breakeven — excludes fixed cost payments
      supabase.from('expenses').select('amount').gte('date', firstOfMonth).lte('date', lastOfMonth).neq('is_deleted', true).is('payable_id', null),
      // Paid payables this month (payable_id IS NOT NULL) — for checklist and paid fixed cost calc
      supabase.from('expenses').select('payable_id, date').gte('date', firstOfMonth).lte('date', lastOfMonth).neq('is_deleted', true).not('payable_id', 'is', null),
    ])
    setTransactions(tx ?? [])
    setExpenses((ex ?? []).filter((e) => e.is_deleted !== true).map((e) => ({ ...e, id: String(e.id), payable_id: e.payable_id ?? null })))
    if (em) setEmployees(em.map((e) => ({ ...e, id: String(e.id) })))
    setPayables(pa ?? [])
    setTxMonth(txM ?? [])
    setVarExpMonth((exM ?? []).reduce((s: number, e: { amount: number }) => s + (e.amount ?? 0), 0))
    setPaidPayablesMonth((paidExp ?? []) as { payable_id: string; date: string }[])
    if (st) {
      const kpi = { revenue_target: st.revenue_target ?? 0, car_count_target: st.car_count_target ?? 0, expense_budget: st.expense_budget ?? 0, kpi_label: st.kpi_label ?? '', net_profit_target: st.net_profit_target ?? 0, kpi_period_days: st.kpi_period_days ?? 0 }
      setKpiTargets(kpi); setKpiDraft(kpi)
    }
    setDataLoading(false)
  }, [range])

  useEffect(() => { fetchData() }, [fetchData])

  async function saveKpiTargets() {
    setKpiSaving(true)
    await supabase.from('settings').update({
      revenue_target: kpiDraft.revenue_target, car_count_target: kpiDraft.car_count_target,
      expense_budget: kpiDraft.expense_budget, kpi_label: kpiDraft.kpi_label,
      net_profit_target: kpiDraft.net_profit_target, kpi_period_days: rangeLen || kpiDraft.kpi_period_days,
    }).eq('id', '1')
    setKpiTargets({ ...kpiDraft, kpi_period_days: rangeLen || kpiDraft.kpi_period_days })
    setKpiEditing(false); setKpiSaving(false)
  }

  const totalRevenue  = transactions.reduce((s, t) => s + t.price, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit     = totalRevenue - totalExpenses
  const totalCars     = transactions.length
  const chartDates    = range.from && range.to ? datesBetween(range.from, range.to) : []
  const revenueByDate: Record<string, number> = {}
  transactions.forEach((t) => { revenueByDate[t.date] = (revenueByDate[t.date] ?? 0) + t.price })
  const chartValues   = chartDates.map((d) => revenueByDate[d] ?? 0)
  const maxDayRevenue = Math.max(...chartValues, 1)
  const rangeLen      = chartDates.length
  const labelStep     = rangeLen <= 7 ? 1 : rangeLen <= 14 ? 2 : rangeLen <= 31 ? 4 : 7

  const { year: beYear, month: beMonth } = range.from ? monthBoundsFromDate(range.from) : monthBoundsFromDate(todayStr)
  const { firstOfMonth: beFirst, lastOfMonth: beLast } = monthBoundsFromDate(`${beYear}-${String(beMonth).padStart(2, '0')}-01`)

  // Full-month paid payables map (from dedicated DB fetch, not range-filtered expenses)
  const paidPayableMap: Record<string, string> = {} // payable_id → earliest payment date
  paidPayablesMonth.forEach((e) => {
    if (!paidPayableMap[e.payable_id] || e.date < paidPayableMap[e.payable_id])
      paidPayableMap[e.payable_id] = e.date
  })

  const fixedCosts      = payables.reduce((s, p) => s + p.amount, 0)
  const paidFixedCosts  = payables.filter((p) => paidPayableMap[p.id]).reduce((s, p) => s + p.amount, 0)
  const unpaidFixedCosts = fixedCosts - paidFixedCosts
  // Still Needed = outstanding fixed obligations + variable spending − revenue already earned
  const revenueMonth    = txMonth.reduce((s, t) => s + t.price, 0)
  const totalBreakevenCosts = fixedCosts + varExpMonth
  const remainingObligations = unpaidFixedCosts + varExpMonth  // what hasn't been "covered" by payables yet
  const remaining       = Math.max(remainingObligations - revenueMonth, 0)
  const progressPct     = Math.min((revenueMonth / (totalBreakevenCosts || 1)) * 100, 100)
  const aboveBreakeven  = revenueMonth >= remainingObligations
  const totalDays       = daysInMonth(beYear, beMonth)
  const dayOfMonth      = now.getFullYear() === beYear && now.getMonth() + 1 === beMonth ? now.getDate() : totalDays
  const daysLeft        = Math.max(totalDays - dayOfMonth + 1, 0)
  const carsMonth       = txMonth.length
  const totalQuota      = Math.ceil(DAILY_QUOTA * totalDays)
  const carsStillNeeded = Math.max(totalQuota - carsMonth, 0)
  const carsPerDayNeeded = daysLeft > 0 ? (carsStillNeeded / daysLeft).toFixed(1) : '0'
  const beMonthLabel    = new Date(beYear, beMonth - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  const kpiPeriodDays = kpiTargets.kpi_period_days || rangeLen || 30
  const prorationFactor = rangeLen > 0 && kpiPeriodDays > 0 ? rangeLen / kpiPeriodDays : 1
  const proratedRevTarget = Math.round(kpiTargets.revenue_target * prorationFactor)
  const proratedCarTarget = Math.round(kpiTargets.car_count_target * prorationFactor)
  const proratedExpBudget = Math.round(kpiTargets.expense_budget * prorationFactor)
  const baseNetProfit     = kpiTargets.net_profit_target || (kpiTargets.revenue_target - kpiTargets.expense_budget)
  const proratedNetProfit = Math.round(baseNetProfit * prorationFactor)
  const isProrated        = Math.abs(prorationFactor - 1) > 0.01

  const KNOWN_FIRST_NAMES = ['Jhun', 'Allen', 'Mik', 'Von', 'Sam', 'Jobert', 'Eugene']
  function resolveEmployeeName(firstName: string): string {
    const lc = firstName.toLowerCase()
    const match = employees.find((e) => e.full_name.toLowerCase().startsWith(lc))
    return match ? match.full_name : firstName
  }
  const CREW_FOOD_WORDS = ['food', 'breakfast', 'lunch', 'dinner', 'snacks', 'merienda']
  function normalise(raw: { description: string; category: string; assignee: string }): { description: string; assignee: string } {
    const { description, category, assignee } = raw
    const desc = description.trim(); const descL = desc.toLowerCase()
    if (KNOWN_FIRST_NAMES.map((n) => n.toLowerCase()).includes(descL)) return { description: '', assignee: resolveEmployeeName(desc) }
    if (category === 'Salary') return { description: '', assignee: assignee || desc || '' }
    const crewMatch = desc.match(/^crew[\s\-–:]*(.*)$/i)
    if (crewMatch) { const rest = crewMatch[1].trim(); const foodWord = CREW_FOOD_WORDS.find((w) => rest.toLowerCase().includes(w)); return { description: foodWord ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest || 'Food', assignee: 'Crew' } }
    if (category === 'Supplies' && !assignee) return { description: desc, assignee: resolveEmployeeName('Eugene') }
    return { description: desc, assignee }
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    if (name === 'category') {
      if (value === 'Salary') { setForm((f) => ({ ...f, category: value, description: '' })); return }
      if (value === 'Supplies') { setForm((f) => ({ ...f, category: value, assignee: f.assignee || resolveEmployeeName('Eugene') })); return }
    }
    if (name === 'description') {
      const crewMatch = value.match(/^crew[\s\-–:]*(.*)$/i)
      if (crewMatch) { setForm((f) => ({ ...f, description: crewMatch[1].trim(), assignee: 'Crew' })); return }
    }
    setForm((f) => ({ ...f, [name]: value }))
  }

  async function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault(); setFormError('')
    if (form.category === 'Salary' && !form.assignee) { setFormError('Assignee is required for Salary expenses.'); return }
    if (form.category !== 'Salary' && !form.description) { setFormError('Description is required.'); return }
    if (!form.amount || !form.date) { setFormError('Date and amount are required.'); return }
    const { description: normDesc, assignee: normAssignee } = normalise({ description: form.description, category: form.category, assignee: form.assignee })
    setFormSaving(true)
    const payableId = form.payable_id || null
    const { error } = await supabase.from('expenses').insert({ date: form.date, assignee: normAssignee || null, description: normDesc, category: form.category, amount: parseFloat(form.amount), payment_type: form.payment_type, notes: form.notes, payable_id: payableId })
    setFormSaving(false)
    if (error) { setFormError(error.message); return }
    setForm({ ...EMPTY_EXPENSE_FORM, date: form.date }); setShowForm(false); fetchData()
  }

  function startEditExpense(ex: Expense) {
    if (isPastMonth(ex.date)) return
    setEditingExpenseId(ex.id)
    setEditExpense({ assignee: ex.assignee ?? '', description: ex.description ?? '', category: ex.category, amount: String(ex.amount), payment_type: ex.payment_type, notes: ex.notes ?? '' })
    setEditError('')
  }

  function cancelEditExpense() { setEditingExpenseId(null); setEditError('') }

  async function saveEditExpense(id: string) {
    setEditSaving(true); setEditError('')
    const { error } = await supabase.from('expenses').update({ assignee: editExpense.assignee || null, description: editExpense.description, category: editExpense.category, amount: parseFloat(editExpense.amount) || 0, payment_type: editExpense.payment_type, notes: editExpense.notes }).eq('id', id)
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...editExpense, amount: parseFloat(editExpense.amount) || 0, assignee: editExpense.assignee || null, notes: editExpense.notes || null } : e))
    setEditingExpenseId(null)
  }

  function requestDeleteExpense(id: string) {
    setPendingDeleteId(id)
    setDeleteOverrideOpen(true)
  }

  async function deleteExpense(id: string) {
    setDeletingExpense(true)
    const { error } = await supabase.from('expenses')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)
    setDeletingExpense(false)
    if (error) { console.error('delete expense error:', error.message); return }
    setExpenses((prev) => prev.filter((e) => e.id !== id))
    setConfirmDeleteExpenseId(null)
  }

  async function handleExport(format: ExportFormat) {
    setExporting(true)
    const label = formatRangeLabel(range).replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase()
    const filename = `primera-pnl-${label}`
    const TX_HEAD = ['Date', 'Price', 'Payment Method', 'Status']
    const txRows  = transactions.map((t) => [t.date, t.price, t.payment_method ?? '', t.status ?? ''])
    const EX_HEAD = ['Date', 'Assignee', 'Description', 'Category', 'Amount', 'Payment Type', 'Notes']
    const exRows  = expenses.map((e) => [e.date, e.assignee ?? '', e.description, e.category, e.amount, e.payment_type, e.notes ?? ''])
    const summary = [{ label: 'Total Revenue', value: formatPHP(totalRevenue) }, { label: 'Total Expenses', value: formatPHP(totalExpenses) }, { label: 'Net Profit', value: formatPHP(netProfit) }, { label: 'Cars', value: String(totalCars) }]
    if (format === 'csv') {
      downloadCsv([['=== INCOME ==='], TX_HEAD, ...txRows, [], ['=== EXPENSES ==='], EX_HEAD, ...exRows, [], ['=== SUMMARY ==='], ...summary.map((s) => [s.label, s.value])], `${filename}.csv`)
    } else if (format === 'xlsx') {
      await downloadXlsx([{ name: 'Income', rows: [TX_HEAD, ...txRows] }, { name: 'Expenses', rows: [EX_HEAD, ...exRows] }, { name: 'Summary', rows: [['Metric', 'Value'], ...summary.map((s) => [s.label, s.value])] }], `${filename}.xlsx`)
    } else {
      await downloadPdf('P&L Report', formatRangeLabel(range), [{ title: 'Income', head: TX_HEAD, rows: txRows }, { title: 'Expenses', head: EX_HEAD, rows: exRows, summary }], `${filename}.pdf`)
    }
    setExporting(false)
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'
  const editInputCls = 'w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-[#B8922A] focus:outline-none'
  const kpiInputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#B8922A] focus:outline-none'

  const assigneeOptions = [
    { value: '', label: '—' },
    { value: 'Crew', label: 'Crew' },
    ...employees.map((emp) => ({ value: emp.full_name, label: emp.full_name })),
  ]

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">P&amp;L Tracker</h1>
            <p className="text-xs text-gray-500 sm:text-sm">Profit &amp; loss overview</p>
          </div>
          <ExportMenu onExport={handleExport} loading={exporting} />
        </div>

        {/* Date range */}
        <div className="mb-5 rounded-2xl bg-white p-3 shadow-sm sm:p-4">
          <DateRangeSelector value={range} onChange={setRange} />
          <p className="mt-2 text-xs text-gray-400 hidden sm:block">
            Showing: <span className="font-medium text-gray-600">{formatRangeLabel(range)}</span>
          </p>
        </div>

        {/* Summary cards — 2 col mobile, 4 col desktop */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <SummaryCard label="Revenue"  value={formatPHP(totalRevenue)}  color="gold" />
          <SummaryCard label="Expenses" value={formatPHP(totalExpenses)} color="red" />
          <SummaryCard label="Net Profit" value={formatPHP(netProfit)}   color={netProfit >= 0 ? 'green' : 'red'} />
          <SummaryCard label="Cars"     value={String(totalCars)}        color="gray" />
        </div>

        {dataLoading ? (
          <p className="py-16 text-center text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-6 sm:space-y-8">

            {/* ── 1. Breakeven Tracker ── */}
            <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="mb-3 text-sm font-semibold text-gray-800 sm:mb-4 sm:text-base">
                Breakeven — <span style={{ color: '#B8922A' }}>{beMonthLabel}</span>
              </h2>
              {/* Cost breakdown badge */}
              <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-gray-600 space-y-0.5">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    <span className="font-semibold" style={{ color: '#B8922A' }}>Fixed: </span>
                    {formatPHP(fixedCosts)}
                    {paidFixedCosts > 0 && <span className="ml-1 text-green-600">({formatPHP(paidFixedCosts)} paid)</span>}
                  </span>
                  {varExpMonth > 0 && (
                    <span><span className="font-semibold" style={{ color: '#B8922A' }}>Variable: </span>{formatPHP(varExpMonth)}</span>
                  )}
                </div>
                <div className="font-semibold text-gray-800">
                  Outstanding obligations: {formatPHP(unpaidFixedCosts)} unpaid fixed
                  {varExpMonth > 0 ? ` + ${formatPHP(varExpMonth)} variable = ${formatPHP(remainingObligations)}` : ''}
                </div>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Obligations Left</p>
                  <p className="text-lg font-bold text-gray-900 sm:text-xl">{formatPHP(remainingObligations)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Revenue This Month</p>
                  <p className={`text-lg font-bold sm:text-xl ${aboveBreakeven ? 'text-green-600' : 'text-red-500'}`}>{formatPHP(revenueMonth)}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{aboveBreakeven ? 'Above Breakeven By' : 'Still Needed'}</p>
                  <p className={`text-lg font-bold sm:text-xl ${aboveBreakeven ? 'text-green-600' : 'text-red-500'}`}>
                    {formatPHP(aboveBreakeven ? revenueMonth - remainingObligations : remaining)}
                  </p>
                </div>
              </div>
              <div className="mb-1 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%`, backgroundColor: aboveBreakeven ? '#22c55e' : '#ef4444' }} />
              </div>
              <div className="mb-4 flex justify-between text-xs text-gray-400">
                <span>₱0</span>
                <span>{progressPct.toFixed(1)}% of total target</span>
                <span>{formatPHP(totalBreakevenCosts)}</span>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:items-center sm:gap-4 sm:text-sm">
                  <div>
                    <span className="text-gray-500">Daily quota </span>
                    <span className="font-bold" style={{ color: '#B8922A' }}>{DAILY_QUOTA}/day</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Cars needed </span>
                    <span className={`font-bold ${carsStillNeeded === 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {carsStillNeeded === 0 ? 'On track ✓' : carsStillNeeded}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Per day ({daysLeft}d) </span>
                    <span className={`font-bold ${parseFloat(carsPerDayNeeded) <= DAILY_QUOTA ? 'text-green-600' : 'text-red-500'}`}>
                      {carsStillNeeded === 0 ? '—' : `${carsPerDayNeeded}/day`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payables paid/outstanding checklist */}
              {payables.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Fixed Costs Status</p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {payables.map((p) => {
                      const paidDate = paidPayableMap[p.id]
                      return (
                        <div key={p.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${paidDate ? 'bg-green-50' : 'bg-gray-50'}`}>
                          <div className="flex items-center gap-2">
                            <span className={paidDate ? 'text-green-600' : 'text-gray-400'}>
                              {paidDate ? '✓' : '○'}
                            </span>
                            <span className={`font-medium ${paidDate ? 'text-green-700' : 'text-gray-700'}`}>{p.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-gray-500">{formatPHP(p.amount)}</span>
                            {paidDate ? (
                              <span className="ml-2 text-green-600">paid {new Date(paidDate + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
                            ) : p.due_day ? (
                              <span className="ml-2 text-gray-400">due day {p.due_day}</span>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* ── 2. KPI Tracker ── */}
            <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-3 flex items-center justify-between sm:mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800 sm:text-base">KPI Tracker</h2>
                  {kpiTargets.kpi_label && <p className="text-xs text-gray-400 mt-0.5">{kpiTargets.kpi_label}</p>}
                </div>
                <button onClick={() => { setKpiEditing(!kpiEditing); setKpiDraft(kpiTargets) }}
                  className="rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{ borderColor: '#B8922A', color: '#B8922A' }}>
                  {kpiEditing ? 'Cancel' : '✎ Edit'}
                </button>
              </div>
              {kpiEditing && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8922A' }}>Set KPI Targets</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={labelCls}>Period Label</label>
                      <input type="text" value={kpiDraft.kpi_label} onChange={(e) => setKpiDraft((d) => ({ ...d, kpi_label: e.target.value }))} placeholder="e.g. June 2026 Targets" className={kpiInputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Revenue Target (₱)</label>
                      <input type="number" inputMode="decimal" value={kpiDraft.revenue_target || ''} onChange={(e) => setKpiDraft((d) => ({ ...d, revenue_target: parseFloat(e.target.value) || 0 }))} placeholder="0" className={kpiInputCls} min="0" />
                    </div>
                    <div>
                      <label className={labelCls}>Car Count Target</label>
                      <input type="number" inputMode="numeric" value={kpiDraft.car_count_target || ''} onChange={(e) => setKpiDraft((d) => ({ ...d, car_count_target: parseFloat(e.target.value) || 0 }))} placeholder="0" className={kpiInputCls} min="0" />
                    </div>
                    <div>
                      <label className={labelCls}>Expense Budget (₱)</label>
                      <input type="number" inputMode="decimal" value={kpiDraft.expense_budget || ''} onChange={(e) => setKpiDraft((d) => ({ ...d, expense_budget: parseFloat(e.target.value) || 0 }))} placeholder="0" className={kpiInputCls} min="0" />
                    </div>
                    <div>
                      <label className={labelCls}>Net Profit Target (₱)</label>
                      <input type="number" inputMode="decimal" value={kpiDraft.net_profit_target || ''} onChange={(e) => setKpiDraft((d) => ({ ...d, net_profit_target: parseFloat(e.target.value) || 0 }))} placeholder={kpiDraft.revenue_target > 0 || kpiDraft.expense_budget > 0 ? String(kpiDraft.revenue_target - kpiDraft.expense_budget) : '0'} className={kpiInputCls} min="0" />
                      <p className="mt-0.5 text-[10px] text-gray-400">Leave 0 to auto-calculate from Revenue − Expenses</p>
                    </div>
                  </div>
                  <button onClick={saveKpiTargets} disabled={kpiSaving}
                    className="mt-4 w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto sm:px-5 sm:py-2"
                    style={{ backgroundColor: '#B8922A' }}>
                    {kpiSaving ? 'Saving…' : 'Save Targets'}
                  </button>
                </div>
              )}
              {isProrated && (
                <p className="mb-2 text-[11px] text-gray-400">
                  Targets prorated for {rangeLen}-day range (set for {kpiPeriodDays} days)
                </p>
              )}
              {kpiTargets.revenue_target === 0 && kpiTargets.car_count_target === 0 && kpiTargets.expense_budget === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
                  <p className="text-sm text-gray-400">No targets set. Tap Edit to add KPIs.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <KpiRow label="Revenue" target={proratedRevTarget} actual={totalRevenue} isCurrency higherIsBetter />
                  <KpiRow label="Car Count" target={proratedCarTarget} actual={totalCars} isCurrency={false} higherIsBetter />
                  <KpiRow label="Expense Budget" target={proratedExpBudget} actual={totalExpenses} isCurrency higherIsBetter={false} />
                  {proratedNetProfit > 0 && <KpiRow label="Net Profit" target={proratedNetProfit} actual={netProfit} isCurrency higherIsBetter />}
                </div>
              )}
            </section>

            {/* ── 3. Daily Revenue Chart ── */}
            <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="mb-4 text-sm font-semibold text-gray-800 sm:text-base">
                Daily Revenue — <span style={{ color: '#B8922A' }}>{formatRangeLabel(range)}</span>
              </h2>
              {chartValues.every((v) => v === 0) ? (
                <p className="py-8 text-center text-sm text-gray-400">No revenue recorded for this period.</p>
              ) : (
                <RevBarChart chartDates={chartDates} chartValues={chartValues} maxDayRevenue={maxDayRevenue} todayStr={todayStr} labelStep={labelStep} />
              )}
            </section>

            {/* ── 4. Expense charts — stacked on mobile ── */}
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
                <h2 className="mb-4 text-sm font-semibold text-gray-800 sm:text-base">Expenses by Category</h2>
                <DonutChart expenses={expenses} />
              </section>
              <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
                <h2 className="mb-1 text-sm font-semibold text-gray-800 sm:text-base">Category Tracker</h2>
                <p className="mb-3 text-xs text-gray-400">{rangeLen > 31 ? 'Grouped by week' : 'Day-by-day per category'}</p>
                <CategoryTracker expenses={expenses} chartDates={chartDates} rangeLen={rangeLen} />
              </section>
            </div>

            {/* ── 5. Expense Log ── */}
            <section className="rounded-2xl bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4">
                <h2 className="text-sm font-semibold text-gray-800 sm:text-base">Expense Log</h2>
                <button onClick={() => { setShowForm((v) => !v); setFormError('') }}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
                  style={{ backgroundColor: '#B8922A' }}>
                  {showForm ? 'Cancel' : '+ Log Expense'}
                </button>
              </div>

              {showForm && (
                <form onSubmit={handleExpenseSubmit} className="border-b px-4 py-4 sm:px-6 sm:py-5"
                  style={{ borderColor: 'rgba(184,146,42,0.2)', backgroundColor: 'rgba(184,146,42,0.05)' }}>
                  <p className="mb-3 text-sm font-semibold" style={{ color: '#B8922A' }}>New Expense</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                      <input type="date" name="date" value={form.date} onChange={handleFormChange} className={inputCls} required />
                    </div>
                    <div>
                      <label className={labelCls}>Category</label>
                      <select name="category" value={form.category} onChange={handleFormChange} className={inputCls}>
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Assignee {form.category === 'Salary' && <span className="text-red-500">*</span>}</label>
                      <select name="assignee" value={form.assignee} onChange={handleFormChange} className={inputCls}>
                        {assigneeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    {form.category !== 'Salary' && (
                      <div className="col-span-2 sm:col-span-1">
                        <label className={labelCls}>Description <span className="text-red-500">*</span></label>
                        <input type="text" name="description" value={form.description} onChange={handleFormChange} placeholder="e.g. Gas, Food" className={inputCls} />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Amount (₱) <span className="text-red-500">*</span></label>
                      <input type="number" inputMode="decimal" name="amount" value={form.amount} onChange={handleFormChange} placeholder="0.00" min="0" step="0.01" className={inputCls} required />
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
                    {payables.length > 0 && (
                      <div className="col-span-2 sm:col-span-3">
                        <label className={labelCls}>Pays off a fixed cost? <span className="font-normal text-gray-400">(prevents double-counting in Breakeven)</span></label>
                        <select name="payable_id" value={form.payable_id} onChange={handleFormChange} className={inputCls}>
                          <option value="">— None (variable expense) —</option>
                          {payables.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              {p.name} — {formatPHP(p.amount)}{p.due_day ? ` (due day ${p.due_day})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
                  <div className="mt-4 flex gap-3">
                    <button type="submit" disabled={formSaving}
                      className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none sm:px-5 sm:py-2.5"
                      style={{ backgroundColor: '#B8922A' }}>
                      {formSaving ? 'Saving…' : 'Save Expense'}
                    </button>
                    <button type="button" onClick={() => { setShowForm(false); setFormError('') }}
                      className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-semibold text-gray-600 sm:flex-none sm:px-5 sm:py-2.5">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {expenses.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">No expenses logged for this period.</p>
              ) : (
                <>
                  {/* ── MOBILE: Card list ── */}
                  <div className="divide-y divide-gray-50 sm:hidden">
                    {expenses.map((ex) => {
                      const isEditing = editingExpenseId === ex.id
                      return (
                        <div key={ex.id} className={`px-4 py-3 ${isEditing ? 'bg-amber-50' : ''}`}>
                          {isEditing ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="mb-0.5 block text-xs text-gray-500">Assignee</label>
                                  <select value={editExpense.assignee} onChange={(e) => setEditExpense((s) => ({ ...s, assignee: e.target.value }))} className={editInputCls}>
                                    {assigneeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-xs text-gray-500">Category</label>
                                  <select value={editExpense.category} onChange={(e) => setEditExpense((s) => ({ ...s, category: e.target.value }))} className={editInputCls}>
                                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-xs text-gray-500">Description</label>
                                  <input type="text" value={editExpense.description} onChange={(e) => setEditExpense((s) => ({ ...s, description: e.target.value }))} className={editInputCls} placeholder="Description" />
                                </div>
                                <div>
                                  <label className="mb-0.5 block text-xs text-gray-500">Amount</label>
                                  <input type="number" inputMode="decimal" value={editExpense.amount} onChange={(e) => setEditExpense((s) => ({ ...s, amount: e.target.value }))} className={editInputCls} min="0" step="0.01" />
                                </div>
                              </div>
                              {editError && <p className="text-xs text-red-600">{editError}</p>}
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => saveEditExpense(ex.id)} disabled={editSaving}
                                  className="flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
                                  style={{ backgroundColor: '#B8922A' }}>
                                  {editSaving ? '…' : 'Save'}
                                </button>
                                <button onClick={cancelEditExpense}
                                  className="flex-1 rounded-lg border border-gray-300 py-2 text-xs font-semibold text-gray-600">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between mb-1">
                                <div>
                                  <span className="text-sm font-semibold text-gray-800">
                                    {ex.description || ex.assignee || ex.category}
                                  </span>
                                  {ex.assignee && ex.description && (
                                    <span className="ml-2 text-xs text-gray-400">{ex.assignee}</span>
                                  )}
                                </div>
                                <span className="text-sm font-bold" style={{ color: '#B8922A' }}>{formatPHP(ex.amount)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400">{shortDate(ex.date)}</span>
                                  <CategoryBadge category={ex.category} />
                                  <span className="text-xs text-gray-400">{ex.payment_type}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {isPastMonth(ex.date) ? (
                                    <span className="text-[10px] text-gray-400 italic">Locked</span>
                                  ) : (
                                    <>
                                      <button onClick={() => startEditExpense(ex)}
                                        className="text-xs font-medium text-[#B8922A]">Edit</button>
                                      <button onClick={() => requestDeleteExpense(ex.id)}
                                        className="text-xs font-medium text-red-400">Del</button>
                                    </>
                                  )}
                                </div>
                              </div>
                              {ex.notes && <p className="mt-1 text-xs text-gray-400 italic">{ex.notes}</p>}
                            </>
                          )}
                        </div>
                      )
                    })}
                    <div className="flex justify-between px-4 py-3 border-t-2 border-gray-100">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total</span>
                      <span className="font-bold text-gray-900">{formatPHP(totalExpenses)}</span>
                    </div>
                  </div>

                  {/* ── DESKTOP: Full table ── */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                          <th className="px-6 py-3">Date</th>
                          <th className="px-6 py-3">Assignee</th>
                          <th className="px-6 py-3">Description</th>
                          <th className="px-6 py-3">Category</th>
                          <th className="px-6 py-3">Amount</th>
                          <th className="px-6 py-3">Payment</th>
                          <th className="px-6 py-3">Notes</th>
                          <th className="px-6 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {expenses.map((ex) => {
                          const isEditing = editingExpenseId === ex.id
                          return (
                            <tr key={ex.id} className={isEditing ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                              <td className="whitespace-nowrap px-6 py-3 text-gray-500">
                                {new Date(ex.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                              </td>
                              <td className="px-6 py-3">
                                {isEditing ? <select value={editExpense.assignee} onChange={(e) => setEditExpense((s) => ({ ...s, assignee: e.target.value }))} className={editInputCls}>{assigneeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                                  : <span className="text-gray-700">{ex.assignee || '—'}</span>}
                              </td>
                              <td className="px-6 py-3">
                                {isEditing ? <input type="text" value={editExpense.description} onChange={(e) => setEditExpense((s) => ({ ...s, description: e.target.value }))} className={editInputCls} placeholder="Description" />
                                  : <span className="font-medium text-gray-800">{ex.description || '—'}</span>}
                              </td>
                              <td className="px-6 py-3">
                                {isEditing ? <select value={editExpense.category} onChange={(e) => setEditExpense((s) => ({ ...s, category: e.target.value }))} className={editInputCls}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                                  : <CategoryBadge category={ex.category} />}
                              </td>
                              <td className="whitespace-nowrap px-6 py-3">
                                {isEditing ? <input type="number" value={editExpense.amount} onChange={(e) => setEditExpense((s) => ({ ...s, amount: e.target.value }))} className={editInputCls} min="0" step="0.01" />
                                  : <span className="font-semibold text-gray-900">{formatPHP(ex.amount)}</span>}
                              </td>
                              <td className="px-6 py-3">
                                {isEditing ? <select value={editExpense.payment_type} onChange={(e) => setEditExpense((s) => ({ ...s, payment_type: e.target.value }))} className={editInputCls}>{PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}</select>
                                  : <span className="text-gray-500">{ex.payment_type}</span>}
                              </td>
                              <td className="px-6 py-3">
                                {isEditing ? <input type="text" value={editExpense.notes} onChange={(e) => setEditExpense((s) => ({ ...s, notes: e.target.value }))} className={editInputCls} placeholder="Notes" />
                                  : <span className="text-gray-400">{ex.notes || '—'}</span>}
                              </td>
                              <td className="whitespace-nowrap px-6 py-3">
                                {isEditing ? (
                                  <div className="flex items-center gap-1.5">
                                    <button onClick={() => saveEditExpense(ex.id)} disabled={editSaving}
                                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                      style={{ backgroundColor: '#B8922A' }}>
                                      {editSaving ? '…' : 'Save'}
                                    </button>
                                    <button onClick={cancelEditExpense}
                                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100">
                                      Cancel
                                    </button>
                                  </div>
                                ) : isPastMonth(ex.date) ? (
                                  <span className="text-xs text-gray-400 italic" title="Expenses from past months are locked. Contact admin if a correction is needed.">🔒 Locked</span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <button onClick={() => startEditExpense(ex)}
                                      className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors"
                                      style={{ borderColor: '#B8922A', color: '#B8922A' }}
                                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(184,146,42,0.08)' }}
                                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}>
                                      Edit
                                    </button>
                                    <button onClick={() => requestDeleteExpense(ex.id)}
                                      className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:border-red-400 hover:text-red-600 hover:bg-red-50">
                                      Del
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-100">
                          <td colSpan={4} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Total</td>
                          <td className="px-6 py-3 font-bold text-gray-900">{formatPHP(totalExpenses)}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
              {editError && <p className="px-4 py-2 text-sm text-red-600 sm:px-6">{editError}</p>}
            </section>
          </div>
        )}
      </div>

      {/* Admin Override Modal for expense delete */}
      <AdminOverrideModal
        open={deleteOverrideOpen}
        onClose={() => { setDeleteOverrideOpen(false); setPendingDeleteId(null) }}
        onGranted={() => {
          if (pendingDeleteId) setConfirmDeleteExpenseId(pendingDeleteId)
          setPendingDeleteId(null)
        }}
        actionLabel="delete this expense"
      />

      {/* Delete confirmation — bottom sheet on mobile */}
      {confirmDeleteExpenseId !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-sm sm:rounded-2xl">
            <h3 className="mb-2 text-base font-bold text-gray-900">Delete Expense</h3>
            <p className="mb-5 text-sm text-gray-500">This will be soft-deleted and hidden from P&amp;L. It cannot be restored from the UI.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteExpense(confirmDeleteExpenseId)} disabled={deletingExpense}
                className="flex-1 rounded-xl bg-red-500 py-3.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60">
                {deletingExpense ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={() => setConfirmDeleteExpenseId(null)} disabled={deletingExpense}
                className="flex-1 rounded-xl border-2 border-gray-200 py-3.5 text-sm font-bold text-gray-600">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}