/* MeviCar Next platform boundary, v1.
   No Android bridge is assumed and no native permissions are requested.
   Feature modules can migrate incrementally while the PWA continues unchanged. */
(function(root){
  'use strict';
  const nav=typeof navigator==='object'?navigator:{};
  const native=()=>!!(root.Capacitor&&typeof root.Capacitor.isNativePlatform==='function'&&root.Capacitor.isNativePlatform());
  const platform=()=>native()?'android':/iPad|iPhone|iPod/.test(nav.userAgent||'')?'ios-web':'web';
  const unsupported=feature=>Object.freeze({available:false,feature,reason:'not-implemented-on-'+platform()});
  const capabilities=()=>Object.freeze({
    platform:platform(),
    native:native(),
    geolocation:!!nav.geolocation,
    orientation:typeof root.DeviceOrientationEvent!=='undefined',
    localFiles:typeof root.showOpenFilePicker==='function'||typeof root.FileReader!=='undefined',
    nativeBluetooth:false,
    nativePhone:false,
    nativeAudio:false,
    nativeNavigation:false
  });
  const api=Object.freeze({
    version:1,platform,capabilities,
    geolocation:Object.freeze({
      watch:(success,error,options)=>nav.geolocation?
        nav.geolocation.watchPosition(success,error,options):unsupported('geolocation'),
      clear:id=>{if(nav.geolocation&&typeof id==='number')nav.geolocation.clearWatch(id);}
    }),
    bluetooth:Object.freeze({connect:async()=>unsupported('bluetooth')}),
    phone:Object.freeze({dial:async()=>unsupported('phone')}),
    audio:Object.freeze({nativePlayer:async()=>unsupported('native-audio')}),
    navigation:Object.freeze({nativeRoute:async()=>unsupported('native-navigation')})
  });
  root.MeviPlatform=api;
})(window);
