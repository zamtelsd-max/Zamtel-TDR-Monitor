/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        zamtel: {
          green:        '#00843D',
          'green-dark': '#006830',
          'green-light':'#00A84F',
          pink:         '#E4007C',
          'pink-dark':  '#B8005E',
          'pink-light': '#FF1A94',
          dark:         '#0D1B12',
          white:        '#FFFFFF',
          gray:         '#F5F5F5',
          'gray-mid':   '#9CA3AF',
          // legacy aliases so old classes don't break during transition
          red:          '#E4007C',
          'red-dark':   '#B8005E',
          'red-light':  '#FF1A94',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'skeleton':   'skeleton 1.5s ease-in-out infinite',
      },
      keyframes: {
        skeleton: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.5' },
        },
      },
    },
  },
  plugins: [],
};
