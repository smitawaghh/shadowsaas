export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        'cyber': {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          900: '#0c4a6e',
        },
        'threat': {
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
        },
        'surface': {
          900: '#060a12',
          800: '#0b1220',
          700: '#0f1929',
          600: '#162035',
        },
      },
      boxShadow: {
        'glow-cyan':   '0 0 20px rgba(34,211,238,0.15), 0 0 40px rgba(34,211,238,0.05)',
        'glow-rose':   '0 0 20px rgba(244,63,94,0.15),  0 0 40px rgba(244,63,94,0.05)',
        'glow-purple': '0 0 20px rgba(167,139,250,0.15),0 0 40px rgba(167,139,250,0.05)',
        'glow-amber':  '0 0 20px rgba(251,191,36,0.15), 0 0 40px rgba(251,191,36,0.05)',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%':   { transform: 'scale(1)',    opacity: '0.6' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'slide-in': {
          '0%':   { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scan-line': {
          '0%':   { backgroundPosition: '0 -100%' },
          '100%': { backgroundPosition: '0 200%' },
        },
      },
      animation: {
        'fade-up':    'fade-up 0.4s ease-out forwards',
        'pulse-ring': 'pulse-ring 1.4s ease-out infinite',
        'slide-in':   'slide-in 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
}
