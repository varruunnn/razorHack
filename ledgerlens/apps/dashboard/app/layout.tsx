import "./globals.css";
export const metadata={
  title:"LedgerLens | Financial Reconciliation Platform",
  description:"Financial reconciliation and exception investigation platform"
};
export default function RootLayout({children}:{children:React.ReactNode}){
  return(
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
