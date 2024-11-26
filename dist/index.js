"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cheerio = __importStar(require("cheerio"));
const axios = require('axios');
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// 미들웨어 설정
app.use(express_1.default.urlencoded({ extended: true })); // urlencoded 미들웨어 설정
app.use(express_1.default.json()); // JSON 데이터 처리
const updateImageUrlType = (url, newType) => {
    try {
        const parsedUrl = new URL(url);
        parsedUrl.searchParams.set('type', newType);
        return parsedUrl.toString();
    }
    catch (error) {
        console.error('URL을 수정하는 중 오류 발생:', error);
        return url;
    }
};
const getIframeUrl = async (blogUrl) => {
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
    }
    catch (error) {
        console.error('iframe URL을 가져오는 중 오류 발생:', error);
        return null;
    }
};
const getFirstImageFromIframe = async (iframeUrl) => {
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
        }
        else if (firstImageSrc.startsWith('/')) {
            const baseUrl = new URL(iframeUrl).origin;
            firstImageSrc = baseUrl + firstImageSrc;
        }
        console.log(`iframe 내부 첫 번째 이미지 URL: ${firstImageSrc}`);
        return firstImageSrc;
    }
    catch (error) {
        console.error('iframe 내부 이미지를 가져오는 중 오류 발생:', error);
        return null;
    }
};
const getImageUrl = async (blogUrl) => {
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
    }
    catch (error) {
        console.error('이미지 URL을 가져오는 중 오류 발생:', error);
        return null;
    }
};
const sendMessageToSlack = async (channel, text, imageUrl) => {
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
        }
        else {
            console.log('Slack 메시지 전송 성공:', response.data);
        }
    }
    catch (error) {
        console.error('Slack 메시지 전송 중 오류 발생:', error);
    }
};
app.post('/slack/command', async (req, res) => {
    const { command, text, channel_id, channel_name } = req.body;
    const blogUrl = 'https://blog.naver.com/babplus123/221697747131';
    if (command === '/밥플러스메뉴') {
        const imageUrl = await getImageUrl(blogUrl);
        if (channel_name === 'directmessage' || channel_id.startsWith('D')) {
            console.log('DM에서 명령어 실행');
        }
        else {
            if (imageUrl) {
                await sendMessageToSlack(channel_id, '밥플러스 메뉴입니다!', imageUrl);
                res.status(200).send('이미지를 전송했습니다!');
            }
            else {
                res.status(500).send('이미지를 가져오지 못했습니다.');
            }
        }
    }
    else {
        res.status(400).send('알 수 없는 명령어입니다.');
    }
});
// 기본 라우트
app.post('/', (req, res) => {
    const { type, challenge } = req.body;
    if (type === 'url_verification') {
        res.status(200).send(challenge); // challenge 값을 그대로 반환
    }
    // 다른 이벤트 처리
    res.status(200).send('hello world'); // Slack에 성공적으로 응답
});
app.get('/', (req, res) => {
    res.status(200).send('Hello World!');
});
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}
module.exports = app;
