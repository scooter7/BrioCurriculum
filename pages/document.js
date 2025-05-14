// File: pages/_document.js

import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps };
  }

  render() {
    return (
      <Html lang="en"> {/* Set the language attribute for the document */}
        <Head>
          {/* Meta tags for character set and viewport are automatically added by Next.js,
            but you can add other global meta tags here.
            Example: <meta name="description" content="Curriculum Alignment Platform" />
          */}

          {/* Link to Google Fonts (from the prototype) */}
          <link
            href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Open+Sans:wght@400;600&family=Roboto:wght@400;500&family=Inter:wght@400;500;600&display=swap"
            rel="stylesheet"
          />
          {/* Favicon link (assuming it's in the public folder) */}
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <body>
          <Main /> {/* This is where the page content from _app.js and your pages will be injected */}
          <NextScript /> {/* This is where Next.js scripts are injected */}
        </body>
      </Html>
    );
  }
}

export default MyDocument;
