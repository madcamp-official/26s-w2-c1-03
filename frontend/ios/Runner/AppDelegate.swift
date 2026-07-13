import Flutter
import UIKit
import GoogleMaps

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Google Maps 키 주입. Android는 build.gradle.kts가 frontend/.env에서 읽지만,
    // iOS SDK는 .env를 직접 못 읽어 Info.plist의 MAPS_API_KEY를 읽어 넘긴다
    // (frontend/.env.example 참고). 키가 비어 있으면 지도만 안 뜨고 앱은 정상 동작.
    if let mapsKey = Bundle.main.object(forInfoDictionaryKey: "MAPS_API_KEY") as? String,
       !mapsKey.isEmpty {
      GMSServices.provideAPIKey(mapsKey)
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
