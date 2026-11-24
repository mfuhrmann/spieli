<script>
  // Shared header of the playground and pitch panels (#1077): title, place,
  // hub region, access badge, navigate, share, close. Sticky in the desktop
  // side panel; inline in the phone panel, where AppShell owns "back".
  import { _, locale } from 'svelte-i18n';
  import { X, Share2, Link as LinkIcon, Check, LockKeyhole, Coffee } from 'lucide-svelte';
  import { shareOrCopy } from '../../lib/share.js';
  import Badge from '../ui/Badge.svelte';
  import { starsHtml } from '../../lib/reviews.js';

  /**
   * @type {{
   *   embedded?: boolean,
   *   kicker?: string | null,
   *   title: string,
   *   titleLang?: string,
   *   subtitle?: string | null,
   *   backendName?: string | null,
   *   access?: 'private' | 'customers' | null,
   *   navUrl?: string | null,
   *   navMobile?: boolean,
   *   shareData?: (() => { title: string, url: string } | null) | null,
   *   onClose?: () => void,
   *   rating?: { avg: number, count: number } | null,
   *   onRatingClick?: (() => void) | null,
   * }}
   */
  let {
    embedded = false,
    kicker = null,
    title,
    titleLang = undefined,
    subtitle = null,
    backendName = null,
    access = null,
    navUrl = null,
    navMobile = false,
    // Returns what to share; the header shares it on phones and copies it on
    // computers (#1087).
    shareData = null,
    onClose = null,
    // Average review rating, shown under the name (#1077). Its own line, so a
    // long name only wraps and never squeezes it.
    rating = null,
    // Jumps to the reviews section, where the visitor can also add one.
    onRatingClick = null,
    // Pills under name and place, inside the header (#1081).
    children = null,
  } = $props();

  // 'copied' shows a visible "Link copied"; 'shared' only the check mark (the
  // share sheet was the feedback). Nothing is ever silent (#1087).
  let shareResult = $state(null);
  let shareTimeout;
  async function share() {
    const data = shareData?.();
    if (!data) return;
    const result = await shareOrCopy(data, { mobile: navMobile });
    if (result === 'cancelled') return;
    shareResult = result;
    clearTimeout(shareTimeout);
    shareTimeout = setTimeout(() => { shareResult = null; }, 2500);
  }
</script>

<header class="panel-header" class:panel-header--embedded={embedded} data-testid="panel-header">
  {#if shareResult === 'copied' || shareResult === 'failed'}
    <span class="share-toast" class:share-toast--error={shareResult === 'failed'} role="status" data-testid="share-toast">
      {shareResult === 'copied' ? $_('panel.linkCopied') : $_('panel.linkCopyFailed')}
    </span>
  {/if}
  <!-- Name across the top with the small icon actions beside it; place,
       rating and access below, "Take me there" at the bottom right (#1077). -->
  <div class="ph-title min-w-0">
    {#if kicker}<p class="panel-kicker">{kicker}</p>{/if}
    <h2 class="panel-title" lang={titleLang}>{title}</h2>
  </div>
  <div class="ph-icons">
    {#if shareData}
      <!-- Phone: share icon and share sheet. Computer: link icon, copy. -->
      <button class="panel-icon-btn share-btn" onclick={share} data-testid="share-btn"
              aria-label={navMobile ? $_('panel.share') : $_('info.copyLink')}>
        {#if shareResult === 'shared' || shareResult === 'copied'}
          <Check class="h-5 w-5 text-primary" />
        {:else if navMobile}
          <Share2 class="h-5 w-5" />
        {:else}
          <LinkIcon class="h-5 w-5" />
        {/if}
      </button>
    {/if}
    {#if !embedded && onClose}
      <button class="panel-icon-btn" onclick={onClose} aria-label={$_('info.closeBtn')}>
        <X class="h-5 w-5" />
      </button>
    {/if}
  </div>
  <div class="ph-meta min-w-0">
    {#if subtitle}
      <p class="panel-subtitle">{subtitle}</p>
    {/if}
    {#if backendName}
      <p class="backend-name">{backendName}</p>
    {/if}
    {#if rating}
      <button type="button" class="panel-rating" data-testid="header-rating"
         onclick={() => onRatingClick?.()}
         disabled={!onRatingClick}
         title={$_('panel.ratingJump')}
         aria-label={`${$_('panel.ratingLabel', { values: { rating: (rating.avg / 20).toLocaleString($locale ?? undefined, { maximumFractionDigits: 1 }), count: rating.count } })}. ${$_('panel.ratingJump')}`}>
        <span aria-hidden="true">{@html starsHtml(rating.avg)}</span>
        <span class="panel-rating__num" aria-hidden="true">{(rating.avg / 20).toLocaleString($locale ?? undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ({rating.count})</span>
      </button>
    {/if}
    {#if access === 'private'}
      <Badge variant="privateSoft" class="gap-[5px] whitespace-nowrap mt-1.5" data-testid="restricted-badge" data-access="private">
        <LockKeyhole class="h-3 w-3" aria-hidden="true" />{$_('access.private')}
      </Badge>
    {:else if access === 'customers'}
      <Badge variant="customersSoft" class="gap-[5px] whitespace-nowrap mt-1.5" data-testid="restricted-badge" data-access="customers">
        <Coffee class="h-3 w-3" aria-hidden="true" />{$_('access.customers')}
      </Badge>
    {/if}
  </div>
  {#if children}
    <div class="ph-pills">{@render children()}</div>
  {/if}
  <div class="ph-nav">
    {#if navUrl}
      <a
        class="navigate-btn"
        href={navUrl}
        target={navMobile ? undefined : '_blank'}
        rel={navMobile ? undefined : 'noopener'}
      >{$_('info.navigateHere')}</a>
    {/if}
  </div>
</header>

<style>
  /* Visible outcome of a copy, next to the share button (#1087). */
  .share-toast {
    position: absolute;
    top: 0.5rem;
    right: 3rem;
    z-index: 2;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--color-foreground);
    color: var(--color-surface);
    font-size: 0.8125rem;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
  }
  .share-toast--error { background: var(--color-destructive); color: #fff; }
  .panel-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "title icons"
      "meta  nav"
      "pills pills";
    position: relative;
    column-gap: 0.75rem;
    row-gap: 0.25rem;
    padding: 1rem;
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    background: var(--color-background);
    z-index: 1;
  }
  .panel-header--embedded {
    position: static;
    padding: 0 0 0.75rem;
    margin-bottom: 0.75rem;
  }
  .ph-title { grid-area: title; align-self: center; }
  .ph-icons { grid-area: icons; justify-self: end; display: flex; align-items: center; gap: 0.125rem; margin: -0.375rem -0.375rem 0 0; }
  .ph-meta  { grid-area: meta; }
  .ph-nav   { grid-area: nav; align-self: end; justify-self: end; }
  .ph-pills { grid-area: pills; margin-top: 6px; }
  .ph-pills :global(.pill-row) { margin-bottom: 0; }
  .ph-meta:empty, .ph-nav:empty { display: none; }

  .panel-kicker {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted-foreground);
  }
  .panel-title {
    font-size: 23px;
    font-weight: 900;
    letter-spacing: -0.01em;
    color: var(--color-foreground);
    line-height: 1.2;
    margin: 0;
    /* The title shares its row with the action buttons and may shrink to
       nothing; a single long word ("Mehrzweckplatz" next to "Bring mich
       hierher") then ran underneath them. Hyphenate where the browser has a
       dictionary for the element's lang, otherwise break inside the word. */
    overflow-wrap: break-word;
    hyphens: auto;
  }
  .panel-subtitle {
    margin: 0.125rem 0 0;
    font-size: 0.875rem;
    color: var(--color-muted-foreground);
  }
  .panel-rating {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0.125rem 0 0;
    padding: 2px 0;
    border: none;
    background: transparent;
    font-size: 0.875rem;
    line-height: 1.2;
    cursor: pointer;
    text-align: left;
  }
  .panel-rating:disabled { cursor: default; }
  .panel-rating:hover:not(:disabled) .panel-rating__num { text-decoration: underline; }
  .panel-rating__num { color: var(--color-muted-foreground); font-size: 0.8125rem; }
  .backend-name {
    margin: 0.15rem 0 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-muted-foreground);
  }
  .navigate-btn {
    padding: 7px 13px;
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    text-decoration: none;
    transition: background 0.15s;
  }
  .navigate-btn:hover { background: var(--color-primary-hover); color: var(--color-primary-foreground); }
  .panel-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border: none;
    background: transparent;
    border-radius: 0.375rem;
    cursor: pointer;
    color: var(--color-muted-foreground);
    transition: background 0.15s, color 0.15s;
  }
  .panel-icon-btn:hover { background: var(--color-muted); color: var(--color-foreground); }
</style>
