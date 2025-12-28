const fastify = require('fastify')({ logger: true });
const axios = require('axios');
const crypto = require('crypto');

const coreUrl = (process.env.CORE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ingestApiKey = process.env.INGEST_API_KEY || 'dev-secret-123';
const pushIntervalMs = Number.parseInt(process.env.PUSH_INTERVAL_MS || '5000', 10);

const productId = String(process.env.PRODUCT_ID || 'dsl').trim().toLowerCase();
const productWebUrl = String(process.env.PRODUCT_WEB_URL || '').trim().replace(/\/$/, '');

// Map<email, { totalCount: number, lastOfferId: string, offerCounts: Map<string, number> }>
const clickCounts = new Map();

fastify.register(require('@fastify/cors'), {
  origin: true,
});

const TEMPLATE = {
  priority: 90,
  title: 'Internet 250 Mbit',
  subtitle: '6 Monate gratis',
  color: '#663399',
  cta: 'Vergleichen',
};

function svgDataUrl({ text, width, height, bg = '#eeeeee', fg = '#333333' }) {
  const safeText = String(text || '').replace(/[<>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="${bg}" />
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${fg}" font-family="Arial, sans-serif" font-size="24">${safeText}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildOfferDeeplink(offerId) {
  const id = String(offerId || '123').trim() || '123';
  if (productWebUrl) return `${productWebUrl}/offer/${id}`;
  return `check24://${productId}/offer/${id}`;
}

function incClickCount(email, offerId) {
  const id = String(offerId || '123').trim() || '123';
  const state = clickCounts.get(email) || { totalCount: 0, lastOfferId: id, offerCounts: new Map() };
  state.totalCount = (state.totalCount || 0) + 1;
  state.lastOfferId = id;
  if (!state.offerCounts) state.offerCounts = new Map();
  const nextOffer = (state.offerCounts.get(id) || 0) + 1;
  state.offerCounts.set(id, nextOffer);
  clickCounts.set(email, state);
  return { offerId: id, offerClicks: nextOffer, totalClicks: state.totalCount };
}

async function sendSignal({ userId, weight }) {
  try {
    await axios.post(
      coreUrl + '/api/signals',
      { userId, signal: 'interest', weight },
      {
        headers: {
          'x-product-id': productId.toUpperCase(),
          'x-api-key': ingestApiKey,
        },
        timeout: 2000,
      }
    );
    fastify.log.info({ userId, productId, weight }, '[speedboat] signal sent');
  } catch (error) {
    fastify.log.error({ error: error.message }, '[speedboat] failed to send signal');
  }
}

async function pushWidget({ userId, offerId, offerClicks, totalClicks }) {
  const price = Math.floor(Math.random() * 200) + 20;
  const intensity = Number(offerClicks) || 1;
  const total = Number(totalClicks) || intensity;
  const offerLabel = String(offerId || '123');
  const hintImageUrl = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=640&h=160&fit=crop';

  const widgetId = `${productId}.primary.v1`;
  const components = [
    {
      type: 'HeroBanner',
      props: {
        title: `${TEMPLATE.title} für dich`,
        subtitle: TEMPLATE.subtitle,
        price: `${price} €`,
        imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=150&h=150&fit=crop',
        cta: { label: TEMPLATE.cta, action: 'deeplink', deeplink: buildOfferDeeplink(offerId) },
      },
    },
    {
      type: 'TextCard',
      props: {
        label: 'Personalized hint',
        title: `Warum ${TEMPLATE.title}?`,
        text: `Du hast Tarif #${offerLabel} in ${productId.toUpperCase()} ${intensity}x angeklickt (gesamt ${total} Klicks).`,
        imageUrl: hintImageUrl,
      },
    },
  ];

  const payload = {
    userId,
    widgetData: {
      widgetId,
      type: 'hero_banner',
      priority: TEMPLATE.priority,
      components,
      data: {
        price: `${price} €`,
        intensity,
        offerId: offerLabel,
        totalClicks: total,
      },
    },
  };

  try {
    await axios.post(coreUrl + '/api/ingest', payload, {
      headers: {
        'x-product-id': productId.toUpperCase(),
        'x-api-key': ingestApiKey,
        'idempotency-key': crypto.randomUUID(),
      },
      timeout: 2000,
    });
    fastify.log.info({ userId, productId, intensity, widgetId }, '[speedboat] widget pushed');
  } catch (error) {
    fastify.log.error({ error: error.message }, '[speedboat] core unreachable');
  }
}

fastify.post('/api/simulate/interest', async (request, reply) => {
  const { email, offerId } = request.body || {};
  if (!email) return reply.code(400).send({ error: 'email required' });

  const { offerId: id, offerClicks, totalClicks } = incClickCount(email, offerId);
  fastify.log.info({ email, productId, offerId: id, offerClicks, totalClicks }, 'User showed interest');

  await sendSignal({ userId: email, weight: 1 });
  await pushWidget({ userId: email, offerId: id, offerClicks, totalClicks });

  return reply.send({ status: 'interest_registered', email, productId, offerId: id, offerClicks, totalClicks });
});

fastify.get('/health', async () => {
  return {
    status: 'ok',
    productId,
    clickCounts: Array.from(clickCounts.entries()).map(([email, state]) => ({
      email,
      totalClicks: state.totalCount || 0,
      lastOfferId: state.lastOfferId,
      offers: Object.fromEntries(Array.from((state.offerCounts || new Map()).entries())),
    })),
  };
});

// EVENT-DRIVEN ARCHITECTURE:
// Widgets are pushed ONLY in response to explicit user actions (clicks, form submissions).
// Time-based polling (setInterval) was removed because:
// 1. Scalability: At 100k users × 5s interval = 20k RPS to Core (unsustainable)
// 2. UX: Unsolicited price/content changes reduce user trust and conversion
// 3. Resource efficiency: Widgets are already cached in Redis with TTL; no need for active refresh
// For production cache invalidation, products can use targeted endpoint: POST /api/invalidate/<userId>

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
