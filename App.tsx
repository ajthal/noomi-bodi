import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { ImpersonationProvider, useImpersonation } from './src/contexts/ImpersonationContext';
import ImpersonationBanner from './src/components/ImpersonationBanner';
import { OfflineBanner } from './src/components/OfflineBanner';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import TopBar from './src/components/TopBar';
import SubTabBar, { type SubTabIcon } from './src/components/SubTabBar';
import CustomBottomTabBar from './src/components/CustomBottomTabBar';
import QuickLogPage from './src/screens/QuickLogPage';
import MealsScreen from './src/screens/MealsScreen';
import SharedMealsPage from './src/screens/SharedMealsPage';
import ReportsScreen from './src/screens/ReportsScreen';
import InsightsPage from './src/screens/InsightsPage';
import SocialScreen from './src/screens/SocialScreen';
import AdminDashboard from './src/screens/AdminDashboard';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SignInScreen from './src/screens/SignInScreen';
import EmailVerificationScreen from './src/screens/EmailVerificationScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import FriendProfileScreen from './src/screens/FriendProfileScreen';
import ProfilePage from './src/screens/ProfilePage';
import SettingsPage from './src/screens/SettingsPage';
import ChatScreen from './src/screens/ChatScreen';
import { loadUserProfile, clearUserProfile, clearMessages } from './src/services/storage';
import { clearAllSavedMeals } from './src/services/savedMeals';
import { clearOfflineData } from './src/services/offlineStore';
import { OnboardingContext } from './src/contexts/OnboardingContext';
import { useOfflineSync } from './src/hooks/useOfflineSync';
import { useNotifications } from './src/hooks/useNotifications';
import { getUserRole, type UserRole } from './src/utils/roleCheck';

const ONBOARDING_COMPLETE_KEY = '@noomibodi_onboarding_complete';

const Tab = createMaterialTopTabNavigator();
const RootStack = createNativeStackNavigator();

// ── Tab group definitions ───────────────────────────────────────────
interface TabGroupDef {
  group: string;
  screens: string[];
}

const STANDARD_GROUPS: TabGroupDef[] = [
  { group: 'Home', screens: ['Home'] },
  { group: 'Meals', screens: ['MyMeals', 'SharedMeals'] },
  { group: 'Reports', screens: ['Reports', 'Insights'] },
  { group: 'Social', screens: ['Social'] },
];
const ADMIN_GROUP: TabGroupDef = { group: 'Admin', screens: ['Admin'] };

const MEALS_ICONS: SubTabIcon[] = [
  { name: 'restaurant' },
  { name: 'share-social' },
];

const REPORTS_ICONS: SubTabIcon[] = [
  { name: 'stats-chart' },
  { name: 'sparkles' },
];

function MainTabs({ showAdmin }: { showAdmin: boolean }) {
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const tabNavRef = React.useRef<any>(null);

  const groups = useMemo(
    () => (showAdmin ? [...STANDARD_GROUPS, ADMIN_GROUP] : STANDARD_GROUPS),
    [showAdmin],
  );

  const allScreens = useMemo(() => groups.flatMap(g => g.screens), [groups]);

  const activeGroup = useMemo(() => {
    const screenName = allScreens[currentIndex] ?? allScreens[0];
    return groups.find(g => g.screens.includes(screenName))?.group ?? 'Home';
  }, [currentIndex, allScreens, groups]);

  const subTabConfig = useMemo(() => {
    const g = groups.find(gr => gr.group === activeGroup);
    if (!g || g.screens.length <= 1) return null;
    const groupStartIndex = allScreens.indexOf(g.screens[0]);
    const activeSubIndex = currentIndex - groupStartIndex;
    if (activeGroup === 'Meals') {
      const icons = MEALS_ICONS.map((icon, i) =>
        i === 1 ? { ...icon, badge: unreadCount > 0 } : icon,
      );
      return { icons, activeSubIndex, groupStartIndex };
    }
    if (activeGroup === 'Reports') {
      return { icons: REPORTS_ICONS, activeSubIndex, groupStartIndex };
    }
    return null;
  }, [activeGroup, currentIndex, allScreens, groups, unreadCount]);

  const jumpTo = useCallback(
    (screenName: string) => {
      tabNavRef.current?.jumpTo(screenName);
    },
    [],
  );

  const handleBottomTabPress = useCallback(
    (groupKey: string) => {
      const g = groups.find(gr => gr.group === groupKey);
      if (g) jumpTo(g.screens[0]);
    },
    [groups, jumpTo],
  );

  const handleSubTabPress = useCallback(
    (subIndex: number) => {
      if (!subTabConfig) return;
      const screenName = allScreens[subTabConfig.groupStartIndex + subIndex];
      if (screenName) jumpTo(screenName);
    },
    [subTabConfig, allScreens, jumpTo],
  );

  const handleUnreadCount = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <TopBar />
      {subTabConfig && (
        <SubTabBar
          icons={subTabConfig.icons}
          activeIndex={subTabConfig.activeSubIndex}
          onPress={handleSubTabPress}
        />
      )}
      <Tab.Navigator
        tabBar={({ navigation: innerNav, state: innerState }) => {
          tabNavRef.current = innerNav;
          if (innerState.index !== currentIndex) {
            requestAnimationFrame(() => setCurrentIndex(innerState.index));
          }
          return null;
        }}
        screenOptions={{ lazy: true }}
      >
        <Tab.Screen name="Home" component={QuickLogPage} />
        <Tab.Screen name="MyMeals" component={MealsScreen} />
        <Tab.Screen name="SharedMeals">
          {() => <SharedMealsPage onUnreadCountChange={handleUnreadCount} />}
        </Tab.Screen>
        <Tab.Screen name="Reports" component={ReportsScreen} />
        <Tab.Screen name="Insights" component={InsightsPage} />
        <Tab.Screen name="Social" component={SocialScreen} />
        {showAdmin && <Tab.Screen name="Admin" component={AdminDashboard} />}
      </Tab.Navigator>
      <CustomBottomTabBar
        activeGroup={activeGroup}
        onTabPress={handleBottomTabPress}
        showAdmin={showAdmin}
      />
    </SafeAreaView>
  );
}

type AppScreen = 'loading' | 'onboarding' | 'signIn' | 'emailVerification' | 'main';

function AppInner() {
  const { isDark, colors } = useTheme();
  const { user, isLoading: isAuthLoading, signOut } = useAuth();
  const { isImpersonating, isSwitching } = useImpersonation();
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [signInFromOnboarding, setSignInFromOnboarding] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const { isOnline, pendingCount } = useOfflineSync();
  const navigationRef = React.useRef<any>(null);
  useNotifications(screen === 'main' && !!user, navigationRef);

  useEffect(() => {
    // @ts-ignore - loadFont is available at runtime
    Ionicons.loadFont?.();
  }, []);

  // Reset the initial check when impersonation switching finishes so the
  // profile/role is re-evaluated for the newly signed-in user.
  const wasSwitchingRef = React.useRef(false);
  useEffect(() => {
    if (isSwitching) {
      wasSwitchingRef.current = true;
    } else if (wasSwitchingRef.current) {
      wasSwitchingRef.current = false;
      setInitialCheckDone(false);
      needsUsernameCheckedRef.current = false;
    }
  }, [isSwitching]);

  // One-time check when auth first resolves on app launch.
  useEffect(() => {
    if (isAuthLoading || initialCheckDone) return;

    if (!user) {
      AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY).then(flag => {
        setScreen(flag ? 'signIn' : 'onboarding');
        setInitialCheckDone(true);
      });
      return;
    }

    Promise.all([
      loadUserProfile(),
      getUserRole(),
    ])
      .then(([profile, role]) => {
        if (profile) {
          AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, '1');
          if (user && !user.email_confirmed_at) {
            setScreen('emailVerification');
          } else {
            setScreen('main');
          }
        } else {
          setScreen('onboarding');
        }
        setUserRole(role);
      })
      .catch(() => setScreen('onboarding'))
      .finally(() => setInitialCheckDone(true));
  }, [isAuthLoading, user, initialCheckDone]);

  // React to sign-out after the initial check is done.
  // Suppress during impersonation switching to avoid flashing the sign-in screen.
  useEffect(() => {
    if (!initialCheckDone || isAuthLoading || isSwitching) return;
    if (!user && (screen === 'main' || screen === 'emailVerification')) {
      setScreen('signIn');
      setUserRole(null);
    }
  }, [user, initialCheckDone, isAuthLoading, isSwitching, screen]);

  // Ensure role is fetched once user is authenticated and on the main screen.
  useEffect(() => {
    if (user && screen === 'main' && userRole === null) {
      getUserRole().then(role => {
        if (role) setUserRole(role);
      });
    }
  }, [user, screen, userRole]);

  const [needsUsername, setNeedsUsername] = useState(false);
  const needsUsernameCheckedRef = React.useRef(false);

  // Check if user needs to set a username (existing users before social features)
  useEffect(() => {
    if (screen !== 'main' || !user || needsUsernameCheckedRef.current) return;
    needsUsernameCheckedRef.current = true;
    loadUserProfile().then(profile => {
      if (profile && !profile.username) {
        setNeedsUsername(true);
      }
    });
  }, [screen, user]);

  const handleOnboardingComplete = useCallback(() => {
    AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, '1');
    if (user && !user.email_confirmed_at) {
      setScreen('emailVerification');
    } else {
      setScreen('main');
    }
  }, [user]);

  const handleEmailVerified = useCallback(() => {
    getUserRole().then(role => {
      if (role) setUserRole(role);
    });
    setScreen('main');
  }, []);

  const handleSignedIn = useCallback(() => {
    Promise.all([loadUserProfile(), getUserRole()])
      .then(([profile, role]) => {
        setUserRole(role);
        if (!profile) {
          setScreen('onboarding');
        } else if (user && !user.email_confirmed_at) {
          setScreen('emailVerification');
        } else {
          setScreen('main');
        }
      })
      .catch(() => setScreen('onboarding'));
  }, [user]);

  const onResetProfile = useCallback(async () => {
    await clearAllSavedMeals();
    await clearUserProfile();
    await clearMessages();
    await clearOfflineData();
    await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
    await signOut();
    setScreen('onboarding');
  }, [signOut]);

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background, card: colors.background } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background } };

  if (screen === 'loading' || isAuthLoading || !initialCheckDone || isSwitching) {
    return (
      <NavigationContainer theme={navTheme}>
        <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={colors.statusBar} />
          <View style={styles.loadingInner}>
            <ActivityIndicator size="large" color={colors.accent} />
            {isSwitching && (
              <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 14 }}>Switching account...</Text>
            )}
          </View>
        </SafeAreaView>
      </NavigationContainer>
    );
  }

  return (
    <OnboardingContext.Provider value={{ onResetProfile }}>
      <View style={[styles.appWrapper, isImpersonating && styles.impersonatingBorder]}>
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <StatusBar barStyle={colors.statusBar} />
        <ImpersonationBanner />
        <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} />
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {screen === 'main' && (
            <>
              <RootStack.Screen name="MainTabs">
                {() => <MainTabs showAdmin={userRole === 'admin'} />}
              </RootStack.Screen>
              <RootStack.Screen
                name="EditProfile"
                component={EditProfileScreen}
                initialParams={{ isInitialSetup: needsUsername }}
                listeners={{
                  beforeRemove: () => {
                    if (needsUsername) setNeedsUsername(false);
                  },
                }}
              />
              <RootStack.Screen name="FriendProfile" component={FriendProfileScreen} />
              <RootStack.Screen name="ProfileScreen" component={ProfilePage} />
              <RootStack.Screen name="SettingsScreen" component={SettingsPage} />
              <RootStack.Screen name="ChatScreen" component={ChatScreen} />
            </>
          )}
          {screen === 'emailVerification' && (
            <RootStack.Screen name="EmailVerification">
              {() => <EmailVerificationScreen onVerified={handleEmailVerified} />}
            </RootStack.Screen>
          )}
          {screen === 'signIn' && (
            <RootStack.Screen name="SignIn">
              {() => <SignInScreen onSignedIn={handleSignedIn} onBack={signInFromOnboarding ? () => { setSignInFromOnboarding(false); setScreen('onboarding'); } : undefined} />}
            </RootStack.Screen>
          )}
          {screen === 'onboarding' && (
            <RootStack.Screen name="Onboarding">
              {() => <OnboardingScreen onComplete={handleOnboardingComplete} onSignIn={() => { setSignInFromOnboarding(true); setScreen('signIn'); }} />}
            </RootStack.Screen>
          )}
        </RootStack.Navigator>
      </NavigationContainer>
      </View>
    </OnboardingContext.Provider>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ThemeProvider>
          <AuthProvider>
            <ImpersonationProvider>
              <AppInner />
            </ImpersonationProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  loadingInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appWrapper: {
    flex: 1,
  },
  impersonatingBorder: {
    borderWidth: 2,
    borderColor: '#EF4444',
  },
});

export default App;
