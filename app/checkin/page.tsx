'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface SizeRow          { size_category: string; base_price: number }
interface ServiceRow       { name: string }
interface PaymentMethodRow { name: string }
interface ServicePriceRow  { service_name: string; size_category: string; price: number }
interface LoyaltyCard {
  id: number; plate_number: string; wash_count: number
  last_redeemed: string | null; created_at: string
}

interface FormState {
  plate_number: string; make: string; model: string
  size_category: string; payment_method: string; status: string; notes: string; team: string
}

const EMPTY_FORM: FormState = {
  plate_number: '', make: '', model: '', size_category: '',
  payment_method: '', status: 'Pending', notes: '', team: '',
}

const LOYALTY_THRESHOLD = 10

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

export default function CheckIn() {
  const router = useRouter()

  const [sizes, setSizes]                   = useState<SizeRow[]>([])
  const [services, setServices]             = useState<ServiceRow[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([])
  const [servicePrices, setServicePrices]   = useState<ServicePriceRow[]>([])
  const [teams, setTeams]                   = useState<string[]>(['Team A', 'Team B', 'Team C', 'Team D'])

  const [form, setForm]                         = useState<FormState>(EMPTY_FORM)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [manualPrice, setManualPrice]           = useState<string>('')
  const [loading, setLoading]                   = useState(false)
  const [error, setError]                       = useState('')

  // ── Success modal state ──────────────────────────────────────────────────
  const [showSuccess, setShowSuccess]         = useState(false)
  const [lastCheckin, setLastCheckin]         = useState<{ plate: string; services: string; price: number } | null>(null)
  const [isFreeWashSuccess, setIsFreeWashSuccess] = useState(false)

  // Plate autocomplete
  const [plateSuggestions, setPlateSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions]   = useState(false)
  const plateRef      = useRef<HTMLDivElement>(null)
  const plateDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (plateRef.current && !plateRef.current.contains(e.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handlePlateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase()
    setForm((prev) => ({ ...prev, plate_number: val }))
    if (plateDebounce.current) clearTimeout(plateDebounce.current)
    if (val.length < 2) { setPlateSuggestions([]); setShowSuggestions(false); return }
    plateDebounce.current = setTimeout(async () => {
      const { data } = await supabase.from('transactions').select('plate_number').ilike('plate_number', `${val}%`).limit(6)
      const unique = [...new Set((data ?? []).map((r) => r.plate_number))]
      setPlateSuggestions(unique); setShowSuggestions(unique.length > 0)
    }, 300)
  }

  async function selectPlate(plate: string) {
    setShowSuggestions(false)
    const { data } = await supabase.from('transactions').select('plate_number, make, model')
      .eq('plate_number', plate).order('date', { ascending: false }).order('time_in', { ascending: false }).limit(1).maybeSingle()
    setForm((prev) => ({ ...prev, plate_number: plate, make: data?.make ?? prev.make, model: data?.model ?? prev.model }))
  }

  // Loyalty
  const [loyaltyEnabled, setLoyaltyEnabled]     = useState(false)
  const [loyaltyPlate, setLoyaltyPlate]         = useState('')
  const [loyaltyCard, setLoyaltyCard]           = useState<LoyaltyCard | null | 'not_found'>('not_found')
  const [loyaltyLookingUp, setLoyaltyLookingUp] = useState(false)
  const lookupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!loyaltyEnabled) return
    const plate = loyaltyPlate.trim().toUpperCase()
    if (!plate) { setLoyaltyCard('not_found'); return }
    if (lookupTimeout.current) clearTimeout(lookupTimeout.current)
    lookupTimeout.current = setTimeout(async () => {
      setLoyaltyLookingUp(true)
      const { data } = await supabase.from('loyalty_cards').select('id, plate_number, wash_count, last_redeemed, created_at').eq('plate_number', plate).maybeSingle()
      setLoyaltyLookingUp(false); setLoyaltyCard(data ?? 'not_found')
    }, 400)
    return () => { if (lookupTimeout.current) clearTimeout(lookupTimeout.current) }
  }, [loyaltyPlate, loyaltyEnabled])

  function handleLoyaltyToggle() {
    const next = !loyaltyEnabled; setLoyaltyEnabled(next)
    if (next) setLoyaltyPlate(form.plate_number)
    else { setLoyaltyCard('not_found'); setLoyaltyPlate('') }
  }

  // Load dropdowns
  useEffect(() => {
    async function loadDropdowns() {
      const [{ data: pl }, { data: sv }, { data: pm }, { data: sp }, { data: st }] = await Promise.all([
        supabase.from('price_list').select('size_category, base_price').eq('is_active', true).order('sort_order'),
        supabase.from('services').select('name').eq('is_active', true),
        supabase.from('payment_methods').select('name').eq('is_active', true).order('sort_order'),
        supabase.from('service_prices').select('service_name, size_category, price'),
        supabase.from('settings').select('teams').eq('id', '1').single(),
      ])
      if (pl) setSizes(pl)
      if (sv) setServices(sv)
      if (pm) setPaymentMethods(pm)
      if (sp) setServicePrices(sp)
      if (st?.teams) setTeams(st.teams)
    }
    loadDropdowns()
  }, [])

  const cardFound  = loyaltyCard !== 'not_found' && loyaltyCard !== null
  const washCount  = cardFound ? (loyaltyCard as LoyaltyCard).wash_count : 0
  const nextCount  = washCount + 1
  const isFreeWash = loyaltyEnabled && nextCount % LOYALTY_THRESHOLD === 0

  const isOthers = (name: string) => name.trim().toLowerCase() === 'others'

  function priceForService(serviceName: string, sizeCategory: string): number {
    if (isOthers(serviceName)) return 0
    if (sizeCategory && serviceName) {
      const match = servicePrices.find((sp) => sp.size_category === sizeCategory && sp.service_name === serviceName)
      if (match) return match.price
    }
    if (sizeCategory) {
      const base = sizes.find((s) => s.size_category === sizeCategory)
      if (base) return base.base_price
    }
    return 0
  }

  const autoTotal      = selectedServices.reduce((sum, svc) => sum + priceForService(svc, form.size_category), 0)
  const effectivePrice = isFreeWash ? 0 : (manualPrice !== '' ? parseFloat(manualPrice) || 0 : autoTotal)
  const isPendingPayment = form.payment_method === '' || form.payment_method === 'Pending'

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target; setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, size_category: e.target.value })); setManualPrice('')
  }

  function toggleService(name: string) {
    setSelectedServices((prev) => prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name])
    setManualPrice('')
  }

  function resetForm() {
    setForm(EMPTY_FORM); setSelectedServices([]); setManualPrice('')
    setLoyaltyEnabled(false); setLoyaltyCard('not_found'); setLoyaltyPlate('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')

    const { plate_number, size_category } = form
    if (!plate_number || !size_category || selectedServices.length === 0) {
      setError('Please fill in plate, size, and at least one service.'); return
    }

    const now          = new Date()
    const localDate    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const localTime    = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    const serviceLabel = selectedServices.join(', ')
    const paymentMethod = form.payment_method || 'Pending'
    const status = isPendingPayment ? 'Pending' : form.status

    setLoading(true)

    const { data: txData, error: txErr } = await supabase.from('transactions').insert({
      plate_number: plate_number.toUpperCase(), make: form.make, model: form.model,
      size_category, service_name: serviceLabel, price: effectivePrice,
      payment_method: paymentMethod, notes: form.notes, status,
      date: localDate, time_in: localTime, team: form.team || null,
    }).select('id').single()

    if (txErr) { setError(txErr.message); setLoading(false); return }

    const serviceRows = selectedServices.map((svc) => ({
      transaction_id: txData.id, service_name: svc, price: priceForService(svc, size_category),
    }))
    await supabase.from('transaction_services').insert(serviceRows)

    if (loyaltyEnabled) {
      const loyaltyPlateUp = loyaltyPlate.trim().toUpperCase() || plate_number.toUpperCase()
      if (cardFound) {
        const card = loyaltyCard as LoyaltyCard
        await supabase.from('loyalty_cards').update({
          wash_count: isFreeWash ? 0 : card.wash_count + 1,
          ...(isFreeWash ? { last_redeemed: localDate } : {}),
        }).eq('id', card.id)
      } else {
        await supabase.from('loyalty_cards').insert({ plate_number: loyaltyPlateUp, wash_count: 1 })
      }
    }

    setLoading(false)

    // Show success modal instead of inline message
    setLastCheckin({ plate: plate_number.toUpperCase(), services: serviceLabel, price: effectivePrice })
    setIsFreeWashSuccess(isFreeWash)
    setShowSuccess(true)
    resetForm()
  }

  const inputCls =
    'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 ' +
    'placeholder:text-gray-400 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'
  const labelCls = 'mb-1 block text-sm font-medium text-gray-700'

  return (
    <div className="px-6 py-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">New Check-In</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-white p-6 shadow-sm">

          {/* Plate Number */}
          <div>
            <label className={labelCls}>Plate Number <span className="text-red-500">*</span></label>
            <div ref={plateRef} className="relative">
              <input type="text" name="plate_number" value={form.plate_number}
                onChange={handlePlateChange}
                onFocus={() => plateSuggestions.length > 0 && setShowSuggestions(true)}
                placeholder="e.g. ABC 1234"
                className={`${inputCls} uppercase placeholder:normal-case`}
                autoComplete="off" required />
              {showSuggestions && plateSuggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
                  {plateSuggestions.map((plate) => (
                    <li key={plate}>
                      <button type="button" onClick={() => selectPlate(plate)}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-amber-50 hover:text-[#B8922A]">
                        {plate}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Make & Model */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Make</label>
              <input type="text" name="make" value={form.make} onChange={handleChange} placeholder="e.g. Toyota" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input type="text" name="model" value={form.model} onChange={handleChange} placeholder="e.g. Vios" className={inputCls} />
            </div>
          </div>

          {/* Size */}
          <div>
            <label className={labelCls}>Size Category <span className="text-red-500">*</span></label>
            <select name="size_category" value={form.size_category} onChange={handleSizeChange} className={inputCls} required>
              <option value="">Select size…</option>
              {sizes.map((row) => <option key={row.size_category} value={row.size_category}>{row.size_category}</option>)}
            </select>
          </div>

          {/* Services */}
          <div>
            <label className={labelCls}>Services <span className="text-red-500">*</span></label>
            {services.length === 0 ? <p className="text-sm text-gray-400">Loading services…</p> : (
              <div className="flex flex-wrap gap-2">
                {services.map((svc) => {
                  const selected  = selectedServices.includes(svc.name)
                  const unitPrice = form.size_category ? priceForService(svc.name, form.size_category) : null
                  return (
                    <button key={svc.name} type="button" onClick={() => toggleService(svc.name)}
                      className="flex flex-col items-start rounded-xl border px-4 py-2.5 text-left transition-all"
                      style={{ borderColor: selected ? '#B8922A' : '#e5e7eb', backgroundColor: selected ? 'rgba(184,146,42,0.08)' : '#fff', color: selected ? '#B8922A' : '#374151' }}>
                      <span className="text-sm font-semibold">{svc.name}</span>
                      {isOthers(svc.name) ? (
                        <span className="text-xs italic" style={{ color: selected ? '#B8922A' : '#9ca3af' }}>Enter price manually</span>
                      ) : unitPrice !== null ? (
                        <span className="text-xs" style={{ color: selected ? '#B8922A' : '#9ca3af' }}>
                          {isFreeWash ? 'FREE' : formatPHP(unitPrice)}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
            {selectedServices.length === 0 && <p className="mt-1.5 text-xs text-gray-400">Tap to select one or more services.</p>}
          </div>

          {/* Price breakdown */}
          {selectedServices.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="mb-2 space-y-1">
                {selectedServices.map((svc) => (
                  <div key={svc} className="flex justify-between text-sm text-gray-600">
                    <span>{svc}</span>
                    {isOthers(svc) ? <span className="italic text-gray-400">manual</span>
                      : <span>{isFreeWash ? 'FREE' : formatPHP(priceForService(svc, form.size_category))}</span>}
                  </div>
                ))}
              </div>
              <div className="mb-3 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold text-gray-900">
                <span>Auto Total</span>
                <span style={{ color: '#B8922A' }}>{isFreeWash ? 'FREE' : formatPHP(autoTotal)}</span>
              </div>
              {!isFreeWash && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Price Override (₱) — leave blank to use auto total</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₱</span>
                    <input type="number" min="0" step="0.01" value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder={String(autoTotal)}
                      className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-7 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20" />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Total to charge: <strong style={{ color: '#B8922A' }}>{formatPHP(effectivePrice)}</strong>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Loyalty Card */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Primera Circle</p>
                <p className="text-xs text-gray-400">Loyalty reward program</p>
              </div>
              <button type="button" onClick={handleLoyaltyToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${loyaltyEnabled ? 'bg-[#B8922A]' : 'bg-gray-200'}`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${loyaltyEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {loyaltyEnabled && (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Loyalty Plate Number</label>
                  <input type="text" value={loyaltyPlate}
                    onChange={(e) => setLoyaltyPlate(e.target.value.toUpperCase())}
                    placeholder="e.g. ABC 1234"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm uppercase focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20" />
                </div>
                {loyaltyLookingUp ? <p className="text-xs text-gray-400">Looking up…</p>
                  : loyaltyPlate.trim() === '' ? null
                  : cardFound ? (
                    <>
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="font-semibold text-gray-700">{(loyaltyCard as LoyaltyCard).plate_number}</span>
                          <span style={{ color: '#B8922A' }} className="font-bold">{washCount} / {LOYALTY_THRESHOLD} washes</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min((washCount / LOYALTY_THRESHOLD) * 100, 100)}%`, backgroundColor: '#B8922A' }} />
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          {LOYALTY_THRESHOLD - washCount} wash{LOYALTY_THRESHOLD - washCount !== 1 ? 'es' : ''} until free wash
                          {(loyaltyCard as LoyaltyCard).last_redeemed && ` · Last redeemed ${(loyaltyCard as LoyaltyCard).last_redeemed}`}
                        </p>
                      </div>
                      {isFreeWash && (
                        <div className="rounded-lg bg-green-500 px-4 py-3 text-center">
                          <p className="text-sm font-bold text-white">🎉 FREE WASH — Loyalty Reward!</p>
                          <p className="text-xs text-green-100">Price will be set to ₱0 automatically</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="rounded-lg px-3 py-2 text-xs font-medium" style={{ backgroundColor: 'rgba(184,146,42,0.08)', color: '#B8922A' }}>
                      New loyalty card — will be created on submit
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* Team selector */}
          {teams.length > 0 && (
            <div>
              <label className={labelCls}>Team</label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setForm((f) => ({ ...f, team: '' }))}
                  className="rounded-xl border px-4 py-2 text-sm font-semibold transition-all"
                  style={{ borderColor: form.team === '' ? '#B8922A' : '#e5e7eb', backgroundColor: form.team === '' ? 'rgba(184,146,42,0.08)' : '#fff', color: form.team === '' ? '#B8922A' : '#6b7280' }}>
                  No Team
                </button>
                {teams.map((t) => (
                  <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, team: t }))}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold transition-all"
                    style={{ borderColor: form.team === t ? '#B8922A' : '#e5e7eb', backgroundColor: form.team === t ? 'rgba(184,146,42,0.08)' : '#fff', color: form.team === t ? '#B8922A' : '#6b7280' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div>
            <label className={labelCls}>Payment Method</label>
            <select name="payment_method" value={form.payment_method} onChange={handleChange} className={inputCls}>
              <option value="">— Pending (pay later) —</option>
              {paymentMethods.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}
            </select>
            {isPendingPayment && (
              <p className="mt-1 text-xs text-blue-500">Payment will be marked as Pending — update in Queue when paid.</p>
            )}
          </div>

          {/* Status — only if payment selected */}
          {!isPendingPayment && (
            <div>
              <label className={labelCls}>Status</label>
              <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
                <option value="On Hand">On Hand</option>
                <option value="Deposited">Deposited</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">On Hand = cash in register, Deposited = transferred to bank/account</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange}
              placeholder="Optional notes…" rows={3} className={`${inputCls} resize-none`} />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

          {/* Submit */}
          <button type="submit" disabled={loading}
            className="w-full rounded-xl px-6 py-4 text-base font-semibold text-white transition active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: '#B8922A' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}>
            {loading ? 'Saving…'
              : isFreeWash ? 'Submit FREE WASH Check-In'
              : isPendingPayment ? `Submit — Pending Payment${selectedServices.length > 0 ? ` (${formatPHP(effectivePrice)})` : ''}`
              : `Submit Check-In${selectedServices.length > 0 ? ` — ${formatPHP(effectivePrice)}` : ''}`}
          </button>

        </form>
      </div>

      {/* ── Success Modal ── */}
      {showSuccess && lastCheckin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center">
            {/* Icon */}
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <span className="text-3xl">{isFreeWashSuccess ? '🎉' : '✓'}</span>
            </div>

            <h3 className="mb-1 text-lg font-bold text-gray-900">
              {isFreeWashSuccess ? 'Free Wash Redeemed!' : 'Added to Queue!'}
            </h3>
            <p className="mb-1 text-sm font-semibold" style={{ color: '#B8922A' }}>{lastCheckin.plate}</p>
            <p className="mb-1 text-sm text-gray-600">{lastCheckin.services}</p>
            <p className="mb-5 text-sm font-bold text-gray-900">
              {isFreeWashSuccess ? 'FREE' : formatPHP(lastCheckin.price)}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowSuccess(false); router.push('/queue') }}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white"
                style={{ backgroundColor: '#B8922A' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}>
                View Queue
              </button>
              <button
                onClick={() => setShowSuccess(false)}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                New Check-In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}