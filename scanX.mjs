import puppeteer from 'puppeteer'
import fetch from 'node-fetch'
import fs from 'fs'
import os from 'os'

/* ================= CONFIG ================= */

const TARGET_USERNAME = 'only__dylan'

const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN'

const TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID'

const CHROME_PATH =
  os.platform() === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/* ========================================== */

const TARGET_URL = `https://x.com/${TARGET_USERNAME}/followers`

const SCAN_INTERVAL = 10 * 60 * 1000
const LOGIN_WAIT = 60 * 1000

const PROFILE_DIR = './chrome_profile'
const DATA_FILE = `followers_${TARGET_USERNAME}.json`

let HEADLESS = process.env.HEADLESS === '1'

let browser
let page

const sleep = ms => new Promise(r => setTimeout(r, ms))

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`)
}

async function sendTelegram(text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML'
    })
  })
}

function loadOldFollowers() {
  if (!fs.existsSync(DATA_FILE)) return null
  const raw = fs.readFileSync(DATA_FILE)
  return JSON.parse(raw).followers
}

function saveFollowers(list) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ timestamp: Date.now(), followers: list }, null, 2)
  )
}

async function launchBrowser() {
  browser = await puppeteer.launch({
    headless: HEADLESS,
    userDataDir: PROFILE_DIR,
    executablePath: CHROME_PATH
  })

  page = await browser.newPage()
}

async function scanFollowers() {
  await page.goto(TARGET_URL)

  await page.waitForSelector('div[data-testid="primaryColumn"]')

  const followers = await page.evaluate(() => {
    const users = new Set()

    document
      .querySelectorAll(
        'div[data-testid="primaryColumn"] div[data-testid="cellInnerDiv"]'
      )
      .forEach(card => {
        const link = card.querySelector('a[href^="/"]')
        if (!link) return

        const username = link.getAttribute('href').replace('/', '').trim()

        if (username && !username.includes('/')) {
          users.add(username)
        }
      })

    return [...users]
  })

  return followers
}

function diffFollowers(oldList, newList) {
  const oldSet = new Set(oldList)

  return {
    added: newList.filter(u => !oldSet.has(u))
  }
}

async function loop() {
  while (true) {
    const oldFollowers = loadOldFollowers()

    const newFollowers = await scanFollowers()

    if (!oldFollowers) {
      saveFollowers(newFollowers)

      await sendTelegram(
        `Initial followers for ${TARGET_USERNAME}: ${newFollowers.length}`
      )
    } else {
      const { added } = diffFollowers(oldFollowers, newFollowers)

      if (added.length) {
        const msg =
          `New followers detected:\n\n` +
          added.map(u => `https://x.com/${u}`).join('\n')

        await sendTelegram(msg)
      }

      saveFollowers(newFollowers)
    }

    log(`sleep ${SCAN_INTERVAL / 60000} minutes`)
    await sleep(SCAN_INTERVAL)
  }
}

;(async () => {
  await launchBrowser()

  await page.goto('https://x.com/login')

  log('login if needed')

  
  await sleep(LOGIN_WAIT)

  await loop()
})()
