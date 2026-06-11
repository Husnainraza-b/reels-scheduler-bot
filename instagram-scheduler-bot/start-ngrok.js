const ngrok = require('ngrok');
(async function() {
  try {
    const url = await ngrok.connect(3000);
    console.log(url);
  } catch (e) {
    console.error(e);
  }
})();
