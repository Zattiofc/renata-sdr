// Shared AI client for calling external AI providers (OpenAI, Google Gemini, Anthropic)

export interface AIClientConfig {
  provider: 'openai' | 'google' | 'anthropic';
  apiKey: string;
  model: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | any[];
}

export interface AIRequestOptions {
  messages: AIMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: any;
  stream?: boolean;
}

const PROVIDER_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
};

export async function callAI(
  config: AIClientConfig,
  options: AIRequestOptions,
  signal?: AbortSignal
): Promise<Response> {
  const { provider, apiKey, model } = config;

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, options, signal);
  }

  // OpenAI and Google Gemini use the same OpenAI-compatible format
  const url = PROVIDER_URLS[provider] || PROVIDER_URLS.openai;
  
  const useMaxCompletionTokens = provider === 'openai';
  
  const body: any = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    stream: options.stream ?? false,
  };

  if (useMaxCompletionTokens) {
    body.max_completion_tokens = options.max_tokens ?? 1000;
  } else {
    body.max_tokens = options.max_tokens ?? 1000;
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.tool_choice ?? 'auto';
  }

  return fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function callAnthropic(
  apiKey: string,
  model: string,
  options: AIRequestOptions,
  signal?: AbortSignal
): Promise<Response> {
  // Convert OpenAI-style messages to Anthropic format
  const systemMessage = options.messages.find(m => m.role === 'system');
  const nonSystemMessages = options.messages.filter(m => m.role !== 'system');

  const anthropicMessages = nonSystemMessages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));

  const body: any = {
    model,
    max_tokens: options.max_tokens ?? 1000,
    messages: anthropicMessages,
  };

  if (systemMessage) {
    body.system = typeof systemMessage.content === 'string' 
      ? systemMessage.content 
      : JSON.stringify(systemMessage.content);
  }

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  // Convert OpenAI tools to Anthropic tools format
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  // Convert Anthropic response to OpenAI-compatible format
  if (!response.ok) {
    return response;
  }

  const data = await response.json();
  
  // Map Anthropic response to OpenAI format
  const textBlocks = data.content?.filter((b: any) => b.type === 'text') || [];
  const toolUseBlocks = data.content?.filter((b: any) => b.type === 'tool_use') || [];
  
  const openaiMessage: any = {
    role: 'assistant',
    content: textBlocks.map((b: any) => b.text).join('') || null,
  };

  if (toolUseBlocks.length > 0) {
    openaiMessage.tool_calls = toolUseBlocks.map((b: any) => ({
      id: b.id,
      type: 'function',
      function: {
        name: b.name,
        arguments: JSON.stringify(b.input),
      },
    }));
  }

  const openaiResponse = {
    choices: [{
      message: openaiMessage,
      finish_reason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
    }],
    usage: data.usage,
  };

  return new Response(JSON.stringify(openaiResponse), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Helper to get AI config from nina_settings
export function getAIConfigFromSettings(settings: any): AIClientConfig {
  const provider = settings.ai_provider || 'google';
  const apiKey = settings.ai_api_key || '';
  let model = settings.ai_model_name || '';

  // Fallback model per provider if not set
  if (!model) {
    switch (provider) {
      case 'openai': model = 'gpt-5.4-mini'; break;
      case 'google': model = 'gemini-2.5-flash'; break;
      case 'anthropic': model = 'claude-sonnet-4-6'; break;
      default: model = 'gemini-2.5-flash';
    }
  }

  return { provider, apiKey, model };
}
