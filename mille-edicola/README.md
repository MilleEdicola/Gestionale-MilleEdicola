# Mille Edicola — Gestionale

## Struttura
```
mille-edicola/
├── pages/
│   ├── index.js          ← App principale
│   ├── _app.js
│   └── api/
│       ├── analizza-bolla.js   ← AI analisi PDF
│       └── gmail-bolle.js      ← Import automatico Gmail
├── lib/
│   └── supabase.js
├── styles/
│   └── globals.css
├── .env.local            ← Variabili d'ambiente (NON pubblicare)
└── package.json
```

## Deploy su Vercel (passo per passo)

### 1. Carica il codice su GitHub
1. Vai su github.com → New repository → nome: `mille-edicola` → Create
2. Scarica e installa GitHub Desktop da desktop.github.com
3. File → Add Local Repository → seleziona la cartella mille-edicola
4. Commit → "Prima versione" → Push

### 2. Collega a Vercel
1. Vai su vercel.com → Add New Project
2. Import da GitHub → seleziona mille-edicola
3. **IMPORTANTE**: prima di fare Deploy, vai su "Environment Variables" e aggiungi:
   - `NEXT_PUBLIC_SUPABASE_URL` = https://rdbwqhnzkpqlqayfleqa.supabase.co
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = eyJhbGci... (la tua chiave)
   - `ANTHROPIC_API_KEY` = sk-ant-... (la tua chiave Anthropic)
4. Clicca Deploy → aspetta 2 minuti
5. Vercel ti dà un URL tipo: mille-edicola.vercel.app

### 3. Setup Gmail (per import automatico bolle)
Questo passaggio si fa dopo — ti guido separatamente.

## Variabili d'ambiente necessarie

| Variabile | Dove trovarla |
|-----------|---------------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase → Settings → API |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase → Settings → API |
| ANTHROPIC_API_KEY | console.anthropic.com → API Keys |
| GMAIL_CLIENT_ID | Google Cloud Console (setup separato) |
| GMAIL_CLIENT_SECRET | Google Cloud Console |
| GMAIL_REFRESH_TOKEN | Generato dopo OAuth |
| GMAIL_USER | La tua email Gmail |
| DISTRIBUTORE_EMAIL | Email del distributore |
