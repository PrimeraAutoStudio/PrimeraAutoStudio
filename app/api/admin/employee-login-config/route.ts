import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { decrypt } from '@/lib/session'
import { createServerSupabase } from '@/lib/supabase-server'

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload || payload.role !== 'admin') return null
  return payload
}

// GET — returns { requirePassword: boolean }
export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const supabase = createServerSupabase()
  const { data } = await supabase.from('settings').select('employee_password_required').eq('id', '1').single()
  return NextResponse.json({ requirePassword: data?.employee_password_required ?? false })
}

// POST — { requirePassword: boolean, newPassword?: string }
export async function POST(request: NextRequest) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const { requirePassword, newPassword } = await request.json()
  const supabase = createServerSupabase()

  await supabase.from('settings').update({ employee_password_required: requirePassword }).eq('id', '1')

  if (requirePassword && newPassword) {
    const hash = await bcrypt.hash(newPassword, 10)
    await supabase.from('users').update({ password_hash: hash }).eq('username', 'employee')
  }

  return NextResponse.json({ ok: true })
}
