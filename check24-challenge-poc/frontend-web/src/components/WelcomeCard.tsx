// WelcomeCard — zeigt den LLM-Welcome-Text als hellblaue 'Für dich zusammengestellt'-
// Karte (ersetzt den lila 'AI Generated Message'-Block). trimToSentence repariert
// mid-word abgebrochene LLM-Texte, der 3-Zeilen-Clamp ist der Längen-Guard.
// Kein eigener Refresh-Button — der Haupt-Aktualisieren-Button lädt ohnehin mit regenerateAI.

import { Card, Flex, Text } from '@radix-ui/themes';
import { MagicWandIcon } from '@radix-ui/react-icons';
import { trimToSentence } from '../ui/format';

type WelcomeCardProps = {
  welcomeText: string;
};

export function WelcomeCard({ welcomeText }: WelcomeCardProps) {
  const text = trimToSentence(welcomeText);
  if (!text) return null;

  return (
    <Card
      size="2"
      className="c24-enter"
      style={{ background: 'var(--c24-surface-info)', border: '1px solid var(--accent-6)' }}
    >
      <Flex direction="column" gap="2">
        <Flex gap="2" align="center">
          <MagicWandIcon width={14} height={14} color="var(--c24-blue)" />
          <Text size="1" weight="medium" style={{ color: 'var(--accent-11)' }}>
            Für dich zusammengestellt
          </Text>
        </Flex>
        <Text size="3" style={{ lineHeight: 1.6 }} className="c24-clamp-3">
          {text}
        </Text>
      </Flex>
    </Card>
  );
}
