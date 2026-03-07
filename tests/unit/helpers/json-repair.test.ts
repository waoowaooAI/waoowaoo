import { describe, expect, it } from 'vitest'
import { safeParseJson, safeParseJsonObject, safeParseJsonArray } from '@/lib/json-repair'

// ─── safeParseJson ───────────────────────────────────────────────────

describe('safeParseJson', () => {
    it('正常 JSON 字符串 -> 直接解析成功', () => {
        const result = safeParseJson('{"name":"孙悟空","age":500}')
        expect(result).toEqual({ name: '孙悟空', age: 500 })
    })

    it('包含 markdown 代码块 -> 剥离后解析成功', () => {
        const input = '```json\n{"key":"value"}\n```'
        const result = safeParseJson(input)
        expect(result).toEqual({ key: 'value' })
    })

    it('包含大写 JSON 标记的 markdown 代码块 -> 剥离后解析成功', () => {
        const input = '```JSON\n{"key":"value"}\n```'
        const result = safeParseJson(input)
        expect(result).toEqual({ key: 'value' })
    })

    it('尾部逗号 -> jsonrepair 修复后解析成功', () => {
        const input = '{"a":1,"b":2,}'
        const result = safeParseJson(input)
        expect(result).toEqual({ a: 1, b: 2 })
    })

    it('单引号包裹字符串 -> jsonrepair 修复后解析成功', () => {
        const input = "{'name':'张三','age':25}"
        const result = safeParseJson(input)
        expect(result).toEqual({ name: '张三', age: 25 })
    })

    it('JSON 前后有多余文字 -> jsonrepair 修复后解析成功', () => {
        const input = '以下是分析结果：\n{"result":"success"}\n以上是所有内容。'
        const result = safeParseJson(input)
        expect(result).toEqual({ result: 'success' })
    })

    it('完全无效内容（无任何 JSON 结构字符）-> jsonrepair 将其视为字符串', () => {
        // jsonrepair 会把纯文本修复为 JSON 字符串
        const result = safeParseJson('这不是JSON')
        expect(result).toBe('这不是JSON')
    })
})

// ─── safeParseJsonObject ─────────────────────────────────────────────

describe('safeParseJsonObject', () => {
    it('正常 JSON 对象 -> 返回对象', () => {
        const result = safeParseJsonObject('{"characters":[],"locations":[]}')
        expect(result).toEqual({ characters: [], locations: [] })
    })

    it('markdown 包裹的 JSON 对象 -> 剥离后返回对象', () => {
        const input = '```json\n{"episodes":[{"number":1}]}\n```'
        const result = safeParseJsonObject(input)
        expect(result).toHaveProperty('episodes')
        expect((result.episodes as unknown[])[0]).toEqual({ number: 1 })
    })

    it('包含中文角引号「」的内容 -> 正常解析保留', () => {
        const input = '{"lines":"孙悟空怒道，「一个冒牌货，也敢拦你孙爷爷的路！」"}'
        const result = safeParseJsonObject(input)
        expect(result.lines).toBe('孙悟空怒道，「一个冒牌货，也敢拦你孙爷爷的路！」')
    })

    it('LLM 输出数组而非对象 -> 抛出 Expected JSON object 错误', () => {
        expect(() => safeParseJsonObject('[1,2,3]')).toThrow('Expected JSON object')
    })

    it('尾部逗号 + markdown 包裹 -> 修复后返回正确对象', () => {
        const input = '```json\n{"a":1,"b":"hello",}\n```'
        const result = safeParseJsonObject(input)
        expect(result).toEqual({ a: 1, b: 'hello' })
    })
})

// ─── safeParseJsonArray ──────────────────────────────────────────────

describe('safeParseJsonArray', () => {
    it('正常 JSON 数组 -> 返回对象数组', () => {
        const input = '[{"id":1,"name":"角色A"},{"id":2,"name":"角色B"}]'
        const result = safeParseJsonArray(input)
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ id: 1, name: '角色A' })
        expect(result[1]).toEqual({ id: 2, name: '角色B' })
    })

    it('对象包裹数组 + fallbackKey -> 提取内部数组', () => {
        const input = '{"clips":[{"id":1},{"id":2}]}'
        const result = safeParseJsonArray(input, 'clips')
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ id: 1 })
    })

    it('对象包裹数组 + 无 fallbackKey -> 自动发现第一个数组字段', () => {
        const input = '{"episodes":[{"number":1},{"number":2}]}'
        const result = safeParseJsonArray(input)
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ number: 1 })
    })

    it('markdown 包裹 + 尾部逗号 -> 修复后返回正确数组', () => {
        const input = '```json\n[{"a":1},{"b":2},]\n```'
        const result = safeParseJsonArray(input)
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ a: 1 })
        expect(result[1]).toEqual({ b: 2 })
    })

    it('过滤非对象元素（数字、字符串等）-> 只保留对象', () => {
        const input = '[{"valid":true}, 42, "string", null, {"also":true}]'
        const result = safeParseJsonArray(input)
        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ valid: true })
        expect(result[1]).toEqual({ also: true })
    })

    it('空数组 -> 返回空数组', () => {
        const result = safeParseJsonArray('[]')
        expect(result).toHaveLength(0)
    })

    it('非数组非对象 -> 抛出错误', () => {
        expect(() => safeParseJsonArray('"just a string"')).toThrow('Expected JSON array')
    })

    it('对象不含数组字段 -> 抛出错误', () => {
        expect(() => safeParseJsonArray('{"key":"value"}')).toThrow('Expected JSON array')
    })
})

// ─── 真实 LLM 畸形输出回归测试 ───────────────────────────────────────

describe('LLM 畸形 JSON 输出回归测试', () => {
    it('中文弯引号嵌套在 JSON 值中 -> jsonrepair 修复成功', () => {
        // 这是导致 "Invalid clip JSON format" 的典型场景
        const llmOutput = '```json\n[{"description":"孙悟空怒道，\\u201c一个冒牌货！\\u201d"}]\n```'
        const result = safeParseJsonArray(llmOutput)
        expect(result).toHaveLength(1)
        expect(result[0].description).toContain('孙悟空')
    })

    it('LLM 输出前后带解释文字 -> 提取并解析 JSON', () => {
        const llmOutput = `好的，以下是分析结果：

{"locations":[{"name":"客厅_白天","summary":"主角居住的客厅"}]}

以上是所有场景分析。`
        const result = safeParseJsonObject(llmOutput)
        expect(result.locations).toBeDefined()
        const locations = result.locations as unknown[]
        expect(locations).toHaveLength(1)
    })

    it('使用「」角引号的台词内容 -> 正确解析不破坏 JSON', () => {
        // 改造后的提示词要求 LLM 用「」替代引号
        const llmOutput = '[{"speaker":"孙悟空","content":"「你竟敢拦我的路！」","emotionStrength":0.4}]'
        const result = safeParseJsonArray(llmOutput)
        expect(result).toHaveLength(1)
        expect(result[0].speaker).toBe('孙悟空')
        expect(result[0].content).toBe('「你竟敢拦我的路！」')
        expect(result[0].emotionStrength).toBe(0.4)
    })

    it('带控制字符的 JSON -> jsonrepair 修复成功', () => {
        // LLM 有时在字符串值中输出真实换行符
        const llmOutput = '{"text":"第一行\\n第二行","count":2}'
        const result = safeParseJsonObject(llmOutput)
        expect(result.text).toBe('第一行\n第二行')
        expect(result.count).toBe(2)
    })

    it('clips 包裹在对象中 -> 正确提取', () => {
        // clips-build 中常见的 LLM 输出格式
        const llmOutput = '{"clips":[{"id":"clip_1","startText":"从前"},{"id":"clip_2","startText":"后来"}]}'
        const result = safeParseJsonArray(llmOutput, 'clips')
        expect(result).toHaveLength(2)
        expect(result[0].id).toBe('clip_1')
        expect(result[1].startText).toBe('后来')
    })
})
