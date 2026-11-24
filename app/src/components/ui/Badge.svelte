<script>
  import { cn } from '../../lib/utils.js';

  /** @type {'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'successSoft' | 'dangerSoft' | 'neutralSoft' | 'privateSoft' | 'customersSoft'} */
  export let variant = 'default';
  let className = '';
  export { className as class };

  const baseStyles = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[13px] font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  const variants = {
    default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
    secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
    outline: 'text-foreground',
    success: 'border-transparent bg-success/15 text-success',
    warning: 'border-transparent bg-warning/15 text-warning',
    // Soft chip variants (status pills), from the palette tokens (#1081): a
    // white pill with green ink on the tinted page for facts, the chip tint
    // for positive states.
    info: 'py-[3px] cursor-default border-chip-line bg-surface text-chip-foreground',
    successSoft: 'py-[3px] border-chip-line bg-chip text-chip-foreground',
    dangerSoft: 'py-[3px] border-[rgba(239,68,68,0.4)] bg-[#fef2f2] text-[#b91c1c]',
    // Slate, deliberately not dangerSoft: used for surveyed-but-absent facts,
    // which are information rather than a problem with the playground.
    neutralSoft: 'py-[3px] border-border bg-muted text-muted-foreground',
    // Access (#1002): the same grey and amber as the pin's badges. Private is
    // the stronger grey on purpose — it is the one that rules a trip out.
    privateSoft: 'py-[3px] border-[rgba(55,65,81,0.45)] bg-[#e5e7eb] text-[#1f2937]',
    customersSoft: 'py-[3px] border-[rgba(180,83,9,0.4)] bg-[#fffbeb] text-[#92400e]',
  };

  $: classes = cn(baseStyles, variants[variant], className);
</script>

<span class={classes} {...$$restProps}>
  <slot />
</span>
