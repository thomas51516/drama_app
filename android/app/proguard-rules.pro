# R8 rules for the release build (S03-OPS-01). Libraries ship their own consumer rules (Retrofit, OkHttp,
# Room, Hilt, Media3, Coil, Firebase); the rules below cover what the project generates itself.

# --- Debugging: keep line numbers so Crashlytics stack traces are readable; hide the source file name.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes Signature,*Annotation*,InnerClasses,EnclosingMethod

# --- kotlinx.serialization: DTOs (:core:network) and type-safe navigation routes (@Serializable).
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
# Keep the generated serializer() of every @Serializable class (companion / INSTANCE lookup done by reflection-free
# but name-based code paths) and the $serializer classes.
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}
-if @kotlinx.serialization.Serializable class ** {
    static **$* *;
}
-keepclassmembers class <2>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}
-if @kotlinx.serialization.Serializable class ** {
    public static ** INSTANCE;
}
-keepclassmembers class <1> {
    public static <1> INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.drama.**$$serializer { *; }
-keepclassmembers class com.drama.** {
    *** Companion;
}
-keepclasseswithmembers class com.drama.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- Retrofit: suspend functions and generic return types (rules bundled with Retrofit 3 cover the rest).
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn javax.annotation.**

# --- Room / Hilt / Media3 / DataStore: consumer rules are shipped in the artifacts. Nothing to add.

# --- Navigation type-safe routes: route classes are only accessed through their serializers (kept above).
