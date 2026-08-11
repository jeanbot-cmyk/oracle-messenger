package online.oracle_plus.messenger

import android.media.MediaRecorder
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class OracleVoiceRecorderModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private var recorder: MediaRecorder? = null
  private var outputFile: File? = null
  private var startedAt = 0L

  override fun getName(): String = "OracleVoiceRecorder"

  @ReactMethod
  fun start(promise: Promise) {
    if (recorder != null) {
      promise.reject("VOICE_RECORDING_ACTIVE", "Un enregistrement vocal est deja en cours.")
      return
    }

    try {
      val directory = File(reactContext.cacheDir, "oracle_voice")
      if (!directory.exists()) directory.mkdirs()
      val file = File(directory, "voice-${System.currentTimeMillis()}.m4a")
      val nextRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        MediaRecorder(reactContext)
      } else {
        @Suppress("DEPRECATION")
        MediaRecorder()
      }

      nextRecorder.setAudioSource(MediaRecorder.AudioSource.MIC)
      nextRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      nextRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      nextRecorder.setAudioEncodingBitRate(96_000)
      nextRecorder.setAudioSamplingRate(44_100)
      nextRecorder.setOutputFile(file.absolutePath)
      nextRecorder.prepare()
      nextRecorder.start()

      recorder = nextRecorder
      outputFile = file
      startedAt = System.currentTimeMillis()

      val result = Arguments.createMap()
      result.putString("uri", "file://${file.absolutePath}")
      result.putDouble("startedAt", startedAt.toDouble())
      promise.resolve(result)
    } catch (error: Exception) {
      cleanup(deleteFile = true)
      promise.reject("VOICE_RECORDING_START_FAILED", error.message ?: "Enregistrement vocal impossible.", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    val currentRecorder = recorder
    val file = outputFile
    if (currentRecorder == null || file == null) {
      promise.reject("VOICE_RECORDING_INACTIVE", "Aucun enregistrement vocal actif.")
      return
    }

    try {
      currentRecorder.stop()
      currentRecorder.release()
      recorder = null

      val durationMs = (System.currentTimeMillis() - startedAt).coerceAtLeast(0L)
      if (!file.exists() || file.length() <= 0L) {
        cleanup(deleteFile = true)
        promise.reject("VOICE_RECORDING_EMPTY", "Le fichier vocal enregistre est vide.")
        return
      }

      outputFile = null
      startedAt = 0L

      val result = Arguments.createMap()
      result.putString("uri", "file://${file.absolutePath}")
      result.putString("name", file.name)
      result.putString("mime", "audio/mp4")
      result.putDouble("size", file.length().toDouble())
      result.putDouble("durationMs", durationMs.toDouble())
      promise.resolve(result)
    } catch (error: Exception) {
      cleanup(deleteFile = true)
      promise.reject("VOICE_RECORDING_STOP_FAILED", error.message ?: "Finalisation vocale impossible.", error)
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    cleanup(deleteFile = true)
    promise.resolve(true)
  }

  override fun invalidate() {
    cleanup(deleteFile = true)
    super.invalidate()
  }

  private fun cleanup(deleteFile: Boolean) {
    try {
      recorder?.release()
    } catch (_: Exception) {
    }
    recorder = null
    if (deleteFile) {
      try {
        outputFile?.delete()
      } catch (_: Exception) {
      }
    }
    outputFile = null
    startedAt = 0L
  }
}
