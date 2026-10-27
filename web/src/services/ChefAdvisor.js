// Fixed, documented model IDs; no per-calculation model discovery.
export const CHEF_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
export const CHEF_TOTAL_MS = 20000;
export const CHEF_REQUEST_MS = 12000;

export function chefFailure(code) {
    return Object.assign(new Error('AI 精算未完成'), { code });
}

// Whitelist-only, console-only telemetry: never log prompts, results, keys or raw errors.
export function logChefTiming(metrics) {
    console.info('[FK Chef timing]', metrics);
}

export async function requestChef({ apiKey, prompt, signal, deadline }) {
    let lastError = chefFailure('timeout');
    for (const [index, model] of CHEF_MODELS.entries()) {
        if (signal.aborted) throw chefFailure('cancelled');
        const remaining = deadline - performance.now();
        if (remaining <= 0) throw chefFailure('timeout');
        const started = performance.now();
        const controller = new AbortController();
        let timer;
        let cancel;
        let status = null;
        let headersMs = null;
        let bodyMs = null;
        let outcome = 'ok';
        try {
            // Race covers fetch AND response body, even if a transport ignores abort.
            const stopped = new Promise((_, reject) => {
                cancel = () => {
                    controller.abort();
                    reject(chefFailure('cancelled'));
                };
                signal.addEventListener('abort', cancel, { once: true });
                timer = setTimeout(() => {
                    controller.abort();
                    reject(chefFailure('timeout'));
                }, Math.min(CHEF_REQUEST_MS, remaining));
            });
            const data = await Promise.race([stopped, (async () => {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    signal: controller.signal,
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            thinkingConfig: { thinkingLevel: 'LOW' },
                            maxOutputTokens: 4096
                        }
                    })
                });
                headersMs = Math.round(performance.now() - started);
                status = response.status;
                if (!response.ok) throw chefFailure(String(status));
                const result = await response.json();
                bodyMs = Math.round(performance.now() - started) - headersMs;
                return result;
            })()]);
            if (signal.aborted) throw chefFailure('cancelled');
            if (performance.now() >= deadline) throw chefFailure('timeout');
            const candidate = data.candidates?.[0];
            if (candidate?.finishReason !== 'STOP') throw chefFailure('invalid');
            const raw = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('');
            const parseStarted = performance.now();
            let result;
            try { result = JSON.parse(raw); } catch { throw chefFailure('invalid'); }
            logChefTiming({ phase: 'parse', durationMs: Math.round(performance.now() - parseStarted) });
            return result;
        } catch (error) {
            lastError = error.code ? error : chefFailure('network');
            outcome = lastError.code;
            // 429 stops immediately; 400/auth/config and malformed responses also stop.
            if (!['404', '503', 'timeout', 'network'].includes(lastError.code)) throw lastError;
        } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', cancel);
            controller.abort();
            logChefTiming({ phase: 'request', model, fallback: index > 0, status,
                durationMs: Math.round(performance.now() - started), headersMs, bodyMs, outcome });
        }
    }
    throw lastError;
}

export function validateChefResult(result, expected, engine) {
    if (!result || typeof result.chefComment !== 'string' || result.chefComment.length > 2000 ||
        !result.portions || typeof result.portions !== 'object' || Array.isArray(result.portions) ||
        Object.keys(result.portions).sort().join('|') !== Object.keys(expected).sort().join('|')) {
        throw chefFailure('invalid');
    }
    for (const [member, originals] of Object.entries(expected)) {
        const items = result.portions[member];
        if (!Array.isArray(items) || items.length !== originals.length) throw chefFailure('invalid');
        const seen = new Set();
        for (const item of items) {
            const original = originals.find(i => i.id === item?.id);
            const ing = original && engine.getIngredientById(original.id);
            if (!ing || seen.has(item.id) || !Number.isFinite(item.amount) || item.amount < 0 ||
                item.unit !== original.unit || item.amount > (ing.isCount || ing.perUnit ? 20 : 1000)) {
                throw chefFailure('invalid');
            }
            seen.add(item.id);
        }
        // Nutrition always comes from FK's canonical data, never AI-supplied totals.
        const totals = engine.calculateNutritionForMember(items, member);
        if (Object.values(totals).some(n => !Number.isFinite(n) || n < 0)) throw chefFailure('invalid');
    }
    return result;
}
