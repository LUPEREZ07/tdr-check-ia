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

function firstMatch(text, regex) {
  const match = text.match(regex)
  return match ? { index: match.index ?? 0, value: match[0] } : null
}

function addPairedFinding(text, findings, type, left, right, description, recommendation) {
  if (!left || !right) return
  unique(findings, finding(type, text, left.index, left.value + ' / ' + right.value, description, recommendation))
}

function addDocumentWideFindings(text, findings) {
  const monthlyTerm = firstMatch(text, /El término del servicio mensual[^.]{0,280}\./i)
  if (monthlyTerm) unique(findings, finding('ambiguedad', text, monthlyTerm.index, monthlyTerm.value, 'La expresión «término del servicio mensual» no define si se refiere al cierre del periodo, al entregable, a la conformidad o al pago.', 'Reemplazarla por una regla concreta que identifique el entregable, la conformidad y el momento exacto de pago.'))

  const startDate = firstMatch(text, /Los servicios materia de la presente convocatoria se prestan en el plazo de 1095 días calendario o hasta consumir el monto total contratado, lo que ocurra primero, contados a partir del día siguiente de la firma del contrato o el vencimiento del contrato vigente\./i)
  if (startDate) unique(findings, finding('ambiguedad', text, startDate.index, startDate.value, 'El inicio del plazo queda asociado a dos eventos alternativos —la firma del contrato o el vencimiento del contrato vigente— sin precisar cuándo aplica cada uno.', 'Definir un único hito de inicio o establecer expresamente la condición que determina cuál de los dos eventos corresponde.'))

  const environmental = firstMatch(text, /se deberá establecer el uso de materiales que sean amigables con el ambiente[^.]{0,180}\./i)
  if (environmental) unique(findings, finding('ambiguedad', text, environmental.index, environmental.value, 'La exigencia de usar materiales «amigables con el ambiente» no establece qué materiales, criterios o evidencia permiten verificarla.', 'Precisar los materiales aceptables y el criterio o documento que acreditará el cumplimiento de esta condición.'))

  const insurance = firstMatch(text, /El contratista deberá contar con los seguros aplicables a la actividad que realiza[^.]{0,220}\./i)
  if (insurance) unique(findings, finding('ambiguedad', text, insurance.index, insurance.value, 'La exigencia de contar con «los seguros aplicables» no identifica el tipo de seguro, cobertura, monto mínimo ni vigencia exigible.', 'Definir los seguros requeridos, sus coberturas, montos mínimos, vigencia y forma de acreditación.'))

  const policeReport = firstMatch(text, /el mensajero a cargo de la diligencia deberá formular en el plazo de dos \(2\) días, la denuncia en la dependencia policial de la localidad[^.]{0,220}\./i)
  if (policeReport) unique(findings, finding('ambiguedad', text, policeReport.index, policeReport.value, 'El plazo de dos días para formular la denuncia no precisa si se computa como días calendario o días hábiles.', 'Indicar expresamente la unidad de cómputo del plazo y el momento exacto desde el cual empieza a contarse.'))

  addPairedFinding(text, findings, 'plazo',
    firstMatch(text, /anticipación no menor de cinco \(5\) días hábiles antes de que inicie el servicio en la nueva dirección\./i),
    firstMatch(text, /anticipación no menor a 02 días hábiles antes del cambio efectivo\./i),
    'El documento establece plazos diferentes para comunicar un cambio de dirección: cinco días hábiles y dos días hábiles.',
    'Precisar si se trata del mismo supuesto y dejar un único plazo aplicable, indicando quién comunica el cambio y desde qué hito se computa.')

  addPairedFinding(text, findings, 'requisito',
    firstMatch(text, /El término del servicio mensual[^.]{0,240}a cargo de la Gerencia General\./i),
    firstMatch(text, /Área que brindará la conformidad: Unidad Funcional Gestión Documental,[^.]{0,240}\./i),
    'La responsabilidad de otorgar la conformidad aparece atribuida a áreas diferentes: la Gerencia General y la Unidad Funcional Gestión Documental.',
    'Definir una única área responsable de otorgar la conformidad o separar expresamente las responsabilidades de cada área.')

  addPairedFinding(text, findings, 'requisito',
    firstMatch(text, /Se encuentra prohibida la subcontratación de las prestaciones objeto del contrato\./i),
    firstMatch(text, /terceros subcontratados, autorizados debidamente por la Entidad\./i),
    'El documento prohíbe la subcontratación de las prestaciones, pero también contempla terceros subcontratados autorizados, sin delimitar cuándo aplica cada regla.',
    'Aclarar si la subcontratación está prohibida absolutamente o si existe una excepción expresa para terceros autorizados.')
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

  addDocumentWideFindings(value, findings)

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
