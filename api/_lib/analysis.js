const ALLOWED_TYPES = new Set([
  'cantidad',
  'plazo',
  'requisito',
  'ambiguedad',
  'incongruencia',
])

const TYPE_ALIASES = {
  cantidades: 'cantidad',
  cantidad: 'cantidad',
  'inconsistencia de cantidades': 'cantidad',
  plazos: 'plazo',
  plazo: 'plazo',
  fechas: 'plazo',
  'inconsistencia de plazos o fechas': 'plazo',
  requisito: 'requisito',
  requisitos: 'requisito',
  'requisito contradictorio': 'requisito',
  'requisitos contradictorios': 'requisito',
  ambigüedad: 'ambiguedad',
  ambiguedad: 'ambiguedad',
  'información ambigua': 'ambiguedad',
  'informacion ambigua': 'ambiguedad',
  incongruencia: 'incongruencia',
  incongruencias: 'incongruencia',
}

export const MAX_TDR_CHARACTERS = 240000
// Increment when the review protocol changes so cached reports from an older
// protocol are never presented as if they had been produced by this one.
export const ANALYSIS_VERSION = '2026-09-07-rigorous-v1'

const LIMITS = {
  maxChars: MAX_TDR_CHARACTERS,
  maxFindings: 100,
}

function cleanText(value, max = 1400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeForEvidence(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function evidenceParts(fragment) {
  return String(fragment ?? '')
    .split(/\s+(?:\/|\|)\s+/)
    .map((part) => normalizeForEvidence(part))
    .filter(Boolean)
}

function hasLiteralEvidence(fragment, originalText) {
  const source = normalizeForEvidence(originalText)
  const parts = evidenceParts(fragment)
  return parts.length > 0 && parts.every((part) => part.length >= 12 && source.includes(part))
}

function hasSupportedExplicitClaims(description, fragment) {
  const evidence = normalizeForEvidence(fragment)
  const text = String(description ?? '')
  const explicitClaims = [
    ...(text.match(/\b\d+(?:[.,]\d+)?\b/g) || []),
    ...(text.match(/\b[A-ZÁÉÍÓÚÑ]{2,}(?:[.-]\d+)*\b/g) || []),
    ...(text.match(/\b[A-ZÁÉÍÓÚÑ]\.\d+(?:\.\d+)*\b/g) || []),
  ]
  return explicitClaims.every((claim) => evidence.includes(normalizeForEvidence(claim)))
}

function normalizeType(value) {
  const normalized = cleanText(value, 100).toLowerCase()
  return ALLOWED_TYPES.has(normalized) ? normalized : TYPE_ALIASES[normalized]
}

function extractJson(text) {
  const raw = String(text ?? '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1]?.trim() || raw
  try {
    return JSON.parse(candidate)
  } catch {
    const first = candidate.indexOf('{')
    const last = candidate.lastIndexOf('}')
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function lineFor(text, position) {
  const before = text.slice(0, Math.max(0, position))
  const lines = before.split(/\r?\n/)
  const rawLine = lines.at(-1) || ''
  const section = rawLine.match(/^\s*((?:\d+(?:\.\d+)*|[IVX]+)[.)]?\s+[^:]{2,80})[:.]?/i)
  return {
    line: cleanText(rawLine || text.slice(Math.max(0, position - 120), position + 220), 700),
    section: cleanText(section?.[1] || lines.slice(-2, -1)[0] || 'Sección no identificada', 180),
  }
}

function makeFinding(type, text, index, fragment, description, recommendation) {
  const context = lineFor(text, index)
  return {
    type,
    section: context.section,
    fragment: cleanText(fragment || context.line, 900),
    description: cleanText(description),
    recommendation: cleanText(recommendation),
  }
}

function pushUnique(findings, finding) {
  const key = `${finding.type}|${finding.fragment.slice(0, 100).toLowerCase()}`
  if (!findings.some((item) => `${item.type}|${item.fragment.slice(0, 100).toLowerCase()}` === key)) {
    findings.push(finding)
  }
}

function buildSummary(findings) {
  return {
    inconsistencies: findings.filter((item) => item.type === 'cantidad' || item.type === 'plazo' || item.type === 'requisito').length,
    ambiguities: findings.filter((item) => item.type === 'ambiguedad').length,
    incongruencies: findings.filter((item) => item.type === 'incongruencia').length,
    total: findings.length,
  }
}

function amountFindings(text, findings) {
  const patterns = [
    { regex: /(?:mínimo|mínima|mínimos?|mínimas?|total de|número de|cantidad de|se requiere(?:n)?|contará con)\D{0,55}(\d+)\s*(?:personas?|profesionales?|especialistas?|bienes?|unidades?|locales?|entregables?)/gi, label: 'cantidad' },
    { regex: /(?:personas?|profesionales?|especialistas?|bienes?|unidades?|locales?|entregables?)\D{0,25}(\d+)/gi, label: 'cantidad' },
  ]
  const mentions = []
  for (const { regex } of patterns) {
    for (const match of text.matchAll(regex)) {
      mentions.push({ value: Number(match[1]), index: match.index ?? 0, fragment: match[0] })
    }
  }
  const grouped = new Map()
  mentions.forEach((mention) => {
    const key = mention.fragment.toLowerCase().replace(/\d+/g, '#').replace(/(?:mínimo|mínima|mínimos?|mínimas?|total de|número de|cantidad de|se requiere(?:n)?|contará con)/g, '').trim()
    const current = grouped.get(key) || []
    current.push(mention)
    grouped.set(key, current)
  })
  for (const entries of grouped.values()) {
    const values = [...new Set(entries.map((item) => item.value))]
    if (values.length > 1) {
      const first = entries[0]
      pushUnique(findings, makeFinding(
        'cantidad',
        text,
        first.index,
        entries.map((item) => item.fragment).join(' / '),
        `Se observan valores distintos (${values.join(' y ')}) para una misma categoría de cantidad o alcance.`,
        'Comparar los numerales citados y dejar una sola cantidad, indicando con claridad a qué etapa o entregable aplica.',
      ))
    }
  }
}

function deadlineFindings(text, findings) {
  const patterns = [
    /(?:plazo|duración|duracion|vigencia|entrega(?:rá|ra)?|ejecución|ejecucion|días|dias)\D{0,60}(\d+)\s*(días?|dias?|semanas?|meses?)/gi,
    /(?:hasta el|fecha límite|fecha limite|inicia el|inicio será el|inicio sera el)\D{0,20}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi,
  ]
  const mentions = []
  for (const regex of patterns) {
    for (const match of text.matchAll(regex)) {
      mentions.push({ value: `${match[1]} ${match[2] || ''}`.trim().toLowerCase(), index: match.index ?? 0, fragment: match[0] })
    }
  }
  const durationValues = [...new Set(mentions.filter((item) => /\d+\s*(días?|dias?|semanas?|meses?)/.test(item.value)).map((item) => item.value))]
  if (durationValues.length > 1) {
    const entries = mentions.filter((item) => durationValues.includes(item.value))
    pushUnique(findings, makeFinding(
      'plazo', text, entries[0].index, entries.map((item) => item.fragment).join(' / '),
      `Se mencionan plazos o duraciones diferentes (${durationValues.join(' y ')}), por lo que el periodo de ejecución no queda unívoco.`,
      'Precisar el plazo aplicable, su unidad de medida y el hito desde el cual se computa; revisar todos los numerales relacionados.',
    ))
  }
  const dateEntries = mentions.filter((item) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(item.value))
  const dateValues = [...new Set(dateEntries.map((item) => item.value))]
  if (dateValues.length > 1) {
    pushUnique(findings, makeFinding(
      'plazo', text, dateEntries[0].index, dateEntries.map((item) => item.fragment).join(' / '),
      `Se mencionan fechas distintas (${dateValues.join(' y ')}); conviene confirmar cuál es la fecha aplicable.`,
      'Revisar las fechas entre numerales y precisar el hito, la fecha límite y el formato de cómputo que corresponde.',
    ))
  }
}

function requirementFindings(text, findings) {
  const experience = [...text.matchAll(/(?:experiencia|antigüedad|antiguedad)\D{0,65}(\d+)\s*(años?|anos?|meses?)/gi)]
  const experienceValues = [...new Set(experience.map((item) => item[1] + ' ' + item[2].toLowerCase()))]
  if (experienceValues.length > 1) {
    pushUnique(findings, makeFinding(
      'requisito', text, experience[0].index ?? 0, experience.map((item) => item[0]).join(' / '),
      `El requisito de experiencia aparece con parámetros diferentes (${experienceValues.join(' y ')}).`,
      'Unificar el mínimo exigido y describir cómo se acreditará, incluyendo la definición de experiencia válida.',
    ))
  }
  const modes = [...text.matchAll(/(?:modalidad|forma de trabajo|atención|atencion)\D{0,35}(presencial|remota|remoto|híbrida|hibrida)/gi)]
  const modeValues = [...new Set(modes.map((item) => item[1].toLowerCase()))]
  if (modeValues.length > 1) {
    pushUnique(findings, makeFinding(
      'requisito', text, modes[0].index ?? 0, modes.map((item) => item[0]).join(' / '),
      `La modalidad del servicio se define de forma distinta (${modeValues.join(' y ')}).`,
      'Definir una modalidad única o explicar expresamente en qué actividades puede variar.',
    ))
  }
}

function ambiguityFindings(text, findings) {
  const terms = [
    ['periódicamente', 'periodicidad'],
    ['periodicamente', 'periodicidad'],
    ['oportunamente', 'momento de cumplimiento'],
    ['a la brevedad', 'plazo'],
    ['experiencia similar', 'alcance de la experiencia'],
    ['cuando sea necesario', 'supuesto de aplicación'],
    ['según corresponda', 'criterio de aplicación'],
    ['etc.', 'alcance de la lista'],
  ]
  for (const [term, missing] of terms) {
    const index = text.toLocaleLowerCase().indexOf(term)
    if (index >= 0) {
      const fragment = text.slice(Math.max(0, index - 90), Math.min(text.length, index + term.length + 150))
      pushUnique(findings, makeFinding(
        'ambiguedad', text, index, fragment,
        `La expresión «${term}» puede admitir interpretaciones distintas porque no se precisa ${missing}.`,
        `Reemplazar la expresión por un parámetro verificable: frecuencia, fecha, plazo, definición o condición concreta.`,
      ))
    }
  }
}

function incongruenceFindings(text, findings) {
  const objectMatch = text.match(/(?:objeto|finalidad)\s*[:\-]?\s*([^\n.]{20,220})/i)
  const activitiesMatch = text.match(/(?:actividades|alcance|entregables?)\s*[:\-]?\s*([^\n.]{20,220})/i)
  if (!objectMatch || !activitiesMatch) return
  const objectWords = new Set(objectMatch[1].toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter((word) => word.length > 4))
  const activityWords = activitiesMatch[1].toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter((word) => word.length > 4)
  const overlap = activityWords.filter((word) => objectWords.has(word)).length
  if (overlap === 0) {
    const index = text.indexOf(activitiesMatch[0])
    pushUnique(findings, makeFinding(
      'incongruencia', text, index, `${objectMatch[0]} / ${activitiesMatch[0]}`,
      'El objeto y las actividades parecen referirse a alcances distintos y requieren una revisión de coherencia.',
      'Verificar que cada actividad y entregable contribuya directamente al objeto; retirar o justificar los elementos ajenos.',
    ))
  }
}

export function analyzeLocally(input) {
  const text = String(input ?? '').trim().slice(0, LIMITS.maxChars)
  const findings = []
  amountFindings(text, findings)
  deadlineFindings(text, findings)
  requirementFindings(text, findings)
  ambiguityFindings(text, findings)
  incongruenceFindings(text, findings)
  const normalized = normalizeAnalysis({ findings }, text)
  return { ...normalized, engine: 'local-fallback' }
}

export function normalizeAnalysis(payload, originalText) {
  const rawFindings = Array.isArray(payload?.findings) ? payload.findings : []
  const candidates = rawFindings
    .map((item) => ({
      type: normalizeType(item?.type),
      section: cleanText(item?.section || item?.numeral || item?.section_name, 180),
      fragment: cleanText(item?.fragment || item?.excerpt || item?.text, 900),
      description: cleanText(item?.description || item?.problem, 1400),
      recommendation: cleanText(item?.recommendation || item?.suggestion, 1400),
    }))
    .filter((item) => item.type && item.section && item.fragment && item.description && item.recommendation)
  const source = normalizeForEvidence(originalText)
  const typeOrder = { cantidad: 1, plazo: 2, requisito: 3, ambiguedad: 4, incongruencia: 5 }
  const unique = new Map()
  for (const finding of candidates) {
    // The model may return a plausible-sounding explanation with an invented
    // or shortened excerpt. Reject it instead of showing an unsupported claim.
    if (!hasLiteralEvidence(finding.fragment, originalText)) continue
    if (!hasSupportedExplicitClaims(finding.description, finding.fragment)) continue
    const key = `${finding.type}|${finding.section.toLocaleLowerCase()}|${finding.fragment.toLocaleLowerCase()}`
    if (!unique.has(key)) unique.set(key, finding)
  }
  const findings = [...unique.values()]
    .sort((left, right) => {
      const leftPosition = Math.min(...evidenceParts(left.fragment).map((part) => source.indexOf(part)).filter((position) => position >= 0), Number.MAX_SAFE_INTEGER)
      const rightPosition = Math.min(...evidenceParts(right.fragment).map((part) => source.indexOf(part)).filter((position) => position >= 0), Number.MAX_SAFE_INTEGER)
      const positionDifference = (leftPosition < 0 ? Number.MAX_SAFE_INTEGER : leftPosition) - (rightPosition < 0 ? Number.MAX_SAFE_INTEGER : rightPosition)
      return positionDifference || typeOrder[left.type] - typeOrder[right.type] || left.section.localeCompare(right.section, 'es') || left.fragment.localeCompare(right.fragment, 'es')
    })
    .slice(0, LIMITS.maxFindings)
  return { findings, summary: buildSummary(findings), engine: 'ollama-cloud', sourceLength: originalText.length }
}

const SYSTEM_PROMPT = `Eres un revisor técnico minucioso de Términos de Referencia para un especialista de abastecimiento público. Lee y compara TODO el documento antes de responder; no te limites a sus primeras secciones ni a ejemplos aislados. Analiza únicamente estas cinco situaciones:
1) cantidad: inconsistencias de cantidades, personas, bienes, locales, entregables u otros valores numéricos;
2) plazo: inconsistencias de plazos, duraciones o fechas;
3) requisito: requisitos contradictorios definidos de manera diferente;
4) ambiguedad: información importante insuficientemente definida;
5) incongruencia: falta aparente de relación entre objeto, actividades, entregables o condiciones.
No determines legalidad, ilegalidad, validez jurídica, cumplimiento normativo ni emitas conclusiones jurídicas. Devuelve únicamente posibles puntos que requieren revisión humana.

Protocolo de revisión:
- Recorre todos los numerales, subtítulos, cuadros, listas y anexos incluidos en el texto.
- Para cantidades, compara todas las apariciones del mismo concepto, incluso si una está escrita con palabras y otra con números.
- Para plazos o fechas, compara unidad, duración, fecha de inicio, fecha límite y hito de cómputo cuando estén expresados.
- Para requisitos, compara parámetros, mínimos, modalidad, perfiles, acreditación y condiciones del mismo requisito.
- Para ambigüedades, exige que la expresión impida verificar una condición importante y que el documento no la defina en otra sección.
- Para incongruencias, exige una falta aparente de relación con el objeto; no marques una actividad solo porque sea inusual.
- No confundas alcances distintos: un plazo total, un plazo de aviso y un plazo para entregar un informe pueden coexistir. Solo reporta contradicción si se refieren al mismo evento, obligación o parámetro.
- No confundas categorías: un requisito no definido es ambigüedad; un requisito definido con valores incompatibles en dos lugares es requisito contradictorio; una contradicción interna no es incongruencia con el objeto.
- Una cantidad de equipos no es automáticamente una cantidad de mediciones o entregables. Compara solo el mismo concepto y unidad, salvo que el propio TDR los equipare expresamente.
- Reporta un hallazgo solo si existe evidencia textual suficiente. No inventes datos ni completes vacíos con conocimiento externo.
- En contradicciones, el fragmento debe incluir literalmente las dos formulaciones relevantes, separadas por « / », y la descripción debe explicar qué numerales deben compararse.
- Cada fragmento debe ser una cita literal o casi literal verificable en el TDR. La descripción no puede afirmar números, siglas, fechas o parámetros que no aparezcan en ese fragmento.
- Conserva el numeral o sección exactos. Reporta cada problema una sola vez, combina evidencia del mismo problema y ordena los hallazgos según su primera aparición.
- No incluyas observaciones legales, de estilo, redacción general, ortografía, presupuesto, mercado o temas distintos de los cinco tipos autorizados.
- Antes de responder, haz una autoauditoría: recorre de nuevo el documento completo, verifica cada hallazgo contra su fragmento, elimina duplicados y descarta cualquier punto cuya clasificación o evidencia no cumpla estas reglas.
- Responde únicamente JSON válido con esta forma: {"findings":[{"type":"cantidad|plazo|requisito|ambiguedad|incongruencia","section":"...","fragment":"...","description":"...","recommendation":"..."}]}`

export async function analyzeWithOllama(input, env = process.env) {
  const text = String(input ?? '').trim().slice(0, LIMITS.maxChars)
  if (!env.OLLAMA_API_KEY) return null
  const baseUrl = (env.OLLAMA_BASE_URL || 'https://ollama.com').replace(/\/$/, '')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 50000)
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OLLAMA_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL || 'gpt-oss:120b-cloud',
        stream: false,
        options: { temperature: 0, top_p: 1, top_k: 1, seed: 42 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Revisa este TDR. Conserva los numerales y reporta solo evidencia del texto.\n\n<TDR>\n${text}\n</TDR>` },
        ],
      }),
    })
    if (!response.ok) throw new Error(`Ollama respondió ${response.status}`)
    const data = await response.json()
    const parsed = extractJson(data?.message?.content || data?.response)
    if (!parsed) throw new Error('La respuesta de Ollama no tiene JSON válido')
    return normalizeAnalysis(parsed, text)
  } finally {
    clearTimeout(timeout)
  }
}

export async function analyzeTdr(input, env = process.env) {
  const text = String(input ?? '').trim()
  if (!text) throw new Error('El contenido del TDR está vacío.')
  try {
    const ollama = await analyzeWithOllama(text, env)
    if (ollama) return ollama
  } catch (error) {
    console.error('[tdr-check] Ollama fallback:', error.message)
  }
  return analyzeLocally(text)
}
