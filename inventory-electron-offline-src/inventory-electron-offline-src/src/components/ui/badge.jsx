import React from 'react'
export const Badge = ({children, className='', variant='secondary'}) => {
  const base = 'inline-flex items-center rounded-md border px-2 py-0.5 text-xs'
  const style = variant==='secondary' ? 'bg-gray-100 text-gray-700 border-gray-200' : 'bg-black text-white border-black'
  return <span className={`${base} ${style} ${className}`}>{children}</span>
}
