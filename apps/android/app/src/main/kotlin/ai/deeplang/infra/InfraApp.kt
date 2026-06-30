package ai.deeplang.infra

import ai.deeplang.infra.di.ServiceLocator
import android.app.Application

class InfraApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.init(this)
    }
}
