import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { rateLimit } from '../common/rate-limit';
import { clientIp } from '../common/guards/ip-whitelist.guard';
import { ChatService } from './chat.service';

/** Vidjet skripti: saytga `<script src=".../api/v1/webchat/<kalit>/widget.js" async>` bilan qo'yiladi. */
function widgetJs(key: string, w: { name: string; greeting: string; color: string }) {
  const cfg = JSON.stringify({ key, name: w.name, greeting: w.greeting || 'Assalomu alaykum! Savolingiz bormi?', color: w.color });
  return `(function(){
var C=${cfg};
var s=document.currentScript;var base=s&&s.src?new URL(s.src).origin:location.origin;
var api=base+'/api/v1/webchat/'+C.key;
var LS='sa_wc_'+C.key;var st={};try{st=JSON.parse(localStorage.getItem(LS)||'{}')}catch(e){}
if(!st.v){st.v='v'+Math.random().toString(36).slice(2)+Date.now().toString(36);}
function save(){try{localStorage.setItem(LS,JSON.stringify(st))}catch(e){}}save();
var css=document.createElement('style');css.textContent='.sawc-b{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;background:'+C.color+';color:#fff;font-size:26px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);z-index:2147483000}.sawc-p{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 24px);height:460px;max-height:calc(100vh - 110px);background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;font:14px/1.4 system-ui,sans-serif;color:#222;z-index:2147483000}.sawc-p.o{display:flex}.sawc-h{background:'+C.color+';color:#fff;padding:12px 14px;font-weight:600}.sawc-m{flex:1;overflow:auto;padding:12px;background:#f5f6f8}.sawc-r{margin:6px 0;max-width:82%;padding:8px 11px;border-radius:12px;word-wrap:break-word;white-space:pre-wrap}.sawc-r.v{margin-left:auto;background:'+C.color+';color:#fff;border-bottom-right-radius:3px}.sawc-r.a{background:#fff;border:1px solid #e3e5e8;border-bottom-left-radius:3px}.sawc-f{display:flex;border-top:1px solid #e3e5e8}.sawc-f input{flex:1;border:0;padding:12px;font:inherit;outline:0}.sawc-f button{border:0;background:none;color:'+C.color+';font-weight:700;padding:0 14px;cursor:pointer}';
document.head.appendChild(css);
var b=document.createElement('button');b.className='sawc-b';b.setAttribute('aria-label','Chat');b.textContent='\\uD83D\\uDCAC';
var p=document.createElement('div');p.className='sawc-p';
var h=document.createElement('div');h.className='sawc-h';h.textContent=C.name;
var m=document.createElement('div');m.className='sawc-m';
var f=document.createElement('form');f.className='sawc-f';var i=document.createElement('input');i.placeholder='Xabar yozing…';i.maxLength=1000;var sb=document.createElement('button');sb.type='submit';sb.textContent='\\u27A4';f.appendChild(i);f.appendChild(sb);
p.appendChild(h);p.appendChild(m);p.appendChild(f);document.body.appendChild(b);document.body.appendChild(p);
var seen={};function add(t,c,id){if(id){if(seen[id])return;seen[id]=1}var d=document.createElement('div');d.className='sawc-r '+c;d.textContent=t;m.appendChild(d);m.scrollTop=m.scrollHeight}
add(C.greeting,'a');
function poll(){fetch(api+'/messages?visitorId='+encodeURIComponent(st.v)+(st.after?'&after='+encodeURIComponent(st.after):'')).then(function(r){return r.json()}).then(function(r){(r.messages||[]).forEach(function(x){add(x.text,x.from==='visitor'?'v':'a',x.id);st.after=x.at});save()}).catch(function(){})}
var timer=null;b.onclick=function(){p.classList.toggle('o');if(p.classList.contains('o')){i.focus();poll();timer=timer||setInterval(poll,4000)}};
f.onsubmit=function(e){e.preventDefault();var t=i.value.trim();if(!t)return;i.value='';fetch(api+'/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId:st.v,text:t,name:st.n||''})}).then(function(){poll()}).catch(function(){add('Yuborilmadi. Qayta urinib ko\\'ring.','a')})};
poll();
})();`;
}

// Ommaviy (login'siz): amoCRM «Онлайн чаты» — saytdagi chat vidjeti
@Controller('webchat')
export class WebChatController {
  constructor(private readonly chat: ChatService) {}

  @Public()
  @Get(':key/widget.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async widget(@Param('key') key: string, @Res() res: Response) {
    const w = /^[\w-]{6,40}$/.test(key) ? await this.chat.webChatByKey(key) : null;
    if (!w) return res.status(404).type('text/plain').send('// chat topilmadi');
    return res.send(widgetJs(key, w));
  }

  @Public()
  @Post(':key/send')
  async send(@Param('key') key: string, @Body() b: { visitorId?: string; name?: string; text?: string }, @Req() req: any) {
    // mehmon id'sini hujumchi o'zi tanlaydi — shuning uchun IP va umumiy kalit bo'yicha ham cheklanadi
    const ip = clientIp(req);
    rateLimit(`wc-ip:${ip}`, 30, 60_000, "Juda tez yozyapsiz, biroz kuting");
    rateLimit(`wc-key:${key}`, 300, 60_000, "Chat vaqtincha band, birozdan keyin urinib ko'ring");
    rateLimit(`wc:${key}:${b?.visitorId || '-'}`, 20, 60_000, "Juda tez yozyapsiz, biroz kuting");
    await this.chat.webIngest(key, String(b?.visitorId || ''), String(b?.name || ''), String(b?.text || ''));
    return { ok: true };
  }

  @Public()
  @Get(':key/messages')
  messages(@Param('key') key: string, @Query('visitorId') visitorId = '', @Query('after') after?: string) {
    rateLimit(`wcm:${key}:${visitorId}`, 60, 60_000, 'Juda ko\'p so\'rov');
    return this.chat.webMessages(key, visitorId, after);
  }
}
