import { Badge, Box, Button, Card, Container, Flex, Heading, Text, TextField } from '@radix-ui/themes';
import { PersonIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useState } from 'react';

const TOKEN_STORAGE_KEY = 'c24_token';
const USER_STORAGE_KEY = 'c24_user';

type User = { email: string };

function normalizeBaseUrl(value: string | undefined): string {
  const v = (value ?? '').trim();
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

function getSpeedboatUrl(): string {
  return normalizeBaseUrl(import.meta.env.VITE_SPEEDBOAT_URL) || 'http://localhost:3001';
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

  const simulateInterest = async () => {
    if (!email.trim()) {
      setMessage('Bitte E-Mail eingeben.');
      return;
    }

    setIsSending(true);
    setMessage(null);
    try {
      const response = await fetch(`${speedboatUrl}/api/simulate/interest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, vertical: 'travel' }),
      });

      if (!response.ok) {
        setMessage(`Fehler: ${response.status}`);
        return;
      }

      setMessage('Interesse gesendet. Öffne Home, um das Widget zu sehen.');
    } catch (e: any) {
      setMessage(e?.message ?? 'Netzwerkfehler');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Box style={{ minHeight: '100vh' }}>
      <Box style={{ borderBottom: '1px solid var(--gray-a5)' }}>
        <Container size="3" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <Flex align="center" gap="3" wrap="wrap">
            <Heading size="4">CHECK24</Heading>
            <Text size="2" color="gray">
              Travel
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
              <Heading size="5">{offerId ? `Angebot ${offerId}` : 'Travel Angebote'}</Heading>
              <Text size="2" color="gray">
                Minimaler Product-Site-PoC: sendet ein Interest-Signal an die Travel-Speedboat und pusht ein Widget in Home.
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
                <Button onClick={simulateInterest} disabled={isSending}>
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
              <Heading size="4">Links</Heading>
              <Text size="2" color="gray">
                Beispiele: <Text weight="bold">/offer/123</Text>
              </Text>
              <Flex gap="2" wrap="wrap">
                <Button variant="soft" onClick={() => (window.location.href = '/offer/123')}>
                  Angebot 123
                </Button>
                <Button variant="soft" onClick={() => (window.location.href = '/offer/999')}>
                  Angebot 999
                </Button>
              </Flex>
            </Flex>
          </Card>
        </Flex>
      </Container>
    </Box>
  );
}
