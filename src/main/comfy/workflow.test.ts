import { describe, expect, it } from 'vitest'
import {
  detectWorkflowFormat,
  literalInputs,
  missingNodes,
  modelNameOf,
  optionalGroups,
  optionalNodes,
  parseApiWorkflow,
  requiredNodes,
  withoutGroups,
  workflowSha256,
  type ApiWorkflow,
} from './workflow'

const api: ApiWorkflow = {
  '10': { class_type: 'SaveImage', inputs: { filename_prefix: 'x', images: ['8', 0] } },
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd.safetensors' } },
  '8': {
    class_type: 'VAEDecode',
    inputs: { samples: ['3', 0], vae: ['4', 2] },
    _meta: { title: 'Decode' },
  },
}

describe('workflow helpers', () => {
  it('tells API format from the editor (UI) format', () => {
    expect(detectWorkflowFormat(api)).toBe('api')
    expect(detectWorkflowFormat({ nodes: [], links: [], version: 0.4 })).toBe('ui')
    expect(detectWorkflowFormat({ foo: 1 })).toBe('unknown')
    expect(detectWorkflowFormat([])).toBe('unknown')
  })

  it('explains how to export the API format when given a UI workflow', () => {
    expect(() => parseApiWorkflow(JSON.stringify({ nodes: [], links: [] }))).toThrow(
      /Export \(API\)/,
    )
    expect(() => parseApiWorkflow('{ nope')).toThrow(/not valid JSON/)
    expect(() => parseApiWorkflow('{"a": 1}')).toThrow(/Not a ComfyUI API-format workflow/)
  })

  it('lists required node classes and finds missing ones', () => {
    expect(requiredNodes(api)).toEqual(['CheckpointLoaderSimple', 'SaveImage', 'VAEDecode'])
    expect(missingNodes(requiredNodes(api), new Set(['SaveImage', 'VAEDecode']))).toEqual([
      'CheckpointLoaderSimple',
    ])
  })

  it('lists literal inputs in numeric node order and skips links', () => {
    expect(literalInputs(api)).toEqual([
      {
        nodeId: '4',
        classType: 'CheckpointLoaderSimple',
        inputName: 'ckpt_name',
        value: 'sd.safetensors',
      },
      { nodeId: '10', classType: 'SaveImage', inputName: 'filename_prefix', value: 'x' },
    ])
  })

  it('hashes independent of key order', () => {
    const reordered = JSON.parse(JSON.stringify({ '8': api['8'], '4': api['4'], '10': api['10'] }))
    expect(workflowSha256(reordered)).toBe(workflowSha256(api))
    expect(workflowSha256(api)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('finds the model file for provenance', () => {
    expect(modelNameOf(api)).toBe('sd.safetensors')
    expect(
      modelNameOf({ '1': { class_type: 'X', inputs: { unet_name: 'wan.safetensors' } } }),
    ).toBe('wan.safetensors')
  })
})

/** A save fed by a detector group (#356); without it, node 9 falls back to node 8. */
const withDetector: ApiWorkflow = {
  ...api,
  '9': {
    class_type: 'ImageCompositeMasked',
    inputs: { destination: ['8', 0], mask: ['21', 0] },
    _meta: { fallback: { mask: ['8', 1] } },
  },
  '20': {
    class_type: 'DetectorLoader',
    inputs: { model: 'det-large' },
    _meta: { optional: 'detector' },
  },
  '21': {
    class_type: 'DetectorRun',
    inputs: { model: ['20', 0], image: ['8', 0] },
    _meta: { optional: 'detector' },
  },
  '22': { class_type: 'VAEDecode', inputs: {}, _meta: { optional: 'detector' } },
}

describe('optional node groups (#356)', () => {
  it('keeps optional-only classes out of the required list', () => {
    expect(requiredNodes(withDetector)).toEqual([
      'CheckpointLoaderSimple',
      'ImageCompositeMasked',
      'SaveImage',
      'VAEDecode',
    ])
    // VAEDecode is also used outside the group, so only the detector classes are optional.
    expect(optionalNodes(withDetector)).toEqual(['DetectorLoader', 'DetectorRun'])
    expect(optionalGroups(withDetector)).toEqual(new Map([['detector', ['20', '21', '22']]]))
    expect(optionalNodes(api)).toEqual([])
  })

  it('leaves a group out and wires the fallback in its place', () => {
    const out = withoutGroups(withDetector, ['detector'])
    expect(Object.keys(out).sort()).toEqual(['10', '4', '8', '9'])
    expect(out['9']!.inputs.mask).toEqual(['8', 1])
    // The input is not changed in place.
    expect(withDetector['9']!.inputs.mask).toEqual(['21', 0])
  })

  it('keeps the workflow as is when no group is left out', () => {
    expect(withoutGroups(withDetector, [])).toBe(withDetector)
  })

  it('refuses to leave out a group a node links to without a fallback', () => {
    const noFallback = { ...withDetector, '9': { ...withDetector['9']!, _meta: {} } }
    expect(() => withoutGroups(noFallback, ['detector'])).toThrow(/names no fallback/)
  })

  it('parses _meta.optional and _meta.fallback from workflow files', () => {
    expect(parseApiWorkflow(JSON.stringify(withDetector))['9']!._meta?.fallback).toEqual({
      mask: ['8', 1],
    })
  })
})
