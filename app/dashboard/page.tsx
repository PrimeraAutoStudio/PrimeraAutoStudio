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

const PAYMENT_COLORS: Record<string, string> = {
  Cash: '#B8922A', GCash: '#3b82f6', Maya: '#22c55e', BPI: '#a855f7',
}

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)

  // Live stats — always today
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

  // Fetch selected range
  useEffect(() => {
    if (!range.from || !range.to) return
    async function load() {
      setLoading(true)
      const { data: txR } = await supabase
        .from('transactions')
        .select('date, price, status, service_name, payment_method')
        .gte('date', range.from).lte('date', range.to)
      setTxRange(txR ?? [])
      setLoading(false)
    }
    load()
  }, [range])

  // Snapshot stats
  const isSingleDay    = range.from === range.to
  const snapshotLabel  = isSingleDay ? "Today's Snapshot" : 'Period Summary'
  const carLabel       = isSingleDay ? 'Cars Today' : 'Total Cars'
  const revLabel       = isSingleDay ? 'Revenue Today' : 'Total Revenue'
  const totalCars      = txRange.length
  const totalRevenue   = txRange.reduce((s, t) => s + t.price, 0)
  const onHandTotal    = txRange.filter((t) => t.status === 'On Hand').reduce((s, t) => s + t.price, 0)
  const depositedTotal = txRange.filter((t) => t.status === 'Deposited').reduce((s, t) => s + t.price, 0)

  // ── Revenue by day chart — always follows global range ────────────────────
  const rangeDates    = range.from && range.to ? datesBetween(range.from, range.to) : [todayStr]
  const revenueByDate: Record<string, number> = {}
  const carsByDate:    Record<string, number> = {}
  txRange.forEach((t) => {
    revenueByDate[t.date] = (revenueByDate[t.date] ?? 0) + t.price
    carsByDate[t.date]    = (carsByDate[t.date] ?? 0) + 1
  })

  const chartRevenue = rangeDates.map((d) => revenueByDate[d] ?? 0)
  const chartCars    = rangeDates.map((d) => carsByDate[d] ?? 0)
  const maxRevenue   = Math.max(...chartRevenue, 1)

  const totalChartCars    = chartCars.reduce((s, v) => s + v, 0)
  const totalChartRevenue = chartRevenue.reduce((s, v) => s + v, 0)
  const busiestIdx        = chartCars.indexOf(Math.max(...chartCars))
  const busiestDay        = chartCars[busiestIdx] > 0
    ? new Date(rangeDates[busiestIdx] + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : '—'

  // Smart label step so x-axis doesn't crowd
  const labelStep = rangeDates.length <= 7 ? 1
    : rangeDates.length <= 14 ? 2
    : rangeDates.length <= 31 ? 4 : 7

  // Top services — selected range, split comma-separated
  const serviceMap: Record<string, { count: number; revenue: number }> = {}
  txRange.forEach((t) => {
    const services = t.service_name.split(',').map((s) => s.trim()).filter(Boolean)
    services.forEach((svc) => {
      if (!serviceMap[svc]) serviceMap[svc] = { count: 0, revenue: 0 }
      serviceMap[svc].count++
      serviceMap[svc].revenue += t.price / services.length
    })
  })
  const topServices     = Object.entries(serviceMap).sort((a, b) => b[1].count - a[1].count).slice(0, 5)
  const maxServiceCount = Math.max(...topServices.map((s) => s[1].count), 1)

  // Payment breakdown — selected range
  const paymentMap: Record<string, number> = {}
  txRange.forEach((t) => { paymentMap[t.payment_method] = (paymentMap[t.payment_method] ?? 0) + t.price })
  const paymentTotal   = Object.values(paymentMap).reduce((s, v) => s + v, 0)
  const paymentEntries = Object.entries(paymentMap).sort((a, b) => b[1] - a[1])

  // Export
  async function handleExport(fmt: ExportFormat) {
    setExporting(true)
    const rangeLabel = formatRangeLabel(range)
    const slug = rangeLabel.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase()
    const filename = `primera-dashboard-${slug}`
    const summaryRows: unknown[][] = [
      ['Metric', 'Value'],
      ['Period', rangeLabel],
      ['Total Cars', String(totalCars)],
      ['Total Revenue', formatPHP(totalRevenue)],
      ['On Hand', formatPHP(onHandTotal)],
      ['Deposited', formatPHP(depositedTotal)],
    ]
    const serviceRows  = topServices.map(([name, { count, revenue }], i) => [i + 1, name, count, formatPHP(revenue)])
    const paymentRows  = paymentEntries.map(([method, amount]) => [method, formatPHP(amount), `${((amount / (paymentTotal || 1)) * 100).toFixed(1)}%`])
    if (fmt === 'csv') {
      downloadCsv([['=== SUMMARY ==='], ...summaryRows, [], ['=== TOP SERVICES ==='], ['#', 'Service', 'Cars', 'Revenue'], ...serviceRows, [], ['=== PAYMENT BREAKDOWN ==='], ['Method', 'Amount', '%'], ...paymentRows], `${filename}.csv`)
    } else if (fmt === 'xlsx') {
      await downloadXlsx([{ name: 'Summary', rows: summaryRows }, { name: 'Services', rows: [['#', 'Service', 'Cars', 'Revenue'], ...serviceRows] }, { name: 'Payments', rows: [['Method', 'Amount', '%'], ...paymentRows] }], `${filename}.xlsx`)
    } else {
      await downloadPdf('Dashboard Report', rangeLabel, [{ title: 'Period Summary', head: ['Metric', 'Value'], rows: summaryRows.filter((r) => r.length === 2 && r[0] !== '') }, { title: 'Top Services', head: ['#', 'Service', 'Cars', 'Revenue'], rows: serviceRows }, { title: 'Payment Breakdown', head: ['Method', 'Amount', '%'], rows: paymentRows }], `${filename}.pdf`)
    }
    setExporting(false)
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><p className="text-gray-400">Loading dashboard…</p></div>

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

        {/* Live Stats */}
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

        {/* Period Summary */}
        <section>
          <SectionTitle>{snapshotLabel}</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label={carLabel}  value={String(totalCars)} />
            <StatCard label={revLabel}  value={formatPHP(totalRevenue)} accent />
            <StatCard label="On Hand"   value={formatPHP(onHandTotal)} />
            <StatCard label="Deposited" value={formatPHP(depositedTotal)} />
          </div>
        </section>

        {/* Revenue by Day — follows global range */}
        <section>
          <SectionTitle>Revenue by Day — {formatRangeLabel(range)}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <StatCard label="Total Cars"    value={String(totalChartCars)} />
            <StatCard label="Total Revenue" value={formatPHP(totalChartRevenue)} accent />
            <StatCard label="Busiest Day"   value={busiestDay}
              sub={busiestDay !== '—' ? `${chartCars[busiestIdx]} cars` : undefined} />
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="overflow-x-auto">
              <div className="flex items-end gap-[3px]" style={{ height: '140px', paddingTop: '32px', minWidth: rangeDates.length > 14 ? `${rangeDates.length * 20}px` : 'auto' }}>
                {rangeDates.map((dateStr, i) => {
                  const rev      = chartRevenue[i]
                  const isToday  = dateStr === todayStr
                  const heightPct = rev > 0 ? Math.max((rev / maxRevenue) * 100, 5) : 0
                  const dayNum   = parseInt(dateStr.split('-')[2], 10)
                  const showLabel = i === 0 || i === rangeDates.length - 1 || i % labelStep === 0
                  return (
                    <div key={dateStr} className="group relative flex flex-1 flex-col items-center" style={{ minWidth: '16px' }}>
                      {rev > 0 && (
                        <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-xs text-white group-hover:block z-10">
                          {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} — {formatPHP(rev)}
                        </div>
                      )}
                      <span className="absolute text-[8px] font-semibold whitespace-nowrap"
                        style={{ bottom: '20px', color: '#0a0a0a', transform: 'translateX(-50%)', left: '50%' }}>
                        {rev > 0 ? '₱' + Math.round(rev / 1000).toLocaleString() + 'k' : ''}
                      </span>
                      <div className="w-full rounded-t"
                        style={{ height: rev === 0 ? '2px' : `${heightPct}%`, backgroundColor: isToday ? '#B8922A' : rev > 0 ? '#EDD98A' : '#f3f4f6' }} />
                      <span className="mt-1 text-[9px]" style={{ color: isToday ? '#B8922A' : '#9ca3af', fontWeight: isToday ? 700 : 400 }}>
                        {showLabel ? dayNum : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Top Services + Payment — both follow global range */}
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
                        <div className="h-full rounded-full" style={{ width: `${(count / maxServiceCount) * 100}%`, backgroundColor: '#EDD98A' }} />
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