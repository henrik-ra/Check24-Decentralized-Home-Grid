const fastify = require('fastify')({ logger: true });
const axios = require('axios');
const crypto = require('crypto');

const coreUrl = (process.env.CORE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ingestApiKey = process.env.INGEST_API_KEY || 'dev-secret-123';
const pushIntervalMs = Number.parseInt(process.env.PUSH_INTERVAL_MS || '5000', 10);

const productId = String(process.env.PRODUCT_ID || 'travel').trim().toLowerCase();
const productWebUrl = String(process.env.PRODUCT_WEB_URL || '').trim().replace(/\/$/, '');

// Map<email, Map<vertical, clickCount>>
const clickCounts = new Map();

fastify.register(require('@fastify/cors'), {
  origin: true,
});

const WIDGET_TEMPLATES = {
  travel: {
    priority: 100,
    title: 'Mallorca Deal',
    subtitle: 'Inklusive Flug & Hotel',
    color: '#00b4db',
    cta: 'Ansehen',
  },
  dsl: {
    priority: 90,
    title: 'Internet 250 Mbit',
    subtitle: '6 Monate gratis',
    color: '#663399',
    cta: 'Vergleichen',
  },
  insurance: {
    priority: 80,
    title: 'KFZ Versicherung',
    subtitle: 'Bis zu 400 € sparen',
    color: '#2ecc71',
    cta: 'Berechnen',
  },
  energy: {
    priority: 70,
    title: 'Strom & Gas',
    subtitle: 'Preisbremse nutzen',
    color: '#f1c40f',
    cta: 'Wechseln',
  },
  finance: {
    priority: 60,
    title: 'Kreditvergleich',
    subtitle: '0,0% Finanzierung',
    color: '#e74c3c',
    cta: 'Anfragen',
  },
  shopping: {
    priority: 50,
    title: 'iPhone 15 Pro',
    subtitle: 'Sofort lieferbar',
    color: '#34495e',
    cta: 'Kaufen',
  },
};

function normalizeVertical(vertical) {
  const v = String(vertical || '').trim().toLowerCase();
  return v || productId;
}

function buildOfferDeeplink(vertical) {
  const v = normalizeVertical(vertical);
  if (productWebUrl && v === productId) return `${productWebUrl}/offer/123`;
  return `check24://${v}/offer/123`;
}

function incClickCount(email, vertical) {
  const v = normalizeVertical(vertical);
  if (!clickCounts.has(email)) clickCounts.set(email, new Map());
  const perVertical = clickCounts.get(email);
  const next = (perVertical.get(v) || 0) + 1;
  perVertical.set(v, next);
  return { vertical: v, count: next };
}

async function sendSignal({ userId, productId, weight }) {
  try {
    await axios.post(
      coreUrl + '/api/signals',
      { userId, signal: 'interest', weight },
      {
        headers: {
          'x-product-id': productId,
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

async function pushWidget({ userId, vertical, clickCount }) {
  const template = WIDGET_TEMPLATES[vertical];
  if (!template) return;

  const productId = vertical.toUpperCase();
  const price = Math.floor(Math.random() * 200) + 20;
  const intensity = Number(clickCount) || 1;

  // Always push the large format for personalized widgets.
  // CompactRow is reserved for Home-Core baseline fillers.
  const widgetId = `${vertical}.primary.v1`;
  const components = [
    {
      type: 'HeroBanner',
      props: {
        title: `${template.title} für dich`,
        subtitle: template.subtitle,
        price: `${price} €`,
        imageUrl: `https://via.placeholder.com/150/${template.color.replace('#', '')}/ffffff?text=${vertical}`,
        cta: { label: template.cta, action: 'deeplink', deeplink: buildOfferDeeplink(vertical) },
      },
    },
    {
      type: 'TextCard',
      props: {
        label: 'Personalized hint',
        title: `Warum ${vertical}?`,
        text: `Du hast ${vertical} angeklickt (Intensität ${intensity}).`,
      },
    },
  ];

  const payload = {
    userId,
    widgetData: {
      widgetId,
      type: 'hero_banner',
      priority: template.priority,
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
        'x-product-id': productId,
        'x-api-key': ingestApiKey,
        'idempotency-key': crypto.randomUUID(),
      },
      timeout: 2000,
    });
    fastify.log.info({ userId, vertical, intensity, widgetId }, '[speedboat] widget pushed');
  } catch (error) {
    fastify.log.error({ error: error.message }, '[speedboat] core unreachable');
  }
}

fastify.post('/api/simulate/interest', async (request, reply) => {
  const { email, vertical } = request.body || {};
  if (!email) return reply.code(400).send({ error: 'email required' });

  const { vertical: v, count } = incClickCount(email, vertical);
  fastify.log.info({ email, vertical: v, clicks: count }, 'User showed interest');

  await sendSignal({ userId: email, productId: v.toUpperCase(), weight: 1 });
  await pushWidget({ userId: email, vertical: v, clickCount: count });

  return reply.send({ status: 'interest_registered', email, vertical: v, clickCount: count });
});

fastify.get('/health', async () => {
  return {
    status: 'ok',
    clickCounts: Array.from(clickCounts.entries()).map(([email, map]) => ({
      email,
      verticals: Object.fromEntries(map.entries()),
    })),
  };
});

setInterval(async () => {
  if (clickCounts.size === 0) return;
  for (const [email, map] of clickCounts.entries()) {
    for (const [vertical, count] of map.entries()) {
      await pushWidget({ userId: email, vertical, clickCount: count });
    }
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
