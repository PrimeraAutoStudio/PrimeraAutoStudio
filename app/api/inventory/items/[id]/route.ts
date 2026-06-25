import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { decrypt } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  const body = await request.json()
  const supabase = createServerSupabase()
  const { id } = await params

  const { data: existing, error: fetchErr } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updatePayload: Record<string, unknown> = {}
  const auditRows: Record<string, unknown>[] = []

  const trackedFields = ['current_stock', 'cost_per_unit', 'low_stock_threshold', 'reorder_quantity']
  for (const field of trackedFields) {
    if (body[field] !== undefined && body[field] !== existing[field]) {
      updatePayload[field] = body[field]
      auditRows.push({
        item_id: id,
        action_type: body.action_type ?? 'manual_correction',
        field_changed: field,
        previous_value: existing[field],
        new_value: body[field],
        reason: body.reason ?? null,
        performed_by: payload.fullName,
        is_admin_override: true,
      })
    }
  }

  if (body.name !== undefined) updatePayload.name = body.name
  if (body.category !== undefined) updatePayload.category = body.category
  if (body.unit !== undefined) updatePayload.unit = body.unit

  if (body.is_active !== undefined) {
    updatePayload.is_active = body.is_active
    auditRows.push({
      item_id: id,
      action_type: body.is_active ? 'item_edited' : 'item_deactivated',
      performed_by: payload.fullName,
      is_admin_override: false,
    })
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await supabase.from('inventory_items').update(updatePayload).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (auditRows.length > 0) {
    await supabase.from('inventory_audit_log').insert(auditRows)
  }

  return NextResponse.json({ ok: true })
}
