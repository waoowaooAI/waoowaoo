import { describe, expect, it } from 'vitest'
import { validateOpenAICompatMediaTemplate } from '@/lib/user-api/model-template'

describe('user-api model template schema', () => {
  it('accepts valid async video template', () => {
    const result = validateOpenAICompatMediaTemplate({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        method: 'POST',
        path: '/v2/videos/generations',
        contentType: 'application/json',
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
        },
      },
      status: {
        method: 'GET',
        path: '/v2/videos/generations/{{task_id}}',
      },
      response: {
        taskIdPath: '$.task_id',
        statusPath: '$.status',
        outputUrlPath: '$.video_url',
        errorPath: '$.error.message',
      },
      polling: {
        intervalMs: 3000,
        timeoutMs: 300000,
        doneStates: ['succeeded'],
        failStates: ['failed'],
      },
    })

    expect(result.ok).toBe(true)
    expect(result.template?.mode).toBe('async')
  })

  it('rejects unsupported placeholders', () => {
    const result = validateOpenAICompatMediaTemplate({
      version: 1,
      mediaType: 'image',
      mode: 'sync',
      create: {
        method: 'POST',
        path: '/images/generations',
        contentType: 'application/json',
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt_text}}',
        },
      },
      response: {
        outputUrlPath: '$.data[0].url',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.field.includes('bodyTemplate.prompt'))).toBe(true)
  })

  it('rejects async template missing polling/status fields', () => {
    const result = validateOpenAICompatMediaTemplate({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        method: 'POST',
        path: '/videos',
        contentType: 'application/json',
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
        },
      },
      response: {
        taskIdPath: '$.id',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['status']))
  })

  it('rejects async create endpoint without bodyTemplate for POST', () => {
    const result = validateOpenAICompatMediaTemplate({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        method: 'POST',
        path: '/v1/video/create',
      },
      status: {
        method: 'GET',
        path: '/v1/video/query?id={{task_id}}',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['create.bodyTemplate']))
  })

  it('rejects async status path without task_id placeholder', () => {
    const result = validateOpenAICompatMediaTemplate({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        method: 'POST',
        path: '/v1/video/create',
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
        },
      },
      status: {
        method: 'GET',
        path: '/v1/video/query',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['status.path']))
  })

  it('rejects async template when response paths or polling are omitted', () => {
    const result = validateOpenAICompatMediaTemplate({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        method: 'POST',
        path: '/v1/video/create',
        contentType: 'application/json',
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
        },
      },
      status: {
        method: 'GET',
        path: '/v1/video/query?id={{task_id}}',
      },
    })

    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining([
      'response.taskIdPath',
      'response.statusPath',
      'polling',
    ]))
  })

  it('accepts multipart file field declarations for media templates', () => {
    const result = validateOpenAICompatMediaTemplate({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        method: 'POST',
        path: '/videos',
        contentType: 'multipart/form-data',
        multipartFileFields: ['input_reference'],
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          input_reference: '{{image}}',
        },
      },
      status: {
        method: 'GET',
        path: '/videos/{{task_id}}',
      },
      content: {
        method: 'GET',
        path: '/videos/{{task_id}}/content',
      },
      response: {
        taskIdPath: '$.id',
        statusPath: '$.status',
      },
      polling: {
        intervalMs: 5000,
        timeoutMs: 600000,
        doneStates: ['completed'],
        failStates: ['failed'],
      },
    })

    expect(result.ok).toBe(true)
    expect(result.template?.create.multipartFileFields).toEqual(['input_reference'])
  })

  it('rejects multipart file fields that are not present in bodyTemplate', () => {
    const result = validateOpenAICompatMediaTemplate({
      version: 1,
      mediaType: 'video',
      mode: 'async',
      create: {
        method: 'POST',
        path: '/videos',
        contentType: 'multipart/form-data',
        multipartFileFields: ['input_reference'],
        bodyTemplate: {
          model: '{{model}}',
          prompt: '{{prompt}}',
        },
      },
      status: {
        method: 'GET',
        path: '/videos/{{task_id}}',
      },
      response: {
        taskIdPath: '$.id',
        statusPath: '$.status',
      },
      polling: {
        intervalMs: 5000,
        timeoutMs: 600000,
        doneStates: ['completed'],
        failStates: ['failed'],
      },
    })

    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.field === 'create.multipartFileFields')).toBe(true)
  })
})
