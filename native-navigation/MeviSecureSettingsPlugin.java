package de.mevicar.next;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Native credential input is only exposed in Settings. Secrets are never returned to JavaScript. */
@CapacitorPlugin(name="MeviSecureSettings")
public final class MeviSecureSettingsPlugin extends Plugin {
  private static final String STORE="mevicar_next_secure_settings_v1";
  private static final String ALIAS="mevicar_next_native_credential_key_v1";

  private static boolean allowed(String name) {
    return "mapsKey".equals(name)||"haToken".equals(name);
  }
  private static SecretKey key() throws Exception {
    KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
    java.security.Key k=ks.getKey(ALIAS,null);
    if(k instanceof SecretKey)return (SecretKey)k;
    KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(ALIAS,
      KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256).build());
    return generator.generateKey();
  }
  private static boolean valid(String name,String value){
    if(value==null||value.length()>8192||!allowed(name))return false;
    if("mapsKey".equals(name))return value.matches("[A-Za-z0-9_-]{20,256}");
    return value.length()>=20&&!value.matches(".*\\s+.*");
  }
  private static void writeStored(Context context,String name,String secret) throws Exception {
    if(!valid(name,secret))throw new IllegalArgumentException("Ungueltige Zugangsdaten");
    Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE,key());
    byte[] iv=cipher.getIV(),encrypted=cipher.doFinal(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    byte[] blob=new byte[iv.length+encrypted.length];
    System.arraycopy(iv,0,blob,0,iv.length);
    System.arraycopy(encrypted,0,blob,iv.length,encrypted.length);
    context.getSharedPreferences(STORE,Context.MODE_PRIVATE).edit()
      .putString(name,Base64.encodeToString(blob,Base64.NO_WRAP)).apply();
  }
  static String readStored(Context context,String name) {
    if(!allowed(name))return null;
    try{
      String saved=context.getSharedPreferences(STORE,Context.MODE_PRIVATE).getString(name,null);
      if(saved==null)return null;
      byte[] blob=Base64.decode(saved,Base64.NO_WRAP);
      if(blob.length<=28)return null;
      byte[] iv=java.util.Arrays.copyOfRange(blob,0,12);
      byte[] payload=java.util.Arrays.copyOfRange(blob,12,blob.length);
      Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));
      return new String(cipher.doFinal(payload),java.nio.charset.StandardCharsets.UTF_8);
    }catch(Exception e){return null;}
  }
  @PluginMethod public void set(PluginCall call) {
    String name=call.getString("name",""),value=call.getString("value","");
    if(!valid(name,value)){call.reject("Ungueltige Zugangsdaten");return;}
    try{writeStored(getContext(),name,value);call.resolve();}
    catch(Exception e){call.reject("Speichern im Android Keystore fehlgeschlagen");}
  }
  @PluginMethod public void remove(PluginCall call){
    String name=call.getString("name","");
    if(!allowed(name)){call.reject("Unbekannte Einstellung");return;}
    getContext().getSharedPreferences(STORE,Context.MODE_PRIVATE).edit().remove(name).apply();
    call.resolve();
  }
  @PluginMethod public void status(PluginCall call){
    JSObject configured=new JSObject();
    configured.put("mapsKey",readStored(getContext(),"mapsKey")!=null);
    configured.put("haToken",readStored(getContext(),"haToken")!=null);
    JSObject reply=new JSObject();
    reply.put("configured",configured);reply.put("ok",true);
    call.resolve(reply);
  }
}
