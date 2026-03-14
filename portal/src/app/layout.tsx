import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MCP Key Service - TechMavie Digital',
  description: 'Store MCP connector credentials once, issue safer usr_ keys, and resolve secrets only for the right TechMavie MCP server.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('theme');
                if (theme !== 'light') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
