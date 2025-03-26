// bot.js
// Gerekli kütüphaneleri import et
require('dotenv').config();
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const ccxt = require('ccxt');
const technicalIndicators = require('technicalindicators');

// --- Konfigürasyon ve Ortam Değişkenleri ---
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

// --- YENİ: Analiz için Aday Coin Listesi ---
// Binance'teki popüler USDT paritelerinden bir liste (kendi listenizi oluşturabilirsiniz)
const CANDIDATE_ASSETS = [
    "BTC/USDT", "ETH/USDT", "BNB/USDT", "SOL/USDT", "XRP/USDT",
    "DOGE/USDT", "ADA/USDT", "SHIB/USDT", "AVAX/USDT", "TRX/USDT",
    "DOT/USDT", "LINK/USDT", "MATIC/USDT", "LTC/USDT", "ICP/USDT",
    "BCH/USDT", "NEAR/USDT", "UNI/USDT", "APT/USDT", "FIL/USDT"
];
const NUM_ASSETS_TO_SELECT = 3; // Her döngüde kaç coin seçileceği
const ANALYSIS_TIMEFRAME = "15m"; // Seçilen coinler için kullanılacak zaman aralığı

// Gerekli ortam değişkenlerinin varlığını kontrol et
if (!GOOGLE_API_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    console.error("Hata: Lütfen .env dosyasında GOOGLE_API_KEY, TELEGRAM_BOT_TOKEN ve TELEGRAM_CHANNEL_ID değişkenlerini ayarlayın.");
    process.exit(1);
}

// --- İstemcileri Başlat ---
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ /* ... önceki model ayarları ... */
    model: "gemini-2.5-pro-experimental-03-25",
    generationConfig: { temperature: 0.7, topP: 0.95, topK: 40, maxOutputTokens: 2048 },
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ]
});
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

// --- Çekirdek Fonksiyonlar ---

// getMarketDataAndIndicators fonksiyonu öncekiyle aynı kalır
async function getMarketDataAndIndicators(asset = "BTC/USDT", timeframe = "1h", limit = 100) {
    // ... (önceki kodla aynı, hata logları vb. dahil) ...
    const functionName = `getMarketDataAndIndicators(${asset}, ${timeframe})`;
    console.log(`[${new Date().toISOString()}] Starting: ${functionName}`);
    try {
        const exchange = new ccxt.binance({ 'enableRateLimit': true });
        const minCandlesRequired = 50;
        const fetchLimit = Math.max(limit, minCandlesRequired + 5);
        console.log(`[${new Date().toISOString()}] Fetching ${fetchLimit} candles for ${asset} (${timeframe}) from Binance...`);
        const ohlcv = await exchange.fetchOHLCV(asset, timeframe, undefined, fetchLimit);
        if (!ohlcv || ohlcv.length < minCandlesRequired) throw new Error(`Yetersiz OHLCV verisi. Alınan: ${ohlcv?.length ?? 0}, Gerekli: ${minCandlesRequired}`);
        console.log(`[${new Date().toISOString()}] Fetched ${ohlcv.length} candles.`);
        const closes = ohlcv.map(c => c[4]);
        const highs = ohlcv.map(c => c[2]);
        const lows = ohlcv.map(c => c[3]);
        const currentPrice = closes[closes.length - 1];
        console.log(`[${new Date().toISOString()}] Calculating indicators...`);
        const rsiInput = { values: closes, period: 14 }; const rsiResult = technicalIndicators.RSI.calculate(rsiInput);
        const macdInput = { values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }; const macdResult = technicalIndicators.MACD.calculate(macdInput);
        const sma50Input = { values: closes, period: 50 }; const sma50Result = technicalIndicators.SMA.calculate(sma50Input);
        const bbandsInput = { values: closes, period: 20, stdDev: 2 }; const bbandsResult = technicalIndicators.BollingerBands.calculate(bbandsInput);
        const lastRsi = rsiResult[rsiResult.length - 1]; const lastMacdItem = macdResult[macdResult.length - 1] || {}; const lastSma50 = sma50Result[sma50Result.length - 1]; const lastBbandsItem = bbandsResult[bbandsResult.length - 1] || {};
        const formatValue = (v, d = 2) => (typeof v === 'number' && !isNaN(v) ? parseFloat(v.toFixed(d)) : 'N/A');
        const indicators = {
            Price: formatValue(currentPrice, 2), RSI_14: formatValue(lastRsi, 2), MACD_histogram: formatValue(lastMacdItem.histogram, 4), MACD_signal: formatValue(lastMacdItem.signal, 4),
            SMA_50: formatValue(lastSma50, 2), BB_Upper: formatValue(lastBbandsItem.upper, 2), BB_Lower: formatValue(lastBbandsItem.lower, 2), BB_Middle: formatValue(lastBbandsItem.middle, 2),
        };
        console.log(`[${new Date().toISOString()}] Calculated Indicators:`, indicators);
        console.log(`[${new Date().toISOString()}] Finished: ${functionName}`);
        return indicators;
    } catch (error) { /* ... önceki hata loglama ... */
        console.error(`[${new Date().toISOString()}] Error in ${functionName}:`, error.message);
        if (error instanceof ccxt.NetworkError) console.error('CCXT Network Error Detail:', error);
        else if (error instanceof ccxt.ExchangeError) console.error('CCXT Exchange Error Detail:', error);
        console.log(`[${new Date().toISOString()}] Failed: ${functionName}`);
        return null;
    }
}


// analyzeWithGemini fonksiyonu öncekiyle aynı kalır
async function analyzeWithGemini(asset, timeframe, indicators) {
    // ... (önceki kodla aynı, prompt dahil) ...
    const functionName = `analyzeWithGemini(${asset}, ${timeframe})`;
    console.log(`[${new Date().toISOString()}] Starting: ${functionName}`);
    if (!indicators || Object.values(indicators).every(v => v === 'N/A' || v === null || v === undefined)) { /* ... */ return "Analiz için geçerli indikatör verisi bulunamadı."; }
    const priceVsSMA = (indicators.Price !== 'N/A' && indicators.SMA_50 !== 'N/A') ? (indicators.Price > indicators.SMA_50 ? 'Üstünde' : (indicators.Price < indicators.SMA_50 ? 'Altında' : 'Yakın')) : 'N/A';
    const prompt = `
**Analiz İsteği:** ... (Önceki prompt ile aynı) ...
*   **Varlık:** ${asset}
*   **Zaman Aralığı:** ${timeframe}
... (indikatörler) ...
**Görev:** ... (Önceki görev ile aynı) ...
**İstenen Çıktı Formatı (Markdown):** ... (Önceki format ile aynı) ...
`;
    console.log(`[${new Date().toISOString()}] Sending prompt to Gemini for ${asset}...`);
    try {
        const result = await model.generateContent(prompt); const response = await result.response; const text = response.text();
        console.log(`[${new Date().toISOString()}] Received response from Gemini for ${asset}.`);
        console.log(`[${new Date().toISOString()}] Finished: ${functionName}`);
        return text;
    } catch (error) { /* ... önceki hata loglama ... */
        console.error(`[${new Date().toISOString()}] Error calling Gemini API for ${asset}:`, error.message);
        if (error.response) console.error("Gemini API Error Response:", error.response);
        console.log(`[${new Date().toISOString()}] Failed: ${functionName}`);
        return `⚠️ Gemini analizi sırasında bir hata oluştu: ${error.message}`;
    }
}

// sendTelegramMessage fonksiyonu öncekiyle aynı kalır
async function sendTelegramMessage(message) {
    // ... (önceki kodla aynı, hata loglama dahil) ...
    const functionName = `sendTelegramMessage`;
    console.log(`[${new Date().toISOString()}] Starting: ${functionName} to ${TELEGRAM_CHANNEL_ID}`);
    try {
        await bot.sendMessage(TELEGRAM_CHANNEL_ID, message, { parse_mode: 'Markdown' });
        console.log(`[${new Date().toISOString()}] Message sent successfully.`);
        console.log(`[${new Date().toISOString()}] Finished: ${functionName}`);
    } catch (error) { /* ... önceki hata loglama ... */
        console.error(`[${new Date().toISOString()}] Error sending message to Telegram channel ${TELEGRAM_CHANNEL_ID}:`, error.message);
        if (error.response && error.response.body) console.error("Telegram API Error Body:", error.response.body);
        console.log(`[${new Date().toISOString()}] Failed: ${functionName}`);
    }
}


// mainJob fonksiyonu öncekiyle aynı kalır (tek bir coin için çalışır)
async function mainJob(asset = "BTC/USDT", timeframe = "1h") {
    // ... (önceki kodla aynı, formatlama, uyarılar dahil) ...
    const jobName = `mainJob(${asset}, ${timeframe})`;
    console.log(`\n=== [${new Date().toISOString()}] Starting Cycle: ${jobName} ===`);
    const indicators = await getMarketDataAndIndicators(asset, timeframe);
    if (indicators) {
        const analysisResult = await analyzeWithGemini(asset, timeframe, indicators);
        const priceVsSMA = (indicators.Price !== 'N/A' && indicators.SMA_50 !== 'N/A') ? (indicators.Price > indicators.SMA_50 ? 'Üstünde' : (indicators.Price < indicators.SMA_50 ? 'Altında' : 'Yakın')) : 'N/A';
        const header = `*🔔 ${asset} (${timeframe}) Sinyal Analizi*\n\n*🔸 Fiyat:* ${indicators.Price}\n*📊 Temel Göstergeler:*\n   - RSI(14): ${indicators.RSI_14}\n   - MACD Hist: ${indicators.MACD_histogram}\n   - Fiyat vs SMA(50): ${priceVsSMA}\n   - BB Üst/Alt: ${indicators.BB_Upper} / ${indicators.BB_Lower}\n\n`;
        const aiSection = `*🤖 Gemini AI Değerlendirmesi:*\n${analysisResult}\n\n`;
        const disclaimer = `*⚠️ Yasal Uyarı:* ... (önceki uyarı ile aynı) ...`;
        const fullMessage = header + aiSection + disclaimer;
        await sendTelegramMessage(fullMessage);
    } else {
        console.log(`[${new Date().toISOString()}] İndikatörler alınamadığı için ${asset} (${timeframe}) analizi atlandı.`);
    }
    console.log(`=== [${new Date().toISOString()}] Finished Cycle: ${jobName} ===\n`);
}

// --- YENİ: Coin Seçim Fonksiyonu ---
/**
 * Gemini'ye aday listesinden belirli sayıda coin seçmesini ister.
 * @param {string[]} candidates - Aday coin sembollerinin listesi (örn. ["BTC/USDT", "ETH/USDT"]).
 * @param {number} count - Seçilecek coin sayısı.
 * @returns {Promise<string[]>} Seçilen coin sembollerinin listesi veya boş dizi.
 */
async function selectAssetsWithGemini(candidates, count) {
    const functionName = `selectAssetsWithGemini`;
    console.log(`[${new Date().toISOString()}] Starting: ${functionName}`);

    // Gemini'ye gönderilecek prompt
    const prompt = `
Aşağıdaki kripto para listesinden ${count} adet seç:
[${candidates.join(', ')}]

Seçim Kriterleri:
- Teknik analiz sinyalleri açısından potansiyel olarak ilginç olabilecekleri seçmeye çalış.
- Mümkünse biraz çeşitlilik gösteren bir seçim yap (örn: hepsi aynı türde olmasın).
- Seçimini yaparken sadece genel bilgini kullan, gerçek zamanlı verilere erişimin olmadığını biliyorum.

Görev:
Sadece seçtiğin ${count} adet kripto paranın sembollerini, aralarında virgül olacak şekilde listele. Başka hiçbir açıklama ekleme.
Örnek Çıktı Formatı: BTC/USDT,ETH/USDT,SOL/USDT
    `;

    console.log(`[${new Date().toISOString()}] Sending prompt to Gemini for asset selection...`);
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim(); // Başındaki/sonundaki boşlukları temizle

        console.log(`[${new Date().toISOString()}] Received asset selection from Gemini: "${text}"`);

        // Cevabı parse et ve doğrula
        const selectedAssets = text.split(',')                 // Virgülle ayır
                               .map(s => s.trim().toUpperCase()) // Boşlukları temizle, büyük harfe çevir
                               .filter(s => candidates.includes(s)); // Sadece aday listesinde olanları al

        if (selectedAssets.length === 0) {
            console.warn(`[${new Date().toISOString()}] Gemini geçerli bir coin seçimi döndürmedi veya parse edilemedi. Dönen metin: "${text}"`);
            return []; // Boş dizi dön
        }

        // İstenen sayıda dönmediyse uyar ama olanlarla devam et
        if (selectedAssets.length !== count) {
             console.warn(`[${new Date().toISOString()}] Gemini beklenenden farklı sayıda (${selectedAssets.length}/${count}) coin seçti.`);
        }

        console.log(`[${new Date().toISOString()}] Valid selected assets: [${selectedAssets.join(', ')}]`);
        console.log(`[${new Date().toISOString()}] Finished: ${functionName}`);
        return selectedAssets.slice(0, count); // En fazla istenen sayıda döndür

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error calling Gemini API for asset selection:`, error.message);
        if (error.response) console.error("Gemini API Error Response:", error.response);
        console.log(`[${new Date().toISOString()}] Failed: ${functionName}`);
        return []; // Hata durumunda boş dizi dön
    }
}


// --- Bot Başlatma ve Zamanlama (Güncellendi) ---

console.log("--- Telegram Sinyal Botu Başlatılıyor (AI Seçimli) ---");
// ... (Bot adı, kanal ID, model logları önceki gibi) ...
console.log(`[${new Date().toISOString()}] Candidate Assets: ${CANDIDATE_ASSETS.length} coins`);
console.log(`[${new Date().toISOString()}] Assets to select per cycle: ${NUM_ASSETS_TO_SELECT}`);
console.log(`[${new Date().toISOString()}] Analysis timeframe: ${ANALYSIS_TIMEFRAME}`);


// --- Başlangıçta Hemen Çalıştırma ---
(async () => {
    console.log(`[${new Date().toISOString()}] Running initial analysis cycle on startup...`);

    // 1. Başlangıç için coinleri seç
    const initialSelection = await selectAssetsWithGemini(CANDIDATE_ASSETS, NUM_ASSETS_TO_SELECT);

    // 2. Seçilen coinler için analiz yap
    if (initialSelection.length > 0) {
        console.log(`[${new Date().toISOString()}] Initial selected assets: [${initialSelection.join(', ')}]`);
        for (const asset of initialSelection) {
            // Belirlenen zaman aralığı ile mainJob'u çağır
            await mainJob(asset, ANALYSIS_TIMEFRAME);
        }
    } else {
        console.warn(`[${new Date().toISOString()}] Could not select any assets for initial run.`);
    }

    console.log(`[${new Date().toISOString()}] Initial analysis cycle finished.`);
    console.log("--- Zamanlayıcı Başlatılıyor (10 dakikada bir çalışacak) ---");

    // --- Zamanlayıcı Ayarları (10 Dakikada Bir) ---
    const jobRule = '0 */10 * * * *'; // Her 10 dakikada bir

    const recurringJob = schedule.scheduleJob(jobRule, async () => {
        console.log(`\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
        console.log(`[${new Date().toISOString()}] Scheduled 10-minute analysis cycle starting...`);
        console.log(`>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n`);

        // 1. Periyodik olarak coinleri seç
        const periodicSelection = await selectAssetsWithGemini(CANDIDATE_ASSETS, NUM_ASSETS_TO_SELECT);

        // 2. Seçilen coinler için analiz yap
        if (periodicSelection.length > 0) {
            console.log(`[${new Date().toISOString()}] Periodically selected assets: [${periodicSelection.join(', ')}]`);
            for (const asset of periodicSelection) {
                // Belirlenen zaman aralığı ile mainJob'u çağır
                await mainJob(asset, ANALYSIS_TIMEFRAME);
            }
        } else {
            console.warn(`[${new Date().toISOString()}] Could not select any assets for this cycle.`);
        }
        console.log(`\n<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`);
        console.log(`[${new Date().toISOString()}] Scheduled 10-minute analysis cycle finished.`);
        console.log(`<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n`);
    });

    console.log(`[${new Date().toISOString()}] Scheduled: Recurring analysis | Rule: "${jobRule}" | Next Run: ${recurringJob?.nextInvocation()?.toISOString() ?? 'N/A'}`);
    console.log("--- Zamanlayıcı Başlatıldı. İşlerin çalışması bekleniyor... ---");
    console.log("Botu durdurmak için CTRL+C kullanın.");

})(); // Hemen Çalışan Fonksiyon Bitişi

// Uygulamanın kapanmasını engelle ve düzgün kapatma
process.on('SIGINT', () => {
  console.log(`\n[${new Date().toISOString()}] SIGINT sinyali alındı. Zamanlayıcı durduruluyor...`);
  schedule.gracefulShutdown().then(() => {
    console.log(`[${new Date().toISOString()}] Zamanlayıcı başarıyla durduruldu. Çıkılıyor.`);
    process.exit(0);
  });
});
