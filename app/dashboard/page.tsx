'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  date: string
  price: number
  status: string
  service_name: string
  payment_method: string
}

interface Payable {
  amount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAILY_QUOTA = 9.5
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PAYMENT_COLORS: Record<string, string> = {
  Cash:  '#B8922A',
  GCash: '#3b82f6',
  Maya:  '#22c55e',
  BPI:   '#a855f7',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

// Monday-based week: returns [Mon, Tue, …, Sun] as Date objects
function currentWeekDays(): Date[] {
  const now = new Date()
  const dow = now.getDay() // 0=Sun
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false,
}: {
  label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-[#B8922A]' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-400">
      {children}
    </h2>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const now = new Date()
  const todayStr = isoDate(now)
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const firstOfMonth = `${monthPrefix}-01`
  const lastOfMonth = `${monthPrefix}-${String(daysInMonth(year, month)).padStart(2, '0')}`
  const weekDays = currentWeekDays()
  const firstOfWeek = isoDate(weekDays[0])
  const lastOfWeek = isoDate(weekDays[6])

  const [txMonth, setTxMonth] = useState<Transaction[]>([])
  const [payables, setPayables] = useState<Payable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: tx }, { data: pa }] = await Promise.all([
        supabase
          .from('transactions')
          .select('date, price, status, service_name, payment_method')
          .gte('date', firstOfMonth)
          .lte('date', lastOfMonth),
        supabase.from('payables').select('amount'),
      ])
      setTxMonth(tx ?? [])
      setPayables(pa ?? [])
      setLoading(false)
    }
    load()
  }, [firstOfMonth, lastOfMonth])

  // ── Today ──────────────────────────────────────────────────────────────────
  const txToday = txMonth.filter((t) => t.date === todayStr)
  const carsToday = txToday.length
  const revenueToday = txToday.reduce((s, t) => s + t.price, 0)
  const onHandToday = txToday.filter((t) => t.status === 'On Hand').reduce((s, t) => s + t.price, 0)
  const depositedToday = txToday.filter((t) => t.status === 'Deposited').reduce((s, t) => s + t.price, 0)

  // ── This week ──────────────────────────────────────────────────────────────
  const txWeek = txMonth.filter((t) => t.date >= firstOfWeek && t.date <= lastOfWeek)
  const carsThisWeek = txWeek.length
  const revenueThisWeek = txWeek.reduce((s, t) => s + t.price, 0)

  // Revenue & car count per weekday (index 0=Mon … 6=Sun)
  const weekRevenue: number[] = Array(7).fill(0)
  const weekCars: number[] = Array(7).fill(0)
  txWeek.forEach((t) => {
    const idx = weekDays.findIndex((d) => isoDate(d) === t.date)
    if (idx >= 0) { weekRevenue[idx] += t.price; weekCars[idx]++ }
  })
  const maxWeekRevenue = Math.max(...weekRevenue, 1)
  const busiestIdx = weekCars.indexOf(Math.max(...weekCars))
  const busiestDay = weekCars[busiestIdx] > 0 ? DAY_NAMES[busiestIdx] : '—'

  // ── Breakeven ──────────────────────────────────────────────────────────────
  const fixedCosts = payables.reduce((s, p) => s + p.amount, 0)
  const revenueMonth = txMonth.reduce((s, t) => s + t.price, 0)
  const remaining = Math.max(fixedCosts - revenueMonth, 0)
  const progressPct = Math.min((revenueMonth / (fixedCosts || 1)) * 100, 100)
  const aboveBreakeven = revenueMonth >= fixedCosts

  const totalDays = daysInMonth(year, month)
  const dayOfMonth = now.getDate()
  const daysLeft = totalDays - dayOfMonth + 1
  const carsMonth = txMonth.length
  const totalQuota = Math.ceil(DAILY_QUOTA * totalDays)
  const carsStillNeeded = Math.max(totalQuota - carsMonth, 0)
  const carsPerDayNeeded = daysLeft > 0 ? (carsStillNeeded / daysLeft).toFixed(1) : '0'

  // ── Top services ───────────────────────────────────────────────────────────
  const serviceMap: Record<string, { count: number; revenue: number }> = {}
  txMonth.forEach((t) => {
    if (!serviceMap[t.service_name]) serviceMap[t.service_name] = { count: 0, revenue: 0 }
    serviceMap[t.service_name].count++
    serviceMap[t.service_name].revenue += t.price
  })
  const topServices = Object.entries(serviceMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
  const maxServiceCount = Math.max(...topServices.map((s) => s[1].count), 1)

  // ── Payment breakdown ──────────────────────────────────────────────────────
  const paymentMap: Record<string, number> = {}
  txMonth.forEach((t) => {
    paymentMap[t.payment_method] = (paymentMap[t.payment_method] ?? 0) + t.price
  })
  const paymentTotal = Object.values(paymentMap).reduce((s, v) => s + v, 0)
  const paymentEntries = Object.entries(paymentMap).sort((a, b) => b[1] - a[1])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-400">Loading dashboard…</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-5xl space-y-10">

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400">
            {now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* ── Today's Snapshot ── */}
        <section>
          <SectionTitle>Today's Snapshot</SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Cars Today" value={String(carsToday)} />
            <StatCard label="Revenue Today" value={formatPHP(revenueToday)} accent />
            <StatCard label="On Hand" value={formatPHP(onHandToday)} />
            <StatCard label="Deposited" value={formatPHP(depositedToday)} />
          </div>
        </section>

        {/* ── This Week ── */}
        <section>
          <SectionTitle>This Week</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Cars This Week" value={String(carsThisWeek)} />
            <StatCard label="Revenue This Week" value={formatPHP(revenueThisWeek)} accent />
            <StatCard label="Busiest Day" value={busiestDay}
              sub={busiestDay !== '—' ? `${weekCars[busiestIdx]} cars` : undefined} />
          </div>

          {/* Weekly bar chart */}
          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Revenue by Day
            </p>
            <div className="flex items-end gap-2" style={{ height: '120px' }}>
              {weekDays.map((d, i) => {
                const isToday = isoDate(d) === todayStr
                const isFuture = d > now
                const heightPct = weekRevenue[i] > 0
                  ? Math.max((weekRevenue[i] / maxWeekRevenue) * 100, 5)
                  : 0
                return (
                  <div key={i} className="group relative flex flex-1 flex-col items-center gap-1">
                    {weekRevenue[i] > 0 && (
                      <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-xs text-white group-hover:block">
                        {formatPHP(weekRevenue[i])}
                      </div>
                    )}
                    <div className="flex w-full flex-col justify-end" style={{ height: '96px' }}>
                      <div
                        className="w-full rounded-t transition-all"
                        style={{
                          height: weekRevenue[i] === 0 ? '2px' : `${heightPct}%`,
                          backgroundColor: isFuture
                            ? '#e5e7eb'
                            : isToday
                            ? '#B8922A'
                            : weekRevenue[i] === 0
                            ? '#f3f4f6'
                            : '#EDD98A',
                        }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${isToday ? 'text-[#B8922A]' : 'text-gray-400'}`}>
                      {DAY_NAMES[i]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Breakeven Tracker ── */}
        <section>
          <SectionTitle>Breakeven Tracker</SectionTitle>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Monthly Fixed Costs
                </p>
                <p className="text-xl font-bold text-gray-900">{formatPHP(fixedCosts)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Revenue This Month
                </p>
                <p className={`text-xl font-bold ${aboveBreakeven ? 'text-green-600' : 'text-red-500'}`}>
                  {formatPHP(revenueMonth)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {aboveBreakeven ? 'Above Breakeven By' : 'Still Needed'}
                </p>
                <p className={`text-xl font-bold ${aboveBreakeven ? 'text-green-600' : 'text-red-500'}`}>
                  {aboveBreakeven
                    ? formatPHP(revenueMonth - fixedCosts)
                    : formatPHP(remaining)}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-1 h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: aboveBreakeven ? '#22c55e' : '#ef4444',
                }}
              />
            </div>
            <div className="mb-5 flex justify-between text-xs text-gray-400">
              <span>₱0</span>
              <span>{progressPct.toFixed(1)}% of target</span>
              <span>{formatPHP(fixedCosts)}</span>
            </div>

            {/* Daily quota guidance */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-semibold text-gray-700">Daily quota to breakeven: </span>
                  <span className="font-bold text-[#B8922A]">{DAILY_QUOTA} cars/day</span>
                </div>
                <div className="h-4 w-px bg-gray-200 hidden sm:block" />
                <div>
                  <span className="font-semibold text-gray-700">Cars still needed this month: </span>
                  <span className={`font-bold ${carsStillNeeded === 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {carsStillNeeded === 0 ? 'On track ✓' : `${carsStillNeeded} cars`}
                  </span>
                </div>
                <div className="h-4 w-px bg-gray-200 hidden sm:block" />
                <div>
                  <span className="font-semibold text-gray-700">Needed per day ({daysLeft}d left): </span>
                  <span className={`font-bold ${parseFloat(carsPerDayNeeded) <= DAILY_QUOTA ? 'text-green-600' : 'text-red-500'}`}>
                    {carsStillNeeded === 0 ? '—' : `${carsPerDayNeeded} cars/day`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Bottom two-column section ── */}
        <section className="grid gap-6 lg:grid-cols-2">

          {/* Top services */}
          <div>
            <SectionTitle>Top Services This Month</SectionTitle>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              {topServices.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No data yet.</p>
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
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(count / maxServiceCount) * 100}%`,
                            backgroundColor: '#EDD98A',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Payment breakdown */}
          <div>
            <SectionTitle>Payment Method Breakdown</SectionTitle>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              {paymentEntries.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No data yet.</p>
              ) : (
                <>
                  {/* Stacked bar */}
                  <div className="mb-5 flex h-5 w-full overflow-hidden rounded-full">
                    {paymentEntries.map(([method, amount]) => (
                      <div
                        key={method}
                        title={`${method}: ${formatPHP(amount)}`}
                        style={{
                          width: `${(amount / paymentTotal) * 100}%`,
                          backgroundColor: PAYMENT_COLORS[method] ?? '#9ca3af',
                        }}
                      />
                    ))}
                  </div>

                  {/* Legend rows */}
                  <div className="space-y-2.5">
                    {paymentEntries.map(([method, amount]) => {
                      const pct = ((amount / paymentTotal) * 100).toFixed(1)
                      return (
                        <div key={method} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-sm"
                              style={{ backgroundColor: PAYMENT_COLORS[method] ?? '#9ca3af' }}
                            />
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

                  {/* Total */}
                  <div className="mt-4 border-t border-gray-100 pt-3 flex justify-between text-sm">
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
