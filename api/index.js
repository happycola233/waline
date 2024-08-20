'use strict';

const Waline = require('@waline/vercel'), crypto = require('node:crypto'), md5 = require('md5'), { kv } = require('@vercel/kv');
module.exports = Waline({
  plugins: [],
  async preSave(comment) { // 在保存评论数据前
    if (comment.link && /^\d+$/.test(comment.link.trim())) { // 若输入的链接为纯数字，就将其视为 B 站 UID，并将链接修改为 B 站个人空间网址
      comment.link = 'https://space.bilibili.com/' + comment.link.trim();
    }
    if (comment.link && (!comment.nick?.trim() || comment.nick === '匿名') &&
        /^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/\d+(?:[\?\/#].*)?$/i.test(comment.link.trim())) { // 若没有输入昵称，并且链接为 B 站个人空间网址，就将昵称设置为 UID 对应的 B 站用户的昵称
      const json = await (await fetch(`https://account.bilibili.com/api/member/getCardByMid?mid=${comment.link.trim().replace(/^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/(\d+)(?:[\?\/#].*)?$/i, '$1')}`, { headers: { Origin: 'https://space.bilibili.com', Referer: 'https://space.bilibili.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' } })).json();
      if (json.code === 0) { // 用户信息获取成功
        comment.nick = json.card.name;
      } else {
        return { errmsg: '您输入的 UID 对应的用户可能不存在哦 (´；ω；`) 如果存在，就重试一下吧 awa' };
      }
    }

    if (comment.mail && /^\d+@qq\.com$/i.test(comment.mail.trim())) { // 若输入的邮箱为 QQ 邮箱，就随机生成一个与 QQ 号对应的 UUID
      const qqNumber = comment.mail.trim().replace(/^(\d+)@qq\.com$/i, '$1'),
            hashes = await kv.get('hashes');
      if (!hashes.some(h => h.s === qqNumber)) { // 之前没有存储与该 QQ 号对应的 UUID
        hashes.push({ s: qqNumber, h: crypto.randomUUID() }); // 生成一个与 QQ 号对应的 UUID
        await kv.set('hashes', hashes);
      }
    }

    comment.comment = comment.comment.replace(/<img class="wl-emoji" src="\/images\/emote\/(.+)" alt="(.+)\.(?:gif|png)">/, '<img class="wl-emoji" src="/images/emote/$1" alt="$2">'); // 去除表情的替代文本的扩展名
  },
  async avatarUrl(comment) { // 在获取头像地址时
    if (comment.link && /^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/\d+(?:[\?\/#].*)?$/i.test(comment.link.trim())) { // 输入的链接为 B 站个人空间网址，返回 UID 对应的 B 站用户的头像
      return `https://api.yumeharu.top/api/getuser?mid=${comment.link.trim().replace(/^(?:(?:https?:)?\/\/)?space\.bilibili\.com\/(\d+)(?:[\?\/#].*)?$/i, '$1')}&type=avatar_redirect`;
    } else if (comment.mail?.trim()) { // 输入了邮箱
      if (/^\d+@qq\.com$/i.test(comment.mail.trim())) { // 邮箱为 QQ 邮箱，返回 QQ 号对应的用户的头像
        const qqNumber = comment.mail.trim().replace(/^(\d+)@qq\.com$/i, '$1'),
              hashes = await kv.get('hashes');
        const hash = hashes.find(h => h.s === qqNumber);
        if (hash) {
          return `https://waline.happycola.top/api/modules?id=qmimg&h=${hash.h}`;
        } else {
          const h = crypto.randomUUID();
          hashes.push({ s: qqNumber, h });
          await kv.set('hashes', hashes);
          return `https://waline.happycola.top/api/modules?id=qmimg&h=${h}`;
        }
      } else { // 邮箱不为 QQ 邮箱，返回 Gravatar 头像
        return `https://cravatar.cn/avatar/${md5(comment.mail)}?d=retro`;
      }
    } else { // 返回随机 B 站头像
      const faces = ['1-22', '1-33', '2-22', '2-33', '3-22', '3-33', '4-22', '4-33', '5-22', '5-33', '6-33'];
      return `/img/default-faces%26face-icons/${faces[Math.floor(Math.random() * faces.length)]}.jpg`;
    }
  }
});
