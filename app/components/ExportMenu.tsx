'use client'

import { useEffect, useRef, useState } from 'react'

export type ExportFormat = 'xlsx' | 'pdf' | 'csv'

interface Props {
  onExport: (format: ExportFormat) => void
  loading?: boolean
}

export default function ExportMenu({ onExport, loading = false }: Props) {
  const [open, setOpen]     = useState(false)
  const ref                 = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const options: { format: ExportFormat; label: string; icon: string }[] = [
    { format: 'xlsx', label: 'Excel (.xlsx)', icon: '📊' },
    { format: 'pdf',  label: 'PDF',           icon: '📄' },
    { format: 'csv',  label: 'CSV',           icon: '📋' },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
        style={{ backgroundColor: '#B8922A' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}
      >
        {/* Download icon */}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {loading ? 'Exporting…' : 'Export'}
        <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
          {options.map(({ format, label, icon }) => (
            <button
              key={format}
              onClick={() => { onExport(format); setOpen(false) }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
