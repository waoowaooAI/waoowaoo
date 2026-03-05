/**
 * 🔧 环境配置工具
 * 集中管理环境变量的获取，避免到处重复
 */

/**
 * 获取应用 baseUrl
 * 用于内部 API 调用、webhook 回调等场景
 */
export function getBaseUrl(): string {
    return process.env.NEXTAUTH_URL || 'http://localhost:3533'
}

/**
 * 获取完整的 API URL
 * @param path API 路径，如 '/api/user/balance'
 */
export function getApiUrl(path: string): string {
    const baseUrl = getBaseUrl()
    // 确保 path 以 / 开头
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${baseUrl}${normalizedPath}`
}
