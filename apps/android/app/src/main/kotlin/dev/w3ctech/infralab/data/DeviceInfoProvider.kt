package dev.w3ctech.infralab.data

import android.content.Context
import dev.w3ctech.infralab.BuildConfig
import dev.w3ctech.infralab.data.contracts.DeviceInfo
import dev.w3ctech.infralab.data.contracts.Platform
import android.os.Build
import java.util.UUID

/**
 * Builds the [DeviceInfo] attached to verify requests. The deviceId is a stable per-install UUID
 * (not a hardware identifier — those need permissions and are discouraged), generated once and
 * persisted in plain SharedPreferences (it is an opaque, non-secret install id).
 */
class DeviceInfoProvider(context: Context) {
    private val prefs = context.applicationContext
        .getSharedPreferences("infra_device", Context.MODE_PRIVATE)

    private val deviceId: String by lazy {
        prefs.getString(KEY_DEVICE_ID, null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString(KEY_DEVICE_ID, it).apply()
        }
    }

    fun current(pushToken: String? = null): DeviceInfo = DeviceInfo(
        platform = Platform.ANDROID,
        deviceId = deviceId,
        model = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
        osVersion = "Android ${Build.VERSION.RELEASE}",
        appVersion = BuildConfig.VERSION_NAME,
        pushToken = pushToken,
    )

    private companion object {
        const val KEY_DEVICE_ID = "device_id"
    }
}
