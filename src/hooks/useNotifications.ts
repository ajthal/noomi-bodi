import { useEffect, useRef } from 'react';
import {
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
} from '@react-native-firebase/messaging';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import type { NavigationContainerRef } from '@react-navigation/native';
import {
  registerForPushNotifications,
  onTokenRefresh,
  upsertToken,
} from '../services/notifications';

function handleNotificationNavigation(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage | null,
  navRef: React.RefObject<NavigationContainerRef<any> | null>,
) {
  if (!remoteMessage?.data?.type || !navRef.current) return;

  switch (remoteMessage.data.type) {
    case 'friend_request':
    case 'friend_accepted':
    case 'streak_milestone':
      navRef.current.navigate('MainTabs' as never, { screen: 'Social' } as never);
      break;
    case 'shared_meal':
      navRef.current.navigate('MainTabs' as never, { screen: 'Meals' } as never);
      break;
  }
}

export function useNotifications(
  enabled: boolean,
  navigationRef: React.RefObject<NavigationContainerRef<any> | null>,
) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!enabled || initialized.current) return;
    initialized.current = true;

    const messaging = getMessaging();

    registerForPushNotifications().catch(() => {});

    const unsubRefresh = onTokenRefresh(token => {
      upsertToken(token).catch(() => {});
    });

    const unsubForeground = onMessage(messaging, async _remoteMessage => {
      // No in-app banner; user already sees data on-screen
    });

    const unsubBackground = onNotificationOpenedApp(messaging, remoteMessage => {
      handleNotificationNavigation(remoteMessage, navigationRef);
    });

    getInitialNotification(messaging).then(remoteMessage => {
      handleNotificationNavigation(remoteMessage, navigationRef);
    });

    return () => {
      initialized.current = false;
      unsubRefresh();
      unsubForeground();
      unsubBackground();
    };
  }, [enabled, navigationRef]);
}
