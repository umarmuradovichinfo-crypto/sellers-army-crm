#!/usr/bin/env python3
"""fail2ban filtri (filter.d/asterisk-crm.conf) ni fail2ban'siz tekshirish: fail2ban qatorni qanday qayta ishlasa, shunday taqlid qilamiz —
sana boshidan kesiladi (`[]` qoladi, common.conf __date_ambit), prefregex <F-CONTENT> ni ajratadi, failregex <HOST> ni topadi.
Serverda haqiqiy tekshiruv: fail2ban-regex <security.log> /etc/fail2ban/filter.d/asterisk-crm.conf
Ishlatish: python3 deploy/fail2ban/test-filter.py [log fayli]   (standart: sample-security.log — jonli Asterisk 23 dan olingan namunalar)
"""
import configparser
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
log = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'sample-security.log')

cp = configparser.ConfigParser(interpolation=configparser.BasicInterpolation(), defaults={
    # common.conf dagi __prefix_line ning soddalashtirilgani: kesilgan sanadan qolgan `[]` va bo'shliqlar
    '__prefix_line': r'(?:\[\])?\s*',
})
cp.optionxform = str
cp.read(os.path.join(HERE, 'filter.d', 'asterisk-crm.conf'))
d = cp['Definition']
HOST = r'(?P<host>(?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]*:[0-9a-fA-F:.]+)'
pref = re.compile(d['prefregex'].replace('<F-CONTENT>', '(?P<content>').replace('</F-CONTENT>', ')'))
fails = [re.compile(x.strip().replace('<HOST>', HOST)) for x in d['failregex'].strip().splitlines() if x.strip()]
date = re.compile(r'^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]')

hits, total = [], 0
for line in open(log, encoding='utf-8', errors='replace'):
    line = line.rstrip('\n')
    if not line.strip():
        continue
    total += 1
    m = date.match(line)
    if not m:
        continue
    rest = '[]' + line[m.end():]  # fail2ban sanani kesadi, qavslar qoladi
    p = pref.match(rest)
    if not p:
        continue
    for f in fails:
        x = f.match(p.group('content'))
        if x:
            hits.append((x.group('host'), re.search(r'SecurityEvent="(\w+)"', line).group(1), re.search(r'RemoteAddress="IPV[46]/(\w+)', line).group(1)))
            break

print(f'Qatorlar: {total}, mos: {len(hits)}')
for h in hits:
    print('  ', *h)
if log.endswith('sample-security.log'):
    want = [('127.0.0.1', 'ChallengeResponseFailed', 'UDP'), ('127.0.0.1', 'InvalidAccountID', 'UDP'), ('127.0.0.1', 'ChallengeResponseFailed', 'UDP'),
            ('2001:db8::7', 'InvalidAccountID', 'UDP'), ('198.51.100.23', 'FailedACL', 'TCP')]
    assert hits == want, f'kutilgan {want}'
    print('OK: noto`g`ri parol / noma`lum raqam / ACL — topildi; WS (Caddy), AMI, muvaffaqiyatli kirish — e`tiborsiz')
