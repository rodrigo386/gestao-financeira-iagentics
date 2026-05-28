import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: holerite, error } = await supabase
    .from('holerites').select('storage_path').eq('item_folha_id', id).maybeSingle()
  if (error || !holerite) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: blob, error: dlErr } = await supabase.storage
    .from('holerites').download(holerite.storage_path)
  if (dlErr || !blob) return NextResponse.json({ error: 'download failed' }, { status: 500 })

  const buf = await blob.arrayBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="holerite-${id}.pdf"`,
    },
  })
}
