<script>
  // Zone A pills (#1077): only facts that change the decision and that
  // someone recorded. Unknown stays silent; a surveyed negative is a neutral
  // pill, not a warning. Order: age first (positive, concerns many), then
  // shade, wheelchair, fenced, dogs.
  import { _ } from 'svelte-i18n';
  import { Accessibility, Fence, TreeDeciduous, Dog } from 'lucide-svelte';
  import Badge from '../ui/Badge.svelte';
  import { shadeState } from '../../lib/shade.js';

  /** @type {{ attr: Object }} */
  let { attr } = $props();

  const shade = $derived(shadeState(attr));
  const fenced = $derived(attr?.has_fence === true);
  const dogs = $derived(attr?.has_dogs === true);
  const wheelchair = $derived(attr?.wheelchair_play ?? null);
  const baby = $derived(attr?.for_baby === true);
  const toddler = $derived(attr?.for_toddler === true);
  const any = $derived(baby || toddler || fenced || dogs || shade !== null || wheelchair === 'yes' || wheelchair === 'no');

  const SHADE = {
    yes:     { key: 'details.shaded',       variant: 'successSoft' },
    partial: { key: 'panel.partlyShaded',   variant: 'successSoft' },
    no:      { key: 'details.notShaded',    variant: 'neutralSoft' },
  };
</script>

{#if any}
  <div class="pill-row" data-testid="pill-row">
    {#if baby}
      <Badge variant="info" class="gap-[5px] whitespace-nowrap" data-pill="baby">
        <span aria-hidden="true">👶</span>{$_('panel.age.baby')}
      </Badge>
    {/if}
    {#if toddler}
      <Badge variant="info" class="gap-[5px] whitespace-nowrap" data-pill="toddler">
        <span aria-hidden="true">🧒</span>{$_('panel.age.toddler')}
      </Badge>
    {/if}
    {#if shade}
      <Badge variant={SHADE[shade].variant} class="gap-[5px] whitespace-nowrap" data-pill="shade" data-shade={shade}>
        <TreeDeciduous class="h-3 w-3" aria-hidden="true" />{$_(SHADE[shade].key)}
      </Badge>
    {/if}
    <!-- Tri-state: a badge when suitable equipment is tagged, a plain note
         when someone surveyed and found none, nothing at all when no play
         device carries a wheelchair tag. The third case is unknown, not a
         negative, and must not read as one. -->
    {#if wheelchair === 'yes'}
      <Badge variant="info" class="gap-[5px] whitespace-nowrap" data-pill="wheelchair">
        <Accessibility class="h-3 w-3" aria-hidden="true" />{$_('details.wheelchairPlay')}
      </Badge>
    {:else if wheelchair === 'no'}
      <Badge variant="neutralSoft" class="gap-[5px] whitespace-nowrap" data-pill="wheelchair">
        <Accessibility class="h-3 w-3" aria-hidden="true" />{$_('details.wheelchairPlayNone')}
      </Badge>
    {/if}
    {#if fenced}
      <Badge variant="info" class="gap-[5px] whitespace-nowrap" data-pill="fenced">
        <Fence class="h-3 w-3" aria-hidden="true" />{$_('panel.fenced')}
      </Badge>
    {/if}
    <!-- Only dog=yes: dogs are banned on most playgrounds, so the useful
         signal is for dog owners looking for a place for dog and child. -->
    {#if dogs}
      <Badge variant="info" class="gap-[5px] whitespace-nowrap" data-pill="dogs">
        <Dog class="h-3 w-3" aria-hidden="true" />{$_('panel.dogsAllowed')}
      </Badge>
    {/if}
  </div>
{/if}

<style>
  .pill-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 0.75rem;
  }
</style>
