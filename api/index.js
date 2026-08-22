import crypto from 'node:crypto';
import md5 from 'md5';
import { waitUntil } from '@vercel/functions';
import { Redis } from '@upstash/redis';
import Waline from '@waline/vercel';

export default Waline({
  plugins: [
    {
      middlewares: [
        async (ctx, next) => { // 改编自 https://github.com/wuziqian211/website-api
          if (ctx.path.toLowerCase() !== '/api/modules' || ctx.method.toUpperCase() !== 'GET') {
            return next();
          }
          try {
            switch (ctx.param('id')) {
              case 'qmimg': {
                const hash = ctx.param('h');
                if (hash && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(hash)) {
                  const redis = Redis.fromEnv(), hashes = await redis.get('hashes');
                  const hashInfo = hashes.find(h => h.h === hash);
                  if (hashInfo) {
                    const resp = await fetch(`https://q1.qlogo.cn/headimg_dl?dst_uin=${hashInfo.s}&spec=4`);
                    if (resp.ok) {
                      ctx.set('Cache-Control', 's-maxage=600, stale-while-revalidate=3000');
                      ctx.set('Content-Type', resp.headers.get('Content-Type'));
                      ctx.body = resp.body;
                    } else {
                      ctx.status = 404;
                      ctx.set('Content-Type', 'application/json');
                      ctx.body = JSON.stringify({ code: -404, message: 'cannot fetch image', data: null });
                    }
                  } else {
                    ctx.status = 404;
                    ctx.set('Content-Type', 'application/json');
                    ctx.body = JSON.stringify({ code: -404, message: 'hash not found', data: null });
                  }
                } else {
                  ctx.status = 400;
                  ctx.set('Content-Type', 'application/json');
                  ctx.body = JSON.stringify({ code: -400, message: '请求错误', data: null });
                }
              }
              default: 
                ctx.status = 400;
                ctx.set('Content-Type', 'application/json');
                ctx.body = JSON.stringify({ code: -400, message: '请求错误', data: null });
            }
          } catch (e) {
            ctx.status = 500;
            ctx.set('Content-Type', 'application/json');
            ctx.body = JSON.stringify({ code: -500, message: e instanceof Error ? e.message : String(e), data: null });
          }
        }
      ],
    },
  ],
  async preSave(comment) { // 在保存评论数据前
    if (comment.link && /^\d+$/.test(comment.link.trim())) { // 若输入的链接为纯数字，就将其视为 B 站 UID，并将链接修改为 B 站个人空间网址
      comment.link = 'https://space.bilibili.com/' + comment.link.trim();
    }
    if (comment.link && (!comment.nick?.trim() || comment.nick === '匿名')
      && /^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/\d+(?:[\?\/#].*)?$/i.test(comment.link.trim())) { // 若没有输入昵称，并且链接为 B 站个人空间网址，就将昵称设置为对应的 B 站用户的昵称
      const json = await (await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${comment.link.trim().replace(/^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/(\d+)(?:[\?\/#].*)?$/i, '$1')}`,
        { headers: { Origin: 'https://space.bilibili.com', Referer: 'https://space.bilibili.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' } })).json();
      if (json.code === 0) { // 用户信息获取成功
        comment.nick = json.data.card.name;
      } else {
        return { errmsg: '您输入的 UID 对应的用户可能不存在哦 (´；ω；`) 如果存在，就重试一下吧 awa' };
      }
    }

    if (comment.mail && /^\d{5,}@qq\.com$/i.test(comment.mail.trim())) { // 若输入的邮箱为 QQ 邮箱，就随机生成一个与 QQ 号对应的 UUID
      const qqNumber = comment.mail.trim().replace(/^(\d{5,})@qq\.com$/i, '$1'), redis = Redis.fromEnv(),
            hashes = await redis.get('hashes');
      if (!hashes.some(h => h.s === qqNumber)) { // 之前没有存储与该 QQ 号对应的 UUID
        hashes.push({ h: crypto.randomUUID(), s: qqNumber }); // 生成一个与 QQ 号对应的 UUID
        waitUntil(redis.set('hashes', hashes));
      }
    }

    comment.comment = comment.comment.replace(/<img class="wl-emoji" src="\/img\/emote\/([^"]+)" alt="([^."]+)(?:\.(?:gif|png))?">/g, '<img class="wl-emoji" src="/img/emote/$1" alt="[$2]" title="$2">'); // 去除表情的替代文本的扩展名，添加中括号
  },
  async avatarUrl(comment) { // 在获取头像地址时
    if (comment.link && /^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/\d+(?:[\?\/#].*)?$/i.test(comment.link.trim())) { // 输入的链接为 B 站个人空间网址，返回 UID 对应的 B 站用户的头像
      return `https://api.yumeharu.top/api/getuser?mid=${comment.link.trim().replace(/^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/(\d+)(?:[\?\/#].*)?$/i, '$1')}&type=avatar_redirect`;
    } else if (comment.mail?.trim()) { // 输入了邮箱
      if (/^\d{5,}@qq\.com$/i.test(comment.mail.trim())) { // 邮箱为 QQ 邮箱，返回 QQ 号对应的用户的头像
        const qqNumber = comment.mail.trim().replace(/^(\d{5,})@qq\.com$/i, '$1'), redis = Redis.fromEnv(),
              hashes = await redis.get('hashes');
        const hash = hashes.find(h => h.s === qqNumber);
        if (hash) {
          return `https://waline.happycola.top/api/modules?id=qmimg&h=${hash.h}`;
        } else {
          const h = crypto.randomUUID();
          hashes.push({ h, s: qqNumber });
          await redis.set('hashes', hashes);
          return `https://waline.happycola.top/api/modules?id=qmimg&h=${h}`;
        }
      } else { // 邮箱不为 QQ 邮箱，返回 Gravatar 头像
        return `https://cn.cravatar.com/avatar/${md5(comment.mail)}?d=retro`;
      }
    } else { // 返回随机 B 站头像
      const faces = ['1-22', '1-33', '2-22', '2-33', '3-22', '3-33', '4-22', '4-33', '5-22', '5-33', '6-33'];
      return `/img/default-faces%26face-icons/${faces[Math.floor(Math.random() * faces.length)]}.jpg`;
    }
  }
});
