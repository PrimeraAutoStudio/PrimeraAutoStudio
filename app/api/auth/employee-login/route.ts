import { NextResponse } from 'next/server'
import { encrypt } from '@/lib/session'

export async function POST() {
  const token = await encrypt({ userId: 'employee', role: 'employee', fullName: 'Employee' })

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
