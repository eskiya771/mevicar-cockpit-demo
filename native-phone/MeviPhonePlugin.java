package de.mevicar.next;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** Native iPhone phone bridge: exact ANCS BLE protocol/transport from MeviCar Classic.
 * The iPhone retains the voice audio. ANCS exposes only incoming and missed
 * call notifications; no contacts database, complete call log or outbound dialer.
 * Calls and missed names live in memory, and permissions are requested only
 * when the user deliberately starts iPhone pairing.
 */
@CapacitorPlugin(name="MeviPhone",permissions={
  @Permission(alias="bluetooth",strings={Manifest.permission.BLUETOOTH_CONNECT,Manifest.permission.BLUETOOTH_ADVERTISE})
})
public class MeviPhonePlugin extends Plugin {
  // In-process observer for the separate full-screen Google Navigation Activity.
  interface CallObserver {void onCallChanged(AncsLink.Call call);}
  private static final List<CallObserver> nativeCallObservers=new ArrayList<>();
  private static AncsLink.Call nativeActiveCall;
  private static MeviPhonePlugin activePlugin;
  static void addCallObserver(CallObserver observer){
    synchronized(nativeCallObservers){nativeCallObservers.add(observer);}
    observer.onCallChanged(nativeActiveCall);
  }
  static void removeCallObserver(CallObserver observer){
    synchronized(nativeCallObservers){nativeCallObservers.remove(observer);}
  }
  private static void publishNativeCall(AncsLink.Call call){
    nativeActiveCall=call;
    List<CallObserver> listeners;
    synchronized(nativeCallObservers){listeners=new ArrayList<>(nativeCallObservers);}
    for(CallObserver observer:listeners)observer.onCallChanged(call);
  }
  static boolean respondNativeCall(boolean accept){
    MeviPhonePlugin plugin=activePlugin;
    AncsLink.Call call=nativeActiveCall;
    if(plugin==null||plugin.link==null||call==null)return false;
    if(accept)return call.getCanAnswer()&&plugin.link.answer(call.getUid());
    return call.getCanDecline()&&plugin.link.decline(call.getUid());
  }
  private AncsLink link;
  private AncsLink.Call incoming;
  private final ArrayDeque<AncsLink.Call> missed=new ArrayDeque<>();
  private boolean destroyed=false;
  private static final int MAX_RECENT=12;

  @Override public void load(){
    super.load();
    activePlugin=this;
    link=new AncsLink(getContext(),new AncsLink.Listener(){
      @Override public void onStateChanged(AncsLink.State state,String detail){
        if(destroyed)return;
        notifyListeners("phoneState",snapshot(),true);
      }
      @Override public void onIncomingCall(AncsLink.Call call){
        if(destroyed)return;
        incoming=call;
        publishNativeCall(call);
        notifyListeners("incomingCall",callData(call),true);
        notifyListeners("phoneState",snapshot(),true);
      }
      @Override public void onCallEnded(long uid){
        if(destroyed)return;
        if(incoming!=null&&incoming.getUid()==uid){incoming=null;publishNativeCall(null);}
        JSObject event=new JSObject();event.put("uid",uid);
        notifyListeners("callEnded",event,true);
        notifyListeners("phoneState",snapshot(),true);
      }
      @Override public void onMissedCall(AncsLink.Call call){
        if(destroyed)return;
        if(incoming!=null&&incoming.getUid()==call.getUid()){incoming=null;publishNativeCall(null);}
        missed.addFirst(call);
        while(missed.size()>MAX_RECENT)missed.removeLast();
        notifyListeners("missedCall",callData(call),true);
        notifyListeners("phoneState",snapshot(),true);
      }
    });
  }

  private JSObject callData(AncsLink.Call call){
    JSObject obj=new JSObject();
    obj.put("uid",call.getUid());
    obj.put("name",call.getName());
    obj.put("detail",call.getDetail());
    obj.put("canAnswer",call.getCanAnswer());
    obj.put("canDecline",call.getCanDecline());
    obj.put("time",call.getTime());
    return obj;
  }
  private JSObject snapshot(){
    JSObject data=new JSObject();
    if(link==null){
      data.put("state","OFF");
      data.put("detail","Nicht initialisiert");
      return data;
    }
    data.put("state",link.getState().name());
    data.put("detail",link.getDetail());
    data.put("adapterName",link.getAdapterName()==null?"":link.getAdapterName());
    data.put("supported",link.getSupported());
    data.put("bluetoothEnabled",link.getBluetoothEnabled());
    data.put("permissionGranted",link.hasPermissions());
    data.put("active",link.getActive());
    data.put("connected",link.getConnected());
    data.put("incoming",incoming==null?JSObject.NULL:callData(incoming));
    JSArray history=new JSArray();
    for(AncsLink.Call call:missed)history.put(callData(call));
    data.put("missed",history);
    return data;
  }

  @PluginMethod public void getStatus(PluginCall call){call.resolve(snapshot());}

  @PluginMethod public void start(PluginCall call){
    if(link==null){call.reject("ANCS-Verbindung nicht initialisiert.");return;}
    if(!link.getSupported()){call.reject("Bluetooth LE wird auf diesem Gerät nicht unterstützt.");return;}
    if(Build.VERSION.SDK_INT>=31&&!link.hasPermissions()){
      requestPermissionForAlias("bluetooth",call,"bluetoothPermissionResult");
      return;
    }
    link.start();
    call.resolve(snapshot());
  }

  @PermissionCallback private void bluetoothPermissionResult(PluginCall call){
    if(link!=null&&link.hasPermissions()){
      link.start();
      call.resolve(snapshot());
    }else call.reject("Bluetooth-Berechtigung wurde nicht erteilt.");
  }

  @PluginMethod public void stop(PluginCall call){
    if(link!=null)link.stop();
    incoming=null;
    publishNativeCall(null);
    call.resolve(snapshot());
  }
  @PluginMethod public void answer(PluginCall call){
    if(link==null||incoming==null||!incoming.getCanAnswer()){
      call.reject("Kein annehmbarer iPhone-Anruf vorhanden.");return;
    }
    if(!link.answer(incoming.getUid())){call.reject("iPhone ist nicht über ANCS verbunden.");return;}
    call.resolve();
  }
  @PluginMethod public void decline(PluginCall call){
    if(link==null||incoming==null||!incoming.getCanDecline()){
      call.reject("Kein ablehnbarer iPhone-Anruf vorhanden.");return;
    }
    if(!link.decline(incoming.getUid())){call.reject("iPhone ist nicht über ANCS verbunden.");return;}
    call.resolve();
  }
  @Override protected void handleOnDestroy(){
    destroyed=true;
    if(link!=null){link.stop();link=null;}
    incoming=null;missed.clear();
    publishNativeCall(null);
    if(activePlugin==this)activePlugin=null;
    super.handleOnDestroy();
  }
}
