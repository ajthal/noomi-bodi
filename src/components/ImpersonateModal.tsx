import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import BottomSheet from './BottomSheet';
import { useTheme } from '../contexts/ThemeContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { adminSearchUsers, type AdminProfile } from '../services/profileService';
import { TEST_ACCOUNTS } from '../utils/testAccounts';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#E91E63',
  beta: '#9C27B0',
  pro: '#FF9800',
  standard: '#2196F3',
  byok: '#607D8B',
};

const testAccountMap = new Map(TEST_ACCOUNTS.map(a => [a.email, a]));

export default function ImpersonateModal({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const { switchToUser } = useImpersonation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminProfile | null>(null);
  const [password, setPassword] = useState('');
  const [switching, setSwitching] = useState(false);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setSearchError(null);
      setSelected(null);
      setPassword('');
      setSwitching(false);
    }
  }, [visible]);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    setSelected(null);
    setPassword('');
    setSearchError(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (text.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const { data, error } = await adminSearchUsers(text);
      setResults(data);
      setSearchError(error);
      setSearching(false);
    }, 300);
  }, []);

  const handleSelect = useCallback((user: AdminProfile) => {
    setSelected(user);
    const testAccount = user.email ? testAccountMap.get(user.email) : null;
    setPassword(testAccount?.password ?? '');
  }, []);

  const handleImpersonate = useCallback(async () => {
    if (!selected?.email || !password) return;
    setSwitching(true);

    const label = selected.displayName
      ? `${selected.displayName} (@${selected.username ?? 'unknown'})`
      : `@${selected.username ?? selected.email}`;

    const { error } = await switchToUser(selected.email, password, label);
    setSwitching(false);

    if (error) {
      Alert.alert('Impersonation Failed', error);
    } else {
      onClose();
    }
  }, [selected, password, switchToUser, onClose]);

  const isTestAccount = selected?.email ? testAccountMap.has(selected.email) : false;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.container}>
        <Text style={[s.title, { color: colors.text }]}>Impersonate User</Text>

        <View style={[s.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search by username, email, or name..."
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Results */}
        {searching && (
          <View style={s.center}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        )}

        {!searching && searchError && (
          <Text style={[s.empty, { color: colors.error ?? '#EF4444' }]}>
            Search error: {searchError}
          </Text>
        )}

        {!searching && !searchError && query.length >= 2 && results.length === 0 && (
          <Text style={[s.empty, { color: colors.textTertiary }]}>No users found</Text>
        )}

        {!searching && results.length > 0 && !selected && (
          <View style={s.resultsList}>
            {results.map(user => (
              <TouchableOpacity
                key={user.id}
                style={[s.resultRow, { backgroundColor: colors.surface }]}
                onPress={() => handleSelect(user)}
                activeOpacity={0.6}
              >
                {user.profilePictureUrl ? (
                  <Image source={{ uri: user.profilePictureUrl }} style={s.avatar} />
                ) : (
                  <View style={[s.avatar, s.avatarPlaceholder, { backgroundColor: colors.border }]}>
                    <Ionicons name="person" size={18} color={colors.textTertiary} />
                  </View>
                )}
                <View style={s.resultInfo}>
                  <View style={s.resultNameRow}>
                    <Text style={[s.resultName, { color: colors.text }]} numberOfLines={1}>
                      {user.displayName ?? user.username ?? 'Unknown'}
                    </Text>
                    {user.role && (
                      <View style={[s.roleBadge, { backgroundColor: (ROLE_COLORS[user.role] ?? '#607D8B') + '20' }]}>
                        <Text style={[s.roleBadgeText, { color: ROLE_COLORS[user.role] ?? '#607D8B' }]}>
                          {user.role}
                        </Text>
                      </View>
                    )}
                    {user.email && testAccountMap.has(user.email) && (
                      <View style={[s.roleBadge, { backgroundColor: '#EF444420' }]}>
                        <Text style={[s.roleBadgeText, { color: '#EF4444' }]}>test</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.resultSub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {user.username ? `@${user.username}` : ''}
                    {user.username && user.email ? '  ·  ' : ''}
                    {user.email ?? ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Selected user */}
        {selected && (
          <View style={s.selectedSection}>
            <TouchableOpacity
              style={[s.selectedCard, { backgroundColor: colors.surface }]}
              onPress={() => { setSelected(null); setPassword(''); }}
              activeOpacity={0.7}
            >
              {selected.profilePictureUrl ? (
                <Image source={{ uri: selected.profilePictureUrl }} style={s.avatarLg} />
              ) : (
                <View style={[s.avatarLg, s.avatarPlaceholder, { backgroundColor: colors.border }]}>
                  <Ionicons name="person" size={24} color={colors.textTertiary} />
                </View>
              )}
              <View style={s.selectedInfo}>
                <Text style={[s.selectedName, { color: colors.text }]}>
                  {selected.displayName ?? selected.username ?? 'Unknown'}
                </Text>
                <Text style={[s.resultSub, { color: colors.textSecondary }]}>
                  {selected.username ? `@${selected.username}` : ''}
                  {selected.username && selected.email ? '  ·  ' : ''}
                  {selected.email ?? ''}
                </Text>
              </View>
              <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
            </TouchableOpacity>

            {!isTestAccount && (
              <TextInput
                style={[s.passwordInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                placeholder="Enter account password"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            {isTestAccount && (
              <Text style={[s.testHint, { color: colors.textSecondary }]}>
                Test account — password auto-filled
              </Text>
            )}

            <TouchableOpacity
              style={[
                s.impersonateBtn,
                { backgroundColor: '#EF4444' },
                (!password || switching) && { opacity: 0.5 },
              ]}
              onPress={handleImpersonate}
              disabled={!password || switching}
              activeOpacity={0.7}
            >
              {switching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="swap-horizontal" size={18} color="#fff" />
                  <Text style={s.impersonateBtnText}>Impersonate</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {!query && !selected && (
          <Text style={[s.hint, { color: colors.textTertiary }]}>
            Search for a user to impersonate their account. Test accounts will auto-fill credentials.
          </Text>
        )}
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    minHeight: 300,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  center: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  empty: {
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 24,
  },
  resultsList: {
    marginTop: 12,
    gap: 6,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  resultInfo: {
    flex: 1,
  },
  resultNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '600',
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  resultSub: {
    fontSize: 12,
    marginTop: 1,
  },
  selectedSection: {
    marginTop: 16,
    gap: 12,
  },
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  selectedInfo: {
    flex: 1,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: '700',
  },
  passwordInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
  },
  testHint: {
    fontSize: 12,
    textAlign: 'center',
  },
  impersonateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 10,
    gap: 8,
  },
  impersonateBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    lineHeight: 19,
  },
});
