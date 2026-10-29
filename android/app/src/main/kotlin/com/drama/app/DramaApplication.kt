package com.drama.app

import android.app.Application
import com.drama.app.startup.AppStartup
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class DramaApplication : Application() {
    @Inject
    lateinit var startup: AppStartup

    override fun onCreate() {
        super.onCreate()
        startup.onAppCreate()
    }
}
