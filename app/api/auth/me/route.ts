import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value
  const payload = await decrypt(token)
  if (!payload) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  return NextResponse.json({
    userId: payload.userId,
    role: payload.role,
    fullName: payload.fullName,
  })
}
