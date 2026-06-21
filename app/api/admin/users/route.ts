import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('users')
    .select('id, username, full_name, role, is_active')
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data })
}
