import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const sans = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Fluid scene',
  description: 'Vloeistofsimulatie met een vervangbaar 3D-object',
}

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="nl" className={sans.variable}>
    <body>{children}</body>
  </html>
)

export default RootLayout
