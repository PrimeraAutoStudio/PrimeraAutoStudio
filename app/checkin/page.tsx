'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SizeRow          { size_category: string; base_price: number }
interface ServiceRow       { name: string }
interface PaymentMethodRow { name: string }
interface ServicePriceRow  { service_name: string; size_category: string; price: number }
interface LoyaltyCard {
  id: number
  plate_number: string
  wash_count: number
  last_redeemed: string | null
  created_at: string
}

interface FormState {
  plate_number: string
  make: string
  model: string
  size_category: string
  payment_method: string
  status: string
  notes: string
}

const EMPTY_FORM: FormState = {
  plate_number: '',
  make: '',
  model: '',
  size_category: '',
  payment_method: '',
  status: 'On Hand',
  notes: '',
}

const LOYALTY_THRESHOLD = 10

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPHP(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckIn() {
  const [sizes, setSizes]                   = useState<SizeRow[]>([])
  const [services, setServices]             = useState<ServiceRow[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([])
  const [servicePrices, setServicePrices]   = useState<ServicePriceRow[]>([])

  const [form, setForm]                     = useState<FormState>(EMPTY_FORM)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [manualPrice, setManualPrice]       = useState<string>('')
  const [loading, setLoading]               = useState(false)
  const [success, setSuccess]               = useState(false)
  const [error, setError]                   = useState('')

  // ── Loyalty state ──────────────────────────────────────────────────────────
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false)
  const [loyaltyPlate, setLoyaltyPlate]     = useState('')
  const [loyaltyCard, setLoyaltyCard]       = useState<LoyaltyCard | null | 'not_found'>('not_found')
  const [loyaltyLookingUp, setLoyaltyLookingUp] = useState(false)
  const lookupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load dropdowns ────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadDropdowns() {
      const [
        { data: pl, error: plErr },
        { data: sv, error: svErr },
        { data: pm, error: pmErr },
        { data: sp, error: spErr },
      ] = await Promise.all([
        supabase.from('price_list').select('size_category, base_price').eq('is_active', true).order('sort_order'),
        supabase.from('services').select('name').eq('is_active', true),
        supabase.from('payment_methods').select('name').eq('is_active', true).order('sort_order'),
        supabase.from('service_prices').select('service_name, size_category, price'),
      ])
      if (plErr) console.error('price_list:', plErr.message)
      if (svErr) console.error('services:', svErr.message)
      if (pmErr) console.error('payment_methods:', pmErr.message)
      if (spErr) console.error('service_prices:', spErr.message)
      if (pl) setSizes(pl)
      if (sv) setServices(sv)
      if (pm) setPaymentMethods(pm)
      if (sp) setServicePrices(sp)
    }
    loadDropdowns()
  }, [])

  // ── Loyalty lookup (debounced) ────────────────────────────────────────────

  useEffect(() => {
    if (!loyaltyEnabled) return
    const plate = loyaltyPlate.trim().toUpperCase()
    if (!plate) { setLoyaltyCard('not_found'); return }

    if (lookupTimeout.current) clearTimeout(lookupTimeout.current)
    lookupTimeout.current = setTimeout(async () => {
      setLoyaltyLookingUp(true)
      const { data } = await supabase
        .from('loyalty_cards')
        .select('id, plate_number, wash_count, last_redeemed, created_at')
        .eq('plate_number', plate)
        .maybeSingle()
      setLoyaltyLookingUp(false)
      setLoyaltyCard(data ?? 'not_found')
    }, 400)

    return () => { if (lookupTimeout.current) clearTimeout(lookupTimeout.current) }
  }, [loyaltyPlate, loyaltyEnabled])

  // When loyalty is toggled on, pre-fill from form plate number
  function handleLoyaltyToggle() {
    const next = !loyaltyEnabled
    setLoyaltyEnabled(next)
    if (next) setLoyaltyPlate(form.plate_number)
    else { setLoyaltyCard('not_found'); setLoyaltyPlate('') }
  }

  // ── Derived loyalty state ──────────────────────────────────────────────────

  const cardFound   = loyaltyCard !== 'not_found' && loyaltyCard !== null
  const washCount   = cardFound ? (loyaltyCard as LoyaltyCard).wash_count : 0
  // After this wash, the new count would be washCount + 1
  const nextCount   = washCount + 1
  const isFreeWash  = loyaltyEnabled && nextCount % LOYALTY_THRESHOLD === 0

  // ── Price resolution ──────────────────────────────────────────────────────

  const isOthers = (name: string) => name.trim().toLowerCase() === 'others'

  function priceForService(serviceName: string, sizeCategory: string): number {
    if (isOthers(serviceName)) return 0
    if (sizeCategory && serviceName) {
      const match = servicePrices.find(
        (sp) => sp.size_category === sizeCategory && sp.service_name === serviceName
      )
      if (match) return match.price
    }
    if (sizeCategory) {
      const base = sizes.find((s) => s.size_category === sizeCategory)
      if (base) return base.base_price
    }
    return 0
  }

  const autoTotal     = selectedServices.reduce((sum, svc) => sum + priceForService(svc, form.size_category), 0)
  // Free wash overrides everything to ₱0
  const effectivePrice = isFreeWash ? 0 : (manualPrice !== '' ? parseFloat(manualPrice) || 0 : autoTotal)

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, size_category: e.target.value }))
    setManualPrice('')
  }

  function toggleService(name: string) {
    setSelectedServices((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    )
    setManualPrice('')
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const { plate_number, size_category, payment_method, status } = form
    if (!plate_number || !size_category || selectedServices.length === 0 || !payment_method || !status) {
      setError('Please fill in all required fields and select at least one service.')
      return
    }

    const now          = new Date()
    const date         = now.toISOString().split('T')[0]
    const time         = now.toTimeString().split(' ')[0]
    const totalPrice   = effectivePrice
    const serviceLabel = selectedServices.join(', ')

    setLoading(true)

    // 1 — insert the transaction
    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({
        plate_number: plate_number.toUpperCase(),
        make:          form.make,
        model:         form.model,
        size_category,
        service_name:  serviceLabel,
        price:         totalPrice,
        payment_method,
        notes:         form.notes,
        status,
        date,
        time_in:       time,
      })
      .select('id')
      .single()

    if (txErr) { setError(txErr.message); setLoading(false); return }

    // 2 — insert transaction_services rows
    const serviceRows = selectedServices.map((svc) => ({
      transaction_id: txData.id,
      service_name:   svc,
      price:          priceForService(svc, size_category),
    }))
    const { error: svcErr } = await supabase.from('transaction_services').insert(serviceRows)
    if (svcErr) console.error('transaction_services:', svcErr.message)

    // 3 — loyalty card update
    if (loyaltyEnabled) {
      const loyaltyPlateUp = loyaltyPlate.trim().toUpperCase() || plate_number.toUpperCase()
      const isRedemption   = isFreeWash

      if (cardFound) {
        const card = loyaltyCard as LoyaltyCard
        const newCount = isRedemption ? 0 : card.wash_count + 1
        await supabase.from('loyalty_cards').update({
          wash_count:     newCount,
          ...(isRedemption ? { last_redeemed: date } : {}),
        }).eq('id', card.id)
      } else {
        // Create new card
        await supabase.from('loyalty_cards').insert({
          plate_number: loyaltyPlateUp,
          wash_count:   1,
        })
      }
    }

    setLoading(false)
    setSuccess(true)
    setForm(EMPTY_FORM)
    setSelectedServices([])
    setManualPrice('')
    setLoyaltyEnabled(false)
    setLoyaltyCard('not_found')
    setLoyaltyPlate('')
    setTimeout(() => setSuccess(false), 4000)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputCls =
    'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 ' +
    'placeholder:text-gray-400 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20'
  const labelCls = 'mb-1 block text-sm font-medium text-gray-700'

  // ── Render ────────────────────────────────────────────────────────────────

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
            <input type="text" name="plate_number" value={form.plate_number}
              onChange={handleChange} placeholder="e.g. ABC 1234"
              className={`${inputCls} uppercase placeholder:normal-case`} required />
          </div>

          {/* Make & Model */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Make</label>
              <input type="text" name="make" value={form.make}
                onChange={handleChange} placeholder="e.g. Toyota" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input type="text" name="model" value={form.model}
                onChange={handleChange} placeholder="e.g. Vios" className={inputCls} />
            </div>
          </div>

          {/* Size Category */}
          <div>
            <label className={labelCls}>Size Category <span className="text-red-500">*</span></label>
            <select name="size_category" value={form.size_category}
              onChange={handleSizeChange} className={inputCls} required>
              <option value="">Select size…</option>
              {sizes.map((row) => (
                <option key={row.size_category} value={row.size_category}>{row.size_category}</option>
              ))}
            </select>
          </div>

          {/* Multi-select Services */}
          <div>
            <label className={labelCls}>Services <span className="text-red-500">*</span></label>
            {services.length === 0 ? (
              <p className="text-sm text-gray-400">Loading services…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {services.map((svc) => {
                  const selected   = selectedServices.includes(svc.name)
                  const unitPrice  = form.size_category ? priceForService(svc.name, form.size_category) : null
                  return (
                    <button key={svc.name} type="button" onClick={() => toggleService(svc.name)}
                      className="flex flex-col items-start rounded-xl border px-4 py-2.5 text-left transition-all"
                      style={{
                        borderColor:     selected ? '#B8922A' : '#e5e7eb',
                        backgroundColor: selected ? 'rgba(184,146,42,0.08)' : '#fff',
                        color:           selected ? '#B8922A' : '#374151',
                      }}>
                      <span className="text-sm font-semibold">{svc.name}</span>
                      {isOthers(svc.name) ? (
                        <span className="text-xs italic" style={{ color: selected ? '#B8922A' : '#9ca3af' }}>
                          Enter price manually
                        </span>
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
            {selectedServices.length === 0 && (
              <p className="mt-1.5 text-xs text-gray-400">Tap to select one or more services.</p>
            )}
          </div>

          {/* Price breakdown */}
          {selectedServices.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="mb-2 space-y-1">
                {selectedServices.map((svc) => (
                  <div key={svc} className="flex justify-between text-sm text-gray-600">
                    <span>{svc}</span>
                    {isOthers(svc)
                      ? <span className="italic text-gray-400">manual</span>
                      : <span>{isFreeWash ? 'FREE' : formatPHP(priceForService(svc, form.size_category))}</span>}
                  </div>
                ))}
              </div>
              <div className="mb-3 flex justify-between border-t border-gray-200 pt-2 text-sm font-bold text-gray-900">
                <span>Auto Total</span>
                <span style={{ color: '#B8922A' }}>{isFreeWash ? 'FREE' : formatPHP(autoTotal)}</span>
              </div>
              {/* Manual override — hidden during free wash */}
              {!isFreeWash && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Price Override (₱) — leave blank to use auto total
                  </label>
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

          {/* ── Loyalty Card ── */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Primera Circle</p>
                <p className="text-xs text-gray-400">Loyalty reward program</p>
              </div>
              {/* Toggle */}
              <button type="button" onClick={handleLoyaltyToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  loyaltyEnabled ? 'bg-[#B8922A]' : 'bg-gray-200'
                }`}>
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  loyaltyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {loyaltyEnabled && (
              <div className="mt-3 space-y-2">
                {/* Plate lookup field */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Loyalty Plate Number
                  </label>
                  <input type="text" value={loyaltyPlate}
                    onChange={(e) => setLoyaltyPlate(e.target.value.toUpperCase())}
                    placeholder="e.g. ABC 1234"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm uppercase focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20" />
                </div>

                {/* Lookup result */}
                {loyaltyLookingUp ? (
                  <p className="text-xs text-gray-400">Looking up…</p>
                ) : loyaltyPlate.trim() === '' ? null : cardFound ? (
                  <>
                    {/* Progress display */}
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-700">
                          {(loyaltyCard as LoyaltyCard).plate_number}
                        </span>
                        <span style={{ color: '#B8922A' }} className="font-bold">
                          {washCount} / {LOYALTY_THRESHOLD} washes
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min((washCount / LOYALTY_THRESHOLD) * 100, 100)}%`,
                            backgroundColor: '#B8922A',
                          }} />
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {LOYALTY_THRESHOLD - washCount} wash{LOYALTY_THRESHOLD - washCount !== 1 ? 'es' : ''} until free wash
                        {(loyaltyCard as LoyaltyCard).last_redeemed &&
                          ` · Last redeemed ${(loyaltyCard as LoyaltyCard).last_redeemed}`}
                      </p>
                    </div>

                    {/* FREE WASH banner */}
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

          {/* Payment Method */}
          <div>
            <label className={labelCls}>Payment Method <span className="text-red-500">*</span></label>
            <select name="payment_method" value={form.payment_method}
              onChange={handleChange} className={inputCls} required>
              <option value="">Select payment…</option>
              {paymentMethods.map((row) => (
                <option key={row.name} value={row.name}>{row.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status <span className="text-red-500">*</span></label>
            <select name="status" value={form.status}
              onChange={handleChange} className={inputCls} required>
              <option value="On Hand">On Hand</option>
              <option value="Deposited">Deposited</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              On Hand = cash in register, Deposited = transferred to bank/account
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange}
              placeholder="Optional notes…" rows={3} className={`${inputCls} resize-none`} />
          </div>

          {/* Feedback */}
          {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          {success && (
            <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              Check-in saved successfully!{isFreeWash ? ' Loyalty card redeemed.' : ''}
            </p>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading}
            className="w-full rounded-xl px-6 py-4 text-base font-semibold text-white transition active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: '#B8922A' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#D4AB4E' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#B8922A' }}
          >
            {loading
              ? 'Saving…'
              : isFreeWash
              ? 'Submit FREE WASH Check-In'
              : `Submit Check-In${selectedServices.length > 0 ? ` — ${formatPHP(effectivePrice)}` : ''}`}
          </button>

        </form>
      </div>
    </div>
  )
}
