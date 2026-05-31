'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DateRangeSelector, {
  DateRange,
  formatRangeLabel,
  rangeForPreset,
} from '@/app/components/DateRangeSelector'
import ExportMenu, { ExportFormat } from '@/app/components/ExportMenu'
import { downloadCsv, downloadXlsx, downloadPdf } from '@/lib/export'

interface Transaction {
  date: string; price: number; status: string
  service_name: string; payment_method: string
}

interface Payable { amount: number }

const DAILY_QUOTA = 9.5
const DAY_NAMES   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PAYMENT_COLORS: Record<string, string> = {
  Cash: '#B8922A', GCash: '#3b82f6', Maya: '#22c55e', BPI: '#a855f7',
}

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function monthBoundsFromRange(from: string) {
  const d = new Date(from + 'T00:00:00')
  const year  = d.getFullYear()
  const month = d.getMonth() + 1
  const firstOfMonth = `${year}-${String(month).padStart(2, '0')}-01`
  const lastOfMonth  = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`
  return { firstOfMonth, lastOfMonth, year, month }
}

// Get all dates between from and to
function datesBetween(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (cur <= end) {
    dates.push(isoDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// Get Mon-Sun of week containing the given date
function weekDaysForDate(dateStr: string): Date[] {
  const base = new Date(dateStr + 'T00:00:00')
  const dow  = base.getDay()
  const mon  = new Date(base)
  mon.setDate(base.getDate() - ((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

function StatCard({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-[#B8922A]' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">{children}</h2>
}

export default function DashboardPage() {
  const now      = new Date()
  const todayStr = isoDate(now)

  const [range, setRange]         = useState<DateRange>(rangeForPreset('today'))
  const [txRange, setTxRange]     = useState<Transaction[]>([])
  const [txMonth, setTxMonth]     = useState<Transaction[]>([])
  const [payables, setPayables]   = useState<Payable[]>([])
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)

  // Live stats — always today, auto-refreshes every 30s
  const [liveTx, setLiveTx]           = useState<Transaction[]>([])
  const [liveLoading, setLiveLoading] = useState(true)

  const fetchLive = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('date, price, status, service_name, payment_method')
      .eq('date', todayStr)
    setLiveTx(data ?? [])
    setLiveLoading(false)
  }, [todayStr])

  useEffect(() => {
    fetchLive()
    const id = setInterval(fetchLive, 30_000)
    return () => clearInterval(id)
  }, [fetchLive])

  // Live stats derived
  const liveCars    = liveTx.length
  const liveRevenue = liveTx.reduce((s, t) => s + t.price, 0)
  const liveOnHand  = liveTx.filter((t) => t.status === 'On Hand').reduce((s, t) => s + t.price, 0)
  const liveSvcMap: Record<string, number> = {}
  liveTx.forEach((t) => {
    t.service_name.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => {
      liveSvcMap[s] = (liveSvcMap[s] ?? 0) + 1
    })
  })
  const liveTopServices = Object.entries(liveSvcMap).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // Month bounds for breakeven tracker
  const { firstOfMonth, lastOfMonth, year, month } =
    range.from ? monthBoundsFromRange(range.from) : monthBoundsFromRange(todayStr)

  // Fetch all data for selected range + month for breakeven
  useEffect(() => {
    if (!range.from || !range.to) return
    async function load() {
      setLoading(true)
      const [{ data: txR }, { data: txM }, { data: pa }] = await Promise.all([
        supabase.from('transactions')
          .select('date, price, status, service_name, payment_method')
          .gte('date', range.from).lte('date', range.to),
        supabase.from('transactions')
          .select('date, price, status, service_name, payment_method')
          .gte('date', firstOfMonth).lte('date', lastOfMonth),
        supabase.from('payables').select('amount'),
      ])
      setTxRange(txR ?? [])
      setTxMonth(txM ?? [])
      setPayables(pa ?? [])
      setLoading(false)
    }
    load()
  }, [range, firstOfMonth, lastOfMonth])

  // Snapshot stats from selected range
  const isSingleDay     = range.from === range.to
  const snapshotLabel   = isSingleDay ? "Today's Snapshot" : 'Period Summary'
  const carLabel        = isSingleDay ? 'Cars Today' : 'Total Cars'
  const revLabel        = isSingleDay ? 'Revenue Today' : 'Total Revenue'
  const totalCars       = txRange.length
  const totalRevenue    = txRange.reduce((s, t) => s + t.price, 0)
  const onHandTotal     = txRange.filter((t) => t.status === 'On Hand').reduce((s, t) => s + t.price, 0)
  const depositedTotal  = txRange.filter((t) => t.status === 'Deposited').reduce((s, t) => s + t.price, 0)

  // ── Weekly chart — follows global range ──────────────────────────────────
  // If range is <= 7 days, show those days. If longer, show Mon-Sun of week containing range.from
  const rangeDates = range.from && range.to ? datesBetween(range.from, range.to) : []
  const showWeekChart = rangeDates.length <= 7

  // For <= 7 days: use the range dates directly
  // For > 7 days: use Mon-Sun of week containing range.from
  const weekDays = showWeekChart
    ? rangeDates.map((d) => new Date(d + 'T00:00:00'))
    : weekDaysForDate(range.from || todayStr)

  const weekDayStrs = weekDays.map((d) => isoDate(d))
  const firstOfWeek = weekDayStrs[0]
  const lastOfWeek  = weekDayStrs[weekDayStrs.length - 1]

  // For weekly chart, filter txRange if range <= 7 days, otherwise use txMonth filtered to week
  const txWeekSource = showWeekChart ? txRange : txMonth
  const txWeek = txWeekSource.filter((t) => t.date >= firstOfWeek && t.date <= lastOfWeek)

  const carsThisWeek    = txWeek.length
  const revenueThisWeek = txWeek.reduce((s, t) => s + t.price, 0)

  const weekRevenue: number[] = Array(weekDays.length).fill(0)
  const weekCars:    number[] = Array(weekDays.length).fill(0)
  txWeek.forEach((t) => {
    const idx = weekDayStrs.indexOf(t.date)
    if (idx >= 0) { weekRevenue[idx] += t.price; weekCars[idx]++ }
  })
  const maxWeekRevenue  = Math.max(...weekRevenue, 1)
  const busiestIdx      = weekCars.indexOf(Math.max(...weekCars))
  const busiestDay      = weekCars[busiestIdx] > 0
    ? (showWeekChart
        ? new Date(weekDayStrs[busiestIdx] + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
        : DAY_NAMES[busiestIdx])
    : '—'

  // Breakeven — always calendar month
  const fixedCosts       = payables.reduce((s, p) => s + p.amount, 0)
  const revenueMonth     = txMonth.reduce((s, t) => s + t.price, 0)
  const remaining        = Math.max(fixedCosts - revenueMonth, 0)
  const progressPct      = Math.min((revenueMonth / (fixedCosts || 1)) * 100, 100)
  const aboveBreakeven   = revenueMonth >= fixedCosts
  const totalDays        = daysInMonth(year, month)
  const dayOfMonth       = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : totalDays
  const daysLeft         = Math.max(totalDays - dayOfMonth + 1, 0)
  const carsMonth        = txMonth.length
  const totalQuota       = Math.ceil(DAILY_QUOTA * totalDays)
  const carsStillNeeded  = Math.max(totalQuota - carsMonth, 0)
  const carsPerDayNeeded = daysLeft > 0 ? (carsStillNeeded / daysLeft).toFixed(1) : '0'
  const beMonthLabel     = new Date(year, month - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

  // ── Top services — follows global range, splits comma-separated services ──
  const serviceMap: Record<string, { count: number; revenue: number }> = {}
  txRange.forEach((t) => {
    const services = t.service_name.split(',').map((s) => s.trim()).filter(Boolean)
    services.forEach((svc) => {
      if (!serviceMap[svc]) serviceMap[svc] = { count: 0, revenue: 0 }
      serviceMap[svc].count++
      // Distribute revenue equally among services in a stacked transaction
      serviceMap[svc].revenue += t.price / services.length
    })
  })
  const topServices     = Object.entries(serviceMap).sort((a, b) => b[1].count - a[1].count).slice(0, 5)
  const maxServiceCount = Math.max(...topServices.map((s) => s[1].count), 1)

  // ── Payment breakdown — follows global range ──────────────────────────────
  const paymentMap: Record<string, number> = {}
  txRange.forEach((t) => { paymentMap[t.payment_method] = (paymentMap[t.payment_method] ?? 0) + t.price })
  const paymentTotal   = Object.values(paymentMap).reduce((s, v) => s + v, 0)
  const paymentEntries = Object.entries(paymentMap).sort((a, b) => b[1] - a[1])

  // Export
  async function handleExport(fmt: ExportFormat) {
    setExporting(true)
    const rangeLabel = formatRangeLabel(range)
    const slug       = rangeLabel.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase()
    const filename   = `primera-dashboard-${slug}`
    const summaryRows: unknown[][] = [
      ['Metric', 'Value'],
      ['Period', rangeLabel],
      ['Total Cars', String(totalCars)],
      ['Total Revenue', formatPHP(totalRevenue)],
      ['On Hand', formatPHP(onHandTotal)],
      ['Deposited', formatPHP(depositedTotal)],
      [],
      ['Breakeven — ' + beMonthLabel, ''],
      ['Fixed Costs', formatPHP(fixedCosts)],
      ['Month Revenue', formatPHP(revenueMonth)],
      ['Progress', `${progressPct.toFixed(1)}%`],
      ['Status', aboveBreakeven ? 'Above Breakeven' : 'Below Breakeven'],
    ]
    const serviceRows = topServices.map(([name, { count, revenue }], i) => [i + 1, name, count, formatPHP(revenue)])
    const paymentRows = paymentEntries.map(([method, amount]) => [method, formatPHP(amount), `${((amount / (paymentTotal || 1)) * 100).toFixed(1)}%`])
    if (fmt === 'csv') {
      downloadCsv([['=== SUMMARY ==='], ...summaryRows, [], ['=== TOP SERVICES ==='], ['#', 'Service', 'Cars', 'Revenue'], ...serviceRows, [], ['=== PAYMENT BREAKDOWN ==='], ['Method', 'Amount', '%'], ...paymentRows], `${filename}.csv`)
    } else if (fmt === 'xlsx') {
      await downloadXlsx([{ name: 'Summary', rows: summaryRows }, { name: 'Services', rows: [['#', 'Service', 'Cars', 'Revenue'], ...serviceRows] }, { name: 'Payments', rows: [['Method', 'Amount', '%'], ...paymentRows] }], `${filename}.xlsx`)
    } else {
      await downloadPdf('Dashboard Report', rangeLabel, [{ title: 'Period Summary', head: ['Metric', 'Value'], rows: summaryRows.filter((r) => r.length === 2 && r[0] !== '') }, { title: 'Top Services', head: ['#', 'Service', 'Cars', 'Revenue'], rows: serviceRows }, { title: 'Payment Breakdown', head: ['Method', 'Amount', '%'], rows: paymentRows }], `${filename}.pdf`)
    }
    setExporting(false)
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><p className="text-gray-400">Loading dashboard…</p></div>
  }

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Header */}
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <ExportMenu onExport={handleExport} loading={exporting} />
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <DateRangeSelector value={range} onChange={setRange} />
            <p className="mt-2 text-xs text-gray-400">
              Showing: <span className="font-medium text-gray-600">{formatRangeLabel(range)}</span>
            </p>
          </div>
        </div>

        {/* Live Stats — always today */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>Live — Today</SectionTitle>
            <span className="text-xs text-gray-400">
              {liveLoading ? 'Refreshing…' : `${liveCars} car${liveCars !== 1 ? 's' : ''} · auto-refreshes every 30s`}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Cars Today" value={String(liveCars)} />
            <StatCard label="Revenue"    value={formatPHP(liveRevenue)} accent />
            <StatCard label="On Hand"    value={formatPHP(liveOnHand)} />
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Top Services</p>
              {liveTopServices.length === 0
                ? <p className="text-sm text-gray-400">No data yet</p>
                : liveTopServices.map(([svc, cnt]) => (
                    <div key={svc} className="flex items-center justify-between text-sm">
                      <span className="truncate text-gray-700">{svc}</span>
                      <span className="ml-2 font-bold text-gray-900">{cnt}</span>
                    </div>
                  ))}
            </div>
          </div>
        </section>

        {/* Snapshot / Period Summary */}
        <section>
          <SectionTitle>{snapshotLabel}</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label={carLabel}  value={String(totalCars)} />
            <StatCard label={revLabel}  value={formatPHP(totalRevenue)} accent />
            <StatCard label="On Hand"   value={formatPHP(onHandTotal)} />
            <StatCard label="Deposited" value={formatPHP(depositedTotal)} />
          </div>
        </section>

        {/* Weekly / Range Chart */}
        <section>
          <SectionTitle>
            {showWeekChart
              ? `${formatRangeLabel(range)} — Revenue by Day`
              : `Week of ${firstOfWeek} – ${lastOfWeek}`}
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Cars" value={String(carsThisWeek)} />
            <StatCard label="Revenue" value={formatPHP(revenueThisWeek)} accent />
            <StatCard label="Busiest Day" value={busiestDay}
              sub={busiestDay !== '—' ? `${weekCars[busiestIdx]} cars` : undefined} />
          </div>
          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Revenue by Day</p>
            <div className="flex items-end gap-2" style={{ height: '120px' }}>
              {weekDays.map((d, i) => {
                const ds       = isoDate(d)
                const isToday  = ds === todayStr
                const isFuture = d > now
                const inRange  = ds >= (range.from || '') && ds <= (range.to || '')
                const heightPct = weekRevenue[i] > 0 ? Math.max((weekRevenue[i] / maxWeekRevenue) * 100, 5) : 0
                const dayLabel  = showWeekChart
                  ? new Date(ds + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                  : DAY_NAMES[i]
                return (
                  <div key={i} className="group relative flex flex-1 flex-col items-center gap-1">
                    {weekRevenue[i] > 0 && (
                      <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-xs text-white group-hover:block">
                        {formatPHP(weekRevenue[i])}
                      </div>
                    )}
                    <div className="flex w-full flex-col justify-end" style={{ height: '96px' }}>
                      <div className="w-full rounded-t transition-all" style={{
                        height: weekRevenue[i] === 0 ? '2px' : `${heightPct}%`,
                        backgroundColor: isFuture ? '#e5e7eb' : isToday ? '#B8922A' : inRange && weekRevenue[i] > 0 ? '#EDD98A' : '#f3f4f6',
                      }} />
                    </div>
                    <span className={`text-xs font-medium ${isToday ? 'text-[#B8922A]' : inRange ? 'text-gray-600' : 'text-gray-300'}`}>
                      {dayLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Breakeven Tracker — always calendar month */}
        <section>
          <SectionTitle>Breakeven Tracker — {beMonthLabel}</SectionTitle>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Monthly Fixed Costs</p>
                <p className="text-xl font-bold text-gray-900">{formatPHP(fixedCosts)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Revenue This Month</p>
                <p className={`text-xl font-bold ${aboveBreakeven ? 'text-green-600' : 'text-red-500'}`}>{formatPHP(revenueMonth)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {aboveBreakeven ? 'Above Breakeven By' : 'Still Needed'}
                </p>
                <p className={`text-xl font-bold ${aboveBreakeven ? 'text-green-600' : 'text-red-500'}`}>
                  {formatPHP(aboveBreakeven ? revenueMonth - fixedCosts : remaining)}
                </p>
              </div>
            </div>
            <div className="mb-1 h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%`, backgroundColor: aboveBreakeven ? '#22c55e' : '#ef4444' }} />
            </div>
            <div className="mb-5 flex justify-between text-xs text-gray-400">
              <span>₱0</span>
              <span>{progressPct.toFixed(1)}% of target</span>
              <span>{formatPHP(fixedCosts)}</span>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-semibold text-gray-700">Daily quota: </span>
                  <span className="font-bold text-[#B8922A]">{DAILY_QUOTA} cars/day</span>
                </div>
                <div className="hidden h-4 w-px bg-gray-200 sm:block" />
                <div>
                  <span className="font-semibold text-gray-700">Cars still needed: </span>
                  <span className={`font-bold ${carsStillNeeded === 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {carsStillNeeded === 0 ? 'On track ✓' : `${carsStillNeeded} cars`}
                  </span>
                </div>
                <div className="hidden h-4 w-px bg-gray-200 sm:block" />
                <div>
                  <span className="font-semibold text-gray-700">Per day ({daysLeft}d left): </span>
                  <span className={`font-bold ${parseFloat(carsPerDayNeeded) <= DAILY_QUOTA ? 'text-green-600' : 'text-red-500'}`}>
                    {carsStillNeeded === 0 ? '—' : `${carsPerDayNeeded}/day`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Top Services + Payment Breakdown — both follow global range */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <SectionTitle>Top Services</SectionTitle>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              {topServices.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No data for this period.</p>
              ) : (
                <div className="space-y-3">
                  {topServices.map(([name, { count, revenue }], i) => (
                    <div key={name}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                          <span className="font-medium text-gray-800">{name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{count} cars</span>
                          <span className="font-semibold text-gray-900">{formatPHP(revenue)}</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full"
                          style={{ width: `${(count / maxServiceCount) * 100}%`, backgroundColor: '#EDD98A' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <SectionTitle>Payment Method Breakdown</SectionTitle>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              {paymentEntries.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No data for this period.</p>
              ) : (
                <>
                  <div className="mb-5 flex h-5 w-full overflow-hidden rounded-full">
                    {paymentEntries.map(([method, amount]) => (
                      <div key={method} title={`${method}: ${formatPHP(amount)}`}
                        style={{ width: `${(amount / paymentTotal) * 100}%`, backgroundColor: PAYMENT_COLORS[method] ?? '#9ca3af' }} />
                    ))}
                  </div>
                  <div className="space-y-2.5">
                    {paymentEntries.map(([method, amount]) => {
                      const pct = ((amount / paymentTotal) * 100).toFixed(1)
                      return (
                        <div key={method} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: PAYMENT_COLORS[method] ?? '#9ca3af' }} />
                            <span className="font-medium text-gray-700">{method}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{pct}%</span>
                            <span className="font-semibold text-gray-900">{formatPHP(amount)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex justify-between border-t border-gray-100 pt-3 text-sm">
                    <span className="font-semibold text-gray-500">Total</span>
                    <span className="font-bold text-gray-900">{formatPHP(paymentTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}