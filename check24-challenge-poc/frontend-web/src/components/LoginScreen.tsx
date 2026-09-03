import React, { useState } from 'react';
import { Box, Button, Callout, Card, Container, Flex, Heading, Tabs, Text, TextField } from '@radix-ui/themes';
import { ExclamationTriangleIcon, PersonIcon } from '@radix-ui/react-icons';
import { Navbar } from './Navbar';

/**
 * Login/Registrierungs-Screen für nicht authentifizierte Nutzer.
 * Kapselt den kompletten Auth-Formular-State (Modus, Eingaben, Fehler, Pending);
 * der eigentliche Auth-Call kommt als onSubmit-Prop aus App.tsx.
 * E-Mail-Prefill nur im DEV-Build — abgesichert durch den sichtbaren Demo-Zugang-Hinweis.
 */

type Props = {
  onSubmit: (mode: 'login' | 'register', email: string, password: string) => Promise<void>;
  isDebug: boolean;
  apiBaseUrl: string;
};

export function LoginScreen({ onSubmit, isDebug, apiBaseUrl }: Props) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>(import.meta.env.DEV ? 'demo@check24.dev' : '');
  const [password, setPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthPending(true);
    try {
      await onSubmit(authMode, email, password);
    } catch (err) {
      // Server-Detail nur in der Konsole — Nutzer sieht eine deutsche Meldung
      console.error(err);
      setAuthError(
        authMode === 'login'
          ? 'Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort.'
          : 'Registrierung fehlgeschlagen. Bitte versuche es erneut.'
      );
    } finally {
      setAuthPending(false);
    }
  };

  return (
    <Box style={{ minHeight: '100vh' }}>
      {/* Navbar ohne user-Prop: nur Wordmark + Gelb-Keyline — Wiedererkennung ab Sekunde 1 */}
      <Navbar links={[]} />
      <main>
        <Container size="2" px="4" style={{ paddingTop: 64, paddingBottom: 64 }}>
          <Card size="4" className="c24-enter" style={{ maxWidth: 440, margin: '0 auto' }}>
            <Flex direction="column" gap="4">
              <Flex direction="column" gap="2">
                {/* Navy-Logo-PNG funktioniert auf weißem Card-Grund (nicht im Navy-Header) */}
                <img
                  src="/Logo_CHECK24.png"
                  alt=""
                  aria-hidden="true"
                  style={{ height: 40, width: 'auto', alignSelf: 'flex-start' }}
                />
                <Heading size="6">Willkommen bei CHECK24</Heading>
                <Text size="2" color="gray">
                  Melde dich an, um deine persönliche Startseite zu sehen.
                </Text>
                {isDebug ? (
                  <Text size="1" color="gray">
                    API: {apiBaseUrl}
                  </Text>
                ) : null}
              </Flex>

              <Tabs.Root
                value={authMode}
                onValueChange={(v) => {
                  setAuthError(null);
                  setAuthMode(v as 'login' | 'register');
                }}
              >
                <Tabs.List>
                  <Tabs.Trigger value="login">Anmelden</Tabs.Trigger>
                  <Tabs.Trigger value="register">Registrieren</Tabs.Trigger>
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
                <form onSubmit={handleSubmit}>
                  <Flex direction="column" gap="3">
                    <Flex direction="column" gap="2">
                      <Text as="label" htmlFor="login-email" size="2" weight="bold" color="gray">
                        E-Mail-Adresse
                      </Text>
                      <TextField.Root
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="name@beispiel.de"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      >
                        <TextField.Slot>
                          <PersonIcon />
                        </TextField.Slot>
                      </TextField.Root>
                    </Flex>

                    <Flex direction="column" gap="2">
                      <Text as="label" htmlFor="login-password" size="2" weight="bold" color="gray">
                        Passwort
                      </Text>
                      <TextField.Root
                        id="login-password"
                        type="password"
                        autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                        required
                        minLength={6}
                        placeholder=""
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </Flex>

                    <Button type="submit" size="3" style={{ width: '100%' }} loading={authPending}>
                      {authMode === 'login' ? 'Anmelden' : 'Registrieren'}
                    </Button>

                    <Text size="1" color="gray">
                      Demo-Zugang: demo@check24.dev · Passwort: demo123
                    </Text>
                  </Flex>
                </form>
              </Box>
            </Flex>
          </Card>
        </Container>
      </main>
    </Box>
  );
}
