import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      colors: {
        ink: "#1c1a16",
        paper: "#f5f1ea",
        ember: "#c24b2a",
        ocean: "#2b6f91",
        moss: "#2f5d50",
      },
      boxShadow: {
        soft: "0 20px 50px -30px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
