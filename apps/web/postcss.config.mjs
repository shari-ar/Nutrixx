const isProduction = process.env.NODE_ENV === 'production';

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {
      optimize: isProduction ? { minify: true } : false,
    },
  },
};

export default config;
