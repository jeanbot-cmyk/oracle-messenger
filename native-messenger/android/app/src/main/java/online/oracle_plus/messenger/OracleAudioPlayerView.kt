package online.oracle_plus.messenger

import android.content.Context
import android.graphics.Color
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView

class OracleAudioPlayerView(context: Context) : FrameLayout(context) {
  private val handler = Handler(Looper.getMainLooper())
  private val container = LinearLayout(context)
  private val playButton = Button(context)
  private val seekBar = SeekBar(context)
  private val timeText = TextView(context)
  private val errorText = TextView(context)
  private var mediaPlayer: MediaPlayer? = null
  private var sourceUrl: String? = null
  private var isPrepared = false
  private var userSeeking = false
  private var paused = true

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

    container.orientation = LinearLayout.VERTICAL
    container.gravity = Gravity.CENTER
    container.setPadding(20, 18, 20, 18)
    container.layoutParams = LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
      Gravity.CENTER
    )
    addView(container)

    playButton.text = "Lire"
    playButton.setOnClickListener { togglePlayback() }
    container.addView(playButton, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ))

    container.addView(seekBar, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ))

    timeText.setTextColor(Color.rgb(17, 24, 39))
    timeText.gravity = Gravity.CENTER
    timeText.text = "00:00 / 00:00"
    container.addView(timeText, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ))

    errorText.setTextColor(Color.rgb(185, 28, 28))
    errorText.gravity = Gravity.CENTER
    errorText.visibility = GONE
    container.addView(errorText, LinearLayout.LayoutParams(
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
        playButton.text = if (paused) "Lire" else "Pause"
        errorText.visibility = GONE
        if (!paused) it.start()
      }
      player.setOnCompletionListener {
        paused = true
        playButton.text = "Lire"
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
      playButton.text = if (value) "Lire" else "Pause"
      return
    }
    if (value) {
      if (player.isPlaying) player.pause()
      playButton.text = "Lire"
    } else {
      player.start()
      playButton.text = "Pause"
    }
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
    playButton.text = "Lire"
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
    playButton.text = "Lire"
    errorText.text = "Lecture audio impossible"
    errorText.visibility = VISIBLE
  }

  private fun formatTime(ms: Int): String {
    val seconds = (ms / 1000).coerceAtLeast(0)
    val minutes = seconds / 60
    val remain = seconds % 60
    return String.format("%02d:%02d", minutes, remain)
  }
}
