/**
 * AI-generated welcome text with fallback templates
 */

const config = require('../config');
const { buildWelcomeTextKey } = require('../utils/keys');
const { normalizeWelcomeText } = require('../utils/validation');
const { withTimeout } = require('../utils/time');

function parseLastInterest(raw) {
	if (!raw) return undefined;
	if (typeof raw === 'object') {
		const productId = typeof raw.productId === 'string' ? raw.productId.trim() : '';
		if (!productId) return undefined;
		return {
			productId,
			offerId: typeof raw.offerId === 'string' ? raw.offerId.trim() : undefined,
			offerTitle: typeof raw.offerTitle === 'string' ? raw.offerTitle.trim() : undefined,
			offerSubtitle: typeof raw.offerSubtitle === 'string' ? raw.offerSubtitle.trim() : undefined,
		};
	}

	const text = String(raw).trim();
	if (!text) return undefined;
	if (text.startsWith('{')) {
		try {
			const parsed = JSON.parse(text);
			return parseLastInterest(parsed);
		} catch {
			// fall through to legacy string format
		}
	}

	// legacy format: productId only
	return { productId: text };
}

function buildLastInterestPromptSuffix(lastInterest) {
	const title = typeof lastInterest?.offerTitle === 'string' ? lastInterest.offerTitle.trim() : '';
	const subtitle = typeof lastInterest?.offerSubtitle === 'string' ? lastInterest.offerSubtitle.trim() : '';
	if (title && subtitle) return ` (${title} – ${subtitle})`;
	if (title) return ` (${title})`;
	if (subtitle) return ` (${subtitle})`;
	return '';
}

function getInterestDisplayName(productId) {
	const id = String(productId || '').trim().toLowerCase();
	if (!id) return undefined;
	const map = {
		travel: 'Reisen',
		dsl: 'Internet',
		insurance: 'Versicherung',
	};
	return map[id] || id.toUpperCase();
}

function getTopInterestsFromAffinities(affinities, limit) {
	const entries = Object.entries(affinities || {})
		.map(([productId, rawScore]) => {
			const score = Number.parseFloat(String(rawScore));
			return { productId, score: Number.isFinite(score) ? score : 0 };
		})
		.filter((x) => x.score > 0);

	entries.sort((a, b) => b.score - a.score);
	const capped = entries.slice(0, Math.max(1, limit || 2));
	return capped
		.map((x) => ({ productId: x.productId, score: x.score, label: getInterestDisplayName(x.productId) }))
		.filter((x) => Boolean(x.label));
}

function getSingleInterest(affinities, lastInterestRaw) {
	const lastInterest = parseLastInterest(lastInterestRaw);
	const lastProductId = String(lastInterest?.productId || '').trim();
	if (lastProductId) {
		const label = getInterestDisplayName(lastProductId);
		if (label) return [{ productId: lastProductId, score: 1, label }];
	}
	return getTopInterestsFromAffinities(affinities, 1);
}

function buildFallbackWelcomeText(interests) {
	const top = interests?.[0]?.label;
	if (!top) {
		const genericVariants = [
			'Schön, dass du da bist! Heute ist ein guter Tag für neue Entdeckungen. 🎯',
			'Willkommen zurück! Bereit für frische Inspirationen?',
			'Hey! Lass uns gemeinsam die besten Deals finden.',
			'Perfektes Timing! Dein persönlicher Feed wartet auf dich.',
			'Na, auf der Suche nach dem perfekten Angebot? Du bist hier richtig!',
			'Willkommen! Heute haben wir ein paar Überraschungen für dich parat.',
			'Schön, dich zu sehen! Stöber durch deine persönlichen Highlights.',
		];
		return genericVariants[Math.floor(Math.random() * genericVariants.length)];
	}

	const variants = [
		`Willkommen zurück! Lust auf frische ${top}-Highlights?`,
		`Hey! Wir haben spannende ${top}-Ideen für dich.`,
		`Schön, dich zu sehen – wie wär's mit ${top}?`,
		`Willkommen! Dein ${top}-Feed ist heute besonders interessant.`,
		`Perfekt! Genau der richtige Moment für ${top}-Inspirationen.`,
		`Na, bereit für neue ${top}-Entdeckungen? Los geht's!`,
	];
	return variants[Math.floor(Math.random() * variants.length)];
}

async function generateWelcomeTextWithLlm(interestLabel) {
	if (!config.llm.apiKey) return '';
	const label = String(interestLabel || '').trim();
	if (!label) return '';

	const prompt = {
		model: config.llm.model,
		messages: [
			{
				role: 'system',
				content:
					'Du bist ein Copywriter für eine CHECK24-ähnliche Home-Seite. Antworte auf Deutsch in 1 kurzen Satz (max 140 Zeichen), ohne Emojis, ohne Anführungszeichen, ohne Markdown. Ton: cool, lässig, nicht überwachend. Keine Hinweise auf Tracking (kein „wir haben bemerkt“). Keine Zahlen. Wenn dir ein konkreter Ort/Begriff fehlt: nichts erfinden. Wenn ein Angebotstitel/Untertitel mitgegeben ist: wörtlich verwenden (nicht umformulieren) oder weglassen.\n\nWICHTIG: Halte dich EXTREM eng an die Beispiele (Struktur, Rhythmus, Wortwahl). Der Stil ist wichtiger als Originalität. Das Paris-Beispiel ist der Goldstandard – genau so smart und knapp.\n\nForm-Regel: Nutze genau EINES dieser Muster: "Kurzer Reality-Check: …", "Fun Fact: …", "X – Y" oder "Du bist …". Keine zweite Zeile.',
			},
			{ role: 'user', content: 'Interessen: Reisen (Paris)' },
			{
				role: 'assistant',
				content: 'Kurzer Reality-Check: Paris hat 20 Arrondissements – du brauchst nur eins: das mit dem besten Deal.',
			},
			{ role: 'user', content: 'Interessen: Reisen (Paris)' },
			{ role: 'assistant', content: 'Du bist einen Klick von Bonjour entfernt.' },
			{ role: 'user', content: 'Interessen: Reisen (Mallorca)' },
			{
				role: 'assistant',
				content: 'Fun Fact: Die Serra de Tramuntana ist UNESCO-Welterbe – dein Blick sagt: hin da.',
			},
			{ role: 'user', content: 'Interessen: Reisen (Mallorca)' },
			{ role: 'assistant', content: 'Mallorca kurz, Wirkung groß: Ich zeig dir die stärksten Angebote zuerst.' },
			{ role: 'user', content: 'Interessen: Internet (DSL)' },
			{ role: 'assistant', content: 'Dein WLAN wirkt wie im Museum? Ich bring dich zurück ins Jahr 2025.' },
			{ role: 'user', content: 'Interessen: Internet (DSL)' },
			{ role: 'assistant', content: 'Ping ist das neue Geduld – ich hol dir bessere Werte.' },
			{ role: 'user', content: 'Interessen: Versicherung' },
			{ role: 'assistant', content: 'Man klickt Versicherung nicht aus Spaß – gut so.' },
			{ role: 'user', content: 'Interessen: Versicherung' },
			{
				role: 'assistant',
				content: 'Fun Fact: Viele Schäden sind Kleinkram – teuer wird es, wenn die Absicherung nicht passt.',
			},
			{
				role: 'user',
				content: `Letztes Interesse: ${label}. Schreibe einen Willkommenstext NUR zu diesem Bereich. Keine anderen Bereiche erwähnen.`,
			},
		],
		temperature: 0.4,
		top_p: 0.7,
	};

	const headers = {
		'content-type': 'application/json',
		authorization: `Bearer ${config.llm.apiKey}`,
	};
	if (config.llm.openRouterApiKey && config.llm.siteUrl) {
		headers['HTTP-Referer'] = config.llm.siteUrl;
	}
	if (config.llm.openRouterApiKey && config.llm.appName) {
		headers['X-Title'] = config.llm.appName;
	}

	const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
		method: 'POST',
		headers,
		body: JSON.stringify(prompt),
	});

	if (!response.ok) {
		const bodyText = await response.text().catch(() => '');
		throw new Error(`LLM failed: ${response.status}${bodyText ? ` - ${bodyText}` : ''}`);
	}

	const data = await response.json();
	const text = data?.choices?.[0]?.message?.content;
	return normalizeWelcomeText(text);
}

async function getOrGenerateWelcomeText(redis, request, userId, affinities, lastInterestRaw, skipCache = false) {
	const cacheKey = buildWelcomeTextKey(userId);

	// Try cache first
	if (!skipCache) {
		try {
			const cached = await redis.get(cacheKey);
			if (cached) return cached;
		} catch (error) {
			request.log.warn({ error: error?.message }, 'Welcome text cache read failed');
		}
	}

	const interests = getSingleInterest(affinities, lastInterestRaw);
	const lastInterest = parseLastInterest(lastInterestRaw);
	const promptSuffix = buildLastInterestPromptSuffix(lastInterest);
	let text = '';

	// Try LLM generation
	try {
		const labelForPrompt = `${interests?.[0]?.label || ''}${promptSuffix}`.trim();
		text = await withTimeout(generateWelcomeTextWithLlm(labelForPrompt), config.llm.timeoutMs, 'welcomeText.llm');
	} catch (error) {
		request.log.warn({ error: error?.message }, 'Welcome text LLM generation failed; falling back');
	}

	// Fallback to template
	if (!text) {
		text = buildFallbackWelcomeText(interests);
	}

	// Cache the result
	if (text) {
		try {
			await redis.set(cacheKey, text, { EX: config.llm.ttlSeconds });
		} catch (error) {
			request.log.warn({ error: error?.message }, 'Welcome text cache write failed');
		}
	}

	return text;
}

module.exports = {
	getOrGenerateWelcomeText,
};
