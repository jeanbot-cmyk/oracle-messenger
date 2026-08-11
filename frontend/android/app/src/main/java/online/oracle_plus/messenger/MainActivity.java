package online.oracle_plus.messenger;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioFocusRequest;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

import java.security.MessageDigest;

public class MainActivity extends BridgeActivity {
    public static final String CALL_CHANNEL_ID = "oracle_messenger_incoming_calls_v3";
    private AudioManager audioManager;
    private AudioFocusRequest callFocusRequest;
    private MediaPlayer incomingRingtonePlayer;
    private int currentVersionCode = -1;
    private boolean webRuntimePurgeRequired = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        webRuntimePurgeRequired = clearWebViewCacheAfterAppUpdate();
        configureMediaWebView();
        createIncomingCallChannel();
        applyIncomingCallWindowMode(getIntent());
        purgeWebRuntimeStateAfterLoad();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyIncomingCallWindowMode(intent);
    }

    @Override
    public void onDestroy() {
        stopIncomingRingtone();
        clearCallAudioRoute();
        setSecureProfileViewer(false);
        super.onDestroy();
    }

    private void configureMediaWebView() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebSettings settings = getBridge().getWebView().getSettings();
        String userAgent = settings.getUserAgentString();
        if (userAgent != null && !userAgent.contains("OracleMessengerNative")) {
            settings.setUserAgentString(userAgent + " OracleMessengerNative/" + currentVersionCode);
        }
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        getBridge().getWebView().addJavascriptInterface(new OracleAndroidBridge(), "OracleAndroid");
        String diagnostics = jsString(getNativeDiagnosticsJson());
        getBridge().getWebView().evaluateJavascript(
            "try{" +
            "window.__ORACLE_NATIVE_ANDROID=true;" +
            "localStorage.setItem('oracle-native-build','" + currentVersionCode + "');" +
            "sessionStorage.setItem('oracle-native-build','" + currentVersionCode + "');" +
            "localStorage.setItem('oracle-native-diagnostics','" + diagnostics + "');" +
            "sessionStorage.setItem('oracle-native-diagnostics','" + diagnostics + "');" +
            "}catch(e){}",
            null
        );
    }

    private void applyIncomingCallWindowMode(Intent intent) {
        if (intent == null || !intent.hasExtra("oracle_call_id")) return;
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            } else {
                getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                );
            }
        });
    }

    private boolean clearWebViewCacheAfterAppUpdate() {
        try {
            int versionCode = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            currentVersionCode = versionCode;
            android.content.SharedPreferences prefs = getSharedPreferences("oracle_native_state", Context.MODE_PRIVATE);
            int lastVersionCode = prefs.getInt("last_webview_cache_version", -1);
            if (lastVersionCode == versionCode) return false;

            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().clearCache(true);
                getBridge().getWebView().clearHistory();
            }
            // Ne pas effacer WebStorage/IndexedDB/localStorage ici: ces stockages
            // contiennent la session et les donnees locales scindees par compte.
            // Le cache HTTP et les caches Service Worker sont purges plus bas.
            CookieManager.getInstance().flush();
            prefs.edit().putInt("last_webview_cache_version", versionCode).apply();
            return true;
        } catch (Exception ignored) {}
        return false;
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < bytes.length; i++) {
            if (i > 0) out.append(":");
            out.append(String.format("%02X", bytes[i]));
        }
        return out.toString();
    }

    private String digestCertificate(byte[] cert, String algorithm) throws Exception {
        MessageDigest md = MessageDigest.getInstance(algorithm);
        return bytesToHex(md.digest(cert));
    }

    private String jsString(String value) {
        if (value == null) return "";
        return value
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }

    private byte[] firstSigningCertificate() throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(
                getPackageName(),
                android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES
            );
            android.content.pm.Signature[] signatures = info.signingInfo.getApkContentsSigners();
            if (signatures != null && signatures.length > 0) return signatures[0].toByteArray();
        } else {
            android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(
                getPackageName(),
                android.content.pm.PackageManager.GET_SIGNATURES
            );
            if (info.signatures != null && info.signatures.length > 0) return info.signatures[0].toByteArray();
        }
        return new byte[0];
    }

    private String getNativeDiagnosticsJson() {
        try {
            android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            byte[] cert = firstSigningCertificate();
            String sha1 = cert.length > 0 ? digestCertificate(cert, "SHA-1") : "";
            String sha256 = cert.length > 0 ? digestCertificate(cert, "SHA-256") : "";
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            return "{" +
                "\"packageName\":\"" + getPackageName() + "\"," +
                "\"versionCode\":" + versionCode + "," +
                "\"versionName\":\"" + info.versionName + "\"," +
                "\"sha1\":\"" + sha1 + "\"," +
                "\"sha256\":\"" + sha256 + "\"" +
                "}";
        } catch (Exception e) {
            return "{\"error\":\"" + e.getClass().getSimpleName() + "\"}";
        }
    }

    private void purgeWebRuntimeStateAfterLoad() {
        if (!webRuntimePurgeRequired) return;
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                if (getBridge() == null || getBridge().getWebView() == null) return;
                String script =
                    "(async function(){" +
                    "var d='" + jsString(getNativeDiagnosticsJson()) + "';" +
                    "try{if('serviceWorker' in navigator){" +
                    "const regs=await navigator.serviceWorker.getRegistrations();" +
                    "await Promise.all(regs.map(function(r){return r.unregister();}));" +
                    "}}catch(e){}" +
                    "try{if('caches' in window){" +
                    "const keys=await caches.keys();" +
                    "await Promise.all(keys.map(function(k){return caches.delete(k);}));" +
                    "}}catch(e){}" +
                    "try{localStorage.setItem('oracle-native-build','" + currentVersionCode + "');}catch(e){}" +
                    "try{sessionStorage.setItem('oracle-native-build','" + currentVersionCode + "');}catch(e){}" +
                    "try{localStorage.setItem('oracle-native-diagnostics',d);sessionStorage.setItem('oracle-native-diagnostics',d);}catch(e){}" +
                    "try{" +
                    "const u=new URL(location.href);" +
                    "u.searchParams.set('nativeBuild','" + currentVersionCode + "');" +
                    "location.replace(u.toString());" +
                    "}catch(e){location.reload();}" +
                    "})();";
                getBridge().getWebView().evaluateJavascript(script, null);
            } catch (Exception ignored) {}
        }, 1200);
    }

    private void setSecureProfileViewer(boolean enabled) {
        runOnUiThread(() -> {
            if (enabled) {
                getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
    }

    private void setCallAudioRoute(boolean speakerOn) {
        runOnUiThread(() -> {
            if (audioManager == null) return;

            AudioAttributes callAudioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (callFocusRequest == null) {
                    callFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(callAudioAttributes)
                        .setAcceptsDelayedFocusGain(false)
                        .setOnAudioFocusChangeListener(focusChange -> {})
                        .build();
                }
                audioManager.requestAudioFocus(callFocusRequest);
            } else {
                audioManager.requestAudioFocus(
                    null,
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
                );
            }

            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setSpeakerphoneOn(speakerOn);
        });
    }

    private void clearCallAudioRoute() {
        runOnUiThread(() -> {
            if (audioManager == null) return;
            audioManager.setSpeakerphoneOn(false);
            audioManager.setMode(AudioManager.MODE_NORMAL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && callFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(callFocusRequest);
            } else {
                audioManager.abandonAudioFocus(null);
            }
        });
    }

    private void startIncomingRingtone() {
        runOnUiThread(() -> {
            if (incomingRingtonePlayer != null && incomingRingtonePlayer.isPlaying()) return;
            stopIncomingRingtoneInternal();
            try {
                Uri ringtone = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.oracle_call);
                incomingRingtonePlayer = new MediaPlayer();
                incomingRingtonePlayer.setDataSource(this, ringtone);
                incomingRingtonePlayer.setLooping(true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    incomingRingtonePlayer.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                } else {
                    incomingRingtonePlayer.setAudioStreamType(AudioManager.STREAM_RING);
                }
                incomingRingtonePlayer.prepare();
                incomingRingtonePlayer.start();
            } catch (Exception ignored) {
                stopIncomingRingtone();
            }
        });
    }

    private void stopIncomingRingtone() {
        runOnUiThread(() -> {
            stopIncomingRingtoneInternal();
        });
    }

    private void stopIncomingRingtoneInternal() {
        if (incomingRingtonePlayer == null) return;
        try {
            if (incomingRingtonePlayer.isPlaying()) incomingRingtonePlayer.stop();
        } catch (Exception ignored) {}
        try {
            incomingRingtonePlayer.release();
        } catch (Exception ignored) {}
        incomingRingtonePlayer = null;
    }

    private class OracleAndroidBridge {
        @JavascriptInterface
        public void setSecureProfileViewer(boolean enabled) {
            MainActivity.this.setSecureProfileViewer(enabled);
        }

        @JavascriptInterface
        public void setCallAudioRoute(boolean speakerOn) {
            MainActivity.this.setCallAudioRoute(speakerOn);
        }

        @JavascriptInterface
        public void clearCallAudioRoute() {
            MainActivity.this.clearCallAudioRoute();
        }

        @JavascriptInterface
        public void startIncomingRingtone() {
            MainActivity.this.startIncomingRingtone();
        }

        @JavascriptInterface
        public void stopIncomingRingtone() {
            MainActivity.this.stopIncomingRingtone();
        }

        @JavascriptInterface
        public String getNativeDiagnostics() {
            return MainActivity.this.getNativeDiagnosticsJson();
        }
    }

    private void createIncomingCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel existing = manager.getNotificationChannel(CALL_CHANNEL_ID);
        if (existing != null) return;

        NotificationChannel channel = new NotificationChannel(
            CALL_CHANNEL_ID,
            "Appels entrants",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Sonnerie et vibration pour les appels Oracle Messenger");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000 });
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);

        Uri ringtone = Uri.parse("android.resource://" + getPackageName() + "/raw/oracle_call");
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(ringtone, audioAttributes);

        manager.createNotificationChannel(channel);
    }
}
