// 改编自 https://github.com/wuziqian211/website-api

export const config = { runtime: 'edge' };

import { Redis } from '@upstash/redis';

export default async req => {
  const params = new URL(req.url).searchParams, headers = new Headers();
  try {
    switch (params.get('id')) {
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
