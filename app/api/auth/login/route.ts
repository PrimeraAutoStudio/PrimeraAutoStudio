import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { encrypt } from '@/lib/session'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
    }

    const supabase = createServerSupabase()
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password_hash, role, full_name, is_active')
      .eq('username', username.trim().toLowerCase())
      .single()

    if (error || !user || !user.is_active) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const token = await encrypt({
      userId: user.id,
      role: user.role,
      fullName: user.full_name,
    })

    const redirectTo = user.role === 'admin' ? '/dashboard' : '/checkin'

    const response = NextResponse.json({ ok: true, role: user.role, redirectTo })
    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
