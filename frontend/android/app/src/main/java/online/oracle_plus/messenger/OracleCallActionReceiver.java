package online.oracle_plus.messenger;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class OracleCallActionReceiver extends BroadcastReceiver {
    public static final String ACTION_DECLINE_CALL = "online.oracle_plus.messenger.action.DECLINE_CALL";
    static final String EXTRA_CALL_ID = "oracle_call_id";
    static final int CALL_NOTIFICATION_ID = 225071234;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_DECLINE_CALL.equals(intent.getAction())) return;
        String callId = intent.getStringExtra(EXTRA_CALL_ID);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel("incoming-call-" + (callId == null || callId.trim().isEmpty() ? "incoming" : callId), CALL_NOTIFICATION_ID);
        }
    }
}
