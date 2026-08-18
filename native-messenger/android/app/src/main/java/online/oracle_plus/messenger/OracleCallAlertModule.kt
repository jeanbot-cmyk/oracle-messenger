package online.oracle_plus.messenger

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OracleCallAlertModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var timeoutRunnable: Runnable? = null
  private var volumeRampRunnable: Runnable? = null
  private var currentVolume = 0f

  override fun getName(): String = "OracleCallAlert"

  @ReactMethod
  fun start(mode: String, seconds: Double, promise: Promise) {
    mainHandler.post {
      try {
        stopInternal(cancelVibration = true)
        val cleanMode = mode.trim().lowercase()
        val maxSeconds = seconds.toLong().coerceIn(1L, CALL_TIMEOUT_SECONDS)
        val targetVolume = targetVolumeFor(cleanMode)
        val nextPlayer = buildPlayer(cleanMode)
        player = nextPlayer
        currentVolume = 0f
        nextPlayer.setVolume(0f, 0f)
        nextPlayer.start()
        rampVolume(targetVolume)
        if (cleanMode == "incoming") startVibration()
        val stopTask = Runnable { stopInternal(cancelVibration = true) }
        timeoutRunnable = stopTask
        mainHandler.postDelayed(stopTask, maxSeconds * 1000L)
        promise.resolve(true)
      } catch (error: Exception) {
        stopInternal(cancelVibration = true)
        promise.reject("ORACLE_CALL_ALERT_START_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    mainHandler.post {
      stopInternal(cancelVibration = true)
      promise.resolve(true)
    }
  }

  override fun invalidate() {
    mainHandler.post { stopInternal(cancelVibration = true) }
    super.invalidate()
  }

  private fun buildPlayer(mode: String): MediaPlayer {
    val descriptor = reactContext.resources.openRawResourceFd(if (mode == "incoming") R.raw.oracle_incoming_call else R.raw.oracle_outgoing_call)
    return MediaPlayer().apply {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(if (mode == "incoming") AudioAttributes.USAGE_NOTIFICATION_RINGTONE else AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
        }
        setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
        isLooping = true
        setOnErrorListener { _, _, _ ->
          stopInternal(cancelVibration = true)
          true
        }
        prepare()
      } finally {
        descriptor.close()
      }
    }
  }

  private fun startVibration() {
    val vibrator = getVibrator() ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator.vibrate(VibrationEffect.createWaveform(CALL_VIBRATION_PATTERN, 0))
    } else {
      @Suppress("DEPRECATION")
      vibrator.vibrate(CALL_VIBRATION_PATTERN, 0)
    }
  }

  private fun targetVolumeFor(mode: String): Float {
    return if (mode == "incoming") INCOMING_TARGET_VOLUME else OUTGOING_TARGET_VOLUME
  }

  private fun cancelVolumeRamp() {
    volumeRampRunnable?.let { mainHandler.removeCallbacks(it) }
    volumeRampRunnable = null
  }

  private fun rampVolume(targetVolume: Float) {
    cancelVolumeRamp()
    val cleanTarget = targetVolume.coerceIn(0f, 1f)
    var step = 0
    val task = object : Runnable {
      override fun run() {
        val activePlayer = player ?: run {
          volumeRampRunnable = null
          return
        }
        step += 1
        currentVolume = cleanTarget * (step.toFloat() / VOLUME_FADE_STEPS.toFloat())
        try {
          activePlayer.setVolume(currentVolume, currentVolume)
        } catch (_: Exception) {
          volumeRampRunnable = null
          return
        }
        if (step < VOLUME_FADE_STEPS) {
          mainHandler.postDelayed(this, VOLUME_FADE_INTERVAL_MS)
        } else {
          volumeRampRunnable = null
        }
      }
    }
    volumeRampRunnable = task
    mainHandler.postDelayed(task, VOLUME_FADE_INTERVAL_MS)
  }

  private fun stopInternal(cancelVibration: Boolean) {
    timeoutRunnable?.let { mainHandler.removeCallbacks(it) }
    timeoutRunnable = null
    cancelVolumeRamp()
    currentVolume = 0f
    try {
      player?.setVolume(0f, 0f)
    } catch (_: Exception) {
    }
    try {
      player?.stop()
    } catch (_: Exception) {
    }
    try {
      player?.release()
    } catch (_: Exception) {
    }
    player = null
    if (cancelVibration) {
      try {
        getVibrator()?.cancel()
      } catch (_: Exception) {
      }
    }
  }

  private fun getVibrator(): Vibrator? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      reactContext.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      reactContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
  }

  companion object {
    private const val CALL_TIMEOUT_SECONDS = 300L
    private const val INCOMING_TARGET_VOLUME = 0.34f
    private const val OUTGOING_TARGET_VOLUME = 0.22f
    private const val VOLUME_FADE_STEPS = 12
    private const val VOLUME_FADE_INTERVAL_MS = 70L
    private val CALL_VIBRATION_PATTERN = longArrayOf(0, 260, 180, 260, 720)
  }
}
