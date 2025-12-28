import { Badge, Box, Button, Card, Container, Flex, Heading, Text, TextField } from '@radix-ui/themes';
import { PersonIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useState } from 'react';

const TOKEN_STORAGE_KEY = 'c24_token';
const USER_STORAGE_KEY = 'c24_user';

type User = { email: string };

function svgDataUrl(options: { text: string; width: number; height: number; bg?: string; fg?: string }): string {
  const bg = options.bg ?? '#eeeeee';
  const fg = options.fg ?? '#333333';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}">
  <rect width="100%" height="100%" fill="${bg}" />
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${fg}" font-family="Arial, sans-serif" font-size="24">${options.text}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeBaseUrl(value: string | undefined): string {
  const v = (value ?? '').trim();
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

function getSpeedboatUrl(): string {
  return normalizeBaseUrl(import.meta.env.VITE_SPEEDBOAT_URL) || 'http://localhost:3002';
}

function getHomeUrl(): string {
  return normalizeBaseUrl(import.meta.env.VITE_HOME_URL);
}

function getCoreUrl(): string {
  return normalizeBaseUrl(import.meta.env.VITE_CORE_URL) || 'http://localhost:3000';
}

function loadToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

function loadUser(): User | null {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  return stored ? (JSON.parse(stored) as User) : null;
}

function saveAuth(token: string, user: User) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

async function exchangeHandoff(coreUrl: string, code: string): Promise<{ token: string; user: User }> {
  const response = await fetch(`${coreUrl}/api/auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  const bodyText = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(bodyText ? `SSO exchange failed: ${response.status} - ${bodyText}` : `SSO exchange failed: ${response.status}`);
  }

  const data = bodyText ? (JSON.parse(bodyText) as any) : ({} as any);
  const token = typeof data.token === 'string' ? data.token : '';
  const user = typeof data.user === 'object' && data.user !== null ? (data.user as User) : null;
  if (!token || !user?.email) throw new Error('SSO exchange failed: missing token/user');
  return { token, user };
}

function getOfferIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/offer\/(.+)$/);
  return match?.[1] ?? null;
}

export function App() {
  const speedboatUrl = useMemo(() => getSpeedboatUrl(), []);
  const homeUrl = useMemo(() => getHomeUrl(), []);
  const coreUrl = useMemo(() => getCoreUrl(), []);
  const offerId = useMemo(() => getOfferIdFromPathname(window.location.pathname), []);

  const offers = useMemo(
    () => [
      {
        id: '201',
        title: 'DSL 50 (Starter)',
        subtitle: 'ab 19,99€ / Monat · 24 Monate',
        imageUrl: 'https://images.unsplash.com/photo-1606904825846-647eb07f5be2?w=640&h=360&fit=crop',
      },
      {
        id: '202',
        title: 'DSL 100 (Spar-Tarif)',
        subtitle: 'ab 24,99€ / Monat · WLAN Router',
        imageUrl: 'https://images.unsplash.com/photo-1558346490-a72e53ae2d4f?w=640&h=360&fit=crop',
      },
      {
        id: '203',
        title: 'DSL 250 (Top Deal)',
        subtitle: 'ab 29,99€ / Monat · Top Preis/Leistung',
        imageUrl: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=640&h=360&fit=crop',
      },
      {
        id: '204',
        title: 'Glasfaser 500',
        subtitle: 'ab 39,99€ / Monat · Highspeed',
        imageUrl: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=640&h=360&fit=crop',
      },
      {
        id: '205',
        title: 'Glasfaser 1000',
        subtitle: 'ab 49,99€ / Monat · Max Speed',
        imageUrl: 'https://images.unsplash.com/photo-1593642532973-d31b6557fa68?w=640&h=360&fit=crop',
      },
    ],
    []
  );

  const [token, setToken] = useState<string>(() => loadToken());
  const [user, setUser] = useState<User | null>(() => loadUser());
  const [email, setEmail] = useState(() => loadUser()?.email ?? 'demo@example.com');
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get('handoff');
    if (!handoff) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await exchangeHandoff(coreUrl, handoff);
        if (cancelled) return;
        saveAuth(result.token, result.user);
        setToken(result.token);
        setUser(result.user);
        setEmail(result.user.email);

        params.delete('handoff');
        const nextSearch = params.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, '', nextUrl);
      } catch (e: any) {
        if (!cancelled) setMessage(e?.message ?? 'SSO exchange failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coreUrl]);

  const simulateInterest = async (clickedOfferId?: string, options?: { keepalive?: boolean; silent?: boolean }) => {
    const effectiveEmail = (user?.email ?? email).trim();
    if (!effectiveEmail) {
      setMessage('Bitte E-Mail eingeben.');
      return;
    }

    setIsSending(true);
    if (!options?.silent) setMessage(null);
    try {
      const response = await fetch(`${speedboatUrl}/api/simulate/interest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: effectiveEmail, vertical: 'dsl', offerId: clickedOfferId }),
        keepalive: Boolean(options?.keepalive),
      });

      if (!response.ok) {
        if (!options?.silent) setMessage(`Fehler: ${response.status}`);
        return;
      }

      if (!options?.silent) setMessage('Interesse gesendet. Öffne Home, um das Widget zu sehen.');
    } catch (e: any) {
      if (!options?.silent) setMessage(e?.message ?? 'Netzwerkfehler');
    } finally {
      setIsSending(false);
    }
  };

  const openOffer = (id: string) => {
    void simulateInterest(id, { keepalive: true, silent: true });
    window.location.href = `/offer/${id}`;
  };

  return (
    <Box style={{ minHeight: '100vh' }}>
      <Box style={{ borderBottom: '1px solid var(--gray-a5)' }}>
        <Container size="3" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <Flex align="center" gap="3" wrap="wrap">
            <img
              src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=48&h=48&fit=crop"
              alt=""
              style={{ width: 28, height: 28, borderRadius: 10, objectFit: 'cover' }}
            />
            <Heading size="4">CHECK24</Heading>
            <Text size="2" color="gray">
              DSL
            </Text>

            <Flex align="center" gap="2" style={{ marginLeft: 'auto' }} wrap="wrap">
              {homeUrl ? (
                <Button
                  variant="soft"
                  onClick={() => {
                    window.location.href = homeUrl;
                  }}
                >
                  Zur Home
                </Button>
              ) : null}
              <Badge color="gray">Speedboat: {speedboatUrl}</Badge>
            </Flex>
          </Flex>
        </Container>
      </Box>

      <Container size="2" style={{ paddingTop: 24, paddingBottom: 40 }}>
        <Flex direction="column" gap="4">
          <Card size="4">
            <Flex direction="column" gap="3">
              <Heading size="5">{offerId ? `Tarif ${offerId}` : 'DSL Tarife'}</Heading>
              <Text size="2" color="gray">
                Minimaler Product-Site-PoC: sendet ein Interest-Signal an die DSL-Speedboat und pusht ein Widget in Home.
              </Text>

              {user?.email ? (
                <Text size="2" color="gray">
                  Eingeloggt als <Text weight="bold">{user.email}</Text>
                </Text>
              ) : (
                <Flex direction="column" gap="2">
                  <Text as="label" size="2" weight="bold" color="gray">
                    E-Mail
                  </Text>
                  <TextField.Root value={email} onChange={(e) => setEmail(e.target.value)}>
                    <TextField.Slot>
                      <PersonIcon />
                    </TextField.Slot>
                  </TextField.Root>
                </Flex>
              )}

              <Flex gap="2" wrap="wrap">
                <Button onClick={() => simulateInterest(offerId ?? undefined)} disabled={isSending}>
                  {isSending ? 'Sende…' : 'Interesse signalisieren'}
                </Button>
                {homeUrl ? (
                  <Button
                    variant="soft"
                    onClick={() => {
                      window.location.href = homeUrl;
                    }}
                  >
                    Home öffnen
                  </Button>
                ) : null}
              </Flex>

              {message ? <Text size="2">{message}</Text> : null}
            </Flex>
          </Card>

          <Card size="3">
            <Flex direction="column" gap="2">
              <Heading size="4">Mock-Tarife</Heading>
              <Text size="2" color="gray">
                5 Beispiel-Tarife (Klicks werden gezählt)
              </Text>
              <Box
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                {offers.map((o) => (
                  <Card key={o.id} size="2" style={{ cursor: 'pointer' }} onClick={() => openOffer(o.id)}>
                    <Flex direction="column" gap="2">
                      <img
                        src={o.imageUrl}
                        alt=""
                        style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10 }}
                      />
                      <Flex direction="column" gap="1">
                        <Text weight="bold" size="3">
                          {o.title}
                        </Text>
                        <Text size="2" color="gray">
                          {o.subtitle}
                        </Text>
                      </Flex>
                      <Flex align="center" justify="between" gap="2">
                        <Badge color="blue">DSL</Badge>
                        <Button
                          size="1"
                          variant="soft"
                          onClick={(e) => {
                            e.stopPropagation();
                            openOffer(o.id);
                          }}
                        >
                          Details
                        </Button>
                      </Flex>
                    </Flex>
                  </Card>
                ))}
              </Box>
            </Flex>
          </Card>
        </Flex>
      </Container>
    </Box>
  );
}
