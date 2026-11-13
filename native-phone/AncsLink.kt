package de.mevicar.next

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import java.util.ArrayDeque

/**
 * Bluetooth LE link to an iPhone for the Apple Notification Center Service (ANCS).
 *
 * The phone running Mevicar acts as the BLE *peripheral*: it advertises a solicitation for the ANCS service so
 * that the iPhone lists it under Settings > Bluetooth and connects on its own. As soon as the iPhone is connected
 * (reported by a GATT server opened only for that purpose) Mevicar opens a GATT client on the same link, bonds
 * with the iPhone (ANCS requires an encrypted link), subscribes to the Notification Source and Data Source
 * characteristics and fetches the attributes of call notifications. Answer / decline are Control Point commands.
 *
 * Voice audio never passes through Mevicar; it stays on the iPhone (or whatever hands-free device the iPhone
 * uses). The link lives as long as [start] / [stop] are balanced by the hosting activity; there is no service.
 *
 * All listener callbacks are delivered on the main thread. Every public entry point checks [hasPermissions]
 * before it touches the Bluetooth stack, which is why the permission lint is suppressed for the class.
 */
@SuppressLint("MissingPermission")
class AncsLink(private val context: Context, private val listener: Listener) {
    interface Listener {
        fun onStateChanged(state: State, detail: String)
        fun onIncomingCall(call: Call)
        fun onCallEnded(uid: Long)
        fun onMissedCall(call: Call)
    }

    enum class State { OFF, UNSUPPORTED, NO_PERMISSION, BLUETOOTH_OFF, ADVERTISING, CONNECTING, BONDING, CONNECTED, ERROR }

    data class Call(val uid: Long, val name: String, val detail: String, val canAnswer: Boolean, val canDecline: Boolean, val time: Long)

    private val handler = Handler(Looper.getMainLooper())
    private val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val adapter: BluetoothAdapter? get() = manager?.adapter
    private var advertiser: BluetoothLeAdvertiser? = null
    private var server: BluetoothGattServer? = null
    private var gatt: BluetoothGatt? = null
    private var device: BluetoothDevice? = null
    private var running = false
    private var advertising = false
    private var receiverRegistered = false
    private var connectAttempts = 0
    private var controlPoint: BluetoothGattCharacteristic? = null
    private var notificationSource: BluetoothGattCharacteristic? = null
    private var dataSource: BluetoothGattCharacteristic? = null
    private var subscribed = false

    /** Serialised GATT writes: Android allows a single outstanding GATT operation per connection. */
    private val writes = ArrayDeque<() -> Boolean>()
    private var writeBusy = false
    /** Attribute requests are sent one at a time because the Data Source answers them in order. */
    private val attributeQueue = ArrayDeque<Long>()
    private var awaitingAttributes: Long? = null
    private val assembler = AncsProtocol.AttributeAssembler()
    private val events = LinkedHashMap<Long, AncsProtocol.Event>()
    private val attributeTimeout = Runnable { awaitingAttributes = null; assembler.reset(); requestNextAttributes() }

    var state: State = State.OFF
        private set
    var detail: String = "Aus"
        private set
    val connected get() = state == State.CONNECTED
    val active get() = running

    /** Bluetooth name of this phone as the iPhone will list it (null without permission / adapter). */
    val adapterName: String?
        get() = if (hasPermissions()) try { adapter?.name } catch (_: SecurityException) { null } else null

    /** Whether this phone can act as a BLE peripheral at all. */
    val supported: Boolean
        get() = adapter != null && context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)

    val bluetoothEnabled: Boolean get() = adapter?.isEnabled == true

    fun requiredPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= 31) arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_ADVERTISE)
        else emptyArray()

    fun hasPermissions(): Boolean = requiredPermissions().all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    fun start() {
        if (running) return
        if (!supported) { setState(State.UNSUPPORTED, "Dieses Gerät unterstützt kein Bluetooth LE."); return }
        if (!hasPermissions()) { setState(State.NO_PERMISSION, "Bluetooth-Berechtigung fehlt."); return }
        running = true
        registerReceiver()
        if (!bluetoothEnabled) { setState(State.BLUETOOTH_OFF, "Bluetooth ist ausgeschaltet."); return }
        bringUp()
    }

    fun stop() {
        if (!running) return
        running = false
        handler.removeCallbacks(attributeTimeout)
        handler.removeCallbacksAndMessages(null)
        tearDown()
        unregisterReceiver()
        setState(State.OFF, "Aus")
    }

    fun answer(uid: Long): Boolean = perform(uid, AncsProtocol.ACTION_POSITIVE)

    fun decline(uid: Long): Boolean = perform(uid, AncsProtocol.ACTION_NEGATIVE)

    private fun perform(uid: Long, action: Int): Boolean {
        val point = controlPoint ?: return false
        val link = gatt ?: return false
        if (!connected || !hasPermissions()) return false
        enqueueWrite { writeCharacteristic(link, point, AncsProtocol.performAction(uid, action)) }
        return true
    }

    // ---- bring-up / tear-down -------------------------------------------------------------------------

    private fun bringUp() {
        if (!running || !hasPermissions()) return
        val adapter = this.adapter ?: return
        val advertiser = adapter.bluetoothLeAdvertiser
        if (advertiser == null || !adapter.isMultipleAdvertisementSupported) {
            setState(State.UNSUPPORTED, "Dieses Handy kann nicht als Bluetooth-LE-Peripherie senden.")
            return
        }
        this.advertiser = advertiser
        if (server == null) {
            server = try { manager?.openGattServer(context, serverCallback) } catch (_: SecurityException) { null }
            if (server == null) { setState(State.ERROR, "Bluetooth-Server konnte nicht geöffnet werden."); return }
        }
        startAdvertising(includeName = true)
    }

    private fun tearDown() {
        stopAdvertising()
        closeGatt()
        try { server?.close() } catch (_: SecurityException) { } catch (_: IllegalStateException) { }
        server = null
        advertiser = null
    }

    private fun closeGatt() {
        handler.removeCallbacks(attributeTimeout)
        val link = gatt
        gatt = null
        if (link != null) {
            try { link.disconnect(); link.close() } catch (_: SecurityException) { } catch (_: IllegalStateException) { }
        }
        controlPoint = null; notificationSource = null; dataSource = null
        subscribed = false
        writes.clear(); writeBusy = false
        attributeQueue.clear(); awaitingAttributes = null; assembler.reset()
        for (uid in events.keys.toList()) if (events[uid]?.incomingCall == true) listener.onCallEnded(uid)
        events.clear()
    }

    // ---- advertising ------------------------------------------------------------------------------

    private var advertiseWithName = true

    private fun startAdvertising(includeName: Boolean) {
        val advertiser = this.advertiser ?: return
        if (advertising) return
        advertiseWithName = includeName
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(true)
            .setTimeout(0)
            .build()
        // 128-bit UUID = 18 bytes of the 31-byte payload; the name travels in the scan response.
        val data = AdvertiseData.Builder().setIncludeDeviceName(false).setIncludeTxPowerLevel(false)
        if (Build.VERSION.SDK_INT >= 31) data.addServiceSolicitationUuid(ParcelUuid(AncsProtocol.SERVICE))
        else data.addServiceUuid(ParcelUuid(AncsProtocol.SERVICE))
        val scanResponse = AdvertiseData.Builder().setIncludeDeviceName(includeName).build()
        try {
            advertiser.startAdvertising(settings, data.build(), scanResponse, advertiseCallback)
            advertising = true
            setState(State.ADVERTISING, "Sichtbar für dein iPhone · warte auf Verbindung")
        } catch (_: SecurityException) {
            setState(State.NO_PERMISSION, "Bluetooth-Berechtigung fehlt.")
        } catch (_: IllegalStateException) {
            setState(State.BLUETOOTH_OFF, "Bluetooth ist ausgeschaltet.")
        }
    }

    private fun stopAdvertising() {
        if (!advertising) return
        advertising = false
        try { advertiser?.stopAdvertising(advertiseCallback) } catch (_: SecurityException) { } catch (_: IllegalStateException) { }
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {}
        override fun onStartFailure(errorCode: Int) {
            handler.post {
                advertising = false
                when {
                    errorCode == ADVERTISE_FAILED_ALREADY_STARTED -> advertising = true
                    errorCode == ADVERTISE_FAILED_DATA_TOO_LARGE && advertiseWithName -> startAdvertising(includeName = false)
                    errorCode == ADVERTISE_FAILED_FEATURE_UNSUPPORTED ->
                        setState(State.UNSUPPORTED, "Dieses Handy kann nicht als Bluetooth-LE-Peripherie senden.")
                    else -> {
                        setState(State.ERROR, "Bluetooth-Werbung fehlgeschlagen (Code $errorCode) · neuer Versuch")
                        if (running) handler.postDelayed({ startAdvertising(advertiseWithName) }, 5_000)
                    }
                }
            }
        }
    }

    // ---- incoming connection (GATT server side) ------------------------------------------------------

    private val serverCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            handler.post {
                if (!running) return@post
                if (newState == BluetoothProfile.STATE_CONNECTED && gatt == null) {
                    connectAttempts = 0
                    connectTo(device)
                }
            }
        }
    }

    private fun connectTo(target: BluetoothDevice) {
        if (!running || !hasPermissions()) return
        device = target
        setState(State.CONNECTING, "iPhone verbindet …")
        gatt = try { target.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE) }
            catch (_: SecurityException) { null }
        if (gatt == null) setState(State.ERROR, "Verbindung zum iPhone konnte nicht geöffnet werden.")
    }

    // ---- GATT client to the iPhone -----------------------------------------------------------------

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(link: BluetoothGatt, status: Int, newState: Int) {
            handler.post {
                if (link !== gatt) { try { link.close() } catch (_: SecurityException) { }; return@post }
                if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                    stopAdvertising()
                    if (!link.requestMtu(185)) afterMtu(link)
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    val target = device
                    closeGatt()
                    if (!running) return@post
                    if (status == 133 && target != null && connectAttempts < 3) {
                        connectAttempts++
                        setState(State.CONNECTING, "Verbindung wird wiederholt (${connectAttempts}/3) …")
                        handler.postDelayed({ if (running && gatt == null) connectTo(target) }, 1_000L * connectAttempts)
                    } else {
                        setState(State.ADVERTISING, "iPhone getrennt · wieder sichtbar")
                        handler.postDelayed({ if (running && gatt == null) startAdvertising(advertiseWithName) }, 500)
                    }
                }
            }
        }

        override fun onMtuChanged(link: BluetoothGatt, mtu: Int, status: Int) {
            handler.post { if (link === gatt) afterMtu(link) }
        }

        override fun onServicesDiscovered(link: BluetoothGatt, status: Int) {
            handler.post {
                if (link !== gatt) return@post
                val service = link.getService(AncsProtocol.SERVICE)
                if (status != BluetoothGatt.GATT_SUCCESS || service == null) {
                    // iOS exposes ANCS only to bonded devices; the service list is refreshed after bonding.
                    if (device?.bondState != BluetoothDevice.BOND_BONDED) requestBond()
                    else setState(State.ERROR, "iPhone meldet keinen Mitteilungsdienst (ANCS). Kopplung am iPhone prüfen.")
                    return@post
                }
                controlPoint = service.getCharacteristic(AncsProtocol.CONTROL_POINT)
                notificationSource = service.getCharacteristic(AncsProtocol.NOTIFICATION_SOURCE)
                dataSource = service.getCharacteristic(AncsProtocol.DATA_SOURCE)
                if (controlPoint == null || notificationSource == null || dataSource == null) {
                    setState(State.ERROR, "ANCS-Dienst unvollständig."); return@post
                }
                subscribe(link)
            }
        }

        override fun onDescriptorWrite(link: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            handler.post {
                if (link !== gatt) return@post
                if (status == GATT_INSUFFICIENT_AUTHENTICATION || status == GATT_INSUFFICIENT_ENCRYPTION) {
                    writes.clear(); writeBusy = false
                    requestBond()
                    return@post
                }
                if (status == BluetoothGatt.GATT_SUCCESS && descriptor.characteristic.uuid == AncsProtocol.NOTIFICATION_SOURCE) {
                    subscribed = true
                    setState(State.CONNECTED, "Mit iPhone verbunden · Anrufe werden angezeigt")
                }
                writeDone()
            }
        }

        override fun onCharacteristicWrite(link: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            handler.post {
                if (link !== gatt) return@post
                if (status == GATT_INSUFFICIENT_AUTHENTICATION || status == GATT_INSUFFICIENT_ENCRYPTION) {
                    writes.clear(); writeBusy = false; requestBond(); return@post
                }
                if (status != BluetoothGatt.GATT_SUCCESS && awaitingAttributes != null) {
                    // 0xA0..0xA2: unknown command / invalid parameters, e.g. the notification is already gone.
                    handler.removeCallbacks(attributeTimeout)
                    awaitingAttributes = null; assembler.reset()
                    writeDone()
                    requestNextAttributes()
                    return@post
                }
                writeDone()
            }
        }

        override fun onCharacteristicChanged(link: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
            handler.post { if (link === gatt) onValue(characteristic.uuid, value) }
        }

        @Deprecated("Replaced by the API 33 overload; still invoked on older Android versions")
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(link: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (Build.VERSION.SDK_INT >= 33) return
            val value = characteristic.value ?: return
            handler.post { if (link === gatt) onValue(characteristic.uuid, value) }
        }
    }

    private fun afterMtu(link: BluetoothGatt) {
        if (device?.bondState == BluetoothDevice.BOND_BONDED) {
            if (!link.discoverServices()) setState(State.ERROR, "Dienste des iPhones konnten nicht abgefragt werden.")
        } else requestBond()
    }

    private fun requestBond() {
        val target = device ?: return
        when (target.bondState) {
            BluetoothDevice.BOND_BONDED -> gatt?.let { if (!subscribed) it.discoverServices() }
            BluetoothDevice.BOND_BONDING -> setState(State.BONDING, "Kopplung läuft · Anfrage auf dem iPhone bestätigen")
            else -> {
                setState(State.BONDING, "Kopplung angefordert · Anfrage auf dem iPhone bestätigen")
                try { target.createBond() } catch (_: SecurityException) { setState(State.NO_PERMISSION, "Bluetooth-Berechtigung fehlt.") }
            }
        }
    }

    private fun subscribe(link: BluetoothGatt) {
        // Data Source first so that no attribute response is lost, then the Notification Source.
        for (characteristic in listOfNotNull(dataSource, notificationSource)) {
            link.setCharacteristicNotification(characteristic, true)
            val descriptor = characteristic.getDescriptor(AncsProtocol.CLIENT_CONFIG) ?: continue
            enqueueWrite { writeDescriptor(link, descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) }
        }
    }

    // ---- notification handling --------------------------------------------------------------------

    private fun onValue(uuid: java.util.UUID, value: ByteArray) {
        when (uuid) {
            AncsProtocol.NOTIFICATION_SOURCE -> {
                val event = AncsProtocol.parseEvent(value) ?: return
                if (!event.incomingCall && !event.missedCall) return
                if (event.removed) {
                    val previous = events.remove(event.uid)
                    attributeQueue.remove(event.uid)
                    if (previous?.incomingCall == true || previous == null && event.incomingCall) listener.onCallEnded(event.uid)
                    return
                }
                val known = events[event.uid]
                events[event.uid] = event
                if (known == null || event.incomingCall && (known.canAnswer != event.canAnswer || known.canDecline != event.canDecline)) {
                    if (event.uid !in attributeQueue && awaitingAttributes != event.uid) attributeQueue.add(event.uid)
                    requestNextAttributes()
                }
            }
            AncsProtocol.DATA_SOURCE -> {
                val attributes = assembler.feed(value) ?: return
                handler.removeCallbacks(attributeTimeout)
                awaitingAttributes = null
                val event = events[attributes.uid]
                if (event != null) {
                    val call = Call(attributes.uid, attributes.caller, attributes.detail, event.canAnswer, event.canDecline,
                        AncsProtocol.parseDate(attributes.date) ?: System.currentTimeMillis())
                    if (event.incomingCall) listener.onIncomingCall(call)
                    else if (event.missedCall) { events.remove(attributes.uid); listener.onMissedCall(call) }
                }
                requestNextAttributes()
            }
        }
    }

    private fun requestNextAttributes() {
        if (awaitingAttributes != null) return
        val uid = attributeQueue.poll() ?: return
        val point = controlPoint ?: return
        val link = gatt ?: return
        awaitingAttributes = uid
        assembler.reset()
        handler.postDelayed(attributeTimeout, 4_000)
        enqueueWrite { writeCharacteristic(link, point, AncsProtocol.getAttributes(uid)) }
    }

    // ---- serialised GATT writes -------------------------------------------------------------------

    private fun enqueueWrite(operation: () -> Boolean) {
        writes.add(operation)
        pumpWrites()
    }

    private fun pumpWrites() {
        while (!writeBusy) {
            val next = writes.poll() ?: return
            writeBusy = try { next() } catch (_: SecurityException) { false } catch (_: IllegalStateException) { false }
        }
    }

    private fun writeDone() {
        writeBusy = false
        pumpWrites()
    }

    private fun writeDescriptor(link: BluetoothGatt, descriptor: BluetoothGattDescriptor, value: ByteArray): Boolean =
        if (Build.VERSION.SDK_INT >= 33) link.writeDescriptor(descriptor, value) == BluetoothStatusCodes.SUCCESS
        else legacyWriteDescriptor(link, descriptor, value)

    @Suppress("DEPRECATION")
    private fun legacyWriteDescriptor(link: BluetoothGatt, descriptor: BluetoothGattDescriptor, value: ByteArray): Boolean {
        descriptor.value = value
        return link.writeDescriptor(descriptor)
    }

    private fun writeCharacteristic(link: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray): Boolean =
        if (Build.VERSION.SDK_INT >= 33)
            link.writeCharacteristic(characteristic, value, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothStatusCodes.SUCCESS
        else legacyWriteCharacteristic(link, characteristic, value)

    @Suppress("DEPRECATION")
    private fun legacyWriteCharacteristic(link: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray): Boolean {
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        characteristic.value = value
        return link.writeCharacteristic(characteristic)
    }

    // ---- system broadcasts ------------------------------------------------------------------------

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                BluetoothAdapter.ACTION_STATE_CHANGED -> {
                    val value = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                    if (value == BluetoothAdapter.STATE_ON && running) bringUp()
                    else if (value == BluetoothAdapter.STATE_OFF || value == BluetoothAdapter.STATE_TURNING_OFF) {
                        advertising = false
                        closeGatt()
                        try { server?.close() } catch (_: SecurityException) { } catch (_: IllegalStateException) { }
                        server = null
                        if (running) setState(State.BLUETOOTH_OFF, "Bluetooth ist ausgeschaltet.")
                    }
                }
                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                    val changed = IntentCompat.getParcelableExtra(intent, BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    val target = device
                    if (changed == null || target == null || changed.address != target.address) return
                    when (intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE)) {
                        BluetoothDevice.BOND_BONDED -> {
                            setState(State.CONNECTING, "Gekoppelt · Dienste werden eingerichtet")
                            val link = gatt
                            if (link == null) return
                            if (controlPoint == null) link.discoverServices() else if (!subscribed) subscribe(link)
                        }
                        BluetoothDevice.BOND_NONE -> if (state == State.BONDING)
                            setState(State.ERROR, "Kopplung abgelehnt oder abgebrochen. Mevicar in den iPhone-Bluetooth-Einstellungen erneut wählen.")
                    }
                }
            }
        }
    }

    private fun registerReceiver() {
        if (receiverRegistered) return
        val filter = IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
            addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
        }
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_EXPORTED)
        receiverRegistered = true
    }

    private fun unregisterReceiver() {
        if (!receiverRegistered) return
        receiverRegistered = false
        try { context.unregisterReceiver(receiver) } catch (_: IllegalArgumentException) { }
    }

    private fun setState(value: State, text: String) {
        state = value
        detail = text
        listener.onStateChanged(value, text)
    }

    private companion object {
        const val GATT_INSUFFICIENT_AUTHENTICATION = 5
        const val GATT_INSUFFICIENT_ENCRYPTION = 15
    }
}
