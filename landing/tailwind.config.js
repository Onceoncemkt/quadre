/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        quadre: {
          ink: '#101613',
          green: '#0E8A57',
          reward: '#C1FF72',
          paper: '#F7F7F2',
          danger: '#E4573D',
        },
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['"Spline Sans Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        ticket: '0 10px 30px rgba(16, 22, 19, 0.08)',
      },
    },
  },
  plugins: [],
}

