export const config = { api: { bodyParser: { sizeLimit: '20mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { base64, filename } = req.body
  if (!base64 || !filename) return res.status(400).json({ error: 'Dati mancanti' })

  const sys = `Sei un assistente per edicole italiane. Analizzi bolle di consegna del distributore.
ISTRUZIONE CRITICA: Rispondi SOLO con JSON grezzo valido, zero testo, zero backtick, zero markdown.

Formato OBBLIGATORIO:
{"data_consegna":"YYYY-MM-DD","distributore":"nome","tipo_bolla":"quotidiani|periodici","righe":[{"testata":"nome completo","barcode":"codice EAN o null","copie_consegnate":1,"prezzo_copertina":1.00,"categoria":"quotidiano|settimanale|mensile|altro","note":""}]}

Regole:
- tipo_bolla: "quotidiani" se contiene giornali quotidiani/settimanali di attualità; "periodici" se contiene riviste
- barcode: stringa numerica EAN se presente, altrimenti null
- copie_consegnate: numero intero
- prezzo_copertina: prezzo in euro come numero decimale
- Estrai TUTTE le righe presenti`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: sys,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: `Analizza questa bolla di consegna: ${filename}` }
          ]
        }]
      })
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: data.error.message })

    const raw = data.content?.map(b => b.text || '').join('') || ''
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return res.status(500).json({ error: 'Nessun JSON nella risposta' })

    let clean = m[0].replace(/```json|```/g, '').trim()
    try {
      const result = JSON.parse(clean)
      return res.status(200).json(result)
    } catch {
      clean = clean.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
      return res.status(200).json(JSON.parse(clean))
    }
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
