import type { ReactNode } from 'react';
import { Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { X } from 'lucide-react-native';
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
  const resolvedUri = highQualityImageUri(uri);
  const imageHeight = Math.max(320, height - 150);

  return (
    <Modal visible={visible} transparent={false} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.topBar}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.05} style={styles.title}>{title || ''}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer la photo" onPress={onClose} style={styles.closeButton}>
              <X size={22} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>
          </View>
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            bouncesZoom
            centerContent
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View accessibilityRole="image" style={[styles.photoFrame, { width, minHeight: imageHeight }]}>
              {resolvedUri ? (
                <Image source={{ uri: resolvedUri, cache: 'force-cache' }} resizeMethod="auto" style={[styles.photo, { width, height: imageHeight }]} resizeMode={imageResizeMode} />
              ) : (
                <Text maxFontSizeMultiplier={1.05} style={styles.fallbackText}>{fallbackText}</Text>
              )}
            </View>
          </ScrollView>
          {children ? <View style={styles.actions}>{children}</View> : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  topBar: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.88)',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFrame: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { backgroundColor: '#000000' },
  fallbackText: { color: '#FFFFFF', fontSize: 72, lineHeight: 82, fontWeight: '900' },
  title: { flex: 1, color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 20,
    alignItems: 'center',
  },
});
