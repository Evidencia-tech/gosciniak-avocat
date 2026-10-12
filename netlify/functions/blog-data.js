/* Sert /blog-data.js à partir des articles enregistrés par le back-office. */

const { readArticles } = require('../lib/articles');

exports.handler = async (event) => {
  try {
    const articles = await readArticles(event);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
      body: `var articles = ${JSON.stringify(articles, null, 2)};\n`,
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: '' };
  }
};
