import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

// Release signing config, added 2026-09-25 for the first in-house release
// build (previously only debug builds existed). Reads
// android/keystore.properties (git-ignored, see mobile/.gitignore) rather
// than hardcoding the keystore path/passwords here, since this file IS
// committed to git. If keystore.properties is missing (e.g. a fresh
// checkout that hasn't been given the keystore), releaseSigning stays
// null and the release build type simply falls back to no explicit
// signing config rather than failing the whole Gradle sync.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
var releaseSigningAvailable = false
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
    releaseSigningAvailable = true
}

android {
    namespace = "com.magensecurity.cms"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.magensecurity.cms"
        minSdk = 24
        targetSdk = 34
        versionCode = 3
        versionName = "1.1.0"
    }

    signingConfigs {
        if (releaseSigningAvailable) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (releaseSigningAvailable) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")

    // Push notifications (Firebase Cloud Messaging). The BOM pins every
    // Firebase library to compatible versions, so no version number is
    // given on the lines below it.
    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-messaging-ktx")
}
