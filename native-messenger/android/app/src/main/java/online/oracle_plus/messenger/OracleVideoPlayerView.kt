package online.oracle_plus.messenger

import android.content.Context
import android.graphics.Color
import android.media.MediaPlayer
import android.net.Uri
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.MediaController
import android.widget.TextView
import android.widget.VideoView

class OracleVideoPlayerView(context: Context) : FrameLayout(context) {
  private val videoView = VideoView(context)
  private val errorView = TextView(context)
  private val mediaController = MediaController(context)
  private var sourceUrl: String? = null
  private var mediaPlayer: MediaPlayer? = null
  private var paused = false
  private var muted = false
  private var repeat = false
  private var videoWidth = 0
  private var videoHeight = 0

  init {
    setBackgroundColor(Color.BLACK)

    videoView.layoutParams = LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )
    videoView.setBackgroundColor(Color.BLACK)
    videoView.setMediaController(mediaController)
    mediaController.setAnchorView(videoView)
    addView(videoView)

    errorView.layoutParams = LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
      Gravity.CENTER
    )
    errorView.gravity = Gravity.CENTER
    errorView.setTextColor(Color.WHITE)
    errorView.textSize = 14f
    errorView.setPadding(32, 24, 32, 24)
    errorView.visibility = GONE
    addView(errorView)

    videoView.setOnPreparedListener { player ->
      mediaPlayer = player
      videoWidth = player.videoWidth
      videoHeight = player.videoHeight
      updateVideoLayout()
      player.isLooping = repeat
      player.setOnVideoSizeChangedListener { _, width, height ->
        videoWidth = width
        videoHeight = height
        updateVideoLayout()
      }
      applyMute()
      errorView.visibility = GONE
      videoView.setBackgroundColor(Color.TRANSPARENT)
      if (!paused) videoView.start()
    }

    videoView.setOnErrorListener { _, _, _ ->
      errorView.text = "Lecture video impossible"
      errorView.visibility = VISIBLE
      true
    }
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updateVideoLayout()
  }

  fun setSourceUrl(value: String?) {
    val cleanValue = value?.trim().orEmpty()
    if (cleanValue == sourceUrl.orEmpty()) return
    sourceUrl = cleanValue
    if (cleanValue.isBlank()) {
      videoView.stopPlayback()
      errorView.visibility = GONE
      videoWidth = 0
      videoHeight = 0
      return
    }
    errorView.visibility = GONE
    videoView.setBackgroundColor(Color.BLACK)
    videoWidth = 0
    videoHeight = 0
    videoView.setVideoURI(Uri.parse(cleanValue))
    if (!paused) videoView.start()
  }

  fun setPaused(value: Boolean) {
    paused = value
    if (value) {
      if (videoView.isPlaying) videoView.pause()
    } else if (!sourceUrl.isNullOrBlank()) {
      videoView.start()
    }
  }

  fun setMuted(value: Boolean) {
    muted = value
    applyMute()
  }

  fun setRepeat(value: Boolean) {
    repeat = value
    mediaPlayer?.isLooping = value
  }

  override fun onDetachedFromWindow() {
    videoView.stopPlayback()
    mediaPlayer = null
    super.onDetachedFromWindow()
  }

  private fun applyMute() {
    val volume = if (muted) 0f else 1f
    mediaPlayer?.setVolume(volume, volume)
  }

  private fun updateVideoLayout() {
    val parentWidth = width
    val parentHeight = height
    if (parentWidth <= 0 || parentHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) {
      videoView.layoutParams = LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
        Gravity.CENTER
      )
      return
    }
    val parentRatio = parentWidth.toFloat() / parentHeight.toFloat()
    val videoRatio = videoWidth.toFloat() / videoHeight.toFloat()
    val targetWidth: Int
    val targetHeight: Int
    if (videoRatio > parentRatio) {
      targetWidth = parentWidth
      targetHeight = (parentWidth / videoRatio).toInt()
    } else {
      targetHeight = parentHeight
      targetWidth = (parentHeight * videoRatio).toInt()
    }
    videoView.layoutParams = LayoutParams(
      targetWidth.coerceAtLeast(1),
      targetHeight.coerceAtLeast(1),
      Gravity.CENTER
    )
  }
}
