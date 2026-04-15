export const splitClipsResources = {
  models: ['analysisModel'],
  promptFiles: [
    'skills/project-workflow/split-clips/prompts/template.zh.txt',
    'skills/project-workflow/split-clips/prompts/template.en.txt',
  ],
  loaders: ['episode.novelText', 'analysis.characters', 'analysis.locations', 'analysis.props'],
  toolAllowlist: ['executeAiTextStep', 'createClipContentMatcher'],
} as const
