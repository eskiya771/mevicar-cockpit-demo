package de.mevicar.next;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.location.Location;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.widget.TextView;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.libraries.navigation.NavigationApi;
import com.google.android.libraries.navigation.Navigator;
import com.google.android.libraries.navigation.RoadSnappedLocationProvider;
import com.google.android.libraries.navigation.RouteSegment;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Road Assist ported from MeviCar Classic.
 * Only verified Blitzer.de Home Assistant entities are used; no invented cameras.
 * Progress is measured along the CURRENT Navigation SDK route, including reroutes.
 * GPS fixes with bad accuracy, off-route travel, stale HA data and demo mode
 * suppress warnings rather than claiming a reliable match.
 */
public final class MeviRoadAssistNative {
  private static final double CAMERA_CORRIDOR_METERS=35.0;
  private static final double GPS_CORRIDOR_METERS=100.0;
  private static final double MAX_AHEAD_METERS=5000.0;
  private static final long MAX_HA_AGE_MS=5*60*1000L;
  private static final long MAX_GPS_AGE_MS=15000;
  private static final int MAX_CAMERAS=2000;
  private static final double EARLY_METERS=500.0, FINAL_METERS=35.0;
  private final Activity activity;
  private final TextView notice, health;
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private final Handler main=new Handler(Looper.getMainLooper());
  private final String haOrigin, haToken, configId;
  private boolean radarEnabled, voiceEnabled;
  private boolean scanActive=false;
  private List<Camera> scanned=Collections.emptyList();
  private volatile boolean closed=false;
  private boolean guiding=false;
  private List<LatLng> route=Collections.emptyList();
  private List<Camera> cameras=Collections.emptyList();
  private List<Match> matches=Collections.emptyList();
  private final Set<String> spoken=new HashSet<>();
  private long lastReceived=0L, lastSpeech=0L;
  private String feedStatus="Home Assistant nicht verbunden";
  private Navigator navigator;
  private RoadSnappedLocationProvider roadProvider;
  private TextToSpeech tts;
  private boolean ttsReady=false;
  private final Navigator.RouteChangedListener routeListener=()->{
    // Google invokes this after a new route, rerouting, or an alternative selection.
    if(!closed)updateRoute();
  };
  private final RoadSnappedLocationProvider.LocationListener locationListener=new RoadSnappedLocationProvider.LocationListener(){
    @Override public void onLocationChanged(Location location) {onPosition(location);}
  };
  private final Runnable refreshTask=new Runnable(){
    @Override public void run(){
      if(closed)return;
      refresh();
      main.postDelayed(this,30000);
    }
  };
  private static final class Camera {
    final String id,type,street,city;
    final double lat,lng;
    final int limit;
    Camera(String i,String t,String s,String c,double a,double o,int l){
      id=i;type=t;street=s;city=c;lat=a;lng=o;limit=l;
    }
  }
  private static final class Position {
    final double offset,progress;
    Position(double a,double p){offset=a;progress=p;}
  }
  private static final class Match {
    final Camera camera;
    final double progress;
    Match(Camera c,double p){camera=c;progress=p;}
  }
  public MeviRoadAssistNative(Activity activity,TextView notice,TextView health,String origin,String token,
    String configId,boolean enabled,boolean voice){
    this.activity=activity;this.notice=notice;this.health=health;
    haOrigin=origin==null?"":origin;
    haToken=token==null?"":token;
    this.configId=configId==null?"":configId;
    radarEnabled=enabled;voiceEnabled=voice;
    notice.setVisibility(View.GONE);
    tts=new TextToSpeech(activity,status->{
      ttsReady=status==TextToSpeech.SUCCESS&&!closed;
      if(ttsReady&&tts!=null)tts.setLanguage(Locale.GERMAN);
    });
  }
  private static boolean valid(double lat,double lng){
    return Double.isFinite(lat)&&Double.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
  }
  private static double meters(LatLng a,LatLng b){
    double dy=Math.toRadians(b.latitude-a.latitude),dx=Math.toRadians(b.longitude-a.longitude);
    double t=Math.sin(dy/2)*Math.sin(dy/2)+Math.cos(Math.toRadians(a.latitude))*
      Math.cos(Math.toRadians(b.latitude))*Math.sin(dx/2)*Math.sin(dx/2);
    return 12742000*Math.atan2(Math.sqrt(t),Math.sqrt(Math.max(0,1-t)));
  }
  /** Classic's nearest-on-polyline projection, with distance from route origin. */
  private static Position project(List<LatLng> points,double lat,double lng){
    if(points.size()<2)return null;
    LatLng base=points.get(0);
    double scale=Math.cos(Math.toRadians(base.latitude));
    double px=(lng-base.longitude)*111320.0*scale,py=(lat-base.latitude)*111320.0;
    double passed=0,best=Double.POSITIVE_INFINITY,progress=0;
    for(int i=1;i<points.size();i++){
      LatLng a=points.get(i-1),b=points.get(i);
      double ax=(a.longitude-base.longitude)*111320*scale,ay=(a.latitude-base.latitude)*111320;
      double dx=(b.longitude-a.longitude)*111320*scale,dy=(b.latitude-a.latitude)*111320;
      double len=Math.hypot(dx,dy),len2=dx*dx+dy*dy;
      if(len2<0.01)continue;
      double t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));
      double off=Math.hypot(px-ax-dx*t,py-ay-dy*t);
      if(off<best){best=off;progress=passed+len*t;}
      passed+=len;
    }
    return Double.isFinite(best)?new Position(best,progress):null;
  }
  public void attach(Navigator nav){
    if(closed)return;
    navigator=nav;
    nav.addRouteChangedListener(routeListener);
    roadProvider=NavigationApi.getRoadSnappedLocationProvider(activity.getApplication());
    if(roadProvider!=null)roadProvider.addLocationListener(locationListener);
    updateRoute();
    refreshTask.run();
  }
  public void setGuiding(boolean enabled){
    guiding=enabled;
    if(!enabled)notice.setVisibility(View.GONE);
  }
  private void updateRoute(){
    if(navigator==null||closed)return;
    List<LatLng> newRoute=new ArrayList<>();
    List<RouteSegment> segments=navigator.getRouteSegments();
    if(segments!=null){
      for(RouteSegment segment:segments){
        List<LatLng> points=segment.getLatLngs();
        if(points!=null)newRoute.addAll(points);
      }
    }
    route=newRoute;
    recomputeMatches();
  }
  private void recomputeMatches(){
    if(closed)return;
    List<Match> result=new ArrayList<>();
    Map<String,Match> distinct=new HashMap<>();
    List<Camera> combined=new ArrayList<>(cameras);
    combined.addAll(scanned);
    for(Camera c:combined){
      Position p=project(route,c.lat,c.lng);
      if(p==null||p.offset>CAMERA_CORRIDOR_METERS)continue;
      String place=String.format(Locale.ROOT,"%.5f,%.5f",c.lat,c.lng);
      Match existing=distinct.get(place);
      if(existing==null||(existing.camera.limit==0&&c.limit>0))
        distinct.put(place,new Match(c,p.progress));
    }
    result.addAll(distinct.values());
    result.sort(Comparator.comparingDouble(m->m.progress));
    matches=result;
    updateHealth();
  }
  private static String kind(Camera c){
    String type=c.type.toLowerCase(Locale.ROOT);
    if(type.contains("mobile"))return "Mobiler Blitzer";
    if(type.contains("trailer"))return "Anhängerblitzer";
    if(type.contains("red")||type.contains("light"))return "Ampelkontrolle";
    if(type.contains("fixed")||type.contains("station"))return "Fester Blitzer";
    return "Blitzerkontrolle";
  }
  private void updateHealth(){
    if(closed)return;
    String status=feedStatus;
    if(!radarEnabled)status="Warnungen ausgeschaltet";
    else if(scanActive)status="Routenscan läuft … "+feedStatus;
    if(!route.isEmpty()&&lastReceived>0)
      status+=" · "+matches.size()+" auf Route";
    health.setText("ROAD ASSIST · "+status);
  }
  private void showWarning(Camera camera,double ahead){
    String distance=ahead<1000?Math.round(ahead/10)*10+" m":String.format(Locale.GERMANY,"%.1f km",ahead/1000);
    String speed=camera.limit>0?" · "+camera.limit+" km/h":"";
    String street=(camera.street+" · "+camera.city).replaceAll("^[ ·]+|[ ·]+$","");
    notice.setText("⚠ "+kind(camera)+"  "+distance+speed+(street.isEmpty()?"":"\n"+street));
    GradientDrawable bg=new GradientDrawable();
    bg.setColor(ahead<=FINAL_METERS?0xF0A72624:0xEA1B354A);
    bg.setCornerRadius(18);
    bg.setStroke(2,ahead<=FINAL_METERS?Color.WHITE:0xFF40DDE8);
    notice.setBackground(bg);
    notice.setVisibility(View.VISIBLE);
  }
  private void speak(Camera camera,String stage,double ahead){
    if(!voiceEnabled)return;
    String id=camera.id+"|"+stage;
    if(!spoken.add(id))return;
    if(System.currentTimeMillis()-lastSpeech<1400||!ttsReady||tts==null)return;
    lastSpeech=System.currentTimeMillis();
    String amount=camera.limit>0?", erlaubt "+camera.limit+" km/h":"";
    String speech=stage.equals("final")?"Achtung! "+kind(camera)+" jetzt"+amount:
      "Achtung, "+kind(camera)+" in "+Math.max(10,Math.round(ahead/10)*10)+" Metern"+amount;
    tts.speak(speech,TextToSpeech.QUEUE_ADD,null,"road_assist_"+id);
  }
  private void onPosition(Location fix){
    if(closed||!guiding||!radarEnabled||route.size()<2||lastReceived<=0||
       System.currentTimeMillis()-lastReceived>MAX_HA_AGE_MS){
      notice.setVisibility(View.GONE);return;
    }
    if(fix==null||!fix.hasAccuracy()||fix.getAccuracy()>50||fix.getAccuracy()<0||
       Math.abs(System.currentTimeMillis()-fix.getTime())>MAX_GPS_AGE_MS){
      notice.setVisibility(View.GONE);return;
    }
    Position car=project(route,fix.getLatitude(),fix.getLongitude());
    if(car==null||car.offset>GPS_CORRIDOR_METERS){notice.setVisibility(View.GONE);return;}
    Match next=null;
    for(Match m:matches){
      double delta=m.progress-car.progress;
      if(delta>=-15&&delta<=MAX_AHEAD_METERS){next=m;break;}
    }
    if(next==null){notice.setVisibility(View.GONE);return;}
    double ahead=Math.max(0,next.progress-car.progress);
    showWarning(next.camera,ahead);
    if(ahead<=FINAL_METERS)speak(next.camera,"final",ahead);
    else if(ahead<=EARLY_METERS)speak(next.camera,"early",ahead);
  }
  public void refresh(){
    if(closed||haOrigin.isEmpty()||haToken.isEmpty()){
      feedStatus="Home Assistant nicht verbunden";
      updateHealth();return;
    }
    worker.execute(()->{
      try{
        JSONArray states=getStates();
        List<Camera> fresh=new ArrayList<>();
        for(int i=0;i<states.length()&&fresh.size()<MAX_CAMERAS;i++){
          JSONObject row=states.optJSONObject(i);
          JSONObject attr=row==null?null:row.optJSONObject("attributes");
          if(attr==null||!attr.optString("source","").toLowerCase(Locale.ROOT).startsWith("blitzer_"))continue;
          if(!attr.has("latitude")||!attr.has("longitude"))continue;
          double lat=attr.optDouble("latitude",Double.NaN),lng=attr.optDouble("longitude",Double.NaN);
          if(!valid(lat,lng))continue;
          String id=row.optString("entity_id","");
          if(id.isEmpty())continue;
          int speed=attr.optInt("vmax",0);if(speed<0||speed>350)speed=0;
          fresh.add(new Camera(id,attr.optString("type","unknown"),attr.optString("street",""),
            attr.optString("city",""),lat,lng,speed));
        }
        main.post(()->{
          if(closed)return;
          cameras=fresh;lastReceived=System.currentTimeMillis();
          feedStatus="HA verbunden · "+fresh.size()+" Meldungen";
          recomputeMatches();
        });
      }catch(Exception exception){
        main.post(()->{
          if(closed)return;
          feedStatus="HA nicht erreichbar";
          if(System.currentTimeMillis()-lastReceived>MAX_HA_AGE_MS){
            cameras=Collections.emptyList();matches=Collections.emptyList();
          }
          updateHealth();
        });
      }
    });
  }
  private JSONArray getStates() throws Exception {
    URL url=new URL(haOrigin+"/api/states");
    HttpURLConnection conn=(HttpURLConnection)url.openConnection();
    conn.setRequestMethod("GET");conn.setConnectTimeout(8000);conn.setReadTimeout(10000);
    conn.setInstanceFollowRedirects(false);
    conn.setRequestProperty("Authorization","Bearer "+haToken);
    conn.setRequestProperty("Accept","application/json");
    try {
      if(conn.getResponseCode()!=200)throw new IllegalStateException("HA HTTP error");
      try(InputStream input=conn.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
        byte[] buf=new byte[8192];int n;
        while((n=input.read(buf))!=-1){
          if(output.size()+n>6_000_000)throw new IllegalStateException("HA response too large");
          output.write(buf,0,n);
        }
        return new JSONArray(output.toString("UTF-8"));
      }
    } finally {conn.disconnect();}
  }
  /** Voice is independent from Google's spoken turn-by-turn directions. */
  public boolean toggleVoice(){
    voiceEnabled=!voiceEnabled;
    if(!voiceEnabled&&tts!=null)tts.stop();
    return voiceEnabled;
  }
  public boolean voiceEnabled(){return voiceEnabled;}
  public boolean hasScanConfig(){return configId.matches("[0-9A-HJKMNP-TV-Z]{26}");}
  public void stop(){
    if(closed)return;
    closed=true;guiding=false;
    main.removeCallbacks(refreshTask);
    if(roadProvider!=null){roadProvider.removeLocationListener(locationListener);roadProvider=null;}
    if(navigator!=null){navigator.removeRouteChangedListener(routeListener);navigator=null;}
    worker.shutdownNow();
    if(tts!=null){tts.stop();tts.shutdown();tts=null;}
    notice.setVisibility(View.GONE);
  }
}
