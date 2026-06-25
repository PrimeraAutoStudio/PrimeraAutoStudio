import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { decrypt } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')
  const itemId     = searchParams.get('item_id')
  const actionType = searchParams.get('action_type')

  const supabase = createServerSupabase()
  let query = supabase
    .from('inventory_audit_log')
    .select('*,inventory_items(name,unit)')
    .order('created_at', { ascending: false })
    .limit(300)

  if (from) query = query.gte('created_at', from + 'T00:00:00')
  if (to)   query = query.lte('created_at', to   + 'T23:59:59')
  if (itemId) query = query.eq('item_id', itemId)
  if (actionType && actionType !== 'all') query = query.eq('action_type', actionType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: data })
}
