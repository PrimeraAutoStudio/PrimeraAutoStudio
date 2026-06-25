import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { decrypt } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  const body = await request.json()
  // body: { item_id, quantity, cost_per_unit, date, notes?, payment_type? }

  const supabase = createServerSupabase()

  const { data: item } = await supabase
    .from('inventory_items')
    .select('name,current_stock,cost_per_unit')
    .eq('id', body.item_id)
    .single()

  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const qty      = Number(body.quantity)
  const cpu      = Number(body.cost_per_unit)
  const newStock = (item.current_stock ?? 0) + qty
  const total    = qty * cpu

  await supabase
    .from('inventory_items')
    .update({ current_stock: newStock, cost_per_unit: cpu })
    .eq('id', body.item_id)

  await supabase.from('expenses').insert({
    date: body.date,
    description: `Restock: ${item.name} ×${qty}`,
    category: 'Supplies',
    amount: total,
    payment_type: body.payment_type ?? 'Cash',
    notes: body.notes ?? null,
    inventory_item_id: body.item_id,
  })

  await supabase.from('inventory_audit_log').insert([
    {
      item_id: body.item_id,
      action_type: 'restock',
      field_changed: 'current_stock',
      previous_value: item.current_stock,
      new_value: newStock,
      performed_by: payload.fullName,
      is_admin_override: false,
    },
    {
      item_id: body.item_id,
      action_type: 'restock',
      field_changed: 'cost_per_unit',
      previous_value: item.cost_per_unit,
      new_value: cpu,
      performed_by: payload.fullName,
      is_admin_override: false,
    },
  ])

  return NextResponse.json({ ok: true, newStock })
}
