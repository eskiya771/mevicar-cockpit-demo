package de.mevicar.next

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

/**
 * Media3 directly reads signed MPEG-TS over the Synology HTTPS bridge.
 * It never learns the IPTV account credentials or the long bridge secret.
 */
class NativePlayerActivity : Activity() {
    companion object {
        const val EXTRA_URL = "playback_url"
        const val EXTRA_TITLE = "playback_title"
    }
    private var player: ExoPlayer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL).orEmpty()
        if (!StreamUrlPolicy.accepts(url)) {
            finish()
            return
        }

        val layout = FrameLayout(this).apply { setBackgroundColor(android.graphics.Color.BLACK) }
        val playerView = PlayerView(this).apply {
            useController = true
            keepScreenOn = true
        }
        layout.addView(playerView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))
        val errorView = TextView(this).apply {
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(0xC0000000.toInt())
            textSize = 16f
            setPadding(24, 12, 24, 12)
            visibility = android.view.View.GONE
        }
        layout.addView(errorView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            android.view.Gravity.BOTTOM
        ))
        setContentView(layout)

        val mime = when {
            url.substringBefore('?').endsWith(".ts") -> MimeTypes.VIDEO_MP2T
            url.substringBefore('?').endsWith(".m3u8") -> MimeTypes.APPLICATION_M3U8
            url.substringBefore('?').endsWith(".mp4") -> MimeTypes.VIDEO_MP4
            else -> null
        }
        val item = MediaItem.Builder().setUri(url).apply {
            if (mime != null) setMimeType(mime)
        }.build()

        val exo = ExoPlayer.Builder(this).build()
        player = exo
        playerView.player = exo
        exo.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                errorView.text = "Wiedergabe fehlgeschlagen: " + error.errorCodeName
                errorView.visibility = android.view.View.VISIBLE
            }
        })
        exo.setMediaItem(item)
        exo.prepare()
        exo.playWhenReady = true
    }

    override fun onStop() {
        player?.release()
        player = null
        super.onStop()
    }
}
