// cloudbase.js — 腾讯云 CloudBase Node SDK 初始化（后端）
const cloudbaseSDK = require("@cloudbase/node-sdk");
require("dotenv").config();

const cloudbase = cloudbaseSDK.init({
  env: process.env.CLOUDBASE_ENV_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY,
});

module.exports = { cloudbase };
