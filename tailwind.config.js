/** @type {import('tailwindcss').Config} */

// Tokens are driven by CSS variables defined in src/index.css so the
// accessibility provider can swap entire themes (light / dark /
// high-contrast) at runtime by setting data-* attributes on <html>.
// Every colour below resolves to `rgb(var(--c-…) / <alpha-value>)`,
// which Tailwind expands into a normal Tailwind colour with full
// support for opacity utilities (e.g. `bg-navy-900/50`).
const t = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // We keep the legacy `navy.*` token names so existing
        // component classNames continue to work. The *values* are
        // resolved from CSS variables, which flip between light, dark
        // and high-contrast modes via [data-theme] / [data-high-contrast].
        //
        // Mental model: bigger number = lighter surface, smaller number = darker text.
        navy: {
          975: t('navy-975'), // deepest inset well
          950: t('navy-950'), // App background
          900: t('navy-900'), // Card / surface background
          850: t('navy-850'), // Subtle hover / inset row
          800: t('navy-800'), // Subtle border on cards & inputs
          750: t('navy-750'), // Muted divider / disabled tint
          700: t('navy-700'), // Secondary / muted text
          100: t('navy-100'), // Strong secondary text (labels, captions)
          50:  t('navy-50'),  // Primary body text
        },
        accent: {
          DEFAULT: t('accent'),
          light:   t('accent-light'),
          dark:    t('accent-dark'),
        },
        success: {
          DEFAULT: t('success'),
          light:   t('success-light'),
          dark:    t('success-dark'),
        },
        warning: {
          DEFAULT: t('warning'),
          light:   t('warning-light'),
          dark:    t('warning-dark'),
        },
        danger: {
          DEFAULT: t('danger'),
          light:   t('danger-light'),
          dark:    t('danger-dark'),
        },
      },
      fontFamily: {
        // Inter first — humanist, rounded, highly legible.
        sans: ['"Inter"', '"Nunito"', '"DM Sans"', 'system-ui', 'sans-serif'],
      },
      // Font scale — every step ≥ 14px. The actual rendered size is
      // driven by the html font-size which the AccessibilityProvider
      // bumps via [data-font-size].
      fontSize: {
        'xs':   ['0.875rem', { lineHeight: '1.55' }], // 14px @ root 16px
        'sm':   ['1rem',     { lineHeight: '1.6'  }], // 16px
        'base': ['1.125rem', { lineHeight: '1.7'  }], // 18px (body min)
        'lg':   ['1.25rem',  { lineHeight: '1.6'  }], // 20px
        'xl':   ['1.375rem', { lineHeight: '1.5'  }], // 22px
        '2xl':  ['1.5rem',   { lineHeight: '1.45' }], // 24px
        '3xl':  ['1.75rem',  { lineHeight: '1.35' }], // 28px
        '4xl':  ['2.125rem', { lineHeight: '1.25' }], // 34px
        '5xl':  ['2.5rem',   { lineHeight: '1.2'  }], // 40px
        // Elder-friendly named sizes (kept for back-compat with existing code).
        'elder-sm':   '1rem',
        'elder-base': '1.125rem',
        'elder-lg':   '1.375rem',
        'elder-xl':   '1.75rem',
        'elder-2xl':  '2.25rem',
      },
      lineHeight: {
        relaxed: '1.7',
      },
      maxWidth: {
        '8xl': '88rem',
      },
      borderRadius: {
        'card': '14px',
        'pill': '999px',
      },
      boxShadow: {
        'soft':    'var(--shadow-soft)',
        'card':    'var(--shadow-card)',
        'lifted':  'var(--shadow-lifted)',
        'focus':   '0 0 0 3px rgb(var(--c-accent) / 0.55)',
      },
    },
  },
  plugins: [],
}
