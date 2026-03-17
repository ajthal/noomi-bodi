import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  ActionSheetIOS,
  StyleSheet,
} from 'react-native';
import {
  launchImageLibrary,
  launchCamera,
  type ImagePickerResponse,
  type CameraOptions,
} from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';

const IMAGE_PICKER_OPTIONS: CameraOptions = {
  mediaType: 'photo',
  includeBase64: true,
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.8,
};

export interface PendingImage {
  uri: string;
  base64: string;
  mimeType: string;
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (image: PendingImage | null) => void;
  placeholder?: string;
  disabled?: boolean;
  sendIcon?: string;
  /** Whether the image attachment button is shown. Defaults to true. */
  showImagePicker?: boolean;
}

export default function ChatInputBox({
  value,
  onChangeText,
  onSend,
  placeholder = 'Type a message...',
  disabled = false,
  sendIcon = 'arrow-up-circle',
  showImagePicker = true,
}: Props) {
  const { colors } = useTheme();
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);

  const canSend = !disabled && (!!value.trim() || !!pendingImage);

  const handleImageSelected = useCallback((result: ImagePickerResponse) => {
    if (result.didCancel || result.errorCode || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.base64 || !asset.uri) return;
    setPendingImage({
      uri: asset.uri,
      base64: asset.base64,
      mimeType: asset.type || 'image/jpeg',
    });
  }, []);

  const handleImagePick = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        idx => {
          if (idx === 1) launchCamera(IMAGE_PICKER_OPTIONS, handleImageSelected);
          else if (idx === 2) launchImageLibrary(IMAGE_PICKER_OPTIONS, handleImageSelected);
        },
      );
    } else {
      Alert.alert('Add Photo', 'Choose an option', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => launchCamera(IMAGE_PICKER_OPTIONS, handleImageSelected) },
        { text: 'Choose from Library', onPress: () => launchImageLibrary(IMAGE_PICKER_OPTIONS, handleImageSelected) },
      ]);
    }
  }, [handleImageSelected]);

  const handleSend = () => {
    if (!canSend) return;
    const img = pendingImage;
    setPendingImage(null);
    onSend(img);
  };

  return (
    <View style={[s.box, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
      {pendingImage && (
        <View style={s.imageRow}>
          <View style={s.imageWrapper}>
            <Image source={{ uri: pendingImage.uri }} style={s.imageThumb} />
            <TouchableOpacity
              style={[s.imageRemove, { backgroundColor: colors.background }]}
              onPress={() => setPendingImage(null)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <TextInput
        style={[s.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        multiline
        editable={!disabled}
      />
      <View style={s.actionsRow}>
        {showImagePicker && (
          <TouchableOpacity
            onPress={handleImagePick}
            disabled={disabled}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="add"
              size={26}
              color={disabled ? colors.textTertiary : colors.textSecondary}
            />
          </TouchableOpacity>
        )}
        <View style={s.spacer} />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={sendIcon as any}
            size={32}
            color={canSend ? '#7C3AED' : colors.textTertiary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Expose the image picker options so callers can cache base64 data externally. */
export { IMAGE_PICKER_OPTIONS };

const s = StyleSheet.create({
  box: {
    marginHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  imageRow: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  imageWrapper: {
    alignSelf: 'flex-start',
  },
  imageThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  imageRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    borderRadius: 10,
  },
  input: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    fontSize: 15,
    maxHeight: 100,
    minHeight: 36,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  spacer: {
    flex: 1,
  },
});
