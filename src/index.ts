import express, {Request, Response} from 'express';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

dayjs.extend(utc);
dayjs.extend(timezone);

// 공휴일 아이템 타입
interface HolidayItem {
  dateKind: string; // 날짜 종류
  dateName: string; // 날짜 이름
  isHoliday: string; // 공휴일 여부 (Y/N)
  locdate: number;   // 날짜 (YYYYMMDD 형식)
  seq: number;       // 순번
}

// API 응답의 body 타입
interface HolidayBody {
  items?: {
    item: HolidayItem[] | HolidayItem; // 아이템이 배열 또는 단일 객체일 수 있음
  };
  numOfRows: number;
  pageNo: number;
  totalCount: number;
}

// API 전체 응답 타입
interface HolidayResponse {
  response: {
    header: {
      resultCode: string; // 결과 코드
      resultMsg: string;  // 결과 메시지
    };
    body: HolidayBody;
  };
}

const getKoreanTime = (): string => {
  return dayjs().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss');
};


// 미들웨어 설정
app.use(express.urlencoded({ extended: true })); // urlencoded 미들웨어 설정
app.use(express.json()); // JSON 데이터 처리

const updateImageUrlType = (url: string, newType: string): string => {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('type', newType);
    return parsedUrl.toString();
  } catch (error) {
    console.error('URL을 수정하는 중 오류 발생:', error);
    return url;
  }
};

const getIframeUrl = async (blogUrl: string): Promise<string | null> => {
  try {
    const response = await axios.get(blogUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const $ = cheerio.load(response.data);

    // iframe의 src 속성 가져오기
    const iframeSrc = $('iframe#mainFrame').attr('src');

    if (!iframeSrc) {
      console.error('iframe URL을 찾을 수 없습니다.');
      return null;
    }

    // 상대 경로를 절대 경로로 변환
    const absoluteIframeUrl = new URL(iframeSrc, blogUrl).href;
    console.log('생성된 iframe 절대 경로:', absoluteIframeUrl);
    return absoluteIframeUrl;
  } catch (error) {
    console.error('iframe URL을 가져오는 중 오류 발생:', error);
    return null;
  }
};

const getFirstImageFromIframe = async (iframeUrl: string): Promise<string | null> => {
  try {
    const response = await axios.get(iframeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    const $ = cheerio.load(response.data);

    // 첫 번째 이미지 태그에서 src 또는 data-src 가져오기
    let firstImageSrc = $('.se-main-container img').first().attr('src') || $('img').first().attr('data-src');

    if (!firstImageSrc) {
      console.error('iframe 내부에서 이미지를 찾을 수 없습니다.');
      return null;
    }

    if (firstImageSrc.startsWith('//')) {
      firstImageSrc = `https:${firstImageSrc}`;
    } else if (firstImageSrc.startsWith('/')) {
      const baseUrl = new URL(iframeUrl).origin;
      firstImageSrc = baseUrl + firstImageSrc;
    }

    console.log(`iframe 내부 첫 번째 이미지 URL: ${firstImageSrc}`);
    return firstImageSrc;
  } catch (error) {
    console.error('iframe 내부 이미지를 가져오는 중 오류 발생:', error);
    return null;
  }
};

const getImageUrl = async (blogUrl: string): Promise<string | null> => {
  try {
    const iframeUrl = await getIframeUrl(blogUrl);
    if (!iframeUrl) {
      console.error('iframe URL을 가져오지 못했습니다.');
      return null;
    }

    const firstImageUrl = await getFirstImageFromIframe(iframeUrl);
    if (!firstImageUrl) {
      console.error('iframe 내부에서 이미지를 가져오지 못했습니다.');
      return null;
    }
    return updateImageUrlType(firstImageUrl, 'w773');
  } catch (error) {
    console.error('이미지 URL을 가져오는 중 오류 발생:', error);
    return null;
  }
};

const sendMessageToSlack = async (channel: string, text: string, imageUrl: string) => {
  try {
    const payload = {
      channel,
      text,
      attachments: [
        {
          fallback: '이미지를 확인하세요.',
          image_url: imageUrl,
          text: '네이버 블로그에서 가져온 이미지입니다.',
        },
      ],
    };

    console.log(payload);

    const response = await axios.post('https://slack.com/api/chat.postMessage', payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
    });

    if (!response.data.ok) {
      console.error('Slack 메시지 전송 실패:', response.data.error);
    } else {
      console.log('Slack 메시지 전송 성공:', response.data);
    }
  } catch (error) {
    console.error('Slack 메시지 전송 중 오류 발생:', error);
  }
};

app.post('/slack/command', async (req: Request, res: Response) => {
  const { command, text, channel_id, channel_name } = req.body;
  const blogUrl = 'https://blog.naver.com/babplus123/221697747131';

  if (command === '/밥플러스메뉴') {
    const imageUrl = await getImageUrl(blogUrl);
    if (channel_name === 'directmessage' || channel_id.startsWith('D')) {
      console.log('DM에서 명령어 실행');
    } else {
      if (imageUrl) {
        await sendMessageToSlack(channel_id, '밥플러스 메뉴입니다!', imageUrl);
        res.status(200).send('이미지를 전송했습니다!');
      } else {
        res.status(500).send('이미지를 가져오지 못했습니다.');
      }
    }
  } else {
    res.status(400).send('알 수 없는 명령어입니다.');
  }
});

const checkHoliday = async () => {

  const today = dayjs().tz('Asia/Seoul');
  const formattedToday = today.format('YYYY-MM-DD');

  const isHoliday = await isKoreanHoliday(formattedToday);
  const isWeekend = today.day() === 0 || today.day() === 6;

  return isHoliday || isWeekend;
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
          ServiceKey: encodeURIComponent(process.env.HOLIDAY_API_KEY as string),
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

// 밥플러스 메뉴 전송 작업
const sendDailyMenu = async () => {
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

// 스케줄링 설정: 오전 10시 30분 & 오후 5시 30분
cron.schedule(
  '30 10 * * *',
  () => {
    console.log(`스케줄 실행 시간: ${dayjs().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')}`);
    sendDailyMenu();
  },
  { scheduled: true, timezone: 'Asia/Seoul' }
);

cron.schedule(
  '30 17 * * *',
  () => {
    console.log(`스케줄 실행 시간: ${dayjs().tz('Asia/Seoul').format('YYYY-MM-DD HH:mm:ss')}`);
    sendDailyMenu();
  },
  { scheduled: true, timezone: 'Asia/Seoul' }
);

// 기본 라우트
app.post('/', (req: Request, res: Response) => {
  const { type, challenge } = req.body;
  if (type === 'url_verification') {
    res.status(200).send(challenge); // challenge 값을 그대로 반환
  }
  // 다른 이벤트 처리
  res.status(200).send('hello world'); // Slack에 성공적으로 응답
});

app.get('/', (req: Request, res: Response) => {
  res.status(200).send('Hello World!');
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;