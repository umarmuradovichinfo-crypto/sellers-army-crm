import React from 'react'

export function Loading() {
  return null
}

export function Avatar({ ini, color = '#373435', size = 32 }) {
  return <span className="av" style={{ background: color, width: size, height: size }}>{ini}</span>
}

