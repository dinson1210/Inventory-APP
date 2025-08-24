import React, {useState, createContext, useContext} from 'react'
const Ctx = createContext(null)
export const Dialog = ({children}) => {
  const [open, setOpen] = useState(false)
  return <Ctx.Provider value={{open, setOpen}}>{children}</Ctx.Provider>
}
export const DialogTrigger = ({asChild, children}) => {
  const {setOpen} = useContext(Ctx)
  return React.cloneElement(children, { onClick: () => setOpen(true) })
}
export const DialogHeader = ({children}) => <div className="mb-2">{children}</div>
export const DialogTitle = ({children}) => <h3 className="text-lg font-semibold">{children}</h3>
export const DialogContent = ({children, className=''}) => {
  const {open, setOpen} = useContext(Ctx)
  if (!open) return null
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40`}>
      <div className={`card max-h-[80vh] overflow-auto w-[90vw] max-w-xl ${className}`}>
        <div className="p-4">{children}</div>
        <div className="p-2 text-right"><button className="btn btn-outline" onClick={()=>setOpen(false)}>Đóng</button></div>
      </div>
    </div>
  )
}
