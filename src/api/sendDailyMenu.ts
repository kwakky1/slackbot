import { VercelRequest, VercelResponse } from '@vercel/node';
import { sendDailyMenu } from '../utils';

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    await sendDailyMenu();
    res.status(200).send('크론 작업 완료!');
  } catch (error) {
    res.status(500).send('크론 작업 중 오류 발생!');
  }
};
