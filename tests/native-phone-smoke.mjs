import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const protocol=read('native-phone/AncsProtocol.kt');
const transport=read('native-phone/AncsLink.kt');
const bridge=read('native-phone/MeviPhonePlugin.java');
const installer=read('scripts/install-native-phone.py');
const packager=read('scripts/prepare-android-assets.py');
const cockpit=read('index.html');
const phone=read('meviphone.js');
const platform=read('meviplatform.js');
for(const fragment of ['NOTIFICATION_SOURCE','DATA_SOURCE','CONTROL_POINT','performAction',
  'getAttributes','parseEvent','AttributeAssembler','CATEGORY_INCOMING_CALL','CATEGORY_MISSED_CALL']){
 assert.ok(protocol.includes(fragment),'Classic ANCS protocol missing '+fragment);
}
for(const fragment of ['addServiceSolicitationUuid','openGattServer','connectGatt','createBond',
 'NotificationSource','onCharacteristicChanged','onDescriptorWrite','requestNextAttributes',
 'BluetoothGattCharacteristic','BluetoothGattDescriptor','onIncomingCall','onMissedCall',
 'BLUETOOTH_CONNECT','BLUETOOTH_ADVERTISE','onCallEnded']){
 assert.ok(transport.includes(fragment)||transport.includes(fragment.replace('NotificationSource','notificationSource')),
   'Classic Bluetooth link missing '+fragment);
}
for(const fragment of ['@CapacitorPlugin(name="MeviPhone"','@PermissionCallback','bluetoothPermissionResult',
 'requestPermissionForAlias','@PluginMethod public void start','@PluginMethod public void stop',
 '@PluginMethod public void answer','@PluginMethod public void decline','notifyListeners("incomingCall"',
 'notifyListeners("missedCall"','notifyListeners("callEnded"','handleOnDestroy']){
 assert.ok(bridge.includes(fragment),'Native phone bridge missing '+fragment);
}
assert.match(installer,/registerPlugin\(MeviPhonePlugin\.class\)/);
assert.match(installer,/kotlin-gradle-plugin:2\.3\.0/);
assert.match(installer,/AncsLink\.kt/);
assert.match(installer,/BLUETOOTH_ADVERTISE/);
assert.match(packager,/meviphone\.js/);
assert.match(packager,/meviphone\.css/);
assert.match(cockpit,/MeviPhone\.html/);
assert.match(platform,/nativePhone:native\(\)/);
assert.match(phone,/MeviPhone.*available/s);
assert.match(phone,/incomingCall/);
assert.match(phone,/missedCall/);
assert.match(phone,/Annehmen/);
assert.match(phone,/Ablehnen/);
assert.doesNotMatch(phone,/localStorage|sessionStorage|Demo-Anrufer|Testanruf simulieren/);
new Function(phone);
console.log('Native Classic ANCS phone, Bluetooth permissions, incoming/missed calls and Android UI source wiring passed');
