/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        glass: 'var(--glass-bg)',
        'glass-strong': 'var(--glass-bg-strong)',
        accent: 'var(--accent)',
        maa: 'var(--maa)',
        ayushman: 'var(--ayushman)',
        both: 'var(--both)',
        none: 'var(--none)',
      },
      fontFamily: {
        sans: ['-apple-system','BlinkMacSystemFont','SF Pro Display','Inter','system-ui','sans-serif'],
      },
      borderRadius: { glass: '20px', 'glass-lg': '24px' },
      boxShadow: {
        glass: 'inset 0 1px 0 0 var(--glass-highlight), 0 8px 32px -8px var(--glass-shadow)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
