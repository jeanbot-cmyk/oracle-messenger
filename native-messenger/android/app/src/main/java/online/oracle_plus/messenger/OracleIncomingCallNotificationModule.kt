package online.oracle_plus.messenger

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OracleIncomingCallNotificationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "OracleIncomingCallNotification"

  @ReactMethod
  fun showIncomingCall(callId: String, conversationId: String, callerName: String, callType: String, promise: Promise) {
    try {
      ensureChannel()
      val manager = reactContext.getSystemService(NotificationManager::class.java)
      manager.notify(notificationId(callId), buildNotification(callId, conversationId, callerName, callType))
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ORACLE_INCOMING_CALL_NOTIFICATION_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun cancelIncomingCall(callId: String, promise: Promise) {
    try {
      reactContext.getSystemService(NotificationManager::class.java).cancel(notificationId(callId))
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ORACLE_INCOMING_CALL_CANCEL_FAILED", error.message, error)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = reactContext.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
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
    channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(callId: String, conversationId: String, callerName: String, callType: String) =
    NotificationCompat.Builder(reactContext, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(if (callType == "video") "Appel video entrant" else "Appel audio entrant")
      .setContentText(callerName.ifBlank { "Oracle Messenger" })
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(false)
      .setOngoing(false)
      .setSound(callSoundUri())
      .setVibrate(CALL_VIBRATION_PATTERN)
      .setTimeoutAfter(CALL_TIMEOUT_MS)
      .setContentIntent(activityIntent(callId, conversationId, "open"))
      .setFullScreenIntent(activityIntent(callId, conversationId, "open"), true)
      .addAction(0, "Refuser", activityIntent(callId, conversationId, "reject"))
      .addAction(0, "Accepter", activityIntent(callId, conversationId, "accept"))
      .build()

  private fun activityIntent(callId: String, conversationId: String, action: String): PendingIntent {
    val intent = Intent(reactContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      data = Uri.parse("oraclemessenger://call?action=$action&callId=${Uri.encode(callId)}&conversationId=${Uri.encode(conversationId)}")
    }
    return PendingIntent.getActivity(
      reactContext,
      requestCode(callId, action),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
  }

  private fun immutableFlag(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

  private fun callSoundUri(): Uri =
    Uri.parse("android.resource://${reactContext.packageName}/${R.raw.oracle_call}")

  companion object {
    private const val CHANNEL_ID = "oracle_messenger_incoming_calls_v5"
    private const val CALL_TIMEOUT_MS = 360_000L
    private val CALL_VIBRATION_PATTERN = longArrayOf(0, 650, 250, 650, 250, 1100)

    private fun notificationId(callId: String): Int = 42000 + kotlin.math.abs(callId.hashCode() % 1000)

    private fun requestCode(callId: String, action: String): Int =
      kotlin.math.abs("$callId:$action".hashCode())
  }
}
