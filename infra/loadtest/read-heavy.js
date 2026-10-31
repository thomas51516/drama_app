// Test de charge k6 — S10-OPS-01 (cahier des charges §12).
// Couvre les endpoints de lecture cités par le cahier des charges :
// GET /home, GET /series/{id}, GET /series/{id}/episodes, POST /episodes/{id}/play,
// GET /feed, GET /search.
//
// Usage :
//   docker run --rm --network host \
//     -e BASE_URL=http://localhost:3000 \
//     -v "$PWD:/scripts" grafana/k6 run /scripts/read-heavy.js \
//     --vus 200 --duration 2m \
//     --summary-export=/scripts/results/vus-200.json
//
// Jetons : npx tsx backend/scripts/loadtest-seed-users.ts 300 (depuis backend/) avant de lancer,
// écrit infra/loadtest/.tokens.json, lu ici via SharedArray.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Séries et épisode réels de la base de dev (lecture seule, jamais modifiés par ce script).
const SERIES_LA_NOUNOU = '01a18ed3-93f7-7041-88b3-1fa89cb1a1f6';
const SERIES_LAGON = '01a183cf-998e-7356-8838-d406a3bf396d';
const EPISODE_FREE = '01a18ed3-c001-758f-a365-3ef74e0fbecd'; // La Nounou, épisode 1, gratuit

const tokens = new SharedArray('tokens', function () {
  try {
    return JSON.parse(open('./.tokens.json')).tokens;
  } catch {
    return [];
  }
});

// Métriques par endpoint pour le rapport (p95/p99/erreurs par route, docs/ops/charge.md).
const trends = {
  home: new Trend('latency_home'),
  seriesDetail: new Trend('latency_series_detail'),
  seriesEpisodes: new Trend('latency_series_episodes'),
  play: new Trend('latency_play'),
  feed: new Trend('latency_feed'),
  search: new Trend('latency_search'),
};
const errorRate = new Rate('errors');

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],
    latency_home: ['p(95)<300'],
    latency_series_detail: ['p(95)<300'],
    latency_series_episodes: ['p(95)<300'],
    latency_play: ['p(95)<300'],
    latency_feed: ['p(95)<300'],
    latency_search: ['p(95)<300'],
  },
};

function authHeaders() {
  if (tokens.length === 0) return {};
  const token = tokens[Math.floor(Math.random() * tokens.length)];
  return { Authorization: `Bearer ${token}` };
}

function timed(trend, method, url, body, params) {
  const res = method === 'GET' ? http.get(url, params) : http.post(url, body, params);
  trend.add(res.timings.duration);
  const ok = check(res, { 'status 2xx/4xx attendu': (r) => r.status < 500 });
  errorRate.add(!ok);
  return res;
}

export default function () {
  const headers = { headers: { ...authHeaders(), 'X-Country': 'TG' } };

  timed(trends.home, 'GET', `${BASE_URL}/home`, null, headers);
  sleep(0.2);

  timed(trends.seriesDetail, 'GET', `${BASE_URL}/series/${SERIES_LA_NOUNOU}`, null, headers);
  sleep(0.2);

  timed(
    trends.seriesEpisodes,
    'GET',
    `${BASE_URL}/series/${SERIES_LA_NOUNOU}/episodes`,
    null,
    headers,
  );
  sleep(0.2);

  timed(
    trends.play,
    'POST',
    `${BASE_URL}/episodes/${EPISODE_FREE}/play`,
    JSON.stringify({}),
    { headers: { ...headers.headers, 'Content-Type': 'application/json' } },
  );
  sleep(0.2);

  timed(trends.feed, 'GET', `${BASE_URL}/feed`, null, headers);
  sleep(0.2);

  const query = ['nounou', 'lagon', 'drame', 'romance', 'thriller'][
    Math.floor(Math.random() * 5)
  ];
  timed(trends.search, 'GET', `${BASE_URL}/search?q=${query}`, null, headers);

  sleep(0.5);
  void SERIES_LAGON; // réservé pour varier les séries si besoin
}
