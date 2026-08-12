import { Text, TextInput } from 'react-native';

type ScalableComponent = {
  defaultProps?: Record<string, unknown>;
};

export function configureNativeTextScaling() {
  const text = Text as unknown as ScalableComponent;
  const input = TextInput as unknown as ScalableComponent;

  text.defaultProps = {
    ...text.defaultProps,
    allowFontScaling: false,
    maxFontSizeMultiplier: 1,
  };
  input.defaultProps = {
    ...input.defaultProps,
    allowFontScaling: false,
    maxFontSizeMultiplier: 1,
  };
}
