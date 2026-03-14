import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
import ChatTabScreen from './src/screens/ChatTabScreen';
import MealsTabScreen from './src/screens/MealsTabScreen';
import ReportsTabScreen from './src/screens/ReportsTabScreen';
import ProfileTabScreen from './src/screens/ProfileTabScreen';
import SocialScreen from './src/screens/SocialScreen';
import AdminDashboard from './src/screens/AdminDashboard';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SignInScreen from './src/screens/SignInScreen';
import EmailVerificationScreen from './src/screens/EmailVerificationScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import FriendProfileScreen from './src/screens/FriendProfileScreen';
import { loadUserProfile, clearUserProfile, clearMessages } from './src/services/storage';
import { clearAllSavedMeals } from './src/services/savedMeals';
import { clearOfflineData } from './src/services/offlineStore';
import { OnboardingContext } from './src/contexts/OnboardingContext';
import { useOfflineSync } from './src/hooks/useOfflineSync';
import { useNotifications } from './src/hooks/useNotifications';
import { getUserRole, type UserRole } from './src/utils/roleCheck';

const ONBOARDING_COMPLETE_KEY = '@noomibodi_onboarding_complete';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

function MainTabs({ showAdmin }: { showAdmin: boolean }) {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => {
            let iconName: string;

            if (route.name === 'Home') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'Meals') {
              iconName = focused ? 'restaurant' : 'restaurant-outline';
            } else if (route.name === 'Reports') {
              iconName = focused ? 'stats-chart' : 'stats-chart-outline';
            } else if (route.name === 'Social') {
              iconName = focused ? 'people' : 'people-outline';
            } else if (route.name === 'Admin') {
              iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline';
            } else {
              iconName = focused ? 'person' : 'person-outline';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.tabBarActive,
          tabBarInactiveTintColor: colors.tabBarInactive,
          tabBarStyle: {
            backgroundColor: colors.tabBarBg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.tabBarBorder,
          },
        })}
      >
        <Tab.Screen name="Home" component={ChatTabScreen} />
        <Tab.Screen name="Meals" component={MealsTabScreen} />
        <Tab.Screen name="Reports" component={ReportsTabScreen} />
        <Tab.Screen name="Social" component={SocialScreen} />
        <Tab.Screen name="Profile" component={ProfileTabScreen} />
        {showAdmin && <Tab.Screen name="Admin" component={AdminDashboard} />}
      </Tab.Navigator>
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
            </>
          )}
          {screen === 'emailVerification' && (
            <RootStack.Screen name="EmailVerification">
              {() => <EmailVerificationScreen onVerified={handleEmailVerified} />}
            </RootStack.Screen>
          )}
          {screen === 'signIn' && (
            <RootStack.Screen name="SignIn">
              {() => <SignInScreen onSignedIn={handleSignedIn} />}
            </RootStack.Screen>
          )}
          {screen === 'onboarding' && (
            <RootStack.Screen name="Onboarding">
              {() => <OnboardingScreen onComplete={handleOnboardingComplete} />}
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
