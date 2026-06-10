'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { defineI18nUI } from 'fumadocs-ui/i18n';
import { i18n as i18nConfig } from '@/lib/i18n';

const { provider } = defineI18nUI(i18nConfig, {
  translations: {
    en: {
      displayName: 'English',
    },
    zh: {
      displayName: '简体中文',
      search: '搜索文档',
      searchNoResult: '没有结果',
      toc: '目录',
      lastUpdate: '最后更新于',
      chooseTheme: '选择主题',
      chooseLanguage: '选择语言',
      nextPage: '下一页',
      previousPage: '上一页',
      tocNoHeadings: '目录为空',
    },
    ja: {
      displayName: '日本語',
      search: 'ドキュメントを検索',
      searchNoResult: '結果が見つかりません',
      toc: '目次',
      lastUpdate: '最終更新',
      chooseTheme: 'テーマを選択',
      chooseLanguage: '言語を選択',
      nextPage: '次のページ',
      previousPage: '前のページ',
      tocNoHeadings: '見出しがありません',
    },
  },
});

export function Provider({
  children,
  lang,
}: {
  children: ReactNode;
  lang: string;
}) {
  return <RootProvider i18n={provider(lang)}>{children}</RootProvider>;
}
