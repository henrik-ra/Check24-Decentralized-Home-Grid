const fastify = require('fastify')({ logger: true });
const axios = require('axios');
const crypto = require('crypto');

// Config
const coreUrl = (process.env.CORE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ingestApiKey = process.env.INGEST_API_KEY || 'dev-secret-123';
const pushIntervalMs = Number.parseInt(process.env.PUSH_INTERVAL_MS || '5000', 10);

// State
// Map<email, Set<vertical>>
const userInterests = new Map();

// Plugins
fastify.register(require('@fastify/cors'), {
  origin: true, // Allow all for PoC
});

// Routes
fastify.post('/api/simulate/interest', async (request, reply) => {
  const { email, vertical } = request.body || {};
  
  if (!email) {
    return reply.code(400).send({ error: 'email required' });
  }

  const targetVertical = vertical || 'travel'; // Default to travel for backward compat

  fastify.log.info({ email, vertical: targetVertical }, 'User showed interest');
  
  if (!userInterests.has(email)) {
    userInterests.set(email, new Set());
  }
  userInterests.get(email).add(targetVertical);
  
  // Immediate push for instant feedback
  await pushUpdateForUser(email, targetVertical);

  return { status: 'interest_registered', message: 'Started pushing ' + targetVertical + ' widgets for ' + email };
});

fastify.get('/health', async () => {
  return { status: 'ok', userInterests: Array.from(userInterests.entries()) };
});

// Widget Templates
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
    subtitle: 'Bis zu 400 Euro sparen',
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

// Push Logic
async function pushUpdateForUser(userId, vertical) {
  const template = WIDGET_TEMPLATES[vertical];
  if (!template) return;

  const price = Math.floor(Math.random() * 200) + 20;
  const widgetId = vertical + '.hero.v1';

  const payload = {
    userId,
    widgetData: {
      widgetId,
      type: 'hero_banner',
      priority: template.priority,
      components: [
        {
          type: 'HeroBanner',
          props: {
            title: template.title + ' f�r ' + userId,
            subtitle: template.subtitle,
            price: price + ' �',
            imageUrl: 'https://via.placeholder.com/150/' + template.color.replace('#', '') + '/ffffff?text=' + vertical,
            cta: { label: template.cta, deeplink: 'check24://' + vertical + '/offer/123' },
          },
        },
        {
          type: 'TextCard',
          props: {
            label: 'Personalized hint',
            title: 'Warum ' + vertical + '?',
            text: 'Wir haben ein Top-Angebot f�r ' + vertical + ' gefunden (Priorit�t ' + template.priority + ').',
          },
        },
      ],
      data: {
        price: price + ' �',
      },
    },
  };

  try {
    await axios.post(coreUrl + '/api/ingest', payload, {
      headers: {
        'x-product-id': vertical.toUpperCase(),
        'x-api-key': ingestApiKey,
        'idempotency-key': crypto.randomUUID(),
      },
      timeout: 2000,
    });
    fastify.log.info('[speedboat] pushed ' + vertical + ' for user=' + userId);
  } catch (error) {
    fastify.log.error('[speedboat] core unreachable (' + error.message + ')');
  }
}

// Loop
setInterval(async () => {
  if (userInterests.size === 0) return;
  for (const [email, verticals] of userInterests.entries()) {
    for (const vertical of verticals) {
      await pushUpdateForUser(email, vertical);
    }
  }
}, pushIntervalMs);

// Start Server
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
