const fastify = require('fastify')({ logger: true });
const axios = require('axios');
const crypto = require('crypto');

// Config
const coreUrl = (process.env.CORE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ingestApiKey = process.env.INGEST_API_KEY || 'dev-secret-123';
const pushIntervalMs = Number.parseInt(process.env.PUSH_INTERVAL_MS || '5000', 10);

// State
// Map<email, Map<vertical, count>>
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
    userInterests.set(email, new Map());
  }
  
  const userVerticals = userInterests.get(email);
  const currentCount = userVerticals.get(targetVertical) || 0;
  const newCount = currentCount + 1;
  userVerticals.set(targetVertical, newCount);
  
  // Immediate push for instant feedback
  await pushUpdateForUser(email, targetVertical, newCount);

  return { 
    status: 'interest_registered', 
    message: `Started pushing ${targetVertical} widgets for ${email} (Intensity: ${newCount})` 
  };
});

fastify.get('/health', async () => {
  // Convert Map<email, Map<vertical, count>> to something JSON serializable for debug
  const debugState = {};
  for (const [email, verticals] of userInterests.entries()) {
    debugState[email] = Object.fromEntries(verticals);
  }
  return { status: 'ok', userInterests: debugState };
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
async function pushUpdateForUser(userId, vertical, intensity) {
  const template = WIDGET_TEMPLATES[vertical];
  if (!template) return;

  const price = Math.floor(Math.random() * 200) + 20;
  const widgetId = vertical + '.hero.v1';

  // Adaptive Layout Logic:
  // Intensity 1-2: CompactRow (Low intrusion)
  // Intensity > 2: HeroBanner (High impact)
  const useCompactLayout = intensity <= 2;

  let components = [];
  
  if (useCompactLayout) {
    components = [{
      type: 'CompactRow',
      props: {
        title: template.title,
        subtitle: template.subtitle,
        imageUrl: `https://via.placeholder.com/80/${template.color.replace('#', '')}/ffffff?text=${vertical}`,
        price: `ab ${price} €`,
        cta: {
          label: template.cta,
          action: 'deeplink',
          deeplink: `c24://${vertical}/details`,
        },
      }
    }];
  } else {
    components = [{
      type: 'HeroBanner',
      props: {
        title: template.title,
        subtitle: template.subtitle,
        imageUrl: `https://via.placeholder.com/150/${template.color.replace('#', '')}/ffffff?text=${vertical}`,
        price: `ab ${price} €`,
        cta: {
          label: template.cta,
          action: 'deeplink',
          deeplink: `c24://${vertical}/details`,
        },
      }
    }];
  }

  // Step 1: Ingest Widget
  const payload = {
    userId,
    widgetData: {
      widgetId,
      type: useCompactLayout ? 'compact_row' : 'hero_banner',
      priority: template.priority, 
      components: components,
      data: {
        price,
        currency: 'EUR',
      },
    },
  };

  try {
    // Send Widget
    await axios.post(`${coreUrl}/api/ingest`, payload, {
      headers: {
        'x-product-id': vertical.toUpperCase(),
        'x-api-key': ingestApiKey,
        'Content-Type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
      },
      timeout: 2000,
    });

    // Step 2: Send Affinity Signal
    // We tell Home Core: "User showed interest in this vertical"
    // Clean weighting (no hacks): baseline is handled by Home Core, so we only express interest strength.
    // Intensity 1-2: small boost, Intensity >= 3: stronger boost.
    const signalWeight = Math.min(10.0, useCompactLayout ? 2.0 + (intensity * 1.5) : 7.5 + ((intensity - 2) * 1.0));

    await axios.post(`${coreUrl}/api/signals`, {
      userId,
      signal: 'interest',
      weight: signalWeight
    }, {
      headers: {
        'x-product-id': vertical.toUpperCase(),
        'x-api-key': ingestApiKey,
        'Content-Type': 'application/json',
      },
      timeout: 2000,
    });

    fastify.log.info({ userId, vertical, intensity, layout: useCompactLayout ? 'Compact' : 'Hero' }, 'Pushed widget and affinity signal');
  } catch (err) {
    fastify.log.error({ err: err.message }, 'Failed to push update');
  }
}

// Loop
setInterval(async () => {
  if (userInterests.size === 0) return;
  for (const [email, verticalsMap] of userInterests.entries()) {
    for (const [vertical, count] of verticalsMap.entries()) {
      await pushUpdateForUser(email, vertical, count);
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
