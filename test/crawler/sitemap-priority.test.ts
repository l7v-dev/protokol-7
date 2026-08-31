import { describe, expect, it } from 'vitest';

import { extractSitemapCandidates, rankCrawlCandidates, SitemapPriorityError } from '../../src/crawler/sitemap-priority.js';

describe('sitemap extraction and priority ordering', () => {
  it('extracts bounded, canonical sitemap URLs with safe provenance and no network action', () => {
    const result = extractSitemapCandidates({ xml: `
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://EXAMPLE.com:443/products?b=2&amp;a=1#item</loc><priority>0.8</priority></url>
        <url><loc>https://example.com/products?a=1&amp;b=2</loc></url>
        <url><loc>http://127.0.0.1:8080/private</loc></url>
        <url><loc>https://example.com/private?token=hidden</loc></url>
      </urlset>` });

    expect(result.kind).toBe('URLSET');
    expect(result.urls).toEqual([expect.objectContaining({ canonicalUrl: 'https://example.com/products?a=1&b=2', sourceKind: 'SITEMAP_URL', discoveryOrder: 0, priorityHint: 0.8 })]);
    expect(result.summary).toMatchObject({ scannedLocationCount: 4, acceptedUrlCount: 1, skippedInvalidCount: 1, skippedSensitiveCount: 1 });
    expect(JSON.stringify(result)).not.toContain('hidden');
  });

  it('extracts sitemap-index references and bounds entry output deterministically', () => {
    const index = extractSitemapCandidates({ xml: '<sitemapindex><sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap><sitemap><loc>https://example.com/sitemap-b.xml</loc></sitemap></sitemapindex>', maxEntries: 1 });

    expect(index).toMatchObject({ kind: 'SITEMAP_INDEX', childSitemapUrls: ['https://example.com/sitemap-a.xml'], summary: { truncated: true, acceptedChildSitemapCount: 1 } });
  });

  it('ranks source, sitemap priority, depth and tie-breakers deterministically', () => {
    const ranked = rankCrawlCandidates([
      { candidateId: 'link_1', canonicalUrl: 'https://example.com/link', sourceKind: 'LINK', depth: 0, discoveryOrder: 0 },
      { candidateId: 'site_1', canonicalUrl: 'https://example.com/sitemap', sourceKind: 'SITEMAP_URL', sitemapPriorityHint: 1, depth: 1, discoveryOrder: 2 },
      { candidateId: 'seed_1', canonicalUrl: 'https://example.com/seed', sourceKind: 'SEED', depth: 2, discoveryOrder: 1 }
    ]);

    expect(ranked.map((candidate) => candidate.candidateId)).toEqual(['seed_1', 'site_1', 'link_1']);
    expect(ranked.map((candidate) => candidate.priority)).toEqual([96, 88, 60]);
    expect(() => extractSitemapCandidates({ xml: '<!DOCTYPE test><urlset />' })).toThrow(SitemapPriorityError);
    expect(() => rankCrawlCandidates([{ candidateId: 'bad id', canonicalUrl: 'https://example.com', sourceKind: 'LINK', depth: 0, discoveryOrder: 0 }])).toThrow(SitemapPriorityError);
  });
});
