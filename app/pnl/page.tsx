'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  date: string; price: number
  service_name?: string; payment_method?: string; status?: string
}

interface Expense {
  id: number; date: string; assignee: string | null; description: string; category: string
  amount: number; payment_type: string; notes: string | null
}

interface ExpenseForm {
  date: string; assignee: string; description: string; category: string
  amount: string; payment_type: string; notes: string
}

interface EmployeeOption { id: number; full_name: string; last_name: string | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES    = ['Food', 'Salary', 'Supplies', 'Gas', 'Equipment', 'Misc']
const PAYMENT_TYPES = ['Cash', 'Online']

// Warm, brand-adjacent palette — no rainbow colours
const CAT_COLORS: Record<string, string> = {
  Food:      '#B8922A',   // burnished gold
  Salary:    '#7C5C1E',   // dark gold/brown
  Supplies:  '#D4AB4E',   // gold light
  Gas:       '#A0845C',   // warm tan
  Equipment: '#6B4F2A',   // walnut
  Misc:      '#C4A882',   // champagne muted
  Utilities: '#E8D5A3',   // pale straw
}

const CAT_BADGE: Record<string, string> = {
  Food:      'bg-orange-100 text-orange-700',
  Salary:    'bg-purple-100 text-purple-700',
  Supplies:  'bg-cyan-100 text-cyan-700',
  Gas:       'bg-yellow-100 text-yellow-700',
  Equipment: 'bg-amber-100 text-amber-700',
  Misc:      'bg-gray-100 text-gray-600',
  Utilities: 'bg-lime-100 text-lime-700',
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_EXPENSE_FORM: ExpenseForm = {
  date: localToday(),
  assignee: '', description: '', category: 'Supplies', amount: '', payment_type: 'Cash', notes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  while (cur <= end) {
    dates.push(localIso(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// Group dates into weeks; return array of { label, dates[] }
function groupByWeek(dates: string[]): { label: string; dates: string[] }[] {
  if (!dates.length) return []
  const weeks: { label: string; dates: string[] }[] = []
  let cur: string[] = []
  dates.forEach((d, i) => {
    cur.push(d)
    const dow = new Date(d + 'T00:00:00').getDay() // 0=Sun
    const isWeekEnd = dow === 0 || i === dates.length - 1
    if (isWeekEnd && cur.length) {
      weeks.push({ label: shortDate(cur[0]), dates: cur })
      cur = []
    }
  })
  if (cur.length) weeks.push({ label: shortDate(cur[0]), dates: cur })
  return weeks
}

// ─── Chart Components ─────────────────────────────────────────────────────────

// 1 ── Revenue Bar Chart ───────────────────────────────────────────────────────

interface RevBarChartProps {
  chartDates:    string[]
  chartValues:   number[]
  maxDayRevenue: number
  todayStr:      string
  labelStep:     number
}

function RevBarChart({ chartDates, chartValues, maxDayRevenue, todayStr, labelStep }: RevBarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (chartDates.length === 0) return null

  const BAR_H   = 160  // px — bar drawing area
  const LABEL_H = 24   // px — day-number label row below bars
  const TOP_PAD = 40   // px — guaranteed clearance above tallest bar for amount labels

  // Short peso format: ₱4,250 (no decimals)
  function fmtAmt(n: number) {
    return '₱' + Math.round(n).toLocaleString('en-PH')
  }

  // Full date label for tooltip e.g. "May 15, 2026"
  function fullDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="flex items-end gap-[2px]"
        style={{ height: BAR_H + TOP_PAD + LABEL_H, paddingTop: TOP_PAD }}
      >
        {chartDates.map((dateStr, i) => {
          const rev       = chartValues[i]
          const isToday   = dateStr === todayStr
          const barHeight = rev > 0 ? Math.max((rev / maxDayRevenue) * BAR_H, 6) : 2
          const dayNum    = parseInt(dateStr.split('-')[2], 10)
          const showDay   = i === 0 || i === chartDates.length - 1 || i % labelStep === 0
          const isHovered = hoveredIdx === i

          return (
            <div
              key={dateStr}
              className="relative flex flex-1 flex-col items-center"
              style={{ height: BAR_H + LABEL_H }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Hover tooltip — date label */}
              {isHovered && (
                <div
                  className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg"
                  style={{
                    bottom: LABEL_H + barHeight + 22,
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  {fullDate(dateStr)}
                </div>
              )}

              {/* Static amount label — always visible, obsidian black */}
              {rev > 0 && (
                <span
                  className="absolute text-[9px] font-semibold text-center leading-none whitespace-nowrap"
                  style={{
                    bottom: LABEL_H + barHeight + 3,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: '#0a0a0a',
                  }}
                >
                  {fmtAmt(rev)}
                </span>
              )}

              {/* Bar */}
              <div
                className="absolute w-full rounded-t transition-opacity duration-100"
                style={{
                  bottom: LABEL_H,
                  height: barHeight,
                  backgroundColor: rev === 0 ? '#f3f4f6' : isToday ? '#B8922A' : '#EDD98A',
                  opacity: isHovered ? 0.8 : 1,
                }}
              />

              {/* Day number */}
              <span
                className="absolute bottom-0 text-[10px]"
                style={{ color: isToday ? '#B8922A' : '#9ca3af', fontWeight: isToday ? 700 : 400 }}
              >
                {showDay ? dayNum : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// 2 ── Expense Donut Chart ─────────────────────────────────────────────────────

interface DonutChartProps { expenses: Expense[] }

function DonutChart({ expenses }: DonutChartProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (expenses.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">No expenses for this period.</p>
  }

  // Aggregate by category
  const totals: Record<string, number> = {}
  expenses.forEach((e) => {
    totals[e.category] = (totals[e.category] ?? 0) + e.amount
  })
  const total   = Object.values(totals).reduce((s, v) => s + v, 0)
  const slices  = Object.entries(totals).sort((a, b) => b[1] - a[1])

  // Build SVG arc paths
  const CX = 80, CY = 80, R = 64, INNER = 38
  let cumAngle = -Math.PI / 2  // start at top

  function polar(cx: number, cy: number, r: number, angle: number) {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  const paths = slices.map(([cat, amt]) => {
    const angle = (amt / total) * 2 * Math.PI
    const startAngle = cumAngle
    cumAngle += angle
    const endAngle = cumAngle

    const large = angle > Math.PI ? 1 : 0
    const os = polar(CX, CY, R, startAngle)
    const oe = polar(CX, CY, R, endAngle)
    const is = polar(CX, CY, INNER, endAngle)
    const ie = polar(CX, CY, INNER, startAngle)

    const d = [
      `M ${os.x} ${os.y}`,
      `A ${R} ${R} 0 ${large} 1 ${oe.x} ${oe.y}`,
      `L ${is.x} ${is.y}`,
      `A ${INNER} ${INNER} 0 ${large} 0 ${ie.x} ${ie.y}`,
      'Z',
    ].join(' ')

    return { cat, amt, d, color: CAT_COLORS[cat] ?? '#9ca3af' }
  })

  const hoveredAmt = hovered ? (totals[hovered] ?? 0) : total
  const hoveredLabel = hovered ?? 'Total'

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      {/* Donut SVG */}
      <div className="relative shrink-0">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {paths.map(({ cat, d, color }) => (
            <path
              key={cat}
              d={d}
              fill={color}
              opacity={hovered && hovered !== cat ? 0.35 : 1}
              className="cursor-pointer transition-opacity duration-150"
              onMouseEnter={() => setHovered(cat)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          {/* Centre label */}
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="600">
            {hoveredLabel}
          </text>
          <text x={CX} y={CY + 8} textAnchor="middle" fontSize="10" fill="#111827" fontWeight="700">
            {formatPHP(hoveredAmt)}
          </text>
          {hovered && (
            <text x={CX} y={CY + 20} textAnchor="middle" fontSize="8" fill="#B8922A">
              {((hoveredAmt / total) * 100).toFixed(1)}%
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-1 flex-wrap gap-x-6 gap-y-2">
        {slices.map(([cat, amt]) => (
          <div
            key={cat}
            className="flex cursor-pointer items-center gap-2 text-sm"
            onMouseEnter={() => setHovered(cat)}
            onMouseLeave={() => setHovered(null)}
            style={{ opacity: hovered && hovered !== cat ? 0.4 : 1 }}
          >
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: CAT_COLORS[cat] ?? '#9ca3af' }} />
            <span className="font-medium text-gray-700">{cat}</span>
            <span className="text-gray-400">{formatPHP(amt)}</span>
            <span className="text-xs text-gray-400">({((amt / total) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// 3 ── Category Tracker ────────────────────────────────────────────────────────

interface CategoryTrackerProps {
  expenses:   Expense[]
  chartDates: string[]
  rangeLen:   number
}

function CategoryTracker({ expenses, chartDates, rangeLen }: CategoryTrackerProps) {
  const [selected, setSelected] = useState('All')
  const allCats = ['All', ...CATEGORIES.filter((c) => expenses.some((e) => e.category === c))]

  // Decide bucketing: day (≤31 days) or week (>31 days)
  const byWeek = rangeLen > 31
  const buckets = byWeek ? groupByWeek(chartDates) : chartDates.map((d) => ({ label: shortDate(d), dates: [d] }))

  // Aggregate
  function sumFor(cat: string, dates: string[]): number {
    return expenses
      .filter((e) => dates.includes(e.date) && (cat === 'All' || e.category === cat))
      .reduce((s, e) => s + e.amount, 0)
  }

  const cats     = selected === 'All' ? CATEGORIES.filter((c) => expenses.some((e) => e.category === c)) : [selected]
  const bucketData = buckets.map((b) => ({
    label:  b.label,
    values: cats.map((c) => sumFor(c, b.dates)),
  }))

  const maxVal = Math.max(...bucketData.flatMap((b) => b.values), 1)
  const BAR_H  = 120

  const [tooltip, setTooltip] = useState<{ label: string; lines: string[] } | null>(null)
  const [tooltipX, setTooltipX] = useState(0)
  const trackerRef = useRef<HTMLDivElement>(null)

  if (buckets.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">No expense data for this period.</p>
  }

  return (
    <div>
      {/* Category selector chips */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {allCats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setSelected(c)}
            className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: selected === c ? (CAT_COLORS[c] ?? '#B8922A') : '#f3f4f6',
              color:           selected === c ? '#fff' : '#6b7280',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div ref={trackerRef} className="relative overflow-x-auto">
        {/* Tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: tooltipX, top: 0, transform: 'translateX(-50%)' }}
          >
            <div className="mb-1 font-semibold text-gray-300">{tooltip.label}</div>
            {tooltip.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        <div className="flex items-end gap-1" style={{ height: BAR_H + 28, paddingTop: 8 }}>
          {bucketData.map((b, bi) => (
            <div
              key={bi}
              className="group flex flex-1 flex-col items-center"
              style={{ height: BAR_H + 28 }}
              onMouseEnter={(e) => {
                const rect = trackerRef.current?.getBoundingClientRect()
                const bRect = e.currentTarget.getBoundingClientRect()
                if (rect) setTooltipX(bRect.left - rect.left + bRect.width / 2)
                setTooltip({
                  label: b.label,
                  lines: cats.map((c, ci) => `${c}: ${formatPHP(b.values[ci])}`),
                })
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Stacked / grouped bars */}
              <div className="relative bottom-0 flex w-full items-end justify-center gap-[1px]" style={{ height: BAR_H }}>
                {selected === 'All' ? (
                  // Stacked
                  <div className="relative flex w-3/4 flex-col-reverse overflow-hidden rounded-t">
                    {cats.map((c, ci) => {
                      const pct = b.values[ci] > 0 ? Math.max((b.values[ci] / maxVal) * BAR_H, 2) : 0
                      return (
                        <div key={c} style={{ height: pct, backgroundColor: CAT_COLORS[c] ?? '#9ca3af' }} />
                      )
                    })}
                  </div>
                ) : (
                  // Single bar
                  <div
                    className="w-3/4 rounded-t"
                    style={{
                      height: Math.max((b.values[0] / maxVal) * BAR_H, b.values[0] > 0 ? 3 : 0),
                      backgroundColor: CAT_COLORS[selected] ?? '#B8922A',
                    }}
                  />
                )}
              </div>
              {/* Bucket label */}
              <span className="mt-1 text-[9px] text-gray-400 text-center leading-tight">
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Legend for stacked */}
      {selected === 'All' && (
        <div className="mt-3 flex flex-wrap gap-3">
          {cats.map((c) => (
            <div key={c} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CAT_COLORS[c] ?? '#9ca3af' }} />
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PnLPage() {
  const [range, setRange] = useState<DateRange>(rangeForPreset('this_month'))

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [expenses, setExpenses]         = useState<Expense[]>([])
  const [dataLoading, setDataLoading]   = useState(true)

  const [employees, setEmployees]   = useState<EmployeeOption[]>([])
  const [exporting, setExporting]   = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState<ExpenseForm>(EMPTY_EXPENSE_FORM)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError]   = useState('')

  // ── Fetch — main (expenses + transactions for summary/donut/tracker) ────────

  const fetchData = useCallback(async () => {
    if (!range.from || !range.to) return
    setDataLoading(true)
    const [{ data: tx, error: txErr }, { data: ex, error: exErr }, { data: em }] = await Promise.all([
      supabase.from('transactions').select('date, price, service_name, payment_method, status')
        .gte('date', range.from).lte('date', range.to).order('date', { ascending: false }),
      supabase.from('expenses')
        .select('id, date, assignee, description, category, amount, payment_type, notes')
        .gte('date', range.from).lte('date', range.to)
        .order('date', { ascending: false }),
      supabase.from('employees')
        .select('id, full_name, last_name')
        .eq('is_active', true)
        .order('full_name'),
    ])
    if (txErr) console.error('[expenses fetch] transactions error:', txErr.message)
    if (exErr) console.error('[expenses fetch] expenses error:', exErr.message)

    console.log('[expenses fetch] range:', range.from, '→', range.to)
    console.log('[expenses fetch] raw expenses data:', ex)
    console.log('[expenses fetch] expenses count:', ex?.length ?? 0)
    console.log('[expenses fetch] expenses error:', exErr)

    setTransactions(tx ?? [])
    setExpenses(ex ?? [])
    if (em) setEmployees(em)
    setDataLoading(false)
  }, [range])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Summary stats ─────────────────────────────────────────────────────────

  const totalRevenue  = transactions.reduce((s, t) => s + t.price, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit     = totalRevenue - totalExpenses
  const totalCars     = transactions.length

  // ── Bar chart + tracker data (all use the single `range`) ────────────────

  const chartDates    = range.from && range.to ? datesBetween(range.from, range.to) : []
  const revenueByDate: Record<string, number> = {}
  transactions.forEach((t) => { revenueByDate[t.date] = (revenueByDate[t.date] ?? 0) + t.price })
  const chartValues   = chartDates.map((d) => revenueByDate[d] ?? 0)
  const maxDayRevenue = Math.max(...chartValues, 1)
  const _td = new Date()
  const todayStr = `${_td.getFullYear()}-${String(_td.getMonth() + 1).padStart(2, '0')}-${String(_td.getDate()).padStart(2, '0')}`
  const rangeLen = chartDates.length

  const labelStep = rangeLen <= 7 ? 1
    : rangeLen <= 14 ? 2
    : rangeLen <= 31 ? 4
    : 7

  // ── Expense form helpers ──────────────────────────────────────────────────

  // Known first names that map to employees — used for auto-detection
  const KNOWN_FIRST_NAMES = ['Jhun', 'Allen', 'Mik', 'Von', 'Sam', 'Jobert', 'Eugene']

  // Resolve a bare first name to the matching employee's full name (or return as-is)
  function resolveEmployeeName(firstName: string): string {
    const lc = firstName.toLowerCase()
    const match = employees.find(
      (e) => e.full_name.toLowerCase().startsWith(lc)
    )
    return match
      ? [match.full_name, match.last_name].filter(Boolean).join(' ')
      : firstName
  }

  // Food keywords that follow "Crew"
  const CREW_FOOD_WORDS = ['food', 'breakfast', 'lunch', 'dinner', 'snacks', 'merienda']

  // Normalise a raw description+category pair before saving
  function normalise(raw: { description: string; category: string; assignee: string }): {
    description: string; assignee: string
  } {
    let { description, category, assignee } = raw
    const desc  = description.trim()
    const descL = desc.toLowerCase()

    // Rule 1 — description is just a known first name → move to assignee
    if (KNOWN_FIRST_NAMES.map((n) => n.toLowerCase()).includes(descL)) {
      return { description: '', assignee: resolveEmployeeName(desc) }
    }

    // Rule 2 — category is Salary → blank description, keep assignee
    if (category === 'Salary') {
      return { description: '', assignee: assignee || desc || '' }
    }

    // Rule 3 — description starts with "Crew" (various formats)
    const crewMatch = desc.match(/^crew[\s\-–:]*(.*)$/i)
    if (crewMatch) {
      const rest = crewMatch[1].trim()
      // keep the food word, capitalise first letter
      const foodWord = CREW_FOOD_WORDS.find((w) => rest.toLowerCase().includes(w))
      return {
        description: foodWord
          ? rest.charAt(0).toUpperCase() + rest.slice(1)
          : rest || 'Food',
        assignee: 'Crew',
      }
    }

    // Rule 4 — category is Supplies → auto-assign to Eugene
    if (category === 'Supplies' && !assignee) {
      const eugene = resolveEmployeeName('Eugene')
      return { description: desc, assignee: eugene }
    }

    return { description: desc, assignee }
  }

  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target

    if (name === 'category') {
      // Salary → clear description, mark assignee required
      if (value === 'Salary') {
        setForm((f) => ({ ...f, category: value, description: '' }))
        return
      }
      // Supplies → auto-assign to Eugene if no assignee yet
      if (value === 'Supplies') {
        setForm((f) => ({
          ...f,
          category: value,
          assignee: f.assignee || resolveEmployeeName('Eugene'),
        }))
        return
      }
    }

    if (name === 'description') {
      // Crew prefix → auto-set assignee, strip prefix from description
      const crewMatch = value.match(/^crew[\s\-–:]*(.*)$/i)
      if (crewMatch) {
        const rest = crewMatch[1].trim()
        setForm((f) => ({ ...f, description: rest, assignee: 'Crew' }))
        return
      }
    }

    setForm((f) => ({ ...f, [name]: value }))
  }

  async function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')

    // Salary requires assignee; other categories require description
    if (form.category === 'Salary' && !form.assignee) {
      setFormError('Assignee is required for Salary expenses.')
      return
    }
    if (form.category !== 'Salary' && !form.description) {
      setFormError('Description is required.')
      return
    }
    if (!form.amount || !form.date) {
      setFormError('Date and amount are required.')
      return
    }

    // Apply normalisation rules before saving
    const { description: normDesc, assignee: normAssignee } = normalise({
      description: form.description,
      category:    form.category,
      assignee:    form.assignee,
    })

    setFormSaving(true)
    const { error } = await supabase.from('expenses').insert({
      date:         form.date,
      assignee:     normAssignee || null,
      description:  normDesc,
      category:     form.category,
      amount:       parseFloat(form.amount),
      payment_type: form.payment_type,
      notes:        form.notes,
    })
    setFormSaving(false)
    if (error) { setFormError(error.message); return }
    setForm({ ...EMPTY_EXPENSE_FORM, date: form.date })
    setShowForm(false)
    fetchData()
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport(format: ExportFormat) {
    setExporting(true)
    const label    = formatRangeLabel(range).replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase()
    const filename = `primera-pnl-${label}`
    const TX_HEAD  = ['Date', 'Price', 'Payment Method', 'Status']
    const txRows   = transactions.map((t) => [t.date, t.price, '', ''])
    const EX_HEAD  = ['Date', 'Assignee', 'Description', 'Category', 'Amount', 'Payment Type', 'Notes']
    const exRows   = expenses.map((e) => [e.date, e.assignee ?? '', e.description, e.category, e.amount, e.payment_type, e.notes ?? ''])
    const summary  = [
      { label: 'Total Revenue',  value: formatPHP(totalRevenue) },
      { label: 'Total Expenses', value: formatPHP(totalExpenses) },
      { label: 'Net Profit',     value: formatPHP(netProfit) },
      { label: 'Cars',           value: String(totalCars) },
    ]
    if (format === 'csv') {
      downloadCsv([['=== INCOME ==='], TX_HEAD, ...txRows, [], ['=== EXPENSES ==='], EX_HEAD, ...exRows, [],
        ['=== SUMMARY ==='], ...summary.map((s) => [s.label, s.value])], `${filename}.csv`)
    } else if (format === 'xlsx') {
      await downloadXlsx([
        { name: 'Income',   rows: [TX_HEAD, ...txRows] },
        { name: 'Expenses', rows: [EX_HEAD, ...exRows] },
        { name: 'Summary',  rows: [['Metric', 'Value'], ...summary.map((s) => [s.label, s.value])] },
      ], `${filename}.xlsx`)
    } else {
      await downloadPdf('P&L Report', formatRangeLabel(range), [
        { title: 'Income',   head: TX_HEAD, rows: txRows },
        { title: 'Expenses', head: EX_HEAD, rows: exRows, summary },
      ], `${filename}.pdf`)
    }
    setExporting(false)
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
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">P&amp;L Tracker</h1>
            <p className="text-sm text-gray-500">Profit &amp; loss overview</p>
          </div>
          <ExportMenu onExport={handleExport} loading={exporting} />
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
          <div className="space-y-8">

            {/* ── 1. Daily Revenue Bar Chart ── */}
            <section className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-base font-semibold text-gray-800">
                Daily Revenue —{' '}
                <span style={{ color: '#B8922A' }}>{formatRangeLabel(range)}</span>
              </h2>
              {chartValues.every((v) => v === 0) ? (
                <p className="py-8 text-center text-sm text-gray-400">No revenue recorded for this period.</p>
              ) : (
                <RevBarChart
                  chartDates={chartDates}
                  chartValues={chartValues}
                  maxDayRevenue={maxDayRevenue}
                  todayStr={todayStr}
                  labelStep={labelStep}
                />
              )}
            </section>

            {/* ── 2. Expense charts side-by-side ── */}
            <div className="grid gap-8 lg:grid-cols-2">

              {/* 2a. Expense Donut */}
              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="mb-5 text-base font-semibold text-gray-800">Expenses by Category</h2>
                <DonutChart expenses={expenses} />
              </section>

              {/* 2b. Category Tracker */}
              <section className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="mb-1 text-base font-semibold text-gray-800">Category Tracker</h2>
                <p className="mb-4 text-xs text-gray-400">
                  {rangeLen > 31 ? 'Grouped by week' : 'Day-by-day spending per category'}
                </p>
                <CategoryTracker
                  expenses={expenses}
                  chartDates={chartDates}
                  rangeLen={rangeLen}
                />
              </section>
            </div>

            {/* ── 3. Expense Log ── */}
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
                    {/* Date */}
                    <div>
                      <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                      <input type="date" name="date" value={form.date} onChange={handleFormChange} className={inputCls} required />
                    </div>

                    {/* Category */}
                    <div>
                      <label className={labelCls}>Category</label>
                      <select name="category" value={form.category} onChange={handleFormChange} className={inputCls}>
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>

                    {/* Assignee — required for Salary */}
                    <div>
                      <label className={labelCls}>
                        Assignee {form.category === 'Salary' && <span className="text-red-500">*</span>}
                      </label>
                      <select name="assignee" value={form.assignee} onChange={handleFormChange} className={inputCls}>
                        <option value="">— None —</option>
                        <option value="Crew">Crew</option>
                        {employees.map((emp) => {
                          const display = [emp.full_name, emp.last_name].filter(Boolean).join(' ')
                          return <option key={emp.id} value={display}>{display}</option>
                        })}
                      </select>
                    </div>

                    {/* Description — hidden for Salary */}
                    {form.category !== 'Salary' && (
                      <div>
                        <label className={labelCls}>Description <span className="text-red-500">*</span></label>
                        <input type="text" name="description" value={form.description}
                          onChange={handleFormChange}
                          placeholder="e.g. Gas, Food, Cash Advance"
                          className={inputCls} />
                      </div>
                    )}

                    {/* Amount */}
                    <div>
                      <label className={labelCls}>Amount (₱) <span className="text-red-500">*</span></label>
                      <input type="number" name="amount" value={form.amount} onChange={handleFormChange} placeholder="0.00" min="0" step="0.01" className={inputCls} required />
                    </div>

                    {/* Payment Type */}
                    <div>
                      <label className={labelCls}>Payment Type</label>
                      <select name="payment_type" value={form.payment_type} onChange={handleFormChange} className={inputCls}>
                        {PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </div>

                    {/* Notes */}
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
                        <th className="px-6 py-3">Assignee</th>
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
                          <td className="px-6 py-3 text-gray-700">{ex.assignee || '—'}</td>
                          <td className="px-6 py-3 font-medium text-gray-800">
                            {ex.description || '—'}
                          </td>
                          <td className="px-6 py-3"><CategoryBadge category={ex.category} /></td>
                          <td className="whitespace-nowrap px-6 py-3 font-semibold text-gray-900">{formatPHP(ex.amount)}</td>
                          <td className="px-6 py-3 text-gray-500">{ex.payment_type}</td>
                          <td className="px-6 py-3 text-gray-400">{ex.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-100">
                        <td colSpan={4} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Total</td>
                        <td className="px-6 py-3 font-bold text-gray-900">{formatPHP(totalExpenses)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            {/* ── 4. Transaction Log ── */}
            <section className="rounded-2xl bg-white shadow-sm">
              <div className="border-b border-gray-100 px-6 py-4">
                <h2 className="text-base font-semibold text-gray-800">
                  Transaction Log —{' '}
                  <span className="text-sm font-normal" style={{ color: '#B8922A' }}>{formatRangeLabel(range)}</span>
                </h2>
              </div>
              {transactions.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-400">No transactions for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Service</th>
                        <th className="px-6 py-3">Payment</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {transactions.map((tx, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-3 text-gray-500">
                              {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                            </td>
                            <td className="px-6 py-3 text-gray-700">{tx.service_name || '—'}</td>
                            <td className="px-6 py-3 text-gray-500">{tx.payment_method || '—'}</td>
                            <td className="px-6 py-3">
                              {tx.status
                                ? <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    tx.status === 'Deposited' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                  }`}>{tx.status}</span>
                                : '—'}
                            </td>
                            <td className="whitespace-nowrap px-6 py-3 text-right font-semibold text-gray-900">
                              {formatPHP(tx.price)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-100">
                        <td colSpan={4} className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Total Revenue
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-gray-900">
                          {formatPHP(totalRevenue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

          </div>
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

function CategoryBadge({ category }: { category: string }) {
  const cls = CAT_BADGE[category] ?? 'bg-gray-100 text-gray-600'
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{category}</span>
}
