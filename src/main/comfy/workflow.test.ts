import { describe, expect, it } from 'vitest'
import {
  detectWorkflowFormat,
  literalInputs,
  missingNodes,
  modelNameOf,
  parseApiWorkflow,
  requiredNodes,
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
