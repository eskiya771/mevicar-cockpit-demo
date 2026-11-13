package de.mevicar.next

import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.UUID

/**
 * Apple Notification Center Service (ANCS) wire format. Pure Kotlin so that the parser and the command
 * builders are unit-tested on the JVM; the Bluetooth transport lives in [AncsLink].
 *
 * Byte order is little endian throughout (Apple "ANCS Specification": NotificationSource, ControlPoint and
 * DataSource characteristics).
 */
object AncsProtocol {
    val SERVICE: UUID = UUID.fromString("7905F431-B5CE-4E99-A40F-4B1E122D00D0")
    val NOTIFICATION_SOURCE: UUID = UUID.fromString("9FBF120D-6301-42D9-8C58-25E699A21DBD")
    val CONTROL_POINT: UUID = UUID.fromString("69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9")
    val DATA_SOURCE: UUID = UUID.fromString("22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFB")
    val CLIENT_CONFIG: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    const val EVENT_ADDED = 0
    const val EVENT_MODIFIED = 1
    const val EVENT_REMOVED = 2
    const val FLAG_SILENT = 0x01
    const val FLAG_IMPORTANT = 0x02
    const val FLAG_PRE_EXISTING = 0x04
    const val FLAG_POSITIVE_ACTION = 0x08
    const val FLAG_NEGATIVE_ACTION = 0x10
    const val CATEGORY_OTHER = 0
    const val CATEGORY_INCOMING_CALL = 1
    const val CATEGORY_MISSED_CALL = 2
    const val CATEGORY_VOICEMAIL = 3
    const val ATTRIBUTE_APP_IDENTIFIER = 0
    const val ATTRIBUTE_TITLE = 1
    const val ATTRIBUTE_SUBTITLE = 2
    const val ATTRIBUTE_MESSAGE = 3
    const val ATTRIBUTE_DATE = 5
    const val ATTRIBUTE_POSITIVE_LABEL = 6
    const val ATTRIBUTE_NEGATIVE_LABEL = 7
    const val ACTION_POSITIVE = 0
    const val ACTION_NEGATIVE = 1
    private const val COMMAND_GET_NOTIFICATION_ATTRIBUTES = 0
    private const val COMMAND_PERFORM_ACTION = 2
    /** Attribute IDs requested by [getAttributes], in request order (the iPhone answers in the same order). */
    val REQUESTED_ATTRIBUTES = listOf(ATTRIBUTE_APP_IDENTIFIER, ATTRIBUTE_TITLE, ATTRIBUTE_SUBTITLE, ATTRIBUTE_MESSAGE,
        ATTRIBUTE_DATE, ATTRIBUTE_POSITIVE_LABEL, ATTRIBUTE_NEGATIVE_LABEL)
    /** Attributes that carry a maximum length in the request (strings of unbounded size). */
    private val SIZED_ATTRIBUTES = setOf(ATTRIBUTE_TITLE, ATTRIBUTE_SUBTITLE, ATTRIBUTE_MESSAGE)

    /** One Notification Source packet (8 bytes). */
    data class Event(val eventId: Int, val flags: Int, val category: Int, val categoryCount: Int, val uid: Long) {
        val added get() = eventId == EVENT_ADDED
        val removed get() = eventId == EVENT_REMOVED
        val incomingCall get() = category == CATEGORY_INCOMING_CALL
        val missedCall get() = category == CATEGORY_MISSED_CALL
        val canAnswer get() = flags and FLAG_POSITIVE_ACTION != 0
        val canDecline get() = flags and FLAG_NEGATIVE_ACTION != 0
        val preExisting get() = flags and FLAG_PRE_EXISTING != 0
    }

    /** Attributes of one notification as answered on the Data Source characteristic. */
    data class Attributes(val uid: Long, val values: Map<Int, String>) {
        val appIdentifier get() = values[ATTRIBUTE_APP_IDENTIFIER].orEmpty()
        val title get() = values[ATTRIBUTE_TITLE].orEmpty()
        val subtitle get() = values[ATTRIBUTE_SUBTITLE].orEmpty()
        val message get() = values[ATTRIBUTE_MESSAGE].orEmpty()
        val date get() = values[ATTRIBUTE_DATE].orEmpty()
        val positiveLabel get() = values[ATTRIBUTE_POSITIVE_LABEL].orEmpty()
        val negativeLabel get() = values[ATTRIBUTE_NEGATIVE_LABEL].orEmpty()
        /** Caller as shown in the cockpit: the title (contact name or number), falling back to subtitle/message. */
        val caller get() = title.ifBlank { subtitle.ifBlank { message.ifBlank { "Unbekannter Anrufer" } } }
        /** Secondary line: subtitle (usually the number or label) unless identical to the caller. */
        val detail get() = subtitle.takeIf { it.isNotBlank() && it != title } ?: message.takeIf { it.isNotBlank() && it != title }.orEmpty()
    }

    fun parseEvent(packet: ByteArray): Event? {
        if (packet.size < 8) return null
        return Event(packet[0].toInt() and 0xFF, packet[1].toInt() and 0xFF, packet[2].toInt() and 0xFF,
            packet[3].toInt() and 0xFF, uint32(packet, 4))
    }

    /** Control Point command "Get Notification Attributes" for [REQUESTED_ATTRIBUTES]. */
    fun getAttributes(uid: Long, maxLength: Int = 96): ByteArray {
        val out = ArrayList<Byte>(5 + REQUESTED_ATTRIBUTES.size * 3)
        out.add(COMMAND_GET_NOTIFICATION_ATTRIBUTES.toByte())
        putUint32(out, uid)
        for (id in REQUESTED_ATTRIBUTES) {
            out.add(id.toByte())
            if (id in SIZED_ATTRIBUTES) { out.add((maxLength and 0xFF).toByte()); out.add((maxLength shr 8 and 0xFF).toByte()) }
        }
        return out.toByteArray()
    }

    /** Control Point command "Perform Notification Action" ([ACTION_POSITIVE] = answer, [ACTION_NEGATIVE] = decline). */
    fun performAction(uid: Long, action: Int): ByteArray {
        val out = ArrayList<Byte>(6)
        out.add(COMMAND_PERFORM_ACTION.toByte())
        putUint32(out, uid)
        out.add(action.toByte())
        return out.toByteArray()
    }

    /**
     * Parses a complete Get Notification Attributes response. Returns null while the data is still incomplete
     * (responses arrive fragmented over several Data Source notifications) and throws on a foreign command id.
     */
    fun parseAttributes(data: ByteArray, expected: List<Int> = REQUESTED_ATTRIBUTES): Attributes? {
        if (data.isEmpty()) return null
        if (data[0].toInt() != COMMAND_GET_NOTIFICATION_ATTRIBUTES) throw IllegalArgumentException("Unexpected ANCS command " + data[0])
        if (data.size < 5) return null
        val uid = uint32(data, 1)
        var position = 5
        val values = LinkedHashMap<Int, String>()
        repeat(expected.size) {
            if (position + 3 > data.size) return null
            val id = data[position].toInt() and 0xFF
            val length = (data[position + 1].toInt() and 0xFF) or (data[position + 2].toInt() and 0xFF shl 8)
            position += 3
            if (position + length > data.size) return null
            values[id] = String(data, position, length, Charsets.UTF_8)
            position += length
        }
        return Attributes(uid, values)
    }

    /** Collects Data Source fragments until one complete attribute response is available. */
    class AttributeAssembler {
        private var buffer = ByteArray(0)
        val pending get() = buffer.isNotEmpty()
        fun reset() { buffer = ByteArray(0) }
        /** Returns the parsed response once complete; malformed data discards the buffer and returns null. */
        fun feed(fragment: ByteArray): Attributes? {
            buffer += fragment
            val parsed = try { parseAttributes(buffer) } catch (_: IllegalArgumentException) { reset(); return null }
            if (parsed != null) reset()
            return parsed
        }
    }

    /** ANCS date attribute (yyyyMMdd'T'HHmmss) to epoch millis, null when absent or unreadable. */
    fun parseDate(value: String): Long? {
        val compact = value.replace("T", "")
        if (compact.length < 14) return null
        return try { SimpleDateFormat("yyyyMMddHHmmss", Locale.US).parse(compact)?.time } catch (_: ParseException) { null }
    }

    private fun uint32(data: ByteArray, offset: Int): Long =
        (data[offset].toLong() and 0xFF) or (data[offset + 1].toLong() and 0xFF shl 8) or
            (data[offset + 2].toLong() and 0xFF shl 16) or (data[offset + 3].toLong() and 0xFF shl 24)
    private fun putUint32(out: MutableList<Byte>, value: Long) {
        for (shift in 0..3) out.add((value shr (8 * shift) and 0xFF).toByte())
    }
}
