<script>
  import { cn } from '../../lib/utils.js';

  /** @type {'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'successSoft' | 'dangerSoft'} */
  export let variant = 'default';
  let className = '';
  export { className as class };

  const baseStyles = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

  const variants = {
    default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
    secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
    outline: 'text-foreground',
    success: 'border-transparent bg-success/15 text-success',
    warning: 'border-transparent bg-warning/15 text-warning',
    // Soft chip variants (status pills): tinted bg + dark text + 3px vertical pad, matching legacy .status-pill design.
    info: 'py-[3px] cursor-default border-[rgba(59,130,246,0.3)] bg-[#eff6ff] text-[#1e40af]',
    successSoft: 'py-[3px] border-[rgba(16,185,129,0.4)] bg-[#ecfdf5] text-[#065f46]',
    dangerSoft: 'py-[3px] border-[rgba(239,68,68,0.4)] bg-[#fef2f2] text-[#b91c1c]',
  };

  $: classes = cn(baseStyles, variants[variant], className);
</script>

<span class={classes} {...$$restProps}>
  <slot />
</span>
