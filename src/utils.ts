// utils.ts
import axios from 'axios';
import cheerio from 'cheerio';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const getKoreanTime = (): string => {
  return dayjs().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
};

export const updateImageUrlType = (url: string, newType: string): string => {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('type', newType);
    return parsedUrl.toString();
  } catch (error) {
    console.error('URL 수정 오류:', error);
    return url;
  }
};

const isKoreanHoliday = async (date: string): Promise<boolean> => {
  try {
    const year = date.split('-')[0]; // 연도 추출
    const month = date.split('-')[1]; // 월 추출
    const response = await axios.get(
      `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo`,
      {
        params: {
          solYear: year,
          solMonth: month,
          ServiceKey: process.env.HOLIDAY_API_KEY as string,
          _type: 'json'
        },
      }
    );

    const items = response.data.response.body.items?.item;
    const holidays = Array.isArray(items) ? items : items ? [items] : [];
    const formattedDate = parseInt(date.replace(/-/g, ''));

    return holidays.some(
      (holiday: any) => holiday.locdate === formattedDate
    );
  } catch (error) {
    console.error('공휴일 확인 중 오류 발생:', error);
    return false;
  }
};

const checkHoliday = async () => {

  const today = dayjs().tz('Asia/Seoul');
  const formattedToday = today.format('YYYY-MM-DD');

  const isHoliday = await isKoreanHoliday(formattedToday);
  if(!isHoliday){
    console.log('한국 공휴일이 아닙니다.')
  }
  const isWeekend = today.day() === 0 || today.day() === 6;

  return isHoliday || isWeekend;
};

export const getIframeUrl = async (blogUrl: string): Promise<string | null> => {
  try {
    const response = await axios.get(blogUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const $ = cheerio.load(response.data);
    const iframeSrc = $('iframe#mainFrame').attr('src');
    return iframeSrc ? new URL(iframeSrc, blogUrl).href : null;
  } catch (error) {
    console.error('iframe URL 가져오기 오류:', error);
    return null;
  }
};

export const getFirstImageFromIframe = async (iframeUrl: string): Promise<string | null> => {
  try {
    const response = await axios.get(iframeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const $ = cheerio.load(response.data);
    let firstImageSrc = $('.se-main-container img').first().attr('src') || $('img').first().attr('data-src');
    if (!firstImageSrc) return null;
    if (firstImageSrc.startsWith('//')) return `https:${firstImageSrc}`;
    if (firstImageSrc.startsWith('/')) return new URL(firstImageSrc, iframeUrl).href;
    return firstImageSrc;
  } catch (error) {
    console.error('이미지 가져오기 오류:', error);
    return null;
  }
};

export const getImageUrl = async (blogUrl: string): Promise<string | null> => {
  const iframeUrl = await getIframeUrl(blogUrl);
  return iframeUrl ? await getFirstImageFromIframe(iframeUrl) : null;
};

export const sendMessageToSlack = async (channel: string, text: string, imageUrl: string) => {
  try {
    const payload = {
      channel,
      text,
      attachments: [{ image_url: imageUrl, text: '네이버 블로그 이미지' }],
    };
    await axios.post('https://slack.com/api/chat.postMessage', payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
    });
  } catch (error) {
    console.error('Slack 전송 오류:', error);
  }
};

export const sendDailyMenu = async () => {
  console.log(`현재 한국 시간: ${dayjs().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')}`);

  const isHoliday = await checkHoliday()
  if (isHoliday) {
    console.log('오늘은 공휴일입니다. 메시지를 전송하지 않습니다.');
    return;
  }
  const text = '🍱 오늘의 밥플러스 메뉴입니다! 🍱';
  const blogUrl = 'https://blog.naver.com/babplus123/221697747131';
  const imageUrl = await getImageUrl(blogUrl);
  if(imageUrl) {
    await sendMessageToSlack(process.env.SLACK_CHANNEL_ID as string, text, imageUrl);
  }
};
