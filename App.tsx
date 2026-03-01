import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import ChatTabScreen from './src/screens/ChatTabScreen';
import MealsScreen from './src/screens/MealsScreen';
import ReportsTabScreen from './src/screens/ReportsTabScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminDashboard from './src/screens/AdminDashboard';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { loadUserProfile, clearUserProfile, clearMessages } from './src/services/storage';
import { OnboardingContext } from './src/contexts/OnboardingContext';
import { useOfflineSync } from './src/hooks/useOfflineSync';
import { getUserRole, type UserRole } from './src/utils/roleCheck';

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
        <Tab.Screen name="Meals" component={MealsScreen} />
        <Tab.Screen name="Reports" component={ReportsTabScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
        {showAdmin && <Tab.Screen name="Admin" component={AdminDashboard} />}
      </Tab.Navigator>
    </SafeAreaView>
  );
}

function OfflineBanner({ isOnline, pendingCount }: { isOnline: boolean; pendingCount: number }) {
  if (isOnline && pendingCount === 0) return null;
  const label = !isOnline
    ? 'You are offline'
    : `Syncing ${pendingCount} pending item${pendingCount !== 1 ? 's' : ''}...`;

  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineBannerText}>{label}</Text>
    </View>
  );
}

function AppInner() {
  const { isDark, colors } = useTheme();
  const { user, isLoading: isAuthLoading, signOut } = useAuth();
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const { isOnline, pendingCount } = useOfflineSync();

  useEffect(() => {
    // @ts-ignore - loadFont is available at runtime
    Ionicons.loadFont?.();
  }, []);

  // One-time check when auth first resolves on app launch.
  useEffect(() => {
    if (isAuthLoading || initialCheckDone) return;

    if (!user) {
      setInitialCheckDone(true);
      return;
    }

    Promise.all([
      loadUserProfile(),
      getUserRole(),
    ])
      .then(([profile, role]) => {
        setIsOnboarded(!!profile);
        setUserRole(role);
      })
      .catch(() => setIsOnboarded(false))
      .finally(() => setInitialCheckDone(true));
  }, [isAuthLoading, user, initialCheckDone]);

  // React to sign-out after the initial check is done.
  useEffect(() => {
    if (!initialCheckDone || isAuthLoading) return;
    if (!user) {
      setIsOnboarded(false);
      setUserRole(null);
    }
  }, [user, initialCheckDone, isAuthLoading]);

  const handleOnboardingComplete = useCallback(() => {
    setIsOnboarded(true);
  }, []);

  const onResetProfile = useCallback(async () => {
    await clearUserProfile();
    await clearMessages();
    await signOut();
  }, [signOut]);

  const isLoading = isAuthLoading || !initialCheckDone;

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.background, card: colors.background } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background } };

  if (isLoading) {
    return (
      <NavigationContainer theme={navTheme}>
        <SafeAreaView style={[styles.loadingContainer, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={colors.statusBar} />
          <View style={styles.loadingInner}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        </SafeAreaView>
      </NavigationContainer>
    );
  }

  return (
    <OnboardingContext.Provider value={{ onResetProfile }}>
      <NavigationContainer theme={navTheme}>
        <StatusBar barStyle={colors.statusBar} />
        <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} />
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {isOnboarded ? (
            <RootStack.Screen name="MainTabs">
              {() => <MainTabs showAdmin={userRole === 'admin'} />}
            </RootStack.Screen>
          ) : (
            <RootStack.Screen name="Onboarding">
              {() => <OnboardingScreen onComplete={handleOnboardingComplete} />}
            </RootStack.Screen>
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </OnboardingContext.Provider>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ThemeProvider>
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
  offlineBanner: {
    backgroundColor: '#FF9800',
    paddingVertical: 4,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default App;
