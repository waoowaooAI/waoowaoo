import { NextResponse } from 'next/server'
import { vi } from 'vitest'

type SessionUser = {
  id: string
  name?: string | null
  email?: string | null
}

type SessionPayload = {
  user: SessionUser
}

type MockAuthState = {
  session: SessionPayload | null
  projectAuthMode: 'allow' | 'forbidden' | 'not_found'
}

const defaultSession: SessionPayload = {
  user: {
    id: 'test-user-id',
    name: 'test-user',
    email: 'test@example.com',
  },
}

let state: MockAuthState = {
  session: defaultSession,
  projectAuthMode: 'allow',
}

function unauthorizedResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      },
    },
    { status: 401 },
  )
}

function forbiddenResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Forbidden',
      },
    },
    { status: 403 },
  )
}

function notFoundResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Project not found',
      },
    },
    { status: 404 },
  )
}

export function installAuthMocks() {
  vi.doMock('@/lib/api-auth', () => ({
    isErrorResponse: (value: unknown) => value instanceof NextResponse,
    requireUserAuth: async () => {
      if (!state.session) return unauthorizedResponse()
      return { session: state.session }
    },
    requireProjectAuth: async (projectId: string) => {
      if (!state.session) return unauthorizedResponse()
      if (state.projectAuthMode === 'forbidden') return forbiddenResponse()
      if (state.projectAuthMode === 'not_found') return notFoundResponse()
      return {
        session: state.session,
        project: { id: projectId, userId: state.session.user.id, name: 'project' },
        novelData: { id: 'novel-data-id' },
      }
    },
    requireProjectAuthLight: async (projectId: string) => {
      if (!state.session) return unauthorizedResponse()
      if (state.projectAuthMode === 'forbidden') return forbiddenResponse()
      if (state.projectAuthMode === 'not_found') return notFoundResponse()
      return {
        session: state.session,
        project: { id: projectId, userId: state.session.user.id, name: 'project' },
      }
    },
  }))
}

export function mockAuthenticated(userId: string) {
  state = {
    ...state,
    session: {
      user: {
        ...defaultSession.user,
        id: userId,
      },
    },
  }
}

export function mockUnauthenticated() {
  state = {
    ...state,
    session: null,
  }
}

export function mockProjectAuth(mode: 'allow' | 'forbidden' | 'not_found') {
  state = {
    ...state,
    projectAuthMode: mode,
  }
}

export function resetAuthMockState() {
  state = {
    session: defaultSession,
    projectAuthMode: 'allow',
  }
  vi.doUnmock('@/lib/api-auth')
}
