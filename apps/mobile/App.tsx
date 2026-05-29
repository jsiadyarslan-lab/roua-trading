import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Linking,
  Platform,
  BackHandler,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';

const APP_URL = 'https://roua-trading-production.up.railway.app';
const PRIMARY_COLOR = '#0B0E14';
const ACCENT_COLOR = '#6366f1';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(APP_URL);
  const webViewRef = React.useRef(null);

  // Lock to portrait for trading app
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => backHandler.remove();
  }, [canGoBack]);

  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleNavigationStateChange = useCallback((navState) => {
    setCanGoBack(navState.canGoBack);
    setCurrentUrl(navState.url);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
  }, []);

  // JavaScript to inject into the WebView for better mobile experience
  const injectedJavaScript = `
    // Hide scrollbars
    document.documentElement.style.overflow = 'auto';
    
    // Remove any bounce effect on iOS
    document.body.style.overscrollBehavior = 'none';
    
    // Make sure the page fills the viewport
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.content = 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes';
    }
    
    true;
  `;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={PRIMARY_COLOR}
        translucent={false}
      />
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ uri: APP_URL }}
          style={styles.webview}
          startInLoadingState={true}
          allowsBackForwardNavigationGestures={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          onHttpError={handleError}
          injectedJavaScript={injectedJavaScript}
          cacheEnabled={true}
          cacheMode="LOAD_DEFAULT"
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          userAgent="RouaTrading/1.0 (iOS; Mobile)"
          pullToRefreshEnabled={true}
          bounces={true}
          scrollEnabled={true}
          automaticallyAdjustContentInsets={false}
          contentMode="mobile"
        />
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={ACCENT_COLOR} />
            <Text style={styles.loadingText}>جاري التحميل...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY_COLOR,
  },
  webview: {
    flex: 1,
    backgroundColor: PRIMARY_COLOR,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PRIMARY_COLOR,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 16,
    marginTop: 12,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'normal',
  },
});
