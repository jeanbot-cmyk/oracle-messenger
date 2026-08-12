import type { ReactNode } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { X } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { highQualityImageUri } from './homeUtils';

type NativePhotoViewerProps = {
  visible: boolean;
  uri?: string | null;
  title?: string;
  fallbackText?: string;
  imageResizeMode?: 'cover' | 'contain';
  onClose: () => void;
  children?: ReactNode;
};

export function NativePhotoViewer({
  visible,
  uri,
  title,
  fallbackText = '?',
  imageResizeMode = 'cover',
  onClose,
  children,
}: NativePhotoViewerProps) {
  const { width, height } = useWindowDimensions();
  const photoSize = Math.max(240, Math.min(width - 34, height - 210, 430));
  const resolvedUri = highQualityImageUri(uri);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable accessibilityRole="image" style={styles.card} onPress={event => event.stopPropagation()}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer la photo" onPress={onClose} style={styles.closeButton}>
            <X size={22} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
          <View style={[styles.photoFrame, { width: photoSize, height: photoSize, borderRadius: 28 }]}>
            {resolvedUri ? (
              <>
                <Image source={{ uri: resolvedUri, cache: 'force-cache' }} resizeMethod="auto" style={styles.photo} resizeMode={imageResizeMode} />
                <View pointerEvents="none" style={styles.photoFilter} />
              </>
            ) : (
              <Text maxFontSizeMultiplier={1.05} style={styles.fallbackText}>{fallbackText}</Text>
            )}
          </View>
          {title ? <Text numberOfLines={2} maxFontSizeMultiplier={1.08} style={styles.title}>{title}</Text> : null}
          {children ? <View style={styles.actions}>{children}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 17,
    paddingVertical: 28,
  },
  card: {
    width: '100%',
    maxWidth: 462,
    alignItems: 'center',
    gap: 14,
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFrame: {
    backgroundColor: '#050505',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.92)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  photo: { width: '100%', height: '100%' },
  photoFilter: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  fallbackText: { color: colors.header, fontSize: 78, lineHeight: 88, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 22, lineHeight: 27, fontWeight: '900', textAlign: 'center' },
  actions: { width: '100%', alignItems: 'center' },
});
