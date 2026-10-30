package com.drama.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drama.core.common.result.AppError
import com.drama.core.ui.component.ErrorState
import com.drama.core.ui.component.OfflineBanner
import com.drama.core.ui.component.PosterCard
import com.drama.core.ui.component.PosterImage
import com.drama.core.ui.component.SkeletonBox
import com.drama.core.ui.theme.DramaSizes
import com.drama.core.ui.theme.DramaSpacing
import com.drama.domain.model.HomeBanner
import kotlinx.coroutines.delay

/** Home (M-01, S03-A1-01): banner carousel, configured rows of 2:3 posters, continue watching, pull-to-refresh. */
@Composable
fun HomeScreen(
    onOpenSeries: (seriesId: String) -> Unit,
    onResumeEpisode: (seriesId: String, episodeId: String) -> Unit,
    onOpenSearch: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    HomeContent(
        state = state,
        onOpenSeries = onOpenSeries,
        onResumeEpisode = onResumeEpisode,
        onRefresh = viewModel::refresh,
        onOpenSearch = onOpenSearch,
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeContent(
    state: HomeUiState,
    onOpenSeries: (seriesId: String) -> Unit,
    onResumeEpisode: (seriesId: String, episodeId: String) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenSearch: () -> Unit = {},
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .statusBarsPadding(),
    ) {
        HomeTopBar(onOpenSearch = onOpenSearch)
        when {
            state.isLoading -> HomeSkeleton()
            state.showError -> ErrorState(message = state.error.toMessage(), onRetry = onRefresh)
            else ->
                PullToRefreshBox(
                    isRefreshing = state.isRefreshing,
                    onRefresh = onRefresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = DramaSpacing.xl),
                        verticalArrangement = Arrangement.spacedBy(DramaSpacing.lg),
                    ) {
                        if (state.error != null) {
                            item(key = "offline") {
                                OfflineBanner(
                                    message = "Hors ligne : contenu en cache",
                                    onRetry = onRefresh,
                                )
                            }
                        }
                        if (state.banners.isNotEmpty()) {
                            item(key = "banners") {
                                BannerCarousel(banners = state.banners, onBannerClick = { onOpenSeries(it.seriesId) })
                            }
                        }
                        if (state.isEmpty) {
                            item(key = "empty") {
                                Text(
                                    text = "Aucune série publiée pour le moment.",
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(DramaSpacing.lg),
                                )
                            }
                        }
                        items(state.rows, key = { it.key }) { row ->
                            HomeRowSection(
                                row = row,
                                onCardClick = { card ->
                                    val episodeId = card.resumeEpisodeId
                                    if (episodeId !=
                                        null
                                    ) {
                                        onResumeEpisode(card.seriesId, episodeId)
                                    } else {
                                        onOpenSeries(card.seriesId)
                                    }
                                },
                            )
                        }
                    }
                }
        }
    }
}

@Composable
private fun HomeTopBar(onOpenSearch: () -> Unit) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(
                    start = DramaSpacing.md,
                    end = DramaSpacing.xs,
                    top = DramaSpacing.xs,
                    bottom = DramaSpacing.xs,
                ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "DRAMA",
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Black, letterSpacing = 2.sp),
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onOpenSearch) {
            Icon(Icons.Default.Search, contentDescription = "Rechercher", tint = MaterialTheme.colorScheme.onBackground)
        }
    }
}

/** Auto-advancing carousel (every [BANNER_AUTO_ADVANCE_MS]) with page dots; pauses while the user drags. */
@Composable
private fun BannerCarousel(
    banners: List<HomeBanner>,
    onBannerClick: (HomeBanner) -> Unit,
) {
    val pagerState = rememberPagerState { banners.size }
    LaunchedEffect(pagerState, banners.size) {
        if (banners.size < 2) return@LaunchedEffect
        while (true) {
            delay(BANNER_AUTO_ADVANCE_MS)
            if (!pagerState.isScrollInProgress) {
                pagerState.animateScrollToPage((pagerState.currentPage + 1) % banners.size)
            }
        }
    }
    Column {
        HorizontalPager(
            state = pagerState,
            contentPadding = PaddingValues(horizontal = DramaSpacing.md),
            pageSpacing = DramaSpacing.sm,
            beyondViewportPageCount = 1,
        ) { page ->
            BannerCard(banner = banners[page], onClick = { onBannerClick(banners[page]) })
        }
        if (banners.size > 1) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(top = DramaSpacing.sm),
                horizontalArrangement = Arrangement.Center,
            ) {
                repeat(banners.size) { index ->
                    val selected = pagerState.currentPage == index
                    Box(
                        modifier =
                            Modifier
                                .padding(horizontal = 3.dp)
                                .size(width = if (selected) 18.dp else 6.dp, height = 6.dp)
                                .clip(CircleShape)
                                .background(
                                    if (selected) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        Color.White.copy(
                                            alpha = 0.35f,
                                        )
                                    },
                                ),
                    )
                }
            }
        }
    }
}

@Composable
private fun BannerCard(
    banner: HomeBanner,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .aspectRatio(BANNER_RATIO)
                .clip(RoundedCornerShape(DramaSizes.bannerCornerRadius))
                .clickable(onClick = onClick),
    ) {
        PosterImage(
            url = banner.imageUrl,
            contentDescription = banner.title,
            modifier = Modifier.fillMaxSize(),
            fallbackText = null,
        )
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            0f to Color.Transparent,
                            0.45f to Color.Transparent,
                            1f to Color.Black.copy(alpha = 0.9f),
                        ),
                    ),
        )
        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(DramaSpacing.md),
        ) {
            Text(
                text = banner.title,
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val subtitle = banner.subtitle
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.8f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun HomeRowSection(
    row: HomeRowUi,
    onCardClick: (HomeCard) -> Unit,
) {
    Column {
        Text(
            text = row.title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(horizontal = DramaSpacing.md, vertical = DramaSpacing.sm),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = DramaSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm + DramaSpacing.xs),
        ) {
            items(row.cards, key = { it.seriesId + (it.resumeEpisodeId ?: "") }) { card ->
                PosterCard(
                    title = card.title,
                    imageUrl = card.posterUrl,
                    subtitle = card.subtitle,
                    badge = card.badge,
                    progress = card.progress,
                    onClick = { onCardClick(card) },
                )
            }
        }
    }
}

@Composable
private fun HomeSkeleton() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(DramaSpacing.lg),
    ) {
        SkeletonBox(
            modifier =
                Modifier
                    .padding(horizontal = DramaSpacing.md)
                    .fillMaxWidth()
                    .aspectRatio(BANNER_RATIO),
            cornerRadius = DramaSizes.bannerCornerRadius,
        )
        repeat(2) {
            Column {
                SkeletonBox(
                    modifier =
                        Modifier
                            .padding(horizontal = DramaSpacing.md)
                            .width(140.dp)
                            .height(18.dp),
                    cornerRadius = 6.dp,
                )
                Spacer(Modifier.height(DramaSpacing.sm))
                Row(
                    modifier = Modifier.padding(horizontal = DramaSpacing.md),
                    horizontalArrangement = Arrangement.spacedBy(DramaSpacing.sm + DramaSpacing.xs),
                ) {
                    repeat(3) {
                        SkeletonBox(
                            modifier = Modifier.size(DramaSizes.posterCardWidth, DramaSizes.posterCardHeight),
                        )
                    }
                }
            }
        }
    }
}

private fun AppError?.toMessage(): String =
    when (this) {
        is AppError.Network -> "Pas de connexion. Vérifiez le réseau puis réessayez."
        is AppError.Server -> "Le service est indisponible ($code). Réessayez dans un instant."
        else -> "Impossible de charger l'accueil."
    }

private const val BANNER_AUTO_ADVANCE_MS = 5_000L
private const val BANNER_RATIO = 16f / 9f
