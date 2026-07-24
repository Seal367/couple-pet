// 测试数据库连接 - 请替换 DATABASE_URL 环境变量
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('请设置 DATABASE_URL 环境变量');
  console.error('export DATABASE_URL="postgresql://..."');
  process.exit(1);
}

console.log('正在测试数据库连接...');
console.log('URL:', url.replace(/\/\/.*@/, '//***:***@')); // 隐藏密码

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

pool.query('SELECT NOW() as time')
  .then(result => {
    console.log('✅ 数据库连接成功！');
    console.log('服务器时间:', result.rows[0].time);
    return pool.end();
  })
  .catch(err => {
    console.error('❌ 数据库连接失败:', err.message);
    process.exit(1);
  });
