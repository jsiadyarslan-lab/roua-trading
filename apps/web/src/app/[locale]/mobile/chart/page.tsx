import { Suspense } from 'react'
import ChartInner from './ChartInner'
export default function ChartPage() {
  return <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#00B4FF',fontFamily:'monospace'}}>loading...</div>}><ChartInner /></Suspense>
}
