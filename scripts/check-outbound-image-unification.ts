import fs from 'node:fs'
import path from 'node:path'

type Rule = {
  file: string
  pattern: RegExp
  message: string
}

function readFile(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath)
  return fs.readFileSync(fullPath, 'utf8')
}

const mustIncludeRules: Rule[] = [
  {
    file: 'src/lib/media/outbound-image.ts',
    pattern: /export\s+async\s+function\s+normalizeToOriginalMediaUrl\s*\(/,
    message: 'missing normalizeToOriginalMediaUrl export',
  },
  {
    file: 'src/lib/media/outbound-image.ts',
    pattern: /export\s+async\s+function\s+normalizeToBase64ForGeneration\s*\(/,
    message: 'missing normalizeToBase64ForGeneration export',
  },
  {
    file: 'src/lib/media/outbound-image.ts',
    pattern: /export\s+async\s+function\s+normalizeReferenceImagesForGeneration\s*\(/,
    message: 'missing normalizeReferenceImagesForGeneration export',
  },
  {
    file: 'src/lib/media/outbound-image.ts',
    pattern: /class\s+OutboundImageNormalizeError\s+extends\s+Error/,
    message: 'outbound-image.ts must expose structured normalize error type',
  },
  {
    file: 'src/lib/media/outbound-image.ts',
    pattern: /OUTBOUND_IMAGE_FETCH_FAILED/,
    message: 'outbound-image.ts must classify fetch failures with structured error codes',
  },
  {
    file: 'src/lib/media/outbound-image.ts',
    pattern: /OUTBOUND_IMAGE_REFERENCE_ALL_FAILED/,
    message: 'outbound-image.ts must fail explicitly when all references fail to normalize',
  },
  {
    file: 'src/lib/cos.ts',
    pattern: /import\s+\{\s*normalizeToBase64ForGeneration\s*\}\s+from\s+'@\/lib\/media\/outbound-image'/,
    message: 'cos.ts must import normalizeToBase64ForGeneration',
  },
  {
    file: 'src/lib/cos.ts',
    pattern: /return\s+await\s+normalizeToBase64ForGeneration\(keyOrUrl\)/,
    message: 'imageUrlToBase64 must delegate to normalizeToBase64ForGeneration',
  },
  {
    file: 'src/lib/workers/handlers/image-task-handlers-core.ts',
    pattern: /normalizeToBase64ForGeneration\(currentUrl\)/,
    message: 'image-task-handlers-core.ts must convert currentUrl to base64 before outbound',
  },
  {
    file: 'src/lib/workers/handlers/image-task-handlers-core.ts',
    pattern: /normalizeReferenceImagesForGeneration\(extraReferenceInputs\)/,
    message: 'image-task-handlers-core.ts must normalize extra references before outbound',
  },
  {
    file: 'src/lib/workers/video.worker.ts',
    pattern: /const\s+sourceImageBase64\s*=\s*await\s+normalizeToBase64ForGeneration\(sourceImageUrl\)/,
    message: 'video.worker.ts must normalize source frame to base64',
  },
  {
    file: 'src/lib/workers/video.worker.ts',
    pattern: /lastFrameImageBase64\s*=\s*await\s+normalizeToBase64ForGeneration\(lastFrameUrl\)/,
    message: 'video.worker.ts must normalize last frame to base64',
  },
  {
    file: 'src/app/api/novel-promotion/[projectId]/modify-asset-image/route.ts',
    pattern: /sanitizeImageInputsForTaskPayload/,
    message: 'modify-asset-image route must sanitize image inputs',
  },
  {
    file: 'src/app/api/novel-promotion/[projectId]/modify-storyboard-image/route.ts',
    pattern: /sanitizeImageInputsForTaskPayload/,
    message: 'modify-storyboard-image route must sanitize image inputs',
  },
  {
    file: 'src/app/api/asset-hub/modify-image/route.ts',
    pattern: /sanitizeImageInputsForTaskPayload/,
    message: 'asset-hub modify-image route must sanitize image inputs',
  },
  {
    file: 'src/components/ui/ImagePreviewModal.tsx',
    pattern: /import\s+\{\s*resolveOriginalImageUrl,\s*toDisplayImageUrl\s*\}\s+from\s+'@\/lib\/media\/image-url'/,
    message: 'ImagePreviewModal must use shared image-url helpers',
  },
  {
    file: 'src/lib/novel-promotion/stages/video-stage-runtime-core.tsx',
    pattern: /onPreviewImage=\{setPreviewImage\}/,
    message: 'Video stage runtime must wire preview callback to VideoPanelCard',
  },
  {
    file: 'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/types.ts',
    pattern: /onPreviewImage\?:\s*\(imageUrl:\s*string\)\s*=>\s*void/,
    message: 'VideoPanelCard runtime props must expose onPreviewImage',
  },
  {
    file: 'src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video/panel-card/VideoPanelCardHeader.tsx',
    pattern: /className="absolute left-1\/2 top-1\/2 z-10 h-16 w-16 -translate-x-1\/2 -translate-y-1\/2 rounded-full"/,
    message: 'VideoPanelCard play trigger must be centered small button (preview/play separation)',
  },
]

const mustNotIncludeRules: Rule[] = [
  {
    file: 'src/lib/workers/handlers/image-task-handlers-core.ts',
    pattern: /referenceImages:\s*\[currentUrl\]/,
    message: 'image-task-handlers-core.ts must not pass raw currentUrl directly as outbound reference',
  },
  {
    file: 'src/lib/workers/video.worker.ts',
    pattern: /imageUrl:\s*sourceImageUrl/,
    message: 'video.worker.ts must not pass raw sourceImageUrl to generator',
  },
  {
    file: 'src/lib/media/outbound-image.ts',
    pattern: /return\s+await\s+toFetchableAbsoluteUrl\(mediaPath\)/,
    message: 'outbound-image.ts must not silently fallback when /m route cannot resolve storage key',
  },
  {
    file: 'src/lib/media/outbound-image.ts',
    pattern: /return\s+await\s+toFetchableAbsoluteUrl\(unwrappedInput\)/,
    message: 'outbound-image.ts must not silently fallback unknown inputs to fetchable url',
  },
]

function main() {
  const errors: string[] = []
  const cache = new Map<string, string>()

  const getContent = (file: string) => {
    if (!cache.has(file)) cache.set(file, readFile(file))
    return cache.get(file) as string
  }

  for (const rule of mustIncludeRules) {
    const content = getContent(rule.file)
    if (!rule.pattern.test(content)) {
      errors.push(`${rule.file}: ${rule.message}`)
    }
  }

  for (const rule of mustNotIncludeRules) {
    const content = getContent(rule.file)
    if (rule.pattern.test(content)) {
      errors.push(`${rule.file}: ${rule.message}`)
    }
  }

  if (errors.length > 0) {
    process.stderr.write('[check:outbound-image-unification] found violations:\n')
    for (const error of errors) {
      process.stderr.write(`- ${error}\n`)
    }
    process.exit(1)
  }

  process.stdout.write(
    `[check:outbound-image-unification] ok include_checks=${mustIncludeRules.length} exclude_checks=${mustNotIncludeRules.length}\n`,
  )
}

main()
