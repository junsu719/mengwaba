import type { CollectionPoint } from './data';
import { hasValidGeo } from './data';
import type { FaqItem } from './content';

export function faqPageJsonLd(faqs: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * 座標超出台灣範圍或缺漏時回傳 null:頁面不得輸出該點的 geo 結構化資料
 * (CLAUDE.md 鐵律6,2026-07-09 拍板,避免錯誤地理標記傷害 SEO)。
 */
export function placeJsonLd(point: CollectionPoint, pageUrl: string) {
  if (!hasValidGeo(point)) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: point.point_name ?? undefined,
    address: point.address ?? undefined,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: point.lat,
      longitude: point.lng,
    },
    url: pageUrl,
  };
}
