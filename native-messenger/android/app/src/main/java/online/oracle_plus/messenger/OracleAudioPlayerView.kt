package online.oracle_plus.messenger

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import java.io.File

class OracleAudioPlayerView(context: Context) : FrameLayout(context) {
  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val handler = Handler(Looper.getMainLooper())
  private val container = LinearLayout(context)
  private val playButton = TextView(context)
  private val seekBar = SeekBar(context)
  private val timeText = TextView(context)
  private val errorText = TextView(context)
  private var mediaPlayer: MediaPlayer? = null
  private var sourceUrl: String? = null
  private var isPrepared = false
  private var userSeeking = false
  private var paused = true
  private var progressTickerActive = false
  private var hasAudioFocus = false
  private var audioFocusRequest: AudioFocusRequest? = null
  private val reactContext = context as? ThemedReactContext
  private val brandColor = Color.rgb(16, 42, 42)
  private val mutedColor = Color.rgb(100, 116, 139)
  private val trackColor = Color.rgb(226, 232, 240)
  private val dangerColor = Color.rgb(180, 35, 24)
  private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
    if (focusChange == AudioManager.AUDIOFOCUS_LOSS || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
      handler.post { setPaused(true) }
    }
  }

  private val progressTick = object : Runnable {
    override fun run() {
      if (!progressTickerActive) return
      updateProgress()
      handler.postDelayed(this, 500)
    }
  }

  init {
    setBackgroundColor(Color.TRANSPARENT)

    container.orientation = LinearLayout.HORIZONTAL
    container.gravity = Gravity.CENTER_VERTICAL
    container.setPadding(2, 0, 2, 0)
    container.layoutParams = LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
      Gravity.CENTER
    )
    addView(container)

    playButton.text = "\u25B6"
    playButton.textSize = 16f
    playButton.typeface = Typeface.DEFAULT_BOLD
    playButton.setTextColor(Color.WHITE)
    playButton.gravity = Gravity.CENTER
    playButton.background = roundDrawable(brandColor, 999f)
    playButton.isEnabled = false
    playButton.alpha = 0.55f
    playButton.setOnClickListener { togglePlayback() }
    container.addView(playButton, LinearLayout.LayoutParams(
      dp(42),
      dp(42)
    ).apply { marginEnd = dp(10) })

    val progressColumn = LinearLayout(context)
    progressColumn.orientation = LinearLayout.VERTICAL
    progressColumn.gravity = Gravity.CENTER_VERTICAL
    container.addView(progressColumn, LinearLayout.LayoutParams(
      0,
      ViewGroup.LayoutParams.WRAP_CONTENT,
      1f
    ))

    seekBar.progressTintList = ColorStateList.valueOf(brandColor)
    seekBar.progressBackgroundTintList = ColorStateList.valueOf(trackColor)
    seekBar.thumbTintList = ColorStateList.valueOf(brandColor)
    seekBar.splitTrack = false

    progressColumn.addView(seekBar, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ))

    timeText.setTextColor(mutedColor)
    timeText.gravity = Gravity.START
    timeText.textSize = 11f
    timeText.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    timeText.text = "00:00 / 00:00"
    progressColumn.addView(timeText, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ))

    errorText.setTextColor(dangerColor)
    errorText.gravity = Gravity.START
    errorText.textSize = 11f
    errorText.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    errorText.visibility = GONE
    progressColumn.addView(errorText, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ))

    seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
      override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
        if (fromUser && isPrepared) {
          timeText.text = "${formatTime(progress)} / ${formatTime(mediaPlayer?.duration ?: 0)}"
        }
      }

      override fun onStartTrackingTouch(seekBar: SeekBar?) {
        userSeeking = true
      }

      override fun onStopTrackingTouch(seekBar: SeekBar?) {
        userSeeking = false
        if (isPrepared) mediaPlayer?.seekTo(seekBar?.progress ?: 0)
      }
    })
  }

  fun setSourceUrl(value: String?) {
    val cleanValue = value?.trim().orEmpty()
    if (cleanValue == sourceUrl.orEmpty()) return
    sourceUrl = cleanValue
    resetPlayer()
    if (cleanValue.isBlank()) return

    try {
      emitPlaybackState("preparing")
      val sourceUri = validatedSourceUri(cleanValue)
      val player = MediaPlayer()
      mediaPlayer = player
      configurePlayerAudio(player)
      player.setDataSource(context, sourceUri)
      player.setOnPreparedListener {
        isPrepared = true
        seekBar.max = it.duration.coerceAtLeast(0)
        playButton.isEnabled = true
        playButton.alpha = 1f
        updateProgress()
        updatePlayIcon()
        errorText.visibility = GONE
        emitPlaybackState("prepared", duration = it.duration.coerceAtLeast(0), position = 0)
        if (!paused) setPaused(false)
      }
      player.setOnCompletionListener {
        paused = true
        stopProgressTicker()
        if (activePlayerView === this) activePlayerView = null
        abandonAudioFocus()
        updatePlayIcon()
        seekBar.progress = 0
        it.seekTo(0)
        updateProgress()
        emitPlaybackState("completed", duration = it.duration.coerceAtLeast(0), position = 0)
      }
      player.setOnErrorListener { _, what, extra ->
        Log.w("OracleAudioPlayer", "MediaPlayer error for $cleanValue what=$what extra=$extra")
        showError("Lecture audio impossible")
        true
      }
      player.prepareAsync()
    } catch (error: Exception) {
      Log.w("OracleAudioPlayer", "Audio source preparation failed for $cleanValue", error)
      showError(error.message ?: "Lecture audio impossible")
    }
  }

  fun setPaused(value: Boolean) {
    paused = value
    val player = mediaPlayer
    if (!isPrepared || player == null) {
      if (value) stopProgressTicker()
      updatePlayIcon()
      return
    }
    if (value) {
      if (player.isPlaying) player.pause()
      stopProgressTicker()
      if (activePlayerView === this) activePlayerView = null
      abandonAudioFocus()
      emitPlaybackState("paused", duration = player.duration.coerceAtLeast(0), position = player.currentPosition.coerceAtLeast(0))
    } else {
      activePlayerView?.takeIf { it !== this }?.setPaused(true)
      if (!requestAudioFocus()) {
        showError("Sortie audio indisponible")
        return
      }
      try {
        player.start()
        activePlayerView = this
        startProgressTicker()
        emitPlaybackState("playing", duration = player.duration.coerceAtLeast(0), position = player.currentPosition.coerceAtLeast(0))
      } catch (error: Exception) {
        Log.w("OracleAudioPlayer", "Audio playback failed for ${sourceUrl.orEmpty()}", error)
        showError("Lecture audio impossible")
      }
    }
    updatePlayIcon()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (!paused && isPrepared) startProgressTicker()
  }

  override fun onDetachedFromWindow() {
    stopProgressTicker()
    resetPlayer()
    super.onDetachedFromWindow()
  }

  private fun togglePlayback() {
    setPaused(!paused)
  }

  private fun resetPlayer() {
    isPrepared = false
    paused = true
    stopProgressTicker()
    if (activePlayerView === this) activePlayerView = null
    abandonAudioFocus()
    playButton.isEnabled = false
    playButton.alpha = 0.55f
    updatePlayIcon()
    seekBar.progress = 0
    seekBar.max = 0
    timeText.text = "00:00 / 00:00"
    errorText.visibility = GONE
    mediaPlayer?.release()
    mediaPlayer = null
  }

  private fun showError(message: String = "Lecture audio impossible") {
    isPrepared = false
    paused = true
    stopProgressTicker()
    if (activePlayerView === this) activePlayerView = null
    abandonAudioFocus()
    playButton.isEnabled = false
    playButton.alpha = 0.55f
    updatePlayIcon()
    errorText.text = message.ifBlank { "Lecture audio impossible" }
    errorText.visibility = VISIBLE
    emitPlaybackState("error", error = errorText.text.toString())
    mediaPlayer?.release()
    mediaPlayer = null
  }

  private fun emitPlaybackState(
    state: String,
    duration: Int = mediaPlayer?.duration?.coerceAtLeast(0) ?: 0,
    position: Int = mediaPlayer?.currentPosition?.coerceAtLeast(0) ?: 0,
    error: String? = null,
  ) {
    val themedContext = reactContext ?: return
    if (id == NO_ID) return
    val surfaceId = UIManagerHelper.getSurfaceId(themedContext)
    val event = Arguments.createMap().apply {
      putString("state", state)
      putDouble("duration", duration.toDouble())
      putDouble("position", position.toDouble())
      if (!error.isNullOrBlank()) putString("error", error)
    }
    UIManagerHelper.getEventDispatcherForReactTag(themedContext, id)
      ?.dispatchEvent(OracleAudioPlaybackEvent(surfaceId, id, event))
  }

  private fun startProgressTicker() {
    if (progressTickerActive) return
    progressTickerActive = true
    handler.post(progressTick)
  }

  private fun stopProgressTicker() {
    progressTickerActive = false
    handler.removeCallbacks(progressTick)
  }

  private fun updateProgress() {
    val player = mediaPlayer ?: return
    if (!isPrepared || userSeeking) return
    val duration = player.duration.coerceAtLeast(0)
    val position = player.currentPosition.coerceAtLeast(0)
    seekBar.max = duration
    seekBar.progress = position.coerceAtMost(duration)
    timeText.text = "${formatTime(position)} / ${formatTime(duration)}"
  }

  private fun validatedSourceUri(value: String): Uri {
    val uri = Uri.parse(value)
    if (uri.scheme.equals("file", ignoreCase = true)) {
      val path = uri.path
      val file = if (path.isNullOrBlank()) null else File(path)
      if (file == null || !file.exists() || file.length() <= 0L) {
        throw IllegalArgumentException("Fichier audio local introuvable")
      }
    }
    return uri
  }

  private fun playbackAttributes(): AudioAttributes? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return null
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
  }

  @Suppress("DEPRECATION")
  private fun configurePlayerAudio(player: MediaPlayer) {
    val attributes = playbackAttributes()
    if (attributes != null) {
      player.setAudioAttributes(attributes)
    } else {
      player.setAudioStreamType(AudioManager.STREAM_MUSIC)
    }
  }

  @Suppress("DEPRECATION")
  private fun requestAudioFocus(): Boolean {
    if (hasAudioFocus) return true
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = audioFocusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(playbackAttributes()!!)
        .setOnAudioFocusChangeListener(focusChangeListener, handler)
        .setWillPauseWhenDucked(true)
        .build()
        .also { audioFocusRequest = it }
      audioManager.requestAudioFocus(request)
    } else {
      audioManager.requestAudioFocus(
        focusChangeListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
      )
    }
    hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    return hasAudioFocus
  }

  @Suppress("DEPRECATION")
  private fun abandonAudioFocus() {
    if (!hasAudioFocus) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
    } else {
      audioManager.abandonAudioFocus(focusChangeListener)
    }
    hasAudioFocus = false
  }

  private fun updatePlayIcon() {
    playButton.text = if (paused) "\u25B6" else "\u275A\u275A"
  }

  private fun roundDrawable(color: Int, radiusDp: Float): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      setColor(color)
      cornerRadius = radiusDp * resources.displayMetrics.density
    }
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  private fun formatTime(ms: Int): String {
    val seconds = (ms / 1000).coerceAtLeast(0)
    val minutes = seconds / 60
    val remain = seconds % 60
    return String.format("%02d:%02d", minutes, remain)
  }

  private companion object {
    private var activePlayerView: OracleAudioPlayerView? = null
  }
}
