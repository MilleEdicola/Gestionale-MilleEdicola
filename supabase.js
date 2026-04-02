import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const { data: dataLavoro } = req.query
  if (!dataLavoro) return res.status(400).json({ error: 'Data mancante' })

  try {
    const [{ data: bolle }, { data: vendite }, { data: testate }] = await Promise.all([
      supabase.from('bolle_consegna').select('*, bolle_righe(*)').eq('data_consegna', dataLavoro),
      supabase.from('vendite').select('*').eq('data', dataLavoro).order('created_at', { ascending: false }),
      supabase.from('testate').select('*'),
    ])
    return res.status(200).json({ bolle: bolle || [], vendite: vendite || [], testate: testate || [] })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
