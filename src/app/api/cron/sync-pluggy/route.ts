import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { syncPluggyItem } from '@/modules/bancos/sync'

export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createServiceClient()
  const { data: items, error } = await admin
    .from('pluggy_items')
    .select('pluggy_item_id')
    .eq('status', 'updated')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []
  for (const item of items ?? []) {
    const result = await syncPluggyItem(item.pluggy_item_id)
    results.push(result)
  }

  return NextResponse.json({ items: results })
}
