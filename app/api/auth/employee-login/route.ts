import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { encrypt } from '@/lib/session'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServerSupabase()
  const { data } = await supabase.from('settings').select('employee_password_required').eq('id', '1').single()
  return NextResponse.json({ requirePassword: data?.employee_password_required ?? false })
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabase()
  const { data: settings } = await supabase.from('settings').select('employee_password_required').eq('id', '1').single()
  const requirePassword = settings?.employee_password_required ?? false

  if (requirePassword) {
    const { password } = await request.json().catch(() => ({ password: '' }))
    if (!password) return NextResponse.json({ error: 'Password required' }, { status: 401 })

    const { data: empUser } = await supabase.from('users').select('id, full_name, password_hash, is_active').eq('username', 'employee').single()
    if (!empUser || !empUser.is_active) return NextResponse.json({ error: 'Employee account not configured' }, { status: 500 })

    const ok = await bcrypt.compare(password, empUser.password_hash)
    if (!ok) return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })

    const token = await encrypt({ userId: empUser.id, role: 'employee', fullName: empUser.full_name ?? 'Employee' })
    const response = NextResponse.json({ ok: true, redirectTo: '/checkin' })
    response.cookies.set('session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' })
    return response
  }

  const token = await encrypt({ userId: 'employee', role: 'employee', fullName: 'Employee' })
  const response = NextResponse.json({ ok: true, redirectTo: '/checkin' })
  response.cookies.set('session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' })
  return response
}
