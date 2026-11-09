package de.mevicar.next

import java.net.URI

/** No raw provider URLs, credentials or arbitrary external URLs are accepted. */
internal object StreamUrlPolicy {
    private val path = Regex("^/stream/(live|movie|series)/[0-9]{1,15}\\.(ts|m3u8|mp4|mkv|avi|mov)$")
    private val ticket = Regex("^exp=[0-9]{1,12}&sig=[a-f0-9]{64}$")

    fun accepts(raw: String): Boolean {
        return try {
            val uri = URI(raw)
            uri.scheme == "https" &&
                uri.host == "mevitv.mtankurt.synology.me" &&
                uri.port == -1 &&
                uri.userInfo == null && uri.fragment == null &&
                uri.rawPath?.let(path::matches) == true &&
                uri.rawQuery?.let(ticket::matches) == true
        } catch (_: Exception) {
            false
        }
    }
}
