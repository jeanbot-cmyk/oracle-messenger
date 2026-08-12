package online.oracle_plus.messenger

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView

class OracleAudioPlayerView(context: Context) : FrameLayout(context) {
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
  private val brandColor = Color.rgb(16, 42, 42)
  private val mutedColor = Color.rgb(100, 116, 139)
  private val trackColor = Color.rgb(226, 232, 240)
  private val dangerColor = Color.rgb(180, 35, 24)

  private val progressTick = object : Runnable {
    override fun run() {
      val player = mediaPlayer
      if (player != null && isPrepared && !userSeeking) {
        val duration = player.duration.coerceAtLeast(0)
        val position = player.currentPosition.coerceAtLeast(0)
        seekBar.max = duration
        seekBar.progress = position.coerceAtMost(duration)
        timeText.text = "${formatTime(position)} / ${formatTime(duration)}"
      }
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

    handler.post(progressTick)
  }

  fun setSourceUrl(value: String?) {
    val cleanValue = value?.trim().orEmpty()
    if (cleanValue == sourceUrl.orEmpty()) return
    sourceUrl = cleanValue
    resetPlayer()
    if (cleanValue.isBlank()) return

    try {
      val player = MediaPlayer()
      mediaPlayer = player
      player.setDataSource(context, Uri.parse(cleanValue))
      player.setOnPreparedListener {
        isPrepared = true
        seekBar.max = it.duration.coerceAtLeast(0)
        timeText.text = "00:00 / ${formatTime(it.duration)}"
        playButton.isEnabled = true
        playButton.alpha = 1f
        updatePlayIcon()
        errorText.visibility = GONE
        if (!paused) it.start()
      }
      player.setOnCompletionListener {
        paused = true
        updatePlayIcon()
        seekBar.progress = 0
        it.seekTo(0)
      }
      player.setOnErrorListener { _, _, _ ->
        showError()
        true
      }
      player.prepareAsync()
    } catch (_: Exception) {
      showError()
    }
  }

  fun setPaused(value: Boolean) {
    paused = value
    val player = mediaPlayer
    if (!isPrepared || player == null) {
      updatePlayIcon()
      return
    }
    if (value) {
      if (player.isPlaying) player.pause()
    } else {
      player.start()
    }
    updatePlayIcon()
  }

  override fun onDetachedFromWindow() {
    handler.removeCallbacks(progressTick)
    resetPlayer()
    super.onDetachedFromWindow()
  }

  private fun togglePlayback() {
    setPaused(!paused)
  }

  private fun resetPlayer() {
    isPrepared = false
    paused = true
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

  private fun showError() {
    isPrepared = false
    paused = true
    playButton.isEnabled = false
    playButton.alpha = 0.55f
    updatePlayIcon()
    errorText.text = "Lecture audio impossible"
    errorText.visibility = VISIBLE
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
}
