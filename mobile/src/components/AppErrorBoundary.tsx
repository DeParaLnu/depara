import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useColors } from '../features/theme/useTheme';
import { log } from '../lib/logger';
import { StateView } from './StateView';

type Props = { children: ReactNode };
type State = { hasError: boolean };

// Окремий компонент: у класі границі помилок хуки теми недоступні
function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
      <StateView
        icon="alert-circle-outline"
        title="Щось пішло не так"
        description="Сталася неочікувана помилка. Спробуйте ще раз."
        actionLabel="Спробувати ще раз"
        onAction={onRetry}
      />
    </View>
  );
}

// Ловить помилки під час рендеру. Без нього у релізній збірці застосунок просто перезавантажується без сліду.
// Це клас, бо React не має хуків для границь помилок; саме componentDidCatch дає стек компонентів.
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('render', 'крах під час рендеру', error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <ErrorFallback onRetry={() => this.setState({ hasError: false })} />;
  }
}
