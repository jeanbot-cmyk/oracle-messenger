package online.oracle_plus.messenger

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class OracleNativePackage : ReactPackage {
  @Deprecated("ReactPackage#createNativeModules is deprecated upstream but still required for these legacy native modules.")
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(
      OracleCallAlertModule(reactContext),
      OracleCallServiceModule(reactContext),
      OracleIncomingCallNotificationModule(reactContext),
      OracleMediaDownloadModule(reactContext),
      OracleVoiceRecorderModule(reactContext)
    )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(
      OracleAudioPlayerManager(),
      OracleVideoPlayerManager()
    )
  }
}
