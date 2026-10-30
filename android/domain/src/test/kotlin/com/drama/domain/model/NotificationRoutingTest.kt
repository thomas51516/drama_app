package com.drama.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationRoutingTest {
    @Test
    fun `new episode payload routes to the player of that episode`() {
        val target =
            NotificationRouting.target(
                NotificationRouting.TYPE_NEW_EPISODE,
                mapOf("seriesId" to "s1", "episodeId" to "e7"),
            )
        assertEquals(NotificationTarget.Episode("s1", "e7"), target)
        assertEquals("drama://player/s1/e7", NotificationRouting.deepLink(target))
    }

    @Test
    fun `series only payload opens the series sheet`() {
        assertEquals(
            NotificationTarget.Series("s1"),
            NotificationRouting.target(NotificationRouting.TYPE_OFFER, mapOf("seriesId" to "s1")),
        )
    }

    @Test
    fun `explicit deep link wins over ids`() {
        val target =
            NotificationRouting.target(
                NotificationRouting.TYPE_NEW_EPISODE,
                mapOf("deepLink" to "drama://help", "seriesId" to "s1"),
            )
        assertEquals(NotificationTarget.Help, target)
    }

    @Test
    fun `defaults per type when nothing else is given`() {
        assertEquals(
            NotificationTarget.Help,
            NotificationRouting.target(NotificationRouting.TYPE_SUPPORT_REPLY, emptyMap()),
        )
        assertEquals(
            NotificationTarget.Notifications,
            NotificationRouting.target(NotificationRouting.TYPE_OFFER, emptyMap()),
        )
        assertEquals(NotificationTarget.Notifications, NotificationRouting.target("checkin_reminder", emptyMap()))
        assertEquals(NotificationTarget.Home, NotificationRouting.target("something_else", emptyMap()))
        assertEquals(NotificationTarget.Home, NotificationRouting.target(null, mapOf("seriesId" to " ")))
    }

    @Test
    fun `deep links parse back to targets and unknown ones are rejected`() {
        assertEquals(NotificationTarget.Series("abc"), NotificationRouting.fromDeepLink("drama://series/abc"))
        assertEquals(NotificationTarget.Episode("a", "b"), NotificationRouting.fromDeepLink("DRAMA://player/a/b?x=1"))
        assertEquals(NotificationTarget.Series("a"), NotificationRouting.fromDeepLink("drama://player/a"))
        assertEquals(NotificationTarget.Notifications, NotificationRouting.fromDeepLink("drama://notifications"))
        assertNull(NotificationRouting.fromDeepLink("https://links.drama.example/s/abc"))
        assertNull(NotificationRouting.fromDeepLink("drama://wallet"))
        assertNull(NotificationRouting.fromDeepLink("drama://series"))
    }

    @Test
    fun `channels follow the type with offers as fallback`() {
        assertEquals(NotificationChannelKind.NEW_EPISODES, NotificationRouting.channel("new_episode"))
        assertEquals(NotificationChannelKind.OFFERS, NotificationRouting.channel("campaign"))
        assertEquals(NotificationChannelKind.REMINDERS, NotificationRouting.channel("checkin_reminder"))
        assertEquals(NotificationChannelKind.SUPPORT, NotificationRouting.channel("support_reply"))
        assertEquals(NotificationChannelKind.OFFERS, NotificationRouting.channel(null))
    }

    @Test
    fun `fcm data payload needs a title and keeps the raw map`() {
        assertNull(NotificationRouting.parsePayload(mapOf("body" to "no title")))
        val message =
            NotificationRouting.parsePayload(
                mapOf(
                    "title" to "Nouvel épisode",
                    "type" to "new_episode",
                    "seriesId" to "s1",
                    "notificationId" to "n1",
                ),
            )!!
        assertEquals("n1", message.id)
        assertEquals("", message.body)
        assertEquals(NotificationTarget.Series("s1"), message.target)
        assertEquals(NotificationChannelKind.NEW_EPISODES, message.channel)
        assertEquals("offer", NotificationRouting.parsePayload(mapOf("title" to "t"))!!.type)
    }
}
