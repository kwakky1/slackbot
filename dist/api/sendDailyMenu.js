"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../utils");
exports.default = async (req, res) => {
    try {
        await (0, utils_1.sendDailyMenu)();
        res.status(200).send('크론 작업 완료!');
    }
    catch (error) {
        res.status(500).send('크론 작업 중 오류 발생!');
    }
};
