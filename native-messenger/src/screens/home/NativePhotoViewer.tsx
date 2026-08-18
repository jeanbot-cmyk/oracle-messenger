import type { ReactNode } from 'react';
import { Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { highQualityImageUri } from './homeUtils';

type NativePhotoViewerProps = {
  visible: boolean;
  uri?: string | null;
  source?: ImageSourcePropType;
  title?: string;
  fallbackText?: string;
  imageResizeMode?: 'cover' | 'contain';
  imageWidth?: number;
  imageHeight?: number;
  onClose: () => void;
  children?: ReactNode;
};

export function NativePhotoViewer({
  visible,
  uri,
  source,
  title,
  fallbackText = '?',
  imageResizeMode = 'cover',
  imageWidth,
  imageHeight,
  onClose,
  children,
}: NativePhotoViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const resolvedUri = highQualityImageUri(uri);
  const imageSource = source || (resolvedUri ? { uri: resolvedUri, cache: 'force-cache' as const } : null);
  const reservedHeight = children ? 230 : 170;
  const frame = viewerFrame(width, height, reservedHeight, imageWidth, imageHeight);
  const actionsBottom = children ? Math.max(insets.bottom + 50, 88) : 0;

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
            contentContainerStyle={[
              styles.scrollContent,
              children ? styles.scrollContentWithActions : null,
              children ? { paddingBottom: actionsBottom + 74 } : null,
            ]}
          >
            <View accessibilityRole="image" style={[styles.photoFrame, { width: frame.width, height: frame.height }]}>
              {imageSource ? (
                <Image source={imageSource} resizeMethod="auto" style={styles.photo} resizeMode={imageResizeMode} />
              ) : (
                <Text maxFontSizeMultiplier={1.05} style={styles.fallbackText}>{fallbackText}</Text>
              )}
            </View>
          </ScrollView>
          {children ? <View style={[styles.actions, { bottom: actionsBottom }]}>{children}</View> : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function viewerFrame(screenWidth: number, screenHeight: number, reservedHeight: number, imageWidth?: number, imageHeight?: number) {
  const maxWidth = Math.max(220, screenWidth - 16);
  const maxHeight = Math.max(220, screenHeight - reservedHeight);
  const hasDimensions = Boolean(
    imageWidth &&
    imageHeight &&
    Number.isFinite(imageWidth) &&
    Number.isFinite(imageHeight) &&
    imageWidth > 0 &&
    imageHeight > 0,
  );
  if (!hasDimensions) {
    const size = Math.max(220, Math.min(maxWidth, maxHeight));
    return { width: size, height: size };
  }
  const ratio = Math.max(0.34, Math.min(2.6, Number(imageWidth) / Number(imageHeight)));
  let frameWidth = maxWidth;
  let frameHeight = frameWidth / ratio;
  if (ratio < 0.78) {
    frameHeight = maxHeight;
    frameWidth = Math.min(maxWidth, frameHeight * ratio);
  } else if (frameHeight > maxHeight) {
    frameHeight = maxHeight;
    frameWidth = frameHeight * ratio;
  }
  return {
    width: Math.max(220, Math.round(frameWidth)),
    height: Math.max(220, Math.round(frameHeight)),
  };
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
    paddingHorizontal: 12,
    paddingVertical: 18,
  },
  scrollContentWithActions: {
    paddingBottom: 96,
  },
  photoFrame: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%', backgroundColor: '#000000' },
  fallbackText: { color: '#FFFFFF', fontSize: 72, lineHeight: 82, fontWeight: '900' },
  title: { flex: 1, color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
