// Stol telefonlarini avtomatik sozlash (OnlinePBX «Конфигуратор»): qurilma + MAC + liniyalar → tayyor konfiguratsiya fayli.
// DIQQAT: formatlar ishlab chiqaruvchi hujjatlari bo'yicha yozilgan, haqiqiy qurilmalarda hali sinalmagan.
export const DEVICES = ['yealink', 'panasonic600', 'panasonic500', 'cisco', 'phonerlite'] as const;
export type Device = (typeof DEVICES)[number];
export interface CfgLine { ext: string; name: string; password: string }
export interface CfgFile { filename: string; content: string; mime: string }

export const MAC_RE = /^[0-9A-Fa-f]{2}([:-]?[0-9A-Fa-f]{2}){5}$/;
export const normMac = (m: string) => m.replace(/[^0-9A-Fa-f]/g, '').toLowerCase();

const q = (s: string) => String(s).replace(/["\r\n]/g, '');

export function generateDeviceConfig(device: Device, mac: string, lines: CfgLine[], host: string, port = 5060): CfgFile {
  const m = normMac(mac);
  const L = lines.slice(0, 5);
  switch (device) {
    case 'yealink': {
      const out = ['#!version:1.0.0.1', '## CRM avtomatik konfiguratsiyasi'];
      L.forEach((l, i) => {
        const n = i + 1;
        out.push(`account.${n}.enable = 1`, `account.${n}.label = ${q(l.ext)}`, `account.${n}.display_name = ${q(l.name)}`, `account.${n}.auth_name = ${q(l.ext)}`, `account.${n}.user_name = ${q(l.ext)}`, `account.${n}.password = ${q(l.password)}`,
          `account.${n}.sip_server.1.address = ${host}`, `account.${n}.sip_server.1.port = ${port}`, `account.${n}.sip_server.1.transport_type = 0`);
      });
      return { filename: `${m}.cfg`, content: out.join('\n') + '\n', mime: 'text/plain' };
    }
    case 'panasonic600':
    case 'panasonic500': {
      const out: string[] = [];
      L.forEach((l, i) => {
        const n = i + 1;
        out.push(`SIP_URI_${n}="${q(l.ext)}@${host}"`, `SIP_AUTHID_${n}="${q(l.ext)}"`, `SIP_PASS_${n}="${q(l.password)}"`, `SIP_SRVADDR_${n}="${host}"`, `SIP_SRVPORT_${n}="${port}"`, `PHONE_NUMBER_${n}="${q(l.ext)}"`, `DISPLAY_NAME_${n}="${q(l.name)}"`);
      });
      return { filename: `Config${m}.cfg`, content: out.join('\n') + '\n', mime: 'text/plain' };
    }
    case 'cisco': {
      const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<flat-profile>'];
      L.forEach((l, i) => {
        const n = i + 1;
        xml.push(`  <Proxy_${n}_>${host}:${port}</Proxy_${n}_>`, `  <User_ID_${n}_>${q(l.ext)}</User_ID_${n}_>`, `  <Password_${n}_>${q(l.password).replace(/[<&]/g, '')}</Password_${n}_>`, `  <Display_Name_${n}_>${q(l.name).replace(/[<&]/g, '')}</Display_Name_${n}_>`, `  <Auth_ID_${n}_>${q(l.ext)}</Auth_ID_${n}_>`);
      });
      xml.push('</flat-profile>');
      return { filename: `spa${m}.cfg`, content: xml.join('\n') + '\n', mime: 'application/xml' };
    }
    case 'phonerlite': {
      const l = L[0];
      const ini = ['[Default]', l ? `Registrar=${host}` : '', l ? `Username=${q(l.ext)}` : '', l ? `AuthUser=${q(l.ext)}` : '', l ? `Password=${q(l.password)}` : '', l ? `DisplayName=${q(l.name)}` : '', l ? `Domain=${host}` : ''].filter(Boolean);
      return { filename: 'PhonerLite.ini', content: ini.join('\n') + '\n', mime: 'text/plain' };
    }
  }
}
