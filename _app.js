import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  try {
    if (req.method === 'POST') {
      const { vendita } = req.body
      if (!vendita) return res.status(400).json({ error: 'Dati mancanti' })
      const { error } = await supabase.from('vendite').insert(vendita)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }
    if (req.method === 'DELETE') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'ID mancante' })
      const { error } = await supabase.from('vendite').delete().eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }
    return res.status(405).end()
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
