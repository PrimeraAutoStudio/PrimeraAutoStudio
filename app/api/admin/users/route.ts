import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
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

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { username, full_name, password, role = 'employee' } = await request.json()

  if (!username || !full_name || !password) {
    return NextResponse.json({ error: 'Username, full name, and password are required.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const hash = await bcrypt.hash(password, 10)
  const { error } = await supabase.from('users').insert({
    username: username.trim().toLowerCase(),
    full_name: full_name.trim(),
    password_hash: hash,
    role,
    is_active: true,
  })

  if (error) {
    const msg = error.message.includes('unique') ? 'Username already exists.' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
