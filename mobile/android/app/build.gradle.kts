plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Marketing version follows the desktop release; scripts/mobile-version.mjs overrides these in CI.
val appVersionName = providers.gradleProperty("appVersionName").getOrElse("0.7.0")
val appVersionCode = providers.gradleProperty("appVersionCode").map { it.toInt() }.getOrElse(1)

android {
    namespace = "ai.actionstations.player"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.actionstations.player"
        minSdk = 29
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName
    }

    // Release signing reads the environment; with no keystore the release build stays unsigned.
    val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
    signingConfigs {
        if (!keystorePath.isNullOrBlank()) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (!keystorePath.isNullOrBlank()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint { abortOnError = true }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

// The shared vectors are read straight from the repository so Android, iOS and Vitest cannot drift.
tasks.withType<Test>().configureEach {
    systemProperty("invites.fixture", rootProject.projectDir.resolve("../fixtures/invites.json").canonicalPath)
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
