package de.mevicar.next;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.Manifest;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name="MeviNativeNavigation")
public class MeviNativeNavigationPlugin extends Plugin {
  @PluginMethod
  public void start(PluginCall call) {
    Double lat=call.getDouble("lat"), lng=call.getDouble("lng");
    if(lat==null || lng==null || !Double.isFinite(lat) || !Double.isFinite(lng) ||
       Math.abs(lat)>90 || Math.abs(lng)>180){call.reject("Ungültiges Navigationsziel");return;}
    Intent intent=new Intent(getContext(),MeviNavigationActivity.class);
    intent.putExtra("lat",lat); intent.putExtra("lng",lng);
    intent.putExtra("title",call.getString("title","Ziel"));
    getActivity().runOnUiThread(()->{
      try { getActivity().startActivity(intent);call.resolve(); }
      catch(Exception e){call.reject("Native Navigation konnte nicht geöffnet werden: "+e.getMessage());}
    });
  }
}