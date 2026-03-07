type CompletionResult = {
  text: string
  reasoning?: string
}

const state: { nextText: string; nextReasoning: string } = {
  nextText: '{"ok":true}',
  nextReasoning: '',
}

export function configureFakeLLM(result: CompletionResult) {
  state.nextText = result.text
  state.nextReasoning = result.reasoning || ''
}

export function resetFakeLLM() {
  state.nextText = '{"ok":true}'
  state.nextReasoning = ''
}

export async function fakeChatCompletion() {
  return {
    output_text: state.nextText,
    reasoning: state.nextReasoning,
  }
}
