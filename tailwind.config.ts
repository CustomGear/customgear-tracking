import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
        },
        accent: {
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
        },
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #7c3aed 0%, #0ea5e9 100%)",
        "gradient-hero": "linear-gradient(135deg, #4c1d95 0%, #0284c7 50%, #0c4a6e 100%)",
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "pulse-soft": "pulse 3s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

