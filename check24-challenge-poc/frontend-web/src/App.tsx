import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  Skeleton,
  Tabs,
  Text,
  TextField,
} from '@radix-ui/themes';
import { ExclamationTriangleIcon, PersonIcon, ReloadIcon } from '@radix-ui/react-icons';
import { fetchHome, getApiBaseUrl, login, register } from './api';
import type { HomeResponse } from './types';
import { WidgetRenderer } from './components/WidgetRenderer';
import { navigateWithSso } from './sso';

const TOKEN_STORAGE_KEY = 'c24_token';
const USER_STORAGE_KEY = 'c24_user';

type User = { email: string };

function useIsMobile(breakpointPx = 720) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpointPx);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpointPx);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpointPx]);

  return isMobile;
}

function normalizeUrl(value: string | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  return v.endsWith('/') ? v.slice(0, -1) : v;
}

function loadToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

function loadUser(): { email: string } | null {
  const stored = localStorage.getItem(USER_STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
}

function saveAuth(token: string, user: { email: string }) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

function useHomeFeed(token: string, enabled: boolean) {
  const [data, setData] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const refresh = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchHome(token, true);
      setData(response);
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchHome(token);
        if (!cancelled) setData(response);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Unknown error');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, token]);

  return { data, error, isLoading, refresh };
}

function LoadingGrid() {
  return (
    <Grid columns={{ initial: '1', md: '2' }} gap="3">
      {[0, 1, 2].map((i) => (
        <Card key={i} size="3">
          <Flex direction="column" gap="2">
            <Skeleton style={{ height: 16, width: '55%' }} />
            <Skeleton style={{ height: 12, width: '85%' }} />
            <Skeleton style={{ height: 12, width: '78%' }} />
          </Flex>
        </Card>
      ))}
    </Grid>
  );
}

export function App() {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const travelWebUrl = useMemo(() => normalizeUrl(import.meta.env.VITE_TRAVEL_WEB_URL), []);
  const dslWebUrl = useMemo(() => normalizeUrl(import.meta.env.VITE_DSL_WEB_URL), []);
  const insuranceWebUrl = useMemo(() => normalizeUrl(import.meta.env.VITE_INSURANCE_WEB_URL), []);

  const [token, setToken] = useState<string>(() => loadToken());
  const [user, setUser] = useState<User | null>(() => loadUser());

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>('demo@check24.dev');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  const isMobile = useIsMobile();
  const [isNavOpen, setIsNavOpen] = useState(false);

  const { data, error, isLoading, refresh } = useHomeFeed(token, Boolean(token));

  const logout = () => {
    clearAuth();
    setToken('');
    setUser(null);
  };

  useEffect(() => {
    if (!isMobile) setIsNavOpen(false);
  }, [isMobile]);

  const onSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    try {
      const response = authMode === 'login' ? await login(email, password) : await register(email, password);
      saveAuth(response.token, response.user);
      setToken(response.token);
      setUser({ email: response.user.email });
    } catch (err: any) {
      setAuthError(err?.message ?? 'Auth failed');
    }
  };

    if (!token) {
      return (
        <Box style={{ minHeight: '100vh' }}>
          <Box style={{ backgroundColor: 'var(--c24-navbar-blue)', color: 'var(--gray-1)' }}>
            <Container size="3" style={{ paddingTop: 14, paddingBottom: 14 }}>
              <Flex align="center" gap="2" wrap="wrap">
                <Heading size="4" style={{ color: 'var(--gray-1)' }}>
                  CHECK24
                </Heading>
                <Text size="2" style={{ color: 'var(--gray-1)' }}>
                  Home
                </Text>
              </Flex>
            </Container>
          </Box>
          <Container size="2" style={{ paddingTop: 72, paddingBottom: 72 }}>
            <Flex direction="column" align="center" gap="5">
              <Box style={{ width: '100%', maxWidth: 520 }}>
                <Card size="4">
                  <Flex direction="column" gap="4">
                    <Flex direction="column" gap="1">
                      <img
                        src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=640&h=160&fit=crop"
                        alt=""
                        style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 12 }}
                      />
                      <Heading size="6">CHECK24 Home (PoC)</Heading>
                      <Text color="gray" size="2">
                        API: <Badge color="gray">{apiBaseUrl}</Badge>
                      </Text>
                    </Flex>

                    <Tabs.Root
                      value={authMode}
                      onValueChange={(v) => {
                        setAuthError(null);
                        setAuthMode(v as 'login' | 'register');
                      }}
                    >
                      <Tabs.List>
                        <Tabs.Trigger value="login">Login</Tabs.Trigger>
                        <Tabs.Trigger value="register">Register</Tabs.Trigger>
                      </Tabs.List>
                    </Tabs.Root>

                    {authError ? (
                      <Callout.Root color="red" role="alert">
                        <Callout.Icon>
                          <ExclamationTriangleIcon />
                        </Callout.Icon>
                        <Callout.Text>{authError}</Callout.Text>
                      </Callout.Root>
                    ) : null}

                    <Box asChild>
                      <form onSubmit={onSubmitAuth}>
                        <Flex direction="column" gap="3">
                          <Flex direction="column" gap="2">
                            <Text as="label" size="2" weight="bold" color="gray">
                              E-Mail
                            </Text>
                            <TextField.Root
                              placeholder="demo@check24.dev"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                            >
                              <TextField.Slot>
                                <PersonIcon />
                              </TextField.Slot>
                            </TextField.Root>
                          </Flex>

                          <Flex direction="column" gap="2">
                            <Text as="label" size="2" weight="bold" color="gray">
                              Password
                            </Text>
                            <TextField.Root
                              type="password"
                              placeholder="demo"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                            />
                          </Flex>

                          <Button type="submit" size="3">
                            {authMode === 'login' ? 'Login' : 'Register'}
                          </Button>

                          <Text size="1" color="gray">
                            Hinweis: Token wird im LocalStorage gespeichert (PoC).
                          </Text>
                        </Flex>
                      </form>
                    </Box>
                  </Flex>
                </Card>
              </Box>
            </Flex>
          </Container>
        </Box>
      );
    }

  return (
      <Box style={{ minHeight: '100vh' }}>
      <Box style={{ backgroundColor: 'var(--c24-navbar-blue)', color: 'var(--gray-1)' }}>
          <Container size="3" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <Flex direction="column" gap="2">
              <Flex align="center" gap="4" wrap="wrap">
                <Flex align="center" gap="2" style={{ minWidth: 220 }}>
                  <Heading size="4" style={{ color: 'var(--gray-1)' }}>
                    CHECK24
                  </Heading>
                  <Text size="2" style={{ color: 'var(--gray-1)' }}>
                    Home
                  </Text>
                </Flex>

                {!isMobile ? (
                  <Flex align="center" gap="5" wrap="wrap">
                    {travelWebUrl ? (
                      <Button asChild variant="ghost" style={{ color: 'var(--gray-1)' }}>
                        <a
                          className="c24-nav-link"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateWithSso(travelWebUrl);
                          }}
                        >
                          Reisen
                        </a>
                      </Button>
                    ) : null}
                    {dslWebUrl ? (
                      <Button asChild variant="ghost" style={{ color: 'var(--gray-1)' }}>
                        <a
                          className="c24-nav-link"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateWithSso(dslWebUrl);
                          }}
                        >
                          DSL
                        </a>
                      </Button>
                    ) : null}
                    {insuranceWebUrl ? (
                      <Button asChild variant="ghost" style={{ color: 'var(--gray-1)' }}>
                        <a
                          className="c24-nav-link"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateWithSso(insuranceWebUrl);
                          }}
                        >
                          Versicherung
                        </a>
                      </Button>
                    ) : null}
                  </Flex>
                ) : (
                  <Button
                    variant="ghost"
                    style={{ color: 'var(--gray-1)', marginLeft: 'auto' }}
                    onClick={() => setIsNavOpen((v) => !v)}
                  >
                    {isNavOpen ? 'Schließen' : 'Menü'}
                  </Button>
                )}

                {!isMobile ? (
                  <Flex align="center" gap="3" style={{ marginLeft: 'auto' }}>
                    <Text size="2" style={{ color: 'var(--gray-1)' }}>
                      {user?.email}
                    </Text>
                    <Button variant="ghost" style={{ color: 'var(--gray-1)' }} onClick={logout}>
                      Logout
                    </Button>
                  </Flex>
                ) : null}
              </Flex>

              {isMobile && isNavOpen ? (
                <Flex direction="column" gap="2" style={{ paddingBottom: 6 }}>
                  <Flex align="center" gap="5" wrap="wrap">
                    {travelWebUrl ? (
                      <Button asChild variant="ghost" style={{ color: 'var(--gray-1)', justifyContent: 'flex-start' }}>
                        <a
                          className="c24-nav-link"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateWithSso(travelWebUrl);
                          }}
                        >
                          Reisen
                        </a>
                      </Button>
                    ) : null}
                    {dslWebUrl ? (
                      <Button asChild variant="ghost" style={{ color: 'var(--gray-1)', justifyContent: 'flex-start' }}>
                        <a
                          className="c24-nav-link"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateWithSso(dslWebUrl);
                          }}
                        >
                          DSL
                        </a>
                      </Button>
                    ) : null}
                    {insuranceWebUrl ? (
                      <Button asChild variant="ghost" style={{ color: 'var(--gray-1)', justifyContent: 'flex-start' }}>
                        <a
                          className="c24-nav-link"
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            navigateWithSso(insuranceWebUrl);
                          }}
                        >
                          Versicherung
                        </a>
                      </Button>
                    ) : null}
                  </Flex>

                  <Flex align="center" gap="3" wrap="wrap">
                    <Text size="2" style={{ color: 'var(--gray-1)' }}>
                      {user?.email}
                    </Text>
                    <Button variant="ghost" style={{ color: 'var(--gray-1)' }} onClick={logout}>
                      Logout
                    </Button>
                  </Flex>
                </Flex>
              ) : null}
            </Flex>
          </Container>
        </Box>

        <Container size="3" style={{ paddingTop: 20, paddingBottom: 36 }}>
          <Flex direction="column" gap="4">
            <Flex direction="column" gap="3">
              <Heading size="6">Dein Home</Heading>
              {data?.welcomeText ? (
                <Card size="2">
                  <Flex direction="column" gap="2">
                    <Flex justify="between" align="center">
                      <Badge color="purple" variant="solid">
                        AI Generated Message
                      </Badge>
                      <Button size="1" variant="ghost" onClick={refresh}>
                        <ReloadIcon /> Refresh Message
                      </Button>
                    </Flex>
                    <Text size="3" style={{ lineHeight: 1.5 }}>
                      {data.welcomeText}
                    </Text>
                  </Flex>
                </Card>
              ) : (
                <Text color="gray" size="2">
                  Push-basierte Widgets mit Baseline-on-read (min. 3) und Signalen.
                </Text>
              )}
            </Flex>

            <Flex gap="2" align="center" wrap="wrap">
              <Button variant="soft" onClick={refresh}>
                <Flex align="center" gap="2">
                  <ReloadIcon /> Refresh
                </Flex>
              </Button>
              {isLoading ? <Badge color="gray">Lädt…</Badge> : null}
              {data ? <Badge color="gray">Widgets: {data.widgets.length}</Badge> : null}
            </Flex>

            {error ? (
              <Callout.Root color="red" role="alert">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>
                  Fehler beim Laden: {error}
                  <Box style={{ marginTop: 10 }}>
                    <Button onClick={refresh}>Retry</Button>
                  </Box>
                </Callout.Text>
              </Callout.Root>
            ) : null}

            {isLoading && !data ? <LoadingGrid /> : null}

            {!isLoading && data && data.widgets.length === 0 ? (
              <Callout.Root color="amber" role="status">
                <Callout.Text>
                  Keine Widgets. Falls das passiert, ist das ein Bug — Baseline-on-read sollte min. 3 liefern.
                </Callout.Text>
              </Callout.Root>
            ) : null}

            {data && data.widgets.length > 0 ? (
              <Grid columns={{ initial: '1', md: '2' }} gap="3">
                <WidgetRenderer widgets={data.widgets} />
              </Grid>
            ) : null}
          </Flex>
        </Container>
      </Box>
  );
}
