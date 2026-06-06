/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#171210',
          card: '#211a17',
          elevated: '#2b2320',
          hover: '#322823',
        },
        line: {
          DEFAULT: '#3a302b',
          strong: '#4d4038',
        },
        ink: {
          DEFAULT: '#f5ede6',
          soft: '#cdbfb4',
          dim: '#9a8b7e',
          faint: '#6b5d52',
        },
        accent: {
          DEFAULT: '#f0613d',
          hover: '#d94e2e',
          soft: '#3a221b',
        },
        like: '#4ade80',
        skip: '#f87171',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 30px -12px rgba(0,0,0,0.6)',
        deck: '0 20px 60px -20px rgba(0,0,0,0.75)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}
