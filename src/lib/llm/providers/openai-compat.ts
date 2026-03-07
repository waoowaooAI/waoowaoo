import OpenAI from 'openai'

export function buildOpenAIChatCompletion(
    modelId: string,
    content: unknown,
    usage?: { promptTokens?: number; completionTokens?: number }
): OpenAI.Chat.Completions.ChatCompletion {
    const messageContent: OpenAI.Chat.Completions.ChatCompletionMessage['content'] =
        typeof content === 'string' || Array.isArray(content)
            ? (content as OpenAI.Chat.Completions.ChatCompletionMessage['content'])
            : String(content ?? '')
    const promptTokens = usage?.promptTokens ?? 0
    const completionTokens = usage?.completionTokens ?? 0
    return {
        id: `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelId,
        choices: [
            {
                index: 0,
                message: { role: 'assistant', content: messageContent },
                finish_reason: 'stop'
            }
        ],
        usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens
        }
    } as OpenAI.Chat.Completions.ChatCompletion
}
