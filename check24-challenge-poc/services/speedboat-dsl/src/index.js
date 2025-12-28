const fastify = require('fastify')({ logger: true });
const axios = require('axios');
const crypto = require('crypto');

const coreUrl = (process.env.CORE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ingestApiKey = process.env.INGEST_API_KEY || 'dev-secret-123';
const pushIntervalMs = Number.parseInt(process.env.PUSH_INTERVAL_MS || '5000', 10);

const productId = String(process.env.PRODUCT_ID || 'dsl').trim().toLowerCase();
const productWebUrl = String(process.env.PRODUCT_WEB_URL || '').trim().replace(/\/$/, '');

// Map<email, clickCount>
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

function buildOfferDeeplink() {
  if (productWebUrl) return `${productWebUrl}/offer/123`;
  return `check24://${productId}/offer/123`;
}

function incClickCount(email) {
  const next = (clickCounts.get(email) || 0) + 1;
  clickCounts.set(email, next);
  return next;
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

async function pushWidget({ userId, clickCount }) {
  const price = Math.floor(Math.random() * 200) + 20;
  const intensity = Number(clickCount) || 1;

  const widgetId = `${productId}.primary.v1`;
  const components = [
    {
      type: 'HeroBanner',
      props: {
        title: `${TEMPLATE.title} für dich`,
        subtitle: TEMPLATE.subtitle,
        price: `${price} €`,
        imageUrl: `https://via.placeholder.com/150/${TEMPLATE.color.replace('#', '')}/ffffff?text=${productId}`,
        cta: { label: TEMPLATE.cta, action: 'deeplink', deeplink: buildOfferDeeplink() },
      },
    },
    {
      type: 'TextCard',
      props: {
        label: 'Personalized hint',
        title: `Warum ${productId}?`,
        text: `Du hast ${productId} angeklickt (Intensität ${intensity}).`,
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
  const { email } = request.body || {};
  if (!email) return reply.code(400).send({ error: 'email required' });

  const count = incClickCount(email);
  fastify.log.info({ email, productId, clicks: count }, 'User showed interest');

  await sendSignal({ userId: email, weight: 1 });
  await pushWidget({ userId: email, clickCount: count });

  return reply.send({ status: 'interest_registered', email, productId, clickCount: count });
});

fastify.get('/health', async () => {
  return {
    status: 'ok',
    productId,
    clickCounts: Array.from(clickCounts.entries()).map(([email, count]) => ({ email, count })),
  };
});

setInterval(async () => {
  if (clickCounts.size === 0) return;
  for (const [email, count] of clickCounts.entries()) {
    await pushWidget({ userId: email, clickCount: count });
  }
}, pushIntervalMs);

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
