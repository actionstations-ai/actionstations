// Markdown renderers for the scenario documents, shaped after reference/scenario-3/*.md.
// The handbook is assembled from sections produced by different stages (handbook prose,
// rubric, hot wash), so each section sits between markers and can be replaced on re-run.
import type {
  BriefingOutput,
  Citation,
  HandbookOutput,
  MselRow,
  Phase,
  Role,
  Scenario,
} from '@shared/schemas'
import { PURPOSE_TAG_INFO } from '@shared/taxonomy'
import { DEFAULT_START_WALL_CLOCK, goalSummary, resolveToRoles, wallClockAt } from './mappers'

const cell = (s: string): string =>
  s
    .replace(/\|/g, '\\|')
    .replace(/\r?\n+/g, ' ')
    .trim()

export function citationLabel(c: Citation): string {
  const page = c.page ? ` (p. ${c.page})` : ''
  return `${c.headingPath}${page}`
}

function roleLabel(roles: Role[], row: MselRow): string {
  if (row.toLabel) return row.toLabel
  const ids = new Set(row.toRoleIds)
  const names = roles.filter((r) => ids.has(r.id)).map((r) => r.abbreviation || r.name)
  return names.join(', ') || 'All'
}

export function mselTable(rows: MselRow[], roles: Role[]): string {
  const head =
    '| Time | Inject ID | From | To | Event / Message | Expected Action | Tag |\n|---|---|---|---|---|---|---|'
  const body = rows.map(
    (r) =>
      `| ${r.time}${r.wallClock ? ` (${r.wallClock})` : ''} | ${cell(r.id)} | ${cell(r.from)} | ${cell(roleLabel(roles, r))} | ${cell(r.event)} | ${cell(r.expectedAction)} | ${PURPOSE_TAG_INFO[r.purposeTag]?.label ?? r.purposeTag} |`,
  )
  return [head, ...body].join('\n')
}

function phaseHeading(p: Phase): string {
  return `## Phase ${p.index + 1}: ${p.title} (Hour ${p.startTime} – ${p.endTime})`
}

/** The MSEL document: header, overview, roles, one table per phase. Stored as the "overview" doc. */
export function renderMselMarkdown(s: Scenario): string {
  const o = s.overview
  const lines: string[] = [
    '# Master Scenario Events List (MSEL)',
    '',
    `**${s.title}**${s.subtitle ? ` (${s.subtitle})` : ''}`,
    `Location: ${o?.location || '[Location]'} · Duration: ${s.brief.durationHours} Hours`,
    `Target Audience: ${o?.targetAudience || s.brief.audience.join(', ') || '[Audience]'}`,
    '',
    '## Scenario Overview',
    '',
  ]
  if (o) {
    lines.push(`**Theme:** ${o.theme}`, '', `**The Threat:** ${o.threat}`, '')
    lines.push(`**The Operational Impact:** ${o.operationalImpact}`, '')
    if (o.coreSectionsTested.length) {
      lines.push('**Core Plan Sections Tested:**')
      for (const c of o.coreSectionsTested) lines.push(`- ${citationLabel(c)}`)
      lines.push('')
    }
  }
  if (s.objectives.length) {
    lines.push('**Exercise Objectives:**')
    for (const ob of s.objectives) lines.push(`- **${ob.name}:** ${ob.text}`)
    lines.push('')
  }
  if (s.roles.length) {
    lines.push('## Roles & Responsibilities (For Students)', '')
    for (const r of s.roles)
      lines.push(`- **${r.name}${r.abbreviation ? ` (${r.abbreviation})` : ''}:** ${r.description}`)
    lines.push('')
  }
  for (const p of s.phases) {
    const rows = s.msel.filter((r) => r.phaseId === p.id)
    lines.push(phaseHeading(p), '', `Goal: ${goalSummary(p.goal)}`, '')
    lines.push(rows.length ? mselTable(rows, s.roles) : '_No injects generated yet._', '')
  }
  return lines.join('\n').trimEnd() + '\n'
}

// ---------------------------------------------------------------------------------------------
// Controller / Evaluator handbook

export type HandbookSection = 'overview' | 'room' | 'rules' | 'rubric' | 'hotwash'

const marker = (name: HandbookSection, close = false): string =>
  `<!-- ${close ? '/' : ''}section:${name} -->`

export function wrapSection(name: HandbookSection, body: string): string {
  return `${marker(name)}\n${body.trim()}\n${marker(name, true)}`
}

/** Replace a marked section in a document; append it when the document has no such section. */
export function upsertSection(markdown: string, name: HandbookSection, body: string): string {
  const open = marker(name)
  const close = marker(name, true)
  const start = markdown.indexOf(open)
  const end = markdown.indexOf(close)
  const block = wrapSection(name, body)
  if (start < 0 || end < start) return markdown.trimEnd() + '\n\n' + block + '\n'
  return markdown.slice(0, start) + block + markdown.slice(end + close.length)
}

export function rubricSection(s: Scenario): string {
  const lines = ['### 4. Evaluation & Grading Rubric', '']
  const metrics = s.rubric?.metrics ?? []
  if (!metrics.length) return [...lines, '_Rubric not generated yet._'].join('\n')
  lines.push('| Metric | Assessment | Linked injects |', '|---|---|---|')
  metrics.forEach((m, i) => {
    const assessment = `☐ **Fail:** ${cell(m.fail)} ☐ **Pass:** ${cell(m.pass)} ☐ **Excellence:** ${cell(m.excellence)}`
    lines.push(
      `| **Metric ${i + 1}: ${cell(m.name)} (${m.points} Points)** | ${assessment} | ${m.linkedInjectIds.join(', ') || '—'} |`,
    )
  })
  const total = metrics.reduce((n, m) => n + m.points, 0)
  lines.push('', `Total: ${total} points.`)
  return lines.join('\n')
}

export function hotwashSection(s: Scenario): string {
  const h = s.hotwash
  const lines = ['### 5. Hot Wash Guide (Debrief)', '']
  if (!h) return [...lines, '_Hot wash not generated yet._'].join('\n')
  const method = h.method === '3up3down' ? 'The "3-Up, 3-Down" Method' : h.method
  lines.push(`**${method}:** ${h.methodDescription}`, '')
  lines.push(`**Key Discussion Questions for ${s.title}:**`)
  for (const q of h.questions) {
    const ref = q.objectiveRef ? ` _(Objective: ${q.objectiveRef})_` : ''
    lines.push(`- **${q.topic || 'Discussion'}:** ${q.text}${ref}`)
  }
  return lines.join('\n')
}

function simcellSection(s: Scenario): string {
  if (!s.simcellScripts.length) return ''
  const lines = [
    '',
    '**SimCell Scripts (play these when the trigger happens — do not make it easy):**',
    '',
  ]
  for (const sc of s.simcellScripts) {
    lines.push(`- **${sc.rolePlayed}** — _Trigger: ${sc.trigger}_`)
    for (const q of sc.hardQuestions) lines.push(`  - Ask: "${q}"`)
    for (const c of sc.concessions) lines.push(`  - Concede only when: ${c}`)
  }
  return lines.join('\n')
}

export function renderHandbookMarkdown(s: Scenario, out: HandbookOutput): string {
  const o = s.overview
  const header = [
    '# Controller / Evaluator (C/E) Handbook',
    `## ${s.title}${s.subtitle ? ` — ${s.subtitle}` : ''}`,
    '',
    `Exercise Date: [Date] · Location: ${o?.location || '[Location]'} · Duration: ${s.brief.durationHours} Hours`,
    '',
  ].join('\n')
  const overview = [
    '### 1. Exercise Overview & Objectives',
    '',
    out.exerciseOverviewMd.trim(),
    '',
    '**Objectives:**',
    ...s.objectives.map((ob) => `- **${ob.name}:** ${ob.text}`),
    '',
    '**Plan sections exercised:**',
    ...(o?.coreSectionsTested.map((c) => `- ${citationLabel(c)}`) ?? []),
  ].join('\n')
  const room = ['### 2. Room Setup & Logistics', '', out.roomSetupMd.trim()].join('\n')
  const rules = [
    '### 3. Rules of Play (Instructor Guide)',
    '',
    out.rulesOfPlayMd.trim(),
    simcellSection(s),
  ].join('\n')
  return [
    header,
    wrapSection('overview', overview),
    wrapSection('room', room),
    wrapSection('rules', rules),
    wrapSection('rubric', rubricSection(s)),
    wrapSection('hotwash', hotwashSection(s)),
    '',
    '*End of Handbook*',
    '',
  ].join('\n\n')
}

// ---------------------------------------------------------------------------------------------
// Player briefing packet

function teamTable(s: Scenario, out: BriefingOutput): string {
  const lines = ['| Team | Role | Standing Orders |', '|---|---|---|']
  for (const t of out.teams) {
    const ids = t.roleKeys.flatMap((k) => resolveToRoles([k], s.roles).ids)
    const names = s.roles.filter((r) => ids.includes(r.id)).map((r) => r.name)
    const who = names.length ? ` — ${names.join(', ')}` : ''
    const orders = t.standingOrders.map((o) => `**${cell(o)}**`).join(' ')
    lines.push(`| **${cell(t.team)}**${cell(who)} | ${cell(t.responsibility)} | ${orders} |`)
  }
  return lines.join('\n')
}

function resourceTable(s: Scenario): string {
  const lines = ['| Resource | Status (Green/Yellow/Red) | Notes |', '|---|---|---|']
  for (const r of s.criticalResources) lines.push(`| ${cell(r)} | | |`)
  if (!s.criticalResources.length) lines.push('| | | |')
  return lines.join('\n')
}

export function renderBriefingMarkdown(s: Scenario, out: BriefingOutput): string {
  const o = s.overview
  const start = s.brief.startWallClock ?? DEFAULT_START_WALL_CLOCK
  const lines = [
    '# Player Briefing Packet',
    `## ${s.title}${s.subtitle ? ` — ${s.subtitle}` : ''}`,
    '',
    `Location: ${o?.location || '[Location]'} · Exercise Duration: ${s.brief.durationHours} Hours`,
    `Current Time: ${out.currentTime || wallClockAt(start, '0:00')} (Exercise Time) · Weather: ${out.weather}`,
    '',
    '### 1. Situation Brief',
    '',
    out.situationBriefMd.trim(),
    '',
    ...out.statusBoard.map((b) => `- ${b.item}: ${b.status}`),
    '',
    `**The Anomaly:** ${out.anomalyMd.trim()}`,
    '',
    `**YOUR MISSION:** ${out.missionMd.trim()}`,
    '',
    '### 2. Team Assignments & Standing Orders',
    '',
    teamTable(s, out),
    '',
    '### 3. Rules of Engagement',
    '',
    ...out.rulesOfEngagement.map((r) => `- ${r}`),
    '',
    '### 4. Incident Briefing Form (ICS-201)',
    '',
    'Use this form to log the situation as it evolves. This is your "Board of Record."',
    '',
    '**1. Incident Name:** ________________ · **2. Incident Number:** ______ · **3. Date/Time Initiated:** ________',
    '',
    '**4. MAP SKETCH** — (Sketch the facility layout. Mark affected areas, command post, staging.)',
    '',
    '**5. CURRENT SITUATION SUMMARY AND HEALTH AND SAFETY BRIEFING** — (What do we know? What is broken? What is the hazard to people?)',
    '',
    '**7. CURRENT AND PLANNED OBJECTIVES**',
    '1. _____',
    '2. _____',
    '3. _____',
    '',
    '**8. CURRENT AND PLANNED ACTIONS** — | Time | Action |',
    '',
    '**10. CRITICAL RESOURCE STATUS**',
    '',
    resourceTable(s),
    '',
    '*End of Briefing Packet*',
    '',
  ]
  return lines.join('\n')
}

export function renderHotwashMarkdown(s: Scenario): string {
  return [
    '# Hot Wash Guide',
    `## ${s.title}`,
    '',
    hotwashSection(s).replace(/^### 5\. /, '### '),
    '',
  ].join('\n')
}
