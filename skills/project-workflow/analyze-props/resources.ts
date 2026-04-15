export const analyzePropsResources = {
  models: ['analysisModel'],
  promptFiles: [
    'skills/project-workflow/analyze-props/prompts/template.zh.txt',
    'skills/project-workflow/analyze-props/prompts/template.en.txt',
  ],
  loaders: ['episode.novelText', 'project.props'],
  toolAllowlist: ['executeAiTextStep'],
} as const
