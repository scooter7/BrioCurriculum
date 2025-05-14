// File: pages/_app.js
import '../styles/globals.css';
// MainLayout is now rendered by individual pages if they need this specific layout
// or a more generic MainLayout can be used here if some pages don't need these specific props.

function MyApp({ Component, pageProps }) {
  // If MainLayout is consistently used by all pages and always needs these props,
  // this structure is fine. Otherwise, pages manage their own layout.
  // For this app, most authenticated views will use MainLayout.
  return <Component {...pageProps} />;
}

export default MyApp;
