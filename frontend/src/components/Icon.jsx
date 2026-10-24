// Barcha SVG ikonkalar bitta joyda. Foydalanish: <Icon name="crm" />
import React from 'react'

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }

const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" {...P} /><rect x="14" y="3" width="7" height="7" rx="1.5" {...P} /><rect x="3" y="14" width="7" height="7" rx="1.5" {...P} /><rect x="14" y="14" width="7" height="7" rx="1.5" {...P} /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.9.36 1.78.7 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.27a2 2 0 0 1 2.11-.45c.82.34 1.7.57 2.6.7A2 2 0 0 1 22 16.92z" {...P} />,
  ai: <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" {...P} /><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z" {...P} /></>,
  sparkle: <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" {...P} />,
  marketing: <><path d="M3 11l15-6v14L3 13z" {...P} /><path d="M3 11v2a2 2 0 002 2h1" {...P} /><path d="M18 8a3 3 0 010 8" {...P} /></>,
  crm: <><circle cx="9" cy="8" r="3.2" {...P} /><path d="M3.5 19a5.5 5.5 0 0111 0" {...P} /><path d="M16 6.5a3 3 0 010 6" {...P} /><path d="M17 19a5 5 0 00-2.5-4.3" {...P} /></>,
  tasks: <><rect x="3" y="4" width="5" height="16" rx="1.5" {...P} /><rect x="10" y="4" width="5" height="11" rx="1.5" {...P} /><rect x="17" y="4" width="4" height="8" rx="1.5" {...P} /></>,
  checklist: <><path d="M9 5h11M9 12h11M9 19h11" {...P} /><path d="M3.5 5l1.3 1.3L7.5 3.7M3.5 12l1.3 1.3L7.5 10.7M3.5 19l1.3 1.3L7.5 17.7" {...P} /></>,
  hr: <><circle cx="9" cy="8" r="3.2" {...P} /><path d="M3.5 19a5.5 5.5 0 0111 0" {...P} /><path d="M18 7v6M21 10h-6" {...P} /></>,
  finance: <><rect x="3" y="6" width="18" height="13" rx="2.5" {...P} /><path d="M3 10h18M16 15h2" {...P} /></>,
  lms: <><path d="M12 4L2 9l10 5 10-5-10-5z" {...P} /><path d="M5 11v5c0 1 3 2.5 7 2.5s7-1.5 7-2.5v-5" {...P} /></>,
  vision: <><circle cx="12" cy="12" r="8.5" {...P} /><circle cx="12" cy="12" r="4.5" {...P} /><circle cx="12" cy="12" r="1" {...P} /></>,
  attendance: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" {...P} /><path d="M3 9h18M8 2.5v4M16 2.5v4M9 14l2 2 4-4" {...P} /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 102.5-6" {...P} /><path d="M6 3v3.5h3.5M12 8v4.5l3 1.8" {...P} /></>,
  settings: <><circle cx="12" cy="12" r="3" {...P} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" {...P} /></>,
  search: <><circle cx="11" cy="11" r="7" {...P} /><path d="M21 21l-4-4" {...P} /></>,
  bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" {...P} /><path d="M13.7 21a2 2 0 01-3.4 0" {...P} /></>,
  plus: <path d="M12 5v14M5 12h14" {...P} />,
  download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" {...P} />,
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" {...P} />,
  clock: <><circle cx="12" cy="12" r="9" {...P} /><path d="M12 7v5l3 2" {...P} /></>,
  check: <path d="M5 12l5 5L20 7" {...P} strokeWidth={3} />,
  checkSquare: <><path d="M9 11l3 3 8-8" {...P} /><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9" {...P} /></>,
  play: <path d="M8 5v14l11-7z" fill="currentColor" />,
  video: <><rect x="3" y="6" width="13" height="12" rx="2.5" {...P} /><path d="M16 10.5l5-3v9l-5-3" {...P} /></>,
  filter: <path d="M3 6h18M6 12h12M10 18h4" {...P} />,
  chevronR: <path d="M9 18l6-6-6-6" {...P} />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" {...P} strokeWidth={2} />,
  info: <><circle cx="12" cy="12" r="9" {...P} /><path d="M12 8v5M12 16h.01" {...P} /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" {...P} /><path d="M3 9h18M8 3v4M16 3v4" {...P} /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" {...P} /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" {...P} /></>,
  drag: <><circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" {...P} /></>,
  chart: <><path d="M3 3v18h18" {...P} /><path d="M7 14v3M12 9v8M17 5v12" {...P} /></>,
  x: <path d="M6 6l12 12M18 6L6 18" {...P} />,
  layers: <><path d="M12 2l9 5-9 5-9-5 9-5z" {...P} /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" {...P} /></>,
  gear: <><circle cx="12" cy="12" r="3" {...P} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" {...P} /></>,
  board: <><rect x="3" y="4" width="5" height="16" rx="1.5" {...P} /><rect x="10" y="4" width="5" height="11" rx="1.5" {...P} /><rect x="17" y="4" width="4" height="8" rx="1.5" {...P} /></>,
}

export default function Icon({ name, size = 20, color, style, ...rest }) {
  const path = PATHS[name]
  if (!path) return null
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ color, ...style }} {...rest}>
      {path}
    </svg>
  )
}
