package online.oracle_plus.messenger;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class OracleFirebaseMessagingService extends MessagingService {
    private static final String CALL_CHANNEL_ID = "oracle_messenger_incoming_calls_v3";
    private static final int CALL_NOTIFICATION_ID = 225071234;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");

        if ("call-sync".equals(type)) {
            cancelCallNotification(data.get("callId"));
            super.onMessageReceived(remoteMessage);
            return;
        }

        if ("call".equals(type)) {
            showIncomingCallNotification(data);
            super.onMessageReceived(remoteMessage);
            return;
        }

        super.onMessageReceived(remoteMessage);
    }

    private void showIncomingCallNotification(Map<String, String> data) {
        createCallChannel();

        String callId = valueOrFallback(data.get("callId"), "incoming");
        String title = valueOrFallback(data.get("title"), "Appel Oracle Messenger");
        String body = valueOrFallback(data.get("body"), "Appuyez pour répondre.");
        String url = valueOrFallback(data.get("url"), "/chat");
        String normalizedUrl = url.startsWith("http")
            ? url
            : "https://messenger.oracle-plus.online" + (url.startsWith("/") ? url : "/" + url);

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setAction(Intent.ACTION_VIEW);
        openIntent.setData(Uri.parse(normalizedUrl));
        openIntent.putExtra("oracle_call_id", callId);
        openIntent.putExtra("oracle_call_url", normalizedUrl);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            stableRequestCode(callId),
            openIntent,
            flags
        );

        Intent declineIntent = new Intent(this, OracleCallActionReceiver.class);
        declineIntent.setAction(OracleCallActionReceiver.ACTION_DECLINE_CALL);
        declineIntent.putExtra(OracleCallActionReceiver.EXTRA_CALL_ID, callId);
        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
            this,
            stableRequestCode(callId + "-decline"),
            declineIntent,
            flags
        );

        Uri ringtone = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.oracle_call);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setSound(ringtone)
            .setVibrate(new long[] { 0, 1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000 })
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .addAction(R.mipmap.ic_launcher, "Refuser", declinePendingIntent)
            .addAction(R.mipmap.ic_launcher, "Répondre", pendingIntent);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(notificationTag(callId), CALL_NOTIFICATION_ID, builder.build());
        }
    }

    private void cancelCallNotification(String callId) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(notificationTag(valueOrFallback(callId, "incoming")), CALL_NOTIFICATION_ID);
        }
    }

    private void createCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CALL_CHANNEL_ID) != null) return;

        Uri ringtone = Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.oracle_call);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        NotificationChannel channel = new NotificationChannel(
            CALL_CHANNEL_ID,
            "Appels entrants",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Sonnerie et affichage plein écran pour les appels Oracle Messenger");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 1000, 300, 1000, 300, 1000, 700, 1000, 300, 1000 });
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setSound(ringtone, audioAttributes);
        manager.createNotificationChannel(channel);
    }

    private String valueOrFallback(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }

    private String notificationTag(String callId) {
        return "incoming-call-" + callId;
    }

    private int stableRequestCode(String callId) {
        return Math.abs(notificationTag(callId).hashCode());
    }
}
