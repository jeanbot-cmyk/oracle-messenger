package online.oracle_plus.messenger

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class OracleAudioPlayerManager : SimpleViewManager<OracleAudioPlayerView>() {
  override fun getName(): String = "OracleAudioPlayer"

  override fun createViewInstance(reactContext: ThemedReactContext): OracleAudioPlayerView {
    return OracleAudioPlayerView(reactContext)
  }

  @ReactProp(name = "sourceUrl")
  fun setSourceUrl(view: OracleAudioPlayerView, sourceUrl: String?) {
    view.setSourceUrl(sourceUrl)
  }

  @ReactProp(name = "paused", defaultBoolean = true)
  fun setPaused(view: OracleAudioPlayerView, paused: Boolean) {
    view.setPaused(paused)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return mutableMapOf(
      "topPlaybackStateChange" to mapOf("registrationName" to "onPlaybackStateChange"),
    )
  }
}
