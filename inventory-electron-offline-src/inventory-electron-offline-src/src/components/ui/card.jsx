import React from 'react'
export const Card = ({className='', children, ...props}) => <div className={`card ${className}`} {...props}>{children}</div>
export const CardHeader = ({className='', children}) => <div className={`border-b px-4 py-3 ${className}`}>{children}</div>
export const CardTitle = ({className='', children}) => <h3 className={`text-base font-semibold ${className}`}>{children}</h3>
export const CardContent = ({className='', children}) => <div className={`p-4 ${className}`}>{children}</div>
