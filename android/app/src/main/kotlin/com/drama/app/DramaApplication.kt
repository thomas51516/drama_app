package com.drama.app

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.request.crossfade
import coil3.svg.SvgDecoder
import com.drama.app.push.ForegroundPushBus
import com.drama.app.push.NotificationChannels
import com.drama.app.startup.AppStartup
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class DramaApplication :
    Application(),
    SingletonImageLoader.Factory {
    @Inject
    lateinit var startup: AppStartup

    @Inject
    lateinit var foregroundPush: ForegroundPushBus

    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(foregroundPush)
        NotificationChannels.ensure(this)
        startup.onAppCreate()
    }

    /** Posters and banners: OkHttp fetcher (auto-registered) plus SVG decoding for the dev placeholders. */
    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader
            .Builder(context)
            .components { add(SvgDecoder.Factory()) }
            .crossfade(true)
            .build()
}
