/** 画布订阅写进来的稍后读（shared/feeds-link.ts）：显示链接的字、改标题时链接接回去，别的行不受影响 */
import { describe, expect, it } from 'vitest'
import { feedsSrcOf, isFeedsUrl, withFeedsLink } from '../src/shared/feeds-link'

describe('画布订阅的稍后读', () => {
  it('认出链接：显示「读：标题」，记着链接；没有 canvas-feeds 链接的是 null', () => {
    expect(feedsSrcOf('读：[提示词缓存省下的钱](canvas-feeds://item/a_1b2c)')).toEqual({ title: '读：提示词缓存省下的钱', url: 'canvas-feeds://item/a_1b2c' })
    expect(feedsSrcOf('读：[别的](https://example.test/)')).toBeNull()
    expect(feedsSrcOf('交论文')).toBeNull()
  })
  it('改标题：原来的字还在就原地包回链接；整个换了就整个包成链接', () => {
    const old = '读：[提示词缓存省下的钱](canvas-feeds://item/a_1)'
    expect(withFeedsLink('今晚读：提示词缓存省下的钱', old)).toBe('今晚读：[提示词缓存省下的钱](canvas-feeds://item/a_1)')
    expect(withFeedsLink('缓存那篇', old)).toBe('[缓存那篇](canvas-feeds://item/a_1)')
    expect(withFeedsLink('交论文', '交论文')).toBe('交论文')
  })
  it('只放过画布订阅那一篇的链接', () => {
    expect(isFeedsUrl('canvas-feeds://item/a_1')).toBe(true)
    expect(isFeedsUrl('canvas-feeds://item/a_1?x=1')).toBe(false)
    expect(isFeedsUrl('https://example.test/')).toBe(false)
    expect(isFeedsUrl(3)).toBe(false)
  })
})
