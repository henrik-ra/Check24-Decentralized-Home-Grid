import { useState } from 'react';
import { Button, Container, Flex, IconButton, Text } from '@radix-ui/themes';
import { Cross1Icon, HamburgerMenuIcon } from '@radix-ui/react-icons';
import { navigateWithSso } from '../sso';

type NavLinkItem = { label: string; url: string };

type NavbarProps = {
  user?: { email: string } | null;
  onLogout?: () => void;
  links?: NavLinkItem[];
};

/**
 * Produkt-Links als echte <a>-Elemente (Mittelklick/Copy-Link funktioniert),
 * Klick läuft über den SSO-Handoff. Einmal definiert, gerendert im
 * Desktop-Flex UND im Mobile-Panel — dedupliziert den alten App.tsx-Header.
 */
function NavLinks({
  links,
  direction,
  onNavigate,
}: {
  links: NavLinkItem[];
  direction: 'row' | 'column';
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="CHECK24 Produkte">
      <Flex direction={direction} gap={direction === 'row' ? '2' : '1'} align={direction === 'row' ? 'center' : 'stretch'}>
        {links.map((link) => (
          <a
            key={link.label}
            className="c24-nav-link"
            href={link.url}
            onClick={(e) => {
              // Modifizierte Klicks (Strg/Cmd/Shift/Mitteltaste) nicht kapern —
              // dann öffnet der Browser den href regulär (ohne SSO-Handoff).
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onNavigate?.();
              navigateWithSso(link.url);
            }}
          >
            {link.label}
          </a>
        ))}
      </Flex>
    </nav>
  );
}

/**
 * Sticky Navy-Header mit 3px-Gelb-Keyline (Styles in styles/theme.css).
 * Responsivität rein per CSS-Media-Query bei 767px — kein useIsMobile, kein
 * Resize-Listener; einziger State ist das geöffnete Mobile-Panel (isNavOpen).
 * Ohne user-Prop (Login-Screen) rendert nur die Wordmark-Zeile.
 */
export function Navbar({ user, onLogout, links = [] }: NavbarProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);

  return (
    <header className="c24-header">
      <Container size="3">
        <Flex align="center" gap="4" px="4" style={{ height: 56 }}>
          <Flex align="center" gap="2" style={{ flexShrink: 0 }}>
            <Text weight="bold" size="5" style={{ color: '#fff', letterSpacing: '-0.2px', fontWeight: 800 }}>
              CHECK24
            </Text>
            <Text size="2" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Home
            </Text>
          </Flex>

          {user ? (
            <>
              <div className="c24-nav-desktop" style={{ alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <NavLinks links={links} direction="row" />
                <Flex align="center" gap="3" style={{ marginLeft: 'auto', minWidth: 0 }}>
                  <Text size="2" className="c24-truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {user.email}
                  </Text>
                  <Button variant="ghost" style={{ color: '#fff' }} onClick={onLogout}>
                    Abmelden
                  </Button>
                </Flex>
              </div>

              <div className="c24-nav-burger" style={{ marginLeft: 'auto' }}>
                <IconButton
                  variant="ghost"
                  style={{ color: '#fff' }}
                  aria-expanded={isNavOpen}
                  aria-controls="c24-mobile-nav"
                  aria-label={isNavOpen ? 'Menü schließen' : 'Menü öffnen'}
                  onClick={() => setIsNavOpen((v) => !v)}
                >
                  {isNavOpen ? <Cross1Icon /> : <HamburgerMenuIcon />}
                </IconButton>
              </div>
            </>
          ) : null}
        </Flex>

        {user ? (
          // Bleibt gemountet — Öffnen/Schließen animiert theme.css über grid-template-rows
          <div id="c24-mobile-nav" data-open={isNavOpen}>
            <div>
              <Flex direction="column" gap="2" px="4" pb="3">
                <NavLinks links={links} direction="column" onNavigate={() => setIsNavOpen(false)} />
                <Flex align="center" justify="between" gap="3" style={{ minHeight: 44 }}>
                  <Text size="2" className="c24-truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {user.email}
                  </Text>
                  <Button variant="ghost" style={{ color: '#fff' }} onClick={onLogout}>
                    Abmelden
                  </Button>
                </Flex>
              </Flex>
            </div>
          </div>
        ) : null}
      </Container>
    </header>
  );
}
