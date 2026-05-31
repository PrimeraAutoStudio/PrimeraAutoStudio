'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface SizeRow {
  size_category: string
  base_price: number
}

interface ServiceRow {
  name: string
}

interface PaymentMethodRow {
  name: string
}

interface ServicePriceRow {
  service_name: string
  size_category: string
  price: number
}

interface FormState {
  plate_number: string
  make: string
  model: string
  size_category: string
  service_name: string
  price: string
  payment_method: string
  status: string
  notes: string
}

const EMPTY_FORM: FormState = {
  plate_number: '',
  make: '',
  model: '',
  size_category: '',
  service_name: '',
  price: '',
  payment_method: '',
  status: 'On Hand',
  notes: '',
}

export default function CheckIn() {
  const [sizes, setSizes] = useState<SizeRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([])
  const [servicePrices, setServicePrices] = useState<ServicePriceRow[]>([])

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadDropdowns() {
      const [
        { data: pl, error: plErr },
        { data: sv, error: svErr },
        { data: pm, error: pmErr },
        { data: sp, error: spErr },
      ] = await Promise.all([
        supabase
          .from('price_list')
          .select('size_category, base_price')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('services')
          .select('name')
          .eq('is_active', true),
        supabase
          .from('payment_methods')
          .select('name')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('service_prices')
          .select('service_name, size_category, price'),
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

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function resolvePrice(sizeCategory: string, serviceName: string): string {
    if (sizeCategory && serviceName) {
      const match = servicePrices.find(
        (sp) => sp.size_category === sizeCategory && sp.service_name === serviceName
      )
      if (match) return String(match.price)
    }
    // Fall back to price_list base price when size is known but no service_prices match
    if (sizeCategory) {
      const base = sizes.find((s) => s.size_category === sizeCategory)
      if (base) return String(base.base_price)
    }
    return ''
  }

  function handleSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newSize = e.target.value
    setForm((prev) => ({
      ...prev,
      size_category: newSize,
      price: resolvePrice(newSize, prev.service_name),
    }))
  }

  function handleServiceChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newService = e.target.value
    setForm((prev) => ({
      ...prev,
      service_name: newService,
      price: resolvePrice(prev.size_category, newService),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const { plate_number, size_category, service_name, price, payment_method, status } = form
    if (!plate_number || !size_category || !service_name || !price || !payment_method || !status) {
      setError('Please fill in all required fields.')
      return
    }

    const now = new Date()
    const date = now.toISOString().split('T')[0]
    const time = now.toTimeString().split(' ')[0]

    setLoading(true)
    const { error: insertError } = await supabase.from('transactions').insert({
      plate_number: plate_number.toUpperCase(),
      make: form.make,
      model: form.model,
      size_category,
      service_name,
      price: parseFloat(price),
      payment_method,
      notes: form.notes,
      status,
      date,
      time_in: time,
    })
    setLoading(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setSuccess(true)
    setForm(EMPTY_FORM)
    setTimeout(() => setSuccess(false), 3000)
  }

  const inputCls =
    'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 ' +
    'placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200'
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
            <label className={labelCls}>
              Plate Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="plate_number"
              value={form.plate_number}
              onChange={handleChange}
              placeholder="e.g. ABC 1234"
              className={`${inputCls} uppercase placeholder:normal-case`}
              required
            />
          </div>

          {/* Make & Model */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Make</label>
              <input
                type="text"
                name="make"
                value={form.make}
                onChange={handleChange}
                placeholder="e.g. Toyota"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input
                type="text"
                name="model"
                value={form.model}
                onChange={handleChange}
                placeholder="e.g. Vios"
                className={inputCls}
              />
            </div>
          </div>

          {/* Size Category */}
          <div>
            <label className={labelCls}>
              Size Category <span className="text-red-500">*</span>
            </label>
            <select
              name="size_category"
              value={form.size_category}
              onChange={handleSizeChange}
              className={inputCls}
              required
            >
              <option value="">Select size…</option>
              {sizes.map((row) => (
                <option key={row.size_category} value={row.size_category}>
                  {row.size_category}
                </option>
              ))}
            </select>
          </div>

          {/* Service */}
          <div>
            <label className={labelCls}>
              Service <span className="text-red-500">*</span>
            </label>
            <select
              name="service_name"
              value={form.service_name}
              onChange={handleServiceChange}
              className={inputCls}
              required
            >
              <option value="">Select service…</option>
              {services.map((row) => (
                <option key={row.name} value={row.name}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>

          {/* Price */}
          <div>
            <label className={labelCls}>
              Price (₱) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="price"
              value={form.price}
              onChange={handleChange}
              placeholder="Auto-filled from size &amp; service"
              min="0"
              step="0.01"
              className={inputCls}
              required
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className={labelCls}>
              Payment Method <span className="text-red-500">*</span>
            </label>
            <select
              name="payment_method"
              value={form.payment_method}
              onChange={handleChange}
              className={inputCls}
              required
            >
              <option value="">Select payment…</option>
              {paymentMethods.map((row) => (
                <option key={row.name} value={row.name}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>
              Status <span className="text-red-500">*</span>
            </label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className={inputCls}
              required
            >
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
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Optional notes…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Error / Success feedback */}
          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          )}
          {success && (
            <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              Check-in saved successfully!
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Submit Check-In'}
          </button>

        </form>
      </div>
    </div>
  )
}
