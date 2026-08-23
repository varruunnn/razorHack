export const metadata = {
  title: 'LedgerLens',
  description: 'Financial reconciliation and exception investigation platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
