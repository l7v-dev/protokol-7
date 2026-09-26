/**
 * Registry for scraping actors.
 */

import type { ActorType, IActor } from "../core/types";
import { ApiExtractorActor } from "./api-extractor-actor";
import { ArchiveExtractorActor } from "./archive-extractor-actor";
import { ArxivActor } from "./arxiv-actor";
import { CheerioScraperActor } from "./cheerio-scraper-actor";
import { CrawlerActor } from "./crawler-actor";
import { DocumentExtractorActor } from "./document-extractor-actor";
import { EuropePmcActor } from "./europe-pmc-actor";
import { GutenbergActor } from "./gutenberg-actor";
import { IetfRfcActor } from "./ietf-rfc-actor";
import { KtbEkitapActor } from "./ktb-ekitap-actor";
import { MarkdownReaderActor } from "./markdown-reader-actor";
import { NetworkInterceptorActor } from "./network-interceptor-actor";
import { OpenAlexActor } from "./openalex-actor";
import { PdfDocumentActor } from "./pdf-document-actor";
import { PlaywrightBrowserActor } from "./playwright-browser-actor";
import { SaglikEkutuphaneActor } from "./saglik-ekutuphane-actor";
import { SerpSearchActor } from "./serp-search-actor";
import { SitemapXmlActor } from "./sitemap-xml-actor";
import { StackExchangeActor } from "./stack-exchange-actor";
import { WikimediaActor } from "./wikimedia-actor";

export class ActorRegistry {
  private readonly actors = new Map<ActorType, IActor<unknown>>();

  register(actor: IActor<unknown>): void {
    this.actors.set(actor.actorType, actor);
  }

  get<T = unknown>(type: ActorType): IActor<T> | undefined {
    return this.actors.get(type) as IActor<T> | undefined;
  }

  has(type: ActorType): boolean {
    return this.actors.has(type);
  }

  list(): IActor<unknown>[] {
    return Array.from(this.actors.values());
  }
}

export function createDefaultActorRegistry(): ActorRegistry {
  const registry = new ActorRegistry();
  registry.register(new CheerioScraperActor());
  registry.register(new PlaywrightBrowserActor());
  registry.register(new ApiExtractorActor());
  registry.register(new CrawlerActor());
  registry.register(new SitemapXmlActor());
  registry.register(new MarkdownReaderActor());
  registry.register(new NetworkInterceptorActor());
  registry.register(new SerpSearchActor());
  registry.register(new PdfDocumentActor());
  registry.register(new ArxivActor());
  registry.register(new WikimediaActor());
  registry.register(new OpenAlexActor());
  registry.register(new StackExchangeActor());
  registry.register(new GutenbergActor());
  registry.register(new EuropePmcActor());
  registry.register(new IetfRfcActor());
  registry.register(new SaglikEkutuphaneActor());
  registry.register(new KtbEkitapActor());
  registry.register(new DocumentExtractorActor());
  registry.register(new ArchiveExtractorActor());
  return registry;
}
