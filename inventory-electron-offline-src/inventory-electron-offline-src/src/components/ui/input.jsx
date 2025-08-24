import React from 'react'
export const Input = React.forwardRef(({className='', ...props}, ref) => <input ref={ref} className={`input ${className}`} {...props} />)
Input.displayName = 'Input'
