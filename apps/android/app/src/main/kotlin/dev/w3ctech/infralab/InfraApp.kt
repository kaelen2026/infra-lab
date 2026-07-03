package dev.w3ctech.infralab

import dev.w3ctech.infralab.di.ServiceLocator
import android.app.Application

class InfraApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.init(this)
    }
}
