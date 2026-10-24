// amoCRM uslubidagi chiziqli ikonkalar (o'zimiz chizganmiz, amoCRM fayllari emas).
// Chap menyu ikonkalari 30x30, tanlangan holatda to'ldirilgan doira + oq belgi.
import React from 'react'

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }

const NAV = {
  dashboard: (on) => (
    <>
      <circle cx="15" cy="15" r="12" {...S} fill={on ? '#fff' : 'none'} stroke={on ? '#fff' : 'currentColor'} />
      <path d="M15 15 L21 8" {...S} stroke={on ? '#e2453c' : 'currentColor'} strokeWidth="2" />
      <circle cx="15" cy="15" r="1.6" fill={on ? '#e2453c' : 'currentColor'} />
      <path d="M8 19 a8 8 0 0 1 1-9 M21 19 a8 8 0 0 0 1.4-4" {...S} stroke={on ? '#1b3446' : 'currentColor'} />
    </>
  ),
  leads: (on) => (
    <>
      <circle cx="15" cy="16" r="12" {...S} fill={on ? '#1f8ef1' : 'none'} stroke={on ? '#1f8ef1' : 'currentColor'} />
      <path d="M19 11.5c-.8-1.3-2.3-2-4-2-2.2 0-4 1.2-4 3s1.6 2.5 4 3 4 1.3 4 3.2-1.8 3-4 3c-1.9 0-3.4-.8-4.2-2.2M15 6v20" {...S} stroke={on ? '#fff' : 'currentColor'} strokeWidth="1.8" />
    </>
  ),
  imbox: (on) => (
    <>
      <path d="M15 4C8.4 4 3 8.6 3 14.3c0 3 1.5 5.7 3.9 7.6L6 27l5.2-2.7c1.2.3 2.5.5 3.8.5 6.6 0 12-4.6 12-10.3S21.6 4 15 4z" {...S} fill={on ? '#1f8ef1' : 'none'} stroke={on ? '#1f8ef1' : 'currentColor'} />
      <circle cx="10" cy="14.3" r="1.2" fill={on ? '#fff' : 'currentColor'} />
      <circle cx="15" cy="14.3" r="1.2" fill={on ? '#fff' : 'currentColor'} />
      <circle cx="20" cy="14.3" r="1.2" fill={on ? '#fff' : 'currentColor'} />
    </>
  ),
  tasks: (on) => (
    <>
      <circle cx="14" cy="16" r="12" {...S} fill={on ? '#fff' : 'none'} stroke={on ? '#fff' : 'currentColor'} />
      <path d="M8 15.5l5 5L27 5" {...S} stroke={on ? '#e2453c' : 'currentColor'} strokeWidth="2.2" />
    </>
  ),
  ai: (on) => (
    <>
      <circle cx="14" cy="16" r="11" {...S} fill={on ? '#fff' : 'none'} stroke={on ? '#fff' : 'currentColor'} />
      <circle cx="14" cy="16" r="7" {...S} stroke={on ? '#1b3446' : 'currentColor'} />
      <text x="14" y="18.6" textAnchor="middle" fontSize="7.5" fontWeight="700" fontFamily="PT Sans" fill={on ? '#1b3446' : 'currentColor'}>AI</text>
      <path d="M23 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" {...S} />
    </>
  ),
  lists: (on) => (
    <>
      <rect x="5" y="4" width="20" height="24" rx="4" {...S} fill={on ? '#1f8ef1' : 'none'} stroke={on ? '#1f8ef1' : 'currentColor'} />
      <path d="M10 2.5h10v3H10z" {...S} fill={on ? '#1f8ef1' : 'none'} stroke={on ? '#fff' : 'currentColor'} />
      {[11, 16, 21].map((y) => (
        <g key={y} stroke={on ? '#fff' : 'currentColor'}>
          <rect x="9" y={y - 1.5} width="3" height="3" {...S} stroke={on ? '#fff' : 'currentColor'} />
          <path d={`M14.5 ${y}h6.5`} {...S} stroke={on ? '#fff' : 'currentColor'} />
        </g>
      ))}
    </>
  ),
  stats: (on) => (
    <>
      <circle cx="15" cy="15" r="12" {...S} fill={on ? '#fff' : 'none'} stroke={on ? '#fff' : 'currentColor'} />
      <path d="M3.5 20l7-7 5 4 10-10" {...S} stroke={on ? '#e2453c' : 'currentColor'} strokeWidth="2" />
      <circle cx="10.5" cy="13" r="1.8" fill={on ? '#e2453c' : 'currentColor'} />
      <circle cx="15.5" cy="17" r="1.8" fill={on ? '#e2453c' : 'currentColor'} />
    </>
  ),
  market: (on) => (
    <>
      <circle cx="13" cy="17" r="9" {...S} fill={on ? '#1f8ef1' : 'none'} stroke={on ? '#1f8ef1' : 'currentColor'} />
      <circle cx="17" cy="13" r="9" {...S} stroke={on ? '#fff' : 'currentColor'} />
      <circle cx="15" cy="15" r="4" {...S} stroke={on ? '#fff' : 'currentColor'} />
    </>
  ),
  settings: (on) => (
    <>
      <circle cx="15" cy="15" r="12" {...S} fill={on ? '#fff' : 'none'} stroke={on ? '#fff' : 'currentColor'} />
      <path d="M20.5 6.5a5 5 0 0 0-6.6 6.2L6.8 19.8a1.8 1.8 0 0 0 2.5 2.5l7.1-7.1a5 5 0 0 0 6.2-6.6l-3 3-2.4-.6-.6-2.4z" {...S} stroke={on ? '#1b3446' : 'currentColor'} />
    </>
  ),
  bell: () => (
    <>
      <path d="M15 5a7 7 0 0 0-7 7v5l-2.5 4h19L22 17v-5a7 7 0 0 0-7-7z" {...S} />
      <path d="M12.5 24a2.5 2.5 0 0 0 5 0" {...S} />
    </>
  ),
  account: () => (
    <>
      <circle cx="15" cy="11" r="6" {...S} />
      <path d="M3 29c1-6 6-9 12-9s11 3 12 9" {...S} />
    </>
  ),
}

export function NavIcon({ name, on = false, size = 30 }) {
  const draw = NAV[name]
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      {draw ? draw(on) : null}
    </svg>
  )
}

// Kichik UI ikonkalari (16x16)
const SMALL = {
  search: <><circle cx="7" cy="7" r="5" {...S} /><path d="M11 11l3.5 3.5" {...S} /></>,
  dots: <><circle cx="3" cy="8" r="1.4" fill="currentColor" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /><circle cx="13" cy="8" r="1.4" fill="currentColor" /></>,
  burger: <path d="M2 4h12M2 8h12M2 12h12" {...S} strokeWidth="1.6" />,
  pipeline: <path d="M3 3v10M7 3v6M11 3v8" {...S} strokeWidth="2" />,
  chevronDown: <path d="M4 6l4 4 4-4" {...S} />,
  chevronLeft: <path d="M10 3L5 8l5 5" {...S} />,
  chevronRight: <path d="M6 3l5 5-5 5" {...S} />,
  close: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" {...S} />,
  plus: <path d="M8 3v10M3 8h10" {...S} />,
  filter: <><path d="M2 4h12M2 8h12M2 12h12" {...S} /><circle cx="5" cy="4" r="1.5" fill="currentColor" /><circle cx="11" cy="8" r="1.5" fill="currentColor" /><circle cx="7" cy="12" r="1.5" fill="currentColor" /></>,
  phone: <path d="M4 2l2.5 3-1.5 2a8 8 0 0 0 4 4l2-1.5 3 2.5-1.5 2C6.5 14 2 9.5 2 3.5z" {...S} />,
  phoneOut: <><path d="M4 2l2.5 3-1.5 2a8 8 0 0 0 4 4l2-1.5 3 2.5-1.5 2C6.5 14 2 9.5 2 3.5z" {...S} /><path d="M10 2h4v4M14 2l-4 4" {...S} /></>,
  calendar: <><rect x="2" y="3" width="12" height="11" rx="1.5" {...S} /><path d="M2 6.5h12M5 1.5v3M11 1.5v3" {...S} /></>,
  clock: <><circle cx="8" cy="8" r="6" {...S} /><path d="M8 4.5V8l2.5 1.5" {...S} /></>,
  check: <path d="M3 8.5l3 3 7-7" {...S} strokeWidth="1.8" />,
  edit: <path d="M10.5 2.5l3 3L6 13H3v-3z" {...S} />,
  trash: <><path d="M3 4h10M6 4V2.5h4V4M4.5 4l.7 9.5h5.6l.7-9.5" {...S} /></>,
  print: <><path d="M4 6V2h8v4M4 11H2.5V6h11v5H12" {...S} /><rect x="4" y="9" width="8" height="5" {...S} /></>,
  hash: <path d="M6 2L4.5 14M11.5 2L10 14M2.5 5.5h11M2 10.5h11" {...S} />,
  excel: <><rect x="2" y="2" width="12" height="12" rx="1.5" {...S} /><path d="M5 5l6 6M11 5l-6 6" {...S} /></>,
  play: <><circle cx="8" cy="8" r="6.3" {...S} /><path d="M6.5 5.5v5l4-2.5z" fill="currentColor" /></>,
  download: <path d="M8 2v8M4.5 7L8 10.5 11.5 7M3 13.5h10" {...S} />,
  user: <><circle cx="8" cy="5.5" r="3" {...S} /><path d="M2.5 14c.5-3 2.8-4.5 5.5-4.5s5 1.5 5.5 4.5" {...S} /></>,
  company: <><rect x="2.5" y="4.5" width="7" height="9.5" {...S} /><path d="M9.5 7.5h4v6.5h-4M4.5 7h3M4.5 10h3" {...S} /></>,
  gear: <><circle cx="8" cy="8" r="2.3" {...S} /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" {...S} /></>,
  send: <path d="M2 8l12-5.5L9.5 14 7.5 9z" {...S} />,
  attach: <path d="M11 5.5L6 10.5a1.8 1.8 0 0 1-2.5-2.5l5.5-5.5a3 3 0 0 1 4.2 4.2L7.5 12.5" {...S} />,
  list: <path d="M5.5 4h8.5M5.5 8h8.5M5.5 12h8.5M2 4h.5M2 8h.5M2 12h.5" {...S} strokeWidth="1.6" />,
  external: <path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v4h-9v-9h4" {...S} />,
  star: <path d="M8 1.8l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.4l-3.9 2.2.9-4.3-3.2-3 4.3-.5z" {...S} />,
  sparkle: <path d="M8 1.5l1.4 4.1L13.5 7l-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4z" fill="currentColor" />,
  instagram: <><rect x="2" y="2" width="12" height="12" rx="3.5" {...S} /><circle cx="8" cy="8" r="2.8" {...S} /><circle cx="11.6" cy="4.4" r=".8" fill="currentColor" /></>,
  telegram: <path d="M14 2.5L1.8 7.3l3.7 1.4 1.4 4.3 2.1-2.6 3.4 2.6z M5.5 8.7l6-4" {...S} />,
  dragDots: <><circle cx="6" cy="3.5" r="1" fill="currentColor" /><circle cx="10" cy="3.5" r="1" fill="currentColor" /><circle cx="6" cy="8" r="1" fill="currentColor" /><circle cx="10" cy="8" r="1" fill="currentColor" /><circle cx="6" cy="12.5" r="1" fill="currentColor" /><circle cx="10" cy="12.5" r="1" fill="currentColor" /></>,
  tag: <><path d="M2 8.2V2.5h5.7l6.3 6.3-5.7 5.7z" {...S} /><circle cx="5.2" cy="5.7" r="1" fill="currentColor" /></>,
  bell: <path d="M3.5 11.5h9l-1.2-1.8V6.5a3.3 3.3 0 0 0-6.6 0v3.2zM6.5 13.5a1.6 1.6 0 0 0 3 0" {...S} />,
  link: <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2L8 3.8M9.5 6.5a3 3 0 0 0-4.2 0L3 8.8a3 3 0 0 0 4.2 4.2L8 12.2" {...S} />,
  note: <path d="M2.5 3h11v8h-6l-3 2.5V11h-2z" {...S} />,
  facebook: <path d="M9.3 14V8.6h1.9l.3-2.2H9.3V5.1c0-.6.2-1 1-1h1.2V2.2c-.2 0-.9-.1-1.7-.1-1.7 0-2.8 1-2.8 2.9v1.4H5.1v2.2H7V14z" fill="currentColor" />,
  form: <><rect x="2.5" y="2" width="11" height="12" rx="1.5" {...S} /><path d="M5 6h6M5 9h6M5 11.5h3" {...S} /></>,
}

export function Ico({ name, size = 16, className = '', style }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {SMALL[name] || null}
    </svg>
  )
}
