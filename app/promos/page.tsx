'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReferralRow {
  id: string
  date: string
  primero_name: string
  primero_contact: string | null
  primero_plate: string
  guest_name: string | null
  guest_contact: string | null
  guest_plate: string
  fb_follow: boolean
  guest_first_time: boolean
  bac2zero_given: boolean
  created_at: string
}

interface FormState {
  date: string
  primero_name: string
  primero_contact: string
  primero_plate: string
  guest_name: string
  guest_contact: string
  guest_plate: string
  fb_follow: boolean
  guest_first_time: boolean
  bac2zero_given: boolean
}

const MAX_REFERRALS = 3
const TODAY = new Date().toISOString().split('T')[0]

const EMPTY_FORM: FormState = {
  date: TODAY,
  primero_name: '',
  primero_contact: '',
  primero_plate: '',
  guest_name: '',
  guest_contact: '',
  guest_plate: '',
  fb_follow: false,
  guest_first_time: true,
  bac2zero_given: false,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function plateFmt(p: string) {
  return p.trim().toUpperCase()
}

// ─── Eligibility lookup result ────────────────────────────────────────────────

type EligibilityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'eligible' }
  | { status: 'existing'; visitCount: number }
  | { status: 'already_registered' }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PromosPage() {
  // ── Lookup state ───────────────────────────────────────────────────────────
  const [lookupPlate, setLookupPlate]   = useState('')
  const [eligibility, setEligibility]   = useState<EligibilityState>({ status: 'idle' })
  const lookupRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Form state ─────────────────────────────────────────────────────────────
  const [form, setForm]         = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [primeroWarning, setPrimeroWarning] = useState('')

  // ── Table state ────────────────────────────────────────────────────────────
  const [rows, setRows]     = useState<ReferralRow[]>([])
  const [tableLoading, setTableLoading] = useState(true)

  // ── Load table ─────────────────────────────────────────────────────────────

  const loadRows = useCallback(async () => {
    setTableLoading(true)
    const { data } = await supabase
      .from('referral_promo')
      .select('*')
      .order('created_at', { ascending: false })
    setRows(data ?? [])
    setTableLoading(false)
  }, [])

  useEffect(() => { loadRows() }, [loadRows])

  // ── Eligibility check (debounced) ─────────────────────────────────────────

  useEffect(() => {
    const plate = plateFmt(lookupPlate)
    if (!plate) { setEligibility({ status: 'idle' }); return }

    if (lookupRef.current) clearTimeout(lookupRef.current)
    lookupRef.current = setTimeout(async () => {
      setEligibility({ status: 'loading' })

      // Check referral_promo first (already registered?)
      const { data: promoData } = await supabase
        .from('referral_promo')
        .select('id')
        .eq('guest_plate', plate)
        .limit(1)

      if (promoData && promoData.length > 0) {
        setEligibility({ status: 'already_registered' })
        return
      }

      // Check transactions (prior visits?)
      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('plate_number', plate)

      if (count && count > 0) {
        setEligibility({ status: 'existing', visitCount: count })
      } else {
        setEligibility({ status: 'eligible' })
        // Auto-fill guest plate and first-time flag into form
        setForm((f) => ({ ...f, guest_plate: plate, guest_first_time: true }))
      }
    }, 400)

    return () => { if (lookupRef.current) clearTimeout(lookupRef.current) }
  }, [lookupPlate])

  // ── Primero plate — check referral count ───────────────────────────────────

  async function checkPrimeroLimit(plate: string) {
    if (!plate.trim()) { setPrimeroWarning(''); return }
    const p = plateFmt(plate)
    const { count } = await supabase
      .from('referral_promo')
      .select('id', { count: 'exact', head: true })
      .eq('primero_plate', p)
    if (count !== null && count >= MAX_REFERRALS) {
      setPrimeroWarning(`⚠ Max ${MAX_REFERRALS} invitations reached for this Primero (${count}/${MAX_REFERRALS} used)`)
    } else {
      setPrimeroWarning(count !== null ? `${count}/${MAX_REFERRALS} invitations used` : '')
    }
  }

  // ── Form handlers ──────────────────────────────────────────────────────────

  function handleText(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    const val = ['primero_plate', 'guest_plate'].includes(name) ? value.toUpperCase() : value
    setForm((f) => ({ ...f, [name]: val }))
    if (name === 'primero_plate') checkPrimeroLimit(value)
  }

  function handleCheck(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, checked } = e.target
    setForm((f) => ({ ...f, [name]: checked }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')

    if (!form.primero_name.trim() || !form.primero_plate.trim() || !form.guest_plate.trim()) {
      setSubmitError('Primero Name, Primero Plate, and Guest Plate are required.')
      return
    }

    // Re-check primero limit before submitting
    const { count } = await supabase
      .from('referral_promo')
      .select('id', { count: 'exact', head: true })
      .eq('primero_plate', plateFmt(form.primero_plate))

    if (count !== null && count >= MAX_REFERRALS) {
      setSubmitError(`⚠ Max ${MAX_REFERRALS} invitations already reached for this Primero.`)
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('referral_promo').insert({
      date:             form.date,
      primero_name:     form.primero_name.trim(),
      primero_contact:  form.primero_contact.trim() || null,
      primero_plate:    plateFmt(form.primero_plate),
      guest_name:       form.guest_name.trim() || null,
      guest_contact:    form.guest_contact.trim() || null,
      guest_plate:      plateFmt(form.guest_plate),
      fb_follow:        form.fb_follow,
      guest_first_time: form.guest_first_time,
      bac2zero_given:   form.bac2zero_given,
    })
    setSubmitting(false)

    if (error) { setSubmitError(error.message); return }

    setSubmitSuccess(true)
    setForm(EMPTY_FORM)
    setLookupPlate('')
    setEligibility({ status: 'idle' })
    setPrimeroWarning('')
    loadRows()
    setTimeout(() => setSubmitSuccess(false), 4000)
  }

  // ── Per-Primero summary ────────────────────────────────────────────────────

  const primeroSummary: Record<string, { name: string; count: number }> = {}
  rows.forEach((r) => {
    const key = r.primero_plate
    if (!primeroSummary[key]) primeroSummary[key] = { name: r.primero_name, count: 0 }
    primeroSummary[key].count++
  })
  const primeroList = Object.entries(primeroSummary)
    .sort((a, b) => b[1].count - a[1].count)

  // ── Shared styles ──────────────────────────────────────────────────────────

  const inputCls =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 ' +
    'placeholder:text-gray-400 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'
  const goldBtn  =
    'rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition-colors'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-4xl space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Primera Circle — Referral Promo</h1>
          <p className="mt-1 text-sm text-gray-400">
            June 1–30, 2026 · Car Wash Only · Max {MAX_REFERRALS} Invitations per Primero
          </p>
        </div>

        {/* ── Section 1: Eligibility Lookup ── */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">Check Guest Eligibility</h2>
          <div className="flex gap-3 max-w-md">
            <input
              type="text"
              value={lookupPlate}
              onChange={(e) => setLookupPlate(e.target.value.toUpperCase())}
              placeholder="Enter guest plate number…"
              className={`${inputCls} flex-1 uppercase`}
            />
          </div>

          {/* Result banners */}
          <div className="mt-3">
            {eligibility.status === 'loading' && (
              <p className="text-sm text-gray-400">Checking…</p>
            )}
            {eligibility.status === 'eligible' && (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3">
                <span className="text-lg">✓</span>
                <div>
                  <p className="text-sm font-bold text-green-700">NEW CUSTOMER — Eligible for promo</p>
                  <p className="text-xs text-green-600">No prior transactions found for {plateFmt(lookupPlate)}</p>
                </div>
              </div>
            )}
            {eligibility.status === 'existing' && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3">
                <span className="text-lg">⚠</span>
                <div>
                  <p className="text-sm font-bold text-red-700">EXISTING CUSTOMER — Not eligible</p>
                  <p className="text-xs text-red-600">
                    {eligibility.visitCount} visit{eligibility.visitCount !== 1 ? 's' : ''} on record for {plateFmt(lookupPlate)}
                  </p>
                </div>
              </div>
            )}
            {eligibility.status === 'already_registered' && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3">
                <span className="text-lg">⚠</span>
                <div>
                  <p className="text-sm font-bold text-amber-700">Already registered in promo</p>
                  <p className="text-xs text-amber-600">{plateFmt(lookupPlate)} already has a referral entry</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Section 2: Log Referral Form ── */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-base font-semibold text-gray-800">Log New Referral</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Date */}
            <div className="max-w-xs">
              <label className={labelCls}>Date</label>
              <input type="date" name="date" value={form.date} onChange={handleText} className={inputCls} required />
            </div>

            {/* Primero details */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Primero (Referrer)</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Name <span className="text-red-500">*</span></label>
                  <input type="text" name="primero_name" value={form.primero_name}
                    onChange={handleText} placeholder="Full name" className={inputCls} required />
                </div>
                <div>
                  <label className={labelCls}>Contact</label>
                  <input type="text" name="primero_contact" value={form.primero_contact}
                    onChange={handleText} placeholder="09XX XXX XXXX" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Plate Number <span className="text-red-500">*</span></label>
                  <input type="text" name="primero_plate" value={form.primero_plate}
                    onChange={handleText} placeholder="e.g. ABC 1234"
                    className={`${inputCls} uppercase`} required />
                </div>
              </div>
              {primeroWarning && (
                <p className={`mt-2 text-xs font-medium ${
                  primeroWarning.startsWith('⚠') ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {primeroWarning}
                </p>
              )}
            </div>

            {/* Guest details */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Guest (Referred)</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Name</label>
                  <input type="text" name="guest_name" value={form.guest_name}
                    onChange={handleText} placeholder="Full name" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Contact</label>
                  <input type="text" name="guest_contact" value={form.guest_contact}
                    onChange={handleText} placeholder="09XX XXX XXXX" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Plate Number <span className="text-red-500">*</span></label>
                  <input type="text" name="guest_plate" value={form.guest_plate}
                    onChange={handleText} placeholder="e.g. XYZ 5678"
                    className={`${inputCls} uppercase`} required />
                </div>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="fb_follow" checked={form.fb_follow}
                  onChange={handleCheck}
                  className="h-4 w-4 rounded accent-[#B8922A]" />
                FB Follow confirmed
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="guest_first_time" checked={form.guest_first_time}
                  onChange={handleCheck}
                  className="h-4 w-4 rounded accent-[#B8922A]" />
                Guest is first-time customer
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" name="bac2zero_given" checked={form.bac2zero_given}
                  onChange={handleCheck}
                  className="h-4 w-4 rounded accent-[#B8922A]" />
                Bac-2-Zero given
              </label>
            </div>

            {/* Errors / Success */}
            {submitError && (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{submitError}</p>
            )}
            {submitSuccess && (
              <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                Referral logged successfully!
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || primeroWarning.startsWith('⚠')}
              className={goldBtn}
              style={{ backgroundColor: '#B8922A' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}
            >
              {submitting ? 'Saving…' : 'Log Referral'}
            </button>
          </form>
        </section>

        {/* ── Section 3: Referral Log ── */}
        <section className="rounded-2xl bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-800">Referral Log</h2>
          </div>

          {/* Primero summary chips */}
          {primeroList.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-gray-100 px-6 py-3">
              {primeroList.map(([plate, { name, count }]) => (
                <span key={plate}
                  className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor: count >= MAX_REFERRALS ? 'rgba(184,146,42,0.12)' : '#f3f4f6',
                    color: count >= MAX_REFERRALS ? '#B8922A' : '#6b7280',
                  }}>
                  {name} ({plate}) — {count}/{MAX_REFERRALS}
                  {count >= MAX_REFERRALS ? ' ✓ FULL' : ''}
                </span>
              ))}
            </div>
          )}

          {tableLoading ? (
            <p className="py-12 text-center text-sm text-gray-400">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">No referrals logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Primero</th>
                    <th className="px-5 py-3">Primero Plate</th>
                    <th className="px-5 py-3">Guest</th>
                    <th className="px-5 py-3">Guest Plate</th>
                    <th className="px-5 py-3 text-center">FB Follow</th>
                    <th className="px-5 py-3 text-center">First Time</th>
                    <th className="px-5 py-3 text-center">Bac-2-Zero</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row) => {
                    const ineligible = !row.guest_first_time
                    return (
                      <tr key={row.id}
                        style={{ backgroundColor: ineligible ? 'rgba(239,68,68,0.05)' : undefined }}>
                        <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                          {fmtDate(row.date)}
                        </td>
                        <td className="px-5 py-3 font-medium text-gray-900">{row.primero_name}</td>
                        <td className="px-5 py-3 font-bold tracking-wide text-gray-900">
                          {row.primero_plate}
                        </td>
                        <td className="px-5 py-3 text-gray-700">{row.guest_name || '—'}</td>
                        <td className="px-5 py-3 font-bold tracking-wide text-gray-900">
                          {row.guest_plate}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {row.fb_follow
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {row.guest_first_time
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                                No
                              </span>}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {row.bac2zero_given
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
