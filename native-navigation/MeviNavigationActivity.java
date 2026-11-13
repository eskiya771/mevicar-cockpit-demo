package de.mevicar.next;
import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.*;
import android.view.View;
import android.widget.FrameLayout;
import com.google.android.libraries.navigation.*;

public class MeviNavigationActivity extends Activity {
  private static String activeKey;
  private Navigator navigator;
  private NavigationView navigationView;
  private TextView status;
  private LinearLayout phoneBanner;
  private TextView phoneCaller;
  private Button phoneAccept,phoneDecline;
  private final MeviPhonePlugin.CallObserver phoneObserver=call->runOnUiThread(()->{
    if(phoneBanner==null||isFinishing()||isDestroyed())return;
    if(call==null){phoneBanner.setVisibility(View.GONE);return;}
    phoneCaller.setText("☎ IPHONE · "+call.getName()+
      (call.getDetail().isEmpty()?"":"\n"+call.getDetail()));
    phoneAccept.setVisibility(call.getCanAnswer()?View.VISIBLE:View.GONE);
    phoneDecline.setVisibility(call.getCanDecline()?View.VISIBLE:View.GONE);
    phoneBanner.setVisibility(View.VISIBLE);
  });
  private MeviRoadAssistNative roadAssist;
  private boolean guiding=false, started=false, resumed=false;
  private double lat,lng;
  private String title;
  private boolean connecting=false;
  private final Navigator.ArrivalListener arrivalListener=(event)->{
    guiding=false;
    if(roadAssist!=null)roadAssist.setGuiding(false);
    if(navigator!=null)navigator.stopGuidance();
    showStatus("Ziel erreicht: "+title);
  };
  private void showStatus(String s){runOnUiThread(()->{if(status!=null)status.setText(s);});}
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    lat=getIntent().getDoubleExtra("lat",Double.NaN);
    lng=getIntent().getDoubleExtra("lng",Double.NaN);
    title=getIntent().getStringExtra("title");
    if(title==null)title="Ziel";
    if(!Double.isFinite(lat)||!Double.isFinite(lng)){finish();return;}
    FrameLayout root=new FrameLayout(this);
    root.setBackgroundColor(Color.rgb(8,17,27));
    navigationView=new NavigationView(this);
    root.addView(navigationView,new FrameLayout.LayoutParams(-1,-1));
    navigationView.onCreate(state);
    navigationView.setSpeedometerEnabled(true);
    navigationView.setRecenterButtonEnabled(true);
    LinearLayout controls=new LinearLayout(this);
    controls.setOrientation(LinearLayout.HORIZONTAL);
    controls.setGravity(Gravity.CENTER_VERTICAL);
    controls.setPadding(8,6,8,6);
    controls.setBackgroundColor(0xDD102A3B);
    status=new TextView(this);status.setTextColor(Color.WHITE);status.setTextSize(13);
    status.setText("Navigation wird vorbereitet");status.setMaxLines(2);
    controls.addView(status,new LinearLayout.LayoutParams(0,-2,1));
    Button overview=new Button(this);overview.setText("Übersicht");
    overview.setOnClickListener(v->navigationView.showRouteOverview());
    controls.addView(overview);
    Button voice=new Button(this);voice.setText("Blitzer Ton");
    voice.setOnClickListener(v->{
      if(roadAssist!=null){
        boolean on=roadAssist.toggleVoice();
        voice.setText(on?"Radar Ton AN":"Radar Ton AUS");
      }
    });
    controls.addView(voice);
    Button scan=new Button(this);scan.setText("Routenscan");
    scan.setOnClickListener(v->new AlertDialog.Builder(this)
      .setTitle("Blitzer-Routenscan")
      .setMessage("Der Scan setzt den Home-Assistant-Tracker mevicar_route_scan nacheinander auf maximal 12 Routenpunkte und ruft blitzer.refresh_controls auf. Nur mit gültiger Blitzer.de-Konfigurations-ID starten.")
      .setNegativeButton("Abbrechen",null)
      .setPositiveButton("Scan starten",(dialog,which)->{if(roadAssist!=null)roadAssist.scanOnDemand();})
      .show());
    controls.addView(scan);
    Button end=new Button(this);end.setText("Beenden");
    end.setOnClickListener(v->finish());
    controls.addView(end);
    FrameLayout.LayoutParams cp=new FrameLayout.LayoutParams(-1,-2,Gravity.TOP);
    root.addView(controls,cp);
    phoneBanner=new LinearLayout(this);
    phoneBanner.setOrientation(LinearLayout.VERTICAL);
    phoneBanner.setBackgroundColor(0xEE0D4B59);
    phoneBanner.setPadding(16,12,16,12);
    phoneBanner.setElevation(20);
    phoneCaller=new TextView(this);
    phoneCaller.setTextColor(Color.WHITE);
    phoneCaller.setTextSize(17);
    phoneCaller.setMaxLines(2);
    phoneBanner.addView(phoneCaller,new LinearLayout.LayoutParams(-1,-2));
    LinearLayout phoneActions=new LinearLayout(this);
    phoneActions.setOrientation(LinearLayout.HORIZONTAL);
    phoneAccept=new Button(this);phoneAccept.setText("Annehmen");
    phoneAccept.setOnClickListener(v->{
      if(!MeviPhonePlugin.respondNativeCall(true))showStatus("iPhone-Anruf nicht mehr verfügbar");
    });
    phoneActions.addView(phoneAccept);
    phoneDecline=new Button(this);phoneDecline.setText("Ablehnen");
    phoneDecline.setOnClickListener(v->{
      if(!MeviPhonePlugin.respondNativeCall(false))showStatus("iPhone-Anruf nicht mehr verfügbar");
    });
    phoneActions.addView(phoneDecline);
    phoneBanner.addView(phoneActions);
    FrameLayout.LayoutParams phoneLayout=new FrameLayout.LayoutParams(-2,-2,Gravity.TOP|Gravity.RIGHT);
    phoneLayout.setMargins(12,84,18,0);
    root.addView(phoneBanner,phoneLayout);
    phoneBanner.setVisibility(View.GONE);
    TextView radarAlert=new TextView(this);
    radarAlert.setTextColor(Color.WHITE);radarAlert.setTextSize(17);
    radarAlert.setPadding(20,14,20,14);radarAlert.setMaxLines(3);
    radarAlert.setElevation(12);
    FrameLayout.LayoutParams alertLayout=new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.RIGHT);
    alertLayout.setMargins(16,16,22,44);
    root.addView(radarAlert,alertLayout);
    TextView radarHealth=new TextView(this);
    radarHealth.setTextColor(0xFFB7DAE3);radarHealth.setTextSize(11);
    radarHealth.setPadding(10,6,10,6);
    radarHealth.setBackgroundColor(0xCC102A3B);
    FrameLayout.LayoutParams healthLayout=new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.LEFT);
    healthLayout.setMargins(12,12,10,12);
    root.addView(radarHealth,healthLayout);
    String[] ha=MeviNativeNavigationPlugin.takeRadarSession();
    roadAssist=new MeviRoadAssistNative(this,radarAlert,radarHealth,ha[0],ha[1],
      ha[2],!"false".equals(ha[3]),!"false".equals(ha[4]));
    voice.setText(roadAssist.voiceEnabled()?"Radar Ton AN":"Radar Ton AUS");
    setContentView(root);
    MeviPhonePlugin.addCallObserver(phoneObserver);
    if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},81);
    } else prepareKey();
  }
  @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results) {
    super.onRequestPermissionsResult(request,permissions,results);
    if(request==81) {
      if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED)prepareKey();
      else showStatus("Genauen Standort in Android erlauben");
    }
  }
  private void prepareKey() {
    String saved=MeviSecureSettingsPlugin.readStored(this,"mapsKey");
    if(saved==null||saved.isEmpty()){
      showStatus("Google Navigation API-Key fehlt. Bitte unter Settings → Zugänge & Schlüssel in MeviCar Next eintragen.");
      return;
    }
    connect(saved);
  }
  private void connect(String key) {
    if(connecting)return;
    if(activeKey!=null&&!activeKey.equals(key)){
      showStatus("Anderer SDK-Schlüssel: App vollständig neu starten");
      return;
    }
    if(activeKey==null){NavigationApi.setApiKey(key);activeKey=key;}
    connecting=true;showStatus("Google Navigation verbindet …");
    NavigationApi.getNavigator(this,new NavigationApi.NavigatorListener(){
      @Override public void onNavigatorReady(Navigator value){
        runOnUiThread(()->{
          if(isFinishing()||isDestroyed()){value.cleanup();return;}
          connecting=false;navigator=value;
          value.setTaskRemovedBehavior(Navigator.TaskRemovedBehavior.QUIT_SERVICE);
          value.addArrivalListener(arrivalListener);
          if(roadAssist!=null)roadAssist.attach(value);
          calculate();
        });
      }
      @Override public void onError(int errorCode){
        connecting=false;
        showStatus("Navigation SDK Fehler "+errorCode+" – API-Key, Abrechnung und Freigaben prüfen");
      }
    });
  }
  private void calculate(){
    Navigator nav=navigator;if(nav==null)return;
    showStatus("Route wird berechnet: "+title);
    Waypoint point=Waypoint.builder().setLatLng(lat,lng).setTitle(title).build();
    nav.setDestination(point,new RoutingOptions().travelMode(RoutingOptions.TravelMode.DRIVING))
      .setOnResultListener(result->runOnUiThread(()->{
        if(isFinishing()||navigator==null)return;
        if(result==Navigator.RouteStatus.OK){
          nav.setAudioGuidanceSettings(AudioGuidanceSettings.builder()
            .setGuidanceMode(AudioGuidanceSettings.GuidanceMode.VOICE_ALERTS_AND_GUIDANCE)
            .setBluetoothAudioEnabled(true).build());
          nav.startGuidance();guiding=true;
          if(roadAssist!=null)roadAssist.setGuiding(true);
          showStatus("Zielführung: "+title);
        } else showStatus("Keine Route: "+result);
      }));
  }
  @Override protected void onStart(){super.onStart();started=true;if(navigationView!=null)navigationView.onStart();}
  @Override protected void onResume(){super.onResume();resumed=true;if(navigationView!=null)navigationView.onResume();}
  @Override protected void onPause(){resumed=false;if(navigationView!=null)navigationView.onPause();super.onPause();}
  @Override protected void onStop(){started=false;if(navigationView!=null)navigationView.onStop();super.onStop();}
  @Override protected void onDestroy(){
    MeviPhonePlugin.removeCallObserver(phoneObserver);
    if(roadAssist!=null){roadAssist.stop();roadAssist=null;}
    if(navigator!=null){navigator.removeArrivalListener(arrivalListener);navigator.stopGuidance();navigator.clearDestinations();navigator.cleanup();navigator=null;}
    if(navigationView!=null){navigationView.onDestroy();navigationView=null;}
    super.onDestroy();
  }
  @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(navigationView!=null)navigationView.onTrimMemory(level);}
  @Override protected void onSaveInstanceState(Bundle out){if(navigationView!=null)navigationView.onSaveInstanceState(out);super.onSaveInstanceState(out);}
}