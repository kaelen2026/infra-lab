import java.io.FileInputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.detekt)
}

// Local quality gate (not in CI): `./gradlew detekt`, autofix with `--auto-correct`.
// Rules layer on detekt's defaults; overrides live in config/detekt/detekt.yml.
detekt {
    buildUponDefaultConfig = true
    config.setFrom(rootProject.files("config/detekt/detekt.yml"))
    autoCorrect = false
}

// Release signing (optional): if apps/android/keystore.properties exists, sign release
// builds with it; otherwise fall back to the debug signing config so a release APK still
// installs locally. keystore.properties and its .jks are gitignored — never commit signing
// material. Expected keys: storeFile, storePassword, keyAlias, keyPassword.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val hasReleaseKeystore = keystorePropertiesFile.exists()
val keystoreProperties =
    Properties().apply {
        if (hasReleaseKeystore) FileInputStream(keystorePropertiesFile).use { load(it) }
    }

android {
    namespace = "ai.deeplang.infra"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.deeplang.infra"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        // Only define a real release config when keystore.properties is present; release
        // otherwise falls back to debug signing (see buildTypes.release below).
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    // Environment switching: an `env` flavor dimension selects the API base URL and an
    // applicationId suffix so dev/staging/prod can be installed side by side. Crossed with
    // the debug/release build types this yields devDebug … prodRelease — build any variant
    // with `assemble<Env><BuildType>` (e.g. assembleProdRelease).
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            isDefault = true
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            // Android emulator reaches the host machine's localhost via 10.0.2.2.
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3001\"")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            // Replace with the real staging API before using this flavor.
            buildConfigField("String", "API_BASE_URL", "\"https://staging-api.example.com\"")
        }
        create("prod") {
            dimension = "env"
            // No suffix: prod keeps the canonical applicationId ai.deeplang.infra.
            // Replace with the real production API before shipping.
            buildConfigField("String", "API_BASE_URL", "\"https://api.example.com\"")
        }
    }

    buildTypes {
        debug {
            // API_BASE_URL now comes from the selected env flavor; debug stays debuggable
            // and unminified by default.
        }
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Real keystore when configured, else debug signing so the APK still installs.
            signingConfig =
                if (hasReleaseKeystore) {
                    signingConfigs.getByName("release")
                } else {
                    signingConfigs.getByName("debug")
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

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.retrofit)
    implementation(libs.retrofit.serialization.converter)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)

    implementation(libs.androidx.security.crypto)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)

    // ktlint's formatting rules, surfaced through detekt (see config/detekt/detekt.yml).
    detektPlugins(libs.detekt.formatting)
}
