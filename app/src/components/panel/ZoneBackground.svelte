<script>
  // Zone C (#1077): background a parent rarely needs to decide — operator,
  // contact, how fresh the data is — and the way to contribute. Shared by the
  // playground and pitch panels.
  import { _ } from 'svelte-i18n';
  import { Phone, Mail } from 'lucide-svelte';
  import MapCompleteLink from '../MapCompleteLink.svelte';
  import DataAgeChip from './DataAgeChip.svelte';

  /**
   * @type {{ attr: Object, dataAge?: string | null, mcUrl?: string, mcLabel?: string, note?: string | null }}
   * mcUrl: empty while mapping detail is on (the link is in the tool block).
   * note: a short line above the link (the pitch panel's "add details").
   */
  let { attr, dataAge = null, mcUrl = '', mcLabel = '', note = null } = $props();

  const operator = $derived(attr?.operator ?? null);
  const wikidata = $derived(attr?.['operator:wikidata'] ?? null);
  const phone = $derived(attr?.['contact:phone'] || attr?.phone || null);
  const email = $derived(attr?.['contact:email'] || attr?.email || null);
  const phoneDialable = $derived(!!phone && /^\+?\d/.test(phone.trim()));
  const emailSafe = $derived(!!email && email.includes('@') && !/^javascript:/i.test(email.trim()));
  const any = $derived(!!(operator || phone || email || dataAge || mcUrl));
</script>

{#if any}
  <section class="zone-c" data-testid="zone-c">
    {#if operator}
      <div class="fact-item mb-1" data-testid="operator-value">
        <span class="info-label">{$_('details.operatorLabel')}</span>
        {#if wikidata}
          <a href="https://www.wikidata.org/wiki/{wikidata}"
             target="_blank" rel="noopener" class="fact-value text-primary hover:underline">{operator}</a>
        {:else}
          <span class="fact-value">{operator}</span>
        {/if}
      </div>
    {/if}
    {#if phone || email}
      <div class="contact-row mb-2">
        {#if phone}
          {#if phoneDialable}
            <a href="tel:{phone}" class="contact-link"><Phone class="h-3.5 w-3.5 shrink-0" /><span>{phone}</span></a>
          {:else}
            <span class="contact-link contact-link--plain"><Phone class="h-3.5 w-3.5 shrink-0" /><span>{phone}</span></span>
          {/if}
        {/if}
        {#if email}
          {#if emailSafe}
            <a href="mailto:{email}" class="contact-link"><Mail class="h-3.5 w-3.5 shrink-0" /><span>{email}</span></a>
          {:else}
            <span class="contact-link contact-link--plain"><Mail class="h-3.5 w-3.5 shrink-0" /><span>{email}</span></span>
          {/if}
        {/if}
      </div>
    {/if}
    {#if dataAge}
      <div class="mb-2"><DataAgeChip age={dataAge} /></div>
    {/if}
    {#if mcUrl}
      {#if note}<p class="zone-c__note">{note}</p>{/if}
      <MapCompleteLink href={mcUrl} label={mcLabel || $_('popup.editInMapComplete')} />
    {/if}
  </section>
{/if}

<style>
  .zone-c {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
  }
  .info-label {
    display: block;
    color: #9ca3af;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .fact-item { display: flex; flex-direction: column; gap: 1px; }
  .fact-value { font-size: 13px; color: #1f2937; }
  .contact-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .contact-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--color-primary);
    text-decoration: none;
    min-width: 0;
  }
  .contact-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .contact-link:hover { text-decoration: underline; }
  .contact-link--plain { color: #1f2937; cursor: default; }
  .contact-link--plain:hover { text-decoration: none; }
  .zone-c__note {
    font-size: 12px;
    color: #6b7280;
    margin: 0 0 0.5rem;
  }
</style>
