import { describe, expect, it } from 'vitest'
import { Color } from 'three/webgpu'
import { emberEdge } from './ember-edge'

describe('emberEdge', () => {
  it('recolours the dissolve front through the colour wire', () => {
    const effect = emberEdge(new Color('#ff8a2a'))
    expect(effect.stages?.color).toBeTypeOf('function')
  })
})
