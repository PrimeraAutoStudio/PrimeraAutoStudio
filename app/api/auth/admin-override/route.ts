import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 })
    }

    const supabase = createServerSupabase()
    const { data: admins } = await supabase
      .from('users')
      .select('password_hash')
      .eq('role', 'admin')
      .eq('is_active', true)

    if (!admins || admins.length === 0) {
      return NextResponse.json({ error: 'No admin accounts found' }, { status: 401 })
    }

    for (const admin of admins) {
      const match = await bcrypt.compare(password, admin.password_hash)
      if (match) {
        return NextResponse.json({ ok: true })
      }
    }

    return NextResponse.json({ error: 'Incorrect admin password' }, { status: 401 })
  } catch (err) {
    console.error('Admin override error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
