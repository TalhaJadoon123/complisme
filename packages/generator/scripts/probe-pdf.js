// Diagnostic: try to launch the local Chrome through Puppeteer and print the
// exact failure, so PDF problems can be separated from template problems.
const puppeteer = require('puppeteer');

async function main() {
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    'C:/Users/3tee system/.cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe';
  console.log('launching', executablePath);
  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      timeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--window-size=1280,1024',
      ],
    });
    const page = await browser.newPage();
    await page.setContent('<html><body><h1>hello</h1></body></html>', { waitUntil: 'domcontentloaded' });
    const bytes = await page.pdf({ format: 'A4' });
    console.log('PDF ok, bytes:', Buffer.from(bytes).length);
    await browser.close();
  } catch (error) {
    console.error('launch failed:', error.message);
    process.exitCode = 1;
  }
}

main();