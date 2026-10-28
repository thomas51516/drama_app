package com.drama.app.logging

import android.util.Log
import com.drama.core.common.logging.Logger
import javax.inject.Inject

class AndroidLogger
    @Inject
    constructor() : Logger {
        override fun d(
            tag: String,
            message: String,
        ) {
            Log.d(tag, message)
        }

        override fun i(
            tag: String,
            message: String,
        ) {
            Log.i(tag, message)
        }

        override fun w(
            tag: String,
            message: String,
            throwable: Throwable?,
        ) {
            Log.w(tag, message, throwable)
        }

        override fun e(
            tag: String,
            message: String,
            throwable: Throwable?,
        ) {
            Log.e(tag, message, throwable)
        }
    }
