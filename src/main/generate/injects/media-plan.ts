// Which render paths an inject gets, decided deterministically from the taxonomy's render
// paths, the installed template's image slots and what the row asks for; the model only
// writes the prompts and voice lines. normalizeBrief() then forces the model's reply back
// onto that plan and applies the rules SDXL and the TTS chain need (positive prompts, the
// standard negative prompt, post-FX per voice type, voice lines from the fields as a
// fallback).
import type { Inject, MediaBrief, MediaBriefOutput, MselRow } from '@shared/schemas'
import { builtinProfile, type SceneAnchors } from '@shared/domains'
import { injectTypeInfo, type RenderPath } from '@shared/taxonomy'
import type { LoadedTemplate } from '../../render/templates'

export type ImageStyle = NonNullable<MediaBrief['imageStyle']>
export type PostFx = NonNullable<MediaBrief['postFx']>[number]

export interface MediaPlan {
  paths: RenderPath[]
  /** Template image slot the AI image is composited into. */
  imageSlot?: string
  imageStyle?: ImageStyle
  postFx?: PostFx[]
  /** The model is only called when there is a prompt or voice line to write. */
  needsModel: boolean
  reasons: string[]
}

const PHOTO_WORDS =
  /\b(photo|picture|pic|image|screenshot|selfie|snapshot|footage|video|clip|cctv|camera)\b/i
const VIDEO_WORDS = /\b(video|footage|clip|livestream|b-roll)\b/i
const PRESS_WORDS = /\b(press|news|reporter|channel \d|tv)\b/i
/** attachedImageBrief, imageBrief, sceneBrief, thumbnailBrief, heroImageBrief… (not avatarBrief). */
const IMAGE_FIELD = /(image|photo|scene|thumbnail|hero|visual|anchor)brief$/i

/** The field that briefs the photo, when the inject has one. */
export function imageBriefField(fields: Record<string, unknown>): string | undefined {
  const hit = Object.entries(fields).find(
    ([k, v]) => IMAGE_FIELD.test(k) && typeof v === 'string' && v.trim().length > 0,
  )
  return hit ? (hit[1] as string).trim() : undefined
}

export const POST_FX_BY_TYPE: Record<string, PostFx[]> = {
  radio_call: ['radio'],
  phone_call: ['phone'],
  voicemail: ['phone'],
  pa_announcement: ['pa', 'terminal_ambience'],
}

const IMAGE_STYLE_BY_TYPE: Record<string, ImageStyle> = {
  cctv_still: 'cctv',
  news_chyron_still: 'press',
  news_article: 'press',
  screenshot_generic: 'screen',
  tweet: 'phone',
  facebook_post: 'phone',
  instagram_post: 'phone',
  tiktok_video_card: 'phone',
  social_video: 'phone',
  scene_photo: 'phone',
  signage_photo: 'phone',
}

export const DEFAULT_NEGATIVE_PROMPT =
  'text, letters, words, captions, subtitles, readable signage, watermark, logo, signature, ' +
  'blurry, low quality, deformed hands, extra limbs, extra fingers, cartoon, illustration, 3d render, cgi'

/** Scene renders drift into offices and colour casts without these (M3 acceptance run). */
export const SCENE_NEGATIVE_PROMPT =
  'green tint, color cast, oversaturated, office cubicles, desks, computer lab, warehouse, classroom, empty room'

/** Camera/style anchors SDXL follows better than adjectives buried in a paragraph. */
const STYLE_ANCHORS: Record<ImageStyle, string> = {
  phone: 'Candid smartphone snapshot, slight tilt, natural color balance, neutral white balance',
  press: 'Press photograph, level horizon, 35 mm lens, sharp, natural daylight color',
  cctv: 'High corner surveillance camera frame, wide angle, washed-out monochrome tint',
  screen: 'A monitor photographed at an angle, slight moiré and reflections',
  portrait: 'Head and shoulders portrait, shallow depth of field, natural skin tones',
}

/** The scene is a control room / dispatch floor / command post rather than a public area. */
const CONTROL_WORDS =
  /\b(?:control room|operations? cent(?:er|re)|dispatch|console|hmi|scada|command (?:post|cent(?:er|re))|eoc|occ|aoc|nurses?'? station|dcs|dispatcher|operator'?s? desk)\b/i
/** The scene is outdoors / in the field. */
const EXTERIOR_WORDS =
  /\b(?:outside|outdoors?|exterior|parking|street|road|apron|yard|crest|substation|fence|perimeter|boat ramp|river|reservoir|spillway|tarmac|sidewalk|ambulance bay|loading dock|field|pole|highway|intersection|bus stop|platform|pier|berth|quay)\b/i

/** Which of the profile's three settings a prompt describes. */
export function sceneKind(
  prompt: string,
): keyof Pick<SceneAnchors, 'public' | 'control' | 'exterior'> {
  if (CONTROL_WORDS.test(prompt)) return 'control'
  if (EXTERIOR_WORDS.test(prompt)) return 'exterior'
  return 'public'
}

export interface SceneContext {
  /** Resolves to a built-in profile's scene anchors when `anchors` is not given. */
  orgType?: string
  /** The project's effective profile anchors (overrides applied). */
  anchors?: SceneAnchors
  /** The brief says the screens are dark: describe the scene without them (#141). */
  screensDark?: boolean
}

/** The profile's anchor for a prompt; the generic profile adds none (the model's own words stand). */
function settingAnchor(prompt: string, scene?: SceneContext): string | undefined {
  const profile = builtinProfile(scene?.orgType)
  const anchors = scene?.anchors ?? (profile.id === 'generic' ? undefined : profile.sceneAnchors)
  if (!anchors) return undefined
  const kind = sceneKind(prompt)
  const text = anchors[kind]
  if (!scene?.screensDark) return text
  if (kind === 'public' && anchors.publicScreensDark) return anchors.publicScreensDark
  return withoutScreens(text)
}

/** Styles that depict a place (and so take the setting anchor). */
const PLACE_STYLES = new Set<ImageStyle>(['phone', 'press', 'cctv'])

/** Camera, framing and light words: a prompt made only of these describes no place. */
const STYLE_WORDS = new Set(
  (
    'a an the of with and in on at from to by taken shot snapshot snap photo photograph picture ' +
    'image phone smartphone cell candid press wire service cctv surveillance camera frame still ' +
    'lens mm wide angle tilt tilted slight slightly flash glare close up closeup framing framed ' +
    'portrait landscape level horizon eye height daylight lighting light lit natural sharp ' +
    'blurry blurred grainy grain high corner monochrome tint washed out color colour balance ' +
    'white neutral warm cool tone toned realistic photorealistic style vertical horizontal'
  ).split(' '),
)

/** True when the prompt describes a scene of its own (not just camera and light words). */
export function hasOwnScene(prompt: string): boolean {
  const words = prompt.toLowerCase().match(/[a-z]+/g) ?? []
  return words.filter((w) => !STYLE_WORDS.has(w) && !/^\d/.test(w)).length >= 3
}

/**
 * The style anchor, then the model's prompt. The profile's setting anchor (scene styles only)
 * is the scene when the prompt has none; otherwise it follows the scene as setting guidance,
 * never in front of it, so SDXL does not blend an unrelated stock scene into this one (#177).
 */
export function anchoredPrompt(prompt: string, style: ImageStyle, scene?: SceneContext): string {
  const body = prompt.trim()
  if (!body) return ''
  const setting = PLACE_STYLES.has(style) ? settingAnchor(prompt, scene) : undefined
  if (!setting) return `${STYLE_ANCHORS[style]}. ${body}`
  if (!hasOwnScene(body)) return `${STYLE_ANCHORS[style]} ${setting}. ${body}`
  return `${STYLE_ANCHORS[style]}. ${body.replace(/[\s.;,]+$/, '')}. Setting: ${setting}`
}

/** The row or the inject's own fields ask for a photo (an attached image, a scene brief). */
export function wantsPhoto(inject: Inject, row: MselRow): boolean {
  return imageBriefField(inject.fields) !== undefined || PHOTO_WORDS.test(row.event)
}

/**
 * The render plan. `force` (from regenerate-media with explicit paths) adds a path the
 * rules would have left out, as long as the taxonomy allows it for the type.
 */
export function planMedia(
  inject: Inject,
  row: MselRow,
  template?: LoadedTemplate,
  force: RenderPath[] = [],
): MediaPlan {
  const info = injectTypeInfo(inject.type)
  const allowed = new Set<RenderPath>(info?.render ?? ['template'])
  const forced = new Set(force.filter((p) => allowed.has(p)))
  const primaryAi = info?.render[0] === 'ai_image'
  const paths: RenderPath[] = []
  const reasons: string[] = []
  const plan: MediaPlan = { paths, needsModel: false, reasons }
  if (template) paths.push('template')
  else reasons.push(`no template for ${inject.type}`)
  const slot = template?.meta.imageSlots[0]
  if (allowed.has('ai_image')) {
    const photo = wantsPhoto(inject, row) || forced.has('ai_image')
    if (primaryAi || (slot && photo) || (!template && photo)) {
      paths.push('ai_image')
      if (slot) plan.imageSlot = slot
      plan.imageStyle =
        PRESS_WORDS.test(row.event) && inject.type === 'scene_photo'
          ? 'press'
          : (IMAGE_STYLE_BY_TYPE[inject.type] ?? 'phone')
    } else if (template && !slot) reasons.push(`${inject.type} template has no image slot`)
    else reasons.push('row does not ask for a photo')
  }
  if (allowed.has('tts')) {
    paths.push('tts')
    plan.postFx = POST_FX_BY_TYPE[inject.type] ?? []
  }
  const video =
    info?.render[0] === 'ai_video' || VIDEO_WORDS.test(row.event) || forced.has('ai_video')
  if (allowed.has('ai_video') && video) {
    // Image-to-video needs a source still; plan one even for video-only types (#149).
    if (!paths.includes('ai_image')) {
      paths.push('ai_image')
      plan.imageStyle ??= IMAGE_STYLE_BY_TYPE[inject.type] ?? 'phone'
      reasons.push('still image planned as the image-to-video source')
    }
    paths.push('ai_video')
  }
  plan.needsModel = paths.some((p) => p !== 'template')
  return plan
}

// ---- brief normalisation -----------------------------------------------------------------

/**
 * SDXL ignores negation and paints any words it is given: drop "no text / no logos" clauses,
 * quoted strings ("showing 'Gate A1'") and "… in bright green text" phrases from the prompt.
 */
const NEGATED_TEXT_CLAUSE =
  /\b(?:no|without|not|never|avoid|lacks?|free of)\b[^,.;]*\b(?:text|signs?|signage|logos?|branding|brands?|watermarks?|letters?|words?|captions?|labels?|lettering|writing)\b/i

/** Drop whole clauses that negate text/logos ("the ceiling has no visible branding"). */
function dropNegatedClauses(prompt: string): string {
  const kept = prompt.split(/(?<=[,.;])/).filter((clause) => !NEGATED_TEXT_CLAUSE.test(clause))
  // A one-clause prompt ("A terminal with no text anywhere") keeps its subject; the phrase
  // stripper below removes the negation instead.
  if (!kept.join('').trim()) return prompt
  return kept.join('').replace(/\s*(?:,\s*)?(?:and|with|but)\s*([.;]|$)/g, '$1')
}

export function positivePrompt(prompt: string): string {
  return dropNegatedClauses(prompt)
    .replace(
      /\s*(?:showing|reading|displaying|labell?ed|marked|that says|saying)?\s*(?:'[^']{1,80}'|"[^"]{1,80}"|‘[^’]{1,80}’|“[^”]{1,80}”)/g,
      '',
    )
    .replace(/\s*\bin\b[^,.;]{0,40}\b(?:text|letters|lettering|font|typeface)\b/gi, '')
    .replace(
      /(?:^|[,;.]\s*|\s+)(?:with\s+|and\s+)?(?:no|without|avoid|not showing)\b[^,.;]*\b(text|signs?|signage|logos?|branding|brands?|watermarks?|letters?|words?|captions?|labels?|lettering|writing)\b[^,.;]*/gi,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,;.\s]+|[,;\s]+$/g, '')
    .trim()
}

// ---- dark screens (#141) ------------------------------------------------------------------

const SCREEN_WORDS =
  /\b(?:screens?|boards?|displays?|monitors?|fids|kiosks?|tvs?|televisions?|signage|signs?)\b/i
const DARK_WORDS =
  /\b(?:dark|darkened|blank|black(?:ed)? ?out|blacked-out|unlit|powered[- ]?(?:off|down)|switched off|turned off|shut off|went out|dead|no power|without power)\b/i

/** Negative-prompt entries for a scene whose screens must stay dark. */
export const LIT_SCREEN_NEGATIVE =
  'illuminated screens, glowing displays, lit departure boards, bright monitors, backlit signs, text'

/** True when a clause of the text says the screens/boards/displays are dark or off. */
export function describesDarkScreens(...texts: (string | undefined)[]): boolean {
  return texts.some((t) =>
    (t ?? '').split(/[,.;!?]|\bbut\b/i).some((c) => SCREEN_WORDS.test(c) && DARK_WORDS.test(c)),
  )
}

/** Words that only lead into the screens ("looking up at a row of …") and go with them. */
const SCREEN_LEAD_IN =
  /(?:\s+(?:looking|staring|gazing|pointing|glancing|up|upward|at|toward|towards|under|beneath|below|near|by|beside|in|front|of|before|with|and|a|an|the|row|rows|wall|bank|some|every|all|its|their|while|whose|where|but|show|shows|showing|large|small|big|huge|giant|overhead|digital|electronic|flight|departure|arrival|information|wall-mounted|mounted))+\s*$/i

/** The part of a clause before its first screen/darkness word; nothing when that is all. */
function clauseWithoutScreens(clause: string): string {
  const screen = SCREEN_WORDS.exec(clause)?.index ?? -1
  const dark = DARK_WORDS.exec(clause)?.index ?? -1
  const hits = [screen, dark].filter((i) => i >= 0)
  if (!hits.length) return clause
  const end = clause.slice(-1)
  const head = clause.slice(0, Math.min(...hits)).replace(SCREEN_LEAD_IN, '')
  return head.trim() ? `${head}${/[,.;]/.test(end) ? end : ''}` : ''
}

/** The prompt with every clause about screens (or darkness) removed; SDXL lights what it reads. */
export function withoutScreens(prompt: string): string {
  const clauses = prompt.split(/(?<=[,.;])/)
  const kept = clauses.map(clauseWithoutScreens).filter((c) => c.trim())
  const text = kept
    .join('')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,;\s]+([.;])/g, '$1')
    .replace(/^[,;.\s]+|[,;\s]+$/g, '')
    .trim()
  return text || prompt
}

function mergeNegative(model: string | undefined, style: ImageStyle, screensDark = false): string {
  const scene = PLACE_STYLES.has(style)
    ? `${DEFAULT_NEGATIVE_PROMPT}, ${SCENE_NEGATIVE_PROMPT}`
    : DEFAULT_NEGATIVE_PROMPT
  const base = screensDark ? `${scene}, ${LIT_SCREEN_NEGATIVE}` : scene
  const extra = (model ?? '')
    .split(/\s*,\s*/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !base.includes(s))
  return [base, ...extra].join(', ')
}

type VoiceLine = NonNullable<MediaBrief['voiceLines']>[number]

const asText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Voice lines from the inject's own fields when the model wrote none. */
/** Voice lines from the inject's own fields when the model wrote none. Handles the template
 *  shapes: radio `lines[{from,text}]` + `voiceStyle`, phone `transcript[{speaker,text,prompt?}]`
 *  + `voiceStyles{speaker: style}` (prompt turns are blank player responses, skipped), and a
 *  plain `text` / `message` / `transcript` string. */
export function voiceLinesFromFields(inject: Inject): VoiceLine[] {
  const f = inject.fields
  const caller = f.caller as Record<string, unknown> | undefined
  const speaker =
    asText(f.callsign) ||
    asText(f.caller) ||
    asText(caller?.label) ||
    asText(caller?.name) ||
    asText(f.from) ||
    asText(f.speaker) ||
    'Caller'
  const styles = (f.voiceStyles ?? {}) as Record<string, unknown>
  const styleFor = (who: string): string => asText(styles[who]) || asText(f.voiceStyle)
  const transcript = f.lines ?? f.transcript ?? f.text ?? f.message ?? f.body ?? f.dialogue
  if (Array.isArray(transcript)) {
    return transcript.flatMap((t): VoiceLine[] => {
      if (typeof t === 'string')
        return t.trim() ? [{ speaker, voiceStyle: styleFor(speaker), text: t.trim() }] : []
      const o = t as Record<string, unknown>
      const text = asText(o.text) || asText(o.line)
      if (!text || o.prompt === true) return []
      const who = asText(o.speaker) || asText(o.from) || speaker
      return [{ speaker: who, voiceStyle: styleFor(who), text }]
    })
  }
  const text = asText(transcript)
  return text ? [{ speaker, voiceStyle: styleFor(speaker), text }] : []
}

const clampDuration = (n: number | undefined): number =>
  Math.min(15, Math.max(3, Math.round(n ?? 8)))

/** Force the model's brief onto the plan and fill the defaults the pipeline relies on. */
export function normalizeBrief(
  plan: MediaPlan,
  out: MediaBriefOutput | undefined,
  inject: Inject,
  scene?: SceneContext,
): MediaBrief {
  const brief: MediaBrief = { paths: [...plan.paths] }
  const wantsImage = plan.paths.includes('ai_image') || plan.paths.includes('ai_video')
  if (wantsImage) {
    const style = out?.imageStyle ?? plan.imageStyle ?? 'phone'
    const source = out?.imagePrompt ?? imageBriefField(inject.fields) ?? ''
    const dark = describesDarkScreens(
      source,
      imageBriefField(inject.fields),
      asText(inject.fields.caption),
    )
    const positive = positivePrompt(source)
    const prompt = dark ? withoutScreens(positive) : positive
    if (prompt) brief.imagePrompt = anchoredPrompt(prompt, style, { ...scene, screensDark: dark })
    brief.negativePrompt = mergeNegative(out?.negativePrompt, style, dark)
    brief.imageStyle = style
  }
  if (plan.paths.includes('ai_video')) {
    const v = positivePrompt(out?.videoPrompt ?? out?.imagePrompt ?? '')
    if (v) brief.videoPrompt = v
    brief.durationSec = clampDuration(out?.durationSec)
  }
  if (plan.paths.includes('tts')) {
    const lines = (out?.voiceLines ?? []).filter((l) => l.text.trim())
    brief.voiceLines = lines.length ? lines : voiceLinesFromFields(inject)
    brief.postFx = plan.postFx ?? []
  }
  return brief
}
