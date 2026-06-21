import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

// Simple in-memory rate limit: max 5 hint requests per IP per 60s window
const attempts = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }
  if (entry.count >= 5) return true
  entry.count++
  return false
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })
  }

  const { username } = await request.json()
  if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 })

  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('users')
    .select('password_hint')
    .eq('username', String(username).trim().toLowerCase())
    .eq('is_active', true)
    .single()

  // Always return the same shape — don't reveal whether the user exists
  if (!data?.password_hint) {
    return NextResponse.json({ hint: null }, { status: 200 })
  }

  return NextResponse.json({ hint: data.password_hint })
}
