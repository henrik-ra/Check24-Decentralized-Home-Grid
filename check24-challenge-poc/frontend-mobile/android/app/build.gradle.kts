plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "de.check24.home.poc"
  compileSdk = 34

  defaultConfig {
    applicationId = "de.check24.home.poc"
    minSdk = 24
    targetSdk = 34
    versionCode = 1
    versionName = "0.1"
  }

  buildTypes {
    debug {
      // Local dev: allow cleartext traffic to reach the host machine from the emulator.
      manifestPlaceholders["usesCleartextTraffic"] = "true"
      buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3000/\"")
    }

    release {
      // Production stance: require HTTPS.
      // If you ever create a real release build, set this to your HTTPS endpoint.
      manifestPlaceholders["usesCleartextTraffic"] = "false"
      isMinifyEnabled = false
      buildConfigField("String", "API_BASE_URL", "\"https://example.com/\"")
    }
  }

  buildFeatures {
    compose = true
    buildConfig = true
  }

  composeOptions {
    kotlinCompilerExtensionVersion = "1.5.14"
  }

  kotlinOptions {
    jvmTarget = "17"
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

dependencies {
  val composeBom = platform("androidx.compose:compose-bom:2024.10.00")
  implementation(composeBom)
  androidTestImplementation(composeBom)

  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.activity:activity-compose:1.9.3")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-tooling-preview")
  implementation("androidx.compose.material3:material3")
  debugImplementation("androidx.compose.ui:ui-tooling")

  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")

  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

  implementation("com.squareup.retrofit2:retrofit:2.11.0")
  implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
  implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
  implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
}
