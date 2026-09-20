import { ClaudeAuthError } from './claude-auth';

/**
 * Regex pattern to detect authentication errors from the classifier backend.
 * Matches realistic phrasings like "Please authenticate", "Invalid API key",
 * "401 Unauthorized", etc. This is a heuristic over error text because the
 * OpenAI-compatible chat-completions endpoint gives no structured auth signal,
 * so it errs toward catching auth failures (false positives matter less than
 * false negatives).
 */
const AUTH_ERROR_PATTERN = /authenticate|authentication|unauthenticated|unauthorized|not logged in|log in|login|credential|expired|invalid api key|401|403/i;

export interface RunClassifierOptions {
	/** Wall-clock budget for the whole request, in milliseconds. */
	timeoutMs?: number;
}

interface ChatCompletionResponse {
	choices?: { message?: { content?: string } }[];
	error?: { message?: string };
}

/**
 * The classifier transport: one OpenAI-compatible chat-completions POST per
 * batch, returning the model's text result.
 *
 * The request carries no tools at all, so there is nothing for an injected
 * instruction in scraped page content to invoke — isolation is structural
 * (there are no tool calls to refuse), not a CLI flag. Auth comes from the
 * host environment (CLASSIFIER_API_KEY), never from the repo. An expired or
 * missing credential is raised as ClaudeAuthError because the remedy is a
 * human fixing the key, which is a different operational response to a source
 * failing.
 */
export async function runClassifier(
	prompt: string,
	options: RunClassifierOptions = {},
): Promise<string> {
	const baseUrl = process.env.CLASSIFIER_BASE_URL;
	const apiKey = process.env.CLASSIFIER_API_KEY;
	const model = process.env.CLASSIFIER_MODEL;
	if (!baseUrl || !apiKey || !model) {
		throw new ClaudeAuthError(
			'CLASSIFIER_BASE_URL, CLASSIFIER_API_KEY and CLASSIFIER_MODEL must be configured for AI classification',
		);
	}

	const timeoutMs = options.timeoutMs ?? 180_000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(new URL('chat/completions', baseUrl), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model,
				messages: [{ role: 'user', content: prompt }],
			}),
			signal: controller.signal,
		});
		const text = await response.text();
		let parsed: ChatCompletionResponse = {};
		try {
			parsed = JSON.parse(text) as ChatCompletionResponse;
		} catch {
			// Non-JSON body falls through to the status checks below.
		}
		if (parsed.error?.message) {
			const message = parsed.error.message;
			if (AUTH_ERROR_PATTERN.test(message)) throw new ClaudeAuthError(message);
			throw new Error(`classifier reported an error: ${message}`);
		}
		if (response.status === 401 || response.status === 403) {
			throw new ClaudeAuthError(`classifier rejected the credential: HTTP ${response.status}`);
		}
		if (!response.ok) {
			throw new Error(`classifier request failed: HTTP ${response.status} ${text.slice(0, 200)}`);
		}
		const content = parsed.choices?.[0]?.message?.content ?? '';
		if (!content.trim()) {
			throw new Error('classifier returned an empty completion');
		}
		return content;
	} catch (error) {
		if (error instanceof ClaudeAuthError) throw error;
		const message = error instanceof Error ? error.message : String(error);
		if (AUTH_ERROR_PATTERN.test(message)) {
			throw new ClaudeAuthError(message);
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}