package com.drama.feature.player.engine

import com.drama.domain.model.Subtitle
import com.drama.domain.model.SubtitleMode
import com.drama.domain.model.VideoQuality
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TrackSelectionMapperTest {
    private val tracks = listOf(Subtitle("fr", "u/fr.vtt", "Français"), Subtitle("EN", "u/en.vtt", "English"))

    @Test
    fun `quality cap is the long side of a 16-9 frame, unbounded for auto`() {
        assertEquals(640, TrackSelectionMapper.longSideCap(VideoQuality.P360))
        assertEquals(960, TrackSelectionMapper.longSideCap(VideoQuality.P540))
        assertEquals(1280, TrackSelectionMapper.longSideCap(VideoQuality.P720))
        assertEquals(1920, TrackSelectionMapper.longSideCap(VideoQuality.P1080))
        assertEquals(Int.MAX_VALUE, TrackSelectionMapper.longSideCap(VideoQuality.AUTO))
    }

    @Test
    fun `short side is the p value for portrait and landscape renditions`() {
        assertEquals(360, TrackSelectionMapper.shortSide(360, 640))
        assertEquals(360, TrackSelectionMapper.shortSide(640, 360))
    }

    @Test
    fun `quality options follow the renditions actually offered`() {
        assertEquals(
            listOf(VideoQuality.AUTO, VideoQuality.P1080, VideoQuality.P720, VideoQuality.P540, VideoQuality.P360),
            TrackSelectionMapper.qualityOptions(listOf(360, 540, 720, 1080)),
        )
        assertEquals(
            listOf(VideoQuality.AUTO, VideoQuality.P720, VideoQuality.P360),
            TrackSelectionMapper.qualityOptions(listOf(360, 720)),
        )
        // 480p rendition falls in the 540p band
        assertEquals(listOf(VideoQuality.AUTO, VideoQuality.P540), TrackSelectionMapper.qualityOptions(listOf(480)))
        assertEquals(VideoQuality.entries, TrackSelectionMapper.qualityOptions(emptyList()))
    }

    @Test
    fun `auto subtitles pick the device language when offered`() {
        assertEquals("fr", TrackSelectionMapper.resolveSubtitleLanguage(SubtitleMode.Auto, tracks, "fr"))
        assertEquals("en", TrackSelectionMapper.resolveSubtitleLanguage(SubtitleMode.Auto, tracks, "EN"))
        assertNull(TrackSelectionMapper.resolveSubtitleLanguage(SubtitleMode.Auto, tracks, "es"))
        assertNull(TrackSelectionMapper.resolveSubtitleLanguage(SubtitleMode.Auto, emptyList(), "fr"))
    }

    @Test
    fun `explicit language and off`() {
        assertEquals("en", TrackSelectionMapper.resolveSubtitleLanguage(SubtitleMode.Language("en"), tracks, "fr"))
        assertNull(TrackSelectionMapper.resolveSubtitleLanguage(SubtitleMode.Language("pt"), tracks, "fr"))
        assertNull(TrackSelectionMapper.resolveSubtitleLanguage(SubtitleMode.Off, tracks, "fr"))
    }

    @Test
    fun `labels`() {
        assertEquals("1x", TrackSelectionMapper.speedLabel(1f))
        assertEquals("1.5x", TrackSelectionMapper.speedLabel(1.5f))
        assertEquals("0.75x", TrackSelectionMapper.speedLabel(0.75f))
        assertEquals("2x", TrackSelectionMapper.speedLabel(2f))
        assertEquals("Auto", TrackSelectionMapper.qualityLabel(VideoQuality.AUTO))
        assertEquals("360p", TrackSelectionMapper.qualityLabel(VideoQuality.P360))
    }
}
