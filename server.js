// Node.js 18+；仅绑定本机。不要部署到公网。
const http = require('http');
const https = require('https');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL',
  'Access-Control-Allow-Private-Network': 'true'
};
const server = http.createServer((req, res) => {
  const started = Date.now();
  const reply = (status, message) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message } }));
  };
  if (req.url !== '/proxy') return reply(404, '接口不存在');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method !== 'POST') return reply(405, '仅支持 POST');
  let target;
  try {
    target = new URL(req.headers['x-target-url']);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
      throw new Error();
  } catch { return reply(400, '目标地址无效，请填写 HTTP 或 HTTPS URL'); }
  // 不打印查询参数、请求头或请求体，避免日志包含凭据。
  res.on('close', () => console.log(`POST ${target.origin}${target.pathname} ${res.statusCode} ${Date.now() - started}ms`));
  const upstream = (target.protocol === 'https:' ? https : http).request(target, {
    method: 'POST', headers: {
      'Content-Type': req.headers['content-type'] || 'application/json',
      ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {})
    }
  }, response => {
    res.writeHead(response.statusCode, {
      ...cors, 'Content-Type': response.headers['content-type'] || 'application/json',
      ...(response.headers['content-encoding'] ? { 'Content-Encoding': response.headers['content-encoding'] } : {})
    });
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  const timer = setTimeout(() => upstream.destroy(new Error('timeout')), 120000);
  upstream.on('error', error => reply(502, error.message === 'timeout' ? '代理请求超时' : '代理连接失败，请检查地址、网络或 TLS 证书'));
  res.on('close', () => { clearTimeout(timer); upstream.destroy(); });
  req.on('aborted', () => upstream.destroy());
  req.on('error', () => upstream.destroy());
  req.pipe(upstream);
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
  console.log(`本地代理：http://localhost:${server.address().port}/proxy（不记录密钥）`);
});
server.on('error', error => { console.error(`启动失败：${error.code}`); process.exitCode = 1; });
