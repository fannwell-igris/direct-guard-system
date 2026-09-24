// Top-level build file. Android Studio may offer to upgrade the Android
// Gradle Plugin / Kotlin versions below when you first open this project --
// that's normal and safe to accept.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    // Reads app/google-services.json (from the Firebase console) at build
    // time -- required for push notifications. See app/build.gradle.kts
    // for where it's actually applied.
    id("com.google.gms.google-services") version "4.4.2" apply false
}
