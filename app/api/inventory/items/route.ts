import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { decrypt } from '@/lib/session'

export const dynamic = 'force-dynamic'

async function getPayload(request: NextRequest) {
  const token = request.cookies.get('session')?.value
  return decrypt(token)
}

export async function GET(request: NextRequest) {
  const payload = await getPayload(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = payload.role === 'admin'
  const supabase = createServerSupabase()

  const select = isAdmin
    ? 'id,name,category,unit,current_stock,low_stock_threshold,reorder_quantity,cost_per_unit,is_active'
    : 'id,name,category,unit,current_stock,low_stock_threshold,is_active'

  const { data, error } = await supabase
    .from('inventory_items')
    .select(select)
    .eq('is_active', true)
    .order('category')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data })
}

export async function POST(request: NextRequest) {
  const payload = await getPayload(request)
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  const body = await request.json()
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      name: body.name,
      category: body.category,
      unit: body.unit,
      low_stock_threshold: body.low_stock_threshold ?? null,
      reorder_quantity: body.reorder_quantity ?? null,
      cost_per_unit: body.cost_per_unit ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('inventory_audit_log').insert({
    item_id: data.id,
    action_type: 'item_created',
    field_changed: 'current_stock',
    new_value: 0,
    performed_by: payload.fullName,
  })

  return NextResponse.json({ item: data })
}
