import { describe, expect, it } from 'vitest'
import type { ApiWorkflow } from '../../../comfy/workflow'
import { checkOptionalGroups, comboOptions, runnableWorkflow, type NodeInfo } from './optional'

const workflow: ApiWorkflow = {
  '8': { class_type: 'VAEDecode', inputs: {} },
  '9': {
    class_type: 'SaveImage',
    inputs: { images: ['21', 0] },
    _meta: { fallback: { images: ['8', 0] } },
  },
  '20': {
    class_type: 'DetectorLoader',
    inputs: { model: 'det-large', precision: 'fp32' },
    _meta: { optional: 'detector' },
  },
  '21': {
    class_type: 'DetectorRun',
    inputs: { model: ['20', 0], image: ['8', 0] },
    _meta: { optional: 'detector' },
  },
}

/** Server node info: the loader lists its model folders as an old-style combo. */
const server = (models: string[]): Record<string, NodeInfo> => ({
  DetectorLoader: {
    input: {
      required: { model: [models, {}], precision: ['COMBO', { options: ['fp16', 'fp32'] }] },
    },
  },
  DetectorRun: { input: { required: { model: ['DETECTOR'], image: ['IMAGE'] } } },
})

const lookup = (info: Record<string, NodeInfo>) => async (cls: string) => info[cls]

describe('optional node groups at render time (#356)', () => {
  it('reads both combo spec styles', () => {
    expect(comboOptions([['a', 'b'], {}])).toEqual(['a', 'b'])
    expect(comboOptions(['COMBO', { options: ['x'] }])).toEqual(['x'])
    expect(comboOptions(['INT', { default: 1 }])).toBeUndefined()
  })

  it('keeps a group the server can run', async () => {
    const out = await runnableWorkflow(workflow, lookup(server(['det-large'])))
    expect(out.unavailable).toEqual([])
    expect(out.workflow).toBe(workflow)
  })

  it('leaves the group out when its custom node is not installed', async () => {
    const out = await runnableWorkflow(workflow, lookup({}))
    expect(out.unavailable).toEqual([
      { group: 'detector', reason: 'node DetectorLoader is not installed' },
    ])
    expect(Object.keys(out.workflow).sort()).toEqual(['8', '9'])
    expect(out.workflow['9']!.inputs.images).toEqual(['8', 0])
  })

  it('leaves the group out when the model file is missing', async () => {
    const { unavailable } = await checkOptionalGroups(workflow, lookup(server(['other'])))
    expect(unavailable).toEqual([
      { group: 'detector', reason: 'DetectorLoader has no model "det-large"' },
    ])
  })

  it('asks the server once per class and not at all without groups', async () => {
    const asked: string[] = []
    const counting = async (cls: string) => {
      asked.push(cls)
      return server(['det-large'])[cls]
    }
    await runnableWorkflow(workflow, counting)
    expect(asked.sort()).toEqual(['DetectorLoader', 'DetectorRun'])
    asked.length = 0
    const plain = { '8': workflow['8']! }
    expect((await runnableWorkflow(plain, counting)).workflow).toBe(plain)
    expect(asked).toEqual([])
  })
})
