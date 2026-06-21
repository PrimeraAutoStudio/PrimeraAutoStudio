import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { decrypt } from '@/lib/session'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  // 1. Verify requesting session is an admin
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { targetUserId, newPassword, confirmAdminPassword, passwordHint } = await request.json()

  if (!targetUserId || !newPassword || !confirmAdminPassword) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  // 2. Verify admin's own password before proceeding
  const { data: adminUser } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', payload.userId)
    .single()

  if (!adminUser) {
    return NextResponse.json({ error: 'Admin user not found' }, { status: 403 })
  }

  const adminPasswordOk = await bcrypt.compare(confirmAdminPassword, adminUser.password_hash)
  if (!adminPasswordOk) {
    return NextResponse.json({ error: 'Admin password incorrect' }, { status: 403 })
  }

  // 3. Hash the new password and update the target user
  const newHash = await bcrypt.hash(newPassword, 10)
  const updatePayload: Record<string, string | null> = { password_hash: newHash }
  if (passwordHint !== undefined) updatePayload.password_hint = passwordHint || null

  const { error } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('id', targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
