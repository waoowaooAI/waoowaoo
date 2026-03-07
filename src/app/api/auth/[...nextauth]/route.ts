import NextAuth from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { checkRateLimit, getClientIp, AUTH_LOGIN_LIMIT } from '@/lib/rate-limit'
import { logAuthAction } from '@/lib/logging/semantic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nextAuthHandler = (NextAuth as any)(authOptions)

/**
 * 登录 POST 请求加 IP 限流保护。
 * 仅对 callback/credentials（即实际登录行为）做限流，
 * 其他 NextAuth 内部路由（session / csrf 等）不限制。
 *
 * ⚠️ NextAuth 客户端 signIn() 期望响应体包含 { url } 字段，
 *    如果返回自定义 JSON 格式会导致 signIn() 内部 new URL(data.url) 抛异常。
 *    因此限流时返回 NextAuth 兼容的格式：{ url: "...?error=RateLimited" }
 */
async function handlePost(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }) {
    const { nextauth: segments } = await ctx.params
    const isCredentialsCallback =
        segments.length >= 2
        && segments[0] === 'callback'
        && segments[1] === 'credentials'

    if (isCredentialsCallback) {
        const ip = getClientIp(req)
        const rateResult = await checkRateLimit('auth:login', ip, AUTH_LOGIN_LIMIT)
        if (rateResult.limited) {
            logAuthAction('LOGIN', 'unknown', { error: 'Rate limited', ip })
            // 返回 NextAuth 兼容的错误格式，signIn() 会解析 URL 中的 error 参数
            const origin = req.nextUrl.origin
            return NextResponse.json(
                { url: `${origin}/auth/signin?error=RateLimited` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateResult.retryAfterSeconds) },
                },
            )
        }
    }

    return nextAuthHandler(req, ctx)
}

function handleGet(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }) {
    return nextAuthHandler(req, ctx)
}

export { handleGet as GET, handlePost as POST }
