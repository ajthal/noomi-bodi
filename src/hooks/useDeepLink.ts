import { useEffect, useRef, useCallback } from 'react';
import { Linking } from 'react-native';

type DeepLinkAction = 'quick-log' | null;

export function useDeepLink(onAction: (action: DeepLinkAction) => void) {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const handleURL = useCallback((url: string | null) => {
    if (!url) return;
    if (url === 'noomibodi://quick-log') {
      onActionRef.current('quick-log');
    }
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(handleURL);

    const sub = Linking.addEventListener('url', ({ url }) => handleURL(url));
    return () => sub.remove();
  }, [handleURL]);
}
