/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#D8B4FE',
          DEFAULT: '#8B5CF6',
          dark: '#7C3AED',
        },
        bg: {
          soft: '#F5F3FF',
        },
        accent: {
          green: '#22C55E',
          yellow: '#FACC15',
        }
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      backgroundImage: {
        'purple-gradient': 'linear-gradient(135deg, #8B5CF6 0%, #D8B4FE 100%)',
      },
      backdropBlur: {
        'xs': '2px',
      }
    },
  },
  plugins: [],
}
