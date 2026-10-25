import React from 'react'

export function Loading() {
  return <div className="loading"><span className="spin" /> Yuklanmoqda…</div>
}

export function Avatar({ ini, color = '#373435', size = 32 }) {
  return <span className="av" style={{ background: color, width: size, height: size }}>{ini}</span>
}

