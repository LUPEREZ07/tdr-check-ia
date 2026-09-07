// Respaldo local para mantener la interfaz operativa si el servicio remoto no responde.
function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max || 700)
}

function context(text, index) {
  const line = text.slice(0, index).split(/\r?\n/).at(-1) || ''
  const section = line.match(/^\s*((?:\d+(?:\.\d+)*|[IVX]+)[.)]?\s+[^:]{2,80})/i)
  return { line: clean(line || text.slice(Math.max(0, index - 100), index + 250)), section: clean(section?.[1] || 'Sección no identificada', 160) }
}

function finding(type, text, index, fragment, description, recommendation) {
  const ctx = context(text, index)
  return { type, section: ctx.section, fragment: clean(fragment), description: clean(description, 1200), recommendation: clean(recommendation, 1200) }
}

function unique(list, item) {
  if (!list.some((existing) => existing.type === item.type && existing.fragment.slice(0, 90) === item.fragment.slice(0, 90))) list.push(item)
}

export function analyzeLocally(text) {
  const value = String(text || '').trim()
  const findings = []
  const quantityMatches = [...value.matchAll(/(?:mínimo|mínima|requiere|conformado por|participación de)\D{0,50}(\d+)\s*(personas?|especialistas?|profesionales?|bienes?|unidades?)/gi)]
  const quantityValues = [...new Set(quantityMatches.map((match) => match[1]))]
  if (quantityValues.length > 1) unique(findings, finding('cantidad', value, quantityMatches[0].index, quantityMatches.map((match) => match[0]).join(' / '), 'Se observan cantidades distintas (' + quantityValues.join(' y ') + ') para una misma categoría de alcance.', 'Comparar los numerales y dejar una sola cantidad, indicando a qué etapa o entregable aplica.'))

  const deadlineMatches = [...value.matchAll(/(?:duración|duracion|plazo|entregará|entregara|días|dias)\D{0,50}(\d+)\s*(días?|dias?|semanas?|meses?)/gi)]
  const deadlineValues = [...new Set(deadlineMatches.map((match) => match[1] + ' ' + match[2].toLowerCase()))]
  if (deadlineValues.length > 1) unique(findings, finding('plazo', value, deadlineMatches[0].index, deadlineMatches.map((match) => match[0]).join(' / '), 'Se mencionan plazos diferentes (' + deadlineValues.join(' y ') + ').', 'Precisar el plazo aplicable, su unidad de medida y el hito desde el cual se computa.'))

  const experienceMatches = [...value.matchAll(/(?:experiencia|antigüedad|antiguedad)\D{0,50}(\d+)\s*(años?|anos?|meses?)/gi)]
  if (new Set(experienceMatches.map((match) => match[1] + match[2])).size > 1) unique(findings, finding('requisito', value, experienceMatches[0].index, experienceMatches.map((match) => match[0]).join(' / '), 'El requisito de experiencia aparece con parámetros diferentes.', 'Unificar el mínimo exigido y definir cómo se acreditará.'))

  const modeMatches = [...value.matchAll(/(?:modalidad|forma de trabajo|atención|atencion)\D{0,35}(presencial|remota|remoto|híbrida|hibrida)/gi)]
  if (new Set(modeMatches.map((match) => match[1].toLowerCase())).size > 1) unique(findings, finding('requisito', value, modeMatches[0].index, modeMatches.map((match) => match[0]).join(' / '), 'La modalidad del servicio se define de forma distinta.', 'Definir una modalidad única o explicar expresamente en qué actividades puede variar.'))

  const ambiguityTerms = [['periódicamente', 'la frecuencia'], ['periodicamente', 'la frecuencia'], ['oportunamente', 'el momento de cumplimiento'], ['experiencia similar', 'el alcance de la experiencia'], ['según corresponda', 'el criterio de aplicación'], ['etc.', 'el alcance de la lista']]
  for (const [term, missing] of ambiguityTerms) {
    const index = value.toLocaleLowerCase().indexOf(term)
    if (index >= 0) unique(findings, finding('ambiguedad', value, index, value.slice(Math.max(0, index - 90), index + term.length + 140), 'La expresión «' + term + '» no permite verificar con claridad ' + missing + '.', 'Reemplazarla por un parámetro verificable: frecuencia, fecha, plazo, definición o condición concreta.'))
  }

  const object = value.match(/(?:objeto|finalidad)\s*[:\-]?\s*([^\n.]{20,220})/i)
  const activities = value.match(/(?:actividades|alcance|entregables?)\s*[:\-]?\s*([^\n.]{20,220})/i)
  if (object && activities) {
    const objectWords = new Set(object[1].toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter((word) => word.length > 4))
    const activityWords = activities[1].toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter((word) => word.length > 4)
    if (!activityWords.some((word) => objectWords.has(word))) unique(findings, finding('incongruencia', value, value.indexOf(activities[0]), object[0] + ' / ' + activities[0], 'El objeto y las actividades parecen referirse a alcances distintos.', 'Verificar que cada actividad y entregable contribuya directamente al objeto; retirar o justificar los elementos ajenos.'))
  }
  return {
    findings,
    summary: {
      inconsistencies: findings.filter((item) => ['cantidad', 'plazo', 'requisito'].includes(item.type)).length,
      ambiguities: findings.filter((item) => item.type === 'ambiguedad').length,
      incongruencies: findings.filter((item) => item.type === 'incongruencia').length,
      total: findings.length,
    },
    engine: 'local-fallback',
  }
}
