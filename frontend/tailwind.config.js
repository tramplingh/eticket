export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F5FA",
        ink: "#171A3A",
        muted: "#5F6488",
        line: "#DDE0EE",
        brand: { DEFAULT: "#3D3DDB", dark: "#2E2EB8", soft: "#E8E8FB" },
        saffron: { DEFAULT: "#FFB83D", soft: "#FFF1D6" },
        mint: { DEFAULT: "#12A67A", soft: "#DDF5EC" },
        rose: { DEFAULT: "#E0484F", soft: "#FCE6E7" },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Instrument Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
