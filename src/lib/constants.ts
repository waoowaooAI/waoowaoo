/**
 * PRIMARY_APPEARANCE_INDEX value for the main character appearance.
 * All logic that checks main vs. sub appearance MUST reference this constant; hardcoding numbers is forbidden.
 * Sub-appearances start from PRIMARY_APPEARANCE_INDEX + 1 and increment.
 */
export const PRIMARY_APPEARANCE_INDEX = 0

// Aspect ratio configuration (all ratios supported by nanobanana, sorted by usage frequency)
export const ASPECT_RATIO_CONFIGS: Record<string, { label: string; isVertical: boolean }> = {
  '16:9': { label: '16:9', isVertical: false },
  '9:16': { label: '9:16', isVertical: true },
  '1:1': { label: '1:1', isVertical: false },
  '3:2': { label: '3:2', isVertical: false },
  '2:3': { label: '2:3', isVertical: true },
  '4:3': { label: '4:3', isVertical: false },
  '3:4': { label: '3:4', isVertical: true },
  '5:4': { label: '5:4', isVertical: false },
  '4:5': { label: '4:5', isVertical: true },
  '21:9': { label: '21:9', isVertical: false },
}

// Options list for config page (derived from ASPECT_RATIO_CONFIGS)
export const VIDEO_RATIOS = Object.entries(ASPECT_RATIO_CONFIGS).map(([value, config]) => ({
  value,
  label: config.label
}))

// Get aspect ratio config
export function getAspectRatioConfig(ratio: string) {
  return ASPECT_RATIO_CONFIGS[ratio] || ASPECT_RATIO_CONFIGS['16:9']
}

export const ANALYSIS_MODELS = [
  { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' }
]

export const IMAGE_MODELS = [
  { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0' }
]

// Image model options (full image generation)
export const IMAGE_MODEL_OPTIONS = [
  { value: 'banana', label: 'Banana Pro (FAL)' },
  { value: 'banana-2', label: 'Banana 2 (FAL)' },
  { value: 'gemini-3-pro-image-preview', label: 'Banana (Google)' },
  { value: 'gemini-3-pro-image-preview-batch', label: 'Banana (Google Batch) -50%' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0' },
  { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
  { value: 'imagen-4.0-generate-001', label: 'Imagen 4.0 (Google)' },
  { value: 'imagen-4.0-ultra-generate-001', label: 'Imagen 4.0 Ultra' },
  { value: 'imagen-4.0-fast-generate-001', label: 'Imagen 4.0 Fast' }
]

// Banana model resolution options (used only for 9-grid storyboard images; single generation is fixed 2K)
export const BANANA_RESOLUTION_OPTIONS = [
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' }
]

// Supported Banana models
export const BANANA_MODELS = ['banana', 'banana-2', 'gemini-3-pro-image-preview', 'gemini-3-pro-image-preview-batch']

export const VIDEO_MODELS = [
  { value: 'doubao-seedance-1-0-pro-fast-251015', label: 'Seedance 1.0 Pro Fast' },
  { value: 'doubao-seedance-1-0-pro-fast-251015-batch', label: 'Seedance 1.0 Pro Fast (Batch) -50%' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428-batch', label: 'Seedance 1.0 Lite (Batch) -50%' },
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (Batch) -50%' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance 1.0 Pro (Batch) -50%' },
  { value: 'fal-wan25', label: 'Wan 2.6' },
  { value: 'fal-veo31', label: 'Veo 3.1 Fast' },
  { value: 'fal-sora2', label: 'Sora 2' },
  { value: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', label: 'Kling 2.5 Turbo Pro' },
  { value: 'fal-ai/kling-video/v3/standard/image-to-video', label: 'Kling 3 Standard' },
  { value: 'fal-ai/kling-video/v3/pro/image-to-video', label: 'Kling 3 Pro' }
]

// SeeDance batch models (using GPU idle time, 50% cost reduction)
export const SEEDANCE_BATCH_MODELS = [
  'doubao-seedance-1-5-pro-251215-batch',
  'doubao-seedance-1-0-pro-250528-batch',
  'doubao-seedance-1-0-pro-fast-251015-batch',
  'doubao-seedance-1-0-lite-i2v-250428-batch',
]

// Models that support audio generation (only Seedance 1.5 Pro, including batch version)
export const AUDIO_SUPPORTED_MODELS = ['doubao-seedance-1-5-pro-251215', 'doubao-seedance-1-5-pro-251215-batch']

// First-last frame video models (capability source of truth is standards/capabilities; this constant is a static display fallback)
export const FIRST_LAST_FRAME_MODELS = [
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro (F/L Frame)' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (F/L Frame Batch) -50%' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro (F/L Frame)' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance 1.0 Pro (F/L Frame Batch) -50%' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite (F/L Frame)' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428-batch', label: 'Seedance 1.0 Lite (F/L Frame Batch) -50%' },
  { value: 'veo-3.1-generate-preview', label: 'Veo 3.1 (F/L Frame)' },
  { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast (F/L Frame)' }
]

export const VIDEO_RESOLUTIONS = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' }
]

export const TTS_RATES = [
  { value: '+0%', label: '1.0x', labelI18n: { zh: '正常速度 (1.0x)', en: 'Normal (1.0x)', vi: 'Bình thường (1.0x)', ko: '보통 속도 (1.0x)' } },
  { value: '+20%', label: '1.2x', labelI18n: { zh: '轻微加速 (1.2x)', en: 'Slightly faster (1.2x)', vi: 'Hơi nhanh (1.2x)', ko: '약간 빠르게 (1.2x)' } },
  { value: '+50%', label: '1.5x', labelI18n: { zh: '加速 (1.5x)', en: 'Fast (1.5x)', vi: 'Nhanh (1.5x)', ko: '빠르게 (1.5x)' } },
  { value: '+100%', label: '2.0x', labelI18n: { zh: '快速 (2.0x)', en: 'Very fast (2.0x)', vi: 'Rất nhanh (2.0x)', ko: '매우 빠르게 (2.0x)' } }
]

export const TTS_VOICES = [
  { value: 'zh-CN-YunxiNeural', label: 'Yunxi', labelI18n: { zh: '云希 (男声)', en: 'Yunxi (Male)', vi: 'Yunxi (Nam)', ko: 'Yunxi (남성)' }, preview: 'M', previewI18n: { zh: '男', en: 'M', vi: 'Nam', ko: '남' } },
  { value: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao', labelI18n: { zh: '晓晓 (女声)', en: 'Xiaoxiao (Female)', vi: 'Xiaoxiao (Nữ)', ko: 'Xiaoxiao (여성)' }, preview: 'F', previewI18n: { zh: '女', en: 'F', vi: 'Nữ', ko: '여' } },
  { value: 'zh-CN-YunyangNeural', label: 'Yunyang', labelI18n: { zh: '云扬 (男声)', en: 'Yunyang (Male)', vi: 'Yunyang (Nam)', ko: 'Yunyang (남성)' }, preview: 'M', previewI18n: { zh: '男', en: 'M', vi: 'Nam', ko: '남' } },
  { value: 'zh-CN-XiaoyiNeural', label: 'Xiaoyi', labelI18n: { zh: '晓伊 (女声)', en: 'Xiaoyi (Female)', vi: 'Xiaoyi (Nữ)', ko: 'Xiaoyi (여성)' }, preview: 'F', previewI18n: { zh: '女', en: 'F', vi: 'Nữ', ko: '여' } }
]

export const ART_STYLES = [
  {
    value: 'american-comic',
    label: 'Comic',
    labelI18n: { zh: '漫画风', en: 'Comic', vi: 'Truyện tranh', ko: '만화풍' },
    preview: '🎨',
    previewI18n: { zh: '漫', en: '🎨', vi: '🎨', ko: '🎨' },
    promptZh: '日式动漫风格',
    promptEn: 'Japanese anime style'
  },
  {
    value: 'chinese-comic',
    label: 'Premium Comic',
    labelI18n: { zh: '精致国漫', en: 'Premium Comic', vi: 'Truyện tranh cao cấp', ko: '프리미엄 만화' },
    preview: '🏮',
    previewI18n: { zh: '国', en: '🏮', vi: '🏮', ko: '🏮' },
    promptZh: '现代高质量漫画风格，动漫风格，细节丰富精致，线条锐利干净，质感饱满，超清，干净的画面风格，2D风格，动漫风格。',
    promptEn: 'Modern premium Chinese comic style, rich details, clean sharp line art, full texture, ultra-clear 2D anime aesthetics.'
  },
  {
    value: 'japanese-anime',
    label: 'Anime',
    labelI18n: { zh: '日系动漫风', en: 'Anime', vi: 'Anime Nhật', ko: '일본 애니메' },
    preview: '🌸',
    previewI18n: { zh: '日', en: '🌸', vi: '🌸', ko: '🌸' },
    promptZh: '现代日系动漫风格，赛璐璐上色，清晰干净的线条，视觉小说CG感。高质量2D风格',
    promptEn: 'Modern Japanese anime style, cel shading, clean line art, visual-novel CG look, high-quality 2D style.'
  },
  {
    value: 'realistic',
    label: 'Realistic',
    labelI18n: { zh: '真人风格', en: 'Realistic', vi: 'Phong cách thật', ko: '실사풍' },
    preview: '📷',
    previewI18n: { zh: '实', en: '📷', vi: '📷', ko: '📷' },
    promptZh: '真实电影级画面质感，真实现实场景，色彩饱满通透，画面干净精致，真实感',
    promptEn: 'Realistic cinematic look, real-world scene fidelity, rich transparent colors, clean and refined image quality.'
  }
]

/**
 * Get art style prompt from ART_STYLES constants.
 * This is the single source of truth for style prompts, ensuring the latest constant definitions are always used.
 * 
 * @param artStyle - Style identifier, e.g. 'realistic', 'american-comic', etc.
 * @returns The corresponding style prompt; returns empty string if not found.
 */
export function getArtStylePrompt(
  artStyle: string | null | undefined,
  locale: 'zh' | 'en' | 'vi' | 'ko',
): string {
  if (!artStyle) return ''
  const style = ART_STYLES.find(s => s.value === artStyle)
  if (!style) return ''
  return locale === 'en' ? style.promptEn : style.promptZh
}

// 角色形象生成的系统后缀（始终添加到提示词末尾，不显示给用户）- 左侧面部特写+右侧三视图
export const CHARACTER_PROMPT_SUFFIX = '角色设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是角色的正面特写（如果是人类则展示完整正脸，如果是动物/生物则展示最具辨识度的正面形态）；【右侧区域】占约2/3宽度，是角色三视图横向排列（从左到右依次为：正面全身、侧面全身、背面全身），三视图高度一致。纯白色背景，无其他元素。'

// 场景图片生成的系统后缀（已禁用四视图，直接生成单张场景图）
export const LOCATION_PROMPT_SUFFIX = ''

// 角色图片生成比例（16:9横版，左侧面部特写+右侧全身）
export const CHARACTER_IMAGE_RATIO = '16:9'
// 角色图片尺寸（用于Seedream API）
export const CHARACTER_IMAGE_SIZE = '3840x2160'  // 16:9 横版
// 角色图片尺寸（用于Banana API）
export const CHARACTER_IMAGE_BANANA_RATIO = '3:2'

// 场景图片生成比例（1:1 正方形单张场景）
export const LOCATION_IMAGE_RATIO = '1:1'
// 场景图片尺寸（用于Seedream API）- 4K
export const LOCATION_IMAGE_SIZE = '4096x4096'  // 1:1 正方形 4K
// 场景图片尺寸（用于Banana API）
export const LOCATION_IMAGE_BANANA_RATIO = '1:1'

// 从提示词中移除角色系统后缀（用于显示给用户）
export function removeCharacterPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(CHARACTER_PROMPT_SUFFIX, '').trim()
}

// 添加角色系统后缀到提示词（用于生成图片）
export function addCharacterPromptSuffix(prompt: string): string {
  if (!prompt) return CHARACTER_PROMPT_SUFFIX
  const cleanPrompt = removeCharacterPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${CHARACTER_PROMPT_SUFFIX}`
}

// 从提示词中移除场景系统后缀（用于显示给用户）
export function removeLocationPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(LOCATION_PROMPT_SUFFIX, '').replace(/，$/, '').trim()
}

// 添加场景系统后缀到提示词（用于生成图片）
export function addLocationPromptSuffix(prompt: string): string {
  // 后缀为空时直接返回原提示词
  if (!LOCATION_PROMPT_SUFFIX) return prompt || ''
  if (!prompt) return LOCATION_PROMPT_SUFFIX
  const cleanPrompt = removeLocationPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${LOCATION_PROMPT_SUFFIX}`
}

/**
 * 构建角色介绍字符串（用于发送给 AI，帮助理解"我"和称呼对应的角色）
 * @param characters - 角色列表，需要包含 name 和 introduction 字段
 * @returns 格式化的角色介绍字符串
 */
export function buildCharactersIntroduction(characters: Array<{ name: string; introduction?: string | null }>): string {
  if (!characters || characters.length === 0) return '暂无角色介绍'

  const introductions = characters
    .filter(c => c.introduction && c.introduction.trim())
    .map(c => `- ${c.name}：${c.introduction}`)

  if (introductions.length === 0) return '暂无角色介绍'

  return introductions.join('\n')
}
