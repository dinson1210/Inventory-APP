import React from 'react'
export const Label = ({className='', children, ...props}) => <label className={`label ${className}`} {...props}>{children}</label>
