import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const hasSecret = !!process.env.SESSION_SECRET
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL

  let dbOk = false
  let dbError = ''
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase.from('users').select('username, role').limit(5)
    dbOk = !error
    if (error) dbError = error.message
    return NextResponse.json({ hasServiceKey, hasSecret, hasUrl, dbOk, dbError, users: data })
  } catch (e: unknown) {
    return NextResponse.json({ hasServiceKey, hasSecret, hasUrl, dbOk: false, dbError: String(e) })
  }
}
