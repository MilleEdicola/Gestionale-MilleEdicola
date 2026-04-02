import { google } from 'googleapis'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { mittente } = req.body

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    )
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Cerca mail degli ultimi 2 giorni con PDF allegato dal distributore
    const query = `from:${mittente || process.env.DISTRIBUTORE_EMAIL} has:attachment filename:pdf newer_than:2d`
    const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 10 })

    const messages = listRes.data.messages || []
    if (messages.length === 0) return res.status(200).json({ allegati: [], message: 'Nessuna mail trovata' })

    const allegati = []

    for (const msg of messages) {
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id })
      const parts = full.data.payload?.parts || []
      const subject = full.data.payload?.headers?.find(h => h.name === 'Subject')?.value || ''
      const date = full.data.payload?.headers?.find(h => h.name === 'Date')?.value || ''

      for (const part of parts) {
        if (part.filename?.endsWith('.pdf') && part.body?.attachmentId) {
          const att = await gmail.users.messages.attachments.get({
            userId: 'me', messageId: msg.id, id: part.body.attachmentId
          })
          // Gmail usa base64url, convertiamo in base64 standard
          const base64 = att.data.data.replace(/-/g, '+').replace(/_/g, '/')
          allegati.push({
            filename: part.filename,
            base64,
            subject,
            date,
            messageId: msg.id
          })
        }
      }
    }

    return res.status(200).json({ allegati })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
