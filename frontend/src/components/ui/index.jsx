import React from 'react'
import Icon from '../Icon'

export function Loading() {
  return <div className="loading"><span className="spin" /> Yuklanmoqda…</div>
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="loading" style={{ flexDirection: 'column', gap: 12 }}>
      <div style={{ color: 'var(--dang)', fontWeight: 700 }}>Xatolik: {error?.message || 'noma\'lum'}</div>
      {onRetry && <button className="btn" onClick={onRetry}>Qayta urinish</button>}
    </div>
  )
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="pghead">
      <div>
        <h1 className="pgttl">{title}</h1>
        {sub && <div className="pgsub">{sub}</div>}
      </div>
      {children && <div className="fx ac gap10">{children}</div>}
    </div>
  )
}

export function Stat({ lab, val, unit, delta, deltaCls = '', variant = '', icon }) {
  return (
    <div className={'stat ' + variant}>
      <div className="lab">
        {icon && <span className="statico"><Icon name={icon} size={15} /></span>}
        {lab}
      </div>
      <div className="val">{val}{unit && <span style={{ fontSize: 15 }}> {unit}</span>}</div>
      {delta != null && <div className={'delta ' + deltaCls}>{delta}</div>}
    </div>
  )
}

export function ProgressBar({ pct, ink = false, color, height }) {
  return (
    <div className={'prog' + (ink ? ' ink' : '')} style={height ? { height } : undefined}>
      <i style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
    </div>
  )
}

export function Ring({ value, label = 'yaxshi', size }) {
  return (
    <div className="ring" style={{ background: `conic-gradient(var(--lime) ${value}%, #EBEDE6 0)`, ...(size ? { width: size, height: size } : {}) }}>
      <i><b>{value}</b><span>{label}</span></i>
    </div>
  )
}

export function Avatar({ ini, color = '#373435', size = 32 }) {
  return <span className="av" style={{ background: color, width: size, height: size }}>{ini}</span>
}

export function Pill({ children, kind = 'mut', style }) {
  return <span className={'pill ' + kind} style={style}>{children}</span>
}

export function Switch({ on, onClick }) {
  return <span className={'sw' + (on ? ' on' : '')} onClick={onClick} role="switch" aria-checked={on} />
}
