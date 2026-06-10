'use client'
import dynamic from 'next/dynamic'

const SkyboxScene = dynamic(() => import('./components/SkyboxScene'), { ssr: false })

export default function Home() {
  return <SkyboxScene />
}
