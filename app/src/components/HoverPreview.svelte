<script>
  import { cn } from '../lib/utils.js';
  import { getPlaygroundTitle } from '../lib/playgroundHelpers.js';
  import { MapPin, Droplets, Baby, TreeDeciduous } from 'lucide-svelte';

  /** @type {{ x: number, y: number } | null} */
  export let position = null;
  /** @type {Object | null} */
  export let feature = null;

  $: attr = feature?.getProperties() ?? null;
  $: title = attr ? getPlaygroundTitle(attr) : '';
  $: isWater = attr?.is_water;
  $: hasTrees = attr?.tree_count > 0;
  $: forBaby = attr?.for_baby;
  $: area = attr?.area > 0 ? `${Math.round(attr.area / 10) * 10 || attr.area} m²` : null;

  // Position the card above or below based on viewport
  $: style = position ? `left: ${position.x}px; top: ${position.y}px;` : '';
</script>

{#if position && attr}
  <div
    class={cn(
      'fixed z-[60] pointer-events-none',
      'animate-in fade-in-0 zoom-in-95 duration-150'
    )}
    style={style}
  >
    <div class="relative -translate-x-1/2 -translate-y-full -mt-3">
      <!-- Card -->
      <div class="bg-card rounded-lg shadow-lg border border-border p-3 min-w-[180px] max-w-[240px]">
        <!-- Title -->
        <h4 class="font-semibold text-sm text-foreground leading-tight mb-1.5 line-clamp-2">
          {title}
        </h4>

        <!-- Tags row -->
        <div class="flex flex-wrap gap-1.5 mb-2">
          {#if isWater}
            <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-water/15 text-water">
              <Droplets class="h-3 w-3" />
              Wasser
            </span>
          {/if}
          {#if forBaby}
            <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
              <Baby class="h-3 w-3" />
              Baby
            </span>
          {/if}
          {#if hasTrees}
            <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-nature/15 text-nature">
              <TreeDeciduous class="h-3 w-3" />
              Bäume
            </span>
          {/if}
        </div>

        <!-- Meta row -->
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin class="h-3 w-3 shrink-0" />
          {#if area}
            <span>{area}</span>
          {:else}
            <span>Spielplatz</span>
          {/if}
        </div>
      </div>

      <!-- Arrow pointing down -->
      <div class="absolute left-1/2 -translate-x-1/2 -bottom-2">
        <div class="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-card drop-shadow-sm"></div>
      </div>
    </div>
  </div>
{/if}

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
