package online.oracle_plus.messenger

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class OracleFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    when (data["type"]) {
      "call" -> {
        showIncomingCallNotification(data)
      }
      "call-sync" -> {
        cancelIncomingCallNotification(data["callId"])
      }
      else -> super.onMessageReceived(remoteMessage)
    }
  }

  private fun showIncomingCallNotification(data: Map<String, String>) {
    try {
      ensureCallChannel()
      val callId = data["callId"].orEmpty().ifBlank { "incoming" }
      val conversationId = data["conversationId"].orEmpty()
      val callType = data["callType"].orEmpty().ifBlank { "audio" }
      val callerName = data["callerPhone"].orEmpty()
        .ifBlank { data["callerName"].orEmpty().takeIf { PHONE_PATTERN.matches(it.trim()) }.orEmpty() }
        .ifBlank { "Oracle Messenger" }

      val notification = NotificationCompat.Builder(this, CALL_CHANNEL_ID)
        .setSmallIcon(R.drawable.notification_icon)
        .setLargeIcon(BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher))
        .setContentTitle(if (callType == "video") "Appel video entrant" else "Appel audio entrant")
        .setContentText(callerName)
        .setStyle(NotificationCompat.BigTextStyle().bigText(data["body"].orEmpty().ifBlank { "Appuyez pour répondre." }))
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(false)
        .setOngoing(true)
        .setSound(callSoundUri())
        .setVibrate(CALL_VIBRATION_PATTERN)
        .setTimeoutAfter(CALL_TIMEOUT_MS)
        .setContentIntent(activityIntent(callId, conversationId, "open"))
        .setFullScreenIntent(activityIntent(callId, conversationId, "open"), true)
        .addAction(0, "Refuser", activityIntent(callId, conversationId, "reject"))
        .addAction(0, "Accepter", activityIntent(callId, conversationId, "accept"))
        .build()

      getSystemService(NotificationManager::class.java)
        .notify(notificationId(callId), notification)
      Log.i(TAG, "Incoming call notification shown callId=$callId type=$callType")
    } catch (error: Exception) {
      Log.e(TAG, "Unable to show incoming call notification", error)
    }
  }

  private fun cancelIncomingCallNotification(callId: String?) {
    val cleanCallId = callId.orEmpty().ifBlank { "incoming" }
    getSystemService(NotificationManager::class.java).cancel(notificationId(cleanCallId))
    Log.i(TAG, "Incoming call notification cancelled callId=$cleanCallId")
  }

  private fun ensureCallChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CALL_CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CALL_CHANNEL_ID,
      "Appels entrants Oracle Messenger",
      NotificationManager.IMPORTANCE_HIGH
    )
    channel.description = "Alertes d'appels entrants avec actions accepter/refuser."
    channel.enableVibration(true)
    channel.vibrationPattern = CALL_VIBRATION_PATTERN
    channel.setSound(callSoundUri(), AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build())
    channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
  }

  private fun activityIntent(callId: String, conversationId: String, action: String): PendingIntent {
    val intent = Intent(this, MainActivity::class.java).apply {
      val deeplink = "oraclemessenger://call?action=$action&callId=${Uri.encode(callId)}&conversationId=${Uri.encode(conversationId)}"
      this.action = Intent.ACTION_VIEW
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      data = Uri.parse(deeplink)
      putExtra("url", deeplink)
      putExtra("callId", callId)
      putExtra("conversationId", conversationId)
      putExtra("callAction", action)
    }
    return PendingIntent.getActivity(
      this,
      requestCode(callId, action),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
  }

  private fun immutableFlag(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

  private fun callSoundUri(): Uri =
    Uri.parse("android.resource://$packageName/${R.raw.oracle_incoming_call}")

  companion object {
    private const val TAG = "OracleFirebaseMessaging"
    private const val CALL_CHANNEL_ID = "oracle_messenger_incoming_calls_v8"
    private const val CALL_TIMEOUT_MS = 300_000L
    private val PHONE_PATTERN = Regex("""^\+?\d[\d\s().-]{6,}$""")
    private val CALL_VIBRATION_PATTERN = longArrayOf(0, 650, 250, 650, 250, 1100)

    private fun notificationId(callId: String): Int = 42000 + kotlin.math.abs(callId.hashCode() % 1000)

    private fun requestCode(callId: String, action: String): Int =
      kotlin.math.abs("$callId:$action".hashCode())
  }
}
