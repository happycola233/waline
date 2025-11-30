// 改编自 https://github.com/wuziqian211/website-api

export const config = { runtime: 'edge' };

import { Redis } from '@upstash/redis';
import friends from '../assets/friends.json' assert { type: 'json' };

const toHTTPS = targetUrl => { // 将网址协议改成 HTTPS
  if (!targetUrl) return 'data:,';
  const urlObj = URL.parse(targetUrl);
  if (urlObj) {
    urlObj.protocol = 'https:';
    return urlObj.href;
  } else {
    return targetUrl;
  }
};
const shuffleArray = array => { // 使用 Fisher-Yates 洗牌算法对数组进行排序
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
const JSONParse = text => { // 解析 JSON（过大或过小的数字将会被转换成 BigInt 或文本）
  if (typeof text !== 'string') return text;
  return JSON.parse(text, (key, value, { source }) => typeof value === 'number' && (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) ? /^-?(?:[1-9]\d*|0)$/.test(source) ? BigInt(source) : source : value);
};
const callAPI = async (requestUrl, options = {}) => { // 发送请求到服务器
  const urlObj = new URL(requestUrl), method = typeof options.method === 'string' ? options.method.toUpperCase() : 'GET',
        headers = new Headers({ Cookie: `SESSDATA=${process.env.SESSDATA}; bili_jct=${process.env.csrf}`, Origin: 'https://www.bilibili.com', Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' }),
        retries = options.retries === true ? 3 : options.retries === false ? 1 : options.retries ?? (['GET', 'HEAD', 'OPTIONS'].includes(method) ? 3 : 1); // 重试次数

  if (options.params) { // 请求参数
    for (const [name, value] of Object.entries(options.params)) {
      urlObj.searchParams.set(name, String(value));
    }
  }
  if (options.headers) { // 请求标头
    for (const [name, value] of Object.entries(options.headers)) {
      headers.set(name, value);
    }
  }

  for (let i = 1; i <= retries; i++) { // 多次尝试请求，若请求失败，则再次请求
    try {
      const resp = await fetch(urlObj, { method, headers, body: options.body ?? null, keepalive: true, signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new TypeError(`HTTP status: ${resp.status}`); // 服务器返回了表示错误的 HTTP 状态码

      const json = JSONParse(await resp.text());
      if ([-351, -352, -401, -412, -509, -799].includes(json.code)) throw new TypeError(`Response code: ${json.code}`); // 请求被拦截
      return json;
    } catch (e) {
      if (i < retries) { // 请求次数小于尝试次数，就在 1 秒后再次尝试请求
        await new Promise(r => { setTimeout(r, 1000); });
      } else { // 请求次数已经达到了尝试次数，就结束请求
        throw e;
      }
    }
  }
  throw new TypeError('fetch failed'); // 理论上，如果 retries 参数有效，就永远无法执行这行代码
};

export default async req => {
  const params = new URL(req.url).searchParams, headers = new Headers();
  try {
    switch (params.get('id')) {
      case 'friends': {
        const restUsers = friends.map(c => c.link_list.filter(l => typeof l === 'number')).flat(), usersInfo = [];
        while (restUsers.length) {
          usersInfo.push(...(await callAPI('https://api.vc.bilibili.com/account/v1/user/cards', { params: { uids: restUsers.splice(0, 50).join(',') } })).data);
        }
        for (const c of friends) {
          for (let i = 0; i < c.link_list.length; i++) {
            if (typeof c.link_list[i] === 'number') {
              const u = usersInfo.find(u => u.mid === c.link_list[i]);
              if (u) {
                c.link_list[i] = { name: u.name, link: `https://space.bilibili.com/${u.mid}`, avatar: toHTTPS(u.face), descr: u.sign };
              }
            }
          }
          shuffleArray(c.link_list);
        }
        headers.set('Cache-Control', 's-maxage=600, stale-while-revalidate');
        return Response.json(friends, { status: 200, headers });
      }
      case 'qmimg': {
        const hash = params.get('h');
        if (hash && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(hash)) {
          const redis = Redis.fromEnv(), hashes = await redis.get('hashes');
          const hashInfo = hashes.find(h => h.h === hash);
          if (hashInfo) {
            const resp = await fetch(`https://q1.qlogo.cn/headimg_dl?dst_uin=${hashInfo.s}&spec=4`);
            if (resp.ok) {
              headers.set('Cache-Control', 's-maxage=600, stale-while-revalidate=3000');
              headers.set('Content-Type', resp.headers.get('Content-Type'));
              return new Response(resp.body, { status: 200, headers });
            } else {
              return Response.json({ code: -404, message: 'cannot fetch image', data: null }, { status: 404, headers });
            }
          } else {
            return Response.json({ code: -404, message: 'hash not found', data: null }, { status: 404, headers });
          }
        } else {
          return Response.json({ code: -400, message: '请求错误', data: null }, { status: 400, headers });
        }
      }
      default: 
        return Response.json({ code: -400, message: '请求错误', data: null }, { status: 400, headers });
    }
  } catch (e) {
    return Response.json({ code: -500, message: e instanceof Error ? e.message : String(e), data: null }, { status: 500, headers });
  }
};
