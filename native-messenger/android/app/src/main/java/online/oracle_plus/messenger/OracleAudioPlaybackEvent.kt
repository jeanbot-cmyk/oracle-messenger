package online.oracle_plus.messenger

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

class OracleAudioPlaybackEvent(
  surfaceId: Int,
  viewTag: Int,
  private val eventData: WritableMap,
) : Event<OracleAudioPlaybackEvent>(surfaceId, viewTag) {
  override fun getEventName(): String = "topPlaybackStateChange"

  override fun canCoalesce(): Boolean = false

  override fun getEventData(): WritableMap = eventData
}
