import React from 'react'

const getItems = (children, out=[]) => {
  React.Children.forEach(children, (child) => {
    if (!child) return
    if (child.type === SelectItem) out.push(child)
    else if (child.props && child.props.children) getItems(child.props.children, out)
  })
  return out
}

export const Select = ({value, onValueChange, children, className=''}) => {
  const items = getItems(children)
  return (
    <select className={`input ${className}`} value={value} onChange={(e)=>onValueChange?.(e.target.value)}>
      {items.map((it, idx) => <option key={idx} value={it.props.value}>{it.props.children}</option>)}
    </select>
  )
}
export const SelectTrigger = ({children}) => <>{children}</>
export const SelectValue = () => null
export const SelectContent = ({children}) => <>{children}</>
export const SelectItem = ({value, children}) => <option value={value}>{children}</option>
