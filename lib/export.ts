/* ─── Client-side export helpers ──────────────────────────────────────────────
 *  All functions run in the browser and trigger a file download.
 *  No server required.
 * ──────────────────────────────────────────────────────────────────────────── */

// ─── CSV ──────────────────────────────────────────────────────────────────────

function escapeCsv(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function downloadCsv(rows: unknown[][], filename: string) {
  const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

// ─── Excel (SheetJS) ─────────────────────────────────────────────────────────

export async function downloadXlsx(
  sheets: { name: string; rows: unknown[][] }[],
  filename: string
) {
  const XLSX = (await import('xlsx')).default
  const wb   = XLSX.utils.book_new()
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  XLSX.writeFile(wb, filename)
}

// ─── PDF (jsPDF + autoTable) ─────────────────────────────────────────────────

export interface PdfSection {
  title:   string
  head:    string[]
  rows:    unknown[][]
  summary?: { label: string; value: string }[]
}

const GOLD  = [184, 146,  42] as [number, number, number]
const WHITE = [255, 255, 255] as [number, number, number]
const DARK  = [ 30,  30,  30] as [number, number, number]
const LIGHT = [249, 249, 249] as [number, number, number]

export async function downloadPdf(
  pageTitle: string,
  subtitle:  string,
  sections:  PdfSection[],
  filename:  string
) {
  const { default: jsPDF }    = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W   = doc.internal.pageSize.getWidth()

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...GOLD)
  doc.rect(0, 0, W, 18, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...WHITE)
  doc.text('Primera Auto Studio', 12, 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(pageTitle, W / 2, 11, { align: 'center' })
  doc.text(subtitle, W - 12, 11, { align: 'right' })

  let y = 24

  for (const section of sections) {
    // Section title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...DARK)
    doc.text(section.title, 12, y)
    y += 5

    autoTable(doc, {
      startY: y,
      head:   [section.head],
      body:   section.rows.map((r) => r.map((c) => (c == null ? '' : String(c)))),
      styles: {
        fontSize: 8, cellPadding: 2,
        textColor: DARK, lineColor: [220, 220, 220], lineWidth: 0.2,
      },
      headStyles: {
        fillColor: GOLD, textColor: WHITE,
        fontStyle: 'bold', fontSize: 8,
      },
      alternateRowStyles: { fillColor: LIGHT },
      margin: { left: 12, right: 12 },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 4

    // Summary rows
    if (section.summary?.length) {
      for (const { label, value } of section.summary) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...DARK)
        doc.text(label, W - 80, y)
        doc.text(value, W - 12, y, { align: 'right' })
        y += 5
      }
      y += 3
    }

    y += 6
  }

  // Footer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text(
    `Exported ${new Date().toLocaleString('en-PH')}`,
    12,
    doc.internal.pageSize.getHeight() - 6
  )

  doc.save(filename)
}

// ─── Shared trigger ───────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
