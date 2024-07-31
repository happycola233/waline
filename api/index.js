'use strict';

const Waline = require('@waline/vercel'), crypto = require('node:crypto'), md5 = require('md5'), { kv } = require('@vercel/kv');
module.exports = Waline({
  plugins: [],
  async preSave(comment) {
    if (comment.link && /^\d+$/.test(comment.link.trim())) {
      comment.link = 'https://space.bilibili.com/' + comment.link.trim();
    }
    if (comment.link && (!comment.nick?.trim() || comment.nick === '匿名') && /^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/\d+(?:[\?\/#].*)?$/i.test(comment.link.trim())) {
      const json = await (await fetch(`https://account.bilibili.com/api/member/getCardByMid?mid=${comment.link.trim().replace(/^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/(\d+)(?:[\?\/#].*)?$/i, '$1')}`, { headers: { Origin: 'https://space.bilibili.com', Referer: 'https://space.bilibili.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36' } })).json();
      if (json.code === 0) {
        comment.nick = json.card.name;
      } else {
        return { errmsg: '您输入的 UID 对应的用户可能不存在哦 (´；ω；`) 如果存在，就重试一下吧 awa' };
      }
    }
    if (comment.mail && /^\d+@qq\.com$/i.test(comment.mail.trim())) {
      const qqNumber = comment.mail.trim().replace(/^(\d+)@qq\.com$/i, '$1'),
        hashes = await kv.get('hashes');
      if (!hashes.some(h => h.s === qqNumber)) {
        hashes.push({ s: qqNumber, h: crypto.randomUUID() });
        await kv.set('hashes', hashes);
      }
    }
  },
  async avatarUrl(comment) {
    if (comment.link && /^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/\d+(?:[\?\/#].*)?$/i.test(comment.link.trim())) {
      return `https://api.yumeharu.top/api/getuser?mid=${comment.link.trim().replace(/^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/(\d+)(?:[\?\/#].*)?$/i, '$1')}&type=avatar_redirect`;
    } else if (comment.mail?.trim()) {
      if (/^\d+@qq\.com$/i.test(comment.mail.trim())) {
        const qqNumber = comment.mail.trim().replace(/^(\d+)@qq\.com$/i, '$1'),
          hashes = await kv.get('hashes');
        const hash = hashes.find(h => h.s === qqNumber);
        if (hash) {
          return `https://api.yumeharu.top/api/modules?id=qmimg&h=${hash.h}`;
        } else {
          const h = crypto.randomUUID();
          hashes.push({ s: qqNumber, h });
          await kv.set('hashes', hashes);
          return `https://api.yumeharu.top/api/modules?id=qmimg&h=${h}`;
        }
      } else {
        return `https://cravatar.cn/avatar/${md5(comment.mail)}?d=retro`;
      }
    } else {
      const faces = ['1-22', '1-33', '2-22', '2-33', '3-22', '3-33', '4-22', '4-33', '5-22', '5-33', '6-33'];
      return `/img/default-faces%26face-icons/${faces[Math.floor(Math.random() * faces.length)]}.jpg`;
    }
  }
});
