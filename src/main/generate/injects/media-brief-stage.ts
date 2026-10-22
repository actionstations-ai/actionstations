// inject_media_brief for one inject: the render paths come from planMedia(); the model is
// called only when an image prompt, video prompt or voice lines are needed, and its reply is
// normalised onto the plan. Template-only injects get a 'skipped' StageRun (no tokens).
import type {
  Inject,
  MediaBrief,
  MediaBriefOutput,
  MselRow,
  Scenario,
  StageRun,
} from '@shared/schemas'
import { injectTypeInfo, type RenderPath } from '@shared/taxonomy'
import { nowIso } from '../../lib/ids'
import type { LoadedTemplate } from '../../render/templates'
import { stripKeysDeep } from '../mappers'
import { runStage } from '../stage'
import { baseVars, dataSafe, rowVars } from '../vars'
import { factsSoFar, formatFacts } from './facts'
import { normalizeBrief, planMedia, type MediaPlan } from './media-plan'
import type { InjectEnv } from './text-stage'

export interface MediaBriefInput {
  env: InjectEnv
  scenario: Scenario
  row: MselRow
  inject: Inject
  priorInjects: Inject[]
  instructions?: string
  /** Paths the user asked for explicitly (regenerate-media). */
  forcePaths?: RenderPath[]
}

export interface MediaBriefResult {
  brief: MediaBrief
  plan: MediaPlan
  run: StageRun
}

function templateFor(env: InjectEnv, type: string): LoadedTemplate | undefined {
  return env.deps.templates.listTemplateTypes().includes(type)
    ? env.deps.templates.loadTemplate(type)
    : undefined
}

const skippedRun = (injectId: string, reason: string): StageRun => ({
  stage: 'inject_media_brief',
  itemId: injectId,
  startedAt: nowIso(),
  finishedAt: nowIso(),
  status: 'skipped',
  error: reason,
  repairAttempts: 0,
})

function briefVars(input: MediaBriefInput, plan: MediaPlan): Record<string, unknown> {
  const { env, scenario: s, row, inject, priorInjects, instructions } = input
  const info = injectTypeInfo(inject.type)
  return {
    ...baseVars({
      project: env.project,
      scenario: s,
      domain: env.domain,
      ...(instructions ? { instructions } : {}),
    }),
    row: rowVars(row, s.roles),
    inject: dataSafe({
      id: inject.id,
      title: inject.title,
      deliveryMode: inject.deliveryMode,
      fields: inject.fields,
      instructorNote: inject.instructorNote ?? '',
    }),
    injectType: inject.type,
    injectTypeLabel: info?.label ?? inject.type,
    renderPaths: info?.render ?? ['template'],
    plan: {
      paths: plan.paths,
      wantsImage: plan.paths.includes('ai_image'),
      wantsVideo: plan.paths.includes('ai_video'),
      wantsTts: plan.paths.includes('tts'),
      imageSlot: plan.imageSlot ?? '',
      imageStyle: plan.imageStyle ?? '',
      postFx: plan.postFx ?? [],
    },
    facts: dataSafe(formatFacts(factsSoFar(s.msel, row, priorInjects))),
    brand: env.project.brand,
  }
}

/** Plan the media for one inject; the brief is attached to the inject by the caller. */
export async function runMediaBrief(input: MediaBriefInput): Promise<MediaBriefResult> {
  const { env, inject, row } = input
  const scene = { orgType: env.project.orgType, anchors: env.domain.profile.sceneAnchors }
  const plan = planMedia(inject, row, templateFor(env, inject.type), input.forcePaths ?? [])
  const extra = { stage: 'inject_media_brief' as const, itemId: inject.id }
  if (!plan.needsModel) {
    const why = plan.reasons.length ? ` (${plan.reasons.join('; ')})` : ''
    env.ctx.log(
      `inject_media_brief ${row.id}: ${plan.paths.join('+') || 'nothing to render'}${why}`,
      'info',
      extra,
    )
    return {
      brief: normalizeBrief(plan, undefined, inject, scene),
      plan,
      run: skippedRun(inject.id, `template only${why}`),
    }
  }
  env.ctx.log(`inject_media_brief ${row.id}: planning ${plan.paths.join('+')}`, 'info', extra)
  const r = await runStage<MediaBriefOutput>({
    stage: 'inject_media_brief',
    itemId: inject.id,
    projectPath: env.root,
    vars: briefVars(input, plan),
    ctx: env.ctx,
    deps: env.deps,
    index: env.index,
  })
  const brief = normalizeBrief(plan, stripKeysDeep(r.output), inject, scene)
  if (brief.paths.includes('ai_image') && !brief.imagePrompt) {
    env.ctx.log(
      `inject_media_brief ${row.id}: the model wrote no image prompt; the image step will be skipped`,
      'warn',
      extra,
    )
  }
  if (brief.paths.includes('tts') && !brief.voiceLines?.length) {
    env.ctx.log(
      `inject_media_brief ${row.id}: no voice lines in the brief or the fields; TTS will be skipped`,
      'warn',
      extra,
    )
  }
  return { brief, plan, run: r.run }
}
