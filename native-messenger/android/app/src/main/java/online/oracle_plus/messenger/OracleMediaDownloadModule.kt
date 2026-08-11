package online.oracle_plus.messenger

import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OracleMediaDownloadModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "OracleMediaDownload"

  @ReactMethod
  fun enqueueMedia(
    messageId: String,
    url: String,
    token: String,
    backendUrl: String,
    checksum: String?,
    size: Double,
    type: String?,
    mime: String?,
    name: String?,
    mediaRootUri: String?,
    promise: Promise
  ) {
    try {
      val cleanMessageId = messageId.trim()
      val cleanUrl = url.trim()
      val cleanToken = token.trim()
      val cleanBackendUrl = backendUrl.trim().trimEnd('/')

      if (cleanMessageId.isBlank() || cleanUrl.isBlank() || cleanToken.isBlank() || cleanBackendUrl.isBlank()) {
        promise.resolve(false)
        return
      }

      val input = Data.Builder()
        .putString(OracleMediaDownloadWorker.KEY_MESSAGE_ID, cleanMessageId)
        .putString(OracleMediaDownloadWorker.KEY_URL, cleanUrl)
        .putString(OracleMediaDownloadWorker.KEY_TOKEN, cleanToken)
        .putString(OracleMediaDownloadWorker.KEY_BACKEND_URL, cleanBackendUrl)
        .putString(OracleMediaDownloadWorker.KEY_CHECKSUM, checksum?.trim().orEmpty())
        .putLong(OracleMediaDownloadWorker.KEY_SIZE, if (size > 0) size.toLong() else -1L)
        .putString(OracleMediaDownloadWorker.KEY_TYPE, type?.trim().orEmpty())
        .putString(OracleMediaDownloadWorker.KEY_MIME, mime?.trim().orEmpty())
        .putString(OracleMediaDownloadWorker.KEY_NAME, name?.trim().orEmpty())
        .putString(OracleMediaDownloadWorker.KEY_MEDIA_ROOT_URI, mediaRootUri?.trim().orEmpty())
        .build()

      val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

      val request = OneTimeWorkRequestBuilder<OracleMediaDownloadWorker>()
        .setConstraints(constraints)
        .setInputData(input)
        .build()

      WorkManager.getInstance(reactContext)
        .enqueueUniqueWork("oracle-media-$cleanMessageId", ExistingWorkPolicy.KEEP, request)

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ORACLE_MEDIA_ENQUEUE_FAILED", error.message, error)
    }
  }
}
