'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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

// Smaller padding on mobile
function StatCard({ label, value, sub, accent = false }: {
  label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 truncate">{label}</p>
      <p className={`mt-1 text-xl font-bold sm:text-2xl ${accent ? 'text-[#B8922A]' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 sm:mb-4">{children}</h2>
}

const DEFAULT_SECTION_ORDER = ['live', 'summary', 'revenue', 'cars', 'leaderboard', 'services-payment']
const LS_KEY = 'dashboard-section-order'

function SortableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <div className="group relative">
        <button
          {...attributes} {...listeners}
          className="absolute -left-5 top-0 hidden cursor-grab touch-none select-none text-gray-300 group-hover:flex items-center sm:flex"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >⠿</button>
        {children}
      </div>
    </div>
  )
}

interface TeamStats {
  cars: number; carwashes: number; addons: number; revenue: number
  addonMap:   Record<string, { count: number; revenue: number }>
  sizeMap:    Record<string, number>
  serviceMap: Record<string, { count: number; revenue: number }>
}

type LeaderboardView = 'carwashes' | 'addons' | 'revenue'
type DropdownTab     = 'addons' | 'sizes' | 'services'

export default function DashboardPage() {
  const now      = new Date()
  const todayStr = isoDate(now)

  const [range, setRange]               = useState<DateRange>(rangeForPreset('today'))
  const [txRange, setTxRange]           = useState<Transaction[]>([])
  const [totalExpenses, setTotalExpenses] = useState(0)
  const [servicePrices, setServicePrices] = useState<ServicePriceRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [exporting, setExporting]       = useState(false)
  const [teams, setTeams]               = useState<string[]>(['Team A', 'Team B', 'Team C', 'Team D'])
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [activeTab, setActiveTab]       = useState<Record<string, DropdownTab>>({})
  const [lbView, setLbView]             = useState<LeaderboardView>('carwashes')
  const [revHoverIdx, setRevHoverIdx]   = useState<number | null>(null)
  const [carsHoverIdx, setCarsHoverIdx] = useState<number | null>(null)
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_SECTION_ORDER
    try {
      const saved: string[] = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') ?? []
      if (!saved.length) return DEFAULT_SECTION_ORDER
      const newSections = DEFAULT_SECTION_ORDER.filter((id) => !saved.includes(id))
      return [...saved, ...newSections]
    } catch { return DEFAULT_SECTION_ORDER }
  })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSectionOrder((prev) => {
      const next = arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id)))
      localStorage.setItem(LS_KEY, JSON.stringify(next))
      return next
    })
  }

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

  const fetchRangeData = useCallback(async () => {
    if (!range.from || !range.to) return
    setLoading(true)
    const [{ data: txR }, { data: st }, { data: sp }, { data: expR }] = await Promise.all([
      supabase.from('transactions')
        .select('date, price, status, service_name, payment_method, team, size_category')
        .gte('date', range.from).lte('date', range.to),
      supabase.from('settings').select('teams').eq('id', '1').single(),
      supabase.from('service_prices').select('service_name, size_category, price'),
      supabase.from('expenses').select('amount').gte('date', range.from).lte('date', range.to).neq('is_deleted', true),
    ])
    setTxRange(txR ?? [])
    if (st?.teams) setTeams(st.teams)
    if (sp) setServicePrices(sp)
    setTotalExpenses((expR ?? []).reduce((s: number, e: { amount: number }) => s + (e.amount ?? 0), 0))
    setLoading(false)
  }, [range])

  useEffect(() => { fetchRangeData() }, [fetchRangeData])

  useEffect(() => {
    const channel = supabase.channel('dashboard-expenses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => { fetchRangeData() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchRangeData])

  function priceFor(svcName: string, sizeCat: string): number {
    return servicePrices.find((sp) => sp.service_name === svcName && sp.size_category === sizeCat)?.price ?? 0
  }

  const isSingleDay    = range.from === range.to
  const snapshotLabel  = isSingleDay ? "Today's Snapshot" : 'Period Summary'
  const carLabel       = isSingleDay ? 'Cars Today' : 'Total Cars'
  const revLabel       = isSingleDay ? 'Revenue Today' : 'Total Revenue'
  const totalCars    = txRange.length
  const totalRevenue = txRange.reduce((s, t) => s + t.price, 0)
  const netProfit    = totalRevenue - totalExpenses

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

  const paymentMap: Record<string, number> = {}
  txRange.forEach((t) => { paymentMap[t.payment_method] = (paymentMap[t.payment_method] ?? 0) + t.price })
  const paymentTotal   = Object.values(paymentMap).reduce((s, v) => s + v, 0)
  const paymentEntries = Object.entries(paymentMap).sort((a, b) => b[1] - a[1])

  const teamStats: Record<string, TeamStats> = {}
  teams.forEach((t) => { teamStats[t] = { cars: 0, carwashes: 0, addons: 0, revenue: 0, addonMap: {}, sizeMap: {}, serviceMap: {} } })

  txRange.forEach((t) => {
    if (!t.team) return
    const key = t.team
    if (!teamStats[key]) teamStats[key] = { cars: 0, carwashes: 0, addons: 0, revenue: 0, addonMap: {}, sizeMap: {}, serviceMap: {} }
    teamStats[key].cars++
    teamStats[key].revenue += t.price
    const sz = t.size_category || 'Unknown'
    teamStats[key].sizeMap[sz] = (teamStats[key].sizeMap[sz] ?? 0) + 1
    const svcs = t.service_name.split(',').map((s) => s.trim()).filter(Boolean)
    svcs.forEach((svc) => {
      const svcPrice = priceFor(svc, t.size_category)
      if (!teamStats[key].serviceMap[svc]) teamStats[key].serviceMap[svc] = { count: 0, revenue: 0 }
      teamStats[key].serviceMap[svc].count++
      teamStats[key].serviceMap[svc].revenue += svcPrice
      if (isAddon(svc)) {
        teamStats[key].addons++
        if (!teamStats[key].addonMap[svc]) teamStats[key].addonMap[svc] = { count: 0, revenue: 0 }
        teamStats[key].addonMap[svc].count++
        teamStats[key].addonMap[svc].revenue += svcPrice
      } else if (svc === 'Basic Wash') {
        teamStats[key].carwashes++
      }
    })
  })

  function sortedFor(view: LeaderboardView) {
    return teams.filter((t) => teamStats[t]).sort((a, b) => {
      if (view === 'carwashes') return teamStats[b].carwashes - teamStats[a].carwashes
      if (view === 'addons')   return teamStats[b].addons - teamStats[a].addons
      return teamStats[b].revenue - teamStats[a].revenue
    })
  }

  const sortedTeams    = sortedFor(lbView)
  const unassignedCars = txRange.filter((t) => !t.team).length

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

  async function handleExport(fmt: ExportFormat) {
    setExporting(true)
    const rangeLabel = formatRangeLabel(range)
    const slug = rangeLabel.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').toLowerCase()
    const filename = `primera-dashboard-${slug}`
    const summaryRows: unknown[][] = [
      ['Metric', 'Value'], ['Period', rangeLabel],
      ['Total Cars', String(totalCars)], ['Total Revenue', formatPHP(totalRevenue)],
      ['Total Expenses', formatPHP(totalExpenses)], ['Net Profit', formatPHP(netProfit)],
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

  // ── Section renderers ──────────────────────────────────────────────────────
  const sectionLive = (
    <section>
          <div className="mb-2 flex items-center justify-between sm:mb-3">
            <SectionTitle>Live — Today</SectionTitle>
            <span className="text-xs text-gray-400">
              {liveLoading ? '…' : `${liveCars} car${liveCars !== 1 ? 's' : ''}`}
            </span>
          </div>
          {/* 2-col on mobile, 4-col on desktop */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <StatCard label="Cars Today" value={String(liveCars)} />
            <StatCard label="Revenue"    value={formatPHP(liveRevenue)} accent />
            <StatCard label="On Hand"    value={formatPHP(liveOnHand)} />
            <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Top Services</p>
              {liveTopServices.length === 0
                ? <p className="text-xs text-gray-400">No data yet</p>
                : liveTopServices.map(([svc, cnt]) => (
                    <div key={svc} className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="truncate text-gray-700">{svc}</span>
                      <span className="ml-2 font-bold text-gray-900">{cnt}</span>
                    </div>
                  ))}
            </div>
          </div>
    </section>
  )

  const sectionSummary = (
    <section>
          <SectionTitle>{snapshotLabel}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <StatCard label={carLabel}         value={String(totalCars)} />
            <StatCard label={revLabel}         value={formatPHP(totalRevenue)} accent />
            <StatCard label="Total Expenses"   value={formatPHP(totalExpenses)} />
            <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 truncate">Net Profit</p>
              <p className={`mt-1 text-xl font-bold sm:text-2xl ${netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {formatPHP(netProfit)}
              </p>
            </div>
          </div>
    </section>
  )

  const BAR_H   = 100
  const LABEL_H = 20
  const TOP_PAD = 36

  function barTooltip(dateStr: string, valueLine: string) {
    const d = new Date(dateStr + 'T00:00:00')
    const dateLine = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    const dayLine  = d.toLocaleDateString('en-PH', { weekday: 'long' })
    return (
      <div className="pointer-events-none absolute z-20 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
        style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 4 }}>
        <div className="font-semibold">{dateLine}</div>
        <div style={{ color: '#9ca3af' }}>{dayLine}</div>
        <div className="mt-0.5 font-bold" style={{ color: '#EDD98A' }}>{valueLine}</div>
      </div>
    )
  }

  const sectionRevenue = (
    <section>
          <SectionTitle>Revenue by Day</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 mb-3 sm:mb-4">
            <StatCard label="Total Cars"    value={String(totalCars)} />
            <StatCard label="Total Revenue" value={formatPHP(totalRevenue)} accent />
            <div className="col-span-2 sm:col-span-1">
              <StatCard label="Busiest Day" value={busiestDay}
                sub={busiestDay !== '—' ? `${chartCars[busiestIdx]} cars` : undefined} />
            </div>
          </div>
          <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-5">
            <div className="overflow-x-auto">
              <div className="flex items-end gap-[3px]"
                style={{ height: BAR_H + TOP_PAD + LABEL_H, paddingTop: TOP_PAD, minWidth: rangeDates.length > 7 ? `${rangeDates.length * 18}px` : 'auto' }}>
                {rangeDates.map((dateStr, i) => {
                  const rev     = chartRevenue[i]
                  const isToday = dateStr === todayStr
                  const barPx   = rev > 0 ? Math.max((rev / maxRevenue) * BAR_H, 4) : 2
                  const dayNum  = parseInt(dateStr.split('-')[2], 10)
                  const showLabel = i === 0 || i === rangeDates.length - 1 || i % labelStep === 0
                  return (
                    <div key={dateStr} className="relative flex flex-1 flex-col items-center"
                      style={{ height: BAR_H + LABEL_H, minWidth: '14px' }}
                      onMouseEnter={() => setRevHoverIdx(i)}
                      onMouseLeave={() => setRevHoverIdx(null)}>
                      {revHoverIdx === i && barTooltip(dateStr, formatPHP(rev))}
                      {rev > 0 && (
                        <span className="absolute text-[8px] font-semibold whitespace-nowrap"
                          style={{ bottom: LABEL_H + barPx + 2, left: '50%', transform: 'translateX(-50%)', color: '#0a0a0a' }}>
                          {'₱' + Math.round(rev / 1000) + 'k'}
                        </span>
                      )}
                      <div className="absolute w-full rounded-t"
                        style={{ bottom: LABEL_H, height: barPx, backgroundColor: isToday ? '#B8922A' : rev > 0 ? '#EDD98A' : '#f3f4f6' }} />
                      <span className="absolute bottom-0 text-[9px]"
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
  )

  const maxCars = Math.max(...chartCars, 1)

  const sectionCars = (
    <section>
          <SectionTitle>Cars per Day</SectionTitle>
          <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-5">
            <div className="overflow-x-auto">
              <div className="flex items-end gap-[3px]"
                style={{ height: BAR_H + TOP_PAD + LABEL_H, paddingTop: TOP_PAD, minWidth: rangeDates.length > 7 ? `${rangeDates.length * 18}px` : 'auto' }}>
                {rangeDates.map((dateStr, i) => {
                  const cars    = chartCars[i]
                  const isToday = dateStr === todayStr
                  const barPx   = cars > 0 ? Math.max((cars / maxCars) * BAR_H, 4) : 2
                  const dayNum  = parseInt(dateStr.split('-')[2], 10)
                  const showLabel = i === 0 || i === rangeDates.length - 1 || i % labelStep === 0
                  return (
                    <div key={dateStr} className="relative flex flex-1 flex-col items-center"
                      style={{ height: BAR_H + LABEL_H, minWidth: '14px' }}
                      onMouseEnter={() => setCarsHoverIdx(i)}
                      onMouseLeave={() => setCarsHoverIdx(null)}>
                      {carsHoverIdx === i && barTooltip(dateStr, `${cars} car${cars !== 1 ? 's' : ''}`)}
                      {cars > 0 && (
                        <span className="absolute text-[8px] font-semibold whitespace-nowrap"
                          style={{ bottom: LABEL_H + barPx + 2, left: '50%', transform: 'translateX(-50%)', color: '#0a0a0a' }}>
                          {cars}
                        </span>
                      )}
                      <div className="absolute w-full rounded-t"
                        style={{ bottom: LABEL_H, height: barPx, backgroundColor: isToday ? '#B8922A' : cars > 0 ? '#EDD98A' : '#f3f4f6' }} />
                      <span className="absolute bottom-0 text-[9px]"
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
  )

  const sectionLeaderboard = (
    <section>
          <div className="mb-3 flex items-center justify-between sm:mb-4">
            <SectionTitle>Team Leaderboard</SectionTitle>
            <span className="text-xs text-gray-400">{formatRangeLabel(range)}</span>
          </div>
          <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
            {/* Category tabs — icon only on mobile, icon+text on desktop */}
            <div className="flex border-b border-gray-100">
              {([
                { key: 'carwashes', icon: '🚗', label: 'Most Carwashes', sub: 'Basic Wash' },
                { key: 'addons',    icon: '⭐', label: 'Most Add-ons',   sub: 'Upsells' },
                { key: 'revenue',   icon: '💰', label: 'Most Revenue',   sub: 'Earnings' },
              ] as { key: LeaderboardView; icon: string; label: string; sub: string }[]).map(({ key, icon, label, sub }) => (
                <button key={key} onClick={() => setLbView(key)}
                  className="flex-1 py-3 px-1 text-center transition-colors border-b-2"
                  style={{
                    borderBottomColor: lbView === key ? '#B8922A' : 'transparent',
                    backgroundColor:   lbView === key ? 'rgba(184,146,42,0.05)' : 'transparent',
                  }}>
                  {/* Mobile: icon + sub only */}
                  <p className="text-base sm:hidden">{icon}</p>
                  <p className="text-[10px] sm:hidden" style={{ color: lbView === key ? '#B8922A' : '#9ca3af' }}>{sub}</p>
                  {/* Desktop: full label */}
                  <p className="hidden sm:block text-xs font-semibold" style={{ color: lbView === key ? '#B8922A' : '#6b7280' }}>
                    {icon} {label}
                  </p>
                  <p className="hidden sm:block text-[10px] text-gray-400">{sub}</p>
                </button>
              ))}
            </div>

            <div className="p-3 sm:p-5">
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
                        <div className="px-3 py-3 sm:px-4">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {isFirst && <span className="text-sm">🏆</span>}
                              <span className="text-sm font-bold" style={{ color: isFirst ? color : '#374151' }}>
                                #{i + 1} {team}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Stats — condensed on mobile */}
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>🚗 <strong className="text-gray-900">{stats.carwashes}</strong></span>
                                <span>⭐ <strong className="text-gray-900">{stats.addons}</strong></span>
                                <span className="hidden sm:inline"><strong className="text-gray-900">{formatPHP(stats.revenue)}</strong></span>
                              </div>
                              <button onClick={() => setExpandedTeam(isExpanded ? null : team)}
                                className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
                                style={{ backgroundColor: isExpanded ? 'rgba(184,146,42,0.15)' : 'rgba(184,146,42,0.08)', color: '#B8922A' }}>
                                {isExpanded ? '▲' : '▼'}
                              </button>
                            </div>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${barPct}%`, backgroundColor: color }} />
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-[10px] text-gray-400 sm:hidden">{formatPHP(stats.revenue)}</p>
                            <p className="text-[10px] ml-auto" style={{ color }}>{teamValueLabel(team)}</p>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-gray-100" style={{ backgroundColor: 'rgba(184,146,42,0.03)' }}>
                            <div className="flex border-b border-gray-100">
                              {([
                                { key: 'addons',   label: `Add-ons (${stats.addons})` },
                                { key: 'sizes',    label: `Sizes (${stats.cars})` },
                                { key: 'services', label: 'Services' },
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
                            <div className="px-3 py-3 sm:px-4">
                              {tab === 'addons' && (
                                addonEntries.length === 0
                                  ? <p className="py-2 text-xs text-gray-400">No add-ons this period.</p>
                                  : <>
                                      <div className="space-y-1.5">
                                        {addonEntries.map(([svc, { count, revenue }]) => (
                                          <div key={svc} className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                              <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                              <span className="text-gray-700 font-medium">{svc}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-gray-500">
                                              <span className="font-semibold text-gray-900">×{count}</span>
                                              <span className="w-16 text-right sm:w-20">{formatPHP(revenue)}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="mt-2 flex justify-between border-t border-gray-100 pt-2 text-xs font-semibold">
                                        <span className="text-gray-500">Total add-on revenue</span>
                                        <span style={{ color }}>{formatPHP(totalAddonRev)}</span>
                                      </div>
                                    </>
                              )}
                              {tab === 'sizes' && (
                                sizeEntries.length === 0
                                  ? <p className="py-2 text-xs text-gray-400">No size data.</p>
                                  : <>
                                      <div className="space-y-2">
                                        {sizeEntries.map(([size, count]) => {
                                          const pct = stats.cars > 0 ? (count / stats.cars) * 100 : 0
                                          return (
                                            <div key={size}>
                                              <div className="mb-1 flex justify-between text-xs">
                                                <span className="font-medium text-gray-700">{size}</span>
                                                <span className="text-gray-500">
                                                  <strong className="text-gray-900">{count}</strong>
                                                  <span className="ml-1 text-gray-400">({pct.toFixed(0)}%)</span>
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
                              )}
                              {tab === 'services' && (
                                serviceEntries.length === 0
                                  ? <p className="py-2 text-xs text-gray-400">No service data.</p>
                                  : <>
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
                                                  <span className="hidden sm:inline rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                                                    style={{ backgroundColor: 'rgba(184,146,42,0.1)', color }}>
                                                    add-on
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-2 text-gray-500">
                                                <span className="font-semibold text-gray-900">×{count}</span>
                                                <span className="w-16 text-right sm:w-20">{formatPHP(revenue)}</span>
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
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {unassignedCars > 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 px-3 py-2 sm:px-4 sm:py-3">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>No Team Assigned</span>
                        <span>{unassignedCars} car{unassignedCars !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-[10px] text-gray-400">
                  Tap a category tab to re-rank. Tap <strong>▼</strong> for add-ons, sizes, and service breakdown.
                </p>
              </div>
            </div>
          </div>
    </section>
  )

  const sectionServicesPayment = (
    <section className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <div>
            <SectionTitle>Top Services</SectionTitle>
            <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-5">
              {topServices.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No data for this period.</p>
              ) : (
                <div className="space-y-3">
                  {topServices.map(([name, { count, revenue }], i) => (
                    <div key={name}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                          <span className="font-medium text-gray-800 text-xs sm:text-sm">{name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{count}×</span>
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
            <SectionTitle>Payment Breakdown</SectionTitle>
            <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-5">
              {paymentEntries.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No data for this period.</p>
              ) : (
                <>
                  <div className="mb-4 flex h-4 w-full overflow-hidden rounded-full sm:h-5 sm:mb-5">
                    {paymentEntries.map(([method, amount]) => (
                      <div key={method} title={`${method}: ${formatPHP(amount)}`}
                        style={{ width: `${(amount / paymentTotal) * 100}%`, backgroundColor: PAYMENT_COLORS[method] ?? '#9ca3af' }} />
                    ))}
                  </div>
                  <div className="space-y-2">
                    {paymentEntries.map(([method, amount]) => {
                      const pct = ((amount / paymentTotal) * 100).toFixed(1)
                      return (
                        <div key={method} className="flex items-center justify-between text-xs sm:text-sm">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm sm:h-3 sm:w-3" style={{ backgroundColor: PAYMENT_COLORS[method] ?? '#9ca3af' }} />
                            <span className="font-medium text-gray-700">{method}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <span>{pct}%</span>
                            <span className="font-semibold text-gray-900">{formatPHP(amount)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex justify-between border-t border-gray-100 pt-2 text-xs sm:text-sm sm:mt-4 sm:pt-3">
                    <span className="font-semibold text-gray-500">Total</span>
                    <span className="font-bold text-gray-900">{formatPHP(paymentTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
    </section>
  )

  const sectionMap: Record<string, React.ReactNode> = {
    live:               sectionLive,
    summary:            sectionSummary,
    revenue:            sectionRevenue,
    cars:               sectionCars,
    leaderboard:        sectionLeaderboard,
    'services-payment': sectionServicesPayment,
  }

  return (
    <div className="px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Dashboard</h1>
            <ExportMenu onExport={handleExport} loading={exporting} />
          </div>
          <div className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
            <DateRangeSelector value={range} onChange={setRange} />
            <p className="mt-2 text-xs text-gray-400 hidden sm:block">
              Showing: <span className="font-medium text-gray-600">{formatRangeLabel(range)}</span>
            </p>
          </div>
        </div>

        {/* Sortable sections */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
            <div className="space-y-6 sm:space-y-8 pl-5 sm:pl-6">
              {sectionOrder.map((id) => (
                <SortableSection key={id} id={id}>
                  {sectionMap[id]}
                </SortableSection>
              ))}
            </div>
          </SortableContext>
        </DndContext>

      </div>
    </div>
  )
}