package online.oracle_plus.messenger

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class OracleVideoPlayerManager : SimpleViewManager<OracleVideoPlayerView>() {
  override fun getName(): String = "OracleVideoPlayer"

  override fun createViewInstance(reactContext: ThemedReactContext): OracleVideoPlayerView {
    return OracleVideoPlayerView(reactContext)
  }

  @ReactProp(name = "sourceUrl")
  fun setSourceUrl(view: OracleVideoPlayerView, sourceUrl: String?) {
    view.setSourceUrl(sourceUrl)
  }

  @ReactProp(name = "paused", defaultBoolean = false)
  fun setPaused(view: OracleVideoPlayerView, paused: Boolean) {
    view.setPaused(paused)
  }

  @ReactProp(name = "muted", defaultBoolean = false)
  fun setMuted(view: OracleVideoPlayerView, muted: Boolean) {
    view.setMuted(muted)
  }

  @ReactProp(name = "repeat", defaultBoolean = false)
  fun setRepeat(view: OracleVideoPlayerView, repeat: Boolean) {
    view.setRepeat(repeat)
  }
}
