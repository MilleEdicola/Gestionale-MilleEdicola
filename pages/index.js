import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from 'recharts'

// ── Palette ───────────────────────────────────────────────────────
const C = {
  bg: '#0f0f0f', surface: '#1a1a1a', card: '#222', border: '#2e2e2e',
  accent: '#e8c547', green: '#4caf82', red: '#e05c5c', blue: '#5b9cf6',
  purple: '#a78bfa', orange: '#fb923c', text: '#f0ede6', muted: '#888', faint: '#444',
}
const PIE_COLORS = [C.accent, C.blue, C.purple, C.orange, C.green, C.red]

// ── Helpers ───────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const fmt = n => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0)
const fmtDate = iso => { if (!iso) return '—'; return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) }
const today = () => new Date().toISOString().slice(0, 10)
const monthKey = iso => { if (!iso) return '—'; const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const monthLabel = key => { if (!key || key === '—') return '—'; const [y, m] = key.split('-'); return new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }) }
const weekKey = iso => { const d = new Date(iso); const jan1 = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-W${String(Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)).padStart(2, '0')}` }

// ── UI Primitives ─────────────────────────────────────────────────
const Badge = ({ children, color = C.accent }) => (
  <span style={{ background: color + '22', color, border: `1px solid ${color}44`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</span>
)
const Card = ({ children, style }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, ...style }}>{children}</div>
)
const StatBox = ({ label, value, sub, color = C.text }) => (
  <Card style={{ flex: 1, minWidth: 120 }}>
    <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
    <div style={{ color, fontSize: 20, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{sub}</div>}
  </Card>
)
const Btn = ({ children, onClick, accent, danger, sm, disabled, style, full }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: accent ? C.accent : danger ? C.red + '22' : C.surface,
    border: `1px solid ${accent ? C.accent : danger ? C.red : C.border}`,
    color: accent ? '#000' : danger ? C.red : C.muted,
    borderRadius: 8, padding: sm ? '5px 10px' : '8px 16px',
    cursor: disabled ? 'default' : 'pointer', fontWeight: accent ? 800 : 600,
    fontSize: sm ? 12 : 13, opacity: disabled ? 0.5 : 1,
    width: full ? '100%' : undefined, textAlign: full ? 'center' : undefined, ...style
  }}>{children}</button>
)
const SecTitle = ({ children }) => (
  <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>{children}</div>
)
const Spinner = () => (
  <div style={{ width: 20, height: 20, border: `2px solid ${C.faint}`, borderTop: `2px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
)

function useSort(col0, dir0 = 'desc') {
  const [sort, setSort] = useState({ col: col0, dir: dir0 })
  const onSort = col => setSort(s => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))
  const sortFn = (a, b) => {
    const av = a[sort.col], bv = b[sort.col]
    const cmp = typeof av === 'number' ? (av ?? 0) - (bv ?? 0) : String(av ?? '').localeCompare(String(bv ?? ''))
    return sort.dir === 'asc' ? cmp : -cmp
  }
  return { sort, onSort, sortFn }
}
const SortTh = ({ label, col, sort, onSort, align = 'left' }) => {
  const active = sort.col === col
  return (
    <th onClick={() => onSort(col)} style={{ textAlign: align, padding: '8px 12px', color: active ? C.accent : C.muted, fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} {active ? (sort.dir === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  )
}

// ── PDF → base64 ──────────────────────────────────────────────────
function pdfToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('Lettura fallita'))
    r.readAsDataURL(file)
  })
}

// ════════════════════════════════════════════════════════════════
// BOLLA DI RESA STAMPABILE
// ════════════════════════════════════════════════════════════════
function BollaResaStampa({ bolla, onClose }) {
  const quotidiani = bolla.righe.filter(r => r.tipo_bolla === 'quotidiani' && r.copie_da_rendere > 0)
  const periodici = bolla.righe.filter(r => r.tipo_bolla === 'periodici' && r.copie_da_rendere > 0)
  const totQCopie = quotidiani.reduce((s, r) => s + r.copie_da_rendere, 0)
  const totQVal = quotidiani.reduce((s, r) => s + (r.copie_da_rendere * (r.prezzo_copertina || 0)), 0)
  const totPCopie = periodici.reduce((s, r) => s + r.copie_da_rendere, 0)
  const totPVal = periodici.reduce((s, r) => s + (r.copie_da_rendere * (r.prezzo_copertina || 0)), 0)

  const tS = { width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }
  const thS = { textAlign: 'left', padding: '6px 8px', background: '#f0f0f0', borderBottom: '2px solid #333', fontWeight: 700, fontSize: 11 }
  const tdS = { padding: '5px 8px', borderBottom: '1px solid #ddd', fontSize: 12 }
  const tdR = { ...tdS, textAlign: 'right' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 20 }}>
      <div style={{ background: '#fff', color: '#111', borderRadius: 10, maxWidth: 820, width: '100%', padding: 32 }} id="bolla-print">
        <div className="no-print" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 20 }}>
          <Btn onClick={onClose}>✕ Chiudi</Btn>
          <Btn accent onClick={() => window.print()}>🖨 Stampa</Btn>
        </div>

        {/* Intestazione */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, borderBottom: '2px solid #222', paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', color: '#111' }}>MILLE EDICOLA</div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>Via Porta Romana — Milano</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>BOLLA DI RESA</div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Data: <strong>{fmtDate(bolla.data)}</strong></div>
            {bolla.distributore && <div style={{ fontSize: 12, color: '#777' }}>Distributore: {bolla.distributore}</div>}
          </div>
        </div>

        {/* Quotidiani */}
        {quotidiani.length > 0 && <>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, background: '#f5f5f5', padding: '6px 10px', borderLeft: '4px solid #333' }}>QUOTIDIANI E GIORNALI</div>
          <table style={tS}>
            <thead><tr>
              <th style={thS}>Testata</th>
              <th style={{ ...thS, textAlign: 'center' }}>Barcode EAN</th>
              <th style={{ ...thS, textAlign: 'right' }}>Consegnate</th>
              <th style={{ ...thS, textAlign: 'right' }}>Vendute</th>
              <th style={{ ...thS, textAlign: 'right' }}>Da rendere</th>
              <th style={{ ...thS, textAlign: 'right' }}>€ Copertina</th>
              <th style={{ ...thS, textAlign: 'right' }}>€ Valore resa</th>
            </tr></thead>
            <tbody>
              {quotidiani.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...tdS, fontWeight: 600 }}>{r.testata}</td>
                  <td style={{ ...tdS, textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>{r.barcode || '—'}</td>
                  <td style={tdR}>{r.copie_consegnate}</td>
                  <td style={tdR}>{r.copie_vendute}</td>
                  <td style={{ ...tdR, fontWeight: 800, color: '#c00' }}>{r.copie_da_rendere}</td>
                  <td style={tdR}>{r.prezzo_copertina ? `€ ${fmt(r.prezzo_copertina)}` : '—'}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{r.prezzo_copertina ? `€ ${fmt(r.copie_da_rendere * r.prezzo_copertina)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #333', background: '#f0f0f0' }}>
                <td style={{ ...tdS, fontWeight: 800 }} colSpan={4}>TOTALE QUOTIDIANI</td>
                <td style={{ ...tdR, fontWeight: 800, color: '#c00' }}>{totQCopie}</td>
                <td style={tdR}></td>
                <td style={{ ...tdR, fontWeight: 800 }}>€ {fmt(totQVal)}</td>
              </tr>
            </tfoot>
          </table>
        </>}

        {/* Periodici */}
        {periodici.length > 0 && <>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, background: '#f5f5f5', padding: '6px 10px', borderLeft: '4px solid #888', marginTop: 16 }}>PERIODICI E RIVISTE</div>
          <table style={tS}>
            <thead><tr>
              <th style={thS}>Testata</th>
              <th style={{ ...thS, textAlign: 'center' }}>Barcode EAN</th>
              <th style={{ ...thS, textAlign: 'center' }}>Periodicità</th>
              <th style={{ ...thS, textAlign: 'right' }}>Consegnate</th>
              <th style={{ ...thS, textAlign: 'right' }}>Vendute</th>
              <th style={{ ...thS, textAlign: 'right' }}>Da rendere</th>
              <th style={{ ...thS, textAlign: 'right' }}>€ Copertina</th>
              <th style={{ ...thS, textAlign: 'right' }}>€ Valore resa</th>
            </tr></thead>
            <tbody>
              {periodici.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...tdS, fontWeight: 600 }}>{r.testata}</td>
                  <td style={{ ...tdS, textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>{r.barcode || '—'}</td>
                  <td style={{ ...tdS, textAlign: 'center' }}>{r.categoria || '—'}</td>
                  <td style={tdR}>{r.copie_consegnate}</td>
                  <td style={tdR}>{r.copie_vendute}</td>
                  <td style={{ ...tdR, fontWeight: 800, color: '#c00' }}>{r.copie_da_rendere}</td>
                  <td style={tdR}>{r.prezzo_copertina ? `€ ${fmt(r.prezzo_copertina)}` : '—'}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{r.prezzo_copertina ? `€ ${fmt(r.copie_da_rendere * r.prezzo_copertina)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #333', background: '#f0f0f0' }}>
                <td style={{ ...tdS, fontWeight: 800 }} colSpan={5}>TOTALE PERIODICI</td>
                <td style={{ ...tdR, fontWeight: 800, color: '#c00' }}>{totPCopie}</td>
                <td style={tdR}></td>
                <td style={{ ...tdR, fontWeight: 800 }}>€ {fmt(totPVal)}</td>
              </tr>
            </tfoot>
          </table>
        </>}

        {/* Riepilogo */}
        <div style={{ borderTop: '2px solid #111', marginTop: 20, paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 13, color: '#555' }}>Totale copie da rendere: <strong style={{ fontSize: 18, color: '#c00' }}>{totQCopie + totPCopie}</strong></div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Valore totale resa: <strong style={{ fontSize: 18 }}>€ {fmt(totQVal + totPVal)}</strong></div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#777', marginBottom: 40 }}>Firma edicola</div>
            <div style={{ borderTop: '1px solid #333', paddingTop: 4, width: 180, fontSize: 11, color: '#777' }}>Mille Edicola</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#777', marginBottom: 40 }}>Firma distributore</div>
            <div style={{ borderTop: '1px solid #333', paddingTop: 4, width: 180, fontSize: 11, color: '#777' }}>&nbsp;</div>
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 10, color: '#aaa', textAlign: 'center' }}>
          Documento generato il {new Date().toLocaleDateString('it-IT')} — Mille Edicola, Milano
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// FLUSSO GIORNALIERO
// ════════════════════════════════════════════════════════════════
function FlussoDiario() {
  const [dataLavoro, setDataLavoro] = useState(today())
  const [fase, setFase] = useState('consegna')
  const [loading, setLoading] = useState(false)
  const [bollaPreview, setBollaPreview] = useState(null)
  const [bollaResa, setBollaResa] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [modoVendita, setModoVendita] = useState('barcode')
  const [manuale, setManuale] = useState({ testata: '', categoria: 'quotidiano', prezzo: '', quantita: 1 })
  const [gmailLoading, setGmailLoading] = useState(false)
  const [mittente, setMittente] = useState('')

  // Dati dal DB
  const [bolleDelGiorno, setBolleDelGiorno] = useState([])
  const [venditeDelGiorno, setVenditeDelGiorno] = useState([])
  const [archivioTestate, setArchivioTestate] = useState([])

  const inputRef = useRef()
  const barcodeRef = useRef()

  const flash = (msg, ok = true) => { setFeedback({ msg, ok }); setTimeout(() => setFeedback(null), 3000) }

  // Carica dati del giorno dal DB
  const caricaDatiGiorno = useCallback(async () => {
    const [{ data: bolle }, { data: vendite }, { data: testate }] = await Promise.all([
      supabase.from('bolle_consegna').select('*, bolle_righe(*)').eq('data_consegna', dataLavoro),
      supabase.from('vendite').select('*').eq('data', dataLavoro).order('created_at', { ascending: false }),
      supabase.from('testate').select('*'),
    ])
    setBolleDelGiorno(bolle || [])
    setVenditeDelGiorno(vendite || [])
    setArchivioTestate(testate || [])
  }, [dataLavoro])

  useEffect(() => { caricaDatiGiorno() }, [caricaDatiGiorno])
  useEffect(() => { if (fase === 'vendite') setTimeout(() => barcodeRef.current?.focus(), 100) }, [fase, modoVendita])

  // Righe consegnate oggi (da tutte le bolle)
  const righeConsegnate = useMemo(() =>
    bolleDelGiorno.flatMap(b => (b.bolle_righe || []).map(r => ({ ...r, tipo_bolla: b.tipo_bolla }))),
    [bolleDelGiorno])

  const incassoOggi = venditeDelGiorno.reduce((s, v) => s + (v.incasso || 0), 0)
  const copieVendute = venditeDelGiorno.reduce((s, v) => s + (v.quantita || 0), 0)
  const copieConsegnate = righeConsegnate.reduce((s, r) => s + (r.copie_consegnate || 0), 0)

  // ── Carica PDF ──
  const handleFile = async (file) => {
    if (!file?.type?.includes('pdf')) { flash('Solo file PDF', false); return }
    setLoading(true)
    try {
      const base64 = await pdfToBase64(file)
      const res = await fetch('/api/analizza-bolla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, filename: file.name })
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setBollaPreview({ ...result, filename: file.name, data_consegna: result.data_consegna || dataLavoro })
    } catch (e) { flash('Errore analisi: ' + e.message, false) }
    setLoading(false)
  }

  // ── Importa da Gmail ──
  const importaGmail = async () => {
    setGmailLoading(true)
    try {
      const res = await fetch('/api/gmail-bolle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mittente })
      })
      const { allegati, message, error } = await res.json()
      if (error) throw new Error(error)
      if (!allegati?.length) { flash(message || 'Nessuna mail trovata', false); return }
      // Analizza il primo PDF trovato
      const primo = allegati[0]
      const res2 = await fetch('/api/analizza-bolla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: primo.base64, filename: primo.filename })
      })
      const result = await res2.json()
      if (result.error) throw new Error(result.error)
      setBollaPreview({ ...result, filename: primo.filename, data_consegna: result.data_consegna || dataLavoro })
      flash(`✓ Trovata mail: ${primo.subject}`)
    } catch (e) { flash('Errore Gmail: ' + e.message, false) }
    setGmailLoading(false)
  }

  // ── Conferma bolla ──
  const confermaBolla = async () => {
    if (!bollaPreview) return
    setLoading(true)
    try {
      const bollaId = uid()
      const { error: e1 } = await supabase.from('bolle_consegna').insert({
        id: bollaId, filename: bollaPreview.filename,
        data_consegna: bollaPreview.data_consegna || dataLavoro,
        distributore: bollaPreview.distributore, tipo_bolla: bollaPreview.tipo_bolla,
      })
      if (e1) throw e1

      const righe = (bollaPreview.righe || []).map(r => ({
        id: uid(), bolla_id: bollaId, testata: r.testata, barcode: r.barcode,
        categoria: r.categoria, tipo_bolla: bollaPreview.tipo_bolla,
        copie_consegnate: r.copie_consegnate, prezzo_copertina: r.prezzo_copertina,
      }))
      const { error: e2 } = await supabase.from('bolle_righe').insert(righe)
      if (e2) throw e2

      // Aggiorna anagrafica testate
      for (const r of bollaPreview.righe) {
        await supabase.from('testate').upsert({
          testata: r.testata, barcode: r.barcode, categoria: r.categoria,
          tipo_bolla: bollaPreview.tipo_bolla, prezzo_copertina: r.prezzo_copertina,
          updated_at: new Date().toISOString()
        }, { onConflict: 'testata' })
      }

      setBollaPreview(null)
      flash(`✓ Bolla importata: ${righe.length} testate`)
      await caricaDatiGiorno()
      setFase('vendite')
    } catch (e) { flash('Errore salvataggio: ' + e.message, false) }
    setLoading(false)
  }

  // ── Registra vendita ──
  const registraVendita = async (testata, categoria, prezzo, quantita, bc) => {
    if (!testata || quantita < 1) { flash('Dati incompleti', false); return }
    const v = {
      id: uid(), data: dataLavoro, testata, barcode: bc || null,
      categoria: categoria || 'quotidiano', prezzo: parseFloat(prezzo) || 0,
      quantita: parseInt(quantita), incasso: (parseFloat(prezzo) || 0) * parseInt(quantita),
    }
    const { error } = await supabase.from('vendite').insert(v)
    if (error) { flash('Errore: ' + error.message, false); return }
    setVenditeDelGiorno(prev => [v, ...prev])
    flash(`✓ ${quantita}x ${testata}`)
  }

  const handleBarcode = async (e) => {
    if (e.key !== 'Enter') return
    const bc = barcode.trim(); setBarcode('')
    if (!bc) return
    const found = righeConsegnate.find(r => r.barcode === bc) || archivioTestate.find(t => t.barcode === bc)
    if (found) {
      await registraVendita(found.testata, found.categoria, found.prezzo_copertina || found.prezzo, 1, bc)
    } else {
      flash(`Barcode ${bc} non trovato — usa inserimento manuale`, false)
      setModoVendita('manuale')
    }
  }

  const eliminaVendita = async (id) => {
    await supabase.from('vendite').delete().eq('id', id)
    setVenditeDelGiorno(prev => prev.filter(v => v.id !== id))
  }

  // ── Genera bolla di resa ──
  const generaBollaResa = () => {
    const mapVendite = {}
    venditeDelGiorno.forEach(v => { mapVendite[v.testata] = (mapVendite[v.testata] || 0) + v.quantita })

    const righeResa = righeConsegnate.map(r => ({
      testata: r.testata, barcode: r.barcode, categoria: r.categoria,
      tipo_bolla: r.tipo_bolla, copie_consegnate: r.copie_consegnate,
      copie_vendute: mapVendite[r.testata] || 0,
      copie_da_rendere: Math.max(0, r.copie_consegnate - (mapVendite[r.testata] || 0)),
      prezzo_copertina: r.prezzo_copertina,
    }))

    setBollaResa({ data: dataLavoro, distributore: bolleDelGiorno[0]?.distributore || '', righe: righeResa })
  }

  const fasi = [
    { id: 'consegna', icon: '📦', label: '1. Bolla consegna' },
    { id: 'vendite', icon: '🛒', label: '2. Vendite' },
    { id: 'resa', icon: '♻', label: '3. Bolla resa' },
  ]

  return (
    <div>
      {bollaResa && <BollaResaStampa bolla={bollaResa} onClose={() => setBollaResa(null)} />}

      {/* Header giorno + fasi */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Data di lavoro</div>
          <input type="date" value={dataLavoro} onChange={e => setDataLavoro(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.accent}55`, borderRadius: 8, padding: '8px 14px', color: C.text, fontSize: 14, fontWeight: 700 }} />
        </div>
        <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {fasi.map((f, i) => (
            <button key={f.id} onClick={() => setFase(f.id)} style={{
              background: fase === f.id ? C.accent + '22' : C.card,
              borderRight: i < 2 ? `1px solid ${C.border}` : 'none',
              color: fase === f.id ? C.accent : C.muted,
              border: 'none', padding: '10px 18px', cursor: 'pointer',
              fontWeight: fase === f.id ? 700 : 400, fontSize: 13,
            }}>{f.icon} {f.label}</button>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatBox label="Consegnate" value={copieConsegnate} color={C.blue} sub={`${bolleDelGiorno.length} bolla/e`} />
        <StatBox label="Vendute" value={copieVendute} color={C.green} />
        <StatBox label="Da rendere" value={Math.max(0, copieConsegnate - copieVendute)} color={C.red} />
        <StatBox label="Incasso" value={`€ ${fmt(incassoOggi)}`} color={C.accent} />
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{ background: feedback.ok ? C.green + '22' : C.red + '22', border: `1px solid ${feedback.ok ? C.green : C.red}55`, color: feedback.ok ? C.green : C.red, borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontWeight: 700 }}>
          {feedback.msg}
        </div>
      )}

      {/* ── FASE 1: Consegna ── */}
      {fase === 'consegna' && (
        <div>
          {/* Import Gmail */}
          <Card style={{ marginBottom: 16 }}>
            <SecTitle>📬 Importa da Gmail (automatico)</SecTitle>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Email del distributore</div>
                <input value={mittente} onChange={e => setMittente(e.target.value)}
                  placeholder="bolle@distributore.it"
                  style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13 }} />
              </div>
              <Btn accent onClick={importaGmail} disabled={gmailLoading || !mittente}>
                {gmailLoading ? <Spinner /> : '📬 Scarica dalla mail'}
              </Btn>
            </div>
            <div style={{ color: C.faint, fontSize: 12, marginTop: 8 }}>Cerca automaticamente le ultime mail con PDF allegato dal distributore</div>
          </Card>

          {/* Upload manuale */}
          <div onClick={() => !loading && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
            style={{ border: `2px dashed ${dragging ? C.accent : C.faint}`, borderRadius: 14, padding: 36, textAlign: 'center', cursor: loading ? 'default' : 'pointer', background: dragging ? C.accent + '08' : 'transparent', marginBottom: 20 }}>
            <input ref={inputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            {loading ? (
              <div><div style={{ color: C.accent, fontWeight: 700, marginBottom: 8 }}>🔄 Analisi in corso…</div><Spinner /></div>
            ) : (
              <>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
                <div style={{ color: C.text, fontWeight: 700 }}>Oppure carica manualmente la bolla PDF</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Trascina o clicca</div>
              </>
            )}
          </div>

          {/* Preview */}
          {bollaPreview && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, color: C.text, fontSize: 15 }}>{bollaPreview.filename}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <Badge color={bollaPreview.tipo_bolla === 'quotidiani' ? C.blue : C.purple}>{bollaPreview.tipo_bolla}</Badge>
                    {bollaPreview.distributore && <span style={{ color: C.muted, fontSize: 13 }}>{bollaPreview.distributore}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={() => setBollaPreview(null)}>Annulla</Btn>
                  <Btn accent onClick={confermaBolla} disabled={loading}>✓ Importa {bollaPreview.righe?.length} testate</Btn>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Testata', 'Barcode', 'Categoria', 'Copie', '€ Copertina'].map((h, i) => (
                      <th key={h} style={{ textAlign: i > 2 ? 'right' : 'left', padding: '7px 10px', color: C.muted, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {(bollaPreview.righe || []).map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}18` }}>
                        <td style={{ padding: '7px 10px', color: C.text, fontWeight: 600 }}>{r.testata}</td>
                        <td style={{ padding: '7px 10px', color: C.muted, fontFamily: 'monospace', fontSize: 12 }}>{r.barcode || '—'}</td>
                        <td style={{ padding: '7px 10px' }}><Badge color={r.categoria === 'quotidiano' ? C.blue : r.categoria === 'settimanale' ? C.purple : C.orange}>{r.categoria}</Badge></td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: C.text }}>{r.copie_consegnate}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: C.muted }}>{r.prezzo_copertina ? `€ ${fmt(r.prezzo_copertina)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Bolle già importate */}
          {bolleDelGiorno.length > 0 && (
            <Card>
              <SecTitle>Bolle del {fmtDate(dataLavoro)}</SecTitle>
              {bolleDelGiorno.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}22` }}>
                  <div>
                    <div style={{ color: C.text, fontWeight: 600 }}>{b.filename}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <Badge color={b.tipo_bolla === 'quotidiani' ? C.blue : C.purple}>{b.tipo_bolla}</Badge>
                      <span style={{ color: C.muted, fontSize: 12 }}>{(b.bolle_righe || []).length} testate · {(b.bolle_righe || []).reduce((s, r) => s + r.copie_consegnate, 0)} copie</span>
                    </div>
                  </div>
                  <Btn sm accent onClick={() => setFase('vendite')}>→ Vendite</Btn>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ── FASE 2: Vendite ── */}
      {fase === 'vendite' && (
        <div style={{ maxWidth: 720 }}>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['barcode', 'manuale'].map(m => (
                <button key={m} onClick={() => setModoVendita(m)} style={{
                  background: modoVendita === m ? C.accent : C.surface, border: `1px solid ${modoVendita === m ? C.accent : C.border}`,
                  color: modoVendita === m ? '#000' : C.muted, borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                }}>{m === 'barcode' ? '🔫 Barcode' : '✏️ Manuale'}</button>
              ))}
            </div>

            {modoVendita === 'barcode' && (
              <div>
                <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>Scansiona il barcode — registra automaticamente dalla bolla del giorno</div>
                <input ref={barcodeRef} value={barcode} onChange={e => setBarcode(e.target.value)} onKeyDown={handleBarcode}
                  placeholder="Scansiona barcode…" autoFocus
                  style={{ width: '100%', background: C.surface, border: `2px solid ${C.accent}55`, borderRadius: 8, padding: '12px 16px', color: C.text, fontSize: 15 }} />
              </div>
            )}

            {modoVendita === 'manuale' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: 180 }}>
                    <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Testata</div>
                    <input value={manuale.testata} onChange={e => {
                      const t = e.target.value; setManuale(m => ({ ...m, testata: t }))
                      const found = archivioTestate.find(x => x.testata === t)
                      if (found) setManuale(m => ({ ...m, testata: t, categoria: found.categoria, prezzo: found.prezzo_copertina }))
                    }} list="arc-list" placeholder="es. Corriere della Sera"
                      style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13 }} />
                    <datalist id="arc-list">{archivioTestate.map(t => <option key={t.testata} value={t.testata} />)}</datalist>
                  </div>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Categoria</div>
                    <select value={manuale.categoria} onChange={e => setManuale(m => ({ ...m, categoria: e.target.value }))}
                      style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13 }}>
                      {['quotidiano', 'settimanale', 'mensile', 'altro'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: '0 0 90px' }}>
                    <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Prezzo €</div>
                    <input type="number" step="0.10" min="0" value={manuale.prezzo} onChange={e => setManuale(m => ({ ...m, prezzo: e.target.value }))}
                      style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13 }} />
                  </div>
                  <div style={{ flex: '0 0 70px' }}>
                    <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Qtà</div>
                    <input type="number" min="1" value={manuale.quantita} onChange={e => setManuale(m => ({ ...m, quantita: parseInt(e.target.value) || 1 }))}
                      style={{ width: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Btn accent onClick={() => { registraVendita(manuale.testata, manuale.categoria, manuale.prezzo, manuale.quantita); setManuale(m => ({ ...m, quantita: 1 })) }}>✓ Registra</Btn>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {venditeDelGiorno.length > 0 && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <SecTitle>{copieVendute} copie · € {fmt(incassoOggi)}</SecTitle>
                <Btn sm accent onClick={() => setFase('resa')}>→ Genera bolla di resa</Btn>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Testata', 'Cat.', 'Qtà', '€ Prezzo', '€ Totale', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: C.muted, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {venditeDelGiorno.map(v => (
                      <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}18` }}>
                        <td style={{ padding: '7px 10px', color: C.text, fontWeight: 600 }}>{v.testata}</td>
                        <td style={{ padding: '7px 10px' }}><Badge color={v.categoria === 'quotidiano' ? C.blue : C.purple}>{v.categoria}</Badge></td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: C.text }}>{v.quantita}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: C.muted }}>{fmt(v.prezzo)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: C.green, fontWeight: 700 }}>€ {fmt(v.incasso)}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <button onClick={() => eliminaVendita(v.id)} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer' }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── FASE 3: Resa ── */}
      {fase === 'resa' && (
        <div style={{ maxWidth: 720 }}>
          <Card style={{ marginBottom: 16 }}>
            <SecTitle>Riepilogo {fmtDate(dataLavoro)}</SecTitle>
            {righeConsegnate.map(r => {
              const vendute = venditeDelGiorno.filter(v => v.testata === r.testata).reduce((s, v) => s + v.quantita, 0)
              const resa = Math.max(0, r.copie_consegnate - vendute)
              return (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.border}22`, fontSize: 13 }}>
                  <span style={{ color: C.text, fontWeight: 600 }}>{r.testata}</span>
                  <span style={{ color: C.muted }}>{r.copie_consegnate} − {vendute} = <strong style={{ color: resa > 0 ? C.red : C.green }}>{resa}</strong></span>
                </div>
              )
            })}
            <div style={{ marginTop: 20 }}>
              <Btn full accent onClick={generaBollaResa}>🖨 Genera e stampa Bolla di Resa</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ANALISI & GRAFICI
// ════════════════════════════════════════════════════════════════
function Analisi() {
  const [subTab, setSubTab] = useState('giornaliero')
  const [vendite, setVendite] = useState([])
  const [bolle, setBolle] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const [{ data: v }, { data: b }] = await Promise.all([
        supabase.from('vendite').select('*').order('data', { ascending: true }),
        supabase.from('bolle_consegna').select('*, bolle_righe(*)'),
      ])
      setVendite(v || [])
      setBolle(b || [])
      setLoading(false)
    })()
  }, [])

  const giornalieri = useMemo(() => {
    const map = {}
    vendite.forEach(v => { if (!map[v.data]) map[v.data] = { data: v.data, incasso: 0, copie: 0 }; map[v.data].incasso += v.incasso; map[v.data].copie += v.quantita })
    return Object.values(map).slice(-30).map(d => ({ ...d, label: new Date(d.data).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }), incasso: parseFloat(d.incasso.toFixed(2)) }))
  }, [vendite])

  const settimanali = useMemo(() => {
    const map = {}
    vendite.forEach(v => { const wk = weekKey(v.data); if (!map[wk]) map[wk] = { key: wk, incasso: 0, copie: 0 }; map[wk].incasso += v.incasso; map[wk].copie += v.quantita })
    const sorted = Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
    const prev = sorted[sorted.length - 2], curr = sorted[sorted.length - 1]
    const delta = prev && curr ? ((curr.incasso - prev.incasso) / (prev.incasso || 1) * 100).toFixed(1) : null
    return { data: sorted.slice(-12).map(w => ({ ...w, label: w.key, incasso: parseFloat(w.incasso.toFixed(2)) })), delta, prev, curr }
  }, [vendite])

  const mensili = useMemo(() => {
    const map = {}
    vendite.forEach(v => {
      const mk = monthKey(v.data)
      if (!map[mk]) map[mk] = { key: mk, quotidiano: 0, settimanale: 0, mensile: 0, altro: 0, incasso: 0, copie: 0 }
      map[mk].incasso += v.incasso; map[mk].copie += v.quantita
      const cat = v.categoria || 'altro'
      if (map[mk][cat] !== undefined) map[mk][cat] += v.quantita; else map[mk].altro += v.quantita
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key)).map(m => ({ ...m, label: monthLabel(m.key), incasso: parseFloat(m.incasso.toFixed(2)) }))
  }, [vendite])

  const perTestata = useMemo(() => {
    const map = {}
    vendite.forEach(v => { if (!map[v.testata]) map[v.testata] = { testata: v.testata, categoria: v.categoria, copie: 0, incasso: 0 }; map[v.testata].copie += v.quantita; map[v.testata].incasso += v.incasso })
    return Object.values(map).sort((a, b) => b.incasso - a.incasso).map(t => ({ ...t, incasso: parseFloat(t.incasso.toFixed(2)) }))
  }, [vendite])

  const resaPerTestata = useMemo(() => {
    const consMap = {}, vendMap = {}
    bolle.forEach(b => (b.bolle_righe || []).forEach(r => { consMap[r.testata] = (consMap[r.testata] || 0) + r.copie_consegnate }))
    vendite.forEach(v => { vendMap[v.testata] = (vendMap[v.testata] || 0) + v.quantita })
    return Object.keys(consMap).map(t => {
      const cons = consMap[t], vend = vendMap[t] || 0, resa = Math.max(0, cons - vend)
      return { testata: t, cons, vend, resa, pct: cons > 0 ? parseFloat(((resa / cons) * 100).toFixed(1)) : 0 }
    }).sort((a, b) => b.pct - a.pct)
  }, [bolle, vendite])

  const tabs = [
    { id: 'giornaliero', label: '📆 Giornaliero' },
    { id: 'settimanale', label: '📊 Settimanale' },
    { id: 'mensile', label: '📈 Mensile' },
    { id: 'testate', label: '🗞 Testate' },
    { id: 'resa', label: '♻ Resa %' },
  ]

  if (loading) return <div style={{ textAlign: 'center', padding: 80, color: C.muted }}>Caricamento dati…</div>
  if (vendite.length === 0) return <div style={{ textAlign: 'center', padding: 80, color: C.muted }}>Nessuna vendita ancora. Inizia dal Flusso giornaliero.</div>

  const ttpStyle = { contentStyle: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text } }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{
            background: subTab === t.id ? C.accent + '22' : 'transparent',
            border: `1px solid ${subTab === t.id ? C.accent : C.border}`,
            color: subTab === t.id ? C.accent : C.muted,
            borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: subTab === t.id ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {subTab === 'giornaliero' && (
        <div>
          <Card style={{ marginBottom: 16 }}>
            <SecTitle>Incasso giornaliero — ultimi 30 giorni</SecTitle>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={giornalieri}>
                <defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.accent} stopOpacity={0.3} /><stop offset="95%" stopColor={C.accent} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={C.border} /><XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...ttpStyle} /><Area type="monotone" dataKey="incasso" name="€ Incasso" stroke={C.accent} fill="url(#gA)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <SecTitle>Copie vendute per giorno</SecTitle>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={giornalieri} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke={C.border} /><XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...ttpStyle} /><Bar dataKey="copie" name="Copie" fill={C.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {subTab === 'settimanale' && (
        <div>
          {settimanali.prev && settimanali.curr && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <Card style={{ flex: 1 }}><div style={{ color: C.muted, fontSize: 11 }}>Settimana precedente</div><div style={{ color: C.text, fontSize: 22, fontWeight: 800 }}>€ {fmt(settimanali.prev.incasso)}</div><div style={{ color: C.muted, fontSize: 12 }}>{settimanali.prev.copie} copie</div></Card>
              <Card style={{ flex: 1 }}><div style={{ color: C.muted, fontSize: 11 }}>Settimana corrente</div><div style={{ color: C.accent, fontSize: 22, fontWeight: 800 }}>€ {fmt(settimanali.curr.incasso)}</div><div style={{ color: C.muted, fontSize: 12 }}>{settimanali.curr.copie} copie</div></Card>
              {settimanali.delta && <Card style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 32, fontWeight: 900, color: parseFloat(settimanali.delta) >= 0 ? C.green : C.red }}>{parseFloat(settimanali.delta) >= 0 ? '▲' : '▼'} {Math.abs(settimanali.delta)}%</div></Card>}
            </div>
          )}
          <Card>
            <SecTitle>Incasso settimanale</SecTitle>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={settimanali.data} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke={C.border} /><XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...ttpStyle} /><Bar dataKey="incasso" name="€ Incasso" fill={C.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {subTab === 'mensile' && (
        <div>
          <Card style={{ marginBottom: 16 }}>
            <SecTitle>Incasso mensile</SecTitle>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={mensili}>
                <defs><linearGradient id="mA" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.green} stopOpacity={0.3} /><stop offset="95%" stopColor={C.green} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={C.border} /><XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...ttpStyle} /><Area type="monotone" dataKey="incasso" name="€ Incasso" stroke={C.green} fill="url(#mA)" strokeWidth={2} dot={{ fill: C.green, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <SecTitle>Copie per categoria mensile</SecTitle>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mensili} barGap={2} barCategoryGap="25%">
                <CartesianGrid vertical={false} stroke={C.border} /><XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...ttpStyle} /><Legend wrapperStyle={{ color: C.muted, fontSize: 12 }} />
                <Bar dataKey="quotidiano" name="Quotidiani" fill={C.blue} stackId="a" />
                <Bar dataKey="settimanale" name="Settimanali" fill={C.purple} stackId="a" />
                <Bar dataKey="mensile" name="Mensili" fill={C.orange} stackId="a" />
                <Bar dataKey="altro" name="Altro" fill={C.faint} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {subTab === 'testate' && (
        <div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <Card style={{ flex: 1, minWidth: 280 }}>
              <SecTitle>Top testate per incasso</SecTitle>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={perTestata.slice(0, 12)} layout="vertical" barCategoryGap="20%">
                  <CartesianGrid horizontal={false} stroke={C.border} />
                  <XAxis type="number" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="testata" tick={{ fill: C.text, fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                  <Tooltip {...ttpStyle} /><Bar dataKey="incasso" name="€ Incasso" fill={C.accent} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card style={{ flex: '0 0 240px' }}>
              <SecTitle>Mix categorie</SecTitle>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={['quotidiano', 'settimanale', 'mensile', 'altro'].map(cat => ({ name: cat, value: vendite.filter(v => v.categoria === cat).reduce((s, v) => s + v.quantita, 0) })).filter(d => d.value > 0)}
                    cx="50%" cy="50%" outerRadius={90} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: C.muted }}>
                    {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                  </Pie>
                  <Tooltip {...ttpStyle} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      )}

      {subTab === 'resa' && (
        <div>
          <Card style={{ marginBottom: 16 }}>
            <SecTitle>Tasso di resa storico per testata</SecTitle>
            <ResponsiveContainer width="100%" height={Math.max(200, resaPerTestata.filter(r => r.pct > 0).length * 30)}>
              <BarChart data={resaPerTestata.filter(r => r.pct > 0).slice(0, 15)} layout="vertical" barCategoryGap="20%">
                <CartesianGrid horizontal={false} stroke={C.border} />
                <XAxis type="number" unit="%" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <YAxis type="category" dataKey="testata" tick={{ fill: C.text, fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                <Tooltip {...ttpStyle} formatter={v => [`${v}%`, 'Resa']} />
                <Bar dataKey="pct" name="Resa %" fill={C.red} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <SecTitle>Dettaglio resa per testata</SecTitle>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Testata', 'Consegnate', 'Vendute', 'Rese', 'Resa %'].map((h, i) => (
                    <th key={h} style={{ textAlign: i > 0 ? 'right' : 'left', padding: '7px 12px', color: C.muted, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {resaPerTestata.map(r => (
                    <tr key={r.testata} style={{ borderBottom: `1px solid ${C.border}18` }}>
                      <td style={{ padding: '8px 12px', color: C.text, fontWeight: 700 }}>{r.testata}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: C.text }}>{r.cons}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: C.green }}>{r.vend}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: C.red }}>{r.resa}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: r.pct > 30 ? C.red : r.pct > 15 ? C.orange : C.green }}>{r.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// APP ROOT
// ════════════════════════════════════════════════════════════════
export default function Home() {
  const [tab, setTab] = useState('flusso')
  const [todayStats, setTodayStats] = useState({ incasso: 0, copie: 0 })

  useEffect(() => {
    supabase.from('vendite').select('incasso, quantita').eq('data', today()).then(({ data }) => {
      if (data) setTodayStats({ incasso: data.reduce((s, v) => s + v.incasso, 0), copie: data.reduce((s, v) => s + v.quantita, 0) })
    })
  }, [tab])

  const tabs = [
    { id: 'flusso', label: '📋 Flusso giornaliero' },
    { id: 'analisi', label: '📊 Analisi & Grafici' },
  ]

  return (
    <>
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '0 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 54 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: C.accent }}>MILLE EDICOLA</div>
            <div style={{ width: 1, height: 18, background: C.border }} />
            <div style={{ color: C.muted, fontSize: 12 }}>Gestionale · Milano Porta Romana</div>
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
            <span style={{ color: C.muted }}>Oggi <span style={{ color: C.accent, fontWeight: 700 }}>€ {fmt(todayStats.incasso)}</span></span>
            <span style={{ color: C.muted }}><span style={{ color: C.green, fontWeight: 700 }}>{todayStats.copie}</span> copie</span>
          </div>
        </div>
      </div>

      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '0 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 4 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'transparent', borderBottom: tab === t.id ? `2px solid ${C.accent}` : '2px solid transparent',
              border: 'none', color: tab === t.id ? C.accent : C.muted,
              padding: '13px 18px', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px 60px' }}>
        {tab === 'flusso' && <FlussoDiario />}
        {tab === 'analisi' && <Analisi />}
      </div>
    </>
  )
}
