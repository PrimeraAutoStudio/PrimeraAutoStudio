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
  service_name: string; payment_method: string; team: string | null
  size_category: string
}

interface ServicePriceRow { service_name: string; size_category: string; price: number }

const PAYMENT_COLORS: Record<string, string> = {
  Cash: '#B8922A', GCash: '#3b82f6', Maya: '#22c55e', BPI: '#a855f7',
}

const BASE_SERVICES = ['Basic Wash', 'Body Wash', 'Others']
const TEAM_COLORS   = ['#B8922A', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#f59e0b']
const SIZE_ORDER    = ['Motorcycle', 'Extra Small', 'Small', 'Medium', 'Large', 'Extra Large']

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
  while (cur <= end) { dates.push(isoDate(cur)); cur.setDate(cur.getDate() + 1) }
  return dates
}

function isAddon(svc: string): boolean {
  return !BASE_SERVICES.some((b) => b.toLowerCase() === svc.trim().toLowerCase())
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

interface TeamStats {
  cars: number          // total cars
  carwashes: number     // basic wash only count
  addons: number        // add-on service count
  revenue: number       // total revenue
  addonMap:    Record<string, { count: number; revenue: number }>
  sizeMap:     Record<string, number>
  serviceMap:  Record<string, { count: number; revenue: number }>
}

type LeaderboardView = 'carwashes' | 'addons' | 'revenue'
type DropdownTab     = 'addons' | 'sizes' | 'services'

export default function DashboardPage() {
  const now      = new Date()
  const todayStr = isoDate(now)

  const [range, setRange]               = useState<DateRange>(rangeForPreset('today'))
  const [txRange, setTxRange]           = useState<Transaction[]>([])
  const [servicePrices, setServicePrices] = useState<ServicePriceRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [exporting, setExporting]       = useState(false)
  const [teams, setTeams]               = useState<string[]>(['Team A', 'Team B', 'Team C', 'Team D'])
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [activeTab, setActiveTab]       = useState<Record<string, DropdownTab>>({})
  const [lbView, setLbView]             = useState<LeaderboardView>('carwashes')

  const [liveTx, setLiveTx]           = useState<Transaction[]>([])
  const [liveLoading, setLiveLoading] = useState(true)

  const fetchLive = useCallback(async () => {
    const { data } = await supabase.from('transactions')
      .select('date, price, status, service_name, payment_method, team, size_category').eq('date', todayStr)
    setLiveTx(data ?? []); setLiveLoading(false)
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

  useEffect(() => {
    if (!range.from || !range.to) return
    async function load() {
      setLoading(true)
      const [{ data: txR }, { data: st }, { data: sp }] = await Promise.all([
        supabase.from('transactions')
          .select('date, price, status, service_name, payment_method, team, size_category')
          .gte('date', range.from).lte('date', range.to),
        supabase.from('settings').select('teams').eq('id', '1').single(),
        supabase.from('service_prices').select('service_name, size_category, price'),
      ])
      setTxRange(txR ?? [])
      if (st?.teams) setTeams(st.teams)
      if (sp) setServicePrices(sp)
      setLoading(false)
    }
    load()
  }, [range])

  function priceFor(svcName: string, sizeCat: string): number {
    return servicePrices.find((sp) => sp.service_name === svcName && sp.size_category === sizeCat)?.price ?? 0
  }

  // Snapshot
  const isSingleDay    = range.from === range.to
  const snapshotLabel  = isSingleDay ? "Today's Snapshot" : 'Period Summary'
  const carLabel       = isSingleDay ? 'Cars Today' : 'Total Cars'
  const revLabel       = isSingleDay ? 'Revenue Today' : 'Total Revenue'
  const totalCars      = txRange.length
  const totalRevenue   = txRange.reduce((s, t) => s + t.price, 0)
  const onHandTotal    = txRange.filter((t) => t.status === 'On Hand').reduce((s, t) => s + t.price, 0)
  const depositedTotal = txRange.filter((t) => t.status === 'Deposited').reduce((s, t) => s + t.price, 0)

  // Revenue chart
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
  const busiestIdx   = chartCars.indexOf(Math.max(...chartCars))
  const busiestDay   = chartCars[busiestIdx] > 0
    ? new Date(rangeDates[busiestIdx] + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : '—'
  const labelStep = rangeDates.length <= 7 ? 1 : rangeDates.length <= 14 ? 2 : rangeDates.length <= 31 ? 4 : 7

  // Top services
  const svcMap: Record<string, { count: number; revenue: number }> = {}
  txRange.forEach((t) => {
    const svcs = t.service_name.split(',').map((s) => s.trim()).filter(Boolean)
    svcs.forEach((svc) => {
      if (!svcMap[svc]) svcMap[svc] = { count: 0, revenue: 0 }
      svcMap[svc].count++
      svcMap[svc].revenue += t.price / svcs.length
    })
  })
  const topServices     = Object.entries(svcMap).sort((a, b) => b[1].count - a[1].count).slice(0, 5)
  const maxServiceCount = Math.max(...topServices.map((s) => s[1].count), 1)

  // Payment
  const paymentMap: Record<string, number> = {}
  txRange.forEach((t) => { paymentMap[t.payment_method] = (paymentMap[t.payment_method] ?? 0) + t.price })
  const paymentTotal   = Object.values(paymentMap).reduce((s, v) => s + v, 0)
  const paymentEntries = Object.entries(paymentMap).sort((a, b) => b[1] - a[1])

  // ── Team Stats ────────────────────────────────────────────────────────────

  const teamStats: Record<string, TeamStats> = {}
  teams.forEach((t) => { teamStats[t] = { cars: 0, carwashes: 0, addons: 0, revenue: 0, addonMap: {}, sizeMap: {}, serviceMap: {} } })

  txRange.forEach((t) => {
    if (!t.team) return
    const key = t.team
    if (!teamStats[key]) teamStats[key] = { cars: 0, carwashes: 0, addons: 0, revenue: 0, addonMap: {}, sizeMap: {}, serviceMap: {} }

    teamStats[key].cars++
    teamStats[key].revenue += t.price

    // Size
    const sz = t.size_category || 'Unknown'
    teamStats[key].sizeMap[sz] = (teamStats[key].sizeMap[sz] ?? 0) + 1

    // Services
    const svcs = t.service_name.split(',').map((s) => s.trim()).filter(Boolean)
    svcs.forEach((svc) => {
      const svcPrice = priceFor(svc, t.size_category)

      // All services map
      if (!teamStats[key].serviceMap[svc]) teamStats[key].serviceMap[svc] = { count: 0, revenue: 0 }
      teamStats[key].serviceMap[svc].count++
      teamStats[key].serviceMap[svc].revenue += svcPrice

      if (isAddon(svc)) {
        // Add-on tracking
        teamStats[key].addons++
        if (!teamStats[key].addonMap[svc]) teamStats[key].addonMap[svc] = { count: 0, revenue: 0 }
        teamStats[key].addonMap[svc].count++
        teamStats[key].addonMap[svc].revenue += svcPrice
      } else if (svc === 'Basic Wash') {
        // Basic wash count
        teamStats[key].carwashes++
      }
    })
  })

  // Sort per view
  function sortedFor(view: LeaderboardView) {
    return teams
      .filter((t) => teamStats[t])
      .sort((a, b) => {
        if (view === 'carwashes') return teamStats[b].carwashes - teamStats[a].carwashes
        if (view === 'addons')   return teamStats[b].addons - teamStats[a].addons
        return teamStats[b].revenue - teamStats[a].revenue
      })
  }

  const sortedTeams    = sortedFor(lbView)
  const unassignedCars = txRange.filter((t) => !t.team).length

  // Max value per view for progress bar
  const maxVal = Math.max(...sortedTeams.map((t) => {
    if (lbView === 'carwashes') return teamStats[t].carwashes
    if (lbView === 'addons')   return teamStats[t].addons
    return teamStats[t].revenue
  }), 1)

  function teamValue(team: string): number {
    if (lbView === 'carwashes') return teamStats[team].carwashes
    if (lbView === 'addons')   return teamStats[team].addons
    return teamStats[team].revenue
  }

  function teamValueLabel(team: string): string {
    if (lbView === 'carwashes') return `${teamStats[team].carwashes} wash${teamStats[team].carwashes !== 1 ? 'es' : ''}`
    if (lbView === 'addons')   return `${teamStats[team].addons} add-on${teamStats[team].addons !== 1 ? 's' : ''}`
    return formatPHP(teamStats[team].revenue)
  }

  function getTab(team: string): DropdownTab { return activeTab[team] ?? 'addons' }
  function setTab(team: string, tab: DropdownTab) { setActiveTab((prev) => ({ ...prev, [team]: tab })) }

  // Export
  async function handleExport(fmt: ExportFormat) {
    setExporting(true)
    const rangeLabel = formatRangeLabel(range)
    const slug = rangeLabel.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase()
    const filename = `primera-dashboard-${slug}`
    const summaryRows: unknown[][] = [
      ['Metric', 'Value'], ['Period', rangeLabel],
      ['Total Cars', String(totalCars)], ['Total Revenue', formatPHP(totalRevenue)],
      ['On Hand', formatPHP(onHandTotal)], ['Deposited', formatPHP(depositedTotal)],
    ]
    const serviceRows = topServices.map(([name, { count, revenue }], i) => [i + 1, name, count, formatPHP(revenue)])
    const paymentRows = paymentEntries.map(([m, a]) => [m, formatPHP(a), `${((a / (paymentTotal || 1)) * 100).toFixed(1)}%`])
    const teamRows    = teams.map((t, i) => [i + 1, t, teamStats[t].cars, teamStats[t].carwashes, teamStats[t].addons, formatPHP(teamStats[t].revenue)])
    if (fmt === 'csv') {
      downloadCsv([['=== SUMMARY ==='], ...summaryRows, [], ['=== TOP SERVICES ==='], ['#', 'Service', 'Cars', 'Revenue'], ...serviceRows, [], ['=== PAYMENT BREAKDOWN ==='], ['Method', 'Amount', '%'], ...paymentRows, [], ['=== TEAM LEADERBOARD ==='], ['#', 'Team', 'Total Cars', 'Carwashes', 'Add-ons', 'Revenue'], ...teamRows], `${filename}.csv`)
    } else if (fmt === 'xlsx') {
      await downloadXlsx([{ name: 'Summary', rows: summaryRows }, { name: 'Services', rows: [['#', 'Service', 'Cars', 'Revenue'], ...serviceRows] }, { name: 'Payments', rows: [['Method', 'Amount', '%'], ...paymentRows] }, { name: 'Leaderboard', rows: [['#', 'Team', 'Total Cars', 'Carwashes', 'Add-ons', 'Revenue'], ...teamRows] }], `${filename}.xlsx`)
    } else {
      await downloadPdf('Dashboard Report', rangeLabel, [{ title: 'Period Summary', head: ['Metric', 'Value'], rows: summaryRows.filter((r) => r.length === 2 && r[0] !== '') }, { title: 'Top Services', head: ['#', 'Service', 'Cars', 'Revenue'], rows: serviceRows }, { title: 'Team Leaderboard', head: ['#', 'Team', 'Cars', 'Carwashes', 'Add-ons', 'Revenue'], rows: teamRows }], `${filename}.pdf`)
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

        {/* Revenue by Day */}
        <section>
          <SectionTitle>Revenue by Day — {formatRangeLabel(range)}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <StatCard label="Total Cars"    value={String(totalCars)} />
            <StatCard label="Total Revenue" value={formatPHP(totalRevenue)} accent />
            <StatCard label="Busiest Day"   value={busiestDay}
              sub={busiestDay !== '—' ? `${chartCars[busiestIdx]} cars` : undefined} />
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="overflow-x-auto">
              <div className="flex items-end gap-[3px]"
                style={{ height: '140px', paddingTop: '32px', minWidth: rangeDates.length > 14 ? `${rangeDates.length * 20}px` : 'auto' }}>
                {rangeDates.map((dateStr, i) => {
                  const rev = chartRevenue[i]; const isToday = dateStr === todayStr
                  const heightPct = rev > 0 ? Math.max((rev / maxRevenue) * 100, 5) : 0
                  const dayNum = parseInt(dateStr.split('-')[2], 10)
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
                      <span className="mt-1 text-[9px]"
                        style={{ color: isToday ? '#B8922A' : '#9ca3af', fontWeight: isToday ? 700 : 400 }}>
                        {showLabel ? dayNum : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── Team Leaderboard ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle>Team Leaderboard</SectionTitle>
            <span className="text-xs text-gray-400">{formatRangeLabel(range)}</span>
          </div>
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">

            {/* Three category tabs */}
            <div className="flex border-b border-gray-100">
              {([
                { key: 'carwashes', label: '🚗 Most Carwashes',  sub: 'Basic Wash count' },
                { key: 'addons',    label: '⭐ Most Add-ons',    sub: 'Upsell count' },
                { key: 'revenue',   label: '💰 Most Revenue',   sub: 'Total earnings' },
              ] as { key: LeaderboardView; label: string; sub: string }[]).map(({ key, label, sub }) => (
                <button key={key} onClick={() => setLbView(key)}
                  className="flex-1 py-3 px-2 text-center transition-colors border-b-2"
                  style={{
                    borderBottomColor: lbView === key ? '#B8922A' : 'transparent',
                    backgroundColor:   lbView === key ? 'rgba(184,146,42,0.05)' : 'transparent',
                  }}>
                  <p className="text-xs font-semibold" style={{ color: lbView === key ? '#B8922A' : '#6b7280' }}>{label}</p>
                  <p className="text-[10px] text-gray-400">{sub}</p>
                </button>
              ))}
            </div>

            <div className="p-5">
              {sortedTeams.length === 0 || sortedTeams.every((t) => teamStats[t].cars === 0) ? (
                <p className="py-6 text-center text-sm text-gray-400">No team data for this period. Assign teams during check-in.</p>
              ) : (
                <div className="space-y-3">
                  {sortedTeams.map((team, i) => {
                    const stats      = teamStats[team]
                    const val        = teamValue(team)
                    const barPct     = maxVal > 0 ? (val / maxVal) * 100 : 0
                    const color      = TEAM_COLORS[teams.indexOf(team) % TEAM_COLORS.length]
                    const isFirst    = i === 0 && val > 0
                    const isExpanded = expandedTeam === team
                    const tab        = getTab(team)

                    const addonEntries   = Object.entries(stats.addonMap).sort((a, b) => b[1].count - a[1].count)
                    const sizeEntries    = SIZE_ORDER.filter((s) => stats.sizeMap[s] > 0).map((s) => [s, stats.sizeMap[s]] as [string, number])
                    const serviceEntries = Object.entries(stats.serviceMap).sort((a, b) => b[1].count - a[1].count)
                    const totalAddonRev  = addonEntries.reduce((s, [, v]) => s + v.revenue, 0)
                    const totalSvcRev    = serviceEntries.reduce((s, [, v]) => s + v.revenue, 0)

                    return (
                      <div key={team} className="rounded-xl border border-gray-100 overflow-hidden">

                        {/* Team row */}
                        <div className="px-4 py-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isFirst && <span className="text-base">🏆</span>}
                              <span className="text-sm font-bold" style={{ color: isFirst ? color : '#374151' }}>
                                #{i + 1} {team}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {/* Always show all three stats */}
                              <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span title="Basic Wash count">
                                  🚗 <strong className="text-gray-900">{stats.carwashes}</strong>
                                </span>
                                <span title="Add-on count">
                                  ⭐ <strong className="text-gray-900">{stats.addons}</strong>
                                </span>
                                <span title="Revenue">
                                  <strong className="text-gray-900">{formatPHP(stats.revenue)}</strong>
                                </span>
                              </div>
                              <button
                                onClick={() => setExpandedTeam(isExpanded ? null : team)}
                                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
                                style={{ backgroundColor: isExpanded ? 'rgba(184,146,42,0.15)' : 'rgba(184,146,42,0.08)', color: '#B8922A' }}>
                                Details {isExpanded ? '▲' : '▼'}
                              </button>
                            </div>
                          </div>
                          {/* Progress bar based on current view */}
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${barPct}%`, backgroundColor: color }} />
                          </div>
                          {/* Value label below bar */}
                          <p className="mt-1 text-right text-[10px]" style={{ color }}>
                            {teamValueLabel(team)}
                          </p>
                        </div>

                        {/* Details dropdown */}
                        {isExpanded && (
                          <div className="border-t border-gray-100" style={{ backgroundColor: 'rgba(184,146,42,0.03)' }}>
                            <div className="flex border-b border-gray-100">
                              {([
                                { key: 'addons',   label: `Add-ons (${stats.addons})` },
                                { key: 'sizes',    label: `Sizes (${stats.cars})` },
                                { key: 'services', label: 'All Services' },
                              ] as { key: DropdownTab; label: string }[]).map(({ key, label }) => (
                                <button key={key} onClick={() => setTab(team, key)}
                                  className="flex-1 py-2 text-xs font-semibold transition-colors border-b-2"
                                  style={{
                                    borderBottomColor: tab === key ? color : 'transparent',
                                    color: tab === key ? color : '#9ca3af',
                                    backgroundColor: tab === key ? 'rgba(184,146,42,0.06)' : 'transparent',
                                  }}>
                                  {label}
                                </button>
                              ))}
                            </div>

                            <div className="px-4 py-3">

                              {/* Add-ons tab */}
                              {tab === 'addons' && (
                                addonEntries.length === 0 ? (
                                  <p className="py-2 text-xs text-gray-400">No add-on services for this period.</p>
                                ) : (
                                  <>
                                    <div className="space-y-1.5">
                                      {addonEntries.map(([svc, { count, revenue }]) => (
                                        <div key={svc} className="flex items-center justify-between text-xs">
                                          <div className="flex items-center gap-2">
                                            <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                            <span className="text-gray-700 font-medium">{svc}</span>
                                          </div>
                                          <div className="flex items-center gap-3 text-gray-500">
                                            <span className="font-semibold text-gray-900">×{count}</span>
                                            <span className="w-20 text-right">{formatPHP(revenue)}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-xs font-semibold">
                                      <span className="text-gray-500">Total add-on revenue</span>
                                      <span style={{ color }}>{formatPHP(totalAddonRev)}</span>
                                    </div>
                                  </>
                                )
                              )}

                              {/* Sizes tab */}
                              {tab === 'sizes' && (
                                sizeEntries.length === 0 ? (
                                  <p className="py-2 text-xs text-gray-400">No size data.</p>
                                ) : (
                                  <>
                                    <div className="space-y-2">
                                      {sizeEntries.map(([size, count]) => {
                                        const pct = stats.cars > 0 ? (count / stats.cars) * 100 : 0
                                        return (
                                          <div key={size}>
                                            <div className="mb-1 flex justify-between text-xs">
                                              <span className="font-medium text-gray-700">{size}</span>
                                              <span className="text-gray-500">
                                                <strong className="text-gray-900">{count}</strong> car{count !== 1 ? 's' : ''}
                                                <span className="ml-2 text-gray-400">({pct.toFixed(0)}%)</span>
                                              </span>
                                            </div>
                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                    <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-xs font-semibold">
                                      <span className="text-gray-500">Total cars</span>
                                      <span style={{ color }}>{stats.cars}</span>
                                    </div>
                                  </>
                                )
                              )}

                              {/* Services tab */}
                              {tab === 'services' && (
                                serviceEntries.length === 0 ? (
                                  <p className="py-2 text-xs text-gray-400">No service data.</p>
                                ) : (
                                  <>
                                    <div className="space-y-1.5">
                                      {serviceEntries.map(([svc, { count, revenue }]) => {
                                        const addon = isAddon(svc)
                                        return (
                                          <div key={svc} className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                              <span className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: addon ? color : '#d1d5db' }} />
                                              <span className="text-gray-700 font-medium">{svc}</span>
                                              {addon && (
                                                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                                                  style={{ backgroundColor: 'rgba(184,146,42,0.1)', color }}>
                                                  add-on
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-3 text-gray-500">
                                              <span className="font-semibold text-gray-900">×{count}</span>
                                              <span className="w-20 text-right">{formatPHP(revenue)}</span>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                    <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-xs font-semibold">
                                      <span className="text-gray-500">Total service revenue</span>
                                      <span style={{ color }}>{formatPHP(totalSvcRev)}</span>
                                    </div>
                                  </>
                                )
                              )}

                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Unassigned */}
                  {unassignedCars > 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>No Team Assigned</span>
                        <span>{unassignedCars} car{unassignedCars !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-[10px] text-gray-400">
                  Switch between <strong>Most Carwashes</strong> (Basic Wash count), <strong>Most Add-ons</strong> (upsell count), and <strong>Most Revenue</strong>. Each team shows all three stats — the progress bar follows the active category.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Top Services + Payment */}
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