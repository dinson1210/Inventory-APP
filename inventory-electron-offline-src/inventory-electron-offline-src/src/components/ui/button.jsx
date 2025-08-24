import React from 'react'
export const Button = ({variant='default', className='', children, ...props}) => {
  const base = 'btn'
  const v = variant==='outline' ? 'btn-outline' : variant==='destructive' ? 'bg-red-600 text-white border-red-600' : 'btn-primary'
  return <button className=f"{base} {v} {className}" {...props}>{children}</button>
}
