import { type TopupOrder } from '../generated/prisma/client.js';

/** Page de paiement simulée (agrégateur `fake`, dev uniquement) : HTML rendu côté serveur, en français. */
export function renderFakePaymentPage(order: TopupOrder, actionUrl: string): string {
  const amount = formatAmount(order.amountMinor, order.currency);
  const status = order.status;
  const body =
    status === 'PENDING'
      ? `
      <p class="muted">Simulation d’un paiement mobile money. Aucun argent réel n’est échangé.</p>
      <form method="post" action="${esc(actionUrl)}">
        <input type="hidden" name="outcome" value="paid" />
        <button class="primary" type="submit">Payer ${esc(amount)}</button>
      </form>
      <form method="post" action="${esc(actionUrl)}">
        <input type="hidden" name="outcome" value="failed" />
        <button class="secondary" type="submit">Échouer</button>
      </form>`
      : status === 'PAID'
        ? `<p class="ok">Paiement confirmé. ${order.coins} pièces${order.bonusCoins > 0 ? ` et ${order.bonusCoins} pièces bonus` : ''} ont été créditées sur le compte.</p>
           <p class="muted">Vous pouvez fermer cette page et revenir dans l’application.</p>`
        : status === 'FAILED'
          ? `<p class="ko">Paiement refusé. Aucune pièce n’a été créditée.</p>`
          : `<p class="ko">Cette commande a expiré. Créez une nouvelle commande depuis le site de recharge.</p>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Paiement simulé — DRAMA</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  body { margin: 0; padding: 24px 16px; background: #f5f3ff; color: #1f1b2e; display: flex; justify-content: center; }
  @media (prefers-color-scheme: dark) { body { background: #15121f; color: #f1eefb; } .card { background: #221d33 !important; } }
  .card { width: 100%; max-width: 420px; background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(60, 30, 120, .12); }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  .badge { display: inline-block; font-size: .75rem; padding: 2px 8px; border-radius: 999px; background: #ede9fe; color: #5b21b6; margin-bottom: 16px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0 0 20px; font-size: .95rem; }
  dt { color: #6b6480; } dd { margin: 0; font-weight: 600; text-align: right; }
  form { margin: 0 0 10px; }
  button { width: 100%; padding: 14px; border: 0; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; }
  .primary { background: #6d28d9; color: #fff; } .secondary { background: #e5e7eb; color: #1f1b2e; }
  .muted { color: #6b6480; font-size: .9rem; } .ok { color: #15803d; font-weight: 600; } .ko { color: #b91c1c; font-weight: 600; }
</style>
</head>
<body>
  <main class="card">
    <span class="badge">Agrégateur simulé</span>
    <h1>Recharge DRAMA</h1>
    <dl>
      <dt>Commande</dt><dd><code>${esc(order.id.slice(0, 8))}…</code></dd>
      <dt>Pack</dt><dd>${esc(order.packSku)} · ${order.coins} pièces</dd>
      <dt>Montant</dt><dd>${esc(amount)}</dd>
      <dt>Statut</dt><dd>${esc(statusLabel(status))}</dd>
    </dl>
    ${body}
  </main>
</body>
</html>
`;
}

function statusLabel(status: TopupOrder['status']): string {
  switch (status) {
    case 'PENDING':
      return 'En attente de paiement';
    case 'PAID':
      return 'Payée';
    case 'FAILED':
      return 'Échouée';
    default:
      return 'Expirée';
  }
}

export function formatAmount(amountMinor: number, currency: string): string {
  const noDecimals =
    currency === 'XOF' || currency === 'XAF' || currency === 'GNF' || currency === 'CDF';
  const value = noDecimals ? amountMinor : amountMinor / 100;
  const label = currency === 'XOF' ? 'FCFA' : currency;
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: noDecimals ? 0 : 2, maximumFractionDigits: 2 })} ${label}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
