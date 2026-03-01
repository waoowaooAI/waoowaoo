import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Poppins, Open_Sans } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import "../globals.css";
import { Providers } from "./providers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { locales } from '@/i18n/routing';

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

// UI/UX Pro Max typography: Modern Professional
const poppins = Poppins({
    variable: "--font-heading",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

const openSans = Open_Sans({
    variable: "--font-body",
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
});

type SupportedLocale = (typeof locales)[number]

// 动态元数据生成
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'layout' })

    return {
        title: t('title'),
        description: t('description'),
        icons: {
            icon: '/logo.ico?v=2',
            shortcut: '/logo.ico?v=2',
            apple: '/logo.png?v=2',
        },
    };
}

export function generateStaticParams() {
    return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    // 验证 locale 是否有效
    if (!locales.includes(locale as SupportedLocale)) {
        notFound();
    }

    // 获取翻译消息
    const messages = await getMessages();

    return (
        <html lang={locale}>
            <head>
                {process.env.NODE_ENV === "development" && (
                    <Script
                        src="//unpkg.com/react-grab/dist/index.global.js"
                        crossOrigin="anonymous"
                        strategy="beforeInteractive"
                    />
                )}
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${openSans.variable} antialiased`}
            >
                <NextIntlClientProvider messages={messages}>
                    <Providers>
                        {children}
                    </Providers>
                </NextIntlClientProvider>
                <SpeedInsights />
            </body>
        </html>
    );
}
