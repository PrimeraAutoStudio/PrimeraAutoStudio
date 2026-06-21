import { NextResponse } from 'next/server'
import { encrypt } from '@/lib/session'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST() {
  const supabase = createServerSupabase()
  const { data: user } = await supabase
    .from('users')
    .select('id, full_name, role, is_active')
    .eq('username', 'employee')
    .single()

  if (!user || !user.is_active || user.role !== 'employee') {
    return NextResponse.json({ error: 'Employee account not configured' }, { status: 500 })
  }

  const token = await encrypt({ userId: user.id, role: 'employee', fullName: user.full_name ?? 'Employee' })

  const response = NextResponse.json({ ok: true, redirectTo: '/checkin' })
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return response
}
