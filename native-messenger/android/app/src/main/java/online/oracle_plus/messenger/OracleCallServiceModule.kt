package online.oracle_plus.messenger

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OracleCallServiceModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "OracleCallService"

  @ReactMethod
  fun startCall(callType: String, callerName: String, promise: Promise) {
    try {
      OracleCallForegroundService.start(reactContext, callType, callerName)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ORACLE_CALL_SERVICE_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stopCall(promise: Promise) {
    try {
      OracleCallForegroundService.stop(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ORACLE_CALL_SERVICE_STOP_FAILED", error.message, error)
    }
  }
}
