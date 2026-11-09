package de.mevicar.next

import org.junit.Assert.*
import org.junit.Test

class StreamUrlPolicyTest {
    private val ticket = "exp=1950000000&sig=" + "a".repeat(64)
    @Test fun validNativeStream() {
        assertTrue(StreamUrlPolicy.accepts("https://mevitv.mtankurt.synology.me/stream/live/42.ts?$ticket"))
        assertTrue(StreamUrlPolicy.accepts("https://mevitv.mtankurt.synology.me/stream/movie/43.mp4?$ticket"))
    }
    @Test fun rejectUntrustedUrls() {
        assertFalse(StreamUrlPolicy.accepts("http://mevitv.mtankurt.synology.me/stream/live/42.ts?$ticket"))
        assertFalse(StreamUrlPolicy.accepts("https://evil.example/stream/live/42.ts?$ticket"))
        assertFalse(StreamUrlPolicy.accepts("https://mevitv.mtankurt.synology.me.evil.example/stream/live/42.ts?$ticket"))
        assertFalse(StreamUrlPolicy.accepts("https://mevitv.mtankurt.synology.me/stream/live/../42.ts?$ticket"))
        assertFalse(StreamUrlPolicy.accepts("https://mevitv.mtankurt.synology.me/remux/live/42/index.m3u8?$ticket"))
        assertFalse(StreamUrlPolicy.accepts("https://mevitv.mtankurt.synology.me/stream/live/42.ts?exp=12&sig=xyz"))
    }
}
