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
  // One-time in-process handoff; HA credentials never enter Intent extras, files or GitHub.
  private static String radarOrigin="",radarToken="";
  static synchronized String[] takeRadarSession(){
    String[] session={radarOrigin,radarToken};
    radarOrigin="";radarToken="";
    return session;
  }
  private static synchronized void setRadarSession(String origin,String token){
    radarOrigin="";radarToken="";
    if(origin==null||token==null||token.isEmpty())return;
    try{
      java.net.URI uri=new java.net.URI(origin);
      String path=uri.getRawPath();
      if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||
         uri.getRawUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||
         (path!=null&&!path.isEmpty()&&!"/".equals(path)))return;
      radarOrigin=uri.getScheme()+"://"+uri.getRawAuthority();
      radarToken=token;
    }catch(Exception ignored){/* Never share credentials with malformed hosts. */}
  }
  @PluginMethod
  public void start(PluginCall call) {
    Double lat=call.getDouble("lat"), lng=call.getDouble("lng");
    if(lat==null || lng==null || !Double.isFinite(lat) || !Double.isFinite(lng) ||
       Math.abs(lat)>90 || Math.abs(lng)>180){call.reject("Ungültiges Navigationsziel");return;}
    setRadarSession(call.getString("haOrigin",""),call.getString("haToken",""));
    Intent intent=new Intent(getContext(),MeviNavigationActivity.class);
    intent.putExtra("lat",lat); intent.putExtra("lng",lng);
    intent.putExtra("title",call.getString("title","Ziel"));
    getActivity().runOnUiThread(()->{
      try { getActivity().startActivity(intent);call.resolve(); }
      catch(Exception e){call.reject("Native Navigation konnte nicht geöffnet werden: "+e.getMessage());}
    });
  }
}