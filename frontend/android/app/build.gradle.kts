import java.util.Properties

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    // END: FlutterFire Configuration
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// 카카오 네이티브 앱 키는 비밀값은 아니지만(클라이언트에 원래 내장되는 값) 소스에
// 직접 박아두지 않고 android/local.properties(.gitignore 대상)에서 읽는다.
// local.properties에 `kakaoNativeAppKey=발급받은키` 한 줄을 추가해서 쓴다.
val localProperties = Properties().apply {
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.exists()) {
        localPropertiesFile.inputStream().use { load(it) }
    }
}
val kakaoNativeAppKey: String = localProperties.getProperty("kakaoNativeAppKey", "")
// Google Maps SDK 키. 안드로이드 전용인 local.properties가 아니라, 모든 플랫폼이
// 공유하는 frontend/.env(.gitignore 대상, .env.example 참고)의 MAPS_API_KEY에서
// 읽는다 — iOS(Info.plist)/Web(index.html)도 같은 값을 쓴다. .env가 없거나 키가
// 비어 있으면 예전 방식(local.properties의 mapsApiKey)으로 폴백한다. 비어 있어도
// 지도만 회색으로 뜨고 앱 자체는 정상 동작한다.
val dotenv = Properties().apply {
    val dotenvFile = rootProject.file("../.env")
    if (dotenvFile.exists()) {
        dotenvFile.inputStream().use { load(it) }
    }
}
val mapsApiKey: String = dotenv.getProperty("MAPS_API_KEY")?.takeIf { it.isNotBlank() }
    ?: localProperties.getProperty("mapsApiKey", "")

android {
    namespace = "com.tripandend.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.tripandend.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // AndroidManifest.xml의 ${kakaoNativeAppKey} 자리에 채워진다(카카오 로그인 리다이렉트 스킴).
        manifestPlaceholders["kakaoNativeAppKey"] = kakaoNativeAppKey
        // AndroidManifest.xml의 com.google.android.geo.API_KEY(${mapsApiKey})에 채워진다.
        manifestPlaceholders["mapsApiKey"] = mapsApiKey
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    // google_mlkit_text_recognition은 스크립트별 인식 모델(latin/chinese/devanagari/
    // japanese/korean)을 플러그인 자체 build.gradle에서 compileOnly로만 선언해둔다 —
    // 컴파일은 되지만 실제 APK에는 안 들어가 있어서, 쓰려는 스크립트를 앱이 직접
    // implementation으로 추가해야 한다(안 하면 런타임에 NoClassDefFoundError).
    // sensitive_content_detector.dart가 TextRecognitionScript.korean을 쓰므로 그와 짝을
    // 맞춘다(버전은 플러그인이 compileOnly로 잡은 16.0.1과 동일하게).
    implementation("com.google.mlkit:text-recognition-korean:16.0.1")
}
