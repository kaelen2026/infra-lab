import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/features/query";
import { SessionProvider } from "@/features/session";
import { Toaster, ToastProvider } from "@/features/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "infra-lab",
  description: "手机号 + 验证码登录",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <QueryProvider>
            <ToastProvider>
              <SessionProvider>{children}</SessionProvider>
              <Toaster />
            </ToastProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
