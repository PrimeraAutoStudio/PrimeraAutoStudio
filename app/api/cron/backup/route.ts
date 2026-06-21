import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { google } from 'googleapis'
import { Readable } from 'stream'
import { createServerSupabase } from '@/lib/supabase-server'

const TABLES = [
  'transactions',
  'expenses',
  'employees',
  'payables',
  'services',
  'price_list',
  'service_prices',
  'payment_methods',
  'loyalty_cards',
  'settings',
] as const

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized triggering
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServerSupabase()
    const wb = XLSX.utils.book_new()

    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select('*')
      if (error) {
        console.error(`[backup] failed to fetch ${table}:`, error.message)
        continue
      }
      if (!data || data.length === 0) {
        const ws = XLSX.utils.aoa_to_sheet([['No data']])
        XLSX.utils.book_append_sheet(wb, ws, table)
        continue
      }
      const headers = Object.keys(data[0])
      const rows = data.map((row) => headers.map((h) => row[h] ?? ''))
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
      XLSX.utils.book_append_sheet(wb, ws, table)
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `primera-backup-${dateStr}.xlsx`

    // Generate Excel buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    // Upload to Google Drive
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    if (!serviceAccountJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env variable not set')
    }

    const serviceAccount = JSON.parse(serviceAccountJson)
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    })

    const drive = google.drive({ version: 'v3', auth })
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

    const fileStream = Readable.from(buffer)

    const uploadRes = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        parents: folderId ? [folderId] : undefined,
      },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: fileStream,
      },
    })

    console.log(`[backup] uploaded ${filename} — file id: ${uploadRes.data.id}`)
    return NextResponse.json({ ok: true, filename, fileId: uploadRes.data.id })
  } catch (err) {
    console.error('[backup] cron job failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
