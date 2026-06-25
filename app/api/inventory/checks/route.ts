import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { decrypt } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const to   = searchParams.get('to')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const supabase = createServerSupabase()
  let query = supabase
    .from('inventory_checks')
    .select('item_id,check_type,counted_quantity,checker_name,created_at,date')
    .order('created_at', { ascending: false })

  if (to) {
    query = query.gte('date', date).lte('date', to)
  } else {
    query = query.eq('date', date)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ checks: data })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  // body: { checks: {item_id, counted_quantity}[], date, check_type, checker_name, is_admin_override?, reason? }

  const supabase = createServerSupabase()
  const today = new Date().toISOString().split('T')[0]
  const isPast = body.date < today

  if (isPast && payload.role !== 'admin') {
    return NextResponse.json({ error: 'Past-day corrections require admin' }, { status: 403 })
  }

  const rows = (body.checks as { item_id: string; counted_quantity: number }[]).map((c) => ({
    item_id: c.item_id,
    date: body.date,
    check_type: body.check_type,
    counted_quantity: c.counted_quantity,
    checker_name: body.checker_name,
  }))

  const { error: upsertErr } = await supabase
    .from('inventory_checks')
    .upsert(rows, { onConflict: 'item_id,date,check_type' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Update current_stock and write audit rows
  const auditRows: Record<string, unknown>[] = []
  for (const c of body.checks as { item_id: string; counted_quantity: number }[]) {
    const { data: item } = await supabase
      .from('inventory_items')
      .select('current_stock')
      .eq('id', c.item_id)
      .single()

    await supabase
      .from('inventory_items')
      .update({ current_stock: c.counted_quantity })
      .eq('id', c.item_id)

    auditRows.push({
      item_id: c.item_id,
      action_type: body.is_admin_override ? 'manual_correction' : 'daily_count',
      field_changed: 'current_stock',
      previous_value: item?.current_stock ?? null,
      new_value: c.counted_quantity,
      reason: body.reason ?? null,
      performed_by: body.checker_name,
      is_admin_override: body.is_admin_override ?? false,
    })
  }

  await supabase.from('inventory_audit_log').insert(auditRows)

  return NextResponse.json({ ok: true })
}
