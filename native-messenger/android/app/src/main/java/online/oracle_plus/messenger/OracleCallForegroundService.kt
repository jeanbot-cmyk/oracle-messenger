package online.oracle_plus.messenger

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

class OracleCallForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val callType = intent?.getStringExtra(EXTRA_CALL_TYPE) ?: "audio"
    val callerName = intent?.getStringExtra(EXTRA_CALLER_NAME) ?: "Oracle Messenger"
    try {
      ensureChannel()
      val notification = buildNotification(callType, callerName)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, foregroundServiceType(callType))
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (error: Exception) {
      Log.e(TAG, "Unable to start call foreground service", error)
      stopSelf(startId)
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Appel en cours Oracle Messenger",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "Maintient les appels Oracle Messenger actifs en arrière-plan."
    channel.setSound(null, null)
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(callType: String, callerName: String): Notification {
    val openIntent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      data = android.net.Uri.parse("oraclemessenger://call")
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      1001,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
    val title = if (callType == "video") "Appel vidéo en cours" else "Appel audio en cours"
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setLargeIcon(BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher))
      .setContentTitle(title)
      .setContentText(callerName)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun immutableFlag(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
  }

  private fun foregroundServiceType(callType: String): Int {
    val microphone = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    return if (callType == "video") {
      microphone or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
    } else {
      microphone
    }
  }

  companion object {
    private const val TAG = "OracleCallForeground"
    private const val CHANNEL_ID = "oracle_messenger_active_call_v1"
    private const val NOTIFICATION_ID = 41001
    private const val EXTRA_CALL_TYPE = "callType"
    private const val EXTRA_CALLER_NAME = "callerName"

    fun start(context: Context, callType: String, callerName: String) {
      val intent = Intent(context, OracleCallForegroundService::class.java).apply {
        putExtra(EXTRA_CALL_TYPE, callType)
        putExtra(EXTRA_CALLER_NAME, callerName)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, OracleCallForegroundService::class.java))
    }
  }
}
