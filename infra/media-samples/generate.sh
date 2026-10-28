#!/usr/bin/env bash
# Génère des épisodes de test verticaux (9:16, 1080x1920) en HLS multi-débits (CMAF),
# avec un extrait de 15 s pour le flux et une vignette, conformément à la section 9 du
# cahier des charges. Sortie dans infra/media-samples/out/ (ignoré par git).
#
# Usage : ./generate.sh [nombre_d_episodes] [duree_secondes]
set -euo pipefail

COUNT="${1:-3}"
DURATION="${2:-30}"
OUT="$(cd "$(dirname "$0")" && pwd)/out"
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FPS=24
GOP=$((FPS * 2)) # segments de 2 s

command -v ffmpeg >/dev/null || { echo "ffmpeg est requis" >&2; exit 1; }
mkdir -p "$OUT"

# Rendus : nom largeur hauteur débit_vidéo débit_audio
RENDITIONS=(
  "360p 360 640 600k 64k"
  "540p 540 960 1200k 96k"
  "720p 720 1280 2200k 96k"
  "1080p 1080 1920 4000k 128k"
)

render_episode() {
  local n="$1" dir="$OUT/ep$n"
  mkdir -p "$dir"
  local text="DRAMA\nÉpisode $n"
  # Source : mire animée verticale + titre + chrono, son sinusoïdal doux.
  local src="testsrc2=size=1080x1920:rate=$FPS,\
drawbox=x=0:y=0:w=1080:h=1920:color=0x0f172a@0.55:t=fill,\
drawtext=fontfile=$FONT:text='$text':fontcolor=white:fontsize=120:line_spacing=20:x=(w-text_w)/2:y=(h-text_h)/2-200,\
drawtext=fontfile=$FONT:text='%{pts\\:hms}':fontcolor=0xfbbf24:fontsize=80:x=(w-text_w)/2:y=(h-text_h)/2+120,\
drawtext=fontfile=$FONT:text='9:16 · 1080x1920':fontcolor=0x94a3b8:fontsize=48:x=(w-text_w)/2:y=h-200"

  local filter="[0:v]split=${#RENDITIONS[@]}"
  local maps=() varmap=() i=0
  for r in "${RENDITIONS[@]}"; do
    read -r name w h vb ab <<<"$r"
    filter+="[v$i]"
    maps+=(-map "[s$i]" -map 1:a)
    varmap+=("v:$i,a:$i,name:$name")
    i=$((i + 1))
  done
  filter+=";"
  i=0
  for r in "${RENDITIONS[@]}"; do
    read -r name w h vb ab <<<"$r"
    filter+="[v$i]scale=w=$w:h=$h:flags=lanczos[s$i];"
    i=$((i + 1))
  done
  filter="${filter%;}"

  local enc=(-c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
             -g "$GOP" -keyint_min "$GOP" -sc_threshold 0 -c:a aac -ac 2)
  i=0
  for r in "${RENDITIONS[@]}"; do
    read -r name w h vb ab <<<"$r"
    enc+=(-b:v:$i "$vb" -maxrate:v:$i "$vb" -bufsize:v:$i "$vb" -b:a:$i "$ab")
    mkdir -p "$dir/$name"
    i=$((i + 1))
  done

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "$src" \
    -f lavfi -i "sine=frequency=$((220 + n * 55)):sample_rate=48000" \
    -t "$DURATION" \
    -filter_complex "$filter" "${maps[@]}" "${enc[@]}" \
    -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type fmp4 -hls_flags independent_segments \
    -master_pl_name master.m3u8 \
    -var_stream_map "${varmap[*]}" \
    -hls_segment_filename "$dir/%v/seg_%03d.m4s" \
    "$dir/%v/index.m3u8"

  # Extrait de 15 s en 540p pour le flux « Pour vous » et vignette à 2 s.
  mkdir -p "$dir/preview"
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "$src" -f lavfi -i "sine=frequency=$((220 + n * 55)):sample_rate=48000" \
    -t 15 -vf "scale=540:960" -c:v libx264 -preset veryfast -b:v 1200k -g "$GOP" -pix_fmt yuv420p -c:a aac -b:a 96k \
    -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_type fmp4 \
    -hls_segment_filename "$dir/preview/seg_%03d.m4s" "$dir/preview/index.m3u8"
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "$src" -ss 2 -frames:v 1 -vf "scale=540:960" "$dir/thumbnail.jpg"

  echo "ep$n : $(ls "$dir" | tr '\n' ' ')"
}

for n in $(seq 1 "$COUNT"); do render_episode "$n"; done
echo "Terminé : $OUT"
