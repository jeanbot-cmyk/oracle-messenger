package online.oracle_plus.messenger

import android.content.Context
import android.net.Uri
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale

class OracleMediaDownloadWorker(
  context: Context,
  workerParams: WorkerParameters
) : Worker(context, workerParams) {
  override fun doWork(): Result {
    val messageId = inputData.getString(KEY_MESSAGE_ID)?.trim().orEmpty()
    val mediaUrl = inputData.getString(KEY_URL)?.trim().orEmpty()
    val token = inputData.getString(KEY_TOKEN)?.trim().orEmpty()
    val backendUrl = inputData.getString(KEY_BACKEND_URL)?.trim()?.trimEnd('/').orEmpty()
    val expectedChecksum = inputData.getString(KEY_CHECKSUM)?.lowercase(Locale.US)?.takeIf { it.matches(Regex("^[a-f0-9]{64}$")) }
    val expectedSize = inputData.getLong(KEY_SIZE, -1L).takeIf { it > 0L }
    val type = inputData.getString(KEY_TYPE).orEmpty()
    val mime = inputData.getString(KEY_MIME).orEmpty()
    val name = inputData.getString(KEY_NAME).orEmpty()
    val mediaRootUri = inputData.getString(KEY_MEDIA_ROOT_URI).orEmpty()

    if (messageId.isBlank() || mediaUrl.isBlank() || token.isBlank() || backendUrl.isBlank()) return Result.failure()

    return try {
      val directory = mediaDirectory(mediaRootUri)
      val target = File(directory, "$messageId${extension(type, mime, name, mediaUrl)}")
      val existing = validateLocalFile(target, expectedChecksum, expectedSize)
      val saved = existing ?: downloadAndValidate(mediaUrl, target, expectedChecksum, expectedSize)
      writeGalleryIndex(directory, messageId, target, type, mime, name, saved)
      if (!ackServer(backendUrl, token, messageId, saved.checksum, saved.size)) return Result.retry()
      Result.success()
    } catch (_: IllegalStateException) {
      Result.failure()
    } catch (_: Exception) {
      Result.retry()
    }
  }

  private data class SavedMedia(val size: Long, val checksum: String)

  private fun mediaDirectory(mediaRootUri: String): File {
    val fallback = File(applicationContext.filesDir, "oracle-media")
    val rawPath = mediaRootUri
      .takeIf { it.isNotBlank() }
      ?.let { value -> if (value.startsWith("file://")) Uri.parse(value).path else value }
      .orEmpty()

    if (rawPath.isBlank()) return fallback.apply { mkdirs() }

    return try {
      val candidate = File(rawPath).canonicalFile
      val appDataRoot = applicationContext.filesDir.parentFile?.canonicalFile
      if (!candidate.isAbsolute || appDataRoot == null || !candidate.path.startsWith(appDataRoot.path)) {
        fallback.apply { mkdirs() }
      } else {
        candidate.apply { mkdirs() }
      }
    } catch (_: Exception) {
      fallback.apply { mkdirs() }
    }
  }

  private fun validateLocalFile(file: File, expectedChecksum: String?, expectedSize: Long?): SavedMedia? {
    if (!file.exists() || !file.isFile || file.length() <= 0L) return null
    if (expectedSize != null && file.length() != expectedSize) return null
    val checksum = sha256(file)
    if (expectedChecksum != null && checksum != expectedChecksum) return null
    return SavedMedia(file.length(), checksum)
  }

  private fun downloadAndValidate(mediaUrl: String, target: File, expectedChecksum: String?, expectedSize: Long?): SavedMedia {
    val temp = File(target.parentFile, "${target.name}.download")
    if (temp.exists()) temp.delete()
    if (target.exists()) target.delete()

    val connection = (URL(mediaUrl).openConnection() as HttpURLConnection).apply {
      connectTimeout = 20000
      readTimeout = 60000
      instanceFollowRedirects = true
      requestMethod = "GET"
    }

    try {
      val status = connection.responseCode
      if (status !in 200..299) throw RuntimeException("HTTP $status")
      connection.inputStream.use { input ->
        temp.outputStream().use { output ->
          input.copyTo(output)
        }
      }
    } finally {
      connection.disconnect()
    }

    val verified = validateLocalFile(temp, expectedChecksum, expectedSize)
      ?: run {
        temp.delete()
        throw RuntimeException("Downloaded media validation failed")
      }

    if (!temp.renameTo(target)) {
      temp.copyTo(target, overwrite = true)
      temp.delete()
    }
    return verified
  }

  private fun ackServer(backendUrl: String, token: String, messageId: String, checksum: String, size: Long): Boolean {
    val body = """{"checksum":"$checksum","size":$size}"""
    val connection = (URL("$backendUrl/messages/${messageId}/media-local-save").openConnection() as HttpURLConnection).apply {
      connectTimeout = 15000
      readTimeout = 30000
      requestMethod = "POST"
      doOutput = true
      setRequestProperty("Authorization", "Bearer $token")
      setRequestProperty("Content-Type", "application/json")
      outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    }
    return try {
      val status = connection.responseCode
      val response = (if (status in 200..299) connection.inputStream else connection.errorStream)
        ?.bufferedReader()
        ?.use { it.readText() }
        .orEmpty()
      status in 200..299 && !response.contains("\"ackConfirmed\":false")
    } finally {
      connection.disconnect()
    }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      while (true) {
        val read = input.read(buffer)
        if (read <= 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun writeGalleryIndex(directory: File, messageId: String, file: File, type: String, mime: String, name: String, saved: SavedMedia) {
    val indexFile = File(directory, "gallery-index.json")
    val current = try {
      JSONArray(indexFile.takeIf { it.exists() }?.readText().orEmpty().ifBlank { "[]" })
    } catch (_: Exception) {
      JSONArray()
    }
    val byMessage = linkedMapOf<String, JSONObject>()
    val entry = JSONObject()
      .put("id", messageId)
      .put("messageId", messageId)
      .put("uri", "file://${file.absolutePath}")
      .put("type", galleryType(type))
      .put("savedAt", System.currentTimeMillis())
      .put("name", name)
      .put("mime", mime)
      .put("size", saved.size)
      .put("checksum", saved.checksum)
      .put("source", "conversation")
    byMessage[messageId] = entry

    for (index in 0 until current.length()) {
      val item = current.optJSONObject(index) ?: continue
      val key = item.optString("messageId").ifBlank { item.optString("id") }
      val uri = item.optString("uri")
      if (key.isBlank() || uri.isBlank() || key == messageId) continue
      byMessage[key] = item
    }

    val output = JSONArray()
    byMessage.values.take(500).forEach { output.put(it) }
    indexFile.writeText(output.toString())
  }

  private fun galleryType(type: String): String {
    return when (type.lowercase(Locale.US)) {
      "image" -> "image"
      "video" -> "video"
      "audio", "voice" -> "audio"
      else -> "file"
    }
  }

  private fun extension(type: String, mime: String, name: String, url: String): String {
    val source = listOf(name, url.substringBefore('?')).firstOrNull { it.contains('.') }.orEmpty()
    val fromName = source.substringAfterLast('.', "").replace(Regex("[^A-Za-z0-9]"), "").take(8)
    if (fromName.isNotBlank()) return ".$fromName"
    val normalizedMime = mime.lowercase(Locale.US)
    return when {
      normalizedMime.contains("jpeg") -> ".jpg"
      normalizedMime.contains("png") -> ".png"
      normalizedMime.contains("webp") -> ".webp"
      normalizedMime.contains("pdf") -> ".pdf"
      normalizedMime.contains("mp4") && (type == "audio" || type == "voice") -> ".m4a"
      normalizedMime.contains("mp4") -> ".mp4"
      normalizedMime.contains("mpeg") || normalizedMime.contains("mp3") -> ".mp3"
      normalizedMime.contains("ogg") -> ".ogg"
      normalizedMime.contains("wav") -> ".wav"
      type == "image" -> ".jpg"
      type == "video" -> ".mp4"
      type == "audio" || type == "voice" -> ".m4a"
      else -> ".bin"
    }
  }

  companion object {
    const val KEY_MESSAGE_ID = "messageId"
    const val KEY_URL = "url"
    const val KEY_TOKEN = "token"
    const val KEY_BACKEND_URL = "backendUrl"
    const val KEY_CHECKSUM = "checksum"
    const val KEY_SIZE = "size"
    const val KEY_TYPE = "type"
    const val KEY_MIME = "mime"
    const val KEY_NAME = "name"
    const val KEY_MEDIA_ROOT_URI = "mediaRootUri"
  }
}
