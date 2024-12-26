"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailyMenu = exports.sendMessageToSlack = exports.getImageUrl = exports.getFirstImageFromIframe = exports.getIframeUrl = exports.updateImageUrlType = exports.getKoreanTime = void 0;
// utils.ts
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = __importDefault(require("cheerio"));
const dayjs_1 = __importDefault(require("dayjs"));
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
const timezone_1 = __importDefault(require("dayjs/plugin/timezone"));
dayjs_1.default.extend(utc_1.default);
dayjs_1.default.extend(timezone_1.default);
const getKoreanTime = () => {
    return (0, dayjs_1.default)().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
};
exports.getKoreanTime = getKoreanTime;
const updateImageUrlType = (url, newType) => {
    try {
        const parsedUrl = new URL(url);
        parsedUrl.searchParams.set('type', newType);
        return parsedUrl.toString();
    }
    catch (error) {
        console.error('URL 수정 오류:', error);
        return url;
    }
};
exports.updateImageUrlType = updateImageUrlType;
const isKoreanHoliday = async (date) => {
    try {
        const year = date.split('-')[0]; // 연도 추출
        const month = date.split('-')[1]; // 월 추출
        const response = await axios_1.default.get(`http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`, {
            params: {
                solYear: year,
                solMonth: month,
                ServiceKey: process.env.HOLIDAY_API_KEY,
                _type: 'json'
            },
        });
        const items = response.data.response.body.items?.item;
        const holidays = Array.isArray(items) ? items : items ? [items] : [];
        const formattedDate = parseInt(date.replace(/-/g, ''));
        return holidays.some((holiday) => holiday.locdate === formattedDate);
    }
    catch (error) {
        console.error('공휴일 확인 중 오류 발생:', error);
        return false;
    }
};
const checkHoliday = async () => {
    const today = (0, dayjs_1.default)().tz('Asia/Seoul');
    const formattedToday = today.format('YYYY-MM-DD');
    const isHoliday = await isKoreanHoliday(formattedToday);
    if (!isHoliday) {
        console.log('한국 공휴일이 아닙니다.');
    }
    const isWeekend = today.day() === 0 || today.day() === 6;
    return isHoliday || isWeekend;
};
const getIframeUrl = async (blogUrl) => {
    try {
        const response = await axios_1.default.get(blogUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
            },
        });
        const $ = cheerio_1.default.load(response.data);
        const iframeSrc = $('iframe#mainFrame').attr('src');
        return iframeSrc ? new URL(iframeSrc, blogUrl).href : null;
    }
    catch (error) {
        console.error('iframe URL 가져오기 오류:', error);
        return null;
    }
};
exports.getIframeUrl = getIframeUrl;
const getFirstImageFromIframe = async (iframeUrl) => {
    try {
        const response = await axios_1.default.get(iframeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
            },
        });
        const $ = cheerio_1.default.load(response.data);
        let firstImageSrc = $('.se-main-container img').first().attr('src') || $('img').first().attr('data-src');
        if (!firstImageSrc)
            return null;
        if (firstImageSrc.startsWith('//'))
            return `https:${firstImageSrc}`;
        if (firstImageSrc.startsWith('/'))
            return new URL(firstImageSrc, iframeUrl).href;
        return firstImageSrc;
    }
    catch (error) {
        console.error('이미지 가져오기 오류:', error);
        return null;
    }
};
exports.getFirstImageFromIframe = getFirstImageFromIframe;
const getImageUrl = async (blogUrl) => {
    const iframeUrl = await (0, exports.getIframeUrl)(blogUrl);
    return iframeUrl ? await (0, exports.getFirstImageFromIframe)(iframeUrl) : null;
};
exports.getImageUrl = getImageUrl;
const sendMessageToSlack = async (channel, text, imageUrl) => {
    try {
        const payload = {
            channel,
            text,
            attachments: [{ image_url: imageUrl, text: '네이버 블로그 이미지' }],
        };
        await axios_1.default.post('https://slack.com/api/chat.postMessage', payload, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
            },
        });
    }
    catch (error) {
        console.error('Slack 전송 오류:', error);
    }
};
exports.sendMessageToSlack = sendMessageToSlack;
const sendDailyMenu = async () => {
    console.log(`현재 한국 시간: ${(0, dayjs_1.default)().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')}`);
    const isHoliday = await checkHoliday();
    if (isHoliday) {
        console.log('오늘은 공휴일입니다. 메시지를 전송하지 않습니다.');
        return;
    }
    const text = '🍱 오늘의 밥플러스 메뉴입니다! 🍱';
    const blogUrl = 'https://blog.naver.com/babplus123/221697747131';
    const imageUrl = await (0, exports.getImageUrl)(blogUrl);
    if (imageUrl) {
        await (0, exports.sendMessageToSlack)(process.env.SLACK_CHANNEL_ID, text, imageUrl);
    }
};
exports.sendDailyMenu = sendDailyMenu;
