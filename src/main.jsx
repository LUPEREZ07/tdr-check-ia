import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AlertTriangle, ArrowUpRight, CalendarClock, Check, ChevronDown, ChevronRight,
  Clock3, FileText, GitCompareArrows, History, Info, Layers3, LoaderCircle,
  MessageCircleQuestion, Paperclip, Plus, ScanSearch, Search, ShieldCheck,
  Sparkles, Target, Trash2, Upload, Users, X,
} from 'lucide-react'
import { analyzeLocally } from './lib/clientFallback.js'
import { authHeaders, supabase } from './lib/supabase.js'
import './styles.css'

const SAMPLE_TDR = '1. OBJETO\nContratar el servicio de acompañamiento técnico para implementar un sistema de gestión documental en la entidad.\n\n2. FINALIDAD PÚBLICA\nMejorar la trazabilidad y los tiempos de atención de los expedientes institucionales.\n\n3. ACTIVIDADES Y ENTREGABLES\n- Configurar la plataforma y capacitar al equipo usuario.\n- Organizar un taller presencial de natación para 30 participantes.\n- Entregar 4 informes parciales y un informe final.\n\n4. PLAZO DE EJECUCIÓN\nEl servicio tendrá una duración de 30 días calendario. El informe final se entregará en un plazo máximo de 20 días calendario.\n\n5. EQUIPO MÍNIMO\nSe requiere la participación de 2 especialistas durante la ejecución. En el numeral 6 se indica que el equipo estará conformado por 3 especialistas.\n\n6. REQUISITOS DEL POSTOR\nAcreditar experiencia similar de al menos 3 años. La experiencia similar deberá acreditarse con contratos equivalentes, sin definir qué se entiende por similar.\nLa atención será presencial. En las actividades se señala que la atención podrá ser remota.\n\n7. COORDINACIÓN\nEl contratista deberá presentar los avances periódicamente y atender oportunamente las observaciones de la entidad.'
const MAX_TDR_CHARACTERS = 240000

const TYPE_META = {
  cantidad: { label: 'Cantidad', icon: Users, className: 'type-quantity' },
  plazo: { label: 'Plazo o fecha', icon: CalendarClock, className: 'type-deadline' },
  requisito: { label: 'Requisito', icon: GitCompareArrows, className: 'type-requirement' },
  ambiguedad: { label: 'Ambigüedad', icon: MessageCircleQuestion, className: 'type-ambiguity' },
  incongruencia: { label: 'Objeto y actividades', icon: Target, className: 'type-incongruence' },
}

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'cantidad', label: 'Cantidades' },
  { id: 'plazo', label: 'Plazos' },
  { id: 'requisito', label: 'Requisitos' },
  { id: 'ambiguedad', label: 'Ambigüedades' },
  { id: 'incongruencia', label: 'Incongruencias' },
]

function formatDate(value) {
  if (!value) return 'Ahora'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Ahora'
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatDateTime(value) {
  if (!value) return 'Sin conexión registrada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin conexión registrada'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-PE').format(Number(value || 0))
}

function StatCard({ icon: Icon, label, value, tone }) {
  return <div className={'stat-card ' + tone}>
    <div className="stat-icon"><Icon size={17} strokeWidth={1.8} /></div>
    <div><span className="stat-label">{label}</span><strong>{formatNumber(value)}</strong></div>
  </div>
}

function FindingCard({ finding, index }) {
  const meta = TYPE_META[finding.type] || TYPE_META.ambiguedad
  const Icon = meta.icon
  return <article className="finding-card" style={{ '--delay': (index * 55) + 'ms' }}>
    <div className="finding-topline">
      <span className={'finding-type ' + meta.className}><Icon size={14} /> {meta.label}</span>
      <span className="finding-number">#{String(index + 1).padStart(2, '0')}</span>
    </div>
    <div className="finding-body">
      <div className="finding-section"><span>ENCONTRADO EN</span><strong>{finding.section}</strong></div>
      <blockquote>“{finding.fragment}”</blockquote>
      <div className="finding-copy">
        <div><span className="copy-label">Qué revisar</span><p>{finding.description}</p></div>
        <div className="recommendation"><span className="copy-label">Sugerencia</span><p>{finding.recommendation}</p></div>
      </div>
    </div>
  </article>
}

function EmptyResults({ onSample }) {
  return <div className="empty-results">
    <div className="empty-orbit"><ScanSearch size={30} strokeWidth={1.6} /></div>
    <span className="eyebrow">Listo para revisar</span>
    <h3>Tu reporte aparecerá aquí</h3>
    <p>Cuando analices un TDR, verás cada punto de revisión con su evidencia y una recomendación concreta.</p>
    <button className="text-button" onClick={onSample}>Cargar un ejemplo <ArrowUpRight size={15} /></button>
  </div>
}

function HistoryItem({ item, active, onClick, onDelete }) {
  const total = item.summary?.total ?? item.findings?.length ?? 0
  return <div className={'history-item ' + (active ? 'active' : '')}>
    <button className="history-open" onClick={onClick}>
      <span className="history-file"><FileText size={16} /></span>
      <span className="history-meta"><strong>{item.title || 'TDR sin título'}</strong><small>{formatDate(item.createdAt)} · {total} {total === 1 ? 'hallazgo' : 'hallazgos'}</small></span>
      <ChevronRight size={15} className="history-arrow" />
    </button>
    <button className="history-delete" onClick={(event) => { event.stopPropagation(); onDelete(item) }} aria-label={'Borrar revisión ' + (item.title || 'sin título')} title="Borrar revisión"><Trash2 size={15} /></button>
  </div>
}

function RegisteredUserItem({ user }) {
  const initial = (user.email || '?').slice(0, 1).toUpperCase()
  return <article className="user-card">
    <span className="user-avatar">{initial}</span>
    <div className="user-meta"><strong>{user.email}</strong><small>Última conexión: {formatDateTime(user.lastSignInAt)}</small></div>
  </article>
}

function getRedirectUrl() {
  return import.meta.env.VITE_SITE_URL || window.location.origin
}

function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase) {
      setError('Faltan las variables públicas de Supabase en el frontend.')
      setLoading(false)
      return undefined
    }
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
        setLoading(false)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const handleAuth = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    setBusy(true)
    try {
      const response = isSignup
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: getRedirectUrl() } })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (response.error) throw response.error
      if (isSignup && !response.data.session) {
        setNotice('Cuenta creada. Si el proyecto solicita confirmación, revisa tu correo antes de ingresar.')
      } else {
        setNotice('Sesión iniciada correctamente.')
      }
    } catch (authError) {
      setError(authError.message || 'No pudimos completar la autenticación.')
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => supabase?.auth.signOut()

  if (loading) return <div className="auth-screen"><div className="auth-card auth-loading"><LoaderCircle size={22} className="spin" /> Verificando tu sesión…</div></div>
  if (!supabase) return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><span className="brand-mark"><Sparkles size={16} fill="currentColor" /></span><strong>TDR Check <em>IA</em></strong></div><h1>Configuración pendiente</h1><p>Agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` al entorno del frontend para iniciar sesión.</p>{error && <div className="auth-error"><AlertTriangle size={16} /> {error}</div>}</div></div>
  if (session) return children(session, signOut)

  return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><span className="brand-mark"><Sparkles size={16} fill="currentColor" /></span><strong>TDR Check <em>IA</em></strong></div><span className="section-kicker">ACCESO SEGURO</span><h1>{isSignup ? 'Crea tu cuenta' : 'Ingresa a tu espacio'}</h1><p>{isSignup ? 'Guarda tus revisiones y consulta solo tus propios análisis.' : 'Tus documentos y resultados están aislados de los demás usuarios.'}</p><form className="auth-form" onSubmit={handleAuth}><label htmlFor="auth-email">Correo electrónico</label><input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu correo" required /><label htmlFor="auth-password">Contraseña</label><input id="auth-password" type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 6 caracteres" minLength="6" required />{error && <div className="auth-error"><AlertTriangle size={16} /> {error}</div>}{notice && <div className="auth-notice"><Check size={16} /> {notice}</div>}<button className="analyze-button auth-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin" /> Procesando…</> : isSignup ? 'Crear cuenta' : 'Ingresar'} <span className="button-arrow">↗</span></button></form><button className="auth-switch" onClick={() => { setIsSignup(!isSignup); setError(''); setNotice('') }}>{isSignup ? 'Ya tengo una cuenta' : 'Crear una cuenta nueva'}</button><small className="auth-disclaimer">La autenticación protege el historial; la revisión siempre requiere criterio humano.</small></div></div>
}

function App({ session, onSignOut }) {
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState('paste')
  const [dragging, setDragging] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [filter, setFilter] = useState('all')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [registeredUsers, setRegisteredUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [selectedHistoryId, setSelectedHistoryId] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileInputRef = useRef(null)

  const loadHistory = async () => {
    try {
      const response = await fetch('/api/history?limit=12', { headers: authHeaders(session), cache: 'no-store' })
      if (!response.ok) throw new Error('history')
      const data = await response.json()
      setHistory(data.items || [])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadRegisteredUsers = async () => {
    try {
      const response = await fetch('/api/users', { headers: authHeaders(session), cache: 'no-store' })
      if (!response.ok) throw new Error('users')
      const data = await response.json()
      setRegisteredUsers(data.items || [])
    } catch {
      setRegisteredUsers([])
    } finally {
      setUsersLoading(false)
    }
  }

  useEffect(() => { loadHistory(); loadRegisteredUsers() }, [session])

  const filteredFindings = useMemo(() => {
    if (!result?.findings) return []
    return filter === 'all' ? result.findings : result.findings.filter((finding) => finding.type === filter)
  }, [filter, result])

  const readFile = async (file) => {
    if (!file) return
    setError('')
    try {
      let value = ''
      const lowerName = file.name.toLowerCase()
      if (lowerName.endsWith('.docx')) {
        const mammoth = await import('mammoth/mammoth.browser')
        const parsed = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
        value = parsed.value
      } else if (lowerName.endsWith('.pdf')) {
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.mjs'),
          import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        ])
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
        if (document.numPages > 200) throw new Error('El PDF supera el límite de 200 páginas.')
        const pages = []
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber)
          const content = await page.getTextContent()
          pages.push(content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim())
        }
        value = pages.filter(Boolean).join('\n\n')
        if (!value) throw new Error('El PDF no contiene texto extraíble. Usa un PDF con texto seleccionable.')
      } else {
        value = await file.text()
      }
      if (value.length > MAX_TDR_CHARACTERS) {
        throw new Error(`El archivo contiene ${formatNumber(value.length)} caracteres y supera el límite técnico de ${formatNumber(MAX_TDR_CHARACTERS)}. Reduce el documento antes de analizarlo.`)
      }
      setText(value)
      setFileName(file.name)
      if (!title) setTitle(file.name.replace(/\.(txt|md|docx|pdf)$/i, ''))
      setMode('paste')
      setNotice('Archivo cargado. Revisa el texto antes de iniciar.')
      window.setTimeout(() => setNotice(''), 4200)
    } catch (fileError) {
      setError(fileError.message || 'No pudimos leer ese archivo. Usa .txt, .md, .docx o .pdf.')
    }
  }

  const handleAnalyze = async () => {
    setError('')
    setNotice('')
    if (text.trim().length < 30) {
      setError('Pega un TDR de al menos 30 caracteres para iniciar la revisión.')
      return
    }
    if (text.length > MAX_TDR_CHARACTERS) {
      setError(`El TDR supera el límite técnico de ${formatNumber(MAX_TDR_CHARACTERS)} caracteres. Reduce el texto antes de analizarlo.`)
      return
    }
    setIsAnalyzing(true)
    setFilter('all')
    setSelectedHistoryId(null)
    setResult(null)
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
        body: JSON.stringify({ text, title: title.trim() || 'TDR sin título' }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const apiError = new Error(payload.error || 'No pudimos completar la revisión.')
        apiError.status = response.status
        throw apiError
      }
      const data = await response.json()
      setResult(data)
      if (data.cached) setNotice('Este TDR ya fue revisado. Mostramos el mismo reporte para mantener consistencia.')
      await loadHistory()
    } catch (requestError) {
      if (requestError.status === 401) {
        setError('Tu sesión expiró. Ingresa nuevamente para continuar.')
        await supabase?.auth.signOut()
        return
      }
      if (requestError.status === 413) {
        setError(`El TDR es demasiado grande para enviarlo. El límite técnico es de ${formatNumber(MAX_TDR_CHARACTERS)} caracteres y no se guardó ningún resultado.`)
        return
      }
      if (requestError.status >= 400) {
        setError(requestError.message || 'No pudimos guardar la revisión en el historial.')
        return
      }
      const local = analyzeLocally(text)
      setResult({ ...local, id: 'local-' + Date.now(), createdAt: new Date().toISOString(), synced: false })
      setNotice('Revisión local completada, pero no se pudo sincronizar con el historial. Vuelve a intentarlo cuando la conexión esté disponible.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const loadHistoryItem = async (item) => {
    setError('')
    setSelectedHistoryId(item.id)
    try {
      const response = await fetch('/api/history/' + item.id, { headers: authHeaders(session), cache: 'no-store' })
      if (!response.ok) throw new Error('item')
      const detail = await response.json()
      setResult(detail)
      setText(detail.text || '')
      setTitle(detail.title || '')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setError('No pudimos abrir este análisis.')
    }
  }

  const handleDeleteHistory = async (item) => {
    if (!window.confirm(`¿Borrar la revisión «${item.title || 'TDR sin título'}»?`)) return
    setError('')
    try {
      const response = await fetch('/api/history/' + encodeURIComponent(item.id), { method: 'DELETE', headers: authHeaders(session), cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'No pudimos borrar esta revisión.')
      }
      setHistory((items) => items.filter((historyItem) => historyItem.id !== item.id))
      if (selectedHistoryId === item.id) reset()
      setNotice('Revisión eliminada del historial.')
    } catch (deleteError) {
      setError(deleteError.message || 'No pudimos borrar esta revisión.')
    }
  }

  const loadSample = () => {
    setText(SAMPLE_TDR)
    setTitle('TDR implementación documental')
    setFileName('')
    setResult(null)
    setError('')
    setNotice('Ejemplo cargado. Presiona “Analizar TDR” para ver el reporte.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const reset = () => {
    setText('')
    setTitle('')
    setFileName('')
    setResult(null)
    setError('')
    setNotice('')
    setSelectedHistoryId(null)
    setFilter('all')
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    readFile(event.dataTransfer.files?.[0])
  }

  return <div className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <a className="brand" href="#inicio" aria-label="TDR Check IA, inicio"><span className="brand-mark"><Sparkles size={16} fill="currentColor" /></span><span><strong>TDR Check</strong><em>IA</em></span></a>
      <nav className="main-nav" aria-label="Navegación principal"><a className="nav-link active" href="#analizar">Analizar</a><a className="nav-link" href="#historial">Historial <span className="nav-count">{history.length || '—'}</span></a><a className="nav-link" href="#usuarios">Usuarios <span className="nav-count">{registeredUsers.length || '—'}</span></a></nav>
      <div className="header-note"><ShieldCheck size={16} /> Solo puntos para revisión humana <span className="user-session">{session?.user?.email}</span><button className="signout-button" onClick={onSignOut}>Salir</button></div>
    </header>

    <main id="inicio">
      <section className="hero-section">
        <div className="hero-copy"><div className="eyebrow-row"><span className="eyebrow-dot" /> CONTROL INTELIGENTE PARA ABASTECIMIENTO</div><h1>Revisa tu TDR<br /><span>con otra mirada.</span></h1><p className="hero-description">Encuentra inconsistencias, ambigüedades e incongruencias antes de que se conviertan en observaciones.</p><div className="hero-points"><span><Check size={14} /> 5 tipos de revisión</span><span><Check size={14} /> Evidencia en contexto</span></div></div>
        <div className="hero-aside"><div className="hero-aside-line"><span className="line-number">01</span><span>Carga o pega tu TDR</span></div><div className="hero-aside-line"><span className="line-number">02</span><span>Deja que la IA compare</span></div><div className="hero-aside-line"><span className="line-number">03</span><span>Revisa con criterio experto</span></div></div>
      </section>

      <section className="workspace-grid" id="analizar">
        <div className="input-panel panel">
          <div className="panel-heading"><div><span className="section-kicker">01 / DOCUMENTO</span><h2>Tu TDR</h2></div><button className="quiet-button" onClick={loadSample}>Usar ejemplo <ArrowUpRight size={14} /></button></div>
          <div className="input-tabs" role="tablist" aria-label="Origen del documento"><button className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')} role="tab"><Paperclip size={15} /> Pegar texto</button><button className={mode === 'upload' ? 'active' : ''} onClick={() => { setMode('upload'); fileInputRef.current?.click() }} role="tab"><Upload size={15} /> Cargar archivo</button></div>
          <input ref={fileInputRef} type="file" accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(event) => readFile(event.target.files?.[0])} />
          {mode === 'upload' && !text ? <button className={'drop-zone ' + (dragging ? 'dragging' : '')} onClick={() => fileInputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}><span className="upload-icon"><Upload size={21} /></span><strong>Arrastra tu archivo aquí</strong><span>o haz clic para buscar · .txt, .md, .docx, .pdf</span></button> : <div className="textarea-wrap"><textarea value={text} maxLength={MAX_TDR_CHARACTERS} onChange={(event) => setText(event.target.value)} placeholder="Pega aquí el contenido completo de tu TDR…" aria-label="Contenido del TDR" /><div className="textarea-footer"><span>{fileName ? <><FileText size={13} /> {fileName}</> : 'El contenido se procesa de forma segura'}</span><span>{formatNumber(text.length)} caracteres</span></div></div>}
          <div className="title-field"><label htmlFor="title">Nombre del análisis <span>(opcional)</span></label><input id="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Servicio de mantenimiento 2025" /></div>
          {error && <div className="inline-message error"><AlertTriangle size={16} /> {error}<button onClick={() => setError('')} aria-label="Cerrar mensaje"><X size={14} /></button></div>}
          {notice && <div className="inline-message notice"><Info size={16} /> {notice}</div>}
          <button className="analyze-button" onClick={handleAnalyze} disabled={isAnalyzing}>{isAnalyzing ? <><LoaderCircle size={17} className="spin" /> Comparando tu TDR…</> : <><Sparkles size={17} /> Analizar TDR <span className="button-arrow">↗</span></>}</button>
          <div className="privacy-note"><ShieldCheck size={14} /> La IA identifica puntos de revisión; la decisión siempre es humana.</div>
        </div>

        <div className="summary-panel panel">
          <div className="panel-heading summary-heading"><div><span className="section-kicker">02 / LECTURA RÁPIDA</span><h2>Resumen</h2></div><span className={'status-pill ' + (result ? 'ready' : '')}><span /> {result ? 'Completado' : 'Esperando TDR'}</span></div>
          {result ? <><div className="summary-total"><span>Hallazgos para revisar</span><strong>{formatNumber(result.summary?.total)}</strong><small>{result.engine === 'local-fallback' ? 'Revisión local de respaldo' : 'Revisión con Ollama Cloud'}</small></div><div className="stats-grid"><StatCard icon={AlertTriangle} label="Inconsistencias" value={result.summary?.inconsistencies} tone="amber" /><StatCard icon={MessageCircleQuestion} label="Ambigüedades" value={result.summary?.ambiguities} tone="violet" /><StatCard icon={Target} label="Incongruencias" value={result.summary?.incongruencies} tone="blue" /></div><div className="summary-foot"><span><Clock3 size={14} /> {formatDate(result.createdAt)}</span><button className="reset-link" onClick={reset}><Plus size={14} /> Nuevo análisis</button></div></> : <EmptyResults onSample={loadSample} />}
        </div>
      </section>

      <section className="results-section" id="resultados">
        <div className="results-heading"><div><span className="section-kicker">03 / REPORTE DETALLADO</span><h2>Hallazgos</h2></div>{result && <div className="results-tools"><span className="result-count">{filteredFindings.length} de {result.findings.length}</span><div className="filter-select"><ListIcon /><select aria-label="Filtrar hallazgos" value={filter} onChange={(event) => setFilter(event.target.value)}>{FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={14} /></div></div>}</div>
        {result ? (filteredFindings.length ? <div className="findings-list">{filteredFindings.map((finding, index) => <FindingCard key={finding.type + '-' + index} finding={finding} index={index} />)}</div> : <div className="no-filter-results"><Search size={19} /> No hay hallazgos de este tipo en el reporte.</div>) : <div className="report-placeholder"><Layers3 size={22} /><span>El detalle se habilitará después del análisis.</span></div>}
        {result && <div className="human-note"><ShieldCheck size={17} /><div><strong>Una lectura asistida, no una conclusión automática.</strong><span>Usa cada hallazgo como punto de partida para validar el documento con tu criterio técnico.</span></div></div>}
      </section>

      <section className="history-section" id="historial">
        <div className="history-heading"><div><span className="section-kicker">CONSULTA POSTERIOR</span><h2>Historial reciente</h2></div><span className="history-caption"><History size={15} /> Tus últimos análisis</span></div>
        {historyLoading ? <div className="history-loading"><LoaderCircle size={16} className="spin" /> Cargando historial…</div> : history.length ? <div className="history-list">{history.map((item) => <HistoryItem key={item.id} item={item} active={selectedHistoryId === item.id} onClick={() => loadHistoryItem(item)} onDelete={handleDeleteHistory} />)}</div> : <div className="history-empty"><History size={18} /><span>Aún no hay análisis guardados. Tu primer reporte aparecerá aquí.</span></div>}
      </section>

      <section className="users-section" id="usuarios">
        <div className="history-heading"><div><span className="section-kicker">EQUIPO REGISTRADO</span><h2>Usuarios de la plataforma</h2></div><span className="history-caption"><Users size={15} /> {registeredUsers.length} registrados</span></div>
        {usersLoading ? <div className="history-loading"><LoaderCircle size={16} className="spin" /> Cargando usuarios…</div> : registeredUsers.length ? <div className="users-grid">{registeredUsers.map((user) => <RegisteredUserItem key={user.id} user={user} />)}</div> : <div className="history-empty"><Users size={18} /><span>No hay usuarios registrados para mostrar.</span></div>}
      </section>
    </main>

    <footer className="footer"><span><span className="brand-mark mini"><Sparkles size={12} fill="currentColor" /></span> TDR Check IA</span><span>Diseñado para revisar mejor, decidir con criterio.</span><span className="footer-version">MVP · 2026</span></footer>
  </div>
}

function ListIcon() {
  return <span className="list-icon"><span /><span /><span /></span>
}

export default App

const rootContainer = document.getElementById('root')
const reactRoot = rootContainer.__tdrCheckRoot || createRoot(rootContainer)
rootContainer.__tdrCheckRoot = reactRoot
reactRoot.render(<AuthGate>{(session, onSignOut) => <App session={session} onSignOut={onSignOut} />}</AuthGate>)
