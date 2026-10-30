pluginManagement {
    includeBuild("build-logic")
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
    }
}

rootProject.name = "drama"

include(":app")
include(":core:common")
include(":core:ui")
include(":core:network")
include(":core:database")
include(":core:player")
include(":domain")
include(":data")
include(":feature:home")
include(":feature:player")
include(":feature:series")
include(":feature:account")
include(":feature:feed")
include(":feature:search")
include(":feature:mylist")
include(":feature:help")
include(":feature:notifications")
include(":benchmark")
