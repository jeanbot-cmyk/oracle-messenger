package online.oracle_plus.messenger;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String CALL_CHANNEL_ID = "oracle_messenger_incoming_calls";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createIncomingCallChannel();
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

        Uri ringtone = android.provider.Settings.System.DEFAULT_RINGTONE_URI;
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(ringtone, audioAttributes);

        manager.createNotificationChannel(channel);
    }
}
