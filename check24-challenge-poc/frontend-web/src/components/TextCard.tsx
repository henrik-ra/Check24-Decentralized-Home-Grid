import type { SduiComponent } from '../types';
import { Flex, Text } from '@radix-ui/themes';

type Props = {
  component: SduiComponent;
};

export function TextCard({ component }: Props) {
  const props = component.props ?? {};
  const title = typeof props.title === 'string' ? props.title : 'Info';
  const text = typeof props.text === 'string' ? props.text : '';
  const label = typeof props.label === 'string' ? props.label : undefined;
  const imageUrl = typeof props.imageUrl === 'string' ? props.imageUrl : undefined;

  return (
    <Flex direction="column" gap="2">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 12 }}
        />
      ) : null}
      {label ? (
        <Text size="1" color="gray" weight="bold" style={{ letterSpacing: 0.2, textTransform: 'uppercase' }}>
          {label}
        </Text>
      ) : null}
      <Text size="3" weight="bold">
        {title}
      </Text>
      {text ? (
        <Text size="2" color="gray">
          {text}
        </Text>
      ) : null}
    </Flex>
  );
}
