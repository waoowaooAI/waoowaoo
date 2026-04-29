import {
  getUserApiConfig as getUserApiConfigFromService,
  putUserApiConfig as putUserApiConfigFromService,
} from '@/lib/user-api/api-config-service'

export async function getUserApiConfig(userId: string) {
  return getUserApiConfigFromService(userId)
}

export async function putUserApiConfig(userId: string, body: unknown) {
  return putUserApiConfigFromService(userId, body)
}
