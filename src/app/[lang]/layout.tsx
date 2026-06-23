import { i18n } from '@/lib/i18n';
import { Provider } from '@/components/provider';
import '../global.css';
import type { Metadata, Viewport } from 'next';
import { createMetadata, baseUrl } from '@/lib/metadata';
import { notFound } from 'next/navigation';
import { GoogleAnalytics } from '@next/third-parties/google';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
  width: 'device-width',
  initialScale: 1,
};

const titleMap: Record<
  string,
  { default: string; template: string; description: string }
> = {
  en: {
    default: 'BEST TOKEN - The Foundation of Your AI Universe',
    template: '%s | BEST TOKEN',
    description:
      'Connect all AI providers, manage your AI assets, and build the future on a unified infrastructure platform. Deploy in minutes, scale effortlessly.',
  },
  zh: {
    default: 'BEST TOKEN - AI 基座',
    template: '%s | BEST TOKEN',
    description:
      '承载所有 AI 应用，管理你的数字资产，连接未来的统一基础设施平台。快速部署，轻松扩展。',
  },
  ja: {
    default: 'BEST TOKEN - あなたの AI ユニバースの基盤',
    template: '%s | BEST TOKEN',
    description:
      'すべての AI プロバイダーを接続し、AI アセットを管理し、統一されたインフラストラクチャプラットフォームで未来を構築。数分でデプロイ、簡単にスケール。',
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const lang = (await params).lang;
  const titles = titleMap[lang] || titleMap.en;

  return createMetadata({
    metadataBase: baseUrl,
    title: {
      default: titles.default,
      template: titles.template,
    },
    description: titles.description,
    keywords: [
      'AI Infrastructure',
      'AI Gateway',
      'AI Asset Management',
      'API Orchestration',
      'AI Application Platform',
      'Multi-Model Integration',
      'Enterprise AI',
      'AI Ecosystem',
      'Unified AI Interface',
      'Intelligent API Management',
    ],
    authors: [
      { name: 'BEST TOKEN Team', url: 'https://github.com/QuantumNous/new-api' },
    ],
    creator: 'BEST TOKEN Team',
    alternates: {
      languages: {
        en: '/en',
        zh: '/zh',
        ja: '/ja',
      },
    },
    openGraph: {
      type: 'website',
      locale: lang,
      title: titles.default,
      description: titles.description,
      siteName: 'BEST TOKEN',
    },
    twitter: {
      card: 'summary_large_image',
      title: titles.default,
      description: titles.description,
    },
  });
}

export async function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

export default async function RootLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
}) {
  const lang = (await params).lang;

  // Check if the language is valid, prevent invalid language codes (e.g. 'api') from causing errors
  if (!i18n.languages.includes(lang as (typeof i18n.languages)[number])) {
    notFound();
  }

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider lang={lang}>{children}</Provider>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
      </body>
    </html>
  );
}
