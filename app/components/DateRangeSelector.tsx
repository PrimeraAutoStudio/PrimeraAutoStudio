'use client'

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PresetKey =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'custom'

export interface DateRange {
  from: string   // ISO yyyy-mm-dd
  to:   string   // ISO yyyy-mm-dd
  preset: PresetKey
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function iso(d: Date) {
  // Use local date parts to avoid UTC offset shifting the date (e.g. UTC+8)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(base: Date, n: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + n)
  return d
}

function startOfWeek(d: Date) {
  // Monday-based
  const day = d.getDay()
  const diff = (day + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - diff)
  return mon
}

export function rangeForPreset(preset: PresetKey, customFrom = '', customTo = ''): DateRange {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today), preset }

    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: iso(y), to: iso(y), preset }
    }

    case 'this_week': {
      const mon = startOfWeek(today)
      const sun = addDays(mon, 6)
      return { from: iso(mon), to: iso(sun), preset }
    }

    case 'last_week': {
      const lastMon = addDays(startOfWeek(today), -7)
      const lastSun = addDays(lastMon, 6)
      return { from: iso(lastMon), to: iso(lastSun), preset }
    }

    case 'this_month': {
      const y = today.getFullYear(), m = today.getMonth()
      const first = new Date(y, m, 1)
      const last  = new Date(y, m + 1, 0)
      return { from: iso(first), to: iso(last), preset }
    }

    case 'last_month': {
      const y = today.getFullYear(), m = today.getMonth()
      const first = new Date(y, m - 1, 1)
      const last  = new Date(y, m, 0)
      return { from: iso(first), to: iso(last), preset }
    }

    case 'custom':
      return { from: customFrom, to: customTo, preset }

    default:
      return { from: iso(today), to: iso(today), preset: 'today' }
  }
}

export function formatRangeLabel(range: DateRange): string {
  const fmt = (s: string) =>
    new Date(s + 'T00:00:00').toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  if (range.from === range.to) return fmt(range.from)
  return `${fmt(range.from)} – ${fmt(range.to)}`
}

// ─── Preset button config ────────────────────────────────────────────────────

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today',       label: 'Today'      },
  { key: 'yesterday',   label: 'Yesterday'  },
  { key: 'this_week',   label: 'This Week'  },
  { key: 'last_week',   label: 'Last Week'  },
  { key: 'this_month',  label: 'This Month' },
  { key: 'last_month',  label: 'Last Month' },
  { key: 'custom',      label: 'Custom'     },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
}

export default function DateRangeSelector({ value, onChange }: Props) {
  const [customFrom, setCustomFrom] = useState(value.from)
  const [customTo,   setCustomTo]   = useState(value.to)

  // When switching away from custom, reset the custom inputs to match
  useEffect(() => {
    if (value.preset !== 'custom') {
      setCustomFrom(value.from)
      setCustomTo(value.to)
    }
  }, [value])

  function selectPreset(key: PresetKey) {
    if (key === 'custom') {
      onChange(rangeForPreset('custom', customFrom, customTo))
    } else {
      onChange(rangeForPreset(key))
    }
  }

  function applyCustom() {
    if (customFrom && customTo && customFrom <= customTo) {
      onChange({ from: customFrom, to: customTo, preset: 'custom' })
    }
  }

  const inputCls =
    'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 ' +
    'focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'

  return (
    <div className="space-y-2">
      {/* Pill buttons */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(({ key, label }) => {
          const active = value.preset === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectPreset(key)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                backgroundColor: active ? '#B8922A' : '#f3f4f6',
                color:           active ? '#fff'    : '#6b7280',
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#e5e7eb'
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f3f4f6'
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Custom date picker — only when custom is active */}
      {value.preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-gray-400">From</span>
          <input
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            className={inputCls}
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            className={inputCls}
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!customFrom || !customTo || customFrom > customTo}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: '#B8922A' }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
