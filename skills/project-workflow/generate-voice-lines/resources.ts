export const generateVoiceLinesResources = {
  models: ['analysisModel'],
  promptFiles: [
    'skills/project-workflow/generate-voice-lines/prompts/template.zh.txt',
    'skills/project-workflow/generate-voice-lines/prompts/template.en.txt',
  ],
  loaders: ['storyboard.panel_set', 'story.raw', 'project.characters'],
  toolAllowlist: ['executeAiTextStep'],
} as const
